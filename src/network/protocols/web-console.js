const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

module.exports = class WebConsoleProtocol extends Protocol {

    /** @param {DataView} view */
    static handshake(view) { 
        const reader = new Reader(view);
        return reader.length == 3 && 
            reader.readInt16() == 420 &&
            reader.readUInt8() == 69;
    }

    /** 
     * @param {import("../../game")} game
     * @param {import("../fake-socket")} ws 
     */
    constructor(game, ws) {
        super(game);
        this.ws = ws;
    }

    /** @param {import("../../game/controller")} controller */
    onJoin(controller) {
        const writer = new Writer();
        writer.writeUInt8(2);
        writer.writeUInt16(controller.id);
        this.ws.send(writer.finalize());
    }

    /** @param {import("../../game/controller")} controller */
    onLeave(controller) {
        const writer = new Writer();
        writer.writeUInt8(3);
        writer.writeUInt16(controller.id);
        this.ws.send(writer.finalize());
    }

    /** @param {import("../../game/controller")} controller */
    onSpawn(controller) {
        const writer = new Writer();
        writer.writeUInt8(4);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(controller.name);
        writer.writeUTF16String(controller.skin);
        this.ws.send(writer.finalize());
    }

    onTick() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeFloat32(this.game.engine.usage);
        writer.writeUInt16(this.game.engine.cellCount);
        writer.writeUInt8(this.game.handles);
        this.ws.send(writer.finalize());
    }
}