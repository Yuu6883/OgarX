module.exports = class Handle {
    /** @param {import(".")} game */
    constructor(game) {
        this.game = game;
        /** @type {import("./controller")} */
        this.controller = null; 
    };
    join() { this.game.addHandler(this); }
    remove() { this.game.removeHandler(this); }
    onSpawn() {};
    onUpdate() {};
    /** @param {string} err */
    onError(err) {};
    /**
     * @param {import("./controller")} sender 
     * @param {string} message 
     */
    onChat(sender, message) {};
}