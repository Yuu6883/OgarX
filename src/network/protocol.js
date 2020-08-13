module.exports = class Protocol {
    /** @param {DataView} view */
    static handshake(view) { return false; }
    /** @param {import("../game/game")} game */
    constructor(game) { this.game = game; }
    /** @param {DataView} view */
    onMessage(view) {};
}