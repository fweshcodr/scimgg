#version 300 es
precision highp float;

#ifdef INSTANCED_ATLAS
// The renderer's instanced variant: one draw for a run of commands sharing an atlas. Each instance
// carries its draw's model-view-projection matrix and its atlas row; each vertex reads its row's
// texels at its index (2 per vertex: position + HSL, alpha + face bias). Untextured only.
layout(location = 8) in mat4 a_instanceMvp;
layout(location = 12) in float a_instanceRow;
uniform highp sampler2D u_instanceAtlas;
#else
layout(location = 0) in vec3 a_position;
// Location 1 (a_normal) is scene-effects only: lighting is baked into a_hslColor.
layout(location = 2) in vec2 a_texCoord;
layout(location = 3) in float a_textureId;
layout(location = 4) in float a_hslColor;
layout(location = 5) in vec2 a_tileCoord;
layout(location = 6) in float a_alpha;
layout(location = 7) in float a_faceBias;

uniform mat4 u_viewProjMatrix;
#endif
uniform float u_currentTick;
uniform float u_zBias;

const float OSRS_PALETTE_GAMMA = 0.6;

// Animated OSRS textures (fire/infernal cape, lava, water) scroll their UVs over
// time. Ported from RuneLite's `textureAnimations` uniform + TEXTURE_ANIM_UNIT,
// but two texture-array layers are packed per vec4 so the array costs 128
// uniform vectors instead of 256 - WebGL2 only guarantees 256 in total.
#define TEXTURE_ANIM_MAX_LAYERS 256
#define TEXTURE_ANIM_VEC4_COUNT 128
#define TEXTURE_ANIM_UNIT (1.0 / 128.0)
uniform vec4 u_textureAnimations[TEXTURE_ANIM_VEC4_COUNT];
// Elapsed OSRS client cycles (20ms), wrapped at 128. Because the packed
// anim vectors are whole numbers, wrapping shifts UVs by an integer and is
// invisible under REPEAT sampling.
uniform float u_textureAnimTime;

// A layer outside 1..255 (untextured -1, the white placeholder 0) reads layer 0's
// slot, which the renderer keeps at [0, 0], so it gets no offset. The index is
// chosen before the read, so the read is unconditional and in bounds.
vec2 textureAnimationOffset(int layer) {
    int lookupLayer =
        (layer > 0 && layer < TEXTURE_ANIM_MAX_LAYERS) ? layer : 0;
    vec4 layerPair = u_textureAnimations[lookupLayer >> 1];
    vec2 anim = (lookupLayer & 1) == 0 ? layerPair.xy : layerPair.zw;
    return u_textureAnimTime * anim * TEXTURE_ANIM_UNIT;
}

out vec3 v_worldPos;
out vec2 v_texCoord;
flat out float v_textureId;
out vec4 v_color;

float when_eq(float x, float y) {
    return 1.0 - abs(sign(x - y));
}

float when_neq(float x, float y) {
    return abs(sign(x - y));
}

float when_lt(float x, float y) {
    return max(sign(y - x), 0.0);
}

vec3 hslToRgb(int hsl) {
    const float onethird = 1.0 / 3.0;
    const float twothird = 2.0 / 3.0;
    const float rcpsixth = 6.0;

    float hue = float(hsl >> 10) / 64.0 + 0.0078125;
    float sat = float((hsl >> 7) & 0x7) / 8.0 + 0.0625;
    float lum = float(hsl & 0x7f) / 128.0;

    vec3 xt = vec3(
        rcpsixth * (hue - twothird),
        0.0,
        rcpsixth * (1.0 - hue)
    );

    xt = mix(xt, vec3(
        0.0,
        rcpsixth * (twothird - hue),
        rcpsixth * (hue - onethird)
    ), when_lt(hue, twothird));

    xt = mix(xt, vec3(
        rcpsixth * (onethird - hue),
        rcpsixth * hue,
        0.0
    ), when_lt(hue, onethird));

    xt = min(xt, 1.0);

    float sat2   =  2.0 * sat;
    float satinv =  1.0 - sat;
    float luminv =  1.0 - lum;
    float lum2m1 = (2.0 * lum) - 1.0;
    vec3  ct     = (sat2 * xt) + satinv;

    vec3 rgb = mix((luminv * ct) + lum2m1, lum * ct, when_lt(lum, 0.5));

    return pow(rgb, vec3(OSRS_PALETTE_GAMMA));
}

void main() {
#ifdef INSTANCED_ATLAS
    int atlasRow = int(a_instanceRow);
    vec4 atlasPositionHsl = texelFetch(u_instanceAtlas, ivec2(2 * gl_VertexID, atlasRow), 0);
    vec4 atlasAlphaBias = texelFetch(u_instanceAtlas, ivec2(2 * gl_VertexID + 1, atlasRow), 0);
    mat4 u_viewProjMatrix = a_instanceMvp;
    vec3 a_position = atlasPositionHsl.xyz;
    float a_hslColor = atlasPositionHsl.w;
    float a_alpha = atlasAlphaBias.x;
    float a_faceBias = atlasAlphaBias.y;
    vec2 a_texCoord = vec2(0.0);
    float a_textureId = 0.0;
#endif
    gl_Position = u_viewProjMatrix * vec4(a_position, 1.0);
    gl_Position.z += u_zBias * gl_Position.w;
    gl_Position.z += a_faceBias / 128.0;

    v_worldPos = a_position;
    v_texCoord = a_texCoord + textureAnimationOffset(int(a_textureId));
    v_textureId = a_textureId;

    int hsl = int(a_hslColor);
    float hasTexture = step(0.5, a_textureId);
    float noTexture = 1.0 - hasTexture;

    v_color = noTexture * vec4(hslToRgb(hsl), a_alpha)
            + hasTexture * vec4(vec3(float(hsl & 0x7F) / 127.0), a_alpha);
}
