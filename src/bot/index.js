const Handle = require("../game/handle");
const BOTS = require("../../public/static/data/bots.json");

/** @template T @param {T[]} array */
const pick = array => array[~~(Math.random() * array.length)];

module.exports = class Bot extends Handle {

    /** @param {import(".")} game */
    constructor(game) {
        super(game);
        this.join();
        this.controller.name = pick(BOTS.names);
        this.controller.skin = pick(BOTS.skins);
    };

    onSpawn() {

    };

    onUpdate() {
        if (!this.controller.alive) this.controller.spawn = true;
        else {
            this.controller.mouseX = this.controller.viewportX;
            this.controller.mouseY = this.controller.viewportY;
        }
    };

    /** @param {string} err */
    onError(err) {};
    /**
     * @param {import("./controller")} sender 
     * @param {string} message 
     */
    onChat(sender, message) {};
}