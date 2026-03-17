import { Filter, GlProgram, UniformGroup } from 'pixi.js';

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

// ── Scanline + subtle chromatic aberration + vignette ────────────────────────
// Lightweight: one texture sample + procedural scanlines.
// Designed to not significantly impact low-end GPU performance.
const FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2  uResolution;
uniform float uTime;
uniform float uIntensity;     // scanlines + chroma + vignette
uniform float uBeamIntensity; // sweep beam only (independent)
uniform vec3  uBeamColor;     // active player color for the beam

void main(void) {
    vec2 uv = vTextureCoord;

    // ── Very subtle chromatic aberration ─────────────────────────────────────
    vec2  center = vec2(0.5, 0.5);
    vec2  dir    = (uv - center) * 0.004 * uIntensity;
    float r = texture(uTexture, uv + dir).r;
    float g = texture(uTexture, uv       ).g;
    float b = texture(uTexture, uv - dir).b;
    vec3 col = vec3(r, g, b);

    // ── Scanlines ─────────────────────────────────────────────────────────────
    float lineY   = floor(uv.y * uResolution.y);
    float scanline = 1.0 - 0.06 * mod(lineY, 3.0) * uIntensity;
    col *= scanline;

    // ── Moving horizontal data-pulse line ─────────────────────────────────────
    float pulse = fract(uTime * 0.08);
    float band  = abs(uv.y - pulse);
    float beam  = smoothstep(0.03, 0.0, band) * 0.16 * uBeamIntensity;
    col += beam * uBeamColor;

    // ── Corner vignette ───────────────────────────────────────────────────────
    vec2  vUV = uv * 2.0 - 1.0;
    float vig = 1.0 - smoothstep(0.55, 1.3, length(vUV * vec2(0.85, 1.0)));
    col *= 0.88 + 0.12 * vig * uIntensity;

    finalColor = vec4(col, 1.0);
}`;

/**
 * ScanlineFilter — applied to the whole stage on "high" quality only.
 * Adds scanlines, mild chromatic aberration at screen edges, subtle vignette,
 * and a slow-moving tron scan-beam.
 *
 * Performance: single texture sample + cheap math — safe for mid/low GPUs.
 */
export class ScanlineFilter extends Filter {
    constructor() {
        const glProgram = GlProgram.from({
            vertex:   VERT,
            fragment: FRAG,
            name:     'scanline-filter',
        });
        super({
            glProgram,
            resources: {
                scanUniforms: new UniformGroup({
                    uResolution:    { value: new Float32Array([1920, 1080]), type: 'vec2<f32>'  },
                    uTime:          { value: 0.0,                           type: 'f32'        },
                    uIntensity:     { value: 0.55,                          type: 'f32'        },
                    uBeamIntensity: { value: 1.0,                           type: 'f32'        },
                    uBeamColor:     { value: new Float32Array([0.0, 0.7, 1.0]), type: 'vec3<f32>' },
                }),
            },
        });
    }

    get time()             { return this.resources.scanUniforms.uniforms.uTime; }
    set time(v)            { this.resources.scanUniforms.uniforms.uTime = v; }

    get intensity()        { return this.resources.scanUniforms.uniforms.uIntensity; }
    set intensity(v)       { this.resources.scanUniforms.uniforms.uIntensity = v; }

    get beamIntensity()    { return this.resources.scanUniforms.uniforms.uBeamIntensity; }
    set beamIntensity(v)   { this.resources.scanUniforms.uniforms.uBeamIntensity = v; }

    /** Set beam color from a hex integer (e.g. 0xAA00FF). */
    setBeamColor(hex) {
        const c = this.resources.scanUniforms.uniforms.uBeamColor;
        c[0] = ((hex >> 16) & 0xff) / 255;
        c[1] = ((hex >>  8) & 0xff) / 255;
        c[2] = ( hex        & 0xff) / 255;
    }

    setResolution(w, h) {
        const r = this.resources.scanUniforms.uniforms.uResolution;
        r[0] = w; r[1] = h;
    }
}
