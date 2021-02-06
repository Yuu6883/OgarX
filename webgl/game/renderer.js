if (self.importScripts) {
    importScripts("https://cdnjs.cloudflare.com/ajax/libs/gl-matrix/2.8.1/gl-matrix-min.js");    
}

const Stats = require("./stats");
const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");
const Protocol = require("./protocol");
const WasmCore = require("./wasm-core");
const TextureStore = require("./texture-store");

const { makeProgram, pick, getColor } = require("./util");
const { CELL_VERT_SHADER_SOURCE, CELL_FRAG_PEELING_SHADER_SOURCE,
   NAME_VERT_SHADER_SOURCE, NAME_FRAG_PEELING_SHADER_SOURCE,
   MASS_VERT_SHADER_SOURCE, MASS_FRAG_PEELING_SHADER_SOURCE,
   QUAD_VERT_SHADER_SOURCE, 
   BLEND_BACK_FRAG_SHADER_SOURCE, FINAL_FRAG_SHADER_SOURCE,
   BORDER_VERT_SHADER_SOURCE, BORDER_FRAG_SHADER_SOURCE
} = require("./shaders");

const NAME_MASS_MIN = 0.03;
const NAME_SCALE = 0.25;
const NAME_Y_OFFSET = -0.03;

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

class Renderer {
    /** @param {OffscreenCanvas} canvas */
    constructor(canvas) {
        this.canvas = canvas;

        /** @type {Map<string, WebGLFramebuffer|WebGLFramebuffer[]>} */
        this.fbo = new Map();
        /** @type {Map<string, WebGLFramebuffer>} */
        this.buffers = new Map();
        /** @type {Map<WebGLProgram, Map<string, WebGLUniformLocation>} */
        this.uniforms = new Map();

        /** @type {{ skin: string, name: string }[]} */
        this.playerData = Array.from({ length: 256 });
        this.playerData[0] = { name: "Server" };

        /** @type {{ id: number, skin?: ImageBitmap, name?: ImageBitmap }[]} */
        this.updates = [];
        this.stats = new Stats();
        this.mouse = new Mouse();
        this.state = new State();
        this.viewport = new Viewport();
        this.core = new WasmCore(this);
        this.viewbox = { t: 0, b: 0, l: 0, r: 0 };

        this.initLoader();

        this.drawCells = this.drawCells.bind(this);
        this.drawNames = this.drawNames.bind(this);
        this.drawMass  = this.drawMass.bind(this);

        this.fps = 0;
        this.fpsInterval = setInterval(() => {
            this.stats.fps = this.fps;
            this.fps = 0;
        }, 1000);
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

    /** @param {{ id: number, skin: string, name: string, persist: boolean }} arg0 */
    loadPlayerData({ id, skin, name, persist }) {
        if (this.IGNORE_SKIN && id <= 250) skin = "";

        const old = this.playerData[id];
        if (old) {
            if (this.store.replace(old.name, name)) this.loader.postMessage({ id, name });
            if (this.store.replace(old.skin, skin)) this.loader.postMessage({ id, skin });
        } else {
            if (this.store.add(name, persist)) this.loader.postMessage({ id, name });
            if (this.store.add(skin, persist)) this.loader.postMessage({ id, skin });
        }
        this.playerData[id] = { skin, name };
    }

    initLoader() {
        this.loader = new Worker(self.window ? "js/loader.min.js" : "loader.min.js");
        /** @param {{ data: { id: number, skin?: ImageBitmap, name?: ImageBitmap }}} e */
        this.loader.onmessage = e => {
            if (!e.data) return;
            if (e.data.event === "replay") {
                self.postMessage(e.data);
                this.protocol.replay.saving = false;
            } else if (e.data.id) this.updates.unshift(e.data);
        }
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
        const gl = this.gl = this.canvas.getContext("webgl2", { 
            premultipliedAlpha: false, 
            powerPreference: "high-performance",
            preserveDrawingBuffer: true
        });
        if (!gl) return console.error("WebGL2 Not Supported");

        // console.log("Loading WASM...");
        await this.core.load();

        // console.log("Loading font");
        let font = new FontFace("Bree Serif", "url(/static/font/BreeSerif-Regular.ttf)");
        self.fonts && fonts.add(font);
        await font.load();
        font = new FontFace("Lato", "url(/static/font/Lato-Bold.ttf)");
        self.fonts && fonts.add(font);
        await font.load();

        if (!self.mat4) {
            console.log("Loading glMatrix library");
            const glMatrixScript = document.createElement("script");
            glMatrixScript.src = "https://cdnjs.cloudflare.com/ajax/libs/gl-matrix/2.8.1/gl-matrix-min.js";
            document.body.appendChild(glMatrixScript);
            await new Promise(resolve => glMatrixScript.onload = resolve);
        }
        
        this.cursor = { position: vec3.create() };
        this.target = { position: vec3.create(), scale: 10 };
        this.camera = { position: vec3.create(), scale: 10 };
        this.shouldTP = false;
        this.proj = mat4.create();
        
        // console.log("Loading bot skins & names");
        // const res = await fetch("/static/data/bots.json");
        /** @type {{ names: string[], skins: string[] }} */
        this.bots = { names: [], skins: [] }; // await res.json();

        this.IGNORE_SKIN = this.state.ignore_skin;
        this.SKIN_DIM = this.state.skin_dim;

        this.BYTES_PER_CELL_DATA = this.core.instance.exports.bytes_per_cell_data();
        this.BYTES_PER_RENDER_CELL = this.core.instance.exports.bytes_per_render_cell();

        this.cellDataBufferLength = this.cellTypesTableOffset = CELL_LIMIT * this.BYTES_PER_CELL_DATA;
        // console.log(`Table offset: ${this.cellTypesTableOffset}`);
        this.cellBufferOffset = this.cellTypesTableOffset + CELL_TYPES * 2; // Offset table
        // console.log(`Render buffers offset: ${this.cellBufferOffset}`);
        this.cellBufferEnd = this.cellBufferOffset + CELL_LIMIT * this.BYTES_PER_RENDER_CELL;
        // console.log(`Render buffer end ${this.cellBufferEnd}`);
        this.nameBufferOffset = this.cellBufferEnd + CELL_TYPES * 2;
        this.nameBufferEnd = this.nameBufferOffset + CELL_LIMIT * this.BYTES_PER_RENDER_CELL;
        console.log(`${(this.core.buffer.byteLength / 1024 / 1024).toFixed(1)}MB allocated for renderer WebAssembly`);
        
        this.cellTypesTable = new Uint16Array(this.core.buffer, this.cellTypesTableOffset, CELL_TYPES); 
        this.nameTypesTable = new Uint16Array(this.core.buffer, this.cellBufferEnd, CELL_TYPES);

        this.renderBuffer = this.core.HEAPU8.subarray(this.cellBufferOffset, this.cellBufferEnd);
        this.renderBufferView = new DataView(this.core.buffer, this.cellBufferOffset, CELL_LIMIT * this.BYTES_PER_RENDER_CELL);
        /** @type {Map<string, number>} */
        this.massWidthsTable = new Map();

        // 8 MB cache for mass text
        this.massBuffer = new Float32Array(new ArrayBuffer(128 * CELL_LIMIT));
        this.store = new TextureStore(this);

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
        const border_prog = this.border_prog = makeProgram(gl, BORDER_VERT_SHADER_SOURCE, BORDER_FRAG_SHADER_SOURCE);
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

        this.loadUniform(border_prog, "u_map");
        this.loadUniform(border_prog, "u_proj");
        this.loadUniform(border_prog, "u_color");

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

        const c = 12 / 255;
        gl.useProgram(border_prog);
        gl.uniform4f(this.getUniform(border_prog, "u_color"), c, c, c, 1);

        this.loadPlayerData({ id: 253, skin: `/static/img/virus-${this.SKIN_DIM}.png`, persist: true });
        this.start();

        this.protocol = new Protocol(this);
        this.protocol.on("close", this.cleanup.bind(this));

        await this.protocol.replay.init();
    }

    cleanup() {
        if (this.protocol.replaying) return;
        this.clearCells();
        this.clearScreen();
        this.clearPlayerData();
        this.target.position.fill(0);
        this.store.clear();
        this.stats.reset();
    }

    teleportCamera() {
        this.camera.scale = this.target.scale;
        this.camera.position.set(this.target.position);
        this.shouldTP = false;
    }

    clearCells() {
        this.core.HEAPU32.fill(0);
        this.massBuffer.fill(0);
    }

    clearPlayerData() {
        for (let i = 1; i <= 250; i++) this.playerData[i] = undefined;
    }

    randomPlayer() {
        return {
            skin: pick(this.bots.skins),
            name: pick(this.bots.names)
        }
    }

    async genCells() {
        for (let i = 1; i < 256; i++)
            this.loadPlayerData({ id: i, ...this.randomPlayer() });

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

    freeFrameBuffer(name) {
        if (!this.fbo.has(name)) throw new Error(`Trying to free none existing framebuffer "${name}`);
        const fbs = this.fbo.get(name);
        if (Array.isArray(fbs)) {
            for (const f of fbs) this.gl.deleteFramebuffer(f);
        } else this.gl.deleteFramebuffer(fbs);
        this.fbo.delete(name);
    }

    rellocPeelingBuffers(w, h) {
        if (w <= this.FBO_WIDTH && h <= this.FBO_HEIGHT) return;
        console.log(`Reallocating framebuffers to [${w}, ${h}]`);
        this.freeFrameBuffer("peel_depths");
        this.freeFrameBuffer("peel_colors");
        this.freeFrameBuffer("blend_back");
        this.setUpPeelingBuffers(w, h);
    }

    /** Make sure texture units [0-6] are not changed anywhere later in rendering */
    setUpPeelingBuffers(w = 1920, h = 1080) {

        this.FBO_WIDTH = w;
        this.FBO_HEIGHT = h;

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
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, w, h, 0, gl.RG, gl.FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, depthTarget, 0);

            const frontColorTarget = gl.createTexture();
            gl.activeTexture(gl.TEXTURE1 + texture_unit_offset);
            gl.bindTexture(gl.TEXTURE_2D, frontColorTarget);
            FBOTexParam();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, frontColorTarget, 0);

            const backColorTarget = gl.createTexture();
            gl.activeTexture(gl.TEXTURE2 + texture_unit_offset);
            gl.bindTexture(gl.TEXTURE_2D, backColorTarget);
            FBOTexParam();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
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
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
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
        // Generate circle
        {
            const CIRCLE_RADIUS = this.state.circle_radius;
            // console.log(`Generating ${CIRCLE_RADIUS << 1}x${CIRCLE_RADIUS << 1} circle texture`);
            const temp = self.window ? document.createElement("canvas") : new OffscreenCanvas(CIRCLE_RADIUS << 1, CIRCLE_RADIUS << 1);
            if (self.window) temp.width = temp.height = CIRCLE_RADIUS << 1;
            const temp_ctx = temp.getContext("2d");
            temp_ctx.fillStyle = "white";
            temp_ctx.arc(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS, 0, 2 * Math.PI, false);
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
        // console.log("Generating mass characters");

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

            const temp = self.window ? document.createElement("canvas") : new OffscreenCanvas(MASS_FONT_WIDTH, MASS_FONT_HEIGHT);
            if (self.window) {
                temp.width = MASS_FONT_WIDTH;
                temp.height = MASS_FONT_HEIGHT;
            }
            
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
        this.screenToWorld(this.cursor.position, this.mouse.x / 4096, this.mouse.y / 4096);
        const scroll = this.mouse.resetScroll();
        this.target.scale *= (1 + scroll / 1000);
        this.target.scale = Math.min(Math.max(this.target.scale, 0.01), 10000);
    }

    // Smooth update camera
    lerpCamera(d = 1 / 60, position) {
        const l = Math.min(Math.max(d * this.state.zoom, 0), 1);
        vec3.lerp(this.camera.position, this.camera.position, this.target.position, d);
        this.camera.scale += (this.target.scale - this.camera.scale) * l;

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

        if (!this.state.skin) {
            gl.bindTexture(gl.TEXTURE_2D, this.empty_texture);
        }

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

            const T = this.store.get(this.playerData[i] && this.playerData[i].skin);
            const use_empty = !(this.state.skin || i > 250) || !T || !T.tex;
            gl.bindTexture(gl.TEXTURE_2D, use_empty ? this.empty_texture : T.tex);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("cell_data_buffer"));
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, buff);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            const count = (end - begin) * 2;
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
        }
    }

    drawNames(firstPass) {
        const gl = this.gl;

        gl.bindVertexArray(this.quadVAO);
        gl.activeTexture(gl.TEXTURE12);

        for (let i = 1; i < CELL_TYPES; i++) {

            if (!this.playerData[i]) continue;
            let begin = this.nameTypesTable[i - 1];
            let end   = this.nameTypesTable[i];
            if (begin == end) continue;
            if (!end) end = 65536;

            const T = this.store.get(this.playerData[i] && this.playerData[i].name);
            if (!T || !T.tex) continue;
            if (this.state.name && i <= 250) gl.bindTexture(gl.TEXTURE_2D, T ? T.tex : this.empty_texture);

            const begin_offset = this.nameBufferOffset + begin * this.BYTES_PER_RENDER_CELL;
            const buff = new Float32Array(this.core.buffer, begin_offset, (end - begin) * 3);

            gl.uniform4f(this.getUniform(this.peel_prog2, "u_dim"), 
                T.dim[0] / 512, T.dim[1] / 512, NAME_SCALE, NAME_Y_OFFSET);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("cell_data_buffer"));
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, buff);
            gl.bindBuffer(gl.ARRAY_BUFFER, null);

            const count = (end - begin) * 2;
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
        }
    }

    drawMass(firstPass) {
        const count = (this.renderMassBuffer.length >> 2);
        if (count % 3 || !count) return;
        
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
            // mass = 1 is short, 2 is long
            const mass = this.state.mass - 1 ? Math.floor(buffer[o + 3]).toString() : 
                buffer[o + 3] > 1000 ? (buffer[o + 3] / 1000).toFixed(1) + "k" : buffer[o + 3];
            
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

        this.fps++;
        const delta = now - this.lastTimestamp;
        this.protocol.replay.update(delta);
        this.lastTimestamp = now;
        
        this.cellTypesTable.fill(0);
        this.nameTypesTable.fill(0);

        const lerp = this.protocol.lastPacket ? (now - this.protocol.lastPacket) / this.state.draw : 0;

        const cell_count = this.core.instance.exports.draw_cells(0, 
            this.cellTypesTableOffset, 
            this.cellBufferOffset, lerp,
            this.viewbox.t, this.viewbox.b, this.viewbox.l, this.viewbox.r);
        
        this.updateTarget();

        let position = null;
        // Client side camera centering for single cell
        // if (this.protocol.pid) {
        //     let begin = this.cellTypesTable[this.protocol.pid - 1];
        //     let end   = this.cellTypesTable[this.protocol.pid];
        //     if (begin != end) {
        //         if (!end) end = 65536;
        //         if (end - begin == 1) {
        //             const x = this.renderBufferView.getFloat32(begin * 3, true);
        //             const y = this.renderBufferView.getFloat32(begin * 3 + 4, true);
        //             // position = { x, y };
        //         }
        //     }
        // }
        this.shouldTP ? this.teleportCamera() : this.lerpCamera(delta / this.state.draw, position);
        this.checkViewport();

        if (!this.state.visible && !this.protocol.replay.requestPreview) {
            this.updateTextures();
            return;
        }

        let text_count = 0;
        const gl = this.gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        this.rellocPeelingBuffers(gl.drawingBufferWidth, gl.drawingBufferHeight);
        const NUM_PASS = 2;
        let offsetBack;
        this.clearPeelingBuffers();

        const progs = [this.peel_prog1];
        const funcs = [this.drawCells];

        // Configurable if we want to draw mass
        if (this.state.mass || this.state.name) {
            text_count = this.core.instance.exports.draw_text(0,
                this.cellTypesTableOffset, // end of cell buffer
                this.cellBufferEnd,  // table offset
                this.nameBufferOffset, // name buffer offset
                this.nameBufferEnd, // mass buffer offset
                NAME_MASS_MIN,
                this.viewbox.t, this.viewbox.b, this.viewbox.l, this.viewbox.r);

            if (this.state.name) {
                progs.push(this.peel_prog2);
                funcs.push(this.drawNames);
            }

            if (this.state.mass) {
                this.buildMassBuffer(new Float32Array(this.core.buffer, this.nameBufferEnd, text_count * 4));
                progs.push(this.peel_prog3);
                funcs.push(this.drawMass);
            }
        }

        offsetBack = this.depthPeelRender(NUM_PASS, progs, funcs);

        this.stats.cells = cell_count;
        this.stats.text  = text_count;
        
        // Background and final prog
        this.clearScreen();
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(this.quadVAO);

        if (this.protocol.map) {
            gl.useProgram(this.border_prog);
            gl.uniform2f(this.getUniform(this.border_prog, "u_map"), this.protocol.map.hw, this.protocol.map.hh);
            gl.uniformMatrix4fv(this.getUniform(this.border_prog, "u_proj"), false, this.proj);

            // Draw background
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        gl.useProgram(this.final_prog);
        gl.uniform1i(this.getUniform(this.final_prog, "u_front_color"), offsetBack + 1);

        // Blend back
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // FXAA prog
        // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // gl.clearColor(0, 0, 0, 1);
        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // gl.useProgram(fxaaProg);
        // gl.bindVertexArray(vao);
        // gl.drawArrays(gl.TRIANGLES, 0, 6);
        // this.stop();

        this.protocol.replay.savePreview();
        
        this.updateTextures();
        this.lastDraw = now;
    }

    serializeState() {
        return this.core.buffer.slice(this.cellBufferOffset, 
            this.core.instance.exports.serialize_state(0, this.cellDataBufferLength, this.cellBufferOffset));
    }

    updateTextures() {
        const gl = this.gl;
        if (this.updates.length) {
            gl.activeTexture(gl.TEXTURE11);
            let limit = 2;
            while (this.updates.length && limit--) {
                const { id, skin: skin_bitmap, name: name_bitmap } = this.updates.pop();
                const p = this.playerData[id];
                if (p) {
                    this.store.setData(p.skin, skin_bitmap);
                    this.store.setData(p.name, name_bitmap);
                }
                if (++limit > 2) break;
            }
        }
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

    clearScreen() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}

if (!self.window) {
    self.addEventListener("message", async function(e) {
        const { data } = e;
        const renderer = self.r = new Renderer(data.offscreen);
        renderer.stats.setBuffer(data.stats);
        renderer.mouse.setBuffer(data.mouse);
        renderer.state.setBuffer(data.state);
        renderer.viewport.setBuffer(data.viewport);
        await renderer.initEngine();
    
        self.addEventListener("message", e => {
            const p = renderer.protocol;
            if (e.data.connect && !p.connecting) {
                p.connect(e.data.connect, e.data.name, e.data.skin);
            }
            if (e.data.spawn) {
                if (p.connecting) {
                    p.once("protocol", () => p.spawn(e.data.name, e.data.skin));
                } else p.spawn(e.data.name, e.data.skin);
            }
            if (e.data.chat) p.sendChat(e.data.chat);
            if (e.data.replay) p.startReplay(e.data.replay);
        });
    
        self.postMessage({ event: "ready" });
    }, { once: true });
} else self.Renderer = Renderer;

module.exports = Renderer;