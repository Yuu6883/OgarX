const Protocol = require("../protocol");
const Reader = require("../reader");
const PONG = new Uint8Array([3]);

/** @extends {Protocol<import("../socket")>} */
module.exports = class VanisProtocol extends Protocol {
    /** @param {DataView} view */
    static handshake(view) {
        if (view.byteLength !== 4) return false;
        if (view.getUint16(0, true) != 69) return false;
        if (view.getUint16(2, true) != 420) return false;
        
        return true;
    }
    /** @param {DataView} view */
    onMessage(view) {
        const reader = new Reader(view);
        const opCode = reader.readUInt8();
        const controller = this.handler.controller;

        switch (opCode) {
            case 1:
                controller.name = decodeURIComponent(reader.readUTF8String()).slice(0, 16);
                controller.skin = reader.readUTF8String();
                // TODO: tag
                controller.spawn = true;
                break;
            case 2:
                if (controller.alive) return;
                // TODO: spectate a target
                break;
            // ping
            case 3:
                this.handler.ws.send(PONG);
                break;
            // line lock
            case 15:
                // TODO
                break;
            case 16:
                controller.mouseX = reader.readInt32();
                controller.mouseY = reader.readInt32();
                break;
            // Split
            case 17:
                controller.splitAttempts = reader.readUInt8();
                break;
            // Feed
            case 21:
                if (view.byteLength == 1)
                    controller.ejectAttempts++;
                else {
                    controller.ejectAttempts = 0;
                    controller.ejectMarco = reader.readUInt8();
                }
                break;
            // Chat
            case 99:
                // TODO: handle chat
                const message = reader.readUTF8String();
                console.log(message);
                break;
        }
    }
    /** @param {import("../socket")} handler */
    constructor(handler) {
        super(handler);
        /** @type {Set<number>} */
        this.lastVisible = new Set();
        /** @type {Set<number>} */
        this.currVisible = new Set();
    }
}