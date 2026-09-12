/**
 * FounderInk — "Wet ink"
 *
 * The founder's portrait as a point cloud in ink: a hundred and fifty
 * thousand specks, each on the surface of the head as a depth map of the
 * photograph gives it, each toned by the print's density. It is a real form
 * — it turns as the cursor moves, and a wet sheen travels across it as the
 * light catches the surface — and its edges are never quite dry: the hair's
 * tips and the foot of the bust are always dissolving into drifting specks.
 * Where the hand touches it the specks come alive: they pop toward the
 * viewer, close up, take on the photograph's colour and light, move like
 * something wet — dragged by the hand, stirred by turbulence — and spring
 * back into ink when the hand leaves. "Less handoff, more hands-on", made literal: you
 * reach in and the work comes off the page.
 *
 * Structure:
 *
 *   prep       scripts/founder-print.mjs turns the portrait and its depth
 *              map into two textures: the photograph with a soft subject
 *              matte in alpha, and an ink map (R density on paper, G the
 *              negative for an ink ground, B depth). Run once, committed.
 *   specks     on load, both textures are decoded on the CPU and every
 *              speck's home, densities, colour, matte, edge weight and
 *              surface normal are baked into attributes and textures. A GPU
 *              ping-pong simulation (GPUComputationRenderer) then holds
 *              position and velocity per speck: a spring to a target (its
 *              place on the print, or lifted into the relief), a drag from
 *              the hand's velocity, curl-noise turbulence while loose,
 *              damping.
 *
 * Uniforms of note:
 *
 *   uProgress  scroll-linked print-in: the section's progress through the
 *              viewport from entry 0% to entry 100%, eased, held at 1 once
 *              it has arrived. The ink lays down top to bottom, heavier at
 *              the leading edge.
 *   uReveal    eases toward 1 while the pointer is over the section and back
 *              toward 0 when it leaves. On touch devices there is no hover,
 *              so a soft lens drifts across the portrait instead.
 *   uMouse     the pointer on the page, in world units; uMouseVel its speed.
 *
 * World units: the portrait is one unit tall, centred at the origin on the
 * z = 0 page plane; the camera is set so one unit fills the canvas height
 * and orbits the print with the pointer. Dark mode flips the ground to ink,
 * so the print is ice from the negative (uInvert). Everything is raw sRGB,
 * straight to a premultiplied canvas.
 *
 * The loop runs only while the section is within 20% of the viewport and
 * the tab is visible: 60 fps while the pointer or the page is moving, 30 fps
 * at rest. Plain three.js from one React effect, like HeroScene.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GPUComputationRenderer, type Variable } from 'three/addons/misc/GPUComputationRenderer.js';

// ---------------------------------------------------------------------------
// Shared GLSL
// ---------------------------------------------------------------------------

const glslNoise = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

// How much a point on the page is under the hand: a ragged, breathing edge,
// with every point answering on its own beat.
const glslHand = /* glsl */ `
  uniform float uTime, uReveal, uRevealR, uEdgeNoise;
  uniform vec2 uMouse;
  float handWeight(vec2 p, float rnd) {
    float dm = distance(p, uMouse);
    float edge = dm + (noise(p * 9.0 - uTime * 0.35) - 0.5) * uEdgeNoise;
    float w = smoothstep(uReveal * uRevealR, uReveal * uRevealR * 0.4, edge) * step(0.02, uReveal);
    return smoothstep(rnd * 0.25, rnd * 0.25 + 0.75, w);
  }
`;

// The press lays the ink down top to bottom, heavier and wetter at the
// leading edge. The foot of the bust and the soft edge of the matte are
// where the print is always coming apart into specks.
const glslPrint = /* glsl */ `
  uniform float uProgress;
  float printIn(float tTop) { return clamp((uProgress * 1.15 - tTop) / 0.1, 0.0, 1.0); }
  float footWeight(float tTop) { return smoothstep(0.76, 0.9, tTop); }
  float edgeWeight(float matte) { return 1.0 - smoothstep(0.15, 0.7, matte); }
  // Specks thin out and vanish below the foot, so the bust does not end in
  // a line of dust.
  float footAlive(float tTop) { return 1.0 - smoothstep(0.88, 0.98, tTop); }
`;

// ---------------------------------------------------------------------------
// Simulation shaders (GPUComputationRenderer declares resolution, tPos, tVel)
// ---------------------------------------------------------------------------

const velocityShader = /* glsl */ `
  uniform sampler2D tHome, tMeta;
  uniform float uDt, uRelief, uRestRelief, uSpring, uDamp, uDrag, uTurb;
  uniform vec2 uMouseVel;
  ${glslNoise}
  ${glslHand}

  vec3 curl(vec3 p) {
    float e = 0.02;
    float n1 = noise(p.xy + vec2(0.0, e)) - noise(p.xy - vec2(0.0, e));
    float n2 = noise(p.xy + vec2(e, 0.0)) - noise(p.xy - vec2(e, 0.0));
    float n3 = noise(p.yz * 1.3 + vec2(e, 0.0)) - noise(p.yz * 1.3 - vec2(e, 0.0));
    return vec3(n1, -n2, 0.5 * n3) / (2.0 * e);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 home = texture2D(tHome, uv);
    vec4 meta = texture2D(tMeta, uv);   // edge weight, unused…
    vec4 pos = texture2D(tPos, uv);
    vec4 vel = texture2D(tVel, uv);
    float rnd = home.w;
    float edge = meta.x;
    float hand = handWeight(home.xy, rnd);
    float loose = max(hand, edge);

    // Where this speck wants to be: on the print, or lifted into the full
    // relief of the head under the hand, scattered a little in depth so the
    // lifted ink is a cloud, not a skin. Loose edge specks hover just above
    // the print.
    float zRest = home.z * uRelief * uRestRelief;
    float zFull = zRest + 0.05;
    float z = mix(zRest, zFull, hand) + edge * (0.02 + 0.06 * rnd);
    vec3 target = vec3(home.xy, z);

    vec3 v = vel.xyz;
    // Loose specks are on a softer spring, so the turbulence carries them.
    v += (target - pos.xyz) * uSpring * (1.0 - 0.85 * edge * (1.0 - hand)) * uDt;
    // The hand drags the wet ink along with it.
    float grip = smoothstep(uRevealR * 1.3, 0.0, distance(home.xy, uMouse)) * uReveal;
    v.xy += uMouseVel * grip * uDrag * uDt;
    // Wet ink is never still; loose ink drifts.
    vec3 c = curl(pos.xyz * 6.0 + vec3(0.0, 0.0, uTime * 0.4) + uTime * 0.25);
    v += c * (hand * uTurb + edge * 0.05) * uDt;
    v.y -= edge * 0.06 * uDt;
    v *= exp(-uDamp * uDt);
    gl_FragColor = vec4(v, hand);
  }
`;

const positionShader = /* glsl */ `
  uniform float uDt;
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 pos = texture2D(tPos, uv);
    vec4 vel = texture2D(tVel, uv);
    pos.xyz += vel.xyz * uDt;
    // The hand weight, eased, rides along in w for the draw shader.
    pos.w += (vel.w - pos.w) * min(1.0, uDt * 9.0);
    gl_FragColor = pos;
  }
`;

// ---------------------------------------------------------------------------
// The specks
// ---------------------------------------------------------------------------

const speckVertexShader = /* glsl */ `
  precision highp float;

  // ref      this speck's texel in the simulation
  // aData    tTop, matte, sqrt(density) on paper, sqrt(density) on ink
  // aColor   the photograph at this speck, raw sRGB
  // aNormal  the surface normal's xy, from the depth map
  // aEdge    how loose this speck always is (matte edge, foot of the bust)
  attribute vec2 ref;
  attribute vec4 aData;
  attribute vec3 aColor;
  attribute vec2 aNormal;
  attribute float aEdge;

  uniform sampler2D tPos, tHome;
  uniform float uCell;        // speck pitch, world units
  uniform float uProj;        // device px per world unit at unit distance
  uniform float uInvert;
  uniform vec3  uInkColor, uPaper, uView;
  ${glslPrint}

  varying vec4 vColor;
  varying float vSize;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec4 P = texture2D(tPos, ref);
    vec4 home = texture2D(tHome, ref);
    float rnd = home.w;
    float hand = P.w;
    float tTop = aData.x;
    float matte = aData.y;
    float d = mix(aData.z, aData.w, uInvert);
    d *= d;

    // --- Assembly: on scroll-in the specks gather from dust scattered across
    // the page into the head, top first, each on its own beat.
    float arrive = clamp((uProgress * uProgress * 1.45 - rnd * 0.35 - tTop * 0.3) / 0.6, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - arrive, 3.0);
    vec3 scatter = vec3(hash(home.xy) - 0.5, hash(home.yx + 3.1) - 0.5, hash(home.xy * 1.7 + 9.2) - 0.3);
    vec3 dust = vec3(home.xy, 0.0) + scatter * vec3(1.7, 1.5, 0.8);
    vec3 pos = mix(dust, P.xyz, ease);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // --- Form: a sculpture under a key light. The shadow side is dense ink,
    // the lit side sparse; the photograph's density adds the features; the
    // silhouette darkens where the surface turns away, and fades where it
    // turns right away from the eye.
    vec3 N = normalize(vec3(aNormal, sqrt(max(0.0, 1.0 - dot(aNormal, aNormal)))));
    vec3 L = normalize(vec3(-0.5, 0.55, 0.7));
    float lambert = max(dot(N, L), 0.0);
    float facing = max(dot(N, uView), 0.0);
    float ink = clamp(0.22 + 0.5 * (1.0 - lambert) + 0.5 * d, 0.0, 1.0);
    ink = max(ink, pow(1.0 - facing, 3.0) * 0.9);
    float sil = smoothstep(0.05, 0.45, facing);

    // --- Depth cues: near is bigger and stronger, far smaller and fainter;
    // a focal plane on the face, with the rest softening away from it.
    float near = home.z;
    float depthScale = mix(0.65, 1.25, near);
    float depthAlpha = mix(0.5, 1.0, near);
    float blur = clamp(abs(near - 0.72) * 1.7 - 0.15, 0.0, 1.0);

    // Where the light of the hand falls the cloud condenses into the
    // photograph: full-size dots that touch, at full strength, in focus.
    float restSize = (0.85 + 0.25 * rnd) * depthScale * (0.75 + 0.5 * ink) * (1.0 + blur * 1.2);
    float size = uCell * mix(restSize, 2.4, hand) * footAlive(tTop) * mix(0.5, 1.0, ease);
    float px = size * uProj / max(-mv.z, 0.05);
    gl_PointSize = px;
    vSize = px;

    // --- Colour: ink at rest, with a wet sheen that travels as it turns; the
    // photograph's colour where the light of the hand falls.
    vec3 inkTone = mix(uPaper, uInkColor, ink);
    vec3 H = normalize(L + uView);
    float sheen = pow(max(dot(N, H), 0.0), 26.0);
    inkTone = mix(inkTone, mix(inkTone, vec3(1.0), 0.6), sheen * ink * 0.45);
    vec3 lit = aColor * (0.82 + 0.25 * lambert);
    vec3 col = mix(inkTone, lit, smoothstep(0.15, 0.8, hand));
    float restAlpha = depthAlpha * sil / (1.0 + blur * 1.5);
    float alpha = matte * mix(restAlpha, 1.0, hand) * mix(0.3, 1.0, ease);
    vColor = vec4(col, alpha);
  }
`;

const speckFragmentShader = /* glsl */ `
  precision highp float;

  varying vec4 vColor;
  varying float vSize;

  void main() {
    if (vSize < 0.3) discard;
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    float aa = min(1.4 / max(vSize, 1.0), 0.6);
    float a = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * vColor.a;
    a *= clamp(vSize, 0.0, 1.0);
    if (a <= 0.003) discard;
    gl_FragColor = vec4(vColor.rgb * a, a); // premultiplied
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a CSS colour expression to a raw sRGB THREE.Color. The whole scene
 * works in sRGB — the print is the photograph's own values, straight to the
 * canvas — so nothing is linearised. Only runs on mount and on a theme
 * change.
 */
let probeEl: HTMLSpanElement | null = null;
let probeCtx: CanvasRenderingContext2D | null = null;

function cssColor(expr: string, fallback: string): THREE.Color {
  try {
    if (!probeEl) probeEl = document.createElement('span');
    if (!probeCtx) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probeCtx = c.getContext('2d', { willReadFrequently: true });
    }
    if (!probeCtx) throw new Error('no 2d context');
    probeEl.style.color = expr;
    document.documentElement.appendChild(probeEl);
    const computed = getComputedStyle(probeEl).color;
    probeEl.remove();
    probeCtx.fillStyle = computed;
    probeCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color(r / 255, g / 255, b / 255);
  } catch {
    return hexColor(fallback);
  }
}

/** A hex string as raw sRGB — `new THREE.Color('#…')` would linearise it. */
function hexColor(hex: string): THREE.Color {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function readTheme() {
  return {
    ink: cssColor('var(--foreground)', '#0c1016'),
    paper: cssColor('var(--background)', '#eef2f4'),
  };
}

function luminance(c: THREE.Color) {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Per-frame lerp factor `k` at 60 fps, made independent of the frame rate. */
function rateLerp(k: number, dt: number) {
  return 1 - Math.pow(1 - k, dt * 60);
}

/** Decode an image to pixels, exactly as stored (no premultiply, no colour
 *  management), so the matte and the ink map read back as written. */
async function decode(url: string): Promise<ImageData> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return ctx.getImageData(0, 0, c.width, c.height);
}

/** A float texture of per-speck data for the simulation. */
function floatTexture(data: Float32Array<ArrayBuffer>, size: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const clamp = THREE.MathUtils.clamp;
const smoothstep = THREE.MathUtils.smoothstep;

/** How many specks to aim for; the pitch follows from the subject's area. */
const TARGET = 150_000;
/** Screen angle, 15 degrees: the specks still lie on a printer's screen. */
const ANGLE = 0.2618;
/** Per-speck jitter, as a fraction of the pitch — grain, not a grid. */
const JITTER = 0.45;
/** Camera field of view; the distance follows so one unit fills the height. */
const FOV = 20;
/** Depth range of the head under the hand, in world units (height = 1). */
const RELIEF = 0.4;
/** How much of it the print rests on. */
const REST_RELIEF = 1.0;
/** The portrait is nudged up so the head sits high. */
const NUDGE = 0.03;
/** How much closer than "one unit fills the height" the camera sits. */
const ZOOM = 1.18;
/** How far the camera orbits with the pointer, in radians, each axis. */
const TILT_X = 0.4;
const TILT_Y = 0.22;
/** The slow turn the head makes on its own, in radians. */
const SWAY_X = 0.3;
const SWAY_Y = 0.07;
/** The idle lens on touch: this much reveal, on a ~14 s path. */
const TOUCH_REVEAL = 0.6;
const TOUCH_PERIOD = 14;
const REVEAL_EPS = 0.001;
/** Simulation constants: a lightly underdamped spring, so ink settles with
 *  a little life; drag from the hand; turbulence while wet. */
const SPRING = 70;
const DAMP = 6;
const DRAG = 0.35;
const TURB = 0.015;

type Cloud = {
  geo: THREE.BufferGeometry;
  home: Float32Array<ArrayBuffer>;
  meta: Float32Array<ArrayBuffer>;
  size: number;
  count: number;
  cellWorld: number;
};

/**
 * Lay the specks out: a lattice rotated 15 degrees in the portrait's own
 * pixels, jittered into grain, keeping every cell that lands on the subject.
 * Each speck carries its densities, colour, matte, edge weight, surface
 * normal and a home position with its depth.
 */
function buildCloud(photo: ImageData, ink: ImageData): Cloud {
  const W = photo.width;
  const H = photo.height;
  const aspect = W / H;

  // Pitch from the subject's area, so the count lands near the target.
  let area = 0;
  for (let i = 3; i < photo.data.length; i += 4) if (photo.data[i] > 16) area++;
  const pitch = Math.max(1.2, Math.sqrt(area / TARGET));

  const ca = Math.cos(ANGLE);
  const sa = Math.sin(ANGLE);
  let gi0 = Infinity;
  let gi1 = -Infinity;
  let gj0 = Infinity;
  let gj1 = -Infinity;
  for (const [x, y] of [
    [0, 0],
    [W, 0],
    [0, H],
    [W, H],
  ]) {
    const gi = (ca * x + sa * y) / pitch;
    const gj = (-sa * x + ca * y) / pitch;
    gi0 = Math.min(gi0, gi);
    gi1 = Math.max(gi1, gi);
    gj0 = Math.min(gj0, gj);
    gj1 = Math.max(gj1, gj);
  }

  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const depthAt = (x: number, y: number) =>
    ink.data[(clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)) * 4 + 2] / 255;

  const pos: number[] = [];
  const data: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const edge: number[] = [];
  const homes: number[] = [];
  for (let gj = Math.floor(gj0); gj <= gj1; gj++) {
    for (let gi = Math.floor(gi0); gi <= gi1; gi++) {
      const lx = (gi + 0.5 + (rand() - 0.5) * JITTER) * pitch;
      const ly = (gj + 0.5 + (rand() - 0.5) * JITTER) * pitch;
      const x = ca * lx - sa * ly;
      const y = sa * lx + ca * ly;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const xi = x | 0;
      const yi = y | 0;
      const i = (yi * W + xi) * 4;
      const matte = photo.data[i + 3] / 255;
      if (matte < 0.06) continue;
      const dPos = ink.data[i] / 255;
      const dNeg = ink.data[i + 1] / 255;
      const depth = ink.data[i + 2] / 255;
      const tTop = y / H;
      const wx = (x / W - 0.5) * aspect;
      const wy = 0.5 - tTop;
      pos.push(wx, wy, depth * RELIEF * REST_RELIEF);
      homes.push(wx, wy, depth, rand());
      data.push(tTop, matte, Math.sqrt(dPos), Math.sqrt(dNeg));
      col.push(photo.data[i] / 255, photo.data[i + 1] / 255, photo.data[i + 2] / 255);
      // Always loose: the soft edge of the matte and the foot of the bust
      // (the same weights the print shader uses to let go).
      edge.push(Math.max(1 - smoothstep(matte, 0.15, 0.7), smoothstep(tTop, 0.76, 0.9)));
      // Surface normal from the depth map's slope; the relief is shallow
      // relative to its width, so the slope is scaled up to read as form.
      const gx = (depthAt(xi + 3, yi) - depthAt(xi - 3, yi)) / 6;
      const gy = (depthAt(xi, yi + 3) - depthAt(xi, yi - 3)) / 6;
      const k = 38;
      const nx = -gx * k;
      const ny = gy * k;
      const len = Math.hypot(nx, ny, 1);
      nrm.push(nx / len, ny / len);
    }
  }
  const count = pos.length / 3;
  const size = Math.ceil(Math.sqrt(count));
  const home = new Float32Array(size * size * 4);
  home.set(homes);
  const meta = new Float32Array(size * size * 4);
  for (let i = 0; i < count; i++) meta[i * 4] = edge[i];
  const ref = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    ref[i * 2] = ((i % size) + 0.5) / size;
    ref[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('ref', new THREE.BufferAttribute(ref, 2));
  geo.setAttribute('aData', new THREE.Float32BufferAttribute(data, 4));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aNormal', new THREE.Float32BufferAttribute(nrm, 2));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  return { geo, home, meta, size, count, cellWorld: pitch / H };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class InkEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private speck: THREE.ShaderMaterial;
  private hand: Record<string, THREE.IUniform>;
  private textures: THREE.Texture[] = [];
  private cloud: Cloud | null = null;
  private gpu: GPUComputationRenderer | null = null;
  private posVar: Variable | null = null;
  private velVar: Variable | null = null;
  private ready = false;
  private disposed = false;

  private dpr = 1;
  private dist = 1;
  private target = new THREE.Vector3(0, -NUDGE, 0);
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hit = new THREE.Vector3();
  private view = new THREE.Vector3(0, 0, 1);

  // Pointer: the handler only records where; the frame reads the rects once
  // and does the conversion, so nothing on the event path touches layout.
  private pendingPointer = { x: 0, y: 0, dirty: false };
  private inside = false;
  private mouse = new THREE.Vector2(-99, -99);
  private mouseTarget = new THREE.Vector2(-99, -99);
  private mousePrev = new THREE.Vector2(-99, -99);
  private mouseVel = new THREE.Vector2();
  private tilt = new THREE.Vector2();
  private tiltTarget = new THREE.Vector2();
  private pointerTilt = new THREE.Vector2();
  private pointerTiltTarget = new THREE.Vector2();
  private pointerSeen = false;
  private reveal = 0;
  private progress = 0;

  private sectionTop = 0;
  private sectionHeight = 1;
  private scrollDirty = true;

  private time = 0;
  private lastNow = 0;
  private lastRender = 0;
  private raf = 0;
  private running = false;
  private near = false;

  reducedMotion = false;
  touch = false;

  /** A snapshot for review tooling. */
  get state() {
    return {
      ready: this.ready,
      running: this.running,
      near: this.near,
      touch: this.touch,
      reveal: this.reveal,
      progress: this.progress,
      mouse: [this.mouse.x, this.mouse.y],
      tilt: [this.tilt.x, this.tilt.y],
      points: this.cloud?.count ?? 0,
      sim: this.cloud?.size ?? 0,
    };
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private section: HTMLElement
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = true;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.dpr);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20);
    this.dist = 0.5 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) / ZOOM;

    // The hand and the theme, shared by the print, the specks and the
    // simulation.
    const hand = {
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uRevealR: { value: 0.3 },
      uEdgeNoise: { value: 0.12 },
      uMouse: { value: this.mouse },
    };
    const theme = {
      uInvert: { value: 0 },
      uInkColor: { value: hexColor('#0c1016') },
      uPaper: { value: hexColor('#eef2f4') },
    };
    const drawOpts = {
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
    };
    this.hand = { ...hand, uProgress: { value: 0 } };
    this.speck = new THREE.ShaderMaterial({
      vertexShader: speckVertexShader,
      fragmentShader: speckFragmentShader,
      uniforms: {
        ...theme,
        tPos: { value: null as THREE.Texture | null },
        tHome: { value: null as THREE.Texture | null },
        uProgress: { value: 0 },
        uCell: { value: 0.002 },
        uProj: { value: 1 },
        uView: { value: this.view },
      },
      ...drawOpts,
    });

    section.addEventListener('pointermove', this.onPointerMove, { passive: true });
    section.addEventListener('pointerenter', this.onPointerEnter, { passive: true });
    section.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    section.addEventListener('pointercancel', this.onPointerLeave, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }

  async load(src: string, inkSrc: string): Promise<void> {
    const [photo, inkMap] = await Promise.all([decode(src), decode(inkSrc)]);
    if (this.disposed) return;

    const pu = this.hand;

    // --- The specks ---------------------------------------------------------
    const cloud = buildCloud(photo, inkMap);
    this.cloud = cloud;
    const homeTex = floatTexture(cloud.home, cloud.size);
    const metaTex = floatTexture(cloud.meta, cloud.size);
    this.textures.push(homeTex, metaTex);

    // Float render targets where the platform allows, half floats otherwise
    // (a page's worth of positions at half precision is still a fraction of
    // a pixel).
    const gpu = new GPUComputationRenderer(cloud.size, cloud.size, this.renderer);
    const gl = this.renderer.getContext();
    if (!gl.getExtension('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType);
    const pos0 = gpu.createTexture();
    const vel0 = gpu.createTexture();
    const pd = pos0.image.data as unknown as Float32Array;
    for (let i = 0; i < cloud.size * cloud.size; i++) {
      pd[i * 4] = cloud.home[i * 4];
      pd[i * 4 + 1] = cloud.home[i * 4 + 1];
      pd[i * 4 + 2] = cloud.home[i * 4 + 2] * RELIEF * REST_RELIEF;
      pd[i * 4 + 3] = 0;
    }
    const posVar = gpu.addVariable('tPos', positionShader, pos0);
    const velVar = gpu.addVariable('tVel', velocityShader, vel0);
    gpu.setVariableDependencies(posVar, [posVar, velVar]);
    gpu.setVariableDependencies(velVar, [posVar, velVar]);
    Object.assign(posVar.material.uniforms, { uDt: { value: 0 } });
    Object.assign(velVar.material.uniforms, {
      tHome: { value: homeTex },
      tMeta: { value: metaTex },
      uDt: { value: 0 },
      // Shared with the print, so the same hand dissolves it and lifts them.
      uTime: pu.uTime,
      uReveal: pu.uReveal,
      uRevealR: pu.uRevealR,
      uEdgeNoise: pu.uEdgeNoise,
      uMouse: pu.uMouse,
      uMouseVel: { value: this.mouseVel },
      uRelief: { value: RELIEF },
      uRestRelief: { value: REST_RELIEF },
      uSpring: { value: SPRING },
      uDamp: { value: DAMP },
      uDrag: { value: DRAG },
      uTurb: { value: TURB },
    });
    const error = gpu.init();
    if (error) throw new Error(error);
    this.gpu = gpu;
    this.posVar = posVar;
    this.velVar = velVar;

    const specks = new THREE.Points(cloud.geo, this.speck);
    specks.frustumCulled = false;
    specks.renderOrder = 1;
    this.speck.uniforms.uCell.value = cloud.cellWorld;
    this.speck.uniforms.tHome.value = homeTex;

    this.scene.add(specks);
    this.ready = true;
    this.wake();
  }

  setTheme() {
    const { ink, paper } = readTheme();
    const u = this.speck.uniforms;
    u.uInkColor.value.copy(ink);
    u.uPaper.value.copy(paper);
    u.uInvert.value = luminance(paper) < luminance(ink) ? 1 : 0;
    this.wake();
  }

  resize(width: number, height: number) {
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Device px per world unit at unit distance: one unit fills the height.
    this.speck.uniforms.uProj.value =
      (height * this.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    // Radii are specified in CSS px; one world unit is the canvas height.
    this.hand.uRevealR.value = 320 / height;
    this.hand.uEdgeNoise.value = 100 / height;
    this.measure();
    this.wake();
  }

  /** Cache where the section sits in the document. */
  measure() {
    const rect = this.section.getBoundingClientRect();
    this.sectionTop = rect.top + window.scrollY;
    this.sectionHeight = Math.max(rect.height, 1);
    this.scrollDirty = true;
  }

  /** From the IntersectionObserver: within 20% of the viewport, or not. */
  setNear(near: boolean) {
    this.near = near;
    if (near) {
      this.measure();
      this.wake();
    } else {
      this.stop();
    }
  }

  // --- Events ---------------------------------------------------------------

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    this.pendingPointer.x = e.clientX;
    this.pendingPointer.y = e.clientY;
    this.pendingPointer.dirty = true;
    this.inside = true;
    this.pointerSeen = true;
    this.wake();
  };

  private onPointerEnter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    this.inside = true;
    this.wake();
  };

  private onPointerLeave = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    this.inside = false;
    this.wake();
  };

  private onScroll = () => {
    if (this.reducedMotion) return;
    this.scrollDirty = true;
    this.wake();
  };

  // --- Loop -----------------------------------------------------------------

  private allowed() {
    return this.ready && this.near && document.visibilityState === 'visible';
  }

  /** Start the loop if the section can be seen; a still frame under reduced
   *  motion. */
  wake() {
    if (!this.allowed()) return;
    if (this.reducedMotion) {
      this.stop();
      this.frame(performance.now());
      return;
    }
    if (this.running) return;
    this.running = true;
    this.lastNow = 0;
    this.lastRender = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick(now: number) {
    if (!this.allowed()) {
      this.stop();
      return;
    }
    // 60 fps while something is happening, 30 at rest.
    const active =
      this.pendingPointer.dirty ||
      this.scrollDirty ||
      this.reveal > REVEAL_EPS ||
      this.progress < 1;
    const interval = active ? 1000 / 60 : 1000 / 30;
    if (this.lastRender && now - this.lastRender < interval - 1.5) return;
    this.lastRender = now;
    this.frame(now);
  }

  private frame(now: number) {
    const dt = this.lastNow ? Math.min((now - this.lastNow) / 1000, 1 / 20) : 1 / 60;
    this.lastNow = now;
    this.time += dt;

    // --- Print-in: scroll-linked, held once it has arrived --------------------
    if (this.reducedMotion) {
      this.progress = 1;
    } else if (this.scrollDirty && this.progress < 1) {
      this.scrollDirty = false;
      const vh = window.innerHeight || 1;
      const x = clamp((window.scrollY + vh - this.sectionTop) / this.sectionHeight, 0, 1);
      const eased = 1 - Math.pow(1 - x, 3);
      if (eased > this.progress) this.progress = eased;
    } else {
      this.scrollDirty = false;
    }

    // --- Pointer: where the hand is on the page, and how the print turns -----
    let revealTarget = 0;
    if (this.reducedMotion) {
      this.reveal = 0;
      this.tiltTarget.set(0, 0);
      this.pointerTiltTarget.set(0, 0);
    } else if (this.touch) {
      // No hover: a soft lens drifts over the face, and the print turns
      // slowly on its own.
      const t = (this.time / TOUCH_PERIOD) * Math.PI * 2;
      this.mouseTarget.set(0.24 * Math.sin(t), 0.1 + 0.14 * Math.sin(2 * t + 1.2));
      this.pointerTiltTarget.set(0, 0);
      revealTarget = TOUCH_REVEAL;
    } else {
      if (this.pendingPointer.dirty) {
        this.pendingPointer.dirty = false;
        const rect = this.canvas.getBoundingClientRect();
        const srect = this.section.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this.ndc.set(
            ((this.pendingPointer.x - rect.left) / rect.width) * 2 - 1,
            -(((this.pendingPointer.y - rect.top) / rect.height) * 2 - 1)
          );
          this.raycaster.setFromCamera(this.ndc, this.camera);
          if (this.raycaster.ray.intersectPlane(this.plane, this.hit)) {
            this.mouseTarget.set(this.hit.x, this.hit.y);
          }
        }
        if (srect.width > 0 && srect.height > 0) {
          const sx = (this.pendingPointer.x - srect.left) / srect.width - 0.5;
          const sy = (this.pendingPointer.y - srect.top) / srect.height - 0.5;
          this.pointerTiltTarget.set(sx * TILT_X, -sy * TILT_Y);
        }
      }
      if (!this.inside) this.pointerTiltTarget.set(0, 0);
      revealTarget = this.inside ? 1 : 0;
    }

    if (!this.reducedMotion) {
      // First contact snaps: the sentinel is far off the page and a lerp from
      // there would sweep a wave across the print.
      if (this.mouse.x < -50 && this.mouseTarget.x > -50) {
        this.mouse.copy(this.mouseTarget);
        this.mousePrev.copy(this.mouseTarget);
      }
      this.mouse.lerp(this.mouseTarget, rateLerp(0.16, dt));
      // The hand's speed on the page, smoothed, for the drag.
      const vx = (this.mouse.x - this.mousePrev.x) / dt;
      const vy = (this.mouse.y - this.mousePrev.y) / dt;
      this.mousePrev.copy(this.mouse);
      const k = rateLerp(0.25, dt);
      this.mouseVel.x += (clamp(vx, -4, 4) - this.mouseVel.x) * k;
      this.mouseVel.y += (clamp(vy, -4, 4) - this.mouseVel.y) * k;
      this.reveal += (revealTarget - this.reveal) * rateLerp(0.08, dt);
      if (this.reveal < REVEAL_EPS && revealTarget === 0) this.reveal = 0;
      // The head turns slowly on its own; the pointer leans it further.
      this.pointerTilt.lerp(this.pointerTiltTarget, rateLerp(0.04, dt));
      this.tiltTarget.set(
        SWAY_X * Math.sin(this.time * 0.24) + this.pointerTilt.x,
        SWAY_Y * Math.sin(this.time * 0.19 + 1) + this.pointerTilt.y
      );
      this.tilt.lerp(this.tiltTarget, rateLerp(0.05, dt));
    } else {
      this.tilt.set(0, 0);
      this.mouseVel.set(0, 0);
    }

    // --- Camera: orbits the print by the tilt, always looking at it ----------
    const yaw = this.tilt.x;
    const pitch = this.tilt.y;
    this.view.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    this.camera.position.copy(this.view).multiplyScalar(this.dist).add(this.target);
    this.camera.lookAt(this.target);

    // --- Simulate, then draw --------------------------------------------------
    const gpu = this.gpu;
    const posVar = this.posVar;
    const velVar = this.velVar;
    if (!gpu || !posVar || !velVar) return;
    const pu = this.hand;
    pu.uTime.value = this.time;
    pu.uReveal.value = this.reveal;
    pu.uProgress.value = this.progress;
    this.speck.uniforms.uProgress.value = this.progress;
    if (!this.reducedMotion) {
      velVar.material.uniforms.uDt.value = dt;
      posVar.material.uniforms.uDt.value = dt;
      gpu.compute();
    }
    this.speck.uniforms.tPos.value = gpu.getCurrentRenderTarget(posVar).texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.section.removeEventListener('pointermove', this.onPointerMove);
    this.section.removeEventListener('pointerenter', this.onPointerEnter);
    this.section.removeEventListener('pointerleave', this.onPointerLeave);
    this.section.removeEventListener('pointercancel', this.onPointerLeave);
    window.removeEventListener('scroll', this.onScroll);
    this.gpu?.dispose();
    for (const t of this.textures) t.dispose();
    this.cloud?.geo.dispose();
    this.speck.dispose();
    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

type Props = {
  /** Hashed URL of the portrait with its matte in alpha, from astro:assets. */
  src: string;
  /** Hashed URL of the ink map (see scripts/founder-print.mjs). */
  inkSrc: string;
  width: number;
  height: number;
  alt: string;
};

export default function FounderInk({ src, inkSrc, width, height, alt }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!wrap || !canvas || !img) return;
    const section = wrap.closest<HTMLElement>('.founder') ?? wrap;

    // Exactly one of the two is the image as far as assistive tech is
    // concerned: the live canvas, or the photograph when there is no WebGL.
    const fallback = () => {
      wrap.classList.add('is-fallback');
      canvas.setAttribute('aria-hidden', 'true');
      img.removeAttribute('aria-hidden');
    };

    let engine: InkEngine;
    try {
      engine = new InkEngine(canvas, section);
    } catch {
      fallback(); // No WebGL: the plain photograph, in grayscale.
      return;
    }
    img.setAttribute('aria-hidden', 'true');
    if (import.meta.env.DEV) {
      // For review tooling: read the engine's state from the console.
      (window as unknown as { __founderInk?: InkEngine }).__founderInk = engine;
    }

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hover = window.matchMedia('(hover: none)');
    engine.reducedMotion = motion.matches;
    engine.touch = hover.matches;
    engine.setTheme();
    engine.load(src, inkSrc).catch(fallback);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === wrap) {
          const { width: w, height: h } = entry.contentRect;
          engine.resize(w, h);
        } else {
          engine.measure();
        }
      }
    });
    ro.observe(wrap);
    ro.observe(section);
    engine.resize(wrap.clientWidth, wrap.clientHeight);

    // Run only while the section is within 20% of the viewport.
    const io = new IntersectionObserver(([entry]) => engine.setNear(entry.isIntersecting), {
      rootMargin: '20%',
    });
    io.observe(section);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') engine.wake();
      else engine.stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Follow the theme toggle: only the class on <html> matters, and only
    // when it actually flips light/dark.
    let dark = document.documentElement.classList.contains('dark');
    const observer = new MutationObserver(() => {
      const next = document.documentElement.classList.contains('dark');
      if (next === dark) return;
      dark = next;
      engine.setTheme();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const onMotion = () => {
      engine.reducedMotion = motion.matches;
      engine.stop();
      engine.wake();
    };
    const onHover = () => {
      engine.touch = hover.matches;
      engine.wake();
    };
    motion.addEventListener('change', onMotion);
    hover.addEventListener('change', onHover);

    return () => {
      img.removeAttribute('aria-hidden');
      motion.removeEventListener('change', onMotion);
      hover.removeEventListener('change', onHover);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      io.disconnect();
      ro.disconnect();
      engine.dispose();
    };
  }, [src, inkSrc, width, height]);

  return (
    <div ref={wrapRef} className="founder-ink">
      <canvas ref={canvasRef} className="founder-ink__canvas" role="img" aria-label={alt} />
      {/* The photograph itself: read by assistive tech, and the visible
          fallback without JavaScript or without WebGL. */}
      <img
        ref={imgRef}
        className="founder-ink__img"
        src={src}
        width={width}
        height={height}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
