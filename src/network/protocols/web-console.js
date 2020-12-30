const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

/** @extends {Protocol<import("../socket")<import("../fake-socket")>>} */
module.exports = class WebConsoleProtocol extends Protocol {

    /** @param {DataView} view */
    static handshake(view) { 
        const reader = new Reader(view);
        return reader.length == 3 && 
            reader.readInt16() == 420 &&
            reader.readUInt8() == 69;
    }
    
    constructor(handler) {
        super(handler);
        this.onTick = this.onTick.bind(this);
        this.handler.game.engine.addListener("tick", this.onTick);
    }

    onTick() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeFloat32(this.handler.game.engine.usage);
        this.handler.ws.send(writer.finalize());
    }

    onDisconnect(code, reason) {
        this.handler.game.engine.removeListener("tick", this.onTick);
    }
}