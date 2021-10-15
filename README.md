# <strong> OgarX </strong>

This project is an _optimized_ rewrite of the Ogar series project, especially based on [OgarII](https://github.com/Luka967/OgarII)'s structure. A lot of features from the original project are not implemented (while I focused on other features that serve my interests the best).

## Disclaimer

You **CAN NOT** use this server as a substitute for OgarII or any other Agar clones since the protocol is unique. The only client that works with the server is written with **WebGL2**, which might not be supported or run smoothly on a low-end laptop. The client could also have a lot of bugs since I'm not a professional frontend developer, but the main sell point of this project is the server regardless. The physics is also not identical even though most formulas and calculations are the same. **The differences & optimizations are further discussed in [OgarX Deep Dive](./DEEP_DIVE.md)**

## Features

-   [x] Public server list
-   [x] Replay System
-   [x] Render borders/map
-   [x] Auto respawn
-   [x] Custom resolution
-   [x] Minimap
-   [x] Custom keybinds
-   [x] Customizable render options
-   [x] Main menu UI
-   [x] Game chat
-   [x] Leaderboard
-   [x] Display stats (FPS, net delay, etc)
-   [x] Better shader (performance & correctness issues)
-   [ ] ~~Commands~~ (lot of limitation on the engine already and there's not many commands to implement)
-   [ ] ~~Configurable local server~~ (some options should not be modifiable)
-   [ ] ~~Peer-to-peer connection~~ (WebRTC API is terrible)

## Game Modes

Those are the ones that are stable meaning they have been thoroughly tested on public servers.
Name | Description
--- | ---
FFA | Classic Agar-Like server, with auto-split
Mega | 64 max cells, with solo-trick
Omega | 256 max cells, with solo-trick
Extreme Omega | Omega but no decay or virus

There are also ones in the default mode folder but **not tested**.

| Name          | Description                    |
| ------------- | ------------------------------ |
| Solotrick FFA | FFA with solo-trick?!          |
| Instant       | 64 max cells, 0 merge delay    |
| Crazy         | 200 max cells, with auto-split |

## ~~Demo~~

Sadly there's no live demo since the client relies on [SharedArrayBuffer which requires specific HTTP headers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements)

## Installation

Clone this repository, run `npm i` in the root and make sure you have [pm2](https://pm2.keymetrics.io/) installed globally (`npm i -g pm2`) so you can interact with the processes.

## Build

Building is **not required** since all the client files are already built into `public` folder, but if you want to make changes to it and build the files run `node build -a` which bundles the js files with browserify and babel minifier programmatically.

## Run -- Web

`node static` will only serve the files from `public/` directory, but you can navigate to localhost:8080 to play on in-browser local servers **(implemented with [SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)).**

## Run -- Node

`node run` spawns a Mega server in the background and writes the config to `config.json` in the root directory by default. You use `pm2 kill` or `pm2 restart all` or just `node run` again to update the processes (see their documentation). You can look at the config json which is a [pm2 ecosystem file](https://pm2.keymetrics.io/docs/usage/application-declaration/#javascript-format) with some environment variables passed in (to specify the game mode, network port, network path, and the name of the server). The script will also spawn a **gateway** server which collects all the running servers' usage and occupancies and serve the clients with [SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events). Edit [this](/public/index.html?L=203) to connect your client to an OgarX gateway.

## Project Highlights

Even though there isn't a benchmark due to the lack to standardized environment, OgarX is probably the fastest clone in term of single core/thread performance. While it was running, the server was able to handle around 40 players with dual controls in Mega mode with a fairly big map (44k x 44k). I decided to shutdown the project due to 2 annoying reasions:

1. There's a bug that I just can't find that causes the physics engine to enter a semi-broken state which makes it run insanely slow (200ms tick time), making the game unplayable. It was just impossible for me to debug it since the control flow of the core (implemented as a WebAssembly submodule), includes ton of pointers, is completely managed by handwritten js.
2. Some random skid kept botting the game, which has no security measurement (open source duh). It didn't necessarily lagg the server but rather annoyed me on a daily basis. This is a common problem of IO games since they usually don't have industrial security and lack the legal consequences of breaking ToS. Toxic kids are always bored and try to mess with people to boost their ego.
