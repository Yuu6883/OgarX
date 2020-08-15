module.exports = class Handle {
    /** @param {import("./game")} game */
    constructor(game) {
        this.game = game;
        /** @type {import("./controller")} */
        this.controller = null; 
    };
    onUpdate() {};
    /** @param {string} err */
    onError(err) {};
}