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
            this.protocol = Protocols.find(p => p.handshake(view));
            if (!this.protocol) this.ws.end(1003, "Ambiguous protocol");
        } else this.protocol.onMessage(view);
    }
}