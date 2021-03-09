const Handle = require("../game/handle");

module.exports = class Protocol extends Handle {

    constructor(game) {
        super(game);
        this.disconnectTime = 0;
    }

    /** @param {DataView} view */
    static handshake(view) { return false; }
    
    /** @param {DataView} view */
    onMessage(view) {};
}