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
