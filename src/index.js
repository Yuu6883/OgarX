const Game = require("./game/game");

const game = new Game();
const engine = game.engine;

engine.init().then(() => {

    engine.options.VIRUS_COUNT = 0;
    engine.options.PELLET_COUNT = 0;
    engine.options.MOTHER_CELL_COUNT = 0;

    const cells = engine.cells;

    engine.newCell(0,  0, 1000, 0);
    engine.newCell(10, 0, 1000, 0);
    
    const LOG = 2;
    for (let i = 0; i < 17; i++) {
        console.log(`Tick${i}`);
        for (let i = 0; i < LOG; i++)
            console.log(cells[i].toString());
        engine.tick(1);
    }
});