/** @template T */
module.exports = class Protocol {
    /** @param {DataView} view */
    static handshake(view) { return false; }
    /** @param {T} handler */
    constructor(handler) { this.handler = handler; }
    /** @param {DataView} view */
    onMessage(view) {};
}