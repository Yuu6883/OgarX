# <strong> OgarX </strong>
This project is an optimized rewrite of [OgarII](https://github.com/Luka967/OgarII). A lot of features from the original project are not implemented (while I focused on other features that serve my interests the best).

## Disclaimer
You can not use this server as a substiture for OgarII or any clones since I've only implemented its own protocol. The only client that works with the server is the WebGL client which runs poorly on laptop. The physics are not idententical even though most formula and calculations are the same. The differences & optimization will be further discussed.

## Technology
* Efficient protocol
* Specialized & optimized quadtree
* WebAssembly core (written in C)
* Raw WebGL client

## Features
* Render borders/map
* Auto respawn
* Custom resolution
* Minimap
* Custom keybinds
* Customizable render options
* Main menu UI
* Game chat
* Leaderboard
* Display stats (FPS, net delay, etc)

## Todo
* Replay System (in progress)
* Server commands (chat/web-console/terminal)
* Configurable local server
* Peer-to-peer connection
* Public server list
* Rewrite shader so overlapping cells with exact same mass renders correctly

## Demo
**WARNING: only works with latest Chrome** and laptops will have low fps<br>
https://ogar69.yuu.dev<br>
(Local server is implemented with SharedWorker)

## Notes
SoonTM
