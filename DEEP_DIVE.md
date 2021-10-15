# Prologue

Ever since the rise of Agar.io, there have been multiple FOSS implementations, from the original [Ogarproject](https://github.com/OgarProject/Ogar) to [OgarII](https://github.com/Luka967/OgarII), [MultiOgar](https://github.com/Barbosik/MultiOgar), [MultiOgar-Edited](https://github.com/Luka967/MultiOgar-Edited), [MultiOgarII](https://github.com/m-byte918/MultiOgarII), and many others, and most of them are implemented in NodeJS with decent performance. As the years went by, more and more clones flourished under the popularity of Agar, and the devs have created more and more custom game modes. For example, in self-feed, players gain mass by ejecting and feeding themselves; in some other modes, players can have more than 16 cells (32, 64, 128, or even 256). Ogar servers start to hit their performance bottlenecks: when a server needs to handle hundreds of thousands of collisions per tick with limited resources (single thread) and limited time (usually 40ms or 50ms per tick), it starts to struggle and clients suffer from extreme lag or even disconnection. I've also been playing in these clones for years myself, so I decided to optimize the server and see what's the theoretical limit of a ball game server. Therefore this project was born.

## Deep Dive

Technical details about algorithmic and structural differences between OgarX and other clones.

### Data-Oriented

Traditionally, memory is allocated whenever a new cell is added to the engine. However, in this project, there is a fixed size (65536) cell pool where all the memory is pre-allocated. Each cell has a bit flag indicating whether it exists or not. Whenever we want to add a new cell, we just need to find the index of the next sparse spot (non-existing cell) in the pool. This way we can minimize memory footprint and put less stress on the garbage collector and this design is very cache-friendly which boosts performance. Another benefit of this design is that cell id is limited to an unsigned short (16 bits) instead of the traditional way of using an unsigned int (32 bits) for it, thus reducing the bandwidth usage (will be discussed more). This is also good for the client because we can also use this design to pre-allocate the cell pool.

### WebAssembly

Wasm is a great tool for optimization if you know what you are doing. Using c++ for compiling to wasm or generating a huge js glue file from emscripten is out of the question since calls between js and wasm are still relatively slow and those tools usually generate a huge amount of calls between js and wasm. Then I found out that there's a build flag in emcc called **SUBMODULE=1** which builds the wasm file only, without the stupidly long js glue. This is perfect for the project since I want to optimize to the fullest, and I don't want code in my project that I do not understand. I don't need and I don't want to know how they manage which section of the wasm memory is used or not; I can handle the memory and pointers myself. It makes profiling a lot easier this way. Thus I wrote the entire core for the physics engine in c and compiled it as a wasm side module.

### QuadTree

This project still uses the same data structure, quadtree, as the broad phase physic resolver. But the main difference is that I serialize it to the wasm memory while keeping the structure on the js side. This design is intended for speeding up the viewport querying and the actual physics resolution. You might think that serializing the entire quadtree to wasm memory is slow and the speed gained because of it does not justify it. In reality, it's quite the opposite, with 10k items in the quadtree, it only takes ~1ms to serialize to wasm and the performance gain from it is HUGE. The wasm quadtree viewport querying is about 5-10 times faster than a normal js quadtree query, meaning it can handle more players and bigger viewports. Highly recommend checking out this simple DFS serialization algorithm I can up with as it takes care of the pointers offset in pre-order while writing the children node pointers in post-order ([source](https://github.com/Yuu6883/OgarX/blob/master/src/physics/quadtree.js#L98)).

### Collision Solver

OgarII [world update function](https://github.com/Luka967/OgarII/blob/master/src/worlds/World.js#L260) can be summarized into the following steps:

1. Tick per cell
2. Add new cells
3. Solve boosting cells
4. Update player cells
5. Solve player cells
6. Handle players IO (eject, splits, viewport, protocol)

OgarX [world update function](https://github.com/Yuu6883/OgarX/blob/master/src/physics/engine.js#L263) does it similarly but different order:

1. Add new cells
2. Handle players IO
3. Tick per cell
4. Update player cells
5. Solve all cells

The following section will be focused on how each section above is optimized. I will call OgarII and MultiOgar series Old Systems since they are generally old repositories and I don't want to mention their names every time I talk about them.

#### Cell Ticking

Old Systems all have an integer-based ticker, meaning the physics is TPS-dependant. This has been observed in a lot of clones when the server is under heavy load and the system starts to behave differently since the tick rate becomes slower, making cell movements, collision timing, merge timing, etc all delayed which is directly connected to the client experience as they will see "slow-motion" as it happens. On the other hand, OgarX handles most ticking based on delta time, meaning if the TPS is lower than the optimal number, delta time will just be longer and most resolution will be still "correct" based on the flow of time. Under extreme conditions, tunneling can happen but it's what it is; a continuous physics solver is not affordable here anyways. Back to the topic of cell ticking, all of OgarX's cell ticking ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L109)) is done in wasm as it's a linear algorithm and only does algebraic calculations.

#### Adding New Cells

Old Systems just instantiate a new instance of a particular cell and add it to the quadtree, while OgarX finds a sparse index in the cell pool and store the data there as discussed above in the Data-Oriented section ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L73)). A small note here is that this function was originally in js since all it does is just finding an empty slot in the pool and should not take a long time. But there was some evidence that it takes a long time since this function is called often, and the old method using DataView to write the bytes to wasm memory seems quite inefficient.

#### Boosting Cells

OgarX merged this function into the tick function ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L137)) since there's a need to keep track of the boosting cells in an array. Since JS array splicing is a linear algorithm that is very inefficient, Old Systems waste a lot of time on updating the boosting cell array. Besides this, pre-solving boosting cells is unnecessary as well; merging it into the main collision-eat solving function does not have visible difference since the order the cells are resolved is sorted (heap sort since it's an in-place algorithm which doesn't require extra memory to be "allocated" from the js side and it's fairly fast) by their size & boost ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L330)).

#### Updating Player Cells

The implementation is quite similar to the Cell Ticking section, all done in wasm ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L195)). There is a lot of fun code in that function related to the any-directional line lock which I will discuss in another section.

#### Main Physics Solver

OgarX's main physics solver is very different from what Old Systems have. It's just one gigantic function in wasm ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L398)), which takes care of **all** collision and eating. The function improved in multiple ways besides being in wasm instead of js:

1. Each cell with certain bit flags are skipped (removed, popped, or inside bits)
2. QuadTree is usually used for a broad phase collision solver and taking a callback argument that will resolve the narrow phase collisions later. But in OgarX, the broad phase and narrow phase are combined into one since there are **only** circle objects inside the tree. Cell interactability is also checked **before** checking if they intersect geometrically, which reduces the computation by **a lot**.
3. Double resolution is avoided in OgarX. Old System would push A->B and B->A into the result array and try to resolve them which is inefficient and unnecessary. OgarX will only solve A->B when A has a bigger radius than B, and this change does not have an obvious effect on the result.
   With these optimizations, the physics resolve performs at least x3-x10 faster than Old Systems (benchmark needed).

#### Handle Player IO

This includes handling player inputs (ejects, splits, etc) and outputs (sending cell and player data to the client). The function is the same as Old Systems, done in JS with nothing special about it. The outputs aka the protocol serialization will be further discussed below.

### Protocol

[OgarX protocol](https://github.com/Yuu6883/OgarX/blob/master/src/network/protocols/ogarx.js#L6) is quite similar to [OgarII modern protocol](https://github.com/Luka967/OgarII/blob/master/src/protocols/ModernProtocol.js#L7). An instance of the protocol would keep track of the last visible cells and currently visible cells, and calculate 4 lists of cells: **add, update, eat, and delete**, in short, **AUED** lists. The only difference is that OgarX uses another instantiated wasm module to take care of the tables as hash tables, and it writes the serialized data to the wasm memory then tells the js which section of the memory is the result, and the buffer gets sent to client direction. Since hash tables run in O(1) time on lookup and processing the lists take linear time, its asymptotic runtime is faster than Old Systems' protocols which use js Map which has O(log N) lookup time resulting in an asymptotic runtime of O(N log N). Combined with fast viewport querying implementation in wasm ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L660)), OgarX protocol can query thousands of cells and serialize them in <0.1ms which is critical for handling a lot of players in a server (100 players would take 10ms, 20% CPU load if TPS is 20). To reduce bandwidth, cell id and size is reduced from unsigned int (4 bytes) to unsigned short (2 bytes); x and y value are reduced to signed short (2 bytes). Cell type is removed from the update packet since the type does not change once it's added. These contribute to an overall 50%+ bandwidth reduction compared to the Old Systems.

### Bots

Old Systems' bots are smart in their way (precisely calculated split), but they are quite expensive since they require a viewport query per tick. OgarX bots ([source](https://github.com/Yuu6883/OgarX/blob/master/src/bot/index.js#L25)) are _dumb_ on the other hand, but they require almost no resource to compute. They run on a simple state machine of 3-4 states and choose the next state in a few seconds. Surprisingly most testers, include myself, feel that the bots are unexpected _smart_: their actions are completely random and unpredictable, leading to some interesting gameplay.

### Directional Line Lock

There's a special split even in Agar, called line split. It happens when a player aims horizontally or vertically: all the cells will push each other away in the same direction, making the cells move very far away. But it does not work in other directions due to floating-point errors (I wish 0.1 + 0.2 == 0.3 in computers), even if the player's aim is locked. Then I came up with a solution: just project the result back to the line defined by the user's cursor position and the cell position when it's locked, and only make it lockable when the player has 1 cell. Line lock will also be disabled when the player even gets popped by a virus or hits a border (or the cells will start pushing each other outside the border).

### Replay System

I've worked on replay systems for some clones before I implemented it for OgarX, so it wasn't hard for me at all. I did come up with a unique feature: the client take screenshots of the game every few ticks and record the packets and generate a GIF file containing the preview of the clip and **the actual packets** inside it. It might sound like magic, but I discovered that in the GIF format, whatever bytes come after the last block delimiter byte (";") are not parsed and rendered. So the file will still work as a regular GIF file as well as a container of arbitrary data; all we need to do is to write the buffer length as the last 4 bytes of the file, and we will be able to extract the extra data by reading the last 4 bytes first, checks if the byte before the buffer is ";", then slice the buffer out from the GIF, like a cake 🍰.

## Deploying and Scaling Up

The game server is well optimized to handle dozens of players, even when it's single-threaded. You can add more servers to `config.json` generated in the root directory. Here's an example that I use for my EU server:

```json
[
    {
        "name": "Server1",
        "kill_timeout": 3000,
        "env": {
            "OGARX_MODE": "default/mega",
            "OGARX_PORT": 3001,
            "OGARX_SERVER": "Mega"
        }
    },
    {
        "name": "Server2",
        "env": {
            "OGARX_MODE": "custom/covid",
            "OGARX_PORT": 3000,
            "OGARX_SERVER": "Virus"
        }
    },
    {
        "name": "Server3",
        "kill_timeout": 3000,
        "env": {
            "OGARX_MODE": "default/omega",
            "OGARX_PORT": 3002,
            "OGARX_SERVER": "Omega"
        }
    },
    {
        "name": "Server4",
        "kill_timeout": 3000,
        "env": {
            "OGARX_MODE": "default/extreme-omega",
            "OGARX_PORT": 3003,
            "OGARX_SERVER": "Extreme Omega"
        }
    },
    {
        "name": "Server5",
        "kill_timeout": 3000,
        "env": {
            "OGARX_MODE": "default/ffa",
            "OGARX_PORT": 3004,
            "OGARX_SERVER": "Classic"
        }
    }
]
```

The benefit of running everything inside pm2 containers is that it's easier to monitor the processes. You can potentially run servers on the same port and the kernel will take care of the load-balancing. You can probably run 50 classic agar-like servers, handling 1000 player connections on a dedicated 4 core machine without problems since the mode is not computationally intensive at all.

## Future Plans

I might rewrite this server _again_ with c++ from all the tricks and knowledge I've learned from this project. It will probably be used for training actual AI to play this game, or maybe for commercial purposes. I also have quite insane project idea related to OgarX and HPC, so stay tuned!
