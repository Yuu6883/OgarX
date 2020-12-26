const Server = require("./network/server");
const Game = require("./game/game");

const game = new Game({
    VIRUS_COUNT: 0,
    PLAYER_MAX_CELLS: 16,
    // PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_SPLIT_CAP: 4,
    VIRUS_MONOTONE_POP: false,
    EJECT_SIZE: 40,
    EJECT_LOSS: 40,
    PELLET_COUNT: 1000,
    MAP_HH: 1000,
    MAP_HW: 1000,
    PLAYER_SPAWN_SIZE: 100
});

const server = new Server(game);
const engine = game.engine;

process.on("SIGINT", async () => {
    game.rl.close();
    engine.stop();
    await server.close();
    process.exit(0);
});

(async () => {
    await engine.init();
    await server.open();
    engine.start();
})();
