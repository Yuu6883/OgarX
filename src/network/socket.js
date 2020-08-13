const Handler = require("../game/handle");
const Protocols = require("./protocols");

module.exports = class Socket extends Handler {
    /** @param {import("uWebSockets.js").WebSocket} ws */
    constructor(ws) {
        super();
        this.ws = ws;
        this.protocol = null;
    }

    onUpdate() {
        
    }

    /** @param {DataView} view */
    onMessage(view) {
        if (!this.protocol) {
            const match = Protocols.some()
        }
    }
}