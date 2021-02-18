importScripts("https://cdnjs.cloudflare.com/ajax/libs/gl-matrix/2.8.1/gl-matrix-min.js");    

const Stats = require("./stats");
const Mouse = require("./mouse");
const State = require("./state");
const Viewport = require("./viewport");
const Protocol = require("./protocol");
const WasmCore = require("./wasm-core");
const TextureStore = require("./texture-store");

const { makeProgram, COLORS } = require("./util");
const {
   SPRITE_VERT_SHADER_SOURCE, SPRITE_FRAG_SHADER_SOURCE,
   MASS_VERT_SHADER_SOURCE, MASS_FRAG_PEELING_SHADER_SOURCE,
   BORDER_VERT_SHADER_SOURCE, BORDER_FRAG_SHADER_SOURCE
} = require("./shaders");

const NAME_MASS_MIN = 0.03;
const NAME_SCALE = 0.25;
const NAME_Y_OFFSET = 0;

const MASS_GAP = 0;
const MASS_SCALE = 0.25;
const MASS_Y_OFFSET = -0.33;

// Constants
const CELL_LIMIT = 1 << 16; // 65536

const MASS_CHARS       = "0123456789.k".split("");
const MASS_CHARS_COUNT = MASS_CHARS.length;

class Renderer {
    /** @param {OffscreenCanvas} canvas */
    constructor(canvas) {
        this.canvas = canvas;

        this.core = new WasmCore(this);

        /** @type {Map<string, WebGLFramebuffer|WebGLFramebuffer[]>} */
        this.fbo = new Map();
        /** @type {Map<string, WebGLFramebuffer>} */
        this.buffers = new Map();
        /** @type {Map<WebGLProgram, Map<string, WebGLUniformLocation>} */
        this.uniforms = new Map();

        /** @type {WebGLTexture[]} */
        this.circleTextures = [];
        /** @type {{ skin: string, name: string }[]} */
        this.playerData = Array.from({ length: 256 });
        this.playerData[0] = { name: "Server" };

        /** @type {{ id: number, skin?: ImageBitmap, name?: ImageBitmap }[]} */
        this.updates = [];
        this.stats = new Stats();
        this.mouse = new Mouse();
        this.state = new State();
        this.viewport = new Viewport();
        this.viewbox = { t: 0, b: 0, l: 0, r: 0 };
        this.syncMouse = { x: 0, y: 0 };

        this.initLoader();

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
                this.protocol.disconnect();
                throw e;
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
            if (this.textures.replace(old.name, name)) this.loader.postMessage({ id, name });
            if (this.textures.replace(old.skin, skin)) this.loader.postMessage({ id, skin, quality: this.state.skin_dim });
        } else {
            if (this.textures.add(name, persist)) this.loader.postMessage({ id, name });
            if (this.textures.add(skin, persist)) this.loader.postMessage({ id, skin, quality: this.state.skin_dim });
        }
        this.playerData[id] = { skin, name };
    }

    initLoader() {
        this.loader = new Worker("loader.min.js");
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

        gl.enable(gl.BLEND);

        // console.log("Loading WASM...");
        await this.core.load();
        this.wasm = this.core.instance.exports;

        // console.log("Loading font");
        let font = new FontFace("Bree Serif", "url(/static/font/BreeSerif-Regular.ttf)");
        self.fonts && fonts.add(font);
        await font.load();
        font = new FontFace("Lato", "url(/static/font/Lato-Bold.ttf)");
        self.fonts && fonts.add(font);
        await font.load();
        
        this.cursor = { position: vec3.create() };
        this.target = { position: vec3.create(), scale: 10 };
        this.camera = { position: vec3.create(), scale: 10, tp: false };
        this.proj = mat4.create();
        
        this.IGNORE_SKIN = this.state.ignore_skin;
        this.SKIN_DIM = this.state.skin_dim;

        this.BYTES_PER_CELL_DATA = this.wasm.bytes_per_cell_data();
        this.INDICES_OFFSET = CELL_LIMIT * this.BYTES_PER_CELL_DATA;
       
        // name text vertex cpu buffers
        this.nameWidths = new Float32Array(256);
        this.nameFlags  = new Uint8Array(CELL_LIMIT);
        this.nameBuffer = new Float32Array(new ArrayBuffer(6 * CELL_LIMIT));

        // mass text vertex cpu buffers
        this.massWidths = new Float32Array(256);
        this.massCounts = new Uint8Array(CELL_LIMIT);
        this.massBuffer = new Float32Array(new ArrayBuffer(128 * CELL_LIMIT));

        const alloc = this.core.buffer.byteLength + this.nameWidths.byteLength + 
            this.nameBuffer.byteLength + this.massWidths.byteLength +
            this.massCounts.byteLength + this.massBuffer.byteLength;

        console.log(`${(alloc / 1024 / 1024).toFixed(1)} MB allocated for renderer`);
        
        this.textures = new TextureStore(this);

        const main_prog = this.main_prog = makeProgram(gl, SPRITE_VERT_SHADER_SOURCE, SPRITE_FRAG_SHADER_SOURCE);
        const mass_prog = this.mass_prog = makeProgram(gl, MASS_VERT_SHADER_SOURCE,   MASS_FRAG_PEELING_SHADER_SOURCE);
        const brdr_prog = this.brdr_prog = makeProgram(gl, BORDER_VERT_SHADER_SOURCE, BORDER_FRAG_SHADER_SOURCE);

        this.loadUniform(main_prog, "u_proj");
        this.loadUniform(main_prog, "u_uvs");
        this.loadUniform(main_prog, "u_texture");

        this.loadUniform(mass_prog, "u_proj");
        this.loadUniform(mass_prog, "u_uvs");
        this.loadUniform(mass_prog, "u_mass_char");

        this.loadUniform(brdr_prog, "u_map");
        this.loadUniform(brdr_prog, "u_proj");
        this.loadUniform(brdr_prog, "u_color");

        this.generateCellVAO();
        this.generateNameVAO();
        this.generateMassVAO();
        this.generateBorderVAO();

        this.generateDeadcellTexture();
        this.generateCircleTextures();
        this.generateMassTextures();

        const c = 12 / 255;
        gl.useProgram(brdr_prog);
        gl.uniform4f(this.getUniform(brdr_prog, "u_color"), c, c, c, 1);

        gl.useProgram(mass_prog);
        gl.uniform1i(this.getUniform(mass_prog, "u_mass_char"), 1);

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
        this.textures.clear();
        this.stats.reset();
    }

    teleportCamera() {
        this.camera.scale = this.target.scale;
        this.camera.position.set(this.target.position);
        this.camera.tp = false;
    }

    clearCells() {
        this.core.HEAPU32.fill(0);
        this.massBuffer.fill(0);
    }

    clearPlayerData() {
        for (let i = 1; i <= 250; i++) this.playerData[i] = undefined;
    }

    /** @param {string} name */
    allocBuffer(name) {
        if (this.buffers.has(name)) throw new Error(`Already allocated buffer "${name}"`);
        const buf = this.gl.createBuffer();
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

    generateCellVAO() {
        const gl = this.gl;

        gl.bindVertexArray(this.cellVAO = gl.createVertexArray());

        // 4 bytes per float * 2 triangles * 3 vertices per triangle * 2 floats per vertex = 48
        gl.bindBuffer(gl.ARRAY_BUFFER, this.allocBuffer("cell_data_buffer"));
        gl.bufferData(gl.ARRAY_BUFFER, this.core.HEAPU8.subarray(0, 48 * CELL_LIMIT), gl.DYNAMIC_DRAW);
        
        const size = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.vertexAttribPointer(0, size, type, normalize, stride, offset);
        gl.enableVertexAttribArray(0);
    }

    generateNameVAO() {
        const gl = this.gl;

        gl.bindVertexArray(this.nameVAO = gl.createVertexArray());

        // 4 bytes per float * 2 triangles * 3 vertices per triangle * 2 floats per vertex = 48
        gl.bindBuffer(gl.ARRAY_BUFFER, this.allocBuffer("name_buffer"));
        gl.bufferData(gl.ARRAY_BUFFER, this.nameBuffer, gl.DYNAMIC_DRAW);
        
        const size = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.vertexAttribPointer(0, size, type, normalize, stride, offset);
        gl.enableVertexAttribArray(0);
    }

    generateMassVAO() {
        const gl = this.gl;
        gl.bindVertexArray(this.massVAO = gl.createVertexArray());
        gl.bindBuffer(gl.ARRAY_BUFFER, this.allocBuffer("mass_buffer"));
        gl.bufferData(gl.ARRAY_BUFFER, this.massBuffer, gl.DYNAMIC_DRAW);

        // |x|y|uv_index|
        const size = 3;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.vertexAttribPointer(0, size, type, normalize, stride, offset);
        gl.enableVertexAttribArray(0);
    }

    generateBorderVAO() {
        const gl = this.gl;
        gl.bindVertexArray(this.borderVAO = gl.createVertexArray());
        gl.bindBuffer(gl.ARRAY_BUFFER, this.allocBuffer("border_buffer"));
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, +1,
            -1, -1,
            +1, -1,
            -1, +1,
            +1, -1,
            +1, +1,
        ]), gl.STATIC_DRAW);

        const size = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.vertexAttribPointer(0, size, type, normalize, stride, offset);
        gl.enableVertexAttribArray(0);
    }

    generateDeadcellTexture() {
        const gl = this.gl;

        gl.bindTexture(gl.TEXTURE_2D, this.deadCellTexture = gl.createTexture());

        const CIRCLE_RADIUS = this.state.circle_radius;
        const temp = new OffscreenCanvas(CIRCLE_RADIUS << 1, CIRCLE_RADIUS << 1);
        const temp_ctx = temp.getContext("2d");
        temp_ctx.globalAlpha = 0.75;
        temp_ctx.fillStyle = `rgb(75, 75, 75)`;
        temp_ctx.arc(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS, 0, 2 * Math.PI, false);
        temp_ctx.fill();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, temp);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }

    generateCircleTextures() {
        const gl = this.gl;

        if (this.circleTextures.length) {
            this.circleTextures.forEach(t => gl.deleteTexture(t));
            this.circleTextures = [];
        }

        const CIRCLE_RADIUS = this.state.circle_radius;
        const temp = new OffscreenCanvas(CIRCLE_RADIUS << 1, CIRCLE_RADIUS << 1);
        const temp_ctx = temp.getContext("2d");

        // Generate circles
        for (const [r, g, b] of COLORS) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            this.circleTextures.push(tex);

            temp_ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            temp_ctx.clearRect(0, 0, temp.width, temp.height);
            temp_ctx.arc(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS, 0, 2 * Math.PI, false);
            temp_ctx.fill();
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, temp);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        }

        const UVS = new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            1, 1,
            0, 0,
            1, 0,
        ]);

        gl.useProgram(this.main_prog);
        gl.uniform2fv(this.getUniform(this.main_prog, "u_uvs"), UVS);
    }

    generateMassTextures() {
        const gl = this.gl;

        // Generate mass char on texture unit 1
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, gl.createTexture());

        const MASS_FONT_WIDTH  = 320;
        const MASS_FONT_HEIGHT = 320;

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
            this.massWidths[char.charCodeAt(0)] = w;
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
    
        gl.useProgram(this.mass_prog);
        gl.uniform2fv(this.getUniform(this.mass_prog, "u_uvs"), UVS);
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
    lerpCamera(d = 1 / 60) {
        const l = Math.min(Math.max(d * this.state.zoom, 0), 1);
        vec3.lerp(this.camera.position, this.camera.position, this.target.position, d);
        this.camera.scale += (this.target.scale - this.camera.scale) * l;

        const x = this.camera.position[0];
        const y = this.camera.position[1];
        const hw = this.viewport.width  * this.camera.scale / 2;
        const hh = this.viewport.height * this.camera.scale / 2;

        const v = this.viewbox;
        mat4.ortho(this.proj, v.l = x - hw, v.r = x + hw, 
            v.b = y - hh, v.t = y + hh, 0, 1);
    }

    checkResolution() {
        const gl = this.gl;
        const r = this.state.resolution;
        if (gl.canvas.width != r[0] || gl.canvas.height != r[1]) {
            gl.canvas.width  = r[0];
            gl.canvas.height = r[1];
        }
    }

    /** 
     * @param {Uint16Array} indices_buffer
     * @param {Uint8Array} types_buffer
     */
    buildNameVertexBuffer(indices_buffer, types_buffer) {
        let write_offset = 0;
        
        const indices = indices_buffer;
        const types = types_buffer;
        
        const f32 = this.core.HEAPF32;

        const flags  = this.nameFlags;
        const widths = this.nameWidths;
        const name_buffer = this.nameBuffer;

        for (const i in this.playerData) {
            const p = this.playerData[i];
            if (!i || i > 250 || !p || !p.name) continue;
            const w = this.textures.get(p.name);
            if (!w || !w.tex) continue;
            widths[i] = w.dim[0] / w.dim[1];
        }

        for (let i = 0; i < indices.length; i++) {

            const type = types[i];
            const offset = (indices[i] * this.BYTES_PER_CELL_DATA) >> 2;

            if (!widths[type]) {
                flags[i] = 0;
                continue;
            };
            
            flags[i] = 1;

            const x = f32[offset + 4];
            const y = f32[offset + 5];
            const s = f32[offset + 6];

            const x1 = NAME_SCALE * widths[type] * s;
            const x0 = -x1;

            const y0 = (NAME_Y_OFFSET - NAME_SCALE) * s;
            const y1 = (NAME_Y_OFFSET + NAME_SCALE) * s;

            name_buffer[write_offset++] = x + x0;
            name_buffer[write_offset++] = y + y0;

            name_buffer[write_offset++] = x + x1;
            name_buffer[write_offset++] = y + y0;

            name_buffer[write_offset++] = x + x0;
            name_buffer[write_offset++] = y + y1;
            
            name_buffer[write_offset++] = x + x1;
            name_buffer[write_offset++] = y + y0;

            name_buffer[write_offset++] = x + x0;
            name_buffer[write_offset++] = y + y1;

            name_buffer[write_offset++] = x + x1;
            name_buffer[write_offset++] = y + y1;
        }

        return write_offset;
    }

    /** 
     * @param {Uint16Array} indices_buffer
     * @param {Uint8Array} types_buffer
     */
    buildMassVertexBuffer(indices_buffer, types_buffer) {
        let write_offset = 0;

        const indices = indices_buffer;
        const types = types_buffer;
        
        const f32 = this.core.HEAPF32;

        const counts = this.massCounts;
        const widths = this.massWidths;
        const mass_buffer = this.massBuffer;

        // mass = 1 is short, 2 is long
        const long_mass = this.state.mass === 2;

        for (let i = 0; i < indices.length; i++) {

            const offset = (indices[i] * this.BYTES_PER_CELL_DATA) >> 2;

            const type = types[i];

            if (!type || type > 250) {
                counts[i] = 0;
                continue;
            };

            const x = f32[offset + 4];
            const y = f32[offset + 5];
            const s = f32[offset + 6];
            const m = s * s * 0.01;

            const mass = long_mass ? Math.round(m).toString() : 
                m > 1000 ? (m / 1000).toFixed(1) + "k" : Math.round(m).toString();
            
            // Save the char length to count array
            counts[i] = mass.length;

            let width = (mass.length - 1) * MASS_GAP * MASS_SCALE;

            for (let j = 0; j < mass.length; j++) 
                width += MASS_SCALE * widths[mass.charCodeAt(j)];

            let w = -width / 2;
            for (let j = 0; j < mass.length; j++) {
                const char_code = mass.charCodeAt(j);
                // 46 is . 107 is k
                const char_uv_offset = char_code === 46 ? 10 : (char_code === 107 ? 11 : char_code - 48);
                const char_width = widths[char_code];

                const x0 = w * s;
                const x1 = x0 + MASS_SCALE * char_width * s;
                const y0 = (+0.5 * MASS_SCALE + MASS_Y_OFFSET) * s;
                const y1 = (-0.5 * MASS_SCALE + MASS_Y_OFFSET) * s;

                w += MASS_SCALE * char_width + MASS_GAP;

                mass_buffer[write_offset++] = x + x0;
                mass_buffer[write_offset++] = y + y0;
                mass_buffer[write_offset++] = (char_uv_offset << 2) + 0;

                mass_buffer[write_offset++] = x + x1;
                mass_buffer[write_offset++] = y + y0;
                mass_buffer[write_offset++] = (char_uv_offset << 2) + 1;

                mass_buffer[write_offset++] = x + x0;
                mass_buffer[write_offset++] = y + y1;
                mass_buffer[write_offset++] = (char_uv_offset << 2) + 2;
                
                mass_buffer[write_offset++] = x + x1;
                mass_buffer[write_offset++] = y + y0;
                mass_buffer[write_offset++] = (char_uv_offset << 2) + 1;

                mass_buffer[write_offset++] = x + x0;
                mass_buffer[write_offset++] = y + y1;
                mass_buffer[write_offset++] = (char_uv_offset << 2) + 2;

                mass_buffer[write_offset++] = x + x1;
                mass_buffer[write_offset++] = y + y1;
                mass_buffer[write_offset++] = (char_uv_offset << 2) + 3;
            }
        }

        return write_offset;
    }

    /** @param {number} now */
    render(now) {
        
        if (!this.lastTimestamp) {
            this.lastTimestamp = now;
            return;
        }

        this.fps++;
        const delta = now - this.lastTimestamp;
        this.lastTimestamp = now;

        this.protocol.replay.update(delta);

        const lerp = this.protocol.lastPacket ? (now - this.protocol.lastPacket) / this.state.draw : 0;

        const { t, b, l, r } = this.viewbox;

        const skip = !this.state.visible && !this.protocol.replay.requestPreview;

        const cell_count = this.wasm.update_cells(0, this.INDICES_OFFSET, lerp, t, b, l, r, skip);

        this.stats.cells = cell_count;
        
        this.updateTarget();
        this.camera.tp ? this.teleportCamera() : this.lerpCamera(delta / this.state.draw);
        this.checkResolution();

        if (skip) return this.updateTextures();

        const gl = this.gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        
        // Background
        this.clearScreen();

        // Draw background
        if (this.protocol.map) {
            gl.useProgram(this.brdr_prog);
            gl.bindVertexArray(this.borderVAO);
            gl.uniform2f(this.getUniform(this.brdr_prog, "u_map"), this.protocol.map.hw, this.protocol.map.hh);
            gl.uniformMatrix4fv(this.getUniform(this.brdr_prog, "u_proj"), false, this.proj);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        
        // Draw the rest
        this.draw(cell_count);

        this.protocol.replay.savePreview();
        
        this.updateTextures();
        this.lastDraw = now;
    }

    /** @param {number} cell_count */
    draw(cell_count) {

        const gl = this.gl;
        
        const indices = new Uint16Array(this.core.buffer, this.INDICES_OFFSET, cell_count);
        const types_ptr = this.INDICES_OFFSET + (cell_count << 1);
        const types = this.core.HEAPU8.subarray(types_ptr, types_ptr + cell_count);

        let vert_ptr = types_ptr + cell_count;
        while (vert_ptr & 3) vert_ptr++;

        const end = this.wasm.draw_cells(0, this.INDICES_OFFSET, cell_count, vert_ptr);
        const expect = vert_ptr + cell_count * 48;
        console.assert(end === expect, `Expecting end pointer to be ${expect}, but got ${end}`);

        let text_index = cell_count;

        // Configurable if we want to draw skin/name/mass
        const render_skin = this.state.skin;
        const render_name = this.state.name;
        const render_mass = this.state.mass;

        const circles = this.circleTextures;
        const dead = this.deadCellTexture;
        const name_flags = this.nameFlags;
        const mass_count = this.massCounts;

        name_flags.fill(0);
        mass_count.fill(0);
        
        if (render_name || render_mass) {
            
            const { l, r, t, b } = this.viewbox;
            const w = r - l;
            const h = t - b;
            const cutoff = (w < h ? w : h) * NAME_MASS_MIN;

            text_index = this.wasm.find_text_index(0, this.INDICES_OFFSET, cell_count, cutoff);

            const text_indices = indices.subarray(text_index, indices.length);
            const text_types = types.subarray(text_index, types.length);

            if (render_name) {
                const end = this.buildNameVertexBuffer(text_indices, text_types);
                
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("name_buffer"));
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.nameBuffer.subarray(0, end));
            }
            
            if (render_mass) {
                const end = this.buildMassVertexBuffer(text_indices, text_types);
                
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("mass_buffer"));
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.massBuffer.subarray(0, end));
            }
        }

        const L = circles.length;
        // 12 floats per cell
        const VB = new Float32Array(this.core.buffer, vert_ptr, 12 * cell_count);

        const skins = this.playerData.map(d => {
            if (!d) return null;
            const w = this.textures.get(d.skin);
            return w ? w.tex : null;
        });

        const names = render_name ? this.playerData.map(d => {
            if (!d) return null;
            const w = this.textures.get(d.name);
            return w ? w.tex : null;
        }) : [];

        gl.useProgram(this.mass_prog);
        gl.uniformMatrix4fv(this.getUniform(this.mass_prog, "u_proj"), false, this.proj);

        gl.useProgram(this.main_prog);
        gl.uniformMatrix4fv(this.getUniform(this.main_prog, "u_proj"), false, this.proj);

        gl.bindVertexArray(this.cellVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("cell_data_buffer"));
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, VB);

        gl.activeTexture(gl.TEXTURE0);

        let name_draw_offset = 0;
        let mass_draw_offset = 0;

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        for (let i = 0; i < cell_count; i++) {
            const t = types[i];

            if (t !== 253) {
                if (t === 251) {
                    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                    gl.bindTexture(gl.TEXTURE_2D, dead);
                    gl.drawArrays(gl.TRIANGLES, 6 * i, 6);
                    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
                } else {
                    gl.bindTexture(gl.TEXTURE_2D, t === 254 ? circles[indices[i] % L] : circles[t % L]);
                    gl.drawArrays(gl.TRIANGLES, 6 * i, 6);
                }
            }

            if (render_skin && skins[t] || t === 253) {
                gl.bindTexture(gl.TEXTURE_2D, skins[t]);
                gl.drawArrays(gl.TRIANGLES, 6 * i, 6);
            }

            const ti = i - text_index;

            if (ti >= 0) {
                if (name_flags[ti]) {
                    gl.bindVertexArray(this.nameVAO);
                    gl.bindTexture(gl.TEXTURE_2D, names[t]);
                    gl.drawArrays(gl.TRIANGLES, name_draw_offset, 6);
                    name_draw_offset += 6;
                }

                const mass_chars = mass_count[ti];
                if (mass_chars) {
                    gl.useProgram(this.mass_prog);
                    gl.bindVertexArray(this.massVAO);
                    const draw_count = 6 * mass_chars;
                    gl.drawArrays(gl.TRIANGLES, mass_draw_offset, draw_count);
                    mass_draw_offset += draw_count;
                    gl.useProgram(this.main_prog);
                }
                
                gl.bindVertexArray(this.cellVAO);
            }
        }

        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }

    serializeState() {
        return this.core.buffer.slice(this.INDICES_OFFSET, 
            this.wasm.serialize_state(0, this.INDICES_OFFSET));
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
                    this.textures.setData(p.skin, skin_bitmap);
                    this.textures.setData(p.name, name_bitmap);
                }
                if (++limit > 2) break;
            }
        }
    }

    clearScreen() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}

self.addEventListener("message", async e => {
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

module.exports = Renderer;