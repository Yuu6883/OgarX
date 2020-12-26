const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

const CLEAR_SCREEN = new Uint8Array([2]);
const PONG = new Uint8Array([69]);

const MOTHER_CELL_TYPE = 252;
const VIRUS_TYPE = 253;
const PELLET_TYPE = 254;
const EJECTED_TYPE = 255;

/** @extends {Protocol<import("../socket")>} */
module.exports = class OgarXProtocol extends Protocol {

    /** @param {DataView} view */
    static handshake(view) { 
        const reader = new Reader(view);
        return reader.length == 3 && 
            reader.readUInt8() == 69 &&
            reader.readInt16() == 420;
    }

    /** @param {import("../socket")} handler */
    constructor(handler) {
        super(handler);
        /** @type {Set<number>} */
        this.lastVisible = new Set();
        /** @type {Set<number>} */
        this.currVisible = new Set();

        this.sendInitPacket();
    }

    sendInitPacket() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUInt16(this.handler.controller.id);
        writer.writeUInt16(this.handler.game.engine.options.MAP_HW);
        writer.writeUInt16(this.handler.game.engine.options.MAP_HH);
        this.handler.ws.send(writer.finalize(), true);
    }

    /** @param {DataView} view */
    onMessage(view) {
        const reader = new Reader(view);
        const OP = reader.readUInt8();
        const controller = this.handler.controller;

        switch (OP) {
            case 1:
                controller.name = reader.readUTF16String();
                controller.skin = reader.readUTF16String();
                controller.spawn = true;
                console.log(`Player#${controller.id}: ` +
                    `{ name: ${controller.name}, ` +
                      `skin: ${controller.skin} } requested spawn`);
                break;
            case 2:
                if (controller.alive) return;
                // TODO: spectate a target
            case 3:
                controller.mouseX = reader.readFloat32();
                controller.mouseY = reader.readFloat32();
                break;
            case 69:
                this.handler.ws.send(PONG, true); // PING-PONG
                break;
            default:
                console.warn(`Unknown OP: ${OP}`);
        }
    };

    onUpdate() {
        const engine = this.handler.game.engine;
        const cells = engine.cells;

        // Don't count ejected cell under 2 tick as visible to optimize
        const visibleList = engine.query(this.handler.controller)
            .filter(id => cells[id].type != EJECTED_TYPE || cells[id].age > 1);
        this.currVisible = new Set(visibleList);

        // console.log(this.handler.controller.viewportX.toFixed(2), 
        //             this.handler.controller.viewportY.toFixed(2),
        //             this.handler.controller.viewportHW.toFixed(2),
        //             this.handler.controller.viewportHH.toFixed(2),
        //             visibleList.length + " visible cells");        

        const writer = new Writer();
        writer.writeUInt8(4);

        writer.writeFloat32(this.handler.controller.viewportX);
        writer.writeFloat32(this.handler.controller.viewportY);

        const addList = [];
        const updateList = [];

        for (const cell_id of visibleList) {
            if (this.lastVisible.has(cell_id)) {
                if (cells[cell_id].type != PELLET_TYPE)
                    updateList.push(cell_id);
            } else addList.push(cell_id);
        }

        // addList.length && console.log("Add Cells");
        for (const cell_id of addList) {
            const cell = cells[cell_id];
            writer.writeUInt16(cell_id);
            writer.writeUInt16(cell.type);
            writer.writeInt16(~~cell.x);
            writer.writeInt16(~~cell.y);
            writer.writeUInt16(~~cell.r);
            // console.log(cell.toString());
        }

        writer.writeUInt16(0);

        for (const cell_id of updateList) {
            const cell = cells[cell_id];
            writer.writeUInt16(cell_id);
            writer.writeInt16(~~cell.x);
            writer.writeInt16(~~cell.y);
            writer.writeUInt16(~~cell.r);
        }

        writer.writeUInt16(0);

        const eat = [], del = [];
        for (const cell_id of this.lastVisible) {
            if (this.currVisible.has(cell_id)) continue;
            const cell = cells[cell_id];
            if (cell.shouldRemove) eat.push(cell_id);
            else del.push(cell_id);
        }

        for (const cell_id of eat) {
            writer.writeUInt16(cell_id);
            writer.writeUInt16(cells[cell_id].eatenBy);

            // console.log(`${cells[cell_id].toString()} eat ${cells[cells[cell_id].eatenBy].toString()}`);
        }

        writer.writeUInt16(0);
        
        for (const cell_id of del)
            writer.writeInt16(cell_id);

        writer.writeUInt16(0);

        this.handler.ws.send(writer.finalize(), true);
        this.lastVisible = this.currVisible;
    };

    /** @param {import("../../game/controller")} controller */
    onSpawn(controller) {
        if (this.handler.controller == controller)
            this.handler.ws.send(CLEAR_SCREEN, true);

        const writer = new Writer();
        writer.writeUInt8(3);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(controller.name);
        writer.writeUTF16String(controller.skin);
        this.handler.ws.send(writer.finalize(), true);
    };

    /** 
     * @param {import("../../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {

    };
}