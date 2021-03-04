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

### Data oriented design
In traditional way, memory is allocated whenever a new cell is added to the engine. However, in this project, there's fixed size (65536) cell pool where all the memory are pre-allocated. Each cell has a bit flag indicating whether it exists or not. Whenever we want to add a new cell, we just need to find the index of the next sparse spot (non-existing cell) in the pool. This way we can minimize memory footprint and put less stress on the garbage collector. Another benefit of this design is that cell id is limited to an unsigned short (16 bits) instead of the traditional way of using an unsigned int (32 bits) for it, thus reducing the bandwidth usage (will be discussed more). This is also good for the client because we can also use this design to pre-allocate the cell pool.

### WebAssembly
Wasm is a great tool for optimization, if you know what you are doing. Using c++ for compiling to wasm or generating a huge js glue file from emscripten is out of the question, since calls between js and wasm is still relatively slow and those tools usually generate a huge amount of calls between js and wasm. Then I found out that there's a build flag in emcc called **SUBMODULE=1** which builds the wasm file only, without the stupidly long js glue. This is perfect for the project since I want to optimize to the fullest, and I don't want code in my project that I do not understand. I don't need and I don't want to know how they manage which section of the wasm memory is used or not; I can handle the memory and pointers myself. It makes profiling a lot easier this way. Thus I wrote the entire core for the physics engine in c and compiled it as a wasm side module.

### Quadtree
This project still use the same data structure, quadtree, as the broad phase physic resolver. But the main difference is that I serialize it to the wasm memory while keeping the structure on the js side. This design is intended for speeding up the viewport querying and the actual physics resolution. You might think that serializing the entire quad tree to wasm memory is slow and the speed gained because of it does not justify it. In reality it's quite the opposite, with 10k items in the quadtree, it only takes ~1ms to serialize to wasm and the performance gain from it is HUGE. The wasm quadtree viewport querying is about 5-10 times faster than a normal js quadtree query, meaning it can handle more players and bigger viewports.
