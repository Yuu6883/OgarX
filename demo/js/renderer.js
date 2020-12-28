(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
module.exports = class Cell {
    /**
     * 
     * @param {DataView} view 
     * @param {number} id 
     */
    constructor(view, id) {
        this.view = view;
        this.id = id;
    }

    get type() { return this.view.getUint32(0, true); }
    get oldX() { return this.view.getFloat32(4, true); }
    get oldY() { return this.view.getFloat32(8, true); }
    get oldSize() { return this.view.getFloat32(12, true); }
    get currX() { return this.view.getFloat32(16, true); }
    get currY() { return this.view.getFloat32(20, true); }
    get currSize() { return this.view.getFloat32(24, true); }
    get netX() { return this.view.getFloat32(28, true); }
    get netY() { return this.view.getFloat32(32, true); }
    get netSize() { return this.view.getFloat32(36, true); }

    toString() {
        return `Cell#${this.id} [type: ${this.type}, x: ${this.netX}, y: ${this.netY}, size: ${this.netSize}]`;
    }

    toObject() {
        return {
            type: this.type,
            oldX: this.oldX,
            oldY: this.oldY,
            oldSize: this.oldSize,
            currX: this.currX,
            currY: this.currY,
            currSize: this.currSize,
            netX: this.netX,
            netY: this.netY,
            netSize: this.netSize
        }
    }
}
},{}],4:[function(require,module,exports){
module.exports = class FakeSocket {
    /** @param {MessagePort} port */
    constructor(port) {
        this.port = port;
        this.readyState = WebSocket.OPEN;

        port.onmessage = e => {
            const { data } = e;
            if (data.event === "message") {
                this.onmessage({ data: data.message });
            } else if (data.event === "error") {
                this.onerror({ message: data.message });
            } else if (data.event === "close") {
                this.onclose({ code: data.code, reason: data.message });
            } else if (data.event === "open") {
                this.onopen();
            }
        }
        port.start();
        this.onopen = this.onmessage = this.onerror = this.onclose = () => {};
    }

    /** @param {BufferSource} buffer */
    send(buffer) {
        this.port.postMessage({ event: "message", message: buffer }, [buffer]);
    }
}
},{}],5:[function(require,module,exports){
module.exports = class Mouse {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(12)) {
        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get x() { return Atomics.load(this.buffer, 0); }
    set x(v) { Atomics.store(this.buffer, 0, v) }

    get y() { return Atomics.load(this.buffer, 1); }
    set y(v) { Atomics.store(this.buffer, 1, v); }

    get scroll() { return Atomics.load(this.buffer, 2); }
    set scroll(v) { Atomics.store(this.buffer, 2, v); }
    
    updateScroll(v) { Atomics.add(this.buffer, 2, v); }
    resetScroll() { return Atomics.exchange(this.buffer, 2, 0); }
}
},{}],6:[function(require,module,exports){
const Reader = require("../../src/network/reader");
const Writer = require("../../src/network/writer");
const FakeSocket = require("./fake-socket");

module.exports = class Protocol {
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        this.pid = 0;
        this.bandwidth = 0;
        this.renderer = renderer;
        
        this.pingInterval = self.setInterval(() => {

            const PING = new ArrayBuffer(1);
            new Uint8Array(PING)[0] = 69;
            this.send(PING);

            // console.log(`Bandwidth: ${~~(this.bandwidth / 1024)}kb/s`);
            this.bandwidth = 0;
        }, 1000);

        const state = this.renderer.state;

        this.mouseInterval = self.setInterval(() => {
            const writer = new Writer();
            writer.writeUInt8(3);
            writer.writeFloat32(this.renderer.cursor.position[0]);
            writer.writeFloat32(this.renderer.cursor.position[1]);

            const currState = state.exchange();

            writer.writeUInt8(currState.spectate);
            writer.writeUInt8(currState.splits);
            writer.writeUInt8(currState.ejects);
            writer.writeUInt8(currState.macro);

            this.send(writer.finalize());

            if (currState.respawn) this.spawn();
        }, 1000 / 30); // TODO?
    }

    connect(urlOrPort) {
        this.disconnect();

        this.ws = typeof urlOrPort == "string" ? new WebSocket(urlOrPort) : new FakeSocket(urlOrPort);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => {
            console.log("Connected to server");
            const writer = new Writer();
            writer.writeUInt8(69);
            writer.writeInt16(420);
            this.ws.send(writer.finalize());
        }

        /** @param {{ data: ArrayBuffer }} e */
        this.ws.onmessage = e => {
            const reader = new Reader(new DataView(e.data));
            const OP = reader.readUInt8();
            this.bandwidth += e.data.byteLength;
            switch (OP) {
                case 1:
                    this.pid = reader.readUInt16();
                    const map = { 
                        width: 2 * reader.readUInt16(), 
                        height: 2 * reader.readUInt16()
                    };
                    console.log(`PID: ${this.pid}, MAP: [${map.width}, ${map.height}]`);
                    const rando = this.renderer.randomPlayer();
                    this.spawn(rando.name, rando.skin);
                    break;
                case 2:
                    console.log("Clear map");
                    this.renderer.clearCells();
                    break;
                case 3:
                    const id = reader.readUInt16();
                    const name = reader.readUTF16String();
                    const skin = reader.readUTF16String();
                    console.log(`Received player data`, { id, name, skin });
                    this.renderer.loadPlayerData({ id, name, skin });
                    break;
                case 4:
                    this.parseCellData(e.data);
                    break;
            }
        }
        this.ws.onerror = e => console.error(e);
        this.ws.onclose = e => console.error(e.code, e.reason);
    }

    send(data) {
        if (this.ws && this.ws.readyState == WebSocket.OPEN)
            this.ws.send(data);
    }

    /** @param {ArrayBuffer} buffer */
    parseCellData(buffer) {
        this.lastPacket = Date.now();

        const core = this.renderer.core;
        const viewport = new DataView(buffer, 1, 8);
        
        this.renderer.target.position[0] = viewport.getFloat32(0, true);
        this.renderer.target.position[1] = viewport.getFloat32(4, true);
        // console.log(`Received packet: ${buffer.byteLength} bytes, viewport: { x: ${view_x}, y: ${view_y} }`);
        core.HEAPU8.set(new Uint8Array(buffer, 9), this.renderer.cellTypesTableOffset);                 
        core.instance.exports.deserialize(0, this.renderer.cellTypesTableOffset);
    }

    disconnect() {
        if (this.ws) this.ws.close();
        this.ws = null;
    }

    /**
     * @param {string} name 
     * @param {string} skin 
     */
    spawn(name = this.lastName, skin = this.lastSkin) {
        this.lastName = name;
        this.lastSkin = skin;

        const writer = new Writer();
        writer.writeUInt8(1);
        writer.writeUTF16String(name);
        writer.writeUTF16String(skin);
        this.send(writer.finalize());
    }
}
},{"../../src/network/reader":1,"../../src/network/writer":2,"./fake-socket":4}],7:[function(require,module,exports){
importScripts("https://cdnjs.cloudflare.com/ajax/libs/gl-matrix/2.8.1/gl-matrix-min.js");

// const { mat4, vec3 } = require("gl-matrix");
const Cell = require("./cell");
const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");
const Protocol = require("./protocol");
const WasmCore = require("./wasm-core");

const { makeProgram, pick, getColor } = require("./util");
const { CELL_VERT_SHADER_SOURCE, CELL_FRAG_PEELING_SHADER_SOURCE,
   NAME_VERT_SHADER_SOURCE, NAME_FRAG_PEELING_SHADER_SOURCE,
   MASS_VERT_SHADER_SOURCE, MASS_FRAG_PEELING_SHADER_SOURCE,
   QUAD_VERT_SHADER_SOURCE, 
   BLEND_BACK_FRAG_SHADER_SOURCE, FINAL_FRAG_SHADER_SOURCE } = require("./shaders");

const ZOOM_SPEED = 5;

const NAME_MASS_MIN = 0.03;
const NAME_SCALE = 0.25;
const NAME_Y_OFFSET = -0.03;

const LONG_MASS = true;
const MASS_GAP = 0;
const MASS_SCALE = 0.25;
const MASS_Y_OFFSET = -0.33;

// Constants
const CELL_TYPES = 256;
const CELL_LIMIT = 2 ** 16; // 65536
const MIN_SIZE = 30;
const SIZE_RANGE = 200;
const POS_RANGE = 65536;

const DEPTH_CLEAR_VALUE = -99999.0;
const MIN_DEPTH = 0.0;
const MAX_DEPTH = 1.0;

const MASS_CHARS       = "0123456789.k".split("");
const MASS_CHARS_COUNT = MASS_CHARS.length;

self.log = false;

class Renderer {
    /** @param {OffscreenCanvas} canvas */
    constructor(canvas) {
        this.canvas = canvas;

        this.cursor = { position: vec3.create() };
        this.target = { position: vec3.create(), scale: 10 };
        this.camera = { position: vec3.create(), scale: 10 };

        /** @type {Map<string, WebGLFramebuffer|WebGLFramebuffer[]>} */
        this.fbo = new Map();
        /** @type {Map<string, WebGLFramebuffer>} */
        this.buffers = new Map();
        /** @type {Map<WebGLProgram, Map<string, WebGLUniformLocation>} */
        this.uniforms = new Map();

        /** @type {Map<number, { skin: WebGLTexture, name: WebGLTexture, name_dim: [width: number, height: number] }>} player data */
        this.players = new Map();

        /** @type {Map<number, [ImageBitmap, ImageBitmap]>} */
        this.updates = new Map();

        this.mouse = new Mouse();
        this.state = new State();
        this.viewport = new Viewport();
        this.core = new WasmCore(this);

        this.proj = mat4.create();
        this.viewbox = { t: 0, b: 0, l: 0, r: 0 };

        this.initLoader();

        this.drawCells = this.drawCells.bind(this);
        this.drawNames = this.drawNames.bind(this);
        this.drawMass  = this.drawMass.bind(this);
    }

    start() {
        if (this.r) return false;
        const loop = now => {
            this.r = requestAnimationFrame(loop);
            try {
                this.render(now);
            } catch (e) { 
                this.stop(); 
                console.error(e);
            }
        };
        this.r = requestAnimationFrame(loop);
        return true;
    }

    stop() {
        if (!this.r) return false;
        this.r = cancelAnimationFrame(this.r);
        return true;
    }

    /** @param {{ id: number, skin: string, name: string }} data */
    loadPlayerData(data) {
        this.loader.postMessage(data);
    }

    initLoader() {
        this.loader = new Worker("loader.js");
        /** @param {{ data: { id: number, skin: ImageBitmap, name: ImageBitmap }}} e */
        this.loader.onmessage = e => this.updates.set(e.data.id, [e.data.skin, e.data.name]);
    }

    /**
     * @param {WebGLProgram} prog 
     * @param {string} name
     */
    loadUniform(prog, name) {
        if (!this.uniforms.has(prog)) this.uniforms.set(prog, new Map());
        this.uniforms.get(prog).set(name, this.gl.getUniformLocation(prog, name));
    }

    /**
     * @param {WebGLProgram} prog 
     * @param {string} name 
     */
    getUniform(prog, name) {
        return this.uniforms.get(prog).get(name);
    }

    async initEngine() {
        const gl = this.gl = this.canvas.getContext("webgl2", { premultipliedAlpha: false });
        if (!gl) return console.error("WebGL2 Not Supported");

        console.log("Loading WASM...");
        await this.core.load();

        console.log("Loading font");
        let font = new FontFace("Bree Serif", "url(/static/font/BreeSerif-Regular.ttf)");
        fonts.add(font);
        await font.load();
        font = new FontFace("Bree Serif", "url(/static/font/Lato-Bold.ttf)");
        fonts.add(font);
        await font.load();
        
        console.log("Loading bot skins & names");
        const res = await fetch("/static/data/bots.json");
        /** @type {{ names: string[], skins: string[] }} */
        this.bots = await res.json();

        this.BYTES_PER_CELL_DATA = this.core.instance.exports.bytes_per_cell_data();
        this.BYTES_PER_RENDER_CELL = this.core.instance.exports.bytes_per_render_cell();

        this.cells = Array.from({ length: CELL_LIMIT }, (_, id) => 
            new Cell(new DataView(this.core.buffer, id * this.BYTES_PER_CELL_DATA, this.BYTES_PER_CELL_DATA), id));

        this.cellTypesTableOffset = CELL_LIMIT * this.BYTES_PER_CELL_DATA;
        console.log(`Table offset: ${this.cellTypesTableOffset}`);
        this.cellBufferOffset = this.cellTypesTableOffset + CELL_TYPES * 2; // Offset table
        console.log(`Render buffers offset: ${this.cellBufferOffset}`);
        this.cellBufferEnd = this.cellBufferOffset + CELL_LIMIT * this.BYTES_PER_RENDER_CELL;
        console.log(`Render buffer end ${this.cellBufferEnd}`);
        this.nameBufferOffset = this.cellBufferEnd + CELL_TYPES * 2;
        this.nameBufferEnd = this.nameBufferOffset + CELL_LIMIT * this.BYTES_PER_RENDER_CELL;
        console.log(`Memory allocated: ${this.core.buffer.byteLength} bytes`);
        
        this.cellTypesTable = new Uint16Array(this.core.buffer, this.cellTypesTableOffset, CELL_TYPES); 
        this.nameTypesTable = new Uint16Array(this.core.buffer, this.cellBufferEnd, CELL_TYPES);

        this.renderBuffer = this.core.HEAPU8.subarray(this.cellBufferOffset, this.cellBufferEnd);
        this.renderBufferView = new DataView(this.core.buffer, this.cellBufferOffset, CELL_LIMIT * this.BYTES_PER_RENDER_CELL);
        /** @type {Map<string, number>} */
        this.massWidthsTable = new Map();

        // 8 MB cache for mass text
        this.massBuffer = new Float32Array(new ArrayBuffer(128 * CELL_LIMIT));

        // console.log(`Supported WebGL2 extensions: `, gl.getSupportedExtensions());
        if (!gl.getExtension("EXT_color_buffer_float")) {
            console.error("FLOAT color buffer not available");
            return;
        }

        gl.enable(gl.BLEND);
        gl.depthMask(false);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const peel_prog1 = this.peel_prog1 = makeProgram(gl, CELL_VERT_SHADER_SOURCE, CELL_FRAG_PEELING_SHADER_SOURCE);
        const peel_prog2 = this.peel_prog2 = makeProgram(gl, NAME_VERT_SHADER_SOURCE, NAME_FRAG_PEELING_SHADER_SOURCE);
        const peel_prog3 = this.peel_prog3 = makeProgram(gl, MASS_VERT_SHADER_SOURCE, MASS_FRAG_PEELING_SHADER_SOURCE);
        const blend_prog = this.blend_prog = makeProgram(gl, QUAD_VERT_SHADER_SOURCE, BLEND_BACK_FRAG_SHADER_SOURCE);
        const final_prog = this.final_prog = makeProgram(gl, QUAD_VERT_SHADER_SOURCE, FINAL_FRAG_SHADER_SOURCE);
        // this.fxaaProg = makeProgram(gl, FXAA_VERT_SHADER_SOURCE, FXAA_FRAG_SHADER_SOURCE);
    
        // Dual depth peeling uniforms
        for (const p of [peel_prog1, peel_prog2, peel_prog3]) {
            this.loadUniform(p, "u_proj");
            this.loadUniform(p, "u_depth");
            this.loadUniform(p, "u_front_color");
        }

        this.loadUniform(peel_prog1, "u_skin");
        this.loadUniform(peel_prog1, "u_circle");
        this.loadUniform(peel_prog1, "u_circle_color");

        this.loadUniform(peel_prog2, "u_dim");
        this.loadUniform(peel_prog2, "u_name");

        this.loadUniform(peel_prog3, "u_uvs");
        this.loadUniform(peel_prog3, "u_mass_char");

        this.loadUniform(blend_prog, "u_back_color");

        this.loadUniform(final_prog, "u_front_color");
        this.loadUniform(final_prog, "u_back_color");

        this.setUpPeelingBuffers();
        this.generateQuadVAO();
        this.generateMassVAO();
        this.generateCircleTexture();
        this.generateMassTextures();
        // await this.genCells();

        this.allocBuffer("cell_data_buffer");
        gl.bindVertexArray(this.quadVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("cell_data_buffer"));
        gl.bufferData(gl.ARRAY_BUFFER, this.renderBuffer, gl.DYNAMIC_DRAW);

        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.vertexAttribDivisor(1, 2);
        gl.enableVertexAttribArray(1);

        gl.useProgram(peel_prog1);
        gl.uniform1i(this.getUniform(peel_prog1, "u_circle"), 10);
        gl.uniform1i(this.getUniform(peel_prog1, "u_skin"), 11);

        gl.useProgram(peel_prog2);
        gl.uniform1i(this.getUniform(peel_prog2, "u_name"), 12);

        gl.useProgram(peel_prog3);
        gl.uniform1i(this.getUniform(peel_prog3, "u_mass_char"), 13);

        gl.useProgram(final_prog);
        gl.uniform1i(this.getUniform(final_prog, "u_back_color"), 6);
        
        gl.activeTexture(gl.TEXTURE11);
        this.empty_texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.empty_texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        this.loadPlayerData({ id: 253, name: "virus", skin: "https://i.imgur.com/OzizeVQ.png" });
        this.start();

        this.protocol = new Protocol(this);
    }

    printCells() {
        console.log("All cells: ");
        const table = [];
        for (const cell of this.cells) {
            if (cell.type && cell.type <= 250) table.push(cell.toObject());
            if (!isFinite(cell.currX)) {
                this.protocol.disconnect();
                this.stop();
            }
        }
        console.table(table);
    }

    clearCells() {
        this.core.HEAPU32.fill(0);
        this.massBuffer.fill(0);
    }

    randomPlayer() {
        return {
            skin: pick(this.bots.skins),
            name: pick(this.bots.names)
        }
    }

    async genCells() {
        for (let i = 1; i < 256; i++)
            this.loadPlayerData({ id: i, ...randomPlayer() });

        this.GEN_CELLS = 65536;
        const view = new DataView(this.core.buffer, 0, this.GEN_CELLS * this.BYTES_PER_CELL_DATA);
        
        const RNGRange = (min, max) => Math.random() * (max - min) + min;
        
        for (let i = 0; i < this.GEN_CELLS; i++) {
            const o = this.BYTES_PER_CELL_DATA * i;
            const type = ~~(255 * Math.random() + 1);
            const x = ~~RNGRange(-POS_RANGE, POS_RANGE) + type / 10;
            const y = ~~RNGRange(-POS_RANGE, POS_RANGE) + type / 10;
            const size = RNGRange(MIN_SIZE, MIN_SIZE + SIZE_RANGE);

            view.setUint32(0 + o , type, true);
            view.setFloat32(4 + o, x, true); // oldX
            view.setFloat32(8 + o, y, true); // oldY
            view.setFloat32(12 + o, size, true); // oldSize
            view.setFloat32(16 + o, x, true); // currX
            view.setFloat32(20 + o, y, true); // currY
            view.setFloat32(24 + o, size, true); // currSize
            view.setFloat32(28 + o, x, true);  // netX
            view.setFloat32(32 + o, y, true);  // netY
            view.setFloat32(36 + o, size, true); // netSize
        }
    }

    /** @param {string} name */
    allocBuffer(name) {
        if (this.buffers.has(name)) throw new Error(`Already allocated buffer "${name}"`);
        const buf = this.gl.createBuffer()
        this.buffers.set(name, buf);
        return buf;
    }

    /** @param {string} name */
    allocFrameBuffer(name, number = 1) {
        if (this.fbo.has(name)) throw new Error(`Already allocated framebuffer "${name}"`);
        this.fbo.set(name, number == 1 ? this.gl.createFramebuffer() : 
            Array.from({ length: number }, _ => this.gl.createFramebuffer()));
    }

    /** Make sure texture units [0-6] are not changed anywhere later in rendering */
    setUpPeelingBuffers() {
        this.allocFrameBuffer("peel_depths", 2);
        this.allocFrameBuffer("peel_colors", 2);
        this.allocFrameBuffer("blend_back");

        const gl = this.gl;
        const FBOTexParam = () => {
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }

        // Texture unit 0-5 are used for depth peeling
        for (let i = 0; i < 2; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.get("peel_depths")[i]);
            const texture_unit_offset = i * 3;

            const depthTarget  = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + texture_unit_offset);
            gl.bindTexture(gl.TEXTURE_2D, depthTarget);
            FBOTexParam();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1920, 1080, 0, gl.RG, gl.FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, depthTarget, 0);

            const frontColorTarget = gl.createTexture();
            gl.activeTexture(gl.TEXTURE1 + texture_unit_offset);
            gl.bindTexture(gl.TEXTURE_2D, frontColorTarget);
            FBOTexParam();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, frontColorTarget, 0);

            const backColorTarget = gl.createTexture();
            gl.activeTexture(gl.TEXTURE2 + texture_unit_offset);
            gl.bindTexture(gl.TEXTURE_2D, backColorTarget);
            FBOTexParam();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, backColorTarget, 0);

            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.get("peel_colors")[i]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frontColorTarget, 0);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, backColorTarget, 0);
        }

        
        // Texture unit 6 is used for blendback
        {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo.get("blend_back"));

            const blendBackTarget = gl.createTexture();
            gl.activeTexture(gl.TEXTURE6);
            gl.bindTexture(gl.TEXTURE_2D, blendBackTarget);
            FBOTexParam();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blendBackTarget, 0);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        
        // Texture unit 7 is potentially used for FXAA
        {
            // const fxaa_tex = gl.getUniformLocation(fxaaProg, "tDiffuse");
            // const fxaa_res = gl.getUniformLocation(fxaaProg, "resolution");
            // const fxaaBuffer = gl.createFramebuffer();
            // gl.bindFramebuffer(gl.FRAMEBUFFER, fxaaBuffer);
            // const fxaaTarget = gl.createTexture();
            // gl.activeTexture(gl.TEXTURE7);
            // gl.bindTexture(gl.TEXTURE_2D, fxaaTarget);
            // FBOTexParam();
            // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
            // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fxaaTarget, 0);
            // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
    }

    clearPeelingBuffers() {
        const gl = this.gl;

        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("blend_back"));
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_depths")[0]);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.clearColor(DEPTH_CLEAR_VALUE, DEPTH_CLEAR_VALUE, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_depths")[1]);
        gl.clearColor(-MIN_DEPTH, MAX_DEPTH, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_colors")[0]);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_colors")[1]);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        // draw depth for first pass to peel
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_depths")[0]);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.blendEquation(gl.MAX);

        for (const prog of [this.peel_prog1, this.peel_prog2, this.peel_prog3]) {
            gl.useProgram(prog);
            gl.uniform1i(this.getUniform(prog, "u_depth"), 3);
            gl.uniform1i(this.getUniform(prog, "u_front_color"), 4);
        }
    }

    generateQuadVAO() {
        const gl = this.gl;

        const vao = this.quadVAO = gl.createVertexArray();
        gl.bindVertexArray(vao);
    
        const quadArray = gl.createBuffer();
    
        gl.bindBuffer(gl.ARRAY_BUFFER, quadArray);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, +1,
            -1, -1,
            +1, -1,
            -1, +1,
            +1, -1,
            +1, +1,
        ]), gl.STATIC_DRAW);
    
        {
            const size = 2;
            const type = gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            gl.vertexAttribPointer(0, size, type, normalize, stride, offset);
            gl.enableVertexAttribArray(0);
        }
    }

    generateMassVAO() {
        const gl = this.gl;

        const vao = this.massVAO = gl.createVertexArray();
        gl.bindVertexArray(vao);
    
        const massArray = this.allocBuffer("mass_buffer");
    
        gl.bindBuffer(gl.ARRAY_BUFFER, massArray);
        gl.bufferData(gl.ARRAY_BUFFER, this.massBuffer, gl.DYNAMIC_DRAW);

        // x|y|size|character|uv.x|uv.y
    
        // a_position
        {
            const size = 4;
            const type = gl.FLOAT;
            const normalize = false;
            const stride = 0;
            const offset = 0;
            gl.vertexAttribPointer(0, size, type, normalize, stride, offset);
            gl.enableVertexAttribArray(0);
        }
    }

    generateCircleTexture() {
        const gl = this.gl;
        // Create circle texture on texture unit 10
        const circle_texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE10);
        gl.bindTexture(gl.TEXTURE_2D, circle_texture);
        // Generating circle
        {
            const CIRCLE_RADIUS = 2048;
            const MARGIN = 10;
            console.log(`Generating ${CIRCLE_RADIUS * 2}x${CIRCLE_RADIUS * 2} circle texture`);
            const temp = new OffscreenCanvas(CIRCLE_RADIUS * 2, CIRCLE_RADIUS * 2);
            const temp_ctx = temp.getContext("2d");
            temp_ctx.fillStyle = "white";
            temp_ctx.arc(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS - MARGIN, 0, 2 * Math.PI, false);
            temp_ctx.fill();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, temp);
                
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        }
    }

    generateMassTextures() {
        console.log("Generating mass characters");

        const gl = this.gl;
        // Create mass texture on texture 13
        const mass_texture_array = gl.createTexture();
        gl.activeTexture(gl.TEXTURE13);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, mass_texture_array);

        const MASS_FONT_WIDTH  = 320;
        const MASS_FONT_HEIGHT = 320;

        {
            gl.texImage3D(
                gl.TEXTURE_2D_ARRAY,
                0,
                gl.RGBA,
                MASS_FONT_WIDTH,
                MASS_FONT_HEIGHT,
                MASS_CHARS_COUNT,
                0,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                null
            );

            const temp = new OffscreenCanvas(MASS_FONT_WIDTH, MASS_FONT_HEIGHT);
            const temp_ctx = temp.getContext("2d");

            temp_ctx.font = "bold 280px Lato";
            temp_ctx.fillStyle = "white";
            temp_ctx.strokeStyle = "black";
            temp_ctx.textAlign = "center";
            temp_ctx.lineWidth = 30;
            temp_ctx.textBaseline = "middle";

            // uv array (4 uv per char, 2 float per uv)
            const UVS = new Float32Array(MASS_CHARS_COUNT * 4 * 2); 
            
            for (let index = 0; index < MASS_CHARS_COUNT; index++) {
                const char = MASS_CHARS[index];
                temp_ctx.clearRect(0, 0, temp.width, temp.height);
                temp_ctx.strokeText(char, temp.width >> 1, temp.height >> 1);
                temp_ctx.fillText(char, temp.width >> 1, temp.height >> 1);
                const w = (temp_ctx.measureText(char).width + 20) / temp.width;
                this.massWidthsTable.set(char, w);
                gl.texSubImage3D(
                    gl.TEXTURE_2D_ARRAY,
                    0,
                    0,
                    0,
                    index,
                    MASS_FONT_WIDTH,
                    MASS_FONT_HEIGHT,
                    1,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    temp);
                
                const x0 = 0.5 - w / 2;
                const x1 = 0.5 + w / 2;
                const y0 = 0;
                const y1 = 1;

                UVS[8 * index + 0] = x0;
                UVS[8 * index + 1] = y0;

                UVS[8 * index + 2] = x1;
                UVS[8 * index + 3] = y0;

                UVS[8 * index + 4] = x0;
                UVS[8 * index + 5] = y1;

                UVS[8 * index + 6] = x1;
                UVS[8 * index + 7] = y1;
            }
            gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        
            gl.useProgram(this.peel_prog3);
            gl.uniform2fv(this.getUniform(this.peel_prog3, "u_uvs"), UVS);
        }
    }

    screenToWorld(out = vec3.create(), x = 0, y = 0) {
        const temp = mat4.create();
        mat4.invert(temp, this.proj);
        vec3.transformMat4(out, [x, -y, 0], temp);
    }

    updateTarget() {
        // Screen space to world space
        this.screenToWorld(this.cursor.position,
            this.mouse.x / this.viewport.width  * 2 - 1, 
            this.mouse.y / this.viewport.height * 2 - 1);

        this.target.scale *= (1 + this.mouse.resetScroll() / 1000);
        this.target.scale = Math.max(this.target.scale, 0.01);
        this.target.scale = Math.min(this.target.scale, 10000);
    }

    // Smooth update camera
    lerpCamera(d = 1 / 60, position) {
        vec3.lerp(this.camera.position, this.camera.position, this.target.position, d);
        this.camera.scale += (this.target.scale - this.camera.scale) * d * ZOOM_SPEED;

        const x = position ? position.x : this.camera.position[0];
        const y = position ? position.y : this.camera.position[1];
        const hw = this.viewport.width  * this.camera.scale / 2;
        const hh = this.viewport.height * this.camera.scale / 2;

        const v = this.viewbox;
        mat4.ortho(this.proj, v.l = x - hw, v.r = x + hw, 
            v.b = y - hh, v.t = y + hh, 0, 1);
    }

    checkViewport() {
        const gl = this.gl;
        if (gl.canvas.width != this.viewport.width || gl.canvas.height != this.viewport.height) {
            gl.canvas.width  = this.viewport.width;
            gl.canvas.height = this.viewport.height;
        }
    }

    drawCells(firstPass) {
        const gl = this.gl;

        gl.bindVertexArray(this.quadVAO);
        gl.activeTexture(gl.TEXTURE11);

        for (let i = 1; i < CELL_TYPES; i++) {
            let begin = this.cellTypesTable[i - 1];
            let end   = this.cellTypesTable[i];
            if (begin == end) continue;
            if (!end) end = 65536;

            const begin_offset = this.cellBufferOffset + begin * this.BYTES_PER_RENDER_CELL;
            const buff = new Float32Array(this.core.buffer, begin_offset, (end - begin) * 3);

            if (i == 253) { // virus
                gl.uniform4f(this.getUniform(this.peel_prog1, "u_circle_color"), 0, 0, 0, 0);    
            } else if (i == 251) { // dead
                gl.uniform4f(this.getUniform(this.peel_prog1, "u_circle_color"), 0.5, 0.5, 0.5, 0.5);
            } else {
                const color = getColor(i);
                gl.uniform4f(this.getUniform(this.peel_prog1, "u_circle_color"), color[0], color[1], color[2], 1);    
            }

            const textures = this.players.get(i) || {};
            
            gl.bindTexture(gl.TEXTURE_2D, textures.skin || this.empty_texture);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("cell_data_buffer"));
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, buff);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, (end - begin) * 2);
        }
    }

    drawNames(firstPass) {
        const gl = this.gl;

        gl.bindVertexArray(this.quadVAO);
        gl.activeTexture(gl.TEXTURE12);

        for (let i = 1; i < CELL_TYPES; i++) {

            if (!this.players.has(i)) continue;
            let begin = this.nameTypesTable[i - 1];
            let end   = this.nameTypesTable[i];
            if (begin == end) continue;
            if (!end) end = 65536;

            const textures = this.players.get(i);
            if (!textures.name || !textures.name_dim) continue;

            const begin_offset = this.nameBufferOffset + begin * this.BYTES_PER_RENDER_CELL;
            const buff = new Float32Array(this.core.buffer, begin_offset, (end - begin) * 3);

            gl.uniform4f(this.getUniform(this.peel_prog2, "u_dim"), 
                textures.name_dim[0], textures.name_dim[1], NAME_SCALE, NAME_Y_OFFSET);
            
            gl.bindTexture(gl.TEXTURE_2D, textures.name);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("cell_data_buffer"));
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, buff);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, (end - begin) * 2);
        }
    }

    drawMass(firstPass) {
        const gl = this.gl;
        gl.bindVertexArray(this.massVAO);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("mass_buffer"));
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.renderMassBuffer);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);

        gl.drawArrays(gl.TRIANGLES, 0, this.renderMassBuffer.length >> 2);
    }

    /** @param {Float32Array} buffer */
    buildMassBuffer(buffer) {
        // TODO: make this function in wasm
        let write_offset = 0;

        for (let o = 0; o < buffer.length; o += 4) { // 4 floats per render mass
            const x = buffer[o];
            const y = buffer[o + 1];
            const size = buffer[o + 2];
            const mass = LONG_MASS ? Math.floor(buffer[o + 3]).toString() : "";
            
            let width = (mass.length - 1) * MASS_GAP * MASS_SCALE;

            for (let i = 0; i < mass.length; i++) 
                width += MASS_SCALE * this.massWidthsTable.get(mass[i]);

            let w = -width / 2;
            for (let i = 0; i < mass.length; i++) {
                const char_uv_offset = mass[i] == "." ? 10 : (mass[i] == "k" ? 11 : ~~mass[i]);
                const char_width = this.massWidthsTable.get(mass[i]);

                const x0 = w * size;
                const x1 = x0 + MASS_SCALE * char_width * size;
                const y0 = (+0.5 * MASS_SCALE + MASS_Y_OFFSET) * size;
                const y1 = (-0.5 * MASS_SCALE + MASS_Y_OFFSET) * size;

                w += MASS_SCALE * char_width + MASS_GAP;

                this.massBuffer[write_offset++] = x + x0;
                this.massBuffer[write_offset++] = y + y0;
                this.massBuffer[write_offset++] = size;
                this.massBuffer[write_offset++] = 4 * char_uv_offset + 0;

                this.massBuffer[write_offset++] = x + x1;
                this.massBuffer[write_offset++] = y + y0;
                this.massBuffer[write_offset++] = size;
                this.massBuffer[write_offset++] = 4 * char_uv_offset + 1;

                this.massBuffer[write_offset++] = x + x0;
                this.massBuffer[write_offset++] = y + y1;
                this.massBuffer[write_offset++] = size;
                this.massBuffer[write_offset++] = 4 * char_uv_offset + 2;
                
                this.massBuffer[write_offset++] = x + x1;
                this.massBuffer[write_offset++] = y + y0;
                this.massBuffer[write_offset++] = size;
                this.massBuffer[write_offset++] = 4 * char_uv_offset + 1;

                this.massBuffer[write_offset++] = x + x0;
                this.massBuffer[write_offset++] = y + y1;
                this.massBuffer[write_offset++] = size;
                this.massBuffer[write_offset++] = 4 * char_uv_offset + 2;

                this.massBuffer[write_offset++] = x + x1;
                this.massBuffer[write_offset++] = y + y1;
                this.massBuffer[write_offset++] = size;
                this.massBuffer[write_offset++] = 4 * char_uv_offset + 3;
            }
        }
        this.renderMassBuffer = this.massBuffer.subarray(0, write_offset);
    }

    /** @param {number} now */
    render(now) {
        
        if (!this.lastTimestamp) {
            this.lastTimestamp = now;
            return;
        }

        const delta = now - this.lastTimestamp;
        this.lastTimestamp = now;

        const gl = this.gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        const NUM_PASS = 2;
        let offsetBack;
        this.clearPeelingBuffers();
        
        this.cellTypesTable.fill(0);
        this.nameTypesTable.fill(0);

        const lerp = this.protocol.lastPacket ? (Date.now() - this.protocol.lastPacket) / 120 : 0;
        // console.log(`Now: ${now}, lastUpdate: ${this.socket.lastPacket}`);
        // console.log(`lerp: ${lerp}`);

        const cell_count = this.core.instance.exports.draw_cells(0, 
            this.cellTypesTableOffset, 
            this.cellBufferOffset, lerp,
            this.viewbox.t, this.viewbox.b, this.viewbox.l, this.viewbox.r);
        
        let text_count = 0;
        
        this.updateTarget();

        let position = null;
        if (this.protocol.pid) {
            let begin = this.cellTypesTable[this.protocol.pid - 1];
            let end   = this.cellTypesTable[this.protocol.pid];
            if (begin != end) {
                if (!end) end = 65536;
                if (end - begin == 1) {
                    const x = this.renderBufferView.getFloat32(begin * 3, true);
                    const y = this.renderBufferView.getFloat32(begin * 3 + 4, true);
                    // position = { x, y };
                }
            }
        }
        this.lerpCamera(delta / 120, position);
        this.checkViewport();

        // console.log(`x: ${this.cells[11].currX}, v_x: ${this.viewbox.l}`);

        const progs = [this.peel_prog1];
        const funcs = [this.drawCells];

        // Configurable if we want to draw mass
        if (true) {
            text_count = this.core.instance.exports.draw_text(0,
                this.cellTypesTableOffset, // end of cell buffer
                this.cellBufferEnd,  // table offset
                this.nameBufferOffset, // name buffer offset
                this.nameBufferEnd, // mass buffer offset
                NAME_MASS_MIN,
                this.viewbox.t, this.viewbox.b, this.viewbox.l, this.viewbox.r);

            progs.push(this.peel_prog2);
            funcs.push(this.drawNames);
            this.buildMassBuffer(new Float32Array(this.core.buffer, this.nameBufferEnd, text_count * 4));
            progs.push(this.peel_prog3);
            funcs.push(this.drawMass);
        }

        offsetBack = this.depthPeelRender(NUM_PASS, progs, funcs);

        if (self.log) console.log(`Drawing ${text_count} text, ${cell_count} cells`);
        
        // Final prog
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.final_prog);
        gl.uniform1i(this.getUniform(this.final_prog, "u_front_color"), offsetBack + 1);

        // Draw to screen
        gl.bindVertexArray(this.quadVAO);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        log = false;

        // FXAA prog
        // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // gl.clearColor(0, 0, 0, 1);
        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // gl.useProgram(fxaaProg);

        // gl.bindVertexArray(vao);
        // gl.drawArrays(gl.TRIANGLES, 0, 6);
        // this.stop();
        // setTimeout(() => this.stop(), 3000);

        if (this.updates.size) {
            gl.activeTexture(gl.TEXTURE11);
            let limit = 0;
            for (const [id, v] of this.updates.entries()) {
                this.uploadPlayerTextures(id, v[0], v[1]);
                this.updates.delete(id);
                if (++limit > 2) break;
            }
        }
    }

    uploadTexture(texture, bitmap) {
        const gl = this.gl;
        if (!bitmap) return;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        bitmap.close();
    }
    
    /** @param {ImageBitmap} skin_bitmap @param {ImageBitmap} name_bitmap */
    uploadPlayerTextures(id = 0, skin_bitmap, name_bitmap) {
        const gl = this.gl;
        const textures = this.players.has(id) ? this.players.get(id) : 
            { skin: skin_bitmap && gl.createTexture(), 
              name: name_bitmap && gl.createTexture() };

        if (name_bitmap) textures.name_dim = [name_bitmap.width / 512, name_bitmap.height / 512];

        console.log(`Player Textures: [PID: ${id}, SKIN: (${skin_bitmap.width}, ${skin_bitmap.height}), ` +
            ` NAME: (${name_bitmap.width}, ${name_bitmap.height}) ]`);

        this.uploadTexture(textures.skin, skin_bitmap);
        this.uploadTexture(textures.name, name_bitmap);
        this.players.set(id, textures);
    }

    /**  @param {WebGLProgram[]} progs @param {(() => void)[]} funcs */
    depthPeelRender(passes = 4, progs, funcs) {
        const gl = this.gl;

        for (let i in progs) {
            gl.useProgram(progs[i]);
            gl.uniformMatrix4fv(this.getUniform(progs[i], "u_proj"), false, this.proj);
            funcs[i](true);
        }

        let readId, writeId;
        let offsetRead, offsetBack;

        // Dual depth peeling passes
        for (let pass = 0; pass < passes; pass++) {
            readId = pass % 2;
            writeId = 1 - readId;  // ping-pong: 0 or 1
            
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_depths")[writeId]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.clearColor(DEPTH_CLEAR_VALUE, DEPTH_CLEAR_VALUE, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_colors")[writeId]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("peel_depths")[writeId]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
            gl.blendEquation(gl.MAX);

            // update texture uniform
            offsetRead = readId * 3;
            
            for (let i in progs) {
                gl.useProgram(progs[i]);
                gl.uniform1i(this.getUniform(progs[i], "u_depth"), offsetRead);
                gl.uniform1i(this.getUniform(progs[i], "u_front_color"), offsetRead + 1);
                // draw geometry
                funcs[i]();
            }

            // blend back color separately
            offsetBack = writeId * 3;
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo.get("blend_back"));
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(this.blend_prog);
            gl.uniform1i(this.getUniform(this.blend_prog, "u_back_color"), offsetBack + 2);
            gl.bindVertexArray(this.quadVAO);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        return offsetBack;
    }
}

self.addEventListener("message", async function(e) {
    const { data } = e;
    const renderer = self.r = new Renderer(data.offscreen);
    renderer.mouse.setBuffer(data.mouse);
    renderer.state.setBuffer(data.state);
    renderer.viewport.setBuffer(data.viewport);
    await renderer.initEngine();

    renderer.protocol.connect(data.server || "ws://localhost:3000");
}, { once: true });

module.exports = Renderer;
},{"./cell":3,"./mouse":5,"./protocol":6,"./shaders":8,"./state":9,"./util":10,"./viewport":11,"./wasm-core":12}],8:[function(require,module,exports){
module.exports.CELL_VERT_SHADER_SOURCE = 
`#version 300 es
precision highp float;

uniform mat4 u_proj;

layout(location=0) in vec2 a_position;
layout(location=1) in vec3 a_data;

out vec2 v_texcoord;

void main() {

    vec4 world_pos = vec4(a_position * a_data.z + a_data.xy, -1.0 / pow(a_data.z, 0.333f), 1.0);
    gl_Position = u_proj * world_pos;

    // Map from -1 to 1 -> 0 to 1
    v_texcoord = (vec2(a_position.x, -a_position.y) + 1.0) / 2.0;
}
`;

module.exports.CELL_FRAG_PEELING_SHADER_SOURCE = 
`#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

#define MAX_DEPTH 99999.0

uniform vec4 u_circle_color;

uniform sampler2D u_skin;
uniform sampler2D u_circle;

uniform sampler2D u_depth;
uniform sampler2D u_front_color;

in vec2 v_texcoord;

layout(location=0) out vec2 depth;  // RG32F, R - negative front depth, G - back depth
layout(location=1) out vec4 frontColor;
layout(location=2) out vec4 backColor;

void main() {

    float fragDepth = gl_FragCoord.z;   // 0 - 1

    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    vec2 lastDepth = texelFetch(u_depth, fragCoord, 0).rg;
    vec4 lastFrontColor = texelFetch(u_front_color, fragCoord, 0);

    // depth value always increases
    // so we can use MAX blend equation
    depth.rg = vec2(-MAX_DEPTH);

    // front color always increases
    // so we can use MAX blend equation
    frontColor = lastFrontColor;

    // back color is separately blend afterwards each pass
    backColor = vec4(0.0);

    float nearestDepth = -lastDepth.x;
    float furthestDepth = lastDepth.y;
    float alphaMultiplier = 1.0 - lastFrontColor.a;
    vec4 circle = texture(u_circle, v_texcoord);

    if (fragDepth < nearestDepth || fragDepth > furthestDepth || circle.a == 0.0f) {
        // Skip this depth since it's been peeled.
        return;
    }

    if (fragDepth > nearestDepth && fragDepth < furthestDepth) {
        // This needs to be peeled.
        // The ones remaining after MAX blended for 
        // all need-to-peel will be peeled next pass.
        depth.rg = vec2(-fragDepth, fragDepth);
        return;
    }
    vec4 skin = texture(u_skin, v_texcoord);
    vec4 color = vec4(mix(u_circle_color.rgb * u_circle_color.a, skin.rgb, skin.a), 
        mix(skin.a, circle.a, u_circle_color.a));

    if (fragDepth == nearestDepth) {
        frontColor.rgb += color.rgb * color.a * alphaMultiplier;
        frontColor.a = 1.0 - alphaMultiplier * (1.0 - color.a);
    } else {
        backColor += color;
    }
}
`;

module.exports.NAME_VERT_SHADER_SOURCE = 
`#version 300 es
precision highp float;

uniform mat4 u_proj;
uniform vec4 u_dim;

layout(location=0) in vec2 a_position;
layout(location=1) in vec3 a_data;

out vec2 v_texcoord;

void main() {
    vec2 obj_pos = a_position * u_dim.xy * u_dim.z + vec2(0, u_dim.w);
    vec4 world_pos = vec4(obj_pos * a_data.z + a_data.xy, -1.0 / pow(a_data.z, 0.333f), 1.0);
    gl_Position = u_proj * world_pos;

    v_texcoord = (vec2(a_position.x, -a_position.y) + 1.0) / 2.0;
}
`;

module.exports.NAME_FRAG_PEELING_SHADER_SOURCE = 
`#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;

#define MAX_DEPTH 99999.0

uniform sampler2D u_name;

uniform sampler2D u_depth;
uniform sampler2D u_front_color;

in vec2 v_texcoord;

layout(location=0) out vec2 depth;  // RG32F, R - negative front depth, G - back depth
layout(location=1) out vec4 frontColor;
layout(location=2) out vec4 backColor;

void main() {
    float fragDepth = gl_FragCoord.z;   // 0 - 1

    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    vec2 lastDepth = texelFetch(u_depth, fragCoord, 0).rg;
    vec4 lastFrontColor = texelFetch(u_front_color, fragCoord, 0);

    // depth value always increases
    // so we can use MAX blend equation
    depth.rg = vec2(-MAX_DEPTH);

    // front color always increases
    // so we can use MAX blend equation
    frontColor = lastFrontColor;

    // back color is separately blend afterwards each pass
    backColor = vec4(0.0);

    float nearestDepth = -lastDepth.x;
    float furthestDepth = lastDepth.y;
    float alphaMultiplier = 1.0 - lastFrontColor.a;

    vec4 color = texture(u_name, v_texcoord);

    if (fragDepth < nearestDepth || fragDepth > furthestDepth || color.a == 0.0f) {
        // Skip this depth since it's been peeled.
        return;
    }

    if (fragDepth > nearestDepth && fragDepth < furthestDepth) {
        // This needs to be peeled.
        // The ones remaining after MAX blended for 
        // all need-to-peel will be peeled next pass.
        depth.rg = vec2(-fragDepth, fragDepth);
        return;
    }

    if (fragDepth == nearestDepth) {
        frontColor.rgb += color.rgb * color.a * alphaMultiplier;
        frontColor.a = 1.0 - alphaMultiplier * (1.0 - color.a);
    } else {
        backColor += color;
    }
}
`;

module.exports.MASS_VERT_SHADER_SOURCE = 
`#version 300 es
precision highp float;
precision highp int;

uniform mat4 u_proj;
uniform vec2 u_uvs[48];

layout(location=0) in vec4 a_position;

out vec2 v_texcoord;
flat out int character;

void main() {
    vec4 world_pos = vec4(a_position.xy, -1.0 / pow(a_position.z, 0.333f), 1.0);
    gl_Position = u_proj * world_pos;
    character = int(a_position.w) >> 2;
    v_texcoord = u_uvs[int(a_position.w)];
}
`;

module.exports.MASS_FRAG_PEELING_SHADER_SOURCE = 
`#version 300 es

precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;

#define MAX_DEPTH 99999.0

uniform sampler2DArray u_mass_char;

uniform sampler2D u_depth;
uniform sampler2D u_front_color;

in vec2 v_texcoord;
flat in int character;

layout(location=0) out vec2 depth;  // RG32F, R - negative front depth, G - back depth
layout(location=1) out vec4 frontColor;
layout(location=2) out vec4 backColor;

void main() {
    float fragDepth = gl_FragCoord.z;   // 0 - 1

    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    vec2 lastDepth = texelFetch(u_depth, fragCoord, 0).rg;
    vec4 lastFrontColor = texelFetch(u_front_color, fragCoord, 0);

    // depth value always increases
    // so we can use MAX blend equation
    depth.rg = vec2(-MAX_DEPTH);

    // front color always increases
    // so we can use MAX blend equation
    frontColor = lastFrontColor;

    // back color is separately blend afterwards each pass
    backColor = vec4(0.0);

    float nearestDepth = -lastDepth.x;
    float furthestDepth = lastDepth.y;
    float alphaMultiplier = 1.0 - lastFrontColor.a;

    vec4 color = texture(u_mass_char, vec3(v_texcoord, character));

    if (fragDepth < nearestDepth || fragDepth > furthestDepth || color.a == 0.0f) {
        // Skip this depth since it's been peeled.
        return;
    }

    if (fragDepth > nearestDepth && fragDepth < furthestDepth) {
        // This needs to be peeled.
        // The ones remaining after MAX blended for 
        // all need-to-peel will be peeled next pass.
        depth.rg = vec2(-fragDepth, fragDepth);
        return;
    }

    if (fragDepth == nearestDepth) {
        frontColor.rgb += color.rgb * color.a * alphaMultiplier;
        frontColor.a = 1.0 - alphaMultiplier * (1.0 - color.a);
    } else {
        backColor += color;
    }
}
`;

module.exports.QUAD_VERT_SHADER_SOURCE = 
`#version 300 es
layout(location=0) in vec4 aPosition;
void main() {
    gl_Position = aPosition;
}`;

module.exports.BLEND_BACK_FRAG_SHADER_SOURCE =
`#version 300 es
precision highp float;

uniform sampler2D u_back_color;

out vec4 fragColor;
void main() {
    fragColor = texelFetch(u_back_color, ivec2(gl_FragCoord.xy), 0);
    if (fragColor.a == 0.0) { 
        discard;
    }
}
`;

module.exports.FINAL_FRAG_SHADER_SOURCE = 
`#version 300 es
precision highp float;

uniform sampler2D u_front_color;
uniform sampler2D u_back_color;

out vec4 fragColor;
void main() {
    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    vec4 frontColor = texelFetch(u_front_color, fragCoord, 0);
    vec4 backColor = texelFetch(u_back_color, fragCoord, 0);
    float alphaMultiplier = 1.0 - frontColor.a;

    fragColor = vec4(
        frontColor.rgb + alphaMultiplier * backColor.rgb,
        frontColor.a + backColor.a
    );
}`;
},{}],9:[function(require,module,exports){
module.exports = class State {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(5)) {
        this.sharedBuffer = buf;
        this.buffer = new Uint8Array(this.sharedBuffer);
    }

    get spectate() { return Atomics.load(this.buffer, 0); }
    set spectate(v) { Atomics.store(this.buffer, 0, v) }

    get splits() { return Atomics.load(this.buffer, 1); }
    set splits(v) { Atomics.add(this.buffer, 1, v); }

    get ejects() { return Atomics.load(this.buffer, 2); }
    set ejects(v) { Atomics.add(this.buffer, 2, v); }

    get macro() { return Atomics.load(this.buffer, 3); }
    set macro(v) { Atomics.store(this.buffer, 3, v); }

    get respawn() { return Atomics.load(this.buffer, 4); }
    set respawn(v) { Atomics.store(this.buffer, 4, v); }

    exchange() {
        return {
            spectate: Atomics.exchange(this.buffer, 0, 0),
            splits: Atomics.exchange(this.buffer, 1, 0),
            ejects: Atomics.exchange(this.buffer, 2, 0),
            macro: this.macro,
            respawn: Atomics.exchange(this.buffer, 4, 0)
        }
    }
}
},{}],10:[function(require,module,exports){
/** @template T @param {T[]} array */
module.exports.pick = array => array[~~(Math.random() * array.length)];

/**
* @param {WebGL2RenderingContext} gl
* @param {string} vs_src
* @param {string} fs_src
*/
module.exports.makeProgram = (gl, vs_src, fs_src) => {
   const vs = gl.createShader(gl.VERTEX_SHADER);
   const fs = gl.createShader(gl.FRAGMENT_SHADER);

   gl.shaderSource(vs, vs_src);
   gl.shaderSource(fs, fs_src);

   gl.compileShader(vs);
   gl.compileShader(fs);
   
   const prog = gl.createProgram();
   gl.attachShader(prog, vs);
   gl.attachShader(prog, fs);
   gl.linkProgram(prog);

   if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(`vs info-log: ${gl.getShaderInfoLog(vs)}\n` +
                     `info-log: ${gl.getShaderInfoLog(fs)}`);
        throw new Error(`prog link failed: ${gl.getProgramInfoLog(prog)}`);
   }

   return prog;
}

const COLORS = [
    [255,0,0],
    [255,128,0],
    [255,255,0],
    [128,255,0],
    [0,255,0],
    [0,255,128],
    [0,255,255],
    [0,128,255],
    [127,0,255],
    [255,0,255],
    [255,0,127]].map(rgb => rgb.map(c => c / 255));

module.exports.getColor = id => COLORS[id % COLORS.length];
},{}],11:[function(require,module,exports){
module.exports = class Viewport {
    constructor () {
        this.setBuffer();
    }

    setBuffer(buf = new SharedArrayBuffer(8)) {
        this.sharedBuffer = buf;
        this.buffer = new Int32Array(this.sharedBuffer);
    }

    get width() { return Atomics.load(this.buffer, 0); }
    set width(v) { Atomics.store(this.buffer, 0, v) }

    get height() { return Atomics.load(this.buffer, 1); }
    set height(v) { Atomics.store(this.buffer, 1, v); }
}
},{}],12:[function(require,module,exports){
module.exports = class WasmCore {
    /** @param {import("./renderer")} renderer */
    constructor(renderer) {
        this.renderer = renderer;
    }
    async load(page = 1024) {
        if (this.loading || this.instance) return false;
        this.loading = true;
        const res = await fetch("/static/wasm/client.wasm");
        const m = new WebAssembly.Memory({ initial: page, maximum: page });
        const e = { env: { memory: m, 
            log_add_packet: (id, type, x, y, size) => {
                console.log("Add Packet: ", { id, type, x, y, size });
            }
        } };
        this.instance = await WebAssembly.instantiate(await WebAssembly.compile(await res.arrayBuffer()), e);
        this.buffer = m.buffer;
        this.HEAPU8  = new Uint8Array(m.buffer);
        this.HEAPU16 = new Uint16Array(m.buffer);
        this.HEAPF32 = new Float32Array(m.buffer);
        this.HEAPU32 = new Uint32Array(m.buffer);
        this.loading = false;
        return true;
    }
}
},{}]},{},[7]);
