const Controller = require("./controller");
const Engine = require("../physics/engine");

const MAX_PLAYER = 250;

module.exports = class Game {
    constructor() {
        this.controls = Array.from({ length: MAX_PLAYER }, _ => new Controller());
        this.engine = new Engine(this, {}); // TODO
    }
}