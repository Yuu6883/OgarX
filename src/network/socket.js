const Handler = require("../game/handle");

/** @template T */
class SocketHandler extends Handler {
    
    /** 
     * @param {import("../game")} game
     * @param {T} ws 
     */
    constructor(game, ws) {
        super(game);
        this.ws = ws;
        /** @type {import("./protocol")} */
        this.protocol = null;
    }

    onProtocol() {
        this.game.addHandler(this);
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
                const Protocol = SocketHandler.protocols.find(p => p.handshake(view));
                if (!Protocol) this.ws.end(1003, "Ambiguous protocol");
                this.onProtocol();
                this.protocol = new Protocol(this);
            } else this.protocol.onMessage(view);
        } catch (e) {
            console.error(e);
        }
    }

    /** 
     * @param {import("../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {
        this.protocol && this.protocol.onChat(controller, message);
    }

    onDisconnect(code, reason) {
        this.protocol && this.protocol.onDisconnect(code, reason);
        this.game.removeHandler(this);
    }
}

SocketHandler.protocols = require("./protocols");

module.exports = SocketHandler;