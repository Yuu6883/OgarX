const Server = require("./network/sw-server");
const OgarXProtocol = require("./network/protocols/ogarx");

const server = new Server();
const engine = server.game.engine;

const modes = {
    omega: require("./modes/default/omega"),
    mega: require("./modes/default/mega"),
    selfeed: require("./modes/default/selfeed"),
    ffa: require("./modes/default/ffa"),
    virus: require("./modes/default/virus")
}

const s = new URLSearchParams(self.location.search);
const options = modes[s.get("mode")] || modes.mega;

// Scale down the local server from omega since browser probably can't handle it
options.BOTS >>= 2;
options.MAP_HH >>= 1;
options.MAP_HW >>= 1;
options.VIRUS_COUNT >>= 2;
options.PELLET_COUNT >>= 2;

engine.setOptions(options);
server.open();

(async () => {
    let res = await fetch("/static/wasm/server.wasm");
    let buffer = await res.arrayBuffer();

    await engine.init(buffer);
    
    res = await fetch("/static/wasm/ogarx.wasm");
    buffer = await res.arrayBuffer();

    await OgarXProtocol.init(buffer, 4);

    engine.start();
    
    console.log("Shared worker server running");
})();
