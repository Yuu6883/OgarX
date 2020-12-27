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

uniform vec3 u_circle_color;

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
    vec4 color = vec4(mix(u_circle_color, skin.rgb, skin.a), circle.a);
    // vec4 color = vec4(u_circle_color, circle.a);

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