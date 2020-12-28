const Server = require("./network/sw-server");
const Game = require("./game/game");


const game = new Game({
    VIRUS_COUNT: 20,
    PLAYER_MAX_CELLS: 256,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_SPLIT_CAP: 4,
    VIRUS_MONOTONE_POP: true,
    EJECT_SIZE: 40,
    EJECT_LOSS: 40,
    EJECT_DELAY: 25,
    PELLET_COUNT: 1000,
    PLAYER_SPAWN_SIZE: 1500
});

const server = new Server(game);
const engine = game.engine;
server.open();

(async () => {
    const res = await fetch("/static/wasm/server.wasm");
    const buffer = await res.arrayBuffer();

    await engine.init(buffer);
    engine.start();

    console.log("Shared worker server running");
})();
