const Server = require("./network/server");
const Game = require("./game/game");

const game = new Game({
    // VIRUS_COUNT: 0,
    PLAYER_MAX_CELLS: 256,
    PLAYER_AUTOSPLIT_SIZE: 0,
    VIRUS_MONOTONE_POP: true,
    // EJECT_SIZE: 50,
    PLAYER_SPAWN_SIZE: 1000
});
const server = new Server(game);
const engine = game.engine;

(async () => {
    await engine.init();
    await server.open();
    engine.start();
})();
