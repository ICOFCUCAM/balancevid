'use client';

import {
  type Composition, BLUR_SIGMA, boxFor, drawable, spaceOf,
} from '../../../src/domain/composition.js';
import { type SpaceLook, SPACE_LOOKS } from '../../../src/domain/environment.js';

/**
 * The compositor, on the live canvas.  [Doctrine CHANNEL §26, §28, C-14]
 *
 *     SOURCE → LAYOUT → VIRTUAL SET / BACKGROUND → GRAPHICS → AUDIO MIX
 *            → PROGRAMME → PLAYOUT → DISTRIBUTION
 *
 * *"The virtual background must actually become part of the master
 *  composition, not just a CSS background behind a preview. BalanceVid's
 *  browser canvas is already the master feed architecture."*
 *
 * IT IS. `useBroadcastMixer` draws every staged person into a canvas and
 * `captureStream` hands that canvas to the encoder, so anything drawn here
 * is on the wire. That is why this is WebGL and not CSS: a filter on an
 * element styles what the operator sees, and the operator's screen is not
 * what is being transmitted.
 *
 * THE ALGORITHM IS NOT NEW. It is `src/render/matte.ts`, which has keyed
 * every Studio Two performance since §4 — difference against a plate,
 * threshold at a multiple of the room's own measured noise, erode to kill
 * the fireflies, dilate twice to put the outline back and a little beyond
 * it, feather into that margin, and merge. Written there as an ffmpeg
 * chain and here as six shader passes, from the SAME numbers
 * (`matteThreshold`, `matteFeather`), so a broadcast and an export of the
 * same person against the same room cannot key differently. [D-19]
 *
 * WHY SIX PASSES AND NOT ONE. The erode and the dilate each need to look
 * at a neighbourhood, and a blur that is separable costs two passes
 * instead of the square of one. Doing it in a single shader would be 27
 * texture fetches per pixel and one unreadable function; the passes are
 * the same operations `matteChain` lists, in the same order, each one
 * nameable.
 */

/* ------------------------------------------------------------------------ *
 *  Shaders.
 * ------------------------------------------------------------------------ */

const QUAD = `
attribute vec2 a;
varying vec2 v;
void main() { v = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }
`;

/**
 * WHERE THE PERSON SITS IN THE PANEL.  [§26 D]
 *
 * Every shader that samples the source reads it through this, so
 * position, scale, crop and the horizontal flip are one transform applied
 * once rather than four controls each doing something slightly different.
 * `boxFor` computes the numbers; this applies them. [D-19]
 *
 * Outside the box there is no person, and saying so is what keeps
 * `CLAMP_TO_EDGE` from smearing the edge pixel across the backdrop and
 * keying a stripe out of it.
 */
const FRAME_GLSL = `
uniform vec2 uOff, uScale;
uniform float uFlipX;
vec2 fgUv(vec2 p) {
  vec2 u = p * uScale - uOff;
  if (uFlipX > 0.5) u.x = 1.0 - u.x;
  return u;
}
bool inFrame(vec2 u) {
  return u.x >= 0.0 && u.x <= 1.0 && u.y >= 0.0 && u.y <= 1.0;
}
`;

/**
 * A drawn space, at the panel's own size.  [§4, backdropChain]
 *
 * The same five things the ffmpeg chain draws and in the same order: a
 * vertical wash, a radial pool of light screened over it, one straight
 * band, a vignette, and grain last so nothing blurs it. A perfectly smooth
 * backdrop reads as a screensaver; a perfectly clean one behind a camera's
 * own noise is what makes a composite look pasted on.
 */
const SPACE_FS = `
precision mediump float;
varying vec2 v;
uniform vec3 uTop, uBottom, uGlow, uBand;
uniform vec2 uGlowAt;
uniform float uStrength, uVignette, uGrain, uBandY, uBandH, uSeed;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 wash = mix(uTop, uBottom, v.y);
  /* Screen, which is what the chain's blend=screen does, and it is not
     the same as adding: light pools do not clip to white. */
  float d = distance(v * vec2(1.0, 1.0), uGlowAt);
  float pool = clamp(1.0 - d * 1.6, 0.0, 1.0);
  vec3 lit = 1.0 - (1.0 - wash) * (1.0 - uGlow * pool * uStrength);
  if (uBandH > 0.0 && v.y >= uBandY && v.y <= uBandY + uBandH) lit = uBand;
  /* The corners fall off. The exponent is what keeps the falloff in the
     corners rather than spreading it across the whole picture. */
  float r = distance(v, vec2(0.5));
  lit *= 1.0 - clamp(pow(r * 1.42, 2.0) * uVignette, 0.0, 0.95);
  lit += (hash(v * 997.0 + uSeed) - 0.5) * (uGrain / 255.0) * 2.0;
  gl_FragColor = vec4(clamp(lit, 0.0, 1.0), 1.0);
}
`;

/** Straight through, for the source and for the copies between passes. */
const COPY_FS = `
precision mediump float;
varying vec2 v;
uniform sampler2D uTex;
uniform bool uFlipY, uFramed;
${FRAME_GLSL}
void main() {
  vec2 u = uFramed ? fgUv(v) : v;
  if (uFramed && !inFrame(u)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  gl_FragColor = texture2D(uTex, vec2(u.x, uFlipY ? 1.0 - u.y : u.y));
}
`;

/**
 * The difference matte.  [matteChain, step one]
 *
 * *"Everything that differs from the plate by more than the room's own
 *  measured noise is the performer."* Compared in RGB and reduced to one
 * number, because a blue shirt against a grey wall of the same brightness
 * is a difference in colour and not in luma, and a matte that loses a
 * shirt is worse than no matte.
 */
const DIFF_FS = `
precision mediump float;
varying vec2 v;
uniform sampler2D uFg, uPlate;
uniform float uThreshold;
${FRAME_GLSL}
void main() {
  vec2 u = fgUv(v);
  if (!inFrame(u)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 t = vec2(u.x, 1.0 - u.y);
  vec3 a = texture2D(uFg, t).rgb;
  vec3 b = texture2D(uPlate, t).rgb;
  vec3 d = abs(a - b);
  float m = max(d.r, max(d.g, d.b));
  gl_FragColor = vec4(vec3(m * 255.0 > uThreshold ? 1.0 : 0.0), 1.0);
}
`;

/**
 * A green screen.  [§26 C, the brief's higher-quality path]
 *
 * Distance in chroma rather than in RGB, so a person standing in green
 * light is not keyed out along with the wall behind them. Spill is pulled
 * afterwards in the composite, because a green rim on a cheek is the one
 * thing everybody notices in a bad key.
 */
const CHROMA_FS = `
precision mediump float;
varying vec2 v;
uniform sampler2D uFg;
uniform vec3 uKey;
uniform float uSimilarity, uSmoothness;
${FRAME_GLSL}
vec2 cb_cr(vec3 c) {
  return vec2(-0.169 * c.r - 0.331 * c.g + 0.5 * c.b,
               0.5 * c.r - 0.419 * c.g - 0.081 * c.b);
}
void main() {
  vec2 u = fgUv(v);
  if (!inFrame(u)) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 c = texture2D(uFg, vec2(u.x, 1.0 - u.y)).rgb;
  float d = distance(cb_cr(c), cb_cr(uKey));
  /* 1 where the person is, 0 where the screen is. */
  gl_FragColor = vec4(vec3(
    smoothstep(uSimilarity, uSimilarity + uSmoothness, d)), 1.0);
}
`;

/**
 * Erode, then dilate twice.  [matteChain's `erosion,dilation,dilation`]
 *
 * One shader run three times with a different sign: a single speck of
 * noise above the threshold is a firefly in the finished picture, erosion
 * removes it, and the two dilations put the performer's own edge back and
 * then a little beyond it — so the feather has somewhere to soften into
 * rather than eating into their outline.
 */
const MORPH_FS = `
precision mediump float;
varying vec2 v;
uniform sampler2D uTex;
uniform vec2 uStep;
uniform float uMode;
void main() {
  float best = uMode > 0.0 ? 0.0 : 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float s = texture2D(uTex, v + vec2(float(x), float(y)) * uStep).r;
      best = uMode > 0.0 ? max(best, s) : min(best, s);
    }
  }
  gl_FragColor = vec4(vec3(best), 1.0);
}
`;

/** The feather, separably. `matteFeather` decides how wide. */
const BLUR_FS = `
precision mediump float;
varying vec2 v;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  float sum = 0.0;
  float weight = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-float(i * i) / 18.0);
    sum += texture2D(uTex, v + uDir * float(i)).r * w;
    weight += w;
  }
  gl_FragColor = vec4(vec3(sum / weight), 1.0);
}
`;

/**
 * The merge.  [matteChain's `maskedmerge`]
 *
 * And the two things §26 D asks for that belong here rather than in a
 * geometry pass: spill suppression, and the lighting adjustment that lets
 * somebody lit for a bedroom sit in a concert stage.
 */
const MERGE_FS = `
precision mediump float;
varying vec2 v;
uniform sampler2D uFg, uBack, uMask;
uniform float uLight, uSpill, uCutout;
uniform vec3 uKey;
${FRAME_GLSL}
void main() {
  vec2 u = fgUv(v);
  vec3 back = texture2D(uBack, v).rgb;
  /*
   * A CUTOUT, when the scene behind this person is the whole frame and
   * not this panel. A virtual set draws its room once — the room is the
   * studio, not four rooms in four panels — so each person comes back
   * as a foreground with an alpha, and the 2D canvas composites them
   * onto the set that is already there. [§27]
   */
  if (!inFrame(u)) {
    gl_FragColor = uCutout > 0.5 ? vec4(0.0) : vec4(back, 1.0);
    return;
  }
  vec3 fg = texture2D(uFg, vec2(u.x, 1.0 - u.y)).rgb;
  float m = texture2D(uMask, v).r;
  /* SPILL: where the person is greener than a person should be against
     this key, pull that channel back towards the other two. */
  if (uSpill > 0.0) {
    float excess = max(0.0, dot(fg, normalize(uKey + 0.001)) - length(fg) * 0.72);
    fg -= normalize(uKey + 0.001) * excess * uSpill;
  }
  /* A stop up or a stop down, about mid grey so it is exposure and not a
     wash: adding a constant lifts the blacks and makes a cutout float. */
  fg = clamp((fg - 0.5) * (1.0 + uLight * 0.35) + 0.5 + uLight * 0.12, 0.0, 1.0);
  float a = clamp(m, 0.0, 1.0);
  gl_FragColor = uCutout > 0.5
    ? vec4(fg, a)
    : vec4(mix(back, fg, a), 1.0);
}
`;

/* ------------------------------------------------------------------------ *
 *  The plumbing.
 * ------------------------------------------------------------------------ */

function compile(gl: WebGLRenderingContext, vs: string, fs: string) {
  const make = (kind: number, src: string) => {
    const shader = gl.createShader(kind)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
    }
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'link');
  }
  return program;
}

function hex(value: string): [number, number, number] {
  /* `SpaceLook` writes its colours as ffmpeg does — `0x1a1d24` — and the
     studio writes a chroma key as CSS does. One reader for both. */
  const clean = value.replace(/^(0x|#)/, '');
  const n = parseInt(clean, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface Target { frame: WebGLFramebuffer; texture: WebGLTexture }

/**
 * One compositor, shared by every source.
 *
 * A GL context per guest would be four contexts, four sets of compiled
 * shaders and — on most machines — a hard limit reached at about sixteen.
 * One context draws each person in turn into the same buffers, because
 * each person's composite is finished and copied out before the next
 * begins.
 */
export class LiveCompositor {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private programs: Record<string, WebGLProgram>;
  private quad: WebGLBuffer;
  private textures = new Map<string, WebGLTexture>();
  private targets: Target[] = [];
  private width = 0;
  private height = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    /*
     * ALPHA, and NOT premultiplied. The merge can hand back a cutout
     * with a straight alpha for a virtual set to composite onto, and a
     * premultiplied buffer would have the mask already multiplied into
     * the colour — which `drawImage` would then multiply a second time
     * and leave a dark halo exactly where the feather is.
     */
    const gl = this.canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    this.programs = {
      space: compile(gl, QUAD, SPACE_FS),
      copy: compile(gl, QUAD, COPY_FS),
      diff: compile(gl, QUAD, DIFF_FS),
      chroma: compile(gl, QUAD, CHROMA_FS),
      morph: compile(gl, QUAD, MORPH_FS),
      blur: compile(gl, QUAD, BLUR_FS),
      merge: compile(gl, QUAD, MERGE_FS),
    };
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  private texture(name: string): WebGLTexture {
    let found = this.textures.get(name);
    if (!found) {
      const gl = this.gl;
      found = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, found);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.textures.set(name, found);
    }
    return found;
  }

  resize(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.gl;
    for (const target of this.targets) {
      gl.deleteFramebuffer(target.frame);
      gl.deleteTexture(target.texture);
    }
    this.targets = [0, 1, 2].map(() => {
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const frame = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D, texture, 0);
      return { frame, texture };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private pass(
    program: WebGLProgram, into: Target | null,
    bind: (gl: WebGLRenderingContext, program: WebGLProgram) => void,
  ): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.frame : null);
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(program);
    const a = gl.getAttribLocation(program, 'a');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    bind(gl, program);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private upload(name: string, source: TexImageSource, unit: number): WebGLTexture {
    const gl = this.gl;
    const texture = this.texture(name);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return texture;
  }

  /**
   * Composite one person, and leave the answer on `this.canvas`.
   *
   * Returns false when there is nothing to do — no key, or a backdrop that
   * needs one and has not got it — so the caller draws the raw picture
   * rather than a black rectangle. **Failing honestly is the whole of S-6.**
   */
  draw(
    video: HTMLVideoElement, plate: TexImageSource | null,
    composition: Composition, panel: { w: number; h: number }, now: number,
    { cutout = false }: { cutout?: boolean } = {},
  ): boolean {
    if (!drawable(composition)) return false;
    /*
     * A CUTOUT NEEDS NO BACKDROP OF ITS OWN — the set behind it is the
     * whole frame — but it does need a key, because a person with
     * nothing separating them from their room cannot be cut out of it.
     */
    if (cutout) {
      if (composition.key.kind === 'none') return false;
    } else if (composition.backdrop.kind === 'none') return false;
    if (video.videoWidth === 0) return false;
    this.resize(Math.max(2, Math.round(panel.w)), Math.max(2, Math.round(panel.h)));
    const gl = this.gl;
    const [wash, mask, scratch] = this.targets as [Target, Target, Target];

    /*
     * WHERE THE PERSON SITS, worked out once and given to every shader
     * that samples them. `boxFor` is the shared geometry — the same
     * function the studio's own preview reasons about — turned into the
     * uv offset and scale a fragment shader wants. [§26 D, D-19]
     */
    const box = boxFor(composition.frame, { w: this.width, h: this.height },
      { w: video.videoWidth, h: video.videoHeight });
    const frame = (g: WebGLRenderingContext, program: WebGLProgram) => {
      g.uniform2f(g.getUniformLocation(program, 'uScale'),
        this.width / Math.max(1, box.w), this.height / Math.max(1, box.h));
      g.uniform2f(g.getUniformLocation(program, 'uOff'),
        box.x / Math.max(1, box.w), box.y / Math.max(1, box.h));
      g.uniform1f(g.getUniformLocation(program, 'uFlipX'),
        composition.frame.flip ? 1 : 0);
    };

    /* ---- 1. what goes behind ----------------------------------------- */
    const spaceId = cutout ? null : spaceOf(composition.backdrop);
    if (spaceId) {
      const look: SpaceLook = SPACE_LOOKS[spaceId]!;
      this.pass(this.programs['space']!, wash, (g, p) => {
        g.uniform3fv(g.getUniformLocation(p, 'uTop'), hex(look.top));
        g.uniform3fv(g.getUniformLocation(p, 'uBottom'), hex(look.bottom));
        g.uniform3fv(g.getUniformLocation(p, 'uGlow'), hex(look.glow.colour));
        g.uniform2f(g.getUniformLocation(p, 'uGlowAt'),
          look.glow.x, look.glow.y);
        g.uniform1f(g.getUniformLocation(p, 'uStrength'), look.glow.strength);
        g.uniform1f(g.getUniformLocation(p, 'uVignette'), look.vignette);
        g.uniform1f(g.getUniformLocation(p, 'uGrain'), look.grain);
        g.uniform3fv(g.getUniformLocation(p, 'uBand'),
          hex(look.band?.colour ?? '0x000000'));
        g.uniform1f(g.getUniformLocation(p, 'uBandY'), look.band?.y ?? 0);
        g.uniform1f(g.getUniformLocation(p, 'uBandH'), look.band?.height ?? 0);
        /* Grain that does not move is a texture printed on the backdrop. */
        g.uniform1f(g.getUniformLocation(p, 'uSeed'), (now % 1000) / 7);
      });
    } else {
      /* A BLUR IS THEIR OWN ROOM, so the backdrop is the source itself,
         softened. The same sigma the render path uses. */
      this.upload('fg', video, 0);
      this.pass(this.programs['copy']!, scratch, (g, p) => {
        g.uniform1i(g.getUniformLocation(p, 'uTex'), 0);
        g.uniform1i(g.getUniformLocation(p, 'uFlipY'), 1);
        g.uniform1i(g.getUniformLocation(p, 'uFramed'), 1);
        frame(g, p);
      });
      for (const dir of [[1, 0], [0, 1]] as const) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, scratch.texture);
        this.pass(this.programs['blur']!, wash, (g, p) => {
          g.uniform1i(g.getUniformLocation(p, 'uTex'), 0);
          g.uniform2f(g.getUniformLocation(p, 'uDir'),
            (dir[0] * BLUR_SIGMA) / this.width,
            (dir[1] * BLUR_SIGMA) / this.height);
        });
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, wash.texture);
        this.pass(this.programs['copy']!, scratch, (g, p) => {
          g.uniform1i(g.getUniformLocation(p, 'uTex'), 0);
          g.uniform1i(g.getUniformLocation(p, 'uFlipY'), 0);
        });
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, scratch.texture);
      this.pass(this.programs['copy']!, wash, (g, p) => {
        g.uniform1i(g.getUniformLocation(p, 'uTex'), 0);
        g.uniform1i(g.getUniformLocation(p, 'uFlipY'), 0);
      });
    }

    /* ---- 2. the matte ------------------------------------------------ */
    const key = composition.key;
    if (!cutout && composition.backdrop.kind === 'blur' && key.kind === 'none') {
      /* Their whole room, softened, and nobody cut out of it: one picture
         and no decision about any pixel. [STUDIO-TWO §4] */
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, wash.texture);
      this.pass(this.programs['copy']!, null, (g, p) => {
        g.uniform1i(g.getUniformLocation(p, 'uTex'), 0);
        g.uniform1i(g.getUniformLocation(p, 'uFlipY'), 0);
      });
      return true;
    }

    this.upload('fg', video, 0);
    if (key.kind === 'plate') {
      if (!plate) return false;
      this.upload('plate', plate, 1);
      this.pass(this.programs['diff']!, mask, (g, p) => {
        g.uniform1i(g.getUniformLocation(p, 'uFg'), 0);
        g.uniform1i(g.getUniformLocation(p, 'uPlate'), 1);
        g.uniform1f(g.getUniformLocation(p, 'uThreshold'), key.threshold);
        frame(g, p);
      });
    } else if (key.kind === 'chroma') {
      this.pass(this.programs['chroma']!, mask, (g, p) => {
        g.uniform1i(g.getUniformLocation(p, 'uFg'), 0);
        g.uniform3fv(g.getUniformLocation(p, 'uKey'), hex(key.colour));
        g.uniform1f(g.getUniformLocation(p, 'uSimilarity'), key.similarity);
        g.uniform1f(g.getUniformLocation(p, 'uSmoothness'), key.smoothness);
        frame(g, p);
      });
    } else {
      return false;
    }

    /* Erode once, dilate twice — `matteChain`'s own sequence. */
    let from = mask;
    let to = scratch;
    for (const mode of [-1, 1, 1]) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      this.pass(this.programs['morph']!, to, (g, p) => {
        g.uniform1i(g.getUniformLocation(p, 'uTex'), 0);
        g.uniform1f(g.getUniformLocation(p, 'uMode'), mode);
        g.uniform2f(g.getUniformLocation(p, 'uStep'),
          1 / this.width, 1 / this.height);
      });
      [from, to] = [to, from];
    }

    /* And the feather, separably, at the width the plate's quality asked. */
    const feather = key.kind === 'plate' ? key.feather : 1.5;
    for (const dir of [[1, 0], [0, 1]] as const) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      this.pass(this.programs['blur']!, to, (g, p) => {
        g.uniform1i(g.getUniformLocation(p, 'uTex'), 0);
        g.uniform2f(g.getUniformLocation(p, 'uDir'),
          (dir[0] * feather) / this.width, (dir[1] * feather) / this.height);
      });
      [from, to] = [to, from];
    }

    /* ---- 3. the merge ------------------------------------------------ */
    if (cutout) {
      /* Whatever the last person left on this canvas is not this
         person's background. A cutout is drawn over a cleared buffer. */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture('fg'));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, wash.texture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, from.texture);
    this.pass(this.programs['merge']!, null, (g, p) => {
      g.uniform1i(g.getUniformLocation(p, 'uFg'), 0);
      g.uniform1i(g.getUniformLocation(p, 'uBack'), 1);
      g.uniform1i(g.getUniformLocation(p, 'uMask'), 2);
      g.uniform1f(g.getUniformLocation(p, 'uCutout'), cutout ? 1 : 0);
      g.uniform1f(g.getUniformLocation(p, 'uLight'), composition.light);
      g.uniform1f(g.getUniformLocation(p, 'uSpill'),
        key.kind === 'chroma' ? key.spill : 0);
      g.uniform3fv(g.getUniformLocation(p, 'uKey'),
        hex(key.kind === 'chroma' ? key.colour : '#000000'));
      frame(g, p);
    });
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    for (const target of this.targets) {
      gl.deleteFramebuffer(target.frame);
      gl.deleteTexture(target.texture);
    }
    for (const texture of this.textures.values()) gl.deleteTexture(texture);
    this.targets = [];
    this.textures.clear();
  }
}

/** Re-exported so the mixer needs one import for the geometry as well. */
export { boxFor };
