(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

module.exports = class Controller {
    constructor(id = 0) {
        this.id = id;
        this.name = "";
        this.skin = "";
        this.spawn = false;
        this.alive = false;
        this.spectate = null;
        this.mouseX = 0;
        this.mouseY = 0;
        this.ejectMarco = false;
        this.splitAttempts = 0;
        this.ejectAttempts = 0;
        this.lastEjectTick = 0;
        this.lastSpawnTick = 0;
        this.viewportX = 0;
        this.viewportY = 0;
        this.viewportHW = 0;
        this.viewportHH = 0;
        this.maxScore = 0;
        this.score = 0;
        /** @type {import("./handle")} */
        this.handle = null;
    }

    reset() {
        this.alive = false;
        this.spectate = null;
        this.splitAttempts = 0;
        this.ejectAttempts = 0;
        this.lastEjectTick = 0;
        this.lastSpawnTick = 0;
        this.viewportX = 0;
        this.viewportY = 0;
        this.viewportHW = 0;
        this.viewportHH = 0;
        this.score = 0;
    }
}
},{}],2:[function(require,module,exports){
const Controller = require("./controller");
const Engine = require("../physics/engine");

const MAX_PLAYER = 250;

module.exports = class Game {
    /** 
     * @param {ArrayBuffer} core_buffer
     * @param {typeof import("../physics/engine").DefaultSettings} options 
     */
    constructor(options = {}) {
        this.controls = Array.from({ length: MAX_PLAYER }, (_, i) => new Controller(i));
        this.engine = new Engine(this, options); // TODO
        this.handles = 0;
    }

    /** @param {import("./handle")} handle */
    addHandle(handle) {
        if (this.isFull) handle.onError("Server full");
        if (handle.controller) return;
        let i = 1; // 0 is occupied ig
        while (this.controls[i].handle) i++;
        this.controls[i].handle = handle;
        handle.controller = this.controls[i];
        this.handles++;
    }

    /** @param {import("./handle")} handle */
    removeHandle(handle) {
        if (!handle.controller) return;
        handle.controller.handle = null;
        handle.controller = null;
        this.handles--;
    }

    get isFull() { return this.handles == MAX_PLAYER; }
}
},{"../physics/engine":14,"./controller":1}],3:[function(require,module,exports){
module.exports = class Handle {
    /** @param {import("./game")} game */
    constructor(game) {
        this.game = game;
        /** @type {import("./controller")} */
        this.controller = null; 
    };
    onSpawn() {};
    onUpdate() {};
    /** @param {string} err */
    onError(err) {};
    /**
     * @param {import("./controller")} sender 
     * @param {string} message 
     */
    onChat(sender, message) {};
}
},{}],4:[function(require,module,exports){
module.exports = class Chat {

    /** @param {import("../game/game")} game */
    constructor(game) {
        this.game = game;
    }

    broadcast(controller, message) {
        for (const other of this.game.controls) {
            if (other.handle) {
                other.handle.onChat(controller, message);
            }
        }
    }
}
},{}],5:[function(require,module,exports){
module.exports = class FakeSocket {
    /** @param {MessagePort} port */
    constructor(port) {
        this.port = port;
        this.readyState = WebSocket.OPEN;

        port.onmessage = e => {
            const { data } = e;
            if (data.event === "message") {
                this.onmessage(new DataView(data.message));
            } else if (data.event === "close") {
                this.onclose({ code: data.code, reason: data.message });
            }
        }

        port.start();
        port.postMessage({ event: "open" });

        this.subscribe = this.onmessage = this.onclose = () => {};
    }

    /** @param {BufferSource} buffer */
    send(buffer) {
        this.port.postMessage({ event: "message", message: buffer });
    }

    end(code = 1006, reason = "") {
        this.port.postMessage({ event: "close", code, reason });
    }
}
},{}],6:[function(require,module,exports){
/** @template T */
module.exports = class Protocol {
    /** @param {DataView} view */
    static handshake(view) { return false; }
    /** @param {T} handler */
    constructor(handler) { this.handler = handler; }
    /** @param {DataView} view */
    onMessage(view) {};
    onUpdate() {};
    /** @param {import("../game/controller")} controller */
    onSpawn(controller) {};
    /** 
     * @param {import("../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {};
}
},{}],7:[function(require,module,exports){
module.exports = [require("./ogarx")];
},{"./ogarx":8}],8:[function(require,module,exports){
const Protocol = require("../protocol");
const Reader = require("../reader");
const Writer = require("../writer");

const CLEAR_SCREEN = new ArrayBuffer(1);
new Uint8Array(CLEAR_SCREEN)[0] = 2;

const PONG = new ArrayBuffer(1);
new Uint8Array(PONG)[0] = 69;

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
                // controller.spectate TODO:
                const spectate = reader.readUInt8();
                const splits = reader.readUInt8();
                const ejects = reader.readUInt8();
                const macro = reader.readUInt8();
                controller.splitAttempts += splits;
                controller.ejectAttempts += ejects;
                controller.ejectMarco = Boolean(macro);
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
},{"../protocol":6,"../reader":9,"../writer":12}],9:[function(require,module,exports){
module.exports = class Reader {
    /** 
     * @param {DataView} view
     * @param {boolean} le
     */
    constructor(view, le = true) {
        this.view = view;
        this.offset = 0;
        this.le = le;
    }

    get length() { return this.view.byteLength; }

    readUInt8() {
        return this.view.getUint8(this.offset++);
    }
    readInt8() {
        return this.view.getInt8(this.offset++);
    }
    readUInt16() {
        const a = this.view.getUint16(this.offset, this.le);
        this.offset += 2;
        return a;
    }
    readInt16() {
        const a = this.view.getUint16(this.offset, this.le);
        this.offset += 2;
        return a;
    }
    readUInt32() {
        const a = this.view.getUint32(this.offset, this.le);
        this.offset += 4;
        return a;
    }
    readInt32() {
        const a = this.view.getInt32(this.offset, this.le);
        this.offset += 4;
        return a;
    }
    readFloat32() {
        const a = this.view.getFloat32(this.offset, this.le);
        this.offset += 4;
        return a;
    }
    readFloat64() {
        const a = this.view.getFloat64(this.offset, this.le);
        this.offset += 8;
        return a;
    }
    /** @param {number} count */
    skip(count) {
        this.offset += count;
    }
    readUTF8String() {
        const chars = [];
        while (this.offset < this.view.byteLength) {
            const ch = this.readUInt8();
            if (!ch) break;
            chars.push(String.fromCharCode(ch));
        }
        return chars.join("");
    }
    readUTF16String() {
        const chars = [];
        while (this.offset < this.view.byteLength) {
            const ch = this.readUInt16();
            if (!ch) break;
            chars.push(String.fromCharCode(ch));
        }
        return chars.join("");
    }
}

},{}],10:[function(require,module,exports){
const Handler = require("../game/handle");
const Protocols = require("./protocols");

module.exports = class Socket extends Handler {
    /** 
     * @param {import("../game/game")} game
     * @param {import("uWebSockets.js").WebSocket} ws 
     */
    constructor(game, ws) {
        super(game);
        this.ws = ws;
        this.protocol = null;
        this.ws.subscribe("broadcast");
    }

    /** @param {import("../game/controller")} controller */
    onSpawn(controller) {
        this.protocol && this.protocol.onSpawn(controller);
    }

    onUpdate() {
        this.protocol && this.protocol.onUpdate();
    }

    /** @param {DataView} view */
    onMessage(view) {
        try {
            if (!this.protocol) {
                const Protocol = Protocols.find(p => p.handshake(view));
                if (!Protocol) this.ws.end(1003, "Ambiguous protocol");
                this.protocol = new Protocol(this);
            } else this.protocol.onMessage(view);
        } catch (e) {
            console.error(e);
        }
    }

    /** 
     * @param {import("../game/controller")} controller
     * @param {string} message
     */
    onChat(controller, message) {
        this.protocol && this.protocol.onChat(controller, message);
    }
}
},{"../game/handle":3,"./protocols":7}],11:[function(require,module,exports){
const Socket = require("./socket");
const FakeSocket = require("./fake-socket");

const Chat = require("./chat");

module.exports = class SharedWorkerServer {

    /** @param {import("../game/game")} game */
    constructor(game) {
        this.game = game;
        /** @type {Set<MessagePort>} */
        this.ports = new Set();
    }

    open() {
        self.onconnect = e => {
            console.log("Received connection");
            /** @type {MessagePort} */
            const port = e.source;
            const ws = new FakeSocket(port);
            ws.sock = new Socket(this.game, ws);
            this.game.addHandle(ws.sock);
            this.ports.add(port);

            ws.onmessage = view => ws.sock.onMessage(view);
            ws.onclose = (code, reason) => {
                console.log(`Disconnected: (handle#${ws.sock.controller.id}) code: ${code}, message: ${reason}`);
                this.game.removeHandle(ws);
                this.ports.delete(port);
            }
        }
        this.game.chat = new Chat(this.game);
    }

    close() {
        for (const port of this.ports) port.close();
    }
}
},{"./chat":4,"./fake-socket":5,"./socket":10}],12:[function(require,module,exports){
const PoolSize = 1048576;
const BufferPool = new DataView(new ArrayBuffer(PoolSize));

module.exports = class Writer {
    
    constructor(le = true) {
        this.offset = 0;
        this.le = le;
    }

    /** @param {number} a */
    writeUInt8(a) {
        BufferPool.setUint8(this.offset++, a);
    }
    
    /** @param {number} a */
    writeInt8(a) {
        BufferPool.setInt8(this.offset++, a);
    }

    /** @param {number} a */
    writeUInt16(a) {
        BufferPool.setUint16(this.offset, a, this.le);
        this.offset += 2;
    }

    /** @param {number} a */
    writeInt16(a) {
        BufferPool.setInt16(this.offset, a, this.le);
        this.offset += 2;
    }

    /** @param {number} a */
    writeUInt32(a) {
        BufferPool.setUint32(this.offset, a, this.le);
        this.offset += 4;
    }

    /**
     * @param {number} a
     */
    writeInt32(a) {
        BufferPool.setInt32(this.offset, a, this.le);
        this.offset += 4;
    }

    /** @param {number} a */
    writeFloat32(a) {
        BufferPool.setFloat32(this.offset, a, this.le);
        this.offset += 4;
    }

    /** @param {number} a */
    writeFloat64(a) {
        BufferPool.setFloat64(this.offset, a, this.le);
        this.offset += 8;
    }

    /** @param {string} a */
    writeUTF8String(a) {
        for (let i = 0; i < a.length; i++)
            this.writeUInt8(a.charCodeAt(i));
        this.writeUInt8(0);
    }

    /** @param {string} a */
    writeUTF16String(a) {
        for (let i = 0; i < a.length; i++)
            this.writeUInt16(a.charCodeAt(i));
        this.writeUInt16(0);
    }
    
    finalize() {
        return BufferPool.buffer.slice(0, this.offset);
    }
}

},{}],13:[function(require,module,exports){
const CELL_EXISTS = 0x1;
const CELL_UPDATE = 0x2;
const CELL_INSIDE = 0x4;
const CELL_DEAD   = 0x8;
const CELL_AUTO   = 0x10;
const CELL_REMOVE = 0x20;
const CELL_MERGE  = 0x40;
const CELL_POP    = 0x80;

const TYPES_TO_STRING = { 252: "Mother Cell", 253: "Virus", 254: "Pellet", 255: "Ejected" };
const { QuadNode } = require("./quadtree");

module.exports = class Cell {
    /**
     * @param {DataView} view 
     * @param {number} id
     */
    constructor(view, id) {
        /** @type {QuadNode} */
        this.__root = null;
        this.view = view;
        this.id = id;
    }

    get x() {
        return this.view.getFloat32(0, true);
    }

    set x(value) {
        this.view.setFloat32(0, value, true);
    }

    get y() {
        return this.view.getFloat32(4, true);
    }

    set y(value) {
        this.view.setFloat32(4, value, true);
    }

    get r() {
        return this.view.getFloat32(8, true);
    }

    set r(value) {
        this.view.setFloat32(8, value, true);
    }

    get type() {
        return this.view.getUint8(12);
    }

    set type(value) {
        this.view.setUint8(12, value);
    }

    get flags() {
        return this.view.getUint8(13);
    }

    remove() {
        this.view.setUint8(13, CELL_EXISTS | CELL_REMOVE);
    }
    
    resetFlag() {
        if (this.isDead) this.view.setUint8(13, CELL_DEAD | CELL_EXISTS);
        else this.view.setUint8(13, CELL_EXISTS);
    }

    get exists() {
        return this.view.getUint8(13) & CELL_EXISTS;
    }

    get isUpdated() {
        return this.view.getUint8(13) & CELL_UPDATE;
    }

    set updated(value) {
        value && this.view.setUint8(13, this.view.getUint8(13) | CELL_UPDATE);
    }

    get isInside() {
        this.view.getUint8(13) & CELL_INSIDE;
    }

    get isDead() {
        return this.view.getUint8(13) & CELL_DEAD;
    }

    set dead(value) {
        value && this.view.setUint8(13, this.view.getUint8(13) | CELL_DEAD);
    }

    get shouldAuto() {
        return this.view.getUint8(13) & CELL_AUTO;
    }

    get shouldRemove() {
        return this.view.getUint8(13) & CELL_REMOVE;
    }

    set merge(value) {
        value && this.view.setUint8(13, this.view.getUint8(13) | CELL_MERGE);
    }

    get popped() {
        return this.view.getUint8(13) & CELL_POP;
    }

    get eatenBy() {
        return this.view.getUint16(14, true);
    }

    get age() {
        return this.view.getUint32(16, true);
    }
    
    get boostX() {
        return this.view.getFloat32(20, true);
    }

    set boostX(value) {
        this.view.setFloat32(20, value, true);
    }

    get boostY() {
        return this.view.getFloat32(24, true);
    }

    set boostY(value) {
        this.view.setFloat32(24, value, true);
    }

    get boost() {
        return this.view.getFloat32(28, true);
    }

    set boost(value) {
        this.view.setFloat32(28, value, true);
    }

    toString() {
        // if (!this.exists) return `Cell[None]`;
        const s = TYPES_TO_STRING[this.type];
        return `Cell#${this.id}[type=${s ? `${s}(${this.type})` : `Player#${this.type}`},x=${this.x.toFixed(2)},y=${this.y.toFixed(2)},r=${this.r.toFixed(2)},mass=${(this.r * this.r / 100000).toFixed(1)}k,flags=${this.flags.toString(2).padStart(8, "0")}]`;
    }
}
},{"./quadtree":15}],14:[function(require,module,exports){

if (typeof performance == "undefined") {
    eval(`global.performance = require("perf_hooks").performance;`);
}

const Cell = require("./cell");
const { QuadTree } = require("./quadtree");
const Controller = require("../game/controller");

const DefaultSettings = {
    TPS: 25,
    MAX_CELL_PER_TICK: 50,
    CELL_LIMIT: 65536,
    QUADTREE_MAX_ITEMS: 16,
    QUADTREE_MAX_LEVEL: 16,
    MAP_HW: 32767 >> 2, // MAX signed short
    MAP_HH: 32767 >> 2, // MAX signed short,
    SAFE_SPAWN_TRIES: 64,
    SAFE_SPAWN_RADIUS: 1.5,
    PELLET_COUNT: 1000,
    PELLET_SIZE: 10,
    VIRUS_COUNT: 30,
    VIRUS_SIZE: 100,
    VIRUS_FEED_TIMES: 7,
    VIRUS_SPLIT_BOOST: 780,
    VIRUS_MONOTONE_POP: false,
    MOTHER_CELL_COUNT: 0,
    MOTHER_CELL_SIZE: 149,
    PLAYER_SPEED: 1,
    PLAYER_SPAWN_DELAY: 3000,
    PLAYER_DECAY_SPEED: 0.001,
    PLAYER_DECAY_MIN_SIZE: 1000,
    PLAYER_AUTOSPLIT_SIZE: 1500,
    PLAYER_MAX_CELLS: 16,
    PLAYER_SPAWN_SIZE: 32,
    PLAYER_SPLIT_BOOST: 780,
    PLAYER_SPLIT_DIST: 40,
    PLAYER_SPLIT_CAP: 255,
    PLAYER_MIN_SPLIT_SIZE: 60,
    PLAYER_MIN_EJECT_SIZE: 60,
    PLAYER_NO_MERGE_DELAY: 15,
    PLAYER_NO_COLLI_DELAY: 13,
    PLAYER_MERGE_TIME: 1,
    PLAYER_MERGE_INCREASE: 0.02,
    PLAYER_MERGE_NEW_VER: true,
    PLAYER_VIEW_SCALE: 1,
    PLAYER_DEAD_DELAY: 5,
    EJECT_DISPERSION: 0.3,
    EJECT_SIZE: 38,
    EJECT_LOSS: 43,
    EJECT_BOOST: 780,
    EJECT_DELAY: 80, // ms
    WORLD_RESTART_MULT: 0.75,
    WORLD_KILL_OVERSIZE: false,
    EAT_OVERLAP: 3,
    EAT_MULT: 1.140175425099138
}

const MOTHER_CELL_TYPE = 252;
const VIRUS_TYPE = 253;
const PELLET_TYPE = 254;
const EJECTED_TYPE = 255;

/**
 * x (float) 4 bytes
 * y (float) 4 bytes
 * r (float) 4 bytes
 * type (player_id/cell type) 1 byte
 * flags (dead|inside|updated|exist) 1 byte
 * eatenBy 2 bytes
 * age 4 bytes
 * boost { 3 float } = 12 bytes
 */

const BYTES_PER_CELL = 32;

module.exports = class Engine {

    /** 
     * @param {import("../game/game")} game
     * @param {typeof DefaultSettings} options 
     */
    constructor(game, options) {
        this.game = game;
        this.options = Object.assign({}, DefaultSettings);
        Object.assign(this.options, options);

        /** @type {Set<number>[]} */
        this.counters = Array.from({ length: 256 }, _ => new Set());
        this.shouldRestart = false;
        this.__next_cell_id = 1;
    }

    /** @param {ArrayBuffer|Buffer} */
    async init(core_buffer) {
        if (this.updateInterval) return;

        this.__start = performance.now();
        this.__ltick = performance.now();

        // 60mb ram
        this.memory = new WebAssembly.Memory({ initial: 1000 });

        // Load wasm module
        const module = await WebAssembly.instantiate(
            core_buffer, { env: { 
                memory: this.memory,
                console_log: cell_id => {
                    if (this.cells[cell_id].type > 250) return;
                    console.log(this.cells[cell_id].toString())
                }
            }});

        this.wasm = module.instance.exports;

        // Default CELL_LIMIT uses 2mb ram
        this.cells = Array.from({ length: this.options.CELL_LIMIT }, (_, i) =>
            new Cell(new DataView(this.memory.buffer, i * BYTES_PER_CELL, BYTES_PER_CELL), i));
        this.cellCount = 0;
        
        this.tree = new QuadTree(this.cells, 0, 0, 
            this.options.MAP_HW, this.options.MAP_HH, 
            this.options.QUADTREE_MAX_LEVEL,
            this.options.QUADTREE_MAX_ITEMS);

        this.indices = 0;
        this.indicesPtr =  BYTES_PER_CELL * this.options.CELL_LIMIT;
        this.indicesBuffer = new DataView(this.memory.buffer, this.indicesPtr);
        this.treePtr = BYTES_PER_CELL * this.options.CELL_LIMIT;
        this.treeBuffer = new DataView(this.memory.buffer, this.treePtr);
        this.stackPtr = this.treePtr + 69; // hmm

        /** @type {number[]} */
        this.profiler = [];

        this.debug = false;
    }

    start() {
        if (this.updateInterval) return;
        this.__ltick = performance.now();

        const delay = 1000 / this.options.TPS;
        this.updateInterval = setInterval(() => {
            const now = performance.now();
            this.tick((now - this.__ltick) / delay);
            this.__ltick = now;
            this.profiler.push((performance.now() - now) / delay);
            this.profiler.length > this.options.TPS && this.profiler.shift();
        }, delay);

        if (this.debug) {
            setInterval(() => {
                console.log("Cells: " + this.cellCount + ", " + 
                    (this.profiler.reduce((a, b) => a + b, 0) / this.profiler.length * 100).toFixed(3) + "%");
            }, 1000);
        }
    }

    stop() {
        if (this.updateInterval) clearInterval(this.updateInterval);
        this.updateInterval = null;
    }

    get stopped() { return !this.updateInterval; }

    get __tick() { return Date.now() - this.__start; }

    tick(dt = 1) {

        // Loop through clients
        for (const id in this.game.controls) {
            const controller = this.game.controls[id];
            if (!controller.handle) continue;
            controller.handle.onUpdate();
        }

        // Spawn "some" new cells
        for (let i = 0; i < this.options.MAX_CELL_PER_TICK; i++) {
            if (this.counters[PELLET_TYPE].size < this.options.PELLET_COUNT) {
                const point = this.getSafeSpawnPoint(this.options.PELLET_SIZE);
                this.newCell(point[0], point[1], this.options.PELLET_SIZE, PELLET_TYPE);
            } else break;
        }

        for (let i = 0; i < this.options.MAX_CELL_PER_TICK; i++) {
            if (this.counters[VIRUS_TYPE].size < this.options.VIRUS_COUNT) {
                const point = this.getSafeSpawnPoint(this.options.VIRUS_SIZE);
                this.newCell(point[0], point[1], this.options.VIRUS_SIZE, VIRUS_TYPE);
            } else break;
        }

        for (let i = 0; i < this.options.MAX_CELL_PER_TICK; i++) {
            if (this.counters[MOTHER_CELL_TYPE].size < this.options.MOTHER_CELL_COUNT) {
                const point = this.getSafeSpawnPoint(this.options.MOTHER_CELL_SIZE);
                this.newCell(point[0], point[1], this.options.MOTHER_CELL_SIZE, MOTHER_CELL_TYPE);
            } else break;
        }

        const __now = this.__tick;
        // Handle inputs
        for (const id in this.game.controls) {
            const controller = this.game.controls[id];
            if (!controller.handle) continue;
            
            // Split
            let attempts = this.options.PLAYER_SPLIT_CAP;
            while (controller.splitAttempts > 0 && attempts-- > 0) {
                for (const cell_id of [...this.counters[id]]) {
                    const cell = this.cells[cell_id];
                    if (this.counters[id].size >= this.options.PLAYER_MAX_CELLS) break;
                    if (cell.r < this.options.PLAYER_MIN_SPLIT_SIZE) continue;
                    let dx = controller.mouseX - cell.x;
                    let dy = controller.mouseY - cell.y;
                    let d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 1) dx = 1, dy = 0, d = 1;
                    else dx /= d, dy /= d;
                    this.splitFromCell(cell, cell.r / Math.SQRT2, dx, dy, this.options.PLAYER_SPLIT_BOOST);
                }
                controller.splitAttempts--;
            }

            // Eject
            if (__now >= controller.lastEjectTick + this.options.EJECT_DELAY && (controller.ejectAttempts-- > 0 || controller.ejectMarco)) {
                
                const LOSS = this.options.EJECT_LOSS * this.options.EJECT_LOSS;
                for (const cell_id of [...this.counters[id]]) {
                    const cell = this.cells[cell_id];
                    if (cell.r < this.options.PLAYER_MIN_EJECT_SIZE) continue;
                    let dx = controller.mouseX - cell.x;
                    let dy = controller.mouseY - cell.y;
                    let d = Math.sqrt(dx * dx + dy * dy);
                    if (d < 1) dx = 1, dy = 0, d = 1;
                    else dx /= d, dy /= d;
                    const sx = cell.x + dx * cell.r;
                    const sy = cell.y + dy * cell.r;
                    const a = Math.atan2(dx, dy) - this.options.EJECT_DISPERSION + 
                        Math.random() * 2 * this.options.EJECT_DISPERSION;
                    this.newCell(sx, sy, this.options.EJECT_SIZE, EJECTED_TYPE, 
                        Math.sin(a), Math.cos(a), this.options.EJECT_BOOST);
                    cell.r = Math.sqrt(cell.r * cell.r - LOSS);
                    cell.updated = true;
                }
                controller.lastEjectTick = __now;
            }

            // Idle spectate
            if (!this.counters[id].size && !controller.spawn) {
                controller.viewportX = 0;
                controller.viewportY = 0;
                controller.viewportHW = 1920 / 2;
                controller.viewportHH = 1080 / 2;
                continue;
            }
            
            // Update viewport
            let size = 0, size_x = 0, size_y = 0;
            let x = 0, y = 0, score = 0, factor = 0;
            let min_x = this.options.MAP_HW, max_x = -this.options.MAP_HW;
            let min_y = this.options.MAP_HH, max_y = -this.options.MAP_HH;
            for (const cell_id of this.counters[id]) {
                const cell = this.cells[cell_id];
                x += cell.x * cell.r;
                y += cell.y * cell.r;
                min_x = cell.x < min_x ? cell.x : min_x;
                max_x = cell.x > max_x ? cell.x : max_x;
                min_y = cell.y < min_y ? cell.y : min_y;
                max_y = cell.y > max_y ? cell.y : max_y;
                score += cell.r * cell.r / 100;
                size += cell.r;
            }
            size = size || 1;
            factor = Math.pow(this.counters[id].size + 50, 0.1);
            controller.viewportX = x / size;
            controller.viewportY = y / size;
            size = (factor + 1) * Math.sqrt(score * 100);
            size_x = size_y = Math.max(size, 4000);
            size_x = Math.max(size_x, (controller.viewportX - min_x) * 1.75);
            size_x = Math.max(size_x, (max_x - controller.viewportX) * 1.75);
            size_y = Math.max(size_y, (controller.viewportY - min_y) * 1.75);
            size_y = Math.max(size_y, (max_y - controller.viewportY) * 1.75);
            controller.viewportHW = size_x * this.options.PLAYER_VIEW_SCALE;
            controller.viewportHH = size_y * this.options.PLAYER_VIEW_SCALE;

            controller.score = score;
            controller.maxScore = score > controller.maxScore ? score : controller.maxScore;
            if (controller.score > this.options.MAP_HH * this.options.MAP_HW / 100 * this.options.WORLD_RESTART_MULT) {
                if (this.options.WORLD_KILL_OVERSIZE) {
                    // TODO: kill the player and the cells
                    for (const cell_id of this.counters[id])
                        this.cells[cell_id].remove();

                    this.counters[id].clear();
                } else {
                    this.shouldRestart = true;
                }
            }

            if (controller.spawn && (__now <= this.options.PLAYER_SPAWN_DELAY || 
                    __now >= controller.lastSpawnTick + this.options.PLAYER_SPAWN_DELAY)) {
                controller.spawn = false;
                controller.lastSpawnTick = __now;

                for(const cell_id of this.counters[id]) {
                    const cell = this.cells[cell_id];
                    const deadCell = this.newCell(cell.x, cell.y, cell.r, cell.type, 
                        cell.boostX, cell.boostY, cell.boost, false); // Don't insert it yet
                    deadCell.dead = true;
                    this.tree.swap(cell, deadCell); // Swap it with current cell, no need to update the tree
                    cell.remove();
                }
                this.counters[id].clear();

                const point = this.getSafeSpawnPoint(this.options.PLAYER_SPAWN_SIZE);
                this.newCell(point[0], point[1], this.options.PLAYER_SPAWN_SIZE, ~~id);

                for (const id2 in this.game.controls) {
                    const controller2 = this.game.controls[id2];
                    if (!controller2.handle) continue;
                    controller.handle.onSpawn(controller2);
                    if (controller != controller2) controller2.handle.onSpawn(controller);
                }

                console.log(`Spawned controller#${controller.id} at x: ${point[0]}, y: ${point[1]}`);
            } else controller.spawn = false;

            controller.handle.onUpdate();
            controller.alive = !this.counters[id].size;
        }

        // Boost cells, reset flags, increment age
        this.wasm.update(0, this.treePtr, dt);

        const initial = Math.round(25 * this.options.PLAYER_MERGE_TIME);
        // Move cells based on controller
        for (const id in this.game.controls) {
            const controller = this.game.controls[id];
            if (!controller.handle) continue;

            // Loop through all player cells (not dead)
            for (const cell_id of this.counters[id]) {
                const cell = this.cells[cell_id];

                // Calculate can merge
                if (this.options.PLAYER_MERGE_TIME > 0) {
                    const increase = Math.round(25 * cell.r * this.options.PLAYER_MERGE_INCREASE);
                    const time = Math.max(this.options.PLAYER_NO_MERGE_DELAY, this.options.PLAYER_MERGE_NEW_VER ? 
                        Math.max(initial, increase) : initial + increase);
                    cell.merge = cell.age >= time;                 
                } else cell.merge = cell.age >= this.options.PLAYER_NO_MERGE_DELAY;

                // Move cells
                let dx = controller.mouseX - cell.x;
                let dy = controller.mouseY - cell.y;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < 1) continue; dx /= d; dy /= d;
                // let modifier = 1;
                // if (cell.r > this.options.PLAYER_MIN_SPLIT_SIZE * 5 &&
                //     cell.age <= this.options.PLAYER_NO_COLLI_DELAY) modifier = 2;
                const speed = 88 * Math.pow(cell.r, -0.4396754) * this.options.PLAYER_SPEED;
                const m = Math.min(speed, d) * dt;
                cell.x += dx * m;
                cell.y += dy * m;
            }
        }

        // Decay player cells
        this.wasm.decay_and_auto(0, this.treePtr, dt,
            this.options.PLAYER_AUTOSPLIT_SIZE,
            this.options.PLAYER_DECAY_SPEED,
            this.options.PLAYER_DECAY_MIN_SIZE);
        
        // Autosplit
        for (const cell of this.cells) {
            if (cell.shouldAuto) {
                const cellsLeft = 1 + this.options.PLAYER_MAX_CELLS - this.counters[cell.type].size;
                if (cellsLeft <= 0) continue;
                const splitTimes = Math.min(Math.ceil(cell.r * cell.r / this.options.PLAYER_AUTOSPLIT_SIZE / this.options.PLAYER_AUTOSPLIT_SIZE), cellsLeft);
                const splitSizes = Math.min(Math.sqrt(cell.r * cell.r / splitTimes), this.options.PLAYER_AUTOSPLIT_SIZE);
                for (let i = 1; i < splitTimes; i++) {
                    const angle = Math.random() * 2 * Math.PI;
                    this.splitFromCell(cell, splitSizes, Math.sin(angle), Math.cos(angle), this.options.PLAYER_SPLIT_BOOST);
                }
                cell.r = splitSizes;
                cell.updated = true;
            }
        }

        // Bound & bounce cells
        this.wasm.edge_check(0, this.treePtr,
            -this.options.MAP_HW, this.options.MAP_HW,
            -this.options.MAP_HH, this.options.MAP_HH);

        // Update quadtree
        for (const cell of this.cells) {
            if (!cell.exists || (cell.type > 250 && !cell.isUpdated)) continue; 
            this.tree.update(cell);
        }

        // Sort indices
        this.sortIndices();
        // Serialize quadtree, preparing for collision/eat resolution
        this.serialize();

        const VIRUS_MAX_SIZE = Math.sqrt(this.options.VIRUS_SIZE * this.options.VIRUS_SIZE +
            this.options.EJECT_SIZE * this.options.EJECT_SIZE * this.options.VIRUS_FEED_TIMES);            

        // console.log("resolving");
        // Magic goes here
        this.wasm.resolve(0, 
            this.indicesPtr, this.treePtr, 
            this.treePtr, this.stackPtr,
            this.options.PLAYER_NO_MERGE_DELAY, this.options.PLAYER_NO_COLLI_DELAY,
            this.options.EAT_OVERLAP, this.options.EAT_MULT, VIRUS_MAX_SIZE, 
            this.options.TPS * this.options.PLAYER_DEAD_DELAY);
        // console.log("resolved");

        // Handle pop, update quadtree, remove item
        for (const cell of this.cells) {
            if (!cell.exists) continue;
            if (cell.shouldRemove) {
                this.tree.remove(cell);
                this.counters[cell.type].delete(cell.id);
                this.cellCount--;
            } else if (cell.popped) {
                // TODO: pop the cell OR split virus
                if (cell.type == VIRUS_TYPE) {
                    cell.r = this.options.VIRUS_SIZE;
                    this.tree.update(cell);
                    const angle = Math.atan2(cell.boostX, cell.boostY);
                    this.newCell(cell.x, cell.y, this.options.VIRUS_SIZE, VIRUS_TYPE, 
                        Math.sin(angle), Math.cos(angle), this.options.VIRUS_SPLIT_BOOST);
                } else {
                    const splits = this.distributeCellMass(cell);
                    for (const mass of splits) {
                        const angle = Math.random() * 2 * Math.PI;
                        this.splitFromCell(cell, Math.sqrt(mass * 100),
                            Math.sin(angle), Math.cos(angle), this.options.PLAYER_SPLIT_BOOST);
                    }
                }
            } else if (cell.updated) this.tree.update(cell);
        }

        // No need to reserve space for indices now since we are only going to query it
        this.treePtr = BYTES_PER_CELL * this.options.CELL_LIMIT;
        this.treeBuffer = new DataView(this.memory.buffer, this.treePtr);
        // Serialize again so client can select/query viewport
        this.serialize();

        this.leaderboard = this.game.controls.filter(c => c.score).sort((a, b) => b.score - a.score);
    }

    /**
     * @param {Cell} cell 
     * @param {number} size 
     * @param {number} boostX 
     * @param {number} boostY 
     * @param {number} boost
     */
    splitFromCell(cell, size, boostX, boostY, boost) {
        cell.r = Math.sqrt(cell.r * cell.r - size * size);
        cell.updated = true;
        const x = cell.x + this.options.PLAYER_SPLIT_DIST * boostX;
        const y = cell.y + this.options.PLAYER_SPLIT_DIST * boostY;
        this.newCell(x, y, size, cell.type, boostX, boostY, boost);
    }

    /**
     * @param {Cell} cell
     * @returns {number[]}
     */
    distributeCellMass(cell) {
        let cellsLeft = this.options.PLAYER_MAX_CELLS - this.counters[cell.type].size;
        if (cellsLeft <= 0) return [];
        let splitMin = this.options.PLAYER_MIN_SPLIT_SIZE;
        splitMin = splitMin * splitMin / 100;
        const cellMass = cell.r * cell.r / 100;
        if (this.options.VIRUS_MONOTONE_POP) {
            const amount = Math.min(Math.floor(cellMass / splitMin), cellsLeft);
            const perPiece = cellMass / (amount + 1);
            return new Array(amount).fill(perPiece);
        }
        if (cellMass / cellsLeft < splitMin) {
            let amount = 2, perPiece = NaN;
            while ((perPiece = cellMass / (amount + 1)) >= splitMin && amount * 2 <= cellsLeft)
                amount *= 2;
            return new Array(amount).fill(perPiece);
        }
        const splits = [];
        let nextMass = cellMass / 2;
        let massLeft = cellMass / 2;
        while (cellsLeft > 0) {
            if (nextMass / cellsLeft < splitMin) break;
            while (nextMass >= massLeft && cellsLeft > 1)
                nextMass /= 2;
            splits.push(nextMass);
            massLeft -= nextMass;
            cellsLeft--;
        }
        nextMass = massLeft / cellsLeft;
        return splits.concat(new Array(cellsLeft).fill(nextMass));
    }

    /**
     * @param {number} x 
     * @param {number} y 
     * @param {number} size
     * @param {number} type
     */
    newCell(x, y, size, type, boostX = 0, boostY = 0, boost = 0, insert = true) {
        if (this.cellCount >= this.options.CELL_LIMIT - 1)
            return console.log("CAN NOT SPAWN NEW CELL: " + this.cellCount);

        while (this.cells[this.__next_cell_id].exists)
            this.__next_cell_id = ((this.__next_cell_id + 1) % this.options.CELL_LIMIT) || 1;

        const cell = this.cells[this.__next_cell_id];
        cell.x = x;
        cell.y = y;
        cell.r = size;
        cell.type = type;
        cell.boostX = boostX;
        cell.boostY = boostY;
        cell.boost = boost;
        cell.resetFlag();
        if (insert) {
            this.tree.insert(cell);
            this.counters[cell.type].add(cell.id);
        }
        this.cellCount++;
        return cell;
    }

    /** @param {number} size */
    randomPoint(size) {
        const coord_x = this.options.MAP_HW - size;
        const coord_y = this.options.MAP_HH - size;
        return [2 * Math.random() * coord_x - coord_x, 2 * Math.random() * coord_y - coord_y];
    }

    /** @param {number} size */
    getSafeSpawnPoint(size) {
        let tries = this.options.SAFE_SPAWN_TRIES;
        while (--tries) {
            const point = this.randomPoint(size);
            if (this.wasm.is_safe(0, point[0], point[1],
                size * this.options.SAFE_SPAWN_RADIUS,
                this.treePtr, this.stackPtr) > 0)
                return point;
        }
        return this.randomPoint(size);
    }

    sortIndices() {
        let offset = 0;
        for (let type = 0; type < this.counters.length; type++) {
            // No need to resolve pellet since they don't collide with or eat other cells
            if (type == PELLET_TYPE) continue;
            // No need to sort none player cells
            if (type > 250) {
                for (const cell_id of this.counters[type]) {
                    this.indicesBuffer.setUint16(offset, cell_id, true);
                    offset += 2;
                }
            } else {
                [...this.counters[type]].map(id => this.cells[id]).sort((a, b) => b.r - a.r).forEach(cell => {
                    this.indicesBuffer.setUint16(offset, cell.id, true);
                    offset += 2;
                });
            }
        }
        this.treePtr = this.indicesPtr + offset;
        this.treeBuffer = new DataView(this.memory.buffer, this.treePtr);
    }

    serialize() {
        this.stackPtr = this.tree.serialize(this.treeBuffer) + this.treePtr;
    }

    /** @param {Controller} controller */
    query(controller) {
        // idk why 1, can be anything reasonable
        let listPtr = this.stackPtr + 4 * this.options.QUADTREE_MAX_LEVEL + 20;
        listPtr % 2 && listPtr++; // Multiple of 2

        const length = this.wasm.select(0, this.treePtr, this.treePtr, 
            this.stackPtr, listPtr,
            controller.viewportX - controller.viewportHW, controller.viewportX + controller.viewportHW,
            controller.viewportY - controller.viewportHH, controller.viewportY + controller.viewportHH);
        
        return new Uint16Array(this.memory.buffer, listPtr, length);
    }
}

module.exports.DefaultSettings = DefaultSettings;
},{"../game/controller":1,"./cell":13,"./quadtree":15}],15:[function(require,module,exports){
/**
 * @param {import("./cell")} cell
 * @param {QuadNode} node
 */
const getQuadrant = (cell, node) => {
    if (cell.y - cell.r > node.y) {
        if (cell.x + cell.r < node.x) return 0;
        else if (cell.x - cell.r > node.x) return 1;
    } else if (cell.y + cell.r < node.y) {
        if (cell.x + cell.r < node.x) return 2;
        else if (cell.x - cell.r > node.x) return 3;
    }
    return -1;
}

/**
 * @param {import("./cell")} cell
 * @param {QuadNode} node
 */
const insideQuad = (cell, node) => {
    return cell.x - cell.r > node.l &&
           cell.x + cell.r < node.r &&
           cell.y + cell.r < node.t &&
           cell.y - cell.r > node.b;
}

/**
 * QuadNode serialize to:
 * x, y (2 * 4 = 8 bytes)
 * 4 childpointers (4 * 4 = 16 bytes)
 * count (2 bytes)
 * Total = 26 + 2 * items
 */

class QuadNode {

    /**
     * @param {QuadTree} tree
     * @param {number} x
     * @param {number} y
     * @param {number} hw
     * @param {number} hh
     * @param {QuadNode} root
     */
    constructor(tree, x, y, hw, hh, root) {
        this.__ptr = 0;
        this.tree = tree;
        this.root = root;
        this.level = root ? root.level + 1 : 1;
        this.x = x;
        this.y = y;
        this.hw = hw;
        this.hh = hh;
        this.t = y + hh;
        this.b = y - hh;
        this.l = x - hw;
        this.r = x + hw;
        /** @type {[QuadNode, QuadNode, QuadNode, QuadNode]} */
        this.branches = null;
        /** @type {Set<number>} */
        this.items = new Set();
    }

    split() {
        if (this.branches || 
            this.items.size < this.tree.maxItems ||
            this.level > this.tree.maxLevel) return;
        const qw = this.hw / 2;
        const qh = this.hh / 2;
        this.branches = [
            new QuadNode(this.tree, this.x - qw, this.y + qh, qw, qh, this),
            new QuadNode(this.tree, this.x + qw, this.y + qh, qw, qh, this),
            new QuadNode(this.tree, this.x - qw, this.y - qh, qw, qh, this),
            new QuadNode(this.tree, this.x + qw, this.y - qh, qw, qh, this),
        ];
        for (const cell_id of this.items) {
            const cell = this.tree.cells[cell_id];
            const quadrant = getQuadrant(cell, this);
            if (quadrant < 0) continue;
            this.branches[quadrant].items.add(cell_id);
            cell.__root = this.branches[quadrant];
            this.items.delete(cell_id);
        }
    }

    merge() {
        let node = this;
        while (node != null) {
            if (!node.branches) { node = node.root; continue; }
            if (node.branches[0].branches || node.branches[0].items.size ||
                node.branches[1].branches || node.branches[1].items.size ||
                node.branches[2].branches || node.branches[2].items.size ||
                node.branches[3].branches || node.branches[3].items.size) return;
            node.branches = null;
        }
    }

    __init_ptr() {
        this.__ptr = this.tree.__offset;
        this.tree.__offset += 26 + 2 * this.items.size;
        if (this.branches) {
            this.branches[0].__init_ptr();
            this.branches[1].__init_ptr();
            this.branches[2].__init_ptr();
            this.branches[3].__init_ptr();
        }
    }

    /** @param {DataView} view */
    __write(view) {
        view.setFloat32(this.__ptr,      this.x, true);
        view.setFloat32(this.__ptr + 4,  this.y, true);

        if (this.branches) {
            view.setUint32(this.__ptr + 8,  view.byteOffset + this.branches[0].__ptr, true);
            view.setUint32(this.__ptr + 12, view.byteOffset + this.branches[1].__ptr, true);
            view.setUint32(this.__ptr + 16, view.byteOffset + this.branches[2].__ptr, true);
            view.setUint32(this.__ptr + 20, view.byteOffset + this.branches[3].__ptr, true);
        } else {
            view.setUint32(this.__ptr + 8, 0, true);
        }

        this.tree.__serialized += this.items.size;
        view.setUint16(this.__ptr + 24, this.items.size, true);
        let ptr = this.__ptr + 26;

        for (const cell_id of this.items) {
            view.setUint16(ptr, cell_id, true);
            ptr += 2;
        }

        // console.log(view.buffer.slice(view.byteOffset + this.__ptr, 
        //     view.byteOffset + this.__ptr + 26 + this.items.size * 2));

        if (this.branches) {
            this.branches[0].__write(view);
            this.branches[1].__write(view);
            this.branches[2].__write(view);
            this.branches[3].__write(view);
        }
    }

    print() {
        console.log(`QuadNode at ${this.__ptr} has ${this.items.size} items: ${[...this.items].join(", ")}`)
        if (this.branches) {
            this.branches[0].print();
            this.branches[1].print();
            this.branches[2].print();
            this.branches[3].print();
        }
    }
}

class QuadTree {

    /**
     * @param {import("./cell")[]} cells
     * @param {number} x
     * @param {number} y
     * @param {number} hw
     * @param {number} hh
     * @param {number} maxLevel 
     * @param {number} maxItems
     */
    constructor(cells, x, y, hw, hh, maxLevel, maxItems) {
        this.__offset = 0;
        this.cells = cells;
        this.root = new QuadNode(this, x, y, hw, hh, null);
        this.maxLevel = maxLevel;
        this.maxItems = maxItems;

        this.__serialized = 0;
    }

    /** @param {import("./cell")} cell */
    insert(cell) {
        if (cell.__root) console.log("INSERTING CELL ALREADY IN QUADTREE");
        let node = this.root;
        while (true) {
            if (!node.branches) break;
            const quadrant = getQuadrant(cell, node);
            if (quadrant < 0) break;
            node = node.branches[quadrant];
        }
        cell.__root = node;
        node.items.add(cell.id);
        node.split();
    }

    /** @param {import("./cell")} cell */
    remove(cell) {
        if (!cell.__root) console.log("REMOVING CELL NOT IN QUADTREE");
        if (!cell.__root.items.delete(cell.id)) console.log("ITEM NOT IN QUAD??", cell.__root.items);
        cell.__root.merge();
        cell.__root = null;
    }

    /** @param {import("./cell")} cell */
    update(cell) {
        if (!cell.__root) console.log("UPDATING CELL NOT IN QUADTREE");
        const oldNode = cell.__root;
        let newNode = cell.__root;
        while (true) {
            if (!newNode.root) break;
            newNode = newNode.root;
            if (insideQuad(cell, newNode)) break;
        }
        while (true) {
            if (!newNode.branches) break;
            const quadrant = getQuadrant(cell, newNode);
            if (quadrant < 0) break;
            newNode = newNode.branches[quadrant];
        }
        if (oldNode === newNode) return;
        oldNode.items.delete(cell.id);
        newNode.items.add(cell.id);
        cell.__root = newNode;
        oldNode.merge();
        newNode.split();
    }

    /**
     * Swap cell1 (in the tree) with new cell2
     * @param {import("./cell")} cell1 
     * @param {import("./cell")} cell2 
     */
    swap(cell1, cell2) {
        cell2.__root = cell1.__root;
        cell2.__root.items.delete(cell1.id);
        cell2.__root.items.add(cell2.id);
        cell1.__root = null;
    }

    /** @param {DataView} view */
    serialize(view) {
        this.__offset = 0;
        this.__serialized = 0;
        this.root.__init_ptr();
        this.root.__write(view);
        const end = this.__offset;
        this.__offset = 0;
        return end;
    }

    print() {
        this.root.print();
    }
}

module.exports = { QuadNode, QuadTree };
},{}],16:[function(require,module,exports){
const Server = require("./network/sw-server");
const Game = require("./game/game");


const game = new Game({
    VIRUS_COUNT: 20,
    PLAYER_MAX_CELLS: 256,
    PLAYER_AUTOSPLIT_SIZE: 0,
    PLAYER_SPLIT_CAP: 4,
    VIRUS_MONOTONE_POP: false,
    EJECT_SIZE: 40,
    EJECT_LOSS: 40,
    EJECT_DELAY: 25,
    PELLET_COUNT: 1000,
    PLAYER_SPAWN_SIZE: 1500
});

const server = new Server(game);
const engine = game.engine;
server.open();

(async () => {
    const res = await fetch("/static/wasm/server.wasm");
    const buffer = await res.arrayBuffer();

    await engine.init(buffer);
    engine.start();

    console.log("Shared worker server running");
})();

},{"./game/game":2,"./network/sw-server":11}]},{},[16]);
