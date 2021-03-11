const Handle = require("./handle");

module.exports = class DualHandle extends Handle {
    /** 
     * @param {Handle} owner
     */
    constructor(owner) {
        super(owner.game);
        this.owner = owner;
        this.join();
    }

    get score() { return this.controller.score + this.owner.controller.score; }

    // Do nothing
    calculateViewport() {};
};