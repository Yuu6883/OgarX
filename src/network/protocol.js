const Handle = require("../game/handle");

module.exports = class Protocol extends Handle {

    constructor(game) {
        super(game);
    }

    /** @param {DataView} view */
    static handshake(view) { return false; }
    
    /** @param {DataView} view */
    onMessage(view) {};
}