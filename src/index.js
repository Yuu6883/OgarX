const Server = require("./network/server");
const Game = require("./game/game");

const game = new Game();
const server = new Server(game);
const engine = game.engine;

(async () => {
    await engine.init();
    await server.open();
})();
