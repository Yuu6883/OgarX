const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

const PONG = new Uint8Array([3]);
const CLEAR_SCREEN = new Uint8Array([0x12]);

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
            // mouse
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
                if (view.byteLength == 1) {
                    controller.ejectAttempts++;
                } else {
                    controller.ejectAttempts = 0;
                    controller.ejectMarco = !!reader.readUInt8();
                }
                break;
            // Chat
            case 99:
                const message = reader.readUTF8String();

                this.handler.game.chatChannel.broadcastMessage(this.handler.controller, message);
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
        writer.writeUInt16(42069) // garbage value
        writer.writeUInt16(this.handler.controller.id);
        writer.writeUInt32(this.handler.game.engine.options.MAP_HW * 2);
        writer.writeUInt32(this.handler.game.engine.options.MAP_HH * 2);
        this.handler.ws.send(writer.finalize(), true);
    }

    /** @param {import("../../game/controller")} controller */
    onSpawn(controller) {
        if (this.handler.controller == controller)
            this.handler.ws.send(CLEAR_SCREEN, true);

        const writer = new Writer();
        writer.writeUInt8(15);
        writer.writeUInt16(controller.id);
        writer.writeUTF8String(encodeURIComponent(controller.name));
        writer.writeUTF8String(controller.skin);
        this.handler.ws.send(writer.finalize(), true);
    }

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
        writer.writeUInt8(10);

        for (const cell_id of visibleList) {
            const cell = cells[cell_id];
            const type = TYPE_TABLE[cell.type] || (cell.isDead ? 5 : 1);

            writer.writeUInt8(type);
            if (type === 1) {
                writer.writeUInt16(cell.type); // type is also owner id
            }
            writer.writeUInt32(cell_id);
            writer.writeInt32(~~cell.x);
            writer.writeInt32(~~cell.y);
            writer.writeInt16(~~cell.r);
        }

        writer.writeUInt8(0);

        const eat = [], del = [];
        for (const cell_id of this.lastVisible) {
            if (this.currVisible.has(cell_id)) continue;
            const cell = cells[cell_id];
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

    onChatMsg(viewFinalized) {
        this.handler.ws.send(viewFinalized, true);
    }
}