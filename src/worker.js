const Server = require("./network/sw-server");

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
    EJECT_LOSS: 39,
    EJECT_DELAY: 25,
    PELLET_COUNT: 1000,
    PLAYER_SPAWN_SIZE: 1500,
    MAP_HW: 32767 >> 2, // MAX signed short
    MAP_HH: 32767 >> 2, // MAX signed short,
});

server.open();

(async () => {
    const res = await fetch("/static/wasm/server.wasm");
    const buffer = await res.arrayBuffer();

    await engine.init(buffer);
    engine.start();
    
    console.log("Shared worker server running");
})();
