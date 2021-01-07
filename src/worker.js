const Server = require("./network/sw-server");
const OgarXProtocol = require("./network/protocols/ogarx");

const server = new Server();
const engine = server.game.engine;

engine.setOptions({
    VIRUS_COUNT: 20,
    PLAYER_MAX_CELLS: 128,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_SPLIT_CAP: 8,
    PLAYER_MERGE_TIME: 5,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 38,
    EJECT_LOSS: 38.2,
    EJECT_DELAY: 25,
    BOTS: 100,
    PELLET_COUNT: 1000,
    PLAYER_SPAWN_SIZE: 1500,
    MAP_HW: 30000,
    MAP_HH: 30000
});

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
