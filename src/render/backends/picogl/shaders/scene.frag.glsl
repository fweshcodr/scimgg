#version 300 es
precision highp float;

in vec3 v_worldPos;
in vec2 v_texCoord;
flat in float v_textureId;
in vec4 v_color;
uniform float u_currentTick;
uniform highp sampler2DArray u_textures;
uniform float u_hasTextures;
uniform float u_colorBanding;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_discardAlpha;

// Keep palette gamma fixed: using the brightness slider as an exponent reverses it.
const float OSRS_PALETTE_GAMMA = 0.6;
const float DEFAULT_BRIGHTNESS = 0.6;

out vec4 fragColor;

vec3 adjustContrast(vec3 color, float contrast) {
    return (color - 0.5) * contrast + 0.5;
}

vec3 adjustSaturation(vec3 color, float saturation) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return mix(vec3(gray), color, saturation);
}

void main() {
    vec4 outColor;

    if (v_textureId > 0.0 && u_hasTextures > 0.5) {
        vec3 texCoord = vec3(v_texCoord, v_textureId);
        vec4 texColor = texture(u_textures, texCoord).bgra;
        // Match RuneLite's textured-face alpha semantics (gpu/frag.glsl): any texel
        // that is not fully opaque is discarded, and the surviving texture alpha is
        // forced to 1.0 so the mesh's per-vertex (v_color.a) alpha is the sole source
        // of translucency for the fragment. As there, the test reads the base level
        // with an explicit LOD, so neither mip blending nor anisotropic taps feed it:
        // mobile GPUs can filter fully opaque texels to just under 1.0 at grazing
        // angles, which discarded most of a distant opaque surface such as lava.
        if (textureLod(u_textures, texCoord, 0.0).a < 1.0) {
            discard;
        }
        texColor.a = 1.0;
        outColor = pow(texColor, vec4(vec3(OSRS_PALETTE_GAMMA), 1.0)) * vec4(v_color.rgb, v_color.a);
        if (u_discardAlpha > 0.5 && outColor.a < 0.01) {
            discard;
        }
    } else {
        outColor = v_color;
        if (u_discardAlpha > 0.5 && outColor.a < 0.01) {
            discard;
        }
    }
    outColor.rgb *= u_brightness / DEFAULT_BRIGHTNESS;
    outColor.rgb = adjustContrast(outColor.rgb, u_contrast);
    outColor.rgb = adjustSaturation(outColor.rgb, u_saturation);

    outColor.rgb = round(outColor.rgb * u_colorBanding) / u_colorBanding;
    fragColor = outColor;
}
