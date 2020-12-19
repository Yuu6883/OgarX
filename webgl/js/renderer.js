importScripts("men.js", "shaders.js");

const Target = {
    x: 0,
    y: 0,
    scale: 1000,
}

const Camara = {
    x: 0,
    y: 0,
    scale: 1
}

const Viewport = {
    width: 0,
    height: 0
}

const IMG_DIM = 512;
const NAME_TEXTURE_RES = 512;
const PLAYER_LIMIT = 256;
const CanvasWorker = new Worker("canvas.js");

/** @param {{ id: number, skin: string, name: string }} data */
const loadSkinAndName = data => CanvasWorker.postMessage(data);

/** @type {OffscreenCanvas} */
let offscreen = null;
/** @type {WebGL2RenderingContext} */
let gl = null;

/** @type {Map<number, { skin: string, name: string }>} player data */
const PlayerData = new Map();

/** @type {Map<number, [ImageBitmap, ImageBitmap]>} */
const CanvasUpdates = new Map();

const Mouse = new class {

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
    updateScroll(v) { Atomics.add(this.buffer, 2, -v); }
    resetScroll() { return Atomics.exchange(this.buffer, 2, 0); }
}

onmessage = e => {
    const { data } = e;
    if (!data) return;

    if (!offscreen) {
        offscreen = data.offscreen;
        Viewport.width  = offscreen.width;
        Viewport.height = offscreen.height;
    }

    if (data.mouse) Mouse.setBuffer(data.mouse);

    if (!gl) initEngine();
    if (data.resize) resize(data.width, data.height);
};

CanvasWorker.onmessage = e => {
    /** @type {{ data: { id: number, skin: ImageBitmap, name: ImageBitmap }}}} */
    const { data } = e;
    if (data) {
        CanvasUpdates.set(data.id, [data.skin, data.name]);
        console.log(`PlayerData#${data.id} loaded`);
    }
}

const resize = (width, height) => {
    if (Viewport.width != width || Viewport.height != height) {
        Viewport.width  = width;
        Viewport.height = height;
        console.log(`Resizing: [${width}, ${height}]`);
    }
}

const UPDATE_LIMIT = 1;

let mipmap_update = false;
const updatePlayerData = () => {
    let limit = 0;
    for (const [id, [skin, name]] of [...CanvasUpdates.entries()]) {
        if (limit++ >= UPDATE_LIMIT) break;

        gl.activeTexture(gl.TEXTURE11);
        gl.texSubImage3D(
            gl.TEXTURE_2D_ARRAY,
            0,
            0,
            0,
            id,
            IMG_DIM,
            IMG_DIM,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            skin);
        skin.close();

        gl.activeTexture(gl.TEXTURE12);
        gl.texSubImage3D(
            gl.TEXTURE_2D_ARRAY,
            0,
            0,
            0,
            id,
            NAME_TEXTURE_RES,
            NAME_TEXTURE_RES,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            name);
        name.close();

        CanvasUpdates.delete(id);
    }
    mipmap_update = true;
}

setInterval(() => {
    if (mipmap_update) {
        mipmap_update = false;
        gl.activeTexture(gl.TEXTURE11);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.activeTexture(gl.TEXTURE12);
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    }
}, 1000);

const CELL_LIMIT = 2 ** 16;
const MIN_SIZE = 500;
const SIZE_RANGE = 10000;
const POS_RANGE = 1000000;
const SORT_SCENE = false;

/** @param {[]} array */
const pick = array => array[~~(Math.random() * array.length)];

/** @param {Float32Array} array */
const genCell = array => {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.sqrt(Math.random()) * POS_RANGE;
    // x
    array[0] = Math.sin(angle) * dist;
    // y
    array[1] = Math.cos(angle) * dist;
    // Size
    array[2] = Math.random() * SIZE_RANGE + MIN_SIZE;
    // Skin
    array[3] = 1 + ~~(Math.random() * (PLAYER_LIMIT - 2));
    // r
    array[4] = Math.random();
    // g
    array[5] = Math.random();
    // b
    array[6] = Math.random();
}

/**
 * @param {string} vs_src
 * @param {string} fs_src
 */
const makeProgram = (vs_src, fs_src) => {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);

    gl.shaderSource(vs, vs_src);
    gl.shaderSource(fs, fs_src);

    gl.compileShader(vs);
    gl.compileShader(fs);

    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error(`vs info-log: ${gl.getShaderInfoLog(vs)}\n` +
                      `info-log: ${gl.getShaderInfoLog(fs)}`);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return;
    }

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(`prog link failed: ${gl.getProgramInfoLog(prog)}`);
        gl.deleteProgram(prog);
        return;
    }

    return prog;
}

const initEngine = async () => {

    gl = offscreen.getContext("webgl2", { premultipliedAlpha: false });
    if (!gl) return console.error("WebGL2 Not Supported");
    
    console.log("Loading WASM...");
    await Module.load();
    const CellDataBuffer = Module.HEAPF32.subarray(0, CELL_LIMIT * 7);
    
    console.log(`Supported WebGL2 extensions: ${gl.getSupportedExtensions().join(", ")}`);
    
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

    const depthPeelProg = makeProgram(CELL_VERT_SHADER_SOURCE, CELL_FRAG_PEELING_SHADER_SOURCE);
    if (!depthPeelProg) return;
    const blendbackProg = makeProgram(QUAD_VERT_SHADER_SOURCE, BLEND_BACK_FRAG_SHADER_SOURCE);
    if (!blendbackProg) return;
    const finalProg = makeProgram(QUAD_VERT_SHADER_SOURCE, FINAL_FRAG_SHADER_SOURCE);
    if (!finalProg) return;
    // const fxaaProg = makeProgram(FXAA_VERT_SHADER_SOURCE, FXAA_FRAG_SHADER_SOURCE);
    // if (!fxaaProg) return;

    // Attributes and uniforms
    const a_position = gl.getAttribLocation(depthPeelProg, "a_position");
    const a_color    = gl.getAttribLocation(depthPeelProg, "a_color");
    const a_data     = gl.getAttribLocation(depthPeelProg, "a_data");

    const u_resolution = gl.getUniformLocation(depthPeelProg, "u_resolution");
    const u_names      = gl.getUniformLocation(depthPeelProg, "u_names");
    const u_skins      = gl.getUniformLocation(depthPeelProg, "u_skins");
    const u_view       = gl.getUniformLocation(depthPeelProg, "u_view");
    const u_circle     = gl.getUniformLocation(depthPeelProg, "u_circle");
    const u_hue        = gl.getUniformLocation(depthPeelProg, "u_hue");

    const peeling_u_depth = gl.getUniformLocation(depthPeelProg, "uDepth");
    const peeling_u_front = gl.getUniformLocation(depthPeelProg, "uFrontColor");

    const final_u_front = gl.getUniformLocation(finalProg, "uFrontColor");
    const final_u_back  = gl.getUniformLocation(finalProg, "uBackColor");

    const blendback_color = gl.getUniformLocation(blendbackProg, "uBackColor");

    // const fxaa_tex = gl.getUniformLocation(fxaaProg, "tDiffuse");
    // const fxaa_res = gl.getUniformLocation(fxaaProg, "resolution");

    // Framebuffers
    const depthPeelBuffers = [gl.createFramebuffer(), gl.createFramebuffer()];

    const colorBuffers = [gl.createFramebuffer(), gl.createFramebuffer()];

    const blendBackBuffer = gl.createFramebuffer();
    // const fxaaBuffer = gl.createFramebuffer();

    // Texture unit 0-5 are used
    for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, depthPeelBuffers[i]);
        const texture_unit_offset = i * 3;

        const depthTarget  = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + texture_unit_offset);
        gl.bindTexture(gl.TEXTURE_2D, depthTarget); 

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1920, 1080, 0, gl.RG, gl.FLOAT, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, depthTarget, 0);

        const frontColorTarget = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1 + texture_unit_offset);
        gl.bindTexture(gl.TEXTURE_2D, frontColorTarget);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, frontColorTarget, 0);

        const backColorTarget = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2 + texture_unit_offset);
        gl.bindTexture(gl.TEXTURE_2D, backColorTarget);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, backColorTarget, 0);

        gl.bindFramebuffer(gl.FRAMEBUFFER, colorBuffers[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, frontColorTarget, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, backColorTarget, 0);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, blendBackBuffer);
    // Texture6
    const blendBackTarget = gl.createTexture();
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, blendBackTarget);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blendBackTarget, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    // gl.bindFramebuffer(gl.FRAMEBUFFER, fxaaBuffer);
    // Texture7
    // const fxaaTarget = gl.createTexture();
    // gl.activeTexture(gl.TEXTURE7);
    // gl.bindTexture(gl.TEXTURE_2D, fxaaTarget);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1920, 1080, 0, gl.RGBA, gl.HALF_FLOAT, null);
    // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fxaaTarget, 0);
    // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    const vao = gl.createVertexArray();
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
        gl.enableVertexAttribArray(quadArray);
        const size = 2;
        const type = gl.FLOAT;
        const normalize = false;
        const stride = 0;
        const offset = 0;
        gl.vertexAttribPointer(a_position, size, type, normalize, stride, offset);
    }

    const GEN_CELLS = CELL_LIMIT;
        
    const cells = [];

    for (let i = 0; i < GEN_CELLS; i++) {
        const cell = CellDataBuffer.subarray(7 * i, 7 * (i + 1));
        genCell(cell);
        cells.push(cell);
    }

    /*
    let now = performance.now();
    cells.sort((a, b) => a[2] - b[2]);
    console.log(`JS sort took: ${(performance.now() - now).toFixed(4)}ms`);

    now = performance.now();
    Module.instance.exports.sort(0, CELL_LIMIT);
    console.log(`WASM sort took: ${(performance.now() - now).toFixed(4)}ms`); */
    

    const cell_data_buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, cell_data_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, CellDataBuffer, gl.DYNAMIC_DRAW);
    
    // Bind data (position + size + pid)
    {
        gl.enableVertexAttribArray(a_data);
        const size = 4;          
        const type = gl.FLOAT;   
        const normalize = false; 
        const stride = 4 * 7;
        const offset = 0;
        gl.vertexAttribPointer(a_data, size, type, normalize, stride, offset);
        gl.vertexAttribDivisor(a_data, 2);
    }
    // Bind color
    {
        gl.enableVertexAttribArray(a_color);
        const size = 3;
        const type = gl.FLOAT;
        const normalize = false; 
        const stride = 4 * 7;
        const offset = 4 * 4;
        gl.vertexAttribPointer(a_color, size, type, normalize, stride, offset);
        gl.vertexAttribDivisor(a_color, 2);
    }

    // Create circle texture on texture10
    const circle_texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, circle_texture);
    // Generating circle
    {
        const CIRCLE_RADIUS = 2048;
        const MARGIN = 10;
        console.log(`Generating ${CIRCLE_RADIUS * 2}x${CIRCLE_RADIUS * 2} circle texture`);
        const temp = new OffscreenCanvas((CIRCLE_RADIUS + MARGIN) * 2, (CIRCLE_RADIUS + MARGIN) * 2);
        const temp_ctx = temp.getContext("2d");
        temp_ctx.fillStyle = "yellow";
        temp_ctx.arc(CIRCLE_RADIUS + MARGIN, CIRCLE_RADIUS + MARGIN, CIRCLE_RADIUS, 0, 2 * Math.PI, false);
        temp_ctx.fill();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, temp);
            
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }

    // Create skin texture array on texture 11
    const skin_texture_array = gl.createTexture();

    {
        gl.activeTexture(gl.TEXTURE11);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, skin_texture_array);
        
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    
        // Allocate vram for skins
        gl.texImage3D(
            gl.TEXTURE_2D_ARRAY,
            0,
            gl.RGBA,
            IMG_DIM,
            IMG_DIM,
            PLAYER_LIMIT,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
        );
    }

    // Create name texture array on texture 12
    const name_texture_array = gl.createTexture();

    {
        gl.activeTexture(gl.TEXTURE12);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, name_texture_array);
        
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    
        // Allocate vram for skins
        gl.texImage3D(
            gl.TEXTURE_2D_ARRAY,
            0,
            gl.RGBA,
            NAME_TEXTURE_RES,
            NAME_TEXTURE_RES,
            PLAYER_LIMIT,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null
        );
    }

    // Create mass texture on texture 13
    const mass_texture_array = gl.createTexture();
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, mass_texture_array);

    const MASS_FONT_WIDTH  = 128;
    const MASS_FONT_HEIGHT = 128;
    const MASS_CHARS       = "0123456789.k".split("");
    const MASS_FONT_COUNT  = MASS_CHARS.length;
    const FONT_WIDTHS = {};

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

        console.log("loading font");
        const font = new FontFace("Bree Serif", "url(../font/BreeSerif-Regular.ttf)");
        fonts.add(font);
        await font.load();

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
            FONT_WIDTHS[char] = temp_ctx.measureText(char).width;
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
        
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    }

    const res = await fetch("/data/bots.json");
    const bots = await res.json();
    
    for (let id = 1; id < PLAYER_LIMIT; id++)
        loadSkinAndName({ id, name: "Luka", skin: pick(bots.skins) });

    gl.useProgram(depthPeelProg);
    gl.bindVertexArray(vao);

    gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(u_circle, 10);
    gl.uniform1i(u_skins,  11);
    gl.uniform1i(u_names,  12);
    gl.uniform1f(u_hue, 0);

    gl.useProgram(finalProg);
    gl.uniform1i(final_u_back, 6);

    // gl.useProgram(fxaaProg);
    // gl.uniform1i(fxaa_tex, 7);
    // gl.uniform2f(fxaa_res, 1 / 1024, 1 / 512);

    const DEPTH_CLEAR_VALUE = -99999.0;
    const MIN_DEPTH = 0.0;
    const MAX_DEPTH = 1.0;

    let hue = 0;
    let lastTimestamp;
    (function render(now) {

        Target.x = Camara.x + (Mouse.x - offscreen.width  / 2);
        Target.y = Camara.y + (Mouse.y - offscreen.height / 2);
        Target.scale *= (1 - (Mouse.resetScroll() / 1000));
        Target.scale = Math.min(Math.max(Target.scale, 300), 10000000);

        if (!lastTimestamp) {
            lastTimestamp = now;
            requestAnimationFrame(render);
            return;
        }
        const delta = now - lastTimestamp;
        
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.useProgram(depthPeelProg);

        if (gl.canvas.width != Viewport.width || gl.canvas.height != Viewport.height) {
            gl.canvas.width  = Viewport.width;
            gl.canvas.height = Viewport.height;
            gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
            postMessage({ resized: Viewport });
        }

        // Dual depth peeling stuff
        {
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, blendBackBuffer);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depthPeelBuffers[0]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.clearColor(DEPTH_CLEAR_VALUE, DEPTH_CLEAR_VALUE, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depthPeelBuffers[1]);
            gl.clearColor(-MIN_DEPTH, MAX_DEPTH, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, colorBuffers[0]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, colorBuffers[1]);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            // draw depth for first pass to peel
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depthPeelBuffers[0]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.blendEquation(gl.MAX);

            gl.useProgram(depthPeelProg);
            gl.uniform1i(peeling_u_depth, 3);
            gl.uniform1i(peeling_u_front, 4);
        }

        // hue += delta;
        // gl.uniform1f(u_hue, hue / 500);

        // Process updated skins
        if (CanvasUpdates.size) updatePlayerData();

        // if (SORT_SCENE) {
        //     Module.instance.exports.sort(0, CELL_LIMIT);
        //     gl.bindBuffer(gl.ARRAY_BUFFER, cell_data_buffer);
        //     gl.bufferSubData(gl.ARRAY_BUFFER, 0, CellDataBuffer, 0, 7 * GEN_CELLS);
        // }

        // Smooth update camera
        Camara.scale += (50 / (Target.scale + 10) - Camara.scale) / delta;
        Camara.x += (Camara.x - Target.x) / (delta * 2.5) / Camara.scale;
        Camara.y += (Camara.y - Target.y) / (delta * 2.5) / Camara.scale;
        // console.log(`Camera: [${Camara.x}`, `${Camara.y}]`);

        const cameraMatrix = Mat3.mul(Mat3.trans(Camara.x * Camara.scale, Camara.y * Camara.scale), Mat3.scale(Camara.scale, Camara.scale));

        gl.uniformMatrix3fv(u_view, false, cameraMatrix);

        gl.bindVertexArray(vao);
        // TODO: update cell position etc
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, GEN_CELLS);

        const NUM_PASS = 4;
        // Dual depth peeling
        let readId, writeId;
        let offsetRead, offsetBack;

        // Dual depth peeling passes
        for (let pass = 0; pass < NUM_PASS; pass++) {
            readId = pass % 2;
            writeId = 1 - readId;  // ping-pong: 0 or 1
            
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depthPeelBuffers[writeId]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.clearColor(DEPTH_CLEAR_VALUE, DEPTH_CLEAR_VALUE, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, colorBuffers[writeId]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, depthPeelBuffers[writeId]);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
            gl.blendEquation(gl.MAX);

            // update texture uniform
            offsetRead = readId * 3;
            gl.useProgram(depthPeelProg);
            gl.uniform1i(peeling_u_depth, offsetRead);
            gl.uniform1i(peeling_u_front, offsetRead + 1);

            // draw geometry
            gl.bindVertexArray(vao);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, GEN_CELLS);

            // blend back color separately
            offsetBack = writeId * 3;
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, blendBackBuffer);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(blendbackProg);
            gl.uniform1i(blendback_color, offsetBack + 2);
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        // Final prog
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(finalProg);
        gl.uniform1i(final_u_front, offsetBack + 1);

        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // FXAA prog
        // gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        // gl.clearColor(0, 0, 0, 1);
        // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // gl.useProgram(fxaaProg);

        // gl.bindVertexArray(vao);
        // gl.drawArrays(gl.TRIANGLES, 0, 6);

        requestAnimationFrame(render);
        lastTimestamp = now;
    })();
}