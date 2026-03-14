import { Filter, GlProgram, UniformGroup, Sprite, Texture, Ticker } from 'pixi.js';

// ── PixiJS 8 standard filter vertex shader ───────────────────────────────────
const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}`;

// ── Space / Tron background fragment shader ───────────────────────────────────
// quality: 1.0 = medium (stars only), 2.0 = high (stars + tron grid + nebula)
const FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform highp float uTime;
uniform vec2  uResolution;
uniform float uQuality;

// ── Pseudo-random hash ───────────────────────────────────────────────────────
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// ── Star field ───────────────────────────────────────────────────────────────
// Two layers at different scales so we get near and far stars.
float starLayer(vec2 uv, float scale, float density) {
    vec2 cell = floor(uv * scale);
    vec2 f    = fract(uv * scale) - 0.5;
    float h   = hash(cell);
    float inStar = step(density, h);                       // 1.0 if cell has a star
    float size    = (0.04 + 0.04 * hash(cell + 1.3)) * inStar;
    float bri     = hash(cell + 2.7) * inStar;
    float twinkle = 0.55 + 0.45 * sin(uTime * (1.2 + h * 3.5) + h * 6.28318);
    float dist    = length(f);
    return bri * twinkle * (1.0 - smoothstep(0.0, size, dist));
}

vec3 starfield(vec2 uv) {
    float s1 = starLayer(uv,  80.0, 0.975);   // distant — dense, tiny
    float s2 = starLayer(uv,  35.0, 0.960);   // near — sparse, larger
    // Slight colour variation: cold blue vs warm white
    vec3 col  = s1 * vec3(0.75, 0.85, 1.00);
    col      += s2 * mix(vec3(1.0, 0.95, 0.85), vec3(0.85, 0.9, 1.0), hash(floor(uv * 35.0) + 5.1));
    return col;
}

// ── Tron grid ────────────────────────────────────────────────────────────────
// Scrolling grid with expanding sonar-ring pulses from center.
float tronGrid(vec2 uv) {
    float spacing = 64.0;

    // Slow diagonal scroll — grid drifts gently across screen
    vec2 drift = vec2(uTime * 0.007, uTime * 0.003);
    vec2 g     = (uv + drift) * uResolution / spacing;

    vec2  lines = abs(fract(g) - 0.5) * 2.0;
    float lineW = 0.10;
    float lx    = smoothstep(1.0 - lineW, 1.0, lines.x);
    float ly    = smoothstep(1.0 - lineW, 1.0, lines.y);
    float line  = max(lx, ly);

    // Slow global pulse — keeps lines visible between rings
    float pulse = 0.75 + 0.25 * sin(uTime * 0.15);

    // Expanding sonar rings from screen center
    // Three rings 120° apart so there's always one crossing the grid
    float aspect = uResolution.x / uResolution.y;
    float dist   = length((uv - vec2(0.5)) * vec2(aspect, 1.0));
    float r1     = max(0.0, sin(dist * 7.0 - uTime * 1.0));
    float r2     = max(0.0, sin(dist * 7.0 - uTime * 1.0 + 2.094));  // +120°
    float r3     = max(0.0, sin(dist * 7.0 - uTime * 1.0 + 4.189));  // +240°
    float rings  = pow(max(r1, max(r2, r3)), 4.0);   // sharp thin rings
    float ringMod = 0.65 + 0.35 * rings;              // 0.65 base so grid never vanishes

    return line * pulse * ringMod;
}

// ── Nebula wisps ─────────────────────────────────────────────────────────────
vec3 nebula(vec2 uv) {
    float t  = uTime * 0.04;
    // Two layers of slow sinusoidal colour clouds
    float n1 = sin(uv.x * 2.1 + t * 1.1) * cos(uv.y * 1.6 - t * 0.8);
    float n2 = sin(uv.x * 3.3 - t * 0.9 + uv.y * 2.2);
    // Cyan cloud
    vec3 c1 = vec3(0.0, 0.06, 0.16) * max(0.0, n1);
    // Purple cloud
    vec3 c2 = vec3(0.06, 0.0, 0.14) * max(0.0, n2);
    return (c1 + c2) * 0.45;
}

// ── Vignette ─────────────────────────────────────────────────────────────────
float vignette(vec2 uv) {
    vec2 p = uv * 2.0 - 1.0;
    return 1.0 - smoothstep(0.45, 1.4, length(p * vec2(0.9, 1.0)));
}

void main(void) {
    vec2 uv = vTextureCoord;

    // Deep-space base (very dark cyan-blue)
    vec3 col = vec3(0.008, 0.010, 0.040);

    // Stars always on (medium + high)
    col += starfield(uv);

    // Tron grid: medium + high
    if (uQuality >= 1.0) {
        float g = tronGrid(uv);
        col += vec3(0.0, g * 0.22, g * 0.38);
    }

    if (uQuality >= 2.0) {
        // High only: nebula wisps
        col += nebula(uv);
    }

    // Vignette always on
    col *= 0.35 + 0.65 * vignette(uv);

    finalColor = vec4(col, 1.0);
}`;

// ── BackgroundShaderFilter ────────────────────────────────────────────────────
class BackgroundShaderFilter extends Filter {
    constructor() {
        const glProgram = GlProgram.from({
            vertex:   VERT,
            fragment: FRAG,
            name:     'bg-space-shader',
        });
        super({
            glProgram,
            resources: {
                bgUniforms: new UniformGroup({
                    uTime:       { value: 0.0,                           type: 'f32'        },
                    uResolution: { value: new Float32Array([1920, 1080]), type: 'vec2<f32>'  },
                    uQuality:    { value: 2.0,                           type: 'f32'        },
                }),
            },
        });
    }

    get time()        { return this.resources.bgUniforms.uniforms.uTime; }
    set time(v)       { this.resources.bgUniforms.uniforms.uTime = v; }

    setResolution(w, h) {
        const r = this.resources.bgUniforms.uniforms.uResolution;
        r[0] = w; r[1] = h;
    }

    setQuality(q) {
        this.resources.bgUniforms.uniforms.uQuality = q; // 1=medium, 2=high
    }
}

// ── BackgroundShader — owns the full-screen sprite + filter lifecycle ─────────
/**
 * Drop-in addition to the existing BackgroundRenderer.
 * Owns a fullscreen Sprite (white pixel tinted transparent) with the space
 * shader filter applied.  Slot into the background Container at zIndex 0.
 */
export class BackgroundShader {
    constructor(container, app) {
        this._app    = app;
        this._time   = 0;
        this._active = false;

        // Fullscreen sprite — covers the whole canvas, sits below everything else.
        this._sprite = new Sprite(Texture.WHITE);
        this._sprite.label      = 'bg-shader-sprite';
        this._sprite.tint       = 0x000000;  // will be overridden by the shader output
        this._sprite.zIndex     = -1;         // below ambient particles
        this._sprite.blendMode  = 'normal';

        this._filter = new BackgroundShaderFilter();
        this._sprite.filters = [this._filter];

        container.addChildAt(this._sprite, 0);

        this._resize();
        this._onResize = this._resize.bind(this);
        window.addEventListener('resize', this._onResize);

        this._tick = this._update.bind(this);
    }

    _resize() {
        const w = this._app?.screen?.width  ?? window.innerWidth;
        const h = this._app?.screen?.height ?? window.innerHeight;
        this._sprite.width  = w;
        this._sprite.height = h;
        this._filter.setResolution(w, h);
    }

    /** Call once per frame (from BackgroundRenderer's update loop). */
    _update(ticker) {
        this._time += (ticker?.deltaTime ?? 1) / 60;
        this._filter.time = this._time;
    }

    /** quality: 'off' | 'medium' | 'high' */
    setQuality(quality) {
        if (quality === 'off') {
            this._active = false;
            this._sprite.visible = false;
            Ticker.shared.remove(this._tick);
        } else {
            this._active = true;
            this._sprite.visible = true;
            this._filter.setQuality(quality === 'high' ? 2.0 : 1.0);
            // Only add ticker listener once
            Ticker.shared.remove(this._tick);
            Ticker.shared.add(this._tick);
        }
    }

    destroy() {
        Ticker.shared.remove(this._tick);
        window.removeEventListener('resize', this._onResize);
        this._sprite.destroy();
    }
}
