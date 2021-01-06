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
        const s = this.game.engine.options.PLAYER_SPAWN_SIZE;
        // Less than 20% of or spawn mass
        if (!this.controller.alive || this.controller.score < s * s / 500) {
            this.controller.spawn = true;
        } else {
            this.controller.mouseX = this.controller.viewportX;
            this.controller.mouseY = this.controller.viewportY;
            this.controller.ejectMarco = true;
            this.controller.splitAttempts = 8;
            this.controller.ejectAttempts = 1;
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