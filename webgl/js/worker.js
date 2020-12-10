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

precision highp float;
precision highp int;

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

    gl_Position = vec4(clipSpace * vec2(1, -1), 1.0 / a_data.z, 1);

    bgc = hue_rotate2(a_color);
}
`;

const CELL_FRAG_PEELING_SHADER_SOURCE = 
`#version 300 es

#define PI 3.1415926538

precision highp float;
precision highp int;
precision highp sampler2DArray;
precision highp sampler2D;

#define MAX_DEPTH 99999.0

uniform sampler2DArray u_skins;
uniform sampler2D u_circle;

uniform sampler2D uDepth;
uniform sampler2D uFrontColor;

in vec3 background_color;
in vec2 v_texcoord;
in vec3 bgc;
flat in int player_id;

layout(location=0) out vec2 depth;  // RG32F, R - negative front depth, G - back depth
layout(location=1) out vec4 frontColor;
layout(location=2) out vec4 backColor;

void main() {

    float fragDepth = gl_FragCoord.z;   // 0 - 1

    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    vec2 lastDepth = texelFetch(uDepth, fragCoord, 0).rg;
    vec4 lastFrontColor = texelFetch(uFrontColor, fragCoord, 0);

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


    if (fragDepth < nearestDepth || fragDepth > furthestDepth) {
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

    vec4 circle = texture(u_circle, v_texcoord);
    // if (circle.a == 0.0) discard;

    vec4 src = texture(u_skins, vec3(v_texcoord, player_id));
    vec4 color = vec4(mix(bgc, src.rgb, src.a) * circle.a, circle.a);

    if (fragDepth == nearestDepth) {
        frontColor.rgb += color.rgb * color.a * alphaMultiplier;
        frontColor.a = 1.0 - alphaMultiplier * (1.0 - color.a);
    } else {
        backColor += color;
    }
}
`;

const QUAD_VERT_SHADER_SOURCE = 
`#version 300 es
layout(location=0) in vec4 aPosition;
void main() {
    gl_Position = aPosition;
}
`;

const BLEND_BACK_FRAG_SHADER_SOURCE =
`#version 300 es
precision highp float;

uniform sampler2D uBackColor;

out vec4 fragColor;
void main() {
    fragColor = texelFetch(uBackColor, ivec2(gl_FragCoord.xy), 0);
    if (fragColor.a == 0.0) { 
        discard;
    }
}
`;

const FINAL_FRAG_SHADER_SOURCE = 
`#version 300 es
precision highp float;

uniform sampler2D uFrontColor;
uniform sampler2D uBackColor;

out vec4 fragColor;
void main() {
    ivec2 fragCoord = ivec2(gl_FragCoord.xy);
    vec4 frontColor = texelFetch(uFrontColor, fragCoord, 0);
    vec4 backColor = texelFetch(uBackColor, fragCoord, 0);
    float alphaMultiplier = 1.0 - frontColor.a;

    fragColor = vec4(
        frontColor.rgb + alphaMultiplier * backColor.rgb,
        frontColor.a + backColor.a
    );
}`;

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
const SKIN_LIMIT = 256;
const SkinWorker = new Worker("skins.js");

// Offset 0 is reserved (transparent/nothing)
let skinOffset = 1;

/** @type {OffscreenCanvas} */
let offscreen = null;
/** @type {WebGL2RenderingContext} */
let gl = null;

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

    if (!gl) initEngine();
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

const CELL_LIMIT = 2 ** 16;
const MIN_SIZE = 300
const SIZE_RANGE = 10000;
const POS_RANGE = 1000000;
const SORT_SCENE = false;

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

    gl = offscreen.getContext("webgl2");
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

    // Attributes and uniforms
    const a_position = gl.getAttribLocation(depthPeelProg, "a_position");
    const a_color    = gl.getAttribLocation(depthPeelProg, "a_color");
    const a_data     = gl.getAttribLocation(depthPeelProg, "a_data");

    const u_resolution = gl.getUniformLocation(depthPeelProg, "u_resolution");
    const u_skins      = gl.getUniformLocation(depthPeelProg, "u_skins");
    const u_view       = gl.getUniformLocation(depthPeelProg, "u_view");
    const u_circle     = gl.getUniformLocation(depthPeelProg, "u_circle");
    const u_hue        = gl.getUniformLocation(depthPeelProg, "u_hue");

    const peeling_u_depth = gl.getUniformLocation(depthPeelProg, "uDepth");
    const peeling_u_front = gl.getUniformLocation(depthPeelProg, "uFrontColor");

    const final_u_front = gl.getUniformLocation(finalProg, "uFrontColor");
    const final_u_back  = gl.getUniformLocation(finalProg, "uBackColor");

    const blendback_color = gl.getUniformLocation(blendbackProg, "uBackColor");

    // Framebuffers
    const depthPeelBuffers = [gl.createFramebuffer(), gl.createFramebuffer()];

    const colorBuffers = [gl.createFramebuffer(), gl.createFramebuffer()];

    const blendBackBuffer = gl.createFramebuffer();

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

        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RG, gl.FLOAT, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, depthTarget, 0);

        const frontColorTarget = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1 + texture_unit_offset);
        gl.bindTexture(gl.TEXTURE_2D, frontColorTarget);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, frontColorTarget, 0);

        const backColorTarget = gl.createTexture();
        gl.activeTexture(gl.TEXTURE2 + texture_unit_offset);
        gl.bindTexture(gl.TEXTURE_2D, backColorTarget);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);
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
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.drawingBufferWidth, gl.drawingBufferHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blendBackTarget, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
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

    // Create circle texture on texture10
    const circle_texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, circle_texture);

    {
        const CIRCLE_RADIUS = 2048;
        const MARGIN = 10;
        console.log(`Generating ${CIRCLE_RADIUS * 2}x${CIRCLE_RADIUS * 2} circle texture`);
        const temp = new OffscreenCanvas((CIRCLE_RADIUS + MARGIN) * 2, (CIRCLE_RADIUS + MARGIN) * 2);
        const temp_ctx = temp.getContext("2d");
        temp_ctx.fillStyle = "yellow";
        temp_ctx.arc(CIRCLE_RADIUS + MARGIN, CIRCLE_RADIUS + MARGIN, CIRCLE_RADIUS, 0, 2 * Math.PI, false);
        temp_ctx.fill();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, 
            temp_ctx.getImageData(0, 0, temp.width, temp.height));
            
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }

    // Create skin texture array on texture 11
    const skin_texture_array = gl.createTexture();
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, skin_texture_array);
    
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    // Allocate vram for skins
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
        null
    );

    // Create mass texture on texture 12
    const mass_texture_array = gl.createTexture();
    gl.activeTexture(gl.TEXTURE12);
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

    gl.useProgram(depthPeelProg);
    gl.bindVertexArray(vao);

    gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1i(u_circle, 10);
    gl.uniform1i(u_skins,  11);
    gl.uniform1f(u_hue, 0);

    gl.useProgram(finalProg);
    gl.uniform1i(final_u_back, 6);

    const DEPTH_CLEAR_VALUE = -99999.0;
    const MIN_DEPTH = 0.0;
    const MAX_DEPTH = 1.0;

    let hue = 0;
    let lastTimestamp;
    (function render(now) {

        if (!lastTimestamp) {
            lastTimestamp = now;
            requestAnimationFrame(render);
            return;
        }
        const delta = now - lastTimestamp;
        
        gl.viewport(0, 0, offscreen.width, offscreen.height);

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

        if (gl.canvas.width != Viewport.width || gl.canvas.height != Viewport.height) {
            gl.canvas.width  = Viewport.width;
            gl.canvas.height = Viewport.height;
            gl.uniform2f(u_resolution, gl.canvas.width, gl.canvas.height);
            postMessage({ resized: Viewport });
        }

        // hue += delta;
        // gl.uniform1f(u_hue, hue / 500);

        // Process updated skins
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

            gl.bindBuffer(gl.ARRAY_BUFFER, cell_data_buffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, CellDataBuffer, 0, 7 * GEN_CELLS);
        }

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
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(finalProg);
        gl.uniform1i(final_u_front, offsetBack + 1);

        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        requestAnimationFrame(render);
        lastTimestamp = now;
    })();
}

/** @param {string[]} urls */
const loadSkin = (...urls) => SkinWorker.postMessage({ skins: urls.filter(url => !SkinCache.has(url)) });