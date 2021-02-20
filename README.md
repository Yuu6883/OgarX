# <strong> [OgarX](https://ogar69.yuu.dev) </strong>
This project is an optimized rewrite of [OgarII](https://github.com/Luka967/OgarII). A lot of features from the original project are not implemented (while I focused on other features that serve my interests the best).

## Disclaimer
You can not use this server as a substiture for OgarII or any clones since I've only implemented its own protocol. The only client that works with the server is the WebGL client which runs poorly on laptop. The physics are not idententical even though most formula and calculations are the same. The differences & optimization will be further discussed.

## Technology
* Efficient protocol
* Specialized & optimized quadtree
* WebAssembly core (written in C)
* Raw WebGL client

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
 - [ ] Commands (some form of authentication needed)
 - [ ] ~~Configurable local server~~ (some options should not be modifiable)
 - [ ] ~~Peer-to-peer connection~~ (WebRTC API is terrible)

## Demo
**WARNING: only works with latest Chrome** and laptops have low fps due to the shader program<br>
https://ogar69.yuu.dev<br>
(Local server is implemented with a SharedWorker)
