const Protocol = require("../protocol");

module.exports = class VanisProtocol extends Protocol {
    /** @param {DataView} view */
    static handshake(view) {
        return true;
    }
    /** @param {DataView} view */
    onMessage(view) {

    }
    /** @param {import("../../game/game")} game */
    constructor(game) { 
        super(game);
    }
}