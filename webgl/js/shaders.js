
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
flat out int render_flags;

${HUE_ROTATE1_FUNC}
${HUE_ROTATE2_FUNC}

void main() {
    // Map from -1 to 1 -> 0 to 1
    v_texcoord = (a_position + 1.0) / 2.0;

    vec2 quad_pos = a_position * a_data.z + a_data.xy;
    player_id = int(a_data.w);

    int name_flag = int(u_view[1][1] * a_data.z / u_resolution.y > 0.025);
    render_flags = name_flag;

    vec2 camera_pos = (u_view * vec3(quad_pos, 1)).xy;

    // convert the position from pixels to -1.0 to 1.0
    vec2 clip_space = camera_pos / u_resolution;

    gl_Position = vec4(clip_space * vec2(1, -1), 1.0 / a_data.z, 1);

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

uniform sampler2DArray u_names;
uniform sampler2DArray u_skins;
uniform sampler2D u_circle;

uniform sampler2D uDepth;
uniform sampler2D uFrontColor;

in vec3 background_color;
in vec2 v_texcoord;
in vec3 bgc;
flat in int player_id;
flat in int render_flags;

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
    vec4 name = texture(u_names, vec3(v_texcoord, player_id));
    vec4 skin = texture(u_skins, vec3(v_texcoord, player_id));
    vec3 mixed = mix(bgc, skin.rgb, skin.a);
    vec4 color = vec4(mix(mixed, name.rgb, float(render_flags & 0x1) * name.a), circle.a);
    // vec4 color = vec4(mixed, circle.a);

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
}`;

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