/** @template T */
module.exports = class Protocol {
    /** @param {DataView} view */
    static handshake(view) { return false; }
    /** @param {T} handler */
    constructor(handler) { this.handler = handler; }
    /** @param {DataView} view */
    onMessage(view) {};
    onUpdate() {};
    /** @param {import("../game/controller")} controller */
    onSpawn(controller) {};
    /** 
     * @param {import("../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {};
    onDisconnect(code, reason) {};
}