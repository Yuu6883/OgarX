const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

module.exports = class OgarXProtocol extends Protocol {

    /** @param {DataView} view */
    static handshake(view) { 
        const reader = new Reader(view);
        return reader.length >= 7 && // 3 bytes of funni and at least 2 * 2 bytes of zero
            reader.readUInt8() == 69 &&
            reader.readInt16() == 420;
    }

    /** @param {BufferSource} buffer */
    static async init(buffer) {
        this.Module = await WebAssembly.compile(buffer);
    }

    /** 
     * @param {import("../../game")} game
     * @param {import("uWebSockets.js").WebSocket} ws 
     * @param {ArrayBuffer} initMessage
     */
    constructor(game, ws, initMessage) {
        super(game);
        this.ws = ws;
        this.init(initMessage);

        this.last_vlist_ptr = 131072; // 2 * 64k or 2 ^ 17
        this.last_vlist_len = 0;
        this.curr_vlist_ptr = 131072; // 2 * 64k or 2 ^ 17
        this.curr_vlist_len = 0;
    }

    /** @param {ArrayBuffer} initMessage */
    async init(initMessage) {
        const { get_cell_updated, get_cell_x, get_cell_y, get_cell_r, 
            get_cell_type, get_cell_eatenby } = this.game.engine.wasm;

        const memory = this.memory = new WebAssembly.Memory({ initial: 16, maximum: 32 }); // 1mb, 2mb
        this.wasm = await WebAssembly.instantiate(OgarXProtocol.Module, {
            env: { 
                memory,
                get_cell_updated, get_cell_x, get_cell_y, get_cell_r, 
                get_cell_type, get_cell_eatenby 
            }
        });
        this.view = new DataView(this.memory.buffer);

        this.join();
        this.sendInitPacket();
        
        const reader = new Reader(new DataView(initMessage));
        reader.skip(3); // Skip handshake bytes

        this.controller.showOnMinimap = true;
        this.controller.name = reader.readUTF16String();
        this.controller.skin = reader.readUTF16String();
        this.game.emit("join", this.controller, true);
    }

    sendInitPacket() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUInt16(this.controller.id);
        writer.writeUInt16(this.game.engine.options.MAP_HW);
        writer.writeUInt16(this.game.engine.options.MAP_HH);
        writer.writeUTF16String(this.game.name);
        this.ws.send(writer.finalize(), true);
    }

    clear() {
        const CLEAR_SCREEN = new ArrayBuffer(1);
        new Uint8Array(CLEAR_SCREEN)[0] = 2;
        this.ws.send(CLEAR_SCREEN, true);
        this.wasm.exports.clean(0, this.memory.buffer.byteLength);
    }

    onDrain() {
    }

    /** @param {DataView} view */
    onMessage(view) {
        const reader = new Reader(view);
        const OP = reader.readUInt8();
        const controller = this.controller;

        switch (OP) {
            case 1:
                controller.name = reader.readUTF16String();
                controller.skin = reader.readUTF16String();
                controller.spawn = true;
                if (controller.alive) this.game.engine.delayKill(controller.id, true);
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
                const lock = reader.readUInt8();
                controller.splitAttempts += splits;
                controller.ejectAttempts += ejects;
                controller.ejectMarco = Boolean(macro);
                if (lock) controller.toggleLock();
                break;
            case 7:
                controller.autoRespawn = true;
                break;
            case 10:
                const message = reader.readUTF16String();
                this.game.emit("chat", this.controller, message);
                break;
            case 69:
                const PONG = new ArrayBuffer(1);
                new Uint8Array(PONG)[0] = 69;                
                this.ws.send(PONG, true); // PING-PONG
                break;
            default:
                console.warn(`Unknown OP: ${OP}`);
        }
    };

    /** @param {import("../../game/controller")[]} controllers */
    onLeaderboard(controllers) {
        const LB_COUNT = 10;
        const count = Math.min(LB_COUNT, controllers.length);

        const writer = new Writer();
        writer.writeUInt8(5);
        writer.writeInt16(controllers.indexOf(this.controller));
        writer.writeUInt8(count);
        for (let i = 0; i < count; i++)
            writer.writeUInt8(controllers[i].id);
        this.ws.send(writer.finalize(), true);
    }

    /** @param {import("../../game/controller")[]} controllers */
    onMinimap(controllers) {
        const writer = new Writer();
        writer.writeUInt8(6);
        writer.writeUInt8(controllers.length);
        for (const c of controllers) {
            writer.writeUInt8(c.id);
            writer.writeFloat32(c.viewportX);
            writer.writeFloat32(c.viewportY);
            writer.writeFloat32(c.score);
        }
        this.ws.send(writer.finalize(), true);
    }

    onTick() {
        if (!this.controller) return; // ??
        const engine = this.game.engine;

        if (this.controller.dead) {
            this.controller.dead = false;
            this.sendStats();
        }

        // Backpressure higher than watermark
        if (this.ws.getBufferedAmount() > engine.options.SOCKET_WATERMARK) return;

        // Query visible cells from the controller
        const vlist = engine.query(this.controller);

        // Step 1
        this.wasm.exports.move_hashtable();
        // Step 2
        this.wasm.exports.copy(this.last_vlist_ptr, this.curr_vlist_ptr, this.curr_vlist_len * 2);
        // Update ptr and len
        this.last_vlist_len = this.curr_vlist_len;
        this.curr_vlist_ptr = this.last_vlist_ptr + this.last_vlist_len * 2; // 2 bytes per index
        this.curr_vlist_len = vlist.length;
        new Uint16Array(this.memory.buffer, this.curr_vlist_ptr, this.curr_vlist_len)
            .set(vlist);
        
        const AUED_table_ptr = this.curr_vlist_ptr + this.curr_vlist_len * 2;
        
        // Step 3
        const AUED_end_ptr = this.wasm.exports.write_AUED(
            0, 65536,
            this.last_vlist_ptr, this.last_vlist_len,
            this.curr_vlist_ptr, this.curr_vlist_len,
            AUED_table_ptr, AUED_table_ptr + 16 // 4 * 4 bytes after the table
        );

        const A_count = this.view.getUint32(AUED_table_ptr + 0,  true);
        const U_count = this.view.getUint32(AUED_table_ptr + 4,  true);
        const E_count = this.view.getUint32(AUED_table_ptr + 8,  true);
        const D_count = this.view.getUint32(AUED_table_ptr + 12, true);

        const vx = this.controller.viewportX;
        const vy = this.controller.viewportY;

        // 1 byte OP + 1byte cell count + 1byte linelocked + 4 bytes score +4 bytes vx + 4 bytes vy + 4 * 2 bytes 0 padding = 23 bytes
        // We don't have to calculate this because serialize returns the write end
        // But this is a good way to verify it wrote as expect
        const buffer_length = 23 + 10 * A_count + 8 * U_count + 4 * E_count + 2 * D_count;
        
        const mem_check = AUED_end_ptr + buffer_length - this.memory.buffer.byteLength;
        if (mem_check > 0) {
            const extra_page = Math.ceil(mem_check / 65536);
            this.memory.grow(extra_page);
            this.view = new DataView(this.memory.buffer);
            console.log(`Growing ${extra_page} page of memory in ogar69 protocol ` +
                `memory for controller(${this.controller.name})`);
        }

        // Step 4 serialize
        const buffer_end = this.wasm.exports.serialize(
            engine.counters[this.controller.id].size,
            this.controller.lockDir,
            this.controller.score,
            vx, vy, 
            AUED_table_ptr, AUED_table_ptr + 16, AUED_end_ptr);
        
        const diff = buffer_end - AUED_end_ptr;
        console.assert(diff == buffer_length, "Buffer length must match");

        this.ws.send(this.memory.buffer.slice(AUED_end_ptr, buffer_end), true);
    }

    sendStats() {
        if (!this.controller.score) return;
        const writer = new Writer();
        writer.writeUInt8(7);
        writer.writeUInt32(this.controller.kills);
        writer.writeFloat32(this.controller.maxScore);
        writer.writeFloat32(this.controller.surviveTime);
        this.ws.send(writer.finalize(), true);
    }

    /** @param {import("../../game/controller")} controller */
    onJoin(controller, bypass = false) {
        if (this.controller == controller) {
            // Send every controller's info to client
            for (const c of this.game.controls) c.handle && c != this.controller && this.onSpawn(c, true);
        } else {
            // Send controller info to client since it just joined
            this.onSpawn(controller, true);
        }

        if (bypass) {
            // Greetings to same protocol
            if (controller.handle instanceof OgarXProtocol)
                this.onChat(null, `${controller.name} joined the game`);
        }
    }

    /** @param {import("../../game/controller")} controller */
    onSpawn(controller, bypass = false) {

        if (!bypass && !controller.updated) return;
        if (!controller.name && !controller.skin) return;

        const writer = new Writer();
        writer.writeUInt8(3);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(controller.name);
        writer.writeUTF16String(controller.skin);
        this.ws.send(writer.finalize(), true);
        
        if (this.controller == controller) this.clear();
    }

    /** 
     * @param {import("../../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {
        // Igore own chat
        if (controller == this.controller) return;

        const writer = new Writer();
        writer.writeUInt8(10);
        writer.writeUInt16(controller ? controller.id : 0); // 0 is server
        writer.writeUTF16String(message);

        this.ws.send(writer.finalize(), true);
    }
}