const fs = require("fs");
const path = require("path");
const CORE_PATH = path.resolve(__dirname, "wasm", "core.wasm");

const Server = require("./network/ws-server");
const Game = require("./game/game");

const game = new Game({
    VIRUS_COUNT: 20,
    PLAYER_MAX_CELLS: 1024,
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

process.on("SIGINT", async () => {
    engine.stop();
    await server.close();
    process.exit(0);
});

(async () => {
    await engine.init(fs.readFileSync(CORE_PATH));
    await server.open();
    engine.start();
})();
