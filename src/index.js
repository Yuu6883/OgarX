const Game = require("./game/game");

const game = new Game();
const engine = game.engine;

engine.init().then(() => {
    const cells = engine.cells;

    const LOG = 5;
    console.log("Tick0");
    engine.newCell(99999, 99999, 2000, 0);
    for (let i = 0; i < LOG; i++) 
        console.log(cells[i].toString());

    
    console.log("Tick1");
    engine.tick();
    for (let i = 0; i < LOG; i++) 
        console.log(cells[i].toString());
        
    console.log("Tick2");
    engine.tick();
    for (let i = 0; i < LOG; i++) 
        console.log(cells[i].toString());
});