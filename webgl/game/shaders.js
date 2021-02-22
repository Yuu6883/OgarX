module.exports.SPRITE_VERT_SHADER_SOURCE = 
`#version 300 es
precision highp float;

uniform mat4 u_proj;
uniform vec2 u_uvs[6];

layout(location=0) in vec2 pos;

out vec2 uv;

void main() {
    gl_Position = u_proj * vec4(pos, 0.0f, 1.0f);
    uv = u_uvs[gl_VertexID % 6];
}
`;

module.exports.SPRITE_FRAG_SHADER_SOURCE =
`#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 uv;
out vec4 color;

void main() {
    color = texture(u_texture, uv);
}
`;

module.exports.PARTICLE_VERT_SHADER_SOURCE = 
`#version 300 es
precision highp float;

uniform mat4 u_proj;
uniform vec2 u_uvs[6];
uniform vec3 u_colors[$colors$];

layout(location=0) in vec3 pos;

out vec2 uv;
out vec3 fill;

void main() {
    gl_Position = u_proj * vec4(pos.xy, 0.0f, 1.0f);
    fill = u_colors[int(pos.z) % $colors$];
    uv = u_uvs[gl_VertexID % 6];
}
`;

module.exports.PARTICLE_FRAG_SHADER_SOURCE =
`#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 uv;
in vec3 fill;

out vec4 color;

void main() {
    color = vec4(fill, texture(u_texture, uv).a);
    // color = vec4(uv, 1.0f, 1.0f);
}
`;

module.exports.MASS_VERT_SHADER_SOURCE = 
`#version 300 es
precision highp float;
precision highp int;

uniform mat4 u_proj;
uniform vec2 u_uvs[48];

layout(location=0) in vec3 a_position;

out vec2 v_texcoord;
flat out int character;

void main() {
    vec4 world_pos = vec4(a_position.xy, 0.0, 1.0);
    gl_Position = u_proj * world_pos;
    character = int(a_position.z) >> 2;
    v_texcoord = u_uvs[int(a_position.z)];
}
`;

module.exports.MASS_FRAG_PEELING_SHADER_SOURCE = 
`#version 300 es

precision highp float;
precision highp int;
precision highp sampler2DArray;

uniform sampler2DArray u_mass_char;

in vec2 v_texcoord;
flat in int character;

out vec4 color;

void main() {
    color = texture(u_mass_char, vec3(v_texcoord, character));
}
`;

module.exports.BORDER_VERT_SHADER_SOURCE = 
`#version 300 es
precision highp float;

layout(location=0) in vec2 a_position;
uniform mat4 u_proj;
uniform vec2 u_map;
void main() {
    gl_Position = u_proj * vec4(a_position * u_map, 0.0, 1.0);
}
`;

module.exports.BORDER_FRAG_SHADER_SOURCE =
`#version 300 es
precision highp float;

uniform vec4 u_color;
out vec4 color;
void main() {
    color = u_color;
}
`;