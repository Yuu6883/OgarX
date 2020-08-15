const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");
const PONG = new Uint8Array([3]);

const MOTHER_CELL_TYPE = 252;
const VIRUS_TYPE = 253;
const PELLET_TYPE = 254;
const EJECTED_TYPE = 255;

const TYPE_TABLE = {
    252: 2,
    253: 2,
    254: 4,
    255: 3,
}

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
                console.log(`Player#${controller.id}: ` + 
                    `{ name: ${controller.name}, ` + 
                    `skin: ${controller.skin} } requested spawn`);
                break;
            case 2:
                if (controller.alive) return;
                // TODO: spectate a target
                break;
            // ping
            case 3:
                this.handler.ws.send(PONG, true);
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

        this.sendInitPacket();
    }

    sendInitPacket() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUInt8(2);
        writer.writeUInt8(0); // Game mode type
        writer.writeUInt8(0); // Game mode type
        writer.writeUInt16(42069) // garbage value
        writer.writeUInt16(this.handler.controller.id);
        writer.writeUInt32(this.handler.game.engine.options.MAP_HW * 2);
        writer.writeUInt32(this.handler.game.engine.options.MAP_HH * 2);
        this.handler.ws.send(writer.finalize(), true);
    }

    onUpdate() {
        const engine = this.handler.game.engine;
        const cells = engine.cells;

        const visibleList = engine.query(this.handler.controller);
        this.currVisible = new Set(visibleList);

        const writer = new Writer();
        writer.writeUInt8(10);

        for (const cell_id of visibleList) {
            if (!this.lastVisible.has(cell_id) || 
                cells[cell_id].updated) {
                const cell = cells[cell_id];
                // Don't send ejected cell under 2 tick to optimize
                if (cell.type == EJECTED_TYPE && cell.age < 3) continue;

                const type = TYPE_TABLE[cell.type] || (cell.isDead ? 5 : 1);
                writer.writeUInt8(type);
                if (type === 1)
                    writer.writeUInt16(cell.type); // type is also owner id
                writer.writeUInt32(cell_id);
                writer.writeInt32(~~cell.x);
                writer.writeInt32(~~cell.y);
                writer.writeInt16(~~cell.r);
            }
        }
        writer.writeUInt8(0);

        const eat = [], del = [];
        for (const cell_id of this.lastVisible) {
            if (this.currVisible.has(cell_id)) continue;
            const cell = cells[cell_id];

            // Don't send ejected cell under 2 tick to optimize
            if (cell.type == EJECTED_TYPE && cell.age < 3) continue;
            if (cell.shouldRemove) eat.push(cell_id);
            else del.push(cell_id);
        }

        for (const cell_id of del)
            writer.writeUInt32(cell_id);
        writer.writeUInt32(0);
        for (const cell_id of eat) {
            writer.writeUInt32(cell_id);
            writer.writeUInt32(cells[cell_id].eatenBy);
        }
        writer.writeUInt32(0);
        this.handler.ws.send(writer.finalize(), true);

        this.lastVisible = this.currVisible;
    }
}