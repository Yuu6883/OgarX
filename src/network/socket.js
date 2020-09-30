const Handler = require("../game/handle");
const Writer = require("./writer");
const Protocols = require("./protocols");

module.exports = class Socket extends Handler {
    /** 
     * @param {import("../game/game")} game
     * @param {import("uWebSockets.js").WebSocket} ws 
     */
    constructor(game, ws) {
        super(game);
        this.ws = ws;
        this.protocol = null;
        this.ws.subscribe("broadcast");
    }

    /** @param {import("../game/controller")} controller */
    onSpawn(controller) {
        this.protocol && this.protocol.onSpawn(controller);
    }

    onUpdate() {
        this.protocol && this.protocol.onUpdate();
    }

    /** @param {DataView} view */
    onMessage(view) {
        try {
            if (!this.protocol) {
                const Protocol = Protocols.find(p => p.handshake(view));
                if (!Protocol) this.ws.end(1003, "Ambiguous protocol");
                this.protocol = new Protocol(this);
            } else this.protocol.onMessage(view);
        } catch (e) {
            console.error(e);
        }
    }

    onChatMsg(controller, message) {
        var writer = new Writer();
        if (controller == null) {
            writer.writeUInt8(13);
            writer.writeUInt16(0);
            writer.writeUTF8String(message);
        } else {
            writer.writeUInt8(13);
            writer.writeUInt16(controller.id);
            writer.writeUTF8String(message);
        }

        writer = writer.finalize();

        this.protocol && this.protocol.onChatMsg(writer);
    }
}