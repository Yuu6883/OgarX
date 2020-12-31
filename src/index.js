const fs = require("fs");
const path = require("path");
const CORE_PATH = path.resolve(__dirname, "..", "public", "static", "wasm", "server.wasm");

const Server = require("./network/ws-server");

const server = new Server();
const engine = server.game.engine;

engine.setOptions({
    VIRUS_COUNT: 20,
    PLAYER_DECAY_SPEED: 0.005,
    PLAYER_MAX_CELLS: 256,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_SPLIT_CAP: 8,
    VIRUS_MONOTONE_POP: true,
    EJECT_DELAY: 75,
    PELLET_COUNT: 1000,
    PLAYER_SPAWN_SIZE: 1000
});

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
