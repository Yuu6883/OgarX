const { mat4, vec3 } = require("gl-matrix");
const Mouse = require("./mouse");
const Viewport = require("./viewport");
const WasmCore = require("./wasm-core");

const { makeProgram, pick, getColor } = require("./util");
const { CELL_VERT_SHADER_SOURCE, CELL_FRAG_PEELING_SHADER_SOURCE, CELL_FRAG_DEBUG_SHADER_SOURCE,
   QUAD_VERT_SHADER_SOURCE, 
   BLEND_BACK_FRAG_SHADER_SOURCE, FINAL_FRAG_SHADER_SOURCE } = require("./shaders");

const DEBUG = false;
const ZOOM_SPEED = 5;

// Constants
const CELL_TYPES = 256;
const CELL_LIMIT = 2 ** 16; // 65536
const MIN_SIZE = 10;
const SIZE_RANGE = 200;
const POS_RANGE = 65536;

const DEPTH_CLEAR_VALUE = -99999.0;
const MIN_DEPTH = 0.0;
const MAX_DEPTH = 1.0;

class Renderer {
    /** @param {OffscreenCanvas} canvas */
    constructor(canvas) {
        this.canvas = canvas;

        this.target = { position: vec3.create(), scale: 1 };
        this.camera = { position: vec3.create(), scale: 1 };

        /** @type {Map<string, WebGLFramebuffer|WebGLFramebuffer[]>} */
        this.fbo = new Map();
        /** @type {Map<string, WebGLFramebuffer>} */
        this.buffers = new Map();
        /** @type {Map<WebGLProgram, Map<string, WebGLUniformLocation>} */
        this.uniforms = new Map();

        /** @type {Map<number, { skin: WebGLTexture, name: WebGLTexture }>} player data */
        this.players = new Map();

        /** @type {Map<number, [ImageBitmap, ImageBitmap]>} */
        this.updates = new Map();

        this.mouse = new Mouse();
        this.viewport = new Viewport();
        this.core = new WasmCore();

        this.proj = mat4.create();

        this.initLoader();
        this.initEngine();
    }

    start() {
        if (this.r) return false;
        const loop = now => {
            this.r = requestAnimationFrame(loop);
            this.render(now);
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
        const font = new FontFace("Bree Serif", "url(../font/BreeSerif-Regular.ttf)");
        fonts.add(font);
        await font.load();
        
        console.log("Loading bot skins & names");
        const res = await fetch("/data/bots.json");
        /** @type {{ names: string[], skins: string[] }} */
        this.bots = await res.json();

        this.BYTES_PER_CELL_DATA = this.core.instance.exports.bytes_per_cell_data();
        this.BYTES_PER_RENDER_CELL = this.core.instance.exports.bytes_per_render_cell();

        this.bufferOffsetsTableOffset = CELL_LIMIT * this.BYTES_PER_CELL_DATA;
        console.log(`Table offset: ${this.bufferOffsetsTableOffset}`);
        this.renderBufferOffset = this.bufferOffsetsTableOffset + CELL_TYPES * 2; // Offset table
        console.log(`Render buffers offset: ${this.renderBufferOffset}`);
        this.renderBufferEnd = this.renderBufferOffset + CELL_LIMIT * this.BYTES_PER_RENDER_CELL;
        console.log(`Render buffer end ${this.renderBufferEnd}`);

        this.bufferOffsetsTable = new Uint16Array(this.core.buffer, this.bufferOffsetsTableOffset, CELL_TYPES); 
        this.dataBuffer = this.core.HEAPU8.subarray(0, this.renderBufferOffset);
        this.renderBuffer = this.core.HEAPU8.subarray(this.renderBufferOffset, this.renderBufferEnd);

        // console.log(`Supported WebGL2 extensions: `, gl.getSupportedExtensions());
        if (!gl.getExtension("EXT_color_buffer_float")) {
            console.error("FLOAT color buffer not available");
            return;
        }

        gl.enable(gl.BLEND);
        gl.depthMask(false);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const peel_prog1 = this.peel_prog1 = makeProgram(gl, CELL_VERT_SHADER_SOURCE, CELL_FRAG_PEELING_SHADER_SOURCE);
        const debug_prog = this.debug_prog = makeProgram(gl, CELL_VERT_SHADER_SOURCE, CELL_FRAG_DEBUG_SHADER_SOURCE);
        const blend_prog = this.blend_prog = makeProgram(gl, QUAD_VERT_SHADER_SOURCE, BLEND_BACK_FRAG_SHADER_SOURCE);
        const final_prog = this.final_prog = makeProgram(gl, QUAD_VERT_SHADER_SOURCE, FINAL_FRAG_SHADER_SOURCE);
        // this.fxaaProg = makeProgram(gl, FXAA_VERT_SHADER_SOURCE, FXAA_FRAG_SHADER_SOURCE);
    
        this.loadUniform(peel_prog1, "u_depth");
        this.loadUniform(peel_prog1, "u_front_color");

        this.loadUniform(peel_prog1, "u_proj");
        this.loadUniform(peel_prog1, "u_circle_color");

        this.loadUniform(peel_prog1, "u_circle");
        this.loadUniform(peel_prog1, "u_skin");
        
        this.loadUniform(debug_prog, "u_proj");
        this.loadUniform(debug_prog, "u_circle_color");

        this.loadUniform(blend_prog, "u_back_color");

        this.loadUniform(final_prog, "u_front_color");
        this.loadUniform(final_prog, "u_back_color");

        this.setUpPeelingBuffers();
        this.generateQuadVAO();
        this.generateCircleTexture();
        this.generateMassTextures();

        const GEN_CELLS = 65536;
        const view = new DataView(this.dataBuffer.buffer, 0, GEN_CELLS * this.BYTES_PER_CELL_DATA);
        
        const RNGRange = (min, max) => Math.random() * (max - min) + min;
        const genCell = () => {
            for (let i = 0; i < GEN_CELLS; i++) {
                const o = this.BYTES_PER_CELL_DATA * i;
                const type = ~~(255 * Math.random() + 1);
                const x = RNGRange(-POS_RANGE, POS_RANGE);
                const y = RNGRange(-POS_RANGE, POS_RANGE);
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
        genCell();

        // const render_view = new DataView(this.core.buffer, this.renderBufferOffset, GEN_CELLS * BYTES_PER_RENDER_CELL);
        // for (let i = 0; i < 256; i++)
        //     console.log(`Cell#${i} ` + 
        //                 `x: ${render_view.getFloat32(i * 12, true)}, ` +
        //                 `y: ${render_view.getFloat32(i * 12 + 4, true)}, ` +
        //                 `size: ${render_view.getFloat32(i * 12 + 8, true)}`);

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

        gl.useProgram(debug_prog);
        gl.useProgram(final_prog);
        gl.uniform1i(this.getUniform(final_prog, "u_back_color"), 6);
        
        gl.activeTexture(gl.TEXTURE11);
        const empty_texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, empty_texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        this.start();
    }

    /** @param {string} name */
    allocBuffer(name) {
        if (this.buffers.has(name)) throw new Error(`Already allocated buffer "${name}"`);
        this.buffers.set(name, this.gl.createBuffer());
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

        gl.useProgram(this.peel_prog1);
        gl.uniform1i(this.getUniform(this.peel_prog1, "u_depth"), 3);
        gl.uniform1i(this.getUniform(this.peel_prog1, "u_front_color"), 4);
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

        const MASS_FONT_WIDTH  = 128;
        const MASS_FONT_HEIGHT = 128;
        const MASS_CHARS       = "0123456789.k".split("");
        const MASS_FONT_COUNT  = MASS_CHARS.length;
        const FONT_WIDTHS = [];

        {
            gl.texImage3D(
                gl.TEXTURE_2D_ARRAY,
                0,
                gl.RGBA,
                MASS_FONT_WIDTH,
                MASS_FONT_HEIGHT,
                MASS_FONT_COUNT,
                0,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                null
            );

            const temp = new OffscreenCanvas(MASS_FONT_WIDTH, MASS_FONT_HEIGHT);
            const temp_ctx = temp.getContext("2d");

            temp_ctx.font = "128px Bree Serif";
            temp_ctx.fillStyle = "white";
            temp_ctx.strokeStyle = "black";
            temp_ctx.textAlign = "center";
            temp_ctx.lineWidth = 8;
            temp_ctx.textBaseline = "middle";

            for (const index in MASS_CHARS) {
                const char = MASS_CHARS[index];
                temp_ctx.strokeText(char, temp.width >> 1, 0);
                temp_ctx.fillText(char, temp.width >> 1, 0);
                FONT_WIDTHS.push(temp_ctx.measureText(char).width);
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
            }
        
            gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        }
    }

    screenToWorld(out = vec3.create(), x = 0, y = 0) {
        const temp = mat4.create();
        mat4.invert(temp, this.proj);
        vec3.transformMat4(out, [x, -y, 0], temp);
    }

    updateTarget() {
        // Screen space to world space
        this.screenToWorld(this.target.position,
            this.mouse.x / this.viewport.width  * 2 - 1, 
            this.mouse.y / this.viewport.height * 2 - 1);

        this.target.scale *= (1 + this.mouse.resetScroll() / 1000);
        this.target.scale = Math.max(this.target.scale, 0.01);
        this.target.scale = Math.min(this.target.scale, 10000);
    }

    // Smooth update camera
    lerpCamera(d = 1 / 60) {
        vec3.lerp(this.camera.position, this.camera.position, this.target.position, d);
        this.camera.scale += (this.target.scale - this.camera.scale) * d * ZOOM_SPEED;

        const x = this.camera.position[0];
        const y = this.camera.position[1];
        const hw = this.viewport.width  * this.camera.scale / 2;
        const hh = this.viewport.height * this.camera.scale / 2;

        mat4.ortho(this.proj, x - hw, x + hw, y - hh, y + hh, 0, 1);
    }

    checkViewport() {
        const gl = this.gl;
        if (gl.canvas.width != this.viewport.width || gl.canvas.height != this.viewport.height) {
            gl.canvas.width  = this.viewport.width;
            gl.canvas.height = this.viewport.height;
        }
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

        const main_prog = DEBUG ? this.debug_prog : this.peel_prog1;
        gl.useProgram(main_prog);

        gl.uniformMatrix4fv(this.getUniform(main_prog, "u_proj"), false, this.proj);

        this.updateTarget();
        this.lerpCamera(delta / 1000);
        
        this.core.instance.exports.draw(0, this.bufferOffsetsTableOffset, this.renderBufferOffset, 0.5);

        this.checkViewport();

        const drawCells = () => {
            gl.bindVertexArray(this.quadVAO);

            for (let i = 1; i < CELL_TYPES; i++) {
                const begin = this.bufferOffsetsTable[i - 1] || (i == 1 ? 0 : 65536);
                const end   = this.bufferOffsetsTable[i] || 65536;
                if (begin >= end) continue;

                const color = getColor(i);
                gl.uniform3f(this.getUniform(main_prog, "u_circle_color"), color[0], color[1], color[2]);

                const begin_offset = this.renderBufferOffset + begin * this.BYTES_PER_RENDER_CELL;
                const buffer_length = (end - begin) * this.BYTES_PER_RENDER_CELL;

                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.get("cell_data_buffer"));
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.core.HEAPU8, begin_offset, buffer_length);
                gl.bindBuffer(gl.ARRAY_BUFFER, null);

                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, end - begin);
            }
        }

        if (DEBUG) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            drawCells();
        } else {
            const NUM_PASS = 2;
            this.clearPeelingBuffers();
            const offsetBack = this.depthPeelRender(NUM_PASS, drawCells);
            
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
        }
        
        this.bufferOffsetsTable.fill(0);

        // FXAA prog
        // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // gl.clearColor(0, 0, 0, 1);
        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // gl.useProgram(fxaaProg);

        // gl.bindVertexArray(vao);
        // gl.drawArrays(gl.TRIANGLES, 0, 6);
        // this.stop();
        // setTimeout(() => this.stop(), 3000);
    }

    /** @param {() => void} func */
    depthPeelRender(passes = 4, func) {
        func();

        const gl = this.gl;

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
            gl.useProgram(this.peel_prog1);
            gl.uniform1i(this.getUniform(this.peel_prog1, "u_depth"), offsetRead);
            gl.uniform1i(this.getUniform(this.peel_prog1, "u_front_color"), offsetRead + 1);

            // draw geometry
            func();

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

self.onmessage = function(e) {
    const { data } = e;
    const renderer = new Renderer(data.offscreen);
    renderer.mouse.setBuffer(data.mouse);
    renderer.viewport.setBuffer(data.viewport);
    self.removeEventListener("message", this);
};
