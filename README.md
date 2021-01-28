# <strong> OgarX </strong>
Server is mostly finished and optimized to the point where it can't be optimized anymore.
Client is mostly finished as well but need optimization since it runs poorly on laptops (OIT shader eats too much GPU power), and it needs a simpler rewrite.

## Technology
* New buffer protocol 
* Specialized & optimized quadtree
* JS (instead of c++, core is mostly in c and compiled to WebAssembly)
* Raw WebGL client

## Features
* Render borders/map
* Auto respawn
* Custom resolution
* Minimap
* Mouse keybinds
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
I will write a long post about how I over-engineered everything and made it so optimized compared to other Ogar projects (self-proclaimed). Stay toned!
