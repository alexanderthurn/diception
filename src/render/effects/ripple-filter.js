import { Filter, GlProgram, UniformGroup } from 'pixi.js';

// PixiJS 8 default filter vertex shader (verbatim from defaultFilter.vert)
const VERT = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}`;

/**
 * Expanding shockwave ring fragment shader.
 * vTextureCoord is 0..1 within the filter area; center is (0.5, 0.5).
 * As uTime goes 0 → 1 the ring expands outward and fades away.
 * Parent container should use blendMode='add' so the ring is added over the scene.
 */
const FRAG = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec3 uRingColor;

void main(void)
{
    // Normalised distance from filter-area centre (0 = centre, 1 = ~edge)
    vec2  center = vec2(0.5, 0.5);
    float dist   = length(vTextureCoord - center) * 2.0;

    // Ring that expands from 0 → 1 as uTime → 1
    float radius = uTime;
    float ringW  = max(0.008, 0.13 * (1.0 - uTime * 0.65));
    float ring   = 1.0 - smoothstep(0.0, ringW, abs(dist - radius));

    // Fade + soft inner glow
    float fade   = pow(1.0 - uTime, 1.1);
    ring *= fade;

    // Pure additive output: no scene sampling needed, parent uses add-blend
    finalColor = vec4(uRingColor * ring, ring);
}`;

/**
 * RippleFilter — PixiJS 8 custom filter that draws an expanding shockwave ring.
 *
 * GC notes:
 *   - GlProgram is cached by PixiJS (same source → same GL program object).
 *   - Multiple RippleFilter instances therefore share one compiled WebGL program.
 *   - Each instance only owns its own UniformGroup (a few floats on the GPU).
 *   - Pool these filter instances; never create/destroy them per-attack.
 */
export class RippleFilter extends Filter {
    constructor() {
        const glProgram = GlProgram.from({
            vertex:   VERT,
            fragment: FRAG,
            name:     'ripple-filter',
        });

        super({
            glProgram,
            resources: {
                rippleUniforms: new UniformGroup({
                    uTime:      { value: 0.0,                         type: 'f32'       },
                    uRingColor: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
                }),
            },
        });
    }

    get time()  { return this.resources.rippleUniforms.uniforms.uTime; }
    set time(v) { this.resources.rippleUniforms.uniforms.uTime = v;    }

    /** Set ring colour from a packed 0xRRGGBB hex integer. */
    setColor(hex) {
        const arr = this.resources.rippleUniforms.uniforms.uRingColor;
        arr[0] = ((hex >> 16) & 0xff) / 255;
        arr[1] = ((hex >>  8) & 0xff) / 255;
        arr[2] = ( hex        & 0xff) / 255;
    }
}
