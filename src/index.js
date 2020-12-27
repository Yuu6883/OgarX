const Server = require("./network/server");
const Game = require("./game/game");

const game = new Game({
    VIRUS_COUNT: 20,
    PLAYER_MAX_CELLS: 1024,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_SPLIT_CAP: 4,
    VIRUS_MONOTONE_POP: false,
    EJECT_SIZE: 40,
    EJECT_LOSS: 40,
    EJECT_DELAY: 25,
    PELLET_COUNT: 1000,
    PLAYER_SPAWN_SIZE: 2500
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
