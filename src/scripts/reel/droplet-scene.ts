/**
 * Droplet scene — the playable interior of the reel.
 *
 * The same material family as the hero's "Clarity in Chaos": ink, graphite
 * and chrome droplets under a studio key light, on a cyclorama. Where the
 * hero is a sculpture you approach, this is a toy you can play with:
 *
 *   hover   the droplets lean toward the cursor and, close to the centre,
 *           resolve into one smooth ink slab
 *   press   the slab bursts — every droplet is kicked outward, then drifts
 *           back and re-gathers
 *   idle    they breathe between chaos and clarity on their own
 *
 * One pass, one quad, into a render target the reel's frame samples. The
 * cyclorama is analytic (a floor plane and a wall gradient) rather than
 * raymarched, and the droplets are a single tight loop with soft shadows
 * and occlusion from the same SDF — about a third of the hero's cost, at a
 * fraction of its pixels.
 *
 * Positions are computed on the CPU each frame and passed as a uniform
 * array; loop bounds are uniforms so the Direct3D compiler behind Chrome on
 * Windows cannot unroll them.
 */
import {
  Color,
  GLSL3,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';

export const NBLOB = 7;
/** The first LABELLED droplets are the disciplines; the rest are small strays. */
export const LABELLED = 4;
const FLOOR_Y = -0.9;
const FOCAL = 1.9;

export interface ScenePalette {
  ink: Color;
  mid: Color;
  silver: Color;
  bg: Color;
  bg2: Color;
  warm: Color;
  cool: Color;
}

/**
 * The studio, as GLSL: a gradient dome with three softboxes read through
 * reflections, and the ink → graphite → chrome droplet ramp. Shared with the
 * reel frame's own droplet shading so the travelling droplet, the scene it
 * lands in and the hero it left all sit under the same light. Expects the
 * palette uniforms (uInk, uMid, uSilver, uBg, uBg2, uWarm, uCool) declared.
 */
export const STUDIO_GLSL = /* glsl */ `
float softbox(vec3 r, vec3 dir, vec2 size, float edge) {
  vec3 up = abs(dir.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 tx = normalize(cross(up, dir));
  vec3 ty = cross(dir, tx);
  float f = dot(r, dir);
  if (f <= 0.0) return 0.0;
  vec2 uv = vec2(dot(r, tx), dot(r, ty)) / f;
  vec2 a = size - abs(uv);
  return smoothstep(0.0, edge, a.x) * smoothstep(0.0, edge, a.y);
}

const vec3 KEY = vec3(-0.55, 0.8, 0.4);

vec3 env(vec3 r) {
  float t = r.y * 0.5 + 0.5;
  vec3 col = mix(uBg2 * 0.3 * uCool, uBg * 0.9, smoothstep(-0.2, 0.9, t));
  col += softbox(r, normalize(KEY), vec2(0.7, 0.24), 0.1) * 2.2 * uWarm;
  col += softbox(r, normalize(vec3(0.9, 0.3, -0.25)), vec2(0.14, 0.85), 0.08) * 1.4 * uCool;
  col += softbox(r, normalize(vec3(0.0, -0.1, 1.0)), vec2(1.1, 0.4), 0.2) * 0.45;
  col += uBg * 0.5 * smoothstep(0.0, -0.6, r.y);
  return col;
}

vec3 dropletColor(float t) {
  return t < 0.5 ? mix(uInk, uMid, t * 2.0) : mix(uMid, uSilver, (t - 0.5) * 2.0);
}

// Filmic roll-off and sRGB encode, as the hero does it.
vec3 finish(vec3 col) {
  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
  return pow(col, vec3(1.0 / 2.2));
}
`;

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform int uSteps, uBlobCount, uShadowSteps, uAoSteps, uFloorShadowSteps, uShadowBlobs;
uniform vec2  uRes;
uniform vec3  uRo, uFw, uRt, uUp;
uniform vec4  uBlobs[${NBLOB}];
uniform float uBlobTint[${NBLOB}];
uniform float uK;
uniform vec3  uInk, uMid, uSilver, uBg, uBg2, uWarm, uCool;

in vec2 vUv;
out vec4 fragColor;

#define FLOOR_Y ${FLOOR_Y.toFixed(1)}
#define FOCAL 1.9

${STUDIO_GLSL}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < uBlobCount; i++) {
    vec4 bl = uBlobs[i];
    d = smin(d, length(p - bl.xyz) - bl.w, uK);
  }
  return d;
}

// The body only: shadows and occlusion ignore the tiny strays, which cast
// nothing you could see and cost a full loop each.
float mapShadow(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < uShadowBlobs; i++) {
    vec4 bl = uBlobs[i];
    d = smin(d, length(p - bl.xyz) - bl.w, uK);
  }
  return d;
}

float tintAt(vec3 p) {
  float wsum = 0.0, tsum = 0.0;
  for (int i = 0; i < uBlobCount; i++) {
    vec4 bl = uBlobs[i];
    float di = length(p - bl.xyz) - bl.w;
    float w = exp(-9.0 * max(di, 0.0));
    wsum += w; tsum += w * uBlobTint[i];
  }
  return wsum > 0.0 ? tsum / wsum : 0.5;
}

vec3 calcNormal(vec3 p, float eps) {
  vec2 e = vec2(eps, -eps);
  return normalize(
    e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx)
  );
}

float softShadow(vec3 ro, vec3 rd, int steps) {
  float res = 1.0, t = 0.08;
  for (int i = 0; i < steps; i++) {
    float h = mapShadow(ro + rd * t);
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.08, 0.45);
    if (res < 0.01 || t > 6.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float ambientOcclusion(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < uAoSteps; i++) {
    float h = 0.05 + 0.18 * float(i);
    occ += (h - mapShadow(p + n * h)) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 1.4 * occ, 0.0, 1.0);
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float tint) {
  vec3 v = -rd;
  vec3 r = reflect(rd, n);
  vec3 L = normalize(KEY);
  float ao = ambientOcclusion(p, n);
  float sh = softShadow(p + n * 0.03, L, uShadowSteps);
  float ndl = max(dot(n, L), 0.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 albedo = dropletColor(tint);
  float bounce = smoothstep(0.2, -1.0, n.y) * smoothstep(1.5, FLOOR_Y, p.y);
  vec3 diffuse = albedo * ((0.22 + 0.62 * ndl * sh) * ao + bounce * 0.35 * uBg);
  float gloss = mix(0.7, 1.0, tint);
  vec3 spec = env(r) * ao * mix(0.05, 1.0, fres) * gloss;
  vec3 h = normalize(L + v);
  spec += pow(max(dot(n, h), 0.0), 160.0) * 0.7 * sh;
  return diffuse + spec;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = uRo;
  vec3 rd = normalize(uFw * FOCAL + uRt * uv.x + uUp * uv.y);
  vec3 L = normalize(KEY);
  float px = 1.0 / (uRes.y * FOCAL);

  // --- Cyclorama: analytic floor, gradient wall ------------------------------
  vec3 col;
  float tFloor = rd.y < -1e-4 ? (FLOOR_Y - ro.y) / rd.y : 1e5;
  if (tFloor < 40.0) {
    vec3 p = ro + rd * tFloor;
    float dist = length(p.xz);
    vec3 albedo = mix(uBg2, uBg, 0.75) * uWarm;
    float sh = softShadow(p + vec3(0.0, 0.04, 0.0), L, uFloorShadowSteps);
    // Contact darkening: how close the sculpture hovers over this point.
    float near = map(p + vec3(0.0, 0.12, 0.0));
    float contact = 1.0 - 0.55 * exp(-near * 2.2);
    float pool = 1.0 - 0.45 * smoothstep(1.2, 6.0, dist);
    vec3 light = uCool * 0.38 + uWarm * 0.55 * mix(0.22, 1.0, sh);
    col = albedo * light * pool * contact;
    // The floor sweeps up into the wall: fade toward the wall colour with depth.
    col = mix(col, mix(uBg2, uBg, 0.45) * uCool, smoothstep(2.0, 9.0, -p.z));
  } else {
    float t = clamp(rd.y * 1.6 + 0.35, 0.0, 1.0);
    col = mix(mix(uBg2, uBg, 0.45) * uCool, uBg * 0.98, t);
  }

  // --- Sculpture ---------------------------------------------------------------
  float t = 0.0, d = 0.0, minD = 1e5, tMin = 0.0;
  bool hit = false;
  for (int i = 0; i < uSteps; i++) {
    vec3 p = ro + rd * t;
    d = map(p);
    float m = d / max(t * px, 1e-4);
    if (m < minD) { minD = m; tMin = t; }
    if (d < 0.0008 * t) { hit = true; break; }
    t += d * 0.85;
    if (t > 14.0) break;
  }
  float cover = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.0, minD);
  if (cover > 0.0) {
    float ts = hit ? t : tMin;
    vec3 p = ro + rd * ts;
    vec3 n = calcNormal(p, 0.002 + 0.0015 * ts);
    vec3 s = shade(p, n, rd, tintAt(p));
    col = mix(col, s, cover);
  }

  // Vignette, filmic roll-off, grain, sRGB encode — as the hero does it.
  col *= 1.0 - 0.18 * smoothstep(0.45, 1.2, length(uv * vec2(0.8, 1.3)));
  col = finish(col);
  col = clamp(col + (hash(gl_FragCoord.xy * 0.37) - 0.5) * 0.028, 0.0, 1.0);
  fragColor = vec4(col, 1.0);
}
`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));

/**
 * What one frame is allowed to cost, from most to least. Every field is a
 * texture scale or a loop bound that is already a uniform, so moving between
 * tiers reallocates one texture and sets a few ints — no recompile.
 */
type Tier = { scale: number; steps: number; shadow: number; floorShadow: number; ao: number };

const TIERS: readonly Tier[] = [
  { scale: 1.0, steps: 48, shadow: 6, floorShadow: 4, ao: 3 },
  { scale: 0.8, steps: 40, shadow: 5, floorShadow: 3, ao: 2 },
  { scale: 0.62, steps: 32, shadow: 4, floorShadow: 3, ao: 2 },
  { scale: 0.48, steps: 26, shadow: 3, floorShadow: 2, ao: 2 },
];

/** Governor: a rendered frame that lands this much later than the display's
 *  cadence asked for is a miss. Judged per one-second window. */
const FRAME_TARGET_MS = 1000 / 60;
const MISS_SLACK_MS = 14;
const MISS_RATE_DOWN = 0.08;
const MISS_RATE_UP = 0.01;
const WINDOW_MS = 1000;

export class DropletScene {
  readonly target: WebGLRenderTarget;
  // Governor state.
  private tier = 1;
  private appliedTier = -1;
  private baseW = 2;
  private baseH = 2;
  private windowStart = 0;
  private windowFrames = 0;
  private windowMisses = 0;
  private goodWindows = 0;
  private goodNeeded = 3;
  private settleUntil = 0;
  private lastRender = 0;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: ShaderMaterial;
  private blobs = Array.from({ length: NBLOB }, () => new Vector4(0, 0, 0, 0.3));
  private tints = new Float32Array(NBLOB);
  private kick = Array.from({ length: NBLOB }, () => new Vector3());
  private cam = {
    uRo: { value: new Vector3() },
    uFw: { value: new Vector3() },
    uRt: { value: new Vector3() },
    uUp: { value: new Vector3() },
  };
  private colors = {
    uInk: { value: new Color() },
    uMid: { value: new Color() },
    uSilver: { value: new Color() },
    uBg: { value: new Color() },
    uBg2: { value: new Color() },
    uWarm: { value: new Color() },
    uCool: { value: new Color() },
  };
  private mouse = new Vector2();
  private mouseTarget = new Vector2();
  private pointerActive = false;
  private pointerLast = -Infinity;
  private _clarity = 0.15;
  private time = 0;
  private up = new Vector3(0, 1, 0);
  private tmp = new Vector3();

  constructor() {
    this.target = new WebGLRenderTarget(2, 2, { depthBuffer: false, stencilBuffer: false });
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        ...this.cam,
        ...this.colors,
        uSteps: { value: 48 },
        uBlobCount: { value: NBLOB },
        uShadowBlobs: { value: LABELLED },
        uShadowSteps: { value: 6 },
        uFloorShadowSteps: { value: 4 },
        uAoSteps: { value: 3 },
        uRes: { value: new Vector2(2, 2) },
        uBlobs: { value: this.blobs },
        uBlobTint: { value: this.tints },
        uK: { value: 0.5 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  setPalette(p: ScenePalette) {
    this.colors.uInk.value.copy(p.ink);
    this.colors.uMid.value.copy(p.mid);
    this.colors.uSilver.value.copy(p.silver);
    this.colors.uBg.value.copy(p.bg);
    this.colors.uBg2.value.copy(p.bg2);
    this.colors.uWarm.value.copy(p.warm);
    this.colors.uCool.value.copy(p.cool);
  }

  /** The size the texture would be at full quality; the tier scales it. */
  setSize(width: number, height: number) {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (w === this.baseW && h === this.baseH && this.appliedTier === this.tier) return;
    this.baseW = w;
    this.baseH = h;
    this.applyTier();
  }

  /** The quality tier in use, 0 (best) … 3. */
  get quality() {
    return this.tier;
  }

  private applyTier() {
    const q = TIERS[this.tier];
    this.appliedTier = this.tier;
    const w = Math.max(2, Math.round(this.baseW * q.scale));
    const h = Math.max(2, Math.round(this.baseH * q.scale));
    if (w !== this.target.width || h !== this.target.height) {
      this.target.setSize(w, h);
      this.material.uniforms.uRes.value.set(w, h);
    }
    const u = this.material.uniforms;
    u.uSteps.value = q.steps;
    u.uShadowSteps.value = q.shadow;
    u.uFloorShadowSteps.value = q.floorShadow;
    u.uAoSteps.value = q.ao;
  }

  private resetWindow(now: number) {
    this.windowStart = now;
    this.windowFrames = 0;
    this.windowMisses = 0;
  }

  private setTier(next: number, now: number) {
    next = Math.max(0, Math.min(TIERS.length - 1, next));
    if (next === this.tier) return;
    this.tier = next;
    this.applyTier();
    this.resetWindow(now);
    this.settleUntil = now + WINDOW_MS;
  }

  /**
   * Call once per rendered frame, while frames are expected back to back.
   * Too many late frames in a window steps the quality down; a clean run
   * steps it up, and each step up demands a longer clean run than the last,
   * so a step that proves too much is paid for once, not every few seconds.
   * Call `pause()` when frames stop on purpose (idle, off screen), so the
   * gap is not judged as a miss.
   */
  govern(now: number, target = FRAME_TARGET_MS) {
    const interval = this.lastRender ? now - this.lastRender : target;
    this.lastRender = now;
    if (now < this.settleUntil) {
      this.resetWindow(now);
      return;
    }
    this.windowFrames++;
    if (interval > target + MISS_SLACK_MS) this.windowMisses++;
    if (now - this.windowStart < WINDOW_MS || this.windowFrames < 10) return;
    const missRate = this.windowMisses / this.windowFrames;
    if (missRate > MISS_RATE_DOWN) {
      this.goodWindows = 0;
      this.setTier(this.tier + 1, now);
    } else if (missRate < MISS_RATE_UP && this.tier > 0) {
      this.goodWindows++;
      if (this.goodWindows >= this.goodNeeded) {
        this.goodWindows = 0;
        this.goodNeeded = Math.min(this.goodNeeded * 2, 48);
        this.setTier(this.tier - 1, now);
      }
    } else {
      this.goodWindows = 0;
    }
    this.resetWindow(now);
  }

  /** Frames are stopping on purpose; don't judge the gap. */
  pause() {
    this.lastRender = 0;
    this.settleUntil = performance.now() + WINDOW_MS * 0.5;
  }

  /** How resolved the sculpture is right now, 0 chaos … 1 one slab. */
  get clarity() {
    return this._clarity;
  }

  /**
   * Where droplet `i` sits on the rendered texture: x and y in 0…1 (y up),
   * its on-screen radius in the same units of height, and whether it is in
   * front of the camera. The same projection the shaders use, so a label
   * placed here lands on the droplet.
   */
  project(i: number, out: { x: number; y: number; r: number; visible: boolean }) {
    const b = this.blobs[i];
    const c = this.cam;
    const v = this.tmp.set(b.x, b.y, b.z).sub(c.uRo.value);
    const z = v.dot(c.uFw.value);
    if (z <= 0.1) {
      out.visible = false;
      return out;
    }
    const res = this.material.uniforms.uRes.value as Vector2;
    const u = (v.dot(c.uRt.value) / z) * FOCAL;
    const w = (v.dot(c.uUp.value) / z) * FOCAL;
    out.x = 0.5 + u * (res.y / Math.max(1, res.x));
    out.y = 0.5 + w;
    out.r = (b.w / z) * FOCAL;
    out.visible = true;
    return out;
  }

  /** Pointer in scene space, -1…1 across, -1…1 up. */
  setPointer(x: number, y: number, active: boolean, now: number) {
    this.pointerActive = active;
    if (active) {
      this.mouseTarget.set(clamp(x, -1.2, 1.2), clamp(y, -1.2, 1.2));
      this.pointerLast = now;
    }
  }

  /** The press: every droplet is thrown outward from the centre. */
  burst() {
    for (let i = 0; i < NBLOB; i++) {
      const b = this.blobs[i];
      const dir = this.tmp.set(b.x, b.y + 0.3, b.z);
      const len = dir.length() || 1;
      dir.divideScalar(len);
      // Nearer the centre gets kicked harder, and everything gets some lift.
      const power = 2.4 + 1.2 * (1 - clamp(len / 1.6, 0, 1));
      this.kick[i].addScaledVector(dir, power).y += 0.8;
    }
    this._clarity = Math.min(this._clarity, 0.05);
  }

  update(dt: number, now: number) {
    this.time += dt;
    const t = this.time;
    const idle = !this.pointerActive || now - this.pointerLast > 2500;

    let clarityTarget: number;
    if (idle) {
      this.mouseTarget.set(Math.sin(t * 0.21) * 0.45, Math.cos(t * 0.17) * 0.25);
      // Breathing at rest stays well short of fusing: four pieces, not a lump.
      clarityTarget = 0.04 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.28));
    } else {
      const m = this.mouseTarget;
      const dist = Math.hypot(m.x, m.y + 0.05);
      clarityTarget = 1 - smoothstep(0.1, 0.8, dist);
    }
    this.mouse.lerp(this.mouseTarget, 1 - Math.exp(-(idle ? 1.2 : 5) * dt));
    this._clarity = damp(this._clarity, clarityTarget, idle ? 1.4 : 3.2, dt);

    // Camera: a low three-quarter that turns a little with the cursor. The
    // frame is normalised by its height, so a portrait frame shows less
    // width: pull back until the sculpture's spread still fits across it.
    const res = this.material.uniforms.uRes.value as Vector2;
    const aspect = res.x / Math.max(1, res.y);
    const distance = Math.max(5.2, 5.9 / aspect);
    const yaw = this.mouse.x * 0.14 + 0.3;
    const pitch = this.mouse.y * 0.08 + 0.2;
    const target = this.tmp.set(0, -0.2, 0);
    const c = this.cam;
    c.uRo.value
      .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      .multiplyScalar(distance)
      .add(target);
    c.uFw.value.subVectors(target, c.uRo.value).normalize();
    c.uRt.value.crossVectors(this.up, c.uFw.value).normalize();
    c.uUp.value.crossVectors(c.uFw.value, c.uRt.value);

    // Droplets: chaos orbits that lean to the cursor, gathering into a slab
    // as clarity rises; a burst impulse decays on top of either.
    // On a wide frame the words sit bottom-left, so the sculpture lives to
    // the right of centre; on a portrait one it stays in the middle. With
    // this camera, screen-right is negative world x.
    const shift = aspect > 1.2 ? -0.75 : 0;
    const ax = this.mouse.x * 1.4 + shift;
    const ay = this.mouse.y * 0.8;
    const az = 0.3;
    const cl = this._clarity;
    const ce = cl * cl * (3 - 2 * cl);
    const spin = t * 0.09 + 0.4;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    // Chaos is FOUR PIECES: the union radius stays small until clarity fuses
    // them, so they can pass close without melting into one another.
    this.material.uniforms.uK.value = lerp(0.14, 0.75, ce);

    const decay = Math.exp(-2.6 * dt);
    for (let i = 0; i < NBLOB; i++) {
      let cx: number;
      let cy: number;
      let cz: number;
      if (i < LABELLED) {
        // Each discipline keeps its own station — a slow ring, one per
        // quadrant — with a little drift, and a light lean to the cursor.
        const a = t * 0.16 + (i * Math.PI) / 2;
        cx = Math.cos(a) * 1.25 + Math.sin(t * 0.5 + i * 1.7) * 0.12;
        cy = 0.05 + Math.sin(t * 0.45 + i * 2.3) * 0.22 + (i % 2) * 0.25;
        cz = Math.sin(a) * 0.7 + Math.cos(t * 0.4 + i * 3.1) * 0.1;
        const lean = 0.12;
        cx += (ax - cx) * lean;
        cy += (ay - cy) * lean;
        cz += (az - cz) * lean;
      } else {
        // Strays: small, quick, out on the edge.
        const a = t * (0.3 + 0.07 * i) + i * 2.1;
        cx = Math.cos(a) * 1.9 + shift * 0.6;
        cy = -0.1 + Math.sin(a * 1.6 + i) * 0.45;
        cz = Math.sin(a) * 1.1;
      }

      const ox0 = -1.05 + (2.1 * i) / (NBLOB - 1);
      const oz0 = 0.16 * Math.sin(i * 2.4);
      const oy = -0.45 + 0.03 * Math.sin(i * 1.3);
      // The disciplines are the body; the strays stay small.
      const rc = i < LABELLED ? 0.27 + 0.03 * Math.sin(i * 2 + t * 0.55) : 0.1;

      const k = this.kick[i];
      k.multiplyScalar(decay);
      this.blobs[i].set(
        // The slab is wide: it needs more shift than the pieces to clear
        // the caption, but not so much it leaves the frame.
        lerp(cx, ox0 * cs - oz0 * sn + shift * 1.4, ce) + k.x * 0.35,
        Math.max(FLOOR_Y + 0.25, lerp(cy, oy, ce) + k.y * 0.35),
        lerp(cz, -ox0 * sn + oz0 * cs, ce) + k.z * 0.35,
        lerp(rc, 0.4, ce)
      );
      const own = (i * 0.37 + 0.11) % 1;
      this.tints[i] = lerp(own, 0.12, ce * 0.85);
    }
  }

  render(renderer: WebGLRenderer) {
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
  }
}
