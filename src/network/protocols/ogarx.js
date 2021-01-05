const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

const DEAD_CELL_TYPE = 251;
const MOTHER_CELL_TYPE = 252;
const VIRUS_TYPE = 253;
const PELLET_TYPE = 254;
const EJECTED_TYPE = 255;

/** @extends {Protocol<import("../socket")<import("uWebSockets.js").WebSocket & import("../fake-socket")>>} */
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

        this.handler.join();
        this.sendInitPacket();

        for (const c of this.handler.game.controls) {
            if (c.handle) this.onSpawn(c);
        }
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
                break;
            case 2:
                if (controller.alive) return;
                // TODO: spectate a target
            case 3:
                controller.mouseX = reader.readFloat32();
                controller.mouseY = reader.readFloat32();
                // controller.spectate TODO:
                const spectate = reader.readUInt8();
                const splits = reader.readUInt8();
                const ejects = reader.readUInt8();
                const macro = reader.readUInt8();
                controller.splitAttempts += splits;
                controller.ejectAttempts += ejects;
                controller.ejectMarco = Boolean(macro);
                break;
            case 10:
                const message = reader.readUTF16String();
                this.handler.game.chat.broadcast(this.handler.controller, message);
                break;
            case 69:
                const PONG = new ArrayBuffer(1);
                new Uint8Array(PONG)[0] = 69;                
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
            writer.writeUInt16(cell.isDead ? DEAD_CELL_TYPE : cell.type);
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
            if (cell.shouldRemove && cell.eatenBy) eat.push(cell_id);
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
        const writer = new Writer();
        writer.writeUInt8(3);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(controller.name);
        writer.writeUTF16String(controller.skin);
        this.handler.ws.send(writer.finalize(), true);
        
        if (this.handler.controller == controller) {
            const CLEAR_SCREEN = new ArrayBuffer(1);
            new Uint8Array(CLEAR_SCREEN)[0] = 2;
            this.handler.ws.send(CLEAR_SCREEN, true);
            this.lastVisible.clear();
        }
    };

    /** 
     * @param {import("../../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {
        // Igore own chat
        if (controller == this.handler.controller) return;

        const writer = new Writer();
        writer.writeUInt8(10);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(message);

        this.handler.ws.send(writer.finalize(), true);
    }

    onDisconnect(code, reason) {
        this.handler.remove();
    }
}