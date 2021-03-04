# <strong> [OgarX](https://ogar69.yuu.dev) </strong>
This project is an *optimized* rewrite of [OgarII](https://github.com/Luka967/OgarII). A lot of features from the original project are not implemented (while I focused on other features that serve my interests the best).

## Disclaimer
You can not use this server as a substitute for OgarII or any clones since I've only implemented its own protocol. The only client that works with the server is the **WebGL2** client which might not be supported or run smoothly on extremely lowend laptop. The physics are not idententical even though most formula and calculations are the same. The differences & optimization will be further discussed.

## Features
 - [x] Public server list
 - [x] Replay System
 - [x] Render borders/map
 - [x] Auto respawn
 - [x] Custom resolution
 - [x] Minimap
 - [x] Custom keybinds
 - [x] Customizable render options
 - [x] Main menu UI
 - [x]  Game chat
 - [x] Leaderboard
 - [x]  Display stats (FPS, net delay, etc)
 - [x] Better shader (performance & correctness issues)
 - [x] Dual mode
 - [ ] ~~Commands~~ (lot of limitation on the engine already and there's not many commands to implement)
 - [ ] ~~Configurable local server~~ (some options should not be modifiable)
 - [ ] ~~Peer-to-peer connection~~ (WebRTC API is terrible)

## Demo
https://ogar69.yuu.dev<br>
(Local server is implemented with a SharedWorker meaning the server is running in your browser)

## Local Development
### Installation
Clone this repository, run `npm i` in the root and make sure you have [pm2](https://pm2.keymetrics.io/) installed globally (`npm i -g pm2`) so you can interact with the processes.

### Build
Build is not required since all the client files are already built into `public` folder, but if you want to make changes to it and build the files run `node build -a` which basically bundles the js files with browserify and babel minifier programmatically.

### Run
`node run` which spawns 1 megasplit server and write the config to `config.json` in the root directory. You use `pm2 kill` or `pm2 restart all` or just `node run` again to update the processes (see their documentation). You can look at the config json which is basically a [pm2 ecosystem file](https://pm2.keymetrics.io/docs/usage/application-declaration/#javascript-format) with some environment variables passed in (to specify game mode, network port, network path, and the name of the server). The script will also spawn a **gateway** server which collects all the running servers' usage and occupancies and serve to the clients with [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

### Play
Serve the files from `public` folder with whatever service you want and visit the page.

## Project Highlights
There are quite a few techniques I've used in this project to achieve such level of optimization.

### Data Oriented
In traditional way, memory is allocated whenever a new cell is added to the engine. However, in this project, there's fixed size (65536) cell pool where all the memory are pre-allocated. Each cell has a bit flag indicating whether it exists or not. Whenever we want to add a new cell, we just need to find the index of the next sparse spot (non-existing cell) in the pool. This way we can minimize memory footprint and put less stress on the garbage collector. Another benefit of this design is that cell id is limited to an unsigned short (16 bits) instead of the traditional way of using an unsigned int (32 bits) for it, thus reducing the bandwidth usage (will be discussed more). This is also good for the client because we can also use this design to pre-allocate the cell pool.

### WebAssembly
Wasm is a great tool for optimization, if you know what you are doing. Using c++ for compiling to wasm or generating a huge js glue file from emscripten is out of the question, since calls between js and wasm is still relatively slow and those tools usually generate a huge amount of calls between js and wasm. Then I found out that there's a build flag in emcc called **SUBMODULE=1** which builds the wasm file only, without the stupidly long js glue. This is perfect for the project since I want to optimize to the fullest, and I don't want code in my project that I do not understand. I don't need and I don't want to know how they manage which section of the wasm memory is used or not; I can handle the memory and pointers myself. It makes profiling a lot easier this way. Thus I wrote the entire core for the physics engine in c and compiled it as a wasm side module.

### Quadtree
This project still use the same data structure, quadtree, as the broad phase physic resolver. But the main difference is that I serialize it to the wasm memory while keeping the structure on the js side. This design is intended for speeding up the viewport querying and the actual physics resolution. You might think that serializing the entire quad tree to wasm memory is slow and the speed gained because of it does not justify it. In reality it's quite the opposite, with 10k items in the quadtree, it only takes ~1ms to serialize to wasm and the performance gain from it is HUGE. The wasm quadtree viewport querying is about 5-10 times faster than a normal js quadtree query, meaning it can handle more players and bigger viewports. Highly recommand checking out this simple DFS serialization algorithm I can up with as it takes care of the pointers offset in pre-order while writing the children node pointers in post-order ([source](https://github.com/Yuu6883/OgarX/blob/master/src/physics/quadtree.js#L98)).

### Collision Solver
OgarII [world update function](https://github.com/Luka967/OgarII/blob/master/src/worlds/World.js#L260) can be summarized into the following steps:
1. Tick per cell
2. Add new cells
3. Solve boosting cells
4. Update player cells
5. Solve player cells
6. Handle players IO (eject, splits, viewport, protocol)

OgarX [world update function](https://github.com/Yuu6883/OgarX/blob/master/src/physics/engine.js#L263) does it in a similar manner but different order:
1. Add new cells
2. Handle players IO
3. Tick per cell
4. Update player cells
5. Solve all cells

The following section will be focused on how each section above is optimized. I will call OgarII and MultiOgar series Old Systems since they are generally old repositories and I don't want to mention their names every time I talk about them.

#### Cell Ticking
Old Systems all have integer based ticker, meaning the physics is TPS-dependant. This has been observed in a lot of clones when the server is under heavy load and the system starts to behave differently since the tick rate become slower, making cell movements, collision timing, merge timing, and etc all delayed which is directly connected to the client experience as they will see "slow motion" as it happens. On the other hand, OgarX handles most ticking based on delta time, meaning if the TPS is lower than the optimal number, delta time will just be longer and most resolution will be still "correct" based on the flow of time. Under extreme condition, tunneling can happen but it's what it is; a continuous physics solver is not affordable here anyways. Back to the topic of cell ticking, all of OgarX's cell ticking ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L109)) is done in wasm as it's a linear algorithm and only does algebric calculations.

#### Adding New Cells
Old Systems just instanciate a new instance of a particular cell and add it to the quadtree, while OgarX find a sparsed index in the cell pool and store the data there as discussed above in the Data Oriented section ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L73)). Small note here is that this function was originally in js since all it does is just finding an empty slot in the pool and should not take a long time. But there was some evidence that it takes a long time since this function is called really often, and the old method using DataView to write the bytes to wasm memory seems quite inefficient.

#### Boosting Cells
OgarX merged this function into the tick function ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L137)) since there's need to keep track of the boosting cells in an array. Since JS array splicing is a linear algorithm which is very inefficient, Old Systems waste a lot of time on updating the boosting cell array. Besides this, pre-solving boosting cells is actually unneccesary as well; merging it into main collision-eat solving function does not have visitable difference since the order the cells are resolved is sorted (heap sort since it's an in-place algorithm which doesn't require extra memory to be "allocated" from the js side and it's fairly fast) by their size & boost ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L330)).

#### Updating Player Cells
The implementation is quite similar to the Cell Ticking section, all done in wasm ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L195)). There are a lot of fun code in that function related to the any-directional line lock which I will discuss in another section.

#### Main Physics Solver
OgarX's main physics solver is very different from what Old Systems have. It's just one gigantic function in wasm ([source](https://github.com/Yuu6883/OgarX/blob/master/src/c/core.c#L398)), which takes care of **all** collision and eating. The function improved in multiple ways besides being in wasm instead of js:
1. Each cells with certain bit flags are skipped (removed, popped, or inside bits)
2. QuadTree is usually used for a broad phase collision solver and taking a callback argument which will resolve the narrow phase collisions later. But in OgarX, broad phase and narrow phase is combined into one since there are **only** circle objects inside the tree. Cell interactability are also checked **before** checking if they intersects geometrically, which reduces the computation by **a lot**.
3. Double resolution is avoided in OgarX. Old System would push A->B and B->A into the result array and try to resolve them which is inefficient and unnessary. OgarX will only solve A->B when A has bigger radius than B, and this change does not have obvious effect on the result.
With these optimizations, the physics resolve perform at least x3-x10 faster than Old Systems (benchmark needed).

#### Handle Player IO
This includes handling player inputs (ejects, splits, etc) and outputs (sending cell and player data to client). The function is basically same as Old Systems, done in JS with nothing special about it. The outputs aka the protocol serialization will be furthur discussed below.
