importScripts("men.js");

const HUE_ROTATE1_FUNC = `vec3 hue_rotate1(vec3 src_rgb) {
    const vec3 kRGBToYPrime = vec3(0.299, 0.587, 0.114);
    const vec3 kRGBToI = vec3(0.596, -0.275, -0.321);
    const vec3 kRGBToQ = vec3(0.212, -0.523, 0.311);

    const vec3 kYIQToR = vec3(1.0, 0.956, 0.621);
    const vec3 kYIQToG = vec3(1.0, -0.272, -0.647);
    const vec3 kYIQToB = vec3(1.0, -1.107, 1.704);

    float YPrime = dot(src_rgb, kRGBToYPrime);
    float I = dot(src_rgb, kRGBToI);
    float Q = dot(src_rgb, kRGBToQ);
    float h = atan(Q, I);
    float chroma = sqrt(I * I + Q * Q);

    Q = chroma * sin(h + u_hue);
    I = chroma * cos(h + u_hue);

    vec3 yIQ = vec3 (YPrime, I, Q);

    return vec3(dot(yIQ, kYIQToR), dot(yIQ, kYIQToG), dot(yIQ, kYIQToB));
}`;
const HUE_ROTATE2_FUNC = `vec3 hue_rotate2(vec3 src_rgb) {
    const vec3 k = vec3(0.57735, 0.57735, 0.57735);
    float angle = cos(u_hue);
    return vec3(src_rgb * angle + cross(k, src_rgb) * sin(u_hue) + k * dot(k, src_rgb) * (1.0 - angle));
}`

const CELL_VERT_SHADER_SOURCE = 
`#version 300 es

precision mediump float;
precision mediump int;

uniform vec2 u_resolution;
uniform mat3 u_view;
uniform float u_hue;

in vec2 a_position;
in vec3 a_color;
in vec4 a_data;

out vec2 v_texcoord;
out vec3 bgc;
flat out int player_id;

${HUE_ROTATE1_FUNC}
${HUE_ROTATE2_FUNC}

void main() {
    // Map from -1 to 1 -> 0 to 1
    v_texcoord = (a_position + 1.0) / 2.0;

    vec2 quad_pos = a_position * a_data.z + a_data.xy;
    player_id = int(a_data.w);

    vec2 camera_pos = (u_view * vec3(quad_pos, 1)).xy;

    // convert the position from pixels to -1.0 to 1.0
    vec2 clipSpace = camera_pos / u_resolution;

    gl_Position = vec4(clipSpace * vec2(1, -1), 1.0 - a_data.z / 10000.0, 1);

    bgc = hue_rotate2(a_color);
}
`;

const CELL_FRAG_SHADER_SOURCE = 
`#version 300 es

#define PI 3.1415926538

precision mediump float;
precision mediump int;
precision mediump sampler2DArray;
precision mediump sampler2D;

uniform sampler2DArray u_sampler2D;
uniform sampler2D u_circle;

in vec3 background_color;
in vec2 v_texcoord;
in vec3 bgc;
flat in int player_id;

out vec4 color;

void main() {
    vec4 circle = texture(u_circle, v_texcoord);
    if (circle.a == 0.0) {
        gl_FragDepth = 0.0;
        discard;
    } else if (circle.a < 1.0) {
        gl_FragDepth = 1.0;
        vec4 src = texture(u_sampler2D, vec3(v_texcoord, player_id));
        color = vec4(mix(bgc, src.rgb, src.a) * circle.a, circle.a);
    } else {
        gl_FragDepth = gl_FragCoord.z;
        vec4 src = texture(u_sampler2D, vec3(v_texcoord, player_id));
        color = vec4(mix(bgc, src.rgb, src.a) * circle.a, circle.a);
    }
}
`;

const Mat3 = {
    mul: (a, b) => {
        const a00 = a[0 * 3 + 0];
        const a01 = a[0 * 3 + 1];
        const a02 = a[0 * 3 + 2];
        const a10 = a[1 * 3 + 0];
        const a11 = a[1 * 3 + 1];
        const a12 = a[1 * 3 + 2];
        const a20 = a[2 * 3 + 0];
        const a21 = a[2 * 3 + 1];
        const a22 = a[2 * 3 + 2];
        const b00 = b[0 * 3 + 0];
        const b01 = b[0 * 3 + 1];
        const b02 = b[0 * 3 + 2];
        const b10 = b[1 * 3 + 0];
        const b11 = b[1 * 3 + 1];
        const b12 = b[1 * 3 + 2];
        const b20 = b[2 * 3 + 0];
        const b21 = b[2 * 3 + 1];
        const b22 = b[2 * 3 + 2];
    
        return [
            b00 * a00 + b01 * a10 + b02 * a20,
            b00 * a01 + b01 * a11 + b02 * a21,
            b00 * a02 + b01 * a12 + b02 * a22,
            b10 * a00 + b11 * a10 + b12 * a20,
            b10 * a01 + b11 * a11 + b12 * a21,
            b10 * a02 + b11 * a12 + b12 * a22,
            b20 * a00 + b21 * a10 + b22 * a20,
            b20 * a01 + b21 * a11 + b22 * a21,
            b20 * a02 + b21 * a12 + b22 * a22,
        ];
    },
    trans: (x, y) => {
        return [
            1, 0, 0,
            0, 1, 0,
            x, y, 1,
        ];
    },
    scale: (sx, sy) => {
        return [
            sx, 0, 0,
            0, sy, 0,
            0,  0, 1,
        ];
    },
}

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
const SKIN_LIMIT = 100;
const SkinWorker = new Worker("skins.js");

// Offset 0 is reserved (transparent/nothing)
let skinOffset = 1;

/** @type {OffscreenCanvas} */
let offscreen = null;
/** @type {WebGL2RenderingContext} */
let gl = null;
/** @type {WebGLProgram} */
let cell_prog = null;

/** @type {Map<string, number>} */
const SkinCache = new Map();
/** @type {Map<number, ImageBitmap>} */
const SkinUpdates = new Map();

onmessage = e => {
    const { data } = e;
    if (!data) return;

    if (!offscreen) {
        offscreen = data.offscreen;
        Viewport.width  = offscreen.width;
        Viewport.height = offscreen.height;
    }

    if (data.mouse) {
        Target.x = Camara.x + (data.mouse.x - offscreen.width  / 2);
        Target.y = Camara.y + (data.mouse.y - offscreen.height / 2);
        Target.scale *= (1 - (data.mouse.scroll / 1000));
        Target.scale = Math.min(Math.max(Target.scale, 300), 10000000);
    }

    if (!gl) initProgram();
    if (data.resize) resize(data.width, data.height);
    if (data.skins && Array.isArray(data.skins)) loadSkin(...data.skins);
};

SkinWorker.onmessage = e => {
    /** @type {{data:{skins:{url:string, buffer:ImageBitmap}[]}}} */
    const { data } = e;
    if (data && data.skins) {
        for (const skin of data.skins) {
            if (SkinCache.has(skin.url)) continue;

            SkinUpdates.set(skinOffset, skin.buffer);
            SkinCache.set(skin.url, skinOffset);
            skinOffset++;

            console.log(`Skin loaded: ${skin.url}`);
        }
    }
}

const resize = (width, height) => {
    if (Viewport.width != width || Viewport.height != height) {
        Viewport.width  = width;
        Viewport.height = height;
        console.log(`Resizing: [${width}, ${height}]`);
    }
}

const CELL_LIMIT = 2 ** 14;
const MIN_SIZE = 300
const SIZE_RANGE = 10000;
const POS_RANGE = 400000;
const SORT_SCENE = true;

/** @param {Float32Array} array */
const genCell = array => {
    // x
    array[0] = Math.random() * 2 * POS_RANGE - POS_RANGE;
    // y
    array[1] = Math.random() * 2 * POS_RANGE - POS_RANGE;
    // Size
    array[2] = Math.random() * SIZE_RANGE + MIN_SIZE;
    // Skin
    array[3] = 0;
    // r
    array[4] = Math.random();
    // g
    array[5] = Math.random();
    // b
    array[6] = Math.random();
}

const initProgram = async () => {

    gl = offscreen.getContext("webgl2", { premultipliedAlpha: false, depth: true });
    if (!gl || cell_prog) return console.log("Nope");
    
    console.log("Loading WASM...");
    await Module.load();
    const CellDataBuffer = Module.HEAPF32.subarray(0, CELL_LIMIT * 7);
    
    console.log(`Supported WebGL2 extensions: ${gl.getSupportedExtensions().join(", ")}`);

    {
        const cell_vs = gl.createShader(gl.VERTEX_SHADER);
        const cell_fs = gl.createShader(gl.FRAGMENT_SHADER);
    
        gl.shaderSource(cell_vs, CELL_VERT_SHADER_SOURCE);
        gl.shaderSource(cell_fs, CELL_FRAG_SHADER_SOURCE);
    
        gl.compileShader(cell_vs);
        gl.compileShader(cell_fs);
    
        if (!gl.getShaderParameter(cell_vs, gl.COMPILE_STATUS) || !gl.getShaderParameter(cell_fs, gl.COMPILE_STATUS)) {
            console.error(`cell_vs info-log: ${gl.getShaderInfoLog(cell_vs)}\n` +
                          `cell_fs info-log: ${gl.getShaderInfoLog(cell_fs)}`);
            gl.deleteShader(cell_vs);
            gl.deleteShader(cell_fs);
            return;
        }
    
        cell_prog = gl.createProgram();
        gl.attachShader(cell_prog, cell_vs);
        gl.attachShader(cell_prog, cell_fs);
        gl.linkProgram(cell_prog);
    
        if (!gl.getProgramParameter(cell_prog, gl.LINK_STATUS)) {
            console.error(`cell_prog link failed: ${gl.getProgramInfoLog(cell_prog)}`);
            gl.deleteProgram(cell_prog);
            return;
        }
    }

    // Quad fields
    const a_position = gl.getAttribLocation(cell_prog, "a_position");
    const a_color = gl.getAttribLocation(cell_prog, "a_color");
    const a_data = gl.getAttribLocation(cell_prog, "a_data");

    const u_resolution = gl.getUniformLocation(cell_prog, "u_resolution");
    const u_sampler2D = gl.getUniformLocation(cell_prog, "u_sampler2D");
    const u_view = gl.getUniformLocation(cell_prog, "u_view");
    const u_circle = gl.getUniformLocation(cell_prog, "u_circle");
    const u_hue = gl.getUniformLocation(cell_prog, "u_hue");
    
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    const pos_buffer = gl.createBuffer();

    gl.bindBuffer(gl.ARRAY_BUFFER, pos_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        +1, -1,
        -1, +1,
        -1, +1,
        +1, -1,
        +1, +1,
    ]), gl.STATIC_DRAW);

    {
        gl.enableVertexAttribArray(pos_buffer);
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

    // Create circle texture
    const circle_texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, circle_texture);

    {
        const CIRCLE_RADIUS = 2048;
        console.log(`Generating ${CIRCLE_RADIUS * 2}x${CIRCLE_RADIUS * 2} circle texture`);
        const temp = new OffscreenCanvas(CIRCLE_RADIUS * 2, CIRCLE_RADIUS * 2);
        const temp_ctx = temp.getContext("2d");
        temp_ctx.fillStyle = "yellow";
        temp_ctx.arc(CIRCLE_RADIUS, CIRCLE_RADIUS, CIRCLE_RADIUS, 0, 2 * Math.PI, false);
        temp_ctx.fill();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, 
            temp_ctx.getImageData(0, 0, CIRCLE_RADIUS * 2, CIRCLE_RADIUS * 2));
            
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
    }

    // Create skin texture array
    const skin_texture_array = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, skin_texture_array);
    
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.texImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        gl.RGBA,
        IMG_DIM,
        IMG_DIM,
        SKIN_LIMIT,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array(IMG_DIM * IMG_DIM * SKIN_LIMIT * 4)
    );

    const mass_texture_array = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, mass_texture_array);

    const MASS_FONT_WIDTH  = 128;
    const MASS_FONT_HEIGHT = 128;
    const MASS_CHARS       = "0123456789.k".split("");
    const MASS_FONT_COUNT  = MASS_CHARS.length;

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
            new Uint8Array(MASS_FONT_COUNT * MASS_FONT_HEIGHT * MASS_FONT_WIDTH * 4)
        );

        console.log("loading font");
        const font = new FontFace("Bree Serif", "url(../font/BreeSerif-Regular.ttf)");
        fonts.add(font);
        await font.load();

        const temp = new OffscreenCanvas(MASS_FONT_WIDTH, MASS_FONT_HEIGHT);
        const temp_ctx = temp.getContext("2d");

        temp_ctx.font = "128px Bree Serif";
        temp_ctx.fillStyle = "black";
        temp_ctx.strokeStyle = "white";
        temp_ctx.textAlign = "center";
        temp_ctx.lineWidth = 15;

        for (const index in MASS_CHARS) {
            const char = MASS_CHARS[index];
            temp_ctx.fillText(char, 0, 0);
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
                temp_ctx.getImageData(0, 0, MASS_FONT_WIDTH, MASS_FONT_HEIGHT));
            temp_ctx.clearRect(0, 0, temp.width, temp.height);
        }

        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    }

    gl.useProgram(cell_prog);
    gl.bindVertexArray(vao);

    gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(u_sampler2D, 0);
    gl.uniform1i(u_circle, 1);
    gl.uniform1f(u_hue, 0);

    let hue = 0;
    let lastTimestamp;
    (function render(now) {

        if (!lastTimestamp) {
            lastTimestamp = now;
            requestAnimationFrame(render);
            return;
        }
        const delta = now - lastTimestamp;

        if (gl.canvas.width != Viewport.width || gl.canvas.height != Viewport.height) {
            gl.canvas.width  = Viewport.width;
            gl.canvas.height = Viewport.height;
            gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
            postMessage({ resized: Viewport });
        }

        gl.viewport(0, 0, offscreen.width, offscreen.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.enable(gl.DEPTH_TEST);
        gl.depthRange(0, 1);
        gl.depthMask(true);
    
        hue += delta;
        // gl.uniform1f(u_hue, hue / 500);

        if (SkinUpdates.size) {
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, skin_texture_array);
            for (const [offset, bitmap] of SkinUpdates) {
                gl.texSubImage3D(
                    gl.TEXTURE_2D_ARRAY,
                    0,
                    0,
                    0,
                    offset,
                    IMG_DIM,
                    IMG_DIM,
                    1,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    bitmap);
                bitmap.close();
            }
            SkinUpdates.clear();

            for (let i = 3; i < 7 * GEN_CELLS; i += 7)
                CellDataBuffer[i] = ~~(Math.random() * skinOffset);

        }

        if (SORT_SCENE) {
            // Module.instance.exports.sort(0, CELL_LIMIT);
        }

        // gl.bindBuffer(gl.ARRAY_BUFFER, cell_data_buffer);
        // gl.bufferSubData(gl.ARRAY_BUFFER, 0, CellDataBuffer, 0, 7 * GEN_CELLS);

        // Smooth update camera
        Camara.scale += (50 / (Target.scale + 10) - Camara.scale) / delta;
        Camara.x += (Camara.x - Target.x) / (delta * 2.5) / Camara.scale;
        Camara.y += (Camara.y - Target.y) / (delta * 2.5) / Camara.scale;
        // console.log(`Camera: [${Camara.x}`, `${Camara.y}]`);

        const cameraMatrix = Mat3.mul(Mat3.trans(Camara.x * Camara.scale, Camara.y * Camara.scale), Mat3.scale(Camara.scale, Camara.scale));

        gl.uniformMatrix3fv(u_view, false, cameraMatrix);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, GEN_CELLS);

        requestAnimationFrame(render);
        lastTimestamp = now;
    })();
}

/** @param {string[]} urls */
const loadSkin = (...urls) => SkinWorker.postMessage({ skins: urls.filter(url => !SkinCache.has(url)) });