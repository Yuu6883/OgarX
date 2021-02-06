const Server = require("./network/sw-server");
const OgarXProtocol = require("./network/protocols/ogarx");

const server = new Server();
const engine = server.game.engine;

engine.setOptions(require("./modes/default/mega"));
server.open();

(async () => {
    let res = await fetch("/static/wasm/server.wasm");
    let buffer = await res.arrayBuffer();

    await engine.init(buffer);
    
    res = await fetch("/static/wasm/ogarx.wasm");
    buffer = await res.arrayBuffer();

    await OgarXProtocol.init(buffer);

    engine.start();
    
    console.log("Shared worker server running");
})();
