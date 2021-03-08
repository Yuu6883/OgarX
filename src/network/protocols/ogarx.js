const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");
const DualHandle = require("../../game/dual");

class WebAssemblyPool {

    /** @param {number} size */
    static init(size) {
        /** @type {number[]} */
        this.used = new Array(size).fill(0);
        this.blocks = Array.from({ length: size }, _ => 
            new WebAssembly.Memory({ initial: 16, maximum: 32 })); // 1mb, 2mb
    }

    static get() {
        let index = 0;
        while (this.used[index]) index++;
        if (index >= this.used.length) this.used.push(1);
        else this.used[index] = 1;
        return this.blocks[index];
    }

    /** @param {WebAssembly.Memory} mem */
    static free(mem) {
        const index = this.blocks.indexOf(mem);
        if (index < 0 || index >= this.used.length) return; // ???
        this.used[index] = 0;
    }
}

module.exports = class OgarXProtocol extends Protocol {

    /** @param {DataView} view */
    static handshake(view) {
        const reader = new Reader(view);
        return reader.length >= 7 && // 3 bytes of funni and at least 2 * 2 bytes of zero
            reader.readUInt8() == 69 &&
            reader.readInt16() == 420;
    }

    /** @param {BufferSource} buffer */
    static async init(buffer, pool_size = 10) {
        this.Module = await WebAssembly.compile(buffer);
        WebAssemblyPool.init(pool_size);
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

        this.memory = WebAssemblyPool.get();
        this.wasm = await WebAssembly.instantiate(OgarXProtocol.Module, {
            env: { 
                memory: this.memory,
                get_cell_updated, get_cell_x, get_cell_y, get_cell_r, 
                get_cell_type, get_cell_eatenby 
            }
        });
        this.view = new DataView(this.memory.buffer);

        this.join();
        
        const reader = new Reader(new DataView(initMessage));
        reader.skip(3); // Skip handshake bytes

        this.controller.name = reader.readUTF16String(this.game.options.FORCE_UTF8);
        this.controller.skin = reader.readUTF16String(this.game.options.FORCE_UTF8);
        this.game.emit("join", this.controller);

        if (this.game.options.DUAL_ENABLED) {
            /** @type {DualHandle} */
            this.dual = new DualHandle(this);
            this.dual.controller.name = this.controller.name;
            this.dual.controller.skin = reader.readUTF16String(this.game.options.FORCE_UTF8);
            this.pids.add(this.dual.controller.id);
            this.game.emit("join", this.dual.controller);
        }
        this.sendInitPacket();

        this.showonMinimap = true;
        this.showonLeaderboard = true;
    }

    off() {
        delete this.ws;
        super.off();
        if (this.dual) this.dual.off();
        WebAssemblyPool.free(this.memory);
    }

    sendInitPacket() {
        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUInt8(this.controller.id);
        writer.writeUInt8(this.dual ? this.dual.controller.id : 0);
        writer.writeUInt16(this.game.options.MAP_HW);
        writer.writeUInt16(this.game.options.MAP_HH);
        writer.writeUTF16String(this.game.name);
        this.ws.send(writer.finalize(), true);
    }

    clear() {
        const CLEAR_SCREEN = new ArrayBuffer(1);
        new Uint8Array(CLEAR_SCREEN)[0] = 2;
        this.ws.send(CLEAR_SCREEN, true);
        if (!this.last_vlist_len && !this.curr_vlist_len) return;
        this.wasm.exports.clean(0, this.memory.buffer.byteLength);
    }

    onDrain() {}

    /** @param {DataView} view */
    onMessage(view) {
        const reader = new Reader(view);
        const OP = reader.readUInt8();
        const controller = this.controller;

        switch (OP) {
            case 1:
                controller.name = reader.readUTF16String(this.game.options.FORCE_UTF8);
                controller.skin = reader.readUTF16String(this.game.options.FORCE_UTF8);
                this.game.emit("info", controller);
                if (this.dual) {
                    this.dual.controller.name = controller.name;
                    this.dual.controller.skin = reader.readUTF16String(this.game.options.FORCE_UTF8);
                    this.game.emit("info", this.dual.controller);
                }
                controller.requestSpawn();
                controller.lastSpawnTick = this.game.engine.__now;
                break;
            case 3:
                controller.mouseX = reader.readFloat32();
                controller.mouseY = reader.readFloat32();
                const spectate = reader.readUInt8();
                if (this.alive) {
                    const splits = reader.readUInt8();
                    const ejects = reader.readUInt8();
                    const macro  = reader.readUInt8();
                    const lock   = reader.readUInt8();
                    const s_tab  = reader.readUInt8();
                    controller.splitAttempts += splits;
                    controller.ejectAttempts += ejects;
                    controller.ejectMarco = Boolean(macro);
                    if (lock) controller.toggleLock();
                    if (s_tab) {
                        if (!this.dual) return;
                        if (!controller.alive && !this.dual.controller.alive) {
                            controller.requestSpawn();
                        } else {
                            if (!controller.alive) {
                                controller.requestSpawn();
                            } else if (!this.dual.controller.alive) {
                                this.dual.controller.requestSpawn();
                            } else {
                                this.switchTo(this.dual.controller);                  
                            }
                        }
                    }
                } else { // We are DEAD
                    if (spectate && spectate <= 250) {
                        const c = this.game.controls[spectate];
                        if (!c.handle) break; // ??
                        if (!c.handle.alive) break; // Can't spectate dead handle??
                        this.spectate = c.handle.owner || c.handle;
                    } else if (spectate === 255) {
                        let score = 0;
                        for (const c of this.game.controls) {
                            if (!c.handle) continue;
                            if (c.handle.score > score) {
                                score = c.score;
                                this.spectate = c.handle;
                            }
                        }
                    }
                }
                break;
            case 7:
                controller.autoRespawn = true;
                break;
            case 10:
                const message = reader.readUTF16String(this.game.options.FORCE_UTF8);
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
    }

    onError(message) {
        if (this.ws) this.ws.end(1000, message);
    }

    /** @param {import("../../game/controller")} c */
    switchTo(c) {
        if (!this.dual) return;
        if (this.controller === c) return;
        // Swap controller
        this.dual.controller = this.controller;     
        /** @type {import("../../game/controller")} somehow I have to type this again here vscode dumb */
        this.controller = c;
    }

    onSpawn(c) {
        if (this.dual && this.dual.controller == c) this.switchTo(c);
    }

    onInfo(c) {
        this.sendPlayerInfo(c);
    }

    get alive() {
        if (this.dual) return this.controller.alive || this.dual.controller.alive;
        else return this.controller.alive;
    }

    get score() {
        if (this.dual) return this.controller.score + this.dual.controller.score;
        else return this.controller.score;
    }
    
    get maxScore() {
        if (this.dual) return Math.max(this.controller.maxScore, this.dual.controller.maxScore);
        else return this.controller.maxScore;
    }

    get kills() {
        if (this.dual) return this.controller.kills + this.dual.controller.kills;
        else this.controller.kills;
    }

    /** @param {import("../../game/handle")[]} handles */
    onLeaderboard(handles) {
        const LB_COUNT = 10;
        const count = Math.min(LB_COUNT, handles.length);
        const writer = new Writer();
        writer.writeUInt8(5);
        writer.writeInt16(handles.indexOf(this));
        writer.writeUInt8(count);
        for (let i = 0; i < count; i++)
            writer.writeUInt8(handles[i].controller.id);
        this.ws.send(writer.finalize(), true);
    }

    /** @param {import("../../game/handle")[]} handles */
    onMinimap(handles) {
        const writer = new Writer();
        writer.writeUInt8(6);
        writer.writeUInt8(handles.length);
        for (const h of handles) {
            writer.writeUInt8(h.controller.id);
            writer.writeFloat32(h.controller.viewportX);
            writer.writeFloat32(h.controller.viewportY);
            writer.writeFloat32(h.score);
        }
        this.ws.send(writer.finalize(), true);
    }

    onTick() {
        if (!this.controller) return; // ??????
        if (!this.wasAlive && this.alive) this.actualSpawnTick = this.game.engine.__now;

        const engine = this.game.engine;
        const c1 = this.controller;

        if (this.dual) {
            const c2 = this.dual.controller;

            if (!c1.alive && c2.alive) this.switchTo(c2);
            if (c1.alive && !c2.alive) this.switchTo(c1);
            if (this.wasAlive && !this.alive) {
                c1.lastSpawnTick = c2.lastSpawnTick = engine.__now;
                this.sendStats();
            }
        } else {
            if (this.wasAlive && !this.alive) {
                c1.lastSpawnTick = engine.__now;
                this.sendStats();
            }
        }
        this.wasAlive = this.alive;

        let target = this.controller;
        if (this.alive) this.spectate = null;
        if (this.spectate) {
            // Some other handler will take care of this
            if (this.spectate instanceof OgarXProtocol) return;
            else target = this.spectate.controller;
        }

        const vlist = engine.query(target);
        // Query visible cells from the controller
        this.processVisibleList(vlist, target);
        
        for (const c of this.game.controls) {
            if (!c.handle) continue;
            if (c.handle.alive) {
                c.handle.spectate = null;
                continue;
            }
            if (c.handle.spectate === this) 
                c.handle.processVisibleList(vlist, target);
        }
    }

    /** @param {Uint16Array} vlist */
    processVisibleList(vlist, controller = this.controller) {
        if (!vlist.length) return;
        // Backpressure higher than watermark
        if (this.ws.getBufferedAmount() > this.game.options.SOCKET_WATERMARK) return;

        // Step 1
        this.wasm.exports.move_hashtable();
        // Step 2
        this.wasm.exports.copy(this.last_vlist_ptr, this.curr_vlist_ptr, this.curr_vlist_len * 2);
        // Update ptr and len
        this.last_vlist_len = this.curr_vlist_len;
        this.curr_vlist_ptr = this.last_vlist_ptr + this.last_vlist_len * 2; // 2 bytes per index
        this.curr_vlist_len = vlist.length;
        new Uint16Array(this.memory.buffer, this.curr_vlist_ptr, this.curr_vlist_len).set(vlist);
        
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

        // 1 byte OP + 1 byte pid + 2 bytes cell count + 1 byte linelocked + 
        // 4 bytes score + 8 bytes mouse + 8 bytes viewport + 4 * 2 bytes 0 padding = 33 bytes
        // We don't have to calculate this because serialize returns the write end
        // But this is a good way to verify it wrote as expect
        const buffer_length = 33 + 10 * A_count + 8 * U_count + 4 * E_count + 2 * D_count;
        
        const mem_check = AUED_end_ptr + buffer_length - this.memory.buffer.byteLength;
        if (mem_check > 0) {
            const extra_page = Math.ceil(mem_check / 65536);
            this.memory.grow(extra_page);
            this.view = new DataView(this.memory.buffer);
            console.log(`Growing ${extra_page} page of memory in ogar69 protocol ` +
                `memory for controller(${this.controller.name})`);
        }

        const o = this.game.options;
        let score = controller.score;
        this.dual && (score += this.dual.controller.score);

        // Step 4 serialize
        const buffer_end = this.wasm.exports.serialize(
            controller.id,
            this.game.engine.counters[controller.id].size,
            controller.lockDir,
            score,
            controller.mouseX, controller.mouseY,
            controller.viewportX, controller.viewportY,
            AUED_table_ptr, AUED_table_ptr + 16, AUED_end_ptr,
            -o.MAP_HW, o.MAP_HW, o.MAP_HH, -o.MAP_HH);
        
        const diff = buffer_end - AUED_end_ptr;
        console.assert(diff == buffer_length, "Buffer length must match");

        this.ws.send(this.memory.buffer.slice(AUED_end_ptr, buffer_end), true);
    }

    sendStats() {
        if (!this.maxScore || this.controller.spawn) return;
        const writer = new Writer();
        writer.writeUInt8(7);
        writer.writeUInt32(this.kills);
        writer.writeFloat32(this.maxScore);
        writer.writeFloat32(this.game.engine.__now - this.actualSpawnTick);
        this.ws.send(writer.finalize(), true);
    }

    /** @param {import("../../game/controller")} controller */
    onJoin(controller) {
        if (this.controller == controller) {
            // Send every controller's info to client
            for (const c of this.game.controls) c.handle && this.sendPlayerInfo(c);
            this.clear();
        } else {
            // Send controller info to client since it just joined
            this.sendPlayerInfo(controller);
        }
        // Greetings to same protocol
        if (controller.handle instanceof OgarXProtocol)
            this.onChat(null, `${controller.name} joined the game`);
    }

    /** @param {import("../../game/controller")} controller */
    onLeave(controller) {
        if (controller == this.controller) return;
        // Bye bye to same protocol
        if (controller.handle instanceof OgarXProtocol)
            this.onChat(null, `${controller.name} left the game`);
    }

    /** @param {import("../../game/controller")} controller */
    sendPlayerInfo(controller) {
        if (!controller.name && !controller.skin) return;

        console.log(`sending info#${controller.id} ${controller.name} ${controller.skin}`);

        const writer = new Writer();
        writer.writeUInt8(3);
        writer.writeUInt16(controller.id);
        writer.writeUTF16String(controller.name);
        writer.writeUTF16String(controller.skin);
        this.ws.send(writer.finalize(), true);
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