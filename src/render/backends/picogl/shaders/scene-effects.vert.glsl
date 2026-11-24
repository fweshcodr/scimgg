#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_texCoord;
layout(location = 3) in float a_textureId;
layout(location = 4) in float a_hslColor;
layout(location = 5) in vec2 a_tileCoord;
layout(location = 6) in float a_alpha;
layout(location = 7) in float a_priority;

uniform mat4 u_viewProjMatrix;
uniform float u_currentTick;
uniform float u_zBias;
uniform float u_priorityStepNdc;
uniform vec4 u_animParams;

const float OSRS_PALETTE_GAMMA = 0.6;

// Animated OSRS texture scroll - see scene-base.vert.glsl for the packing.
#define TEXTURE_ANIM_MAX_LAYERS 256
#define TEXTURE_ANIM_VEC4_COUNT 128
#define TEXTURE_ANIM_UNIT (1.0 / 128.0)
uniform vec4 u_textureAnimations[TEXTURE_ANIM_VEC4_COUNT];
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

out vec3 v_normal;
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
    vec3 pos = a_position;
    float animType = u_animParams.x;
    float animSpeed = u_animParams.y;
    float animAmp = u_animParams.z;
    float animPhase = u_animParams.w;
    float animAlpha = a_alpha;

    if (animType > 0.5) {
        float t = u_currentTick * animSpeed + animPhase;
        if (animType < 1.5) {
            // 1.0 = vertical bob + drift + slow rotation (motes)
            vec2 center = u_animParams.zw;
            vec2 offset = pos.xy - center;
            
            // Slow rotation (~40s per revolution)
            // Removed per-vertex pos.z parallax — it caused progressive diamond distortion
            // because vertices at different Z offsets rotated at diverging speeds over time.
            float angle = u_currentTick * animSpeed * 0.4;
            float c = cos(angle);
            float s = sin(angle);
            
            pos.x = center.x + offset.x * c - offset.y * s;
            pos.y = center.y + offset.x * s + offset.y * c;
            
            // Hardcode bob amplitude (0.3) since u_animParams.z is now used for center.x
            float bobAmp = 0.3;
            pos.z += sin(t + pos.x * 0.3 + pos.y * 0.5) * bobAmp;
            animAlpha *= 0.6 + 0.4 * sin(t * 0.8 + pos.x * 0.2);
        } else if (animType < 2.5) {
            // 2.0 = gentle alpha pulse
            animAlpha *= max(0.0, (1.0 - animAmp) + animAmp * sin(t));
        } else if (animType < 3.5) {
            // 3.0 = twinkle (starfield)
            animAlpha *= max(0.0, (1.0 - animAmp) + animAmp * sin(t + (pos.x + pos.y) * 0.1));
        } else if (animType < 4.5) {
            // 4.0 = bob + rotate (obelisk shards)
            pos.z += sin(t) * animAmp;
            pos.x += sin(t * 1.3) * (animAmp * 0.5);
            pos.y += cos(t * 1.1) * (animAmp * 0.5);
        } else if (animType < 5.5) {
            // 5.0 = flicker (obelisk flames)
            float noise = fract(sin(dot(a_normal.xy, vec2(12.9898, 78.233))) * 43758.5453);
            animAlpha *= max(0.0, (1.0 - animAmp) + animAmp * sin(t * 3.0 + noise * 10.0));
        } else if (animType < 6.5) {
            // 6.0 = slow rotation around arena center
            float angle = t * 0.5;
            vec2 center = vec2(31.5, 25.5);
            vec2 offset = pos.xy - center;
            float c = cos(angle);
            float s = sin(angle);
            pos.x = center.x + offset.x * c - offset.y * s;
            pos.y = center.y + offset.x * s + offset.y * c;
        } else if (animType < 7.5) {
            // 7.0 = complex cosmic starfield animation
            // Use a_normal-derived seed for per-particle distance so all 6 vertices agree
            float starSeed = fract(sin(dot(a_normal, vec3(127.1, 311.7, 74.7))) * 43758.5453);
            float starDist = starSeed * 150.0;
            float baseAngle = t * 0.05;
            vec2 center = vec2(31.5, 25.5);
            vec2 offset = pos.xy - center;

            // Rotate with differential speed (further stars rotate slightly slower for depth parallax)
            float angle = baseAngle * (1.0 - clamp(starDist/150.0, 0.0, 0.5));
            float c = cos(angle);
            float s = sin(angle);
            pos.x = center.x + offset.x * c - offset.y * s;
            pos.y = center.y + offset.x * s + offset.y * c;

            // Organic twinkle and pulse using per-particle seed (not per-vertex pos)
            float pulsePhase = starSeed * 100.0 + t * 0.8 + animPhase;
            float pulse1 = sin(pulsePhase);
            float pulse2 = sin(pulsePhase * 1.618);
            float pulse3 = sin(pulsePhase * 2.718);

            float shimmer = (pulse1 + pulse2 * 0.5 + pulse3 * 0.25) / 1.75;

            // Smoothly map from [-1, 1] to a [1.0 - animAmp, 1.0 + animAmp] range for brightness variation
            animAlpha *= 1.0 + shimmer * animAmp;

            // Tiny spatial drift (stars slowly wandering in small circles or figure-8s)
            pos.x += sin(pulsePhase * 0.5) * animAmp * 0.1;
            pos.y += cos(pulsePhase * 0.7) * animAmp * 0.1;
            pos.z += sin(pulsePhase * 0.9) * animAmp * 0.1;
        } else if (animType < 8.5) {
            // 8.0 = shooting star — streak that moves across the sky dome
            // a_normal is shared by all vertices of one star → consistent timing
            float phase = fract(sin(dot(a_normal, vec3(127.1, 311.7, 74.7))) * 43758.5453);
            float localT = fract(u_currentTick * animSpeed + phase);
            float window = animAmp;
            float visible = step(localT, window);
            float progress = localT / max(window, 0.001);

            // Compute tangent direction along the sky dome surface
            vec3 n = normalize(a_normal);
            vec3 worldDown = vec3(0.0, 0.0, -1.0);
            vec3 projDown = worldDown - n * dot(worldDown, n);
            float projLen = length(projDown);
            vec3 fallDir = projLen > 0.001 ? projDown / projLen : vec3(1.0, 0.0, 0.0);
            float lateralSeed = fract(sin(dot(n, vec3(269.5, 183.3, 0.0))) * 43758.5453);
            vec3 crossVec = cross(n, fallDir);
            vec3 lateral = length(crossVec) > 0.001 ? normalize(crossVec) : vec3(0.0, 1.0, 0.0);
            vec3 moveDir = normalize(fallDir + lateral * (lateralSeed - 0.5) * 1.2);

            // Dynamic stretching: Head moves full distance, tail lags behind
            float headMove = progress * 8.0;
            float tailMove = max(0.0, progress - 0.15) * 5.0;
            float dist = mix(tailMove, headMove, a_alpha);

            pos += moveDir * dist * visible;

            // Bright flash with smooth fade-out (intensity tied to alpha for fading tail)
            float intensity = visible * pow(1.0 - progress, 1.5) * a_alpha;
            animAlpha *= intensity;
        } else if (animType < 9.5) {
            // 9.0 = vortex spin (rotation center in u_animParams.zw)
            vec2 center = u_animParams.zw;
            vec2 offset = pos.xy - center;
            float angle = t;
            float c = cos(angle);
            float s = sin(angle);
            pos.x = center.x + offset.x * c - offset.y * s;
            pos.y = center.y + offset.x * s + offset.y * c;
            float dist = length(offset);
            animAlpha *= 1.0 + sin(dist * 4.0 - t * 1.5) * 0.2;
        } else if (animType < 10.5) {
            // 10.0 = ancient glyphs (sparse deterministic activation + shimmer)
            vec2 tileId = floor(a_tileCoord + 0.5);
            
            float timeWindow = floor(u_currentTick * animSpeed);
            float localTime = fract(u_currentTick * animSpeed);
            
            // Base per-tile deterministic hash
            float h = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
            
            float timeHash = fract(sin(dot(vec3(tileId.x, tileId.y, timeWindow), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            
            // Gate activation: roughly animAmp (e.g. 4) active at a time
            float threshold = animAmp / 30.0;
            
            // Spread rule: coarse cell hash to avoid adjacent winners
            vec2 cellId = floor(tileId / 2.0);
            float cellHash = fract(sin(dot(vec3(cellId.x, cellId.y, timeWindow), vec3(17.381, 41.921, 83.117))) * 43758.5453);
            
            float isActive = step(timeHash, threshold) * step(h, cellHash + 0.5);
            
            float phaseOffset = h * 0.5;
            float t_active = clamp((localTime - phaseOffset) / 0.5, 0.0, 1.0);
            
            // Envelope: ethereal breathing, long fade in, linger, long fade out
            float envelope = smoothstep(0.0, 0.3, t_active) * (1.0 - smoothstep(0.7, 1.0, t_active));
            
            float shimmer = 1.0 + 0.15 * sin(u_currentTick * 0.5 + h * 10.0);
            
            animAlpha = a_alpha * envelope * shimmer * isActive;
        }
    }

    gl_Position = u_viewProjMatrix * vec4(pos, 1.0);
    gl_Position.z += u_zBias * gl_Position.w;
    gl_Position.z += a_priority * u_priorityStepNdc * gl_Position.w;

    v_normal = a_normal;
    v_worldPos = a_position;
    v_texCoord = a_texCoord + textureAnimationOffset(int(a_textureId));
    v_textureId = a_textureId;

    int hsl = int(a_hslColor);
    float hasTexture = step(0.5, a_textureId);
    float noTexture = 1.0 - hasTexture;

    v_color = noTexture * vec4(hslToRgb(hsl), animAlpha)
            + hasTexture * vec4(vec3(float(hsl & 0x7F) / 127.0), animAlpha);
}
