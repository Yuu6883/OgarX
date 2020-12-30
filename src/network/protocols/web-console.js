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
        this.onJoin = this.onJoin.bind(this);
        this.onLeave = this.onLeave.bind(this);
        this.onSpawn = this.onSpawn.bind(this);

        this.handler.game
            .on("tick", this.onTick)
            .on("join", this.onJoin)
            .on("leave", this.onLeave)
            .on("spawn", this.onSpawn);

        for (const c of this.handler.game.controls)
            if (c.handle) this.onSpawn(c);
    }

    /** @param {import("../../game/controller")} controller */
    onJoin(controller) {
        const writer = new Writer();
        writer.writeUInt8(2);
        writer.writeUInt16(controller.id);
        this.handler.ws.send(writer.finalize());
    }

    /** @param {import("../../game/controller")} controller */
    onLeave(controller) {
        const writer = new Writer();
        writer.writeUInt8(3);
        writer.writeUInt16(controller.id);
        this.handler.ws.send(writer.finalize());
    }

    /** @param {import("../../game/controller")} controller */
    onSpawn(controller) {
        const writer = new Writer();
        writer.writeUInt8(4);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(controller.name);
        writer.writeUTF16String(controller.skin);
        this.handler.ws.send(writer.finalize());
    }

    onTick() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeFloat32(this.handler.game.engine.usage);
        writer.writeUInt16(this.handler.game.engine.cellCount);
        writer.writeUInt8(this.handler.game.handles);
        this.handler.ws.send(writer.finalize());
    }

    onDisconnect(code, reason) {
        this.handler.game
            .off("tick", this.onTick)
            .off("join", this.onJoin)
            .off("leave", this.onLeave)
            .off("spawn", this.onSpawn);
    }
}