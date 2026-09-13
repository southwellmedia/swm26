/**
 * Reel morph — the droplet that follows the scroll.
 *
 * One WebGL quad on a canvas fixed to the viewport, drawn only while there is
 * something to draw. It carries one thing through five acts, all driven by
 * scroll so every one of them plays backwards too:
 *
 *   drop      the hero rolls its stray chrome droplet off the front of the
 *             floor and out of the bottom of its panel (HeroScene.tsx does
 *             the move; it publishes the droplet's screen position as
 *             window.__heroDroplet and reads window.__heroDropletRelease).
 *             Ours takes over beneath the panel's fade, already falling,
 *             lands on the headline with one squash-and-stretch bounce and
 *             rides on it for a beat.
 *   travel    freed, it floats down with you, damped behind the scroll,
 *             swaying, growing as it comes closer, into the thumbnail slot
 *             of the reel's intro copy.
 *   bloom     as the reel pins, the sphere spreads into the rounded frame —
 *             the circle's SDF blends into the box's — while the frame peels
 *             out of its slot per vertex, tilts, and opens to the full
 *             width. Inside, the chrome dissolves into the playable droplet
 *             scene (droplet-scene.ts), rendered to a texture the frame
 *             samples. The copy on the frame follows the scene's clarity;
 *             the disciplines and the call to action sit with it.
 *   close     late in the hold the frame folds back into a ball at its
 *             centre, and the ball drops out of it as the stage releases.
 *   deliver   it falls through the gap, bounces on the "Work" heading, rolls
 *             into the lead card's slot and blooms into the card itself —
 *             the card's own rest picture as its surface — at which point
 *             the real card takes over and the canvas lets go. The ball is
 *             used up where the work begins.
 *
 * Everything is measured in viewport pixels each frame, so a fixed canvas can
 * draw over the hero, the gaps and the sticky stage alike. Page-anchored
 * points (the headline, the heading, the card) are handled in document
 * space and converted, so a ball resting on the headline rides with it. The
 * reel's slots are still resolved with offsetTop/offsetLeft inside the
 * stage, which ignores the copy block's own translate.
 *
 *   - Progress is damped, so the frame trails the scroll by ~100ms: that lag
 *     is the "follows you" feeling, not a bug.
 *   - The scene only renders while it can be seen inside the frame, and at
 *     half rate once the held reel is idle.
 *   - Pixel ratio capped at 2 for the frame, 1.5 for the scene.
 *
 * The caller decides whether to run it at all (reduced motion, no WebGL).
 */
import {
  Color,
  Mesh,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import { DropletScene, STUDIO_GLSL, type ScenePalette } from './droplet-scene';

declare global {
  interface Window {
    /** Written by the hero each rendered frame: its stray droplet, in
     *  viewport px, and when. */
    __heroDroplet?: { x: number; y: number; r: number; at: number };
    /** Written here, read by the hero: 0 = keep the droplet, 1 = it's gone. */
    __heroDropletRelease?: number;
  }
}

export interface ReelMorphOptions {
  canvas: HTMLCanvasElement;
  /** The section, for state attributes the stylesheet reads. */
  root: HTMLElement;
  /** The sticky, 100vh stage the slots are laid out in. */
  stage: HTMLElement;
  /** The tall wrapper that gives the stage its scroll distance. */
  runway: HTMLElement;
  /** Where the droplet lands and the frame starts — an empty box in the copy. */
  thumb: HTMLElement;
  /** Where the frame ends — an empty box in the middle of the stage. */
  full: HTMLElement;
  /** The block that should scroll away 1:1 while the stage is pinned. */
  copy?: HTMLElement;
  /** The hero's picture panel: the droplet emerges beneath its lower edge. */
  heroPanel?: HTMLElement | null;
  /** The hero's foot block: the droplet lands on top of it. */
  heroFloor?: HTMLElement | null;
  /** Element to read the --hero-* palette hooks from. */
  paletteScope?: HTMLElement | null;
  /** The fixed layer holding the copy and call to action on the open frame. */
  overlay?: HTMLElement | null;
  /** The "Work" heading the ball bounces on, and the card it becomes. */
  workHead?: HTMLElement | null;
  leadCard?: HTMLElement | null;
  /** Corner radius in CSS px. */
  radius?: number;
  /** Normalised scroll velocity, -1…1. Defaults to a scroll delta. */
  velocity?: () => number;
}

export interface ReelMorph {
  start(): void;
  stop(): void;
  destroy(): void;
  /** Current damped progress of the bloom/peel, 0…1. */
  readonly progress: number;
  /** Where the droplet is in its journey: 0 in the hero … 1 landed. */
  readonly travel: number;
}

// --- The timeline, in viewport heights of scroll --------------------------------
/** The hero rolls the droplet out over this stretch. */
const EXIT_START = 0.05;
const EXIT_END = 0.22;
/** It has fallen and bounced onto the headline by here … */
const FALL_END = 0.36;
/** … and rides on it until here, then floats off toward the reel. */
const REST_END = 0.46;
// --- The pinned hold, as fractions of the hold distance -----------------------
/** The frame is fully open at this point of the hold. */
const OPEN_SPAN = 0.5;
/** It folds back into a ball over this stretch … */
const CLOSE_START = 0.7;
const CLOSE_END = 0.88;
/** … and drops out from here. */
const DROP_START = 0.9;
/** Delivery ends when the lead card's centre reaches this viewport height. */
const DELIVER_AT = 0.45;

/** Landing radius in the slot, as a fraction of the slot's height. */
const LAND_RADIUS = 0.2;
/** The closed ball, as a fraction of the frame's height. */
const CLOSE_RADIUS = 0.11;
/** The ball just before it becomes the card, as a fraction of the card's height. */
const CARD_RADIUS = 0.2;
/** Scene render target size relative to the full frame, and its DPR cap. */
const SCENE_SCALE = 0.8;
const SCENE_DPR = 1.5;

const VERT = /* glsl */ `
uniform vec4 uStart;   // x, y, w, h in viewport px, y down
uniform vec4 uEnd;
uniform float uProgress;
uniform float uVelocity;
uniform float uBend;   // px of bend at full velocity

varying vec2 vUv;

const float SPREAD = 0.38;   // how far apart the corners' timings are
const float TILT   = 0.055;  // radians, peak mid-travel

vec2 rectPoint(vec4 r, vec2 uv) {
  // PlaneGeometry uv: (0,0) bottom-left, (1,1) top-right. Viewport px is y-down.
  return vec2(r.x + r.z * uv.x, r.y + r.w * (1.0 - uv.y));
}

vec2 rotateAbout(vec2 p, vec2 c, float a) {
  float s = sin(a), k = cos(a);
  p -= c;
  return vec2(p.x * k - p.y * s, p.x * s + p.y * k) + c;
}

void main() {
  // Per-vertex delay by distance from the top-right corner, weighted toward
  // x so the right EDGE leads as a rounded front rather than the corner
  // alone spiking out. Bottom-left (0,0) trails at delay 1.
  float dx = 1.0 - uv.x;
  float dy = 1.0 - uv.y;
  float delay = sqrt(dx * dx * 0.65 + dy * dy * 0.35);
  float t0 = delay * SPREAD;
  float local = smoothstep(t0, t0 + (1.0 - SPREAD), uProgress);

  vec2 p = mix(rectPoint(uStart, uv), rectPoint(uEnd, uv), local);

  // Swing: rotate about the interpolated centre, peaking mid-travel.
  vec2 c0 = uStart.xy + uStart.zw * 0.5;
  vec2 c1 = uEnd.xy + uEnd.zw * 0.5;
  vec2 c = mix(c0, c1, uProgress);
  p = rotateAbout(p, c, -sin(local * 3.14159265) * TILT);

  // Scroll bend: the centre of the sheet leads, the sides trail. On the
  // droplet this reads as a liquid stretch.
  float across = uv.x * 2.0 - 1.0;
  p.y -= uVelocity * (1.0 - across * across) * uBend;

  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, -p.y, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uMap;
uniform float uTexAspect;
uniform vec4 uStart;
uniform vec4 uEnd;
uniform float uProgress;
uniform float uRadius;
uniform float uShape;    // 0 droplet … 1 rounded frame
uniform float uMix;      // 0 chrome … 1 the picture
uniform float uFloat;    // shadow under the floating droplet
uniform float uOpacity;
uniform float uSquash;   // vertical scale of the droplet, 1 = round
uniform vec3 uDrop;      // droplet centre (viewport px) and radius
uniform float uCard;     // 1 = the picture is a work card at rest
uniform vec3 uCardRest;  // grayscale, contrast, opacity of that rest look
uniform vec3 uCardBg;    // the card's own backdrop, sRGB
uniform vec3 uInk, uMid, uSilver, uBg, uBg2, uWarm, uCool;

varying vec2 vUv;

${STUDIO_GLSL}

float roundedBox(vec2 q, vec2 b, float r) {
  vec2 d = abs(q) - b + vec2(r);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// A chrome droplet, lit by the studio, seen head on. Beyond its radius the
// normal flattens out, so as the shape blooms into the frame the surface
// becomes a still slab of the same metal for the picture to rise through.
vec3 chrome(vec2 dq, float r) {
  float rr = length(dq) / r;
  float z = sqrt(max(0.0, 1.0 - rr * rr));
  vec3 n = normalize(mix(vec3(dq / r, z), vec3(0.0, 0.0, 1.0), smoothstep(0.82, 1.0, rr)));
  vec3 rd = vec3(0.0, 0.0, -1.0);
  vec3 v = -rd;
  vec3 refl = reflect(rd, n);
  vec3 L = normalize(KEY);
  float ndl = max(dot(n, L), 0.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 albedo = dropletColor(0.95);
  // The underside picks up the bright floor it floats over.
  float bounce = smoothstep(0.2, -1.0, n.y);
  vec3 diffuse = albedo * ((0.22 + 0.62 * ndl) + bounce * 0.3 * uBg);
  vec3 spec = env(refl) * mix(0.05, 1.0, fres);
  vec3 h = normalize(L + v);
  spec += pow(max(dot(n, h), 0.0), 160.0) * 0.7;
  return finish(diffuse + spec);
}

// The work card's rest treatment, as the stylesheet applies it: grayscale,
// contrast, then the picture at partial opacity over the card's backdrop.
vec3 cardRest(vec3 c) {
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(luma), uCardRest.x);
  c = (c - 0.5) * uCardRest.y + 0.5;
  return mix(uCardBg, clamp(c, 0.0, 1.0), uCardRest.z);
}

void main() {
  vec2 size = mix(uStart.zw, uEnd.zw, uProgress);
  vec2 centre = mix(uStart.xy + uStart.zw * 0.5, uEnd.xy + uEnd.zw * 0.5, uProgress);
  vec2 q = (vUv - 0.5) * size;                       // local px, y up
  vec2 dc = vec2(uDrop.x - centre.x, centre.y - uDrop.y);
  float r = max(uDrop.z, 1.0);
  // Squash: shorter and wider, the same area, about its own centre.
  vec2 squash = vec2(sqrt(uSquash), 1.0 / uSquash);
  vec2 dq = (q - dc) * squash;

  // Shape: a rounded box that starts as the droplet itself — half-size r,
  // corner radius r, centred on it — and inflates into the frame: ball, then
  // pill, then the frame. Its centre slides to the frame's as it grows.
  vec2 bc = dc * (1.0 - uShape);
  vec2 bh = mix(vec2(r), size * 0.5, uShape);
  float br = mix(r, uRadius, uShape);
  vec2 qq = (q - bc) * mix(squash, vec2(1.0), uShape);
  float sd = roundedBox(qq, bh, br);
  float alpha = 1.0 - smoothstep(-0.75, 0.75, sd);

  // Surface: chrome, then the picture (object-fit: cover).
  float aspect = size.x / size.y;
  vec2 s = aspect > uTexAspect ? vec2(1.0, uTexAspect / aspect) : vec2(aspect / uTexAspect, 1.0);
  vec2 tuv = (vUv - 0.5) * s + 0.5;
  vec3 col = chrome(dq, r);
  if (uMix > 0.001) {
    vec3 pic = texture2D(uMap, tuv).rgb;
    if (uCard > 0.5) pic = cardRest(pic);
    col = mix(col, pic, uMix);
  }

  // Soft shadow on the page under the floating droplet.
  vec2 sq = (dq + vec2(0.0, r * 0.6)) / vec2(r * 1.3, r * 0.5);
  float shadow = (1.0 - smoothstep(0.3, 1.6, length(sq))) * 0.26 * uFloat * (1.0 - uShape);

  float a = (alpha + shadow * (1.0 - alpha)) * uOpacity;
  gl_FragColor = vec4(col * alpha * uOpacity, a);
}
`;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));
/** A fall that lands at 0.62, bounces a fifth of the way back up, and rests. */
const bounce = (t: number) =>
  t < 0.62 ? (t / 0.62) * (t / 0.62) : 1 - 0.2 * Math.sin((Math.PI * (t - 0.62)) / 0.38);
/** How hard the ball is hitting the surface at t — both landings. */
const impact = (t: number) =>
  Math.exp(-(((t - 0.62) / 0.05) ** 2)) + 0.5 * Math.exp(-(((t - 0.96) / 0.03) ** 2));

/** Box of `el` in `stage` space, ignoring transforms on anything between. */
function offsetRect(el: HTMLElement, stage: HTMLElement, out: Vector4) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stage) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  out.set(x, y, el.offsetWidth, el.offsetHeight);
}

/** Resolve a CSS colour expression to a linear Color, the way the hero does. */
function makeColorReader(scope: HTMLElement) {
  const probe = document.createElement('span');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return (expr: string, fallback: string, linear = true) => {
    try {
      if (!ctx) throw new Error('no 2d context');
      probe.style.color = expr;
      scope.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      ctx.fillStyle = computed;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const c = new Color(r / 255, g / 255, b / 255);
      return linear ? c.convertSRGBToLinear() : c;
    } catch {
      probe.remove();
      const c = new Color(fallback);
      return linear ? c.convertSRGBToLinear() : c;
    }
  };
}

function readPalette(read: ReturnType<typeof makeColorReader>): ScenePalette {
  return {
    ink: read('var(--hero-ink, var(--color-foreground))', '#0c1016'),
    mid: read('var(--hero-mid, var(--gray-500))', '#7a7f86'),
    silver: read('var(--hero-chrome, var(--gray-200))', '#e2e5e8'),
    bg: read('var(--color-background-secondary)', '#e6ebef'),
    bg2: read('var(--color-background-tertiary)', '#d9dfe4'),
    warm: read('var(--hero-warm, #ffffff)', '#ffffff'),
    cool: read('var(--hero-cool, #f4f7fa)', '#f4f7fa'),
  };
}

export function createReelMorph(options: ReelMorphOptions): ReelMorph {
  const {
    canvas,
    root,
    stage,
    runway,
    thumb,
    full,
    copy,
    heroPanel,
    heroFloor,
    paletteScope,
    overlay,
    workHead,
    leadCard,
    radius = 16,
  } = options;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  // 1.5, not 2: this canvas covers the whole viewport and is composited
  // every frame the journey is live, and the ball and frame edges are
  // anti-aliased in the shader, so a retina screen loses almost nothing
  // while the layer loses nearly half its pixels.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.autoClear = true;

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, -10, 10);
  camera.position.set(0, 0, 1);
  camera.lookAt(new Vector3(0, 0, 0));

  const droplets = new DropletScene();

  const colors = {
    uInk: { value: new Color() },
    uMid: { value: new Color() },
    uSilver: { value: new Color() },
    uBg: { value: new Color() },
    uBg2: { value: new Color() },
    uWarm: { value: new Color() },
    uCool: { value: new Color() },
  };
  const readColor = makeColorReader(paletteScope ?? document.body);
  const applyPalette = () => {
    const p = readPalette(readColor);
    droplets.setPalette(p);
    colors.uInk.value.copy(p.ink);
    colors.uMid.value.copy(p.mid);
    colors.uSilver.value.copy(p.silver);
    colors.uBg.value.copy(p.bg);
    colors.uBg2.value.copy(p.bg2);
    colors.uWarm.value.copy(p.warm);
    colors.uCool.value.copy(p.cool);
  };
  applyPalette();

  const uniforms = {
    ...colors,
    uMap: { value: droplets.target.texture as Texture },
    uTexAspect: { value: 16 / 9 },
    uStart: { value: new Vector4() },
    uEnd: { value: new Vector4() },
    uProgress: { value: 0 },
    uVelocity: { value: 0 },
    uBend: { value: 26 },
    uRadius: { value: radius },
    uShape: { value: 0 },
    uMix: { value: 0 },
    uFloat: { value: 0 },
    uOpacity: { value: 0 },
    uSquash: { value: 1 },
    uDrop: { value: new Vector3() },
    uCard: { value: 0 },
    uCardRest: { value: new Vector3(1, 1, 1) },
    uCardBg: { value: new Color(0.9, 0.9, 0.9) },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });

  // 48×48 is plenty for a smooth peel; the vertex shader is trivial.
  const mesh = new Mesh(new PlaneGeometry(1, 1, 48, 48), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // --- The card the ball becomes ----------------------------------------------
  // Its rest picture, as a texture, with the stylesheet's rest treatment
  // read off the element so the shader can draw exactly what the card will
  // show the moment it takes over.
  let cardTexture: Texture | null = null;
  let cardAspect = 16 / 9;
  const cardImg = leadCard?.querySelector<HTMLImageElement>('.card__img--rest') ?? null;
  const prepareCard = async () => {
    if (!leadCard || !cardImg) return;
    try {
      await cardImg.decode();
    } catch {
      return;
    }
    if (!cardImg.naturalWidth) return;
    // A bitmap, not the element: three sizes an <img> texture by its layout
    // box and then uploads the intrinsic pixels, which overflows it. The
    // bitmap is also immune to a later srcset swap.
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(cardImg, {
        imageOrientation: 'flipY',
        premultiplyAlpha: 'none',
        colorSpaceConversion: 'none',
      });
    } catch {
      return;
    }
    const tex = new Texture(bitmap);
    tex.colorSpace = NoColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;
    cardTexture = tex;
    cardAspect = cardImg.naturalWidth / cardImg.naturalHeight;
    const cs = getComputedStyle(cardImg);
    const num = (name: string, fallback: number) => {
      const m = cs.filter.match(new RegExp(name + '\\(([\\d.]+)\\)'));
      return m ? parseFloat(m[1]) : fallback;
    };
    uniforms.uCardRest.value.set(
      num('grayscale', 1),
      num('contrast', 1),
      parseFloat(cs.opacity) || 1
    );
    uniforms.uCardBg.value.copy(
      readColor(getComputedStyle(leadCard).backgroundColor, '#e6ebef', false)
    );
  };
  void prepareCard();

  // --- layout ------------------------------------------------------------------
  let width = 0;
  let height = 0;
  let holdDistance = 1; // px the stage stays pinned for
  let copyExit = 0; // px the copy travels before it is fully off the stage
  const thumbOff = new Vector4();
  const fullOff = new Vector4();
  const thumbV = new Vector4();
  const fullV = new Vector4();
  const leadV = new Vector4();

  const measure = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.left = 0;
    camera.right = width;
    camera.top = 0;
    camera.bottom = -height;
    camera.updateProjectionMatrix();

    offsetRect(thumb, stage, thumbOff);
    offsetRect(full, stage, fullOff);
    holdDistance = Math.max(1, runway.offsetHeight - stage.offsetHeight);
    copyExit = copy ? copy.offsetTop + copy.offsetHeight : 0;

    const dpr = Math.min(window.devicePixelRatio || 1, SCENE_DPR) * SCENE_SCALE;
    const sw = Math.min(1600, Math.round(fullOff.z * dpr));
    const sh = Math.round(sw * (fullOff.w / Math.max(1, fullOff.z)));
    droplets.setSize(sw, sh);

    // The overlay sits on the frame's rectangle while the stage is pinned,
    // which is the only time it shows.
    if (overlay) {
      const left = stage.getBoundingClientRect().left + fullOff.x;
      overlay.style.left = `${left}px`;
      overlay.style.top = `${fullOff.y}px`;
      overlay.style.width = `${fullOff.z}px`;
      overlay.style.height = `${fullOff.w}px`;
    }
  };

  // --- state -------------------------------------------------------------------
  let raf = 0;
  let running = false;
  let active = false; // the journey's stretch of page is near the viewport
  let cleared = false;
  let progress = 0;
  let travel = 0;
  let time = 0;
  let lastTop = Number.NaN;
  let lastTime = 0;
  let exitX = Number.NaN; // where the hero's droplet left, viewport px …
  let exitY = 0;
  let exitR = 24; // … and how big it was
  const heroPos = new Vector3();
  const pos = new Vector2();
  let rad = 0;
  let squash = 1;
  let placed = false;
  let delivered = false;
  let overlayOpen = false;
  let clearState = false;
  const pointer = { x: 0, y: 0, dirty: false, inside: false, down: false };
  let pointerLast = -Infinity;
  let frameIndex = 0;
  let asleep = false;
  // The display's own frame interval: the shortest gap the loop has seen.
  // The scene's governor judges lateness against this, not a fixed 60 Hz,
  // so a 30 Hz screen or a throttled tab is not mistaken for a slow GPU.
  let refresh = Infinity;
  let lastScrollY = Number.NaN;

  const scrollVelocity = () => {
    const top = runway.getBoundingClientRect().top;
    const v = Number.isNaN(lastTop) ? 0 : lastTop - top; // px per frame, down = +
    lastTop = top;
    return clamp(v / 42, -1, 1);
  };
  const velocityOf = options.velocity ?? scrollVelocity;

  /** The hero's droplet right now, or a stand-in on its panel. */
  const readHero = (now: number, panel: DOMRect | null) => {
    const h = window.__heroDroplet;
    if (h && now - h.at < 400 && h.r > 0) {
      heroPos.set(h.x, h.y, h.r);
      return;
    }
    if (panel && panel.width > 0) {
      heroPos.set(panel.left + panel.width * 0.42, panel.bottom - 20, panel.height * 0.05);
    } else {
      heroPos.set(width * 0.4, height * 0.5, 18);
    }
  };

  const setDelivered = (next: boolean) => {
    if (next === delivered || !leadCard) return;
    delivered = next;
    leadCard.classList.toggle('is-in', next);
  };
  const setOpen = (next: boolean) => {
    if (next === overlayOpen) return;
    overlayOpen = next;
    if (next) root.dataset.reelOpen = '';
    else delete root.dataset.reelOpen;
  };
  const setClear = (next: boolean) => {
    if (next === clearState) return;
    clearState = next;
    if (next) root.dataset.reelClear = '';
    else delete root.dataset.reelClear;
  };

  const frame = (now: number) => {
    raf = 0;
    if (!running) return;

    const dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;
    time += dt;
    if (dt > 0.003) refresh = Math.min(refresh, dt * 1000);

    const stageRect = stage.getBoundingClientRect();
    const runwayRect = runway.getBoundingClientRect();
    thumbV.set(stageRect.left + thumbOff.x, stageRect.top + thumbOff.y, thumbOff.z, thumbOff.w);
    fullV.set(stageRect.left + fullOff.x, stageRect.top + fullOff.y, fullOff.z, fullOff.w);

    const sY = window.scrollY;
    // Stillness comes from the scroll position itself, not from Lenis's
    // velocity, which can hold a stale value after a programmatic jump.
    const moved = Number.isNaN(lastScrollY) || Math.abs(sY - lastScrollY) >= 0.5;
    lastScrollY = sY;
    const vh = height || 1;
    const s = sY / vh;
    const pinScroll = runwayRect.top + sY;
    const dropScroll = pinScroll + holdDistance * DROP_START;

    // The copy leaves at native speed, then parks off the top of the stage.
    const scrolled = clamp(-runwayRect.top, 0, holdDistance);
    if (copy) {
      copy.style.transform = `translate3d(0, ${-Math.min(scrolled, copyExit).toFixed(1)}px, 0)`;
    }

    // --- Act 1: the hero drops it ----------------------------------------------
    const release = smoothstep(EXIT_START, EXIT_END, s);
    window.__heroDropletRelease = release;
    const panel = heroPanel?.getBoundingClientRect() ?? null;
    readHero(now, panel);
    const panelBottom = panel ? panel.bottom : -1e5;
    if (s < EXIT_END) {
      // Document space, so the fall can start from here at any later scroll.
      exitX = heroPos.x;
      exitY = heroPos.y + sY;
      exitR = Math.max(6, heroPos.z);
    } else if (Number.isNaN(exitX)) {
      exitX = panel ? panel.left + panel.width * 0.42 : width * 0.4;
      exitY = panelBottom + sY + exitR;
    }
    // The surface the ball lands on, in document space: the top of the hero's
    // foot block. The headline overlaps the panel's edge, so it is no floor.
    const floor = heroFloor?.getBoundingClientRect() ?? null;
    const restSurfaceDoc = floor ? floor.top + sY - 4 : panelBottom + sY + 0.3 * vh;

    // Where in the hold, and after it.
    const f = scrolled / holdDistance;
    const openT = clamp(f / OPEN_SPAN, 0, 1);
    const close = smoothstep(CLOSE_START, CLOSE_END, f);
    const inHold = sY >= pinScroll && sY < dropScroll;

    if (!active) {
      // Off the journey's stretch: snap and sleep. The observer wakes us.
      progress = openT;
      uniforms.uVelocity.value = 0;
      lastTop = Number.NaN;
      setDelivered(Boolean(leadCard) && sY >= dropScroll);
      setOpen(false);
      return;
    }
    progress = damp(progress, openT, 9, dt);
    // A damped value only approaches its target; snap the last hair so
    // "fully open" is a state the rest of the frame can test for.
    if (Math.abs(progress - openT) < 1e-3) progress = openT;

    // --- Where the ball wants to be ---------------------------------------------
    let tx = heroPos.x;
    let ty = heroPos.y;
    let tr = exitR;
    let squashT = 1;
    let opacity = 0;
    let float = 0;
    let direct = false; // follow exactly, no damping
    let shape = 0;
    let mixAmt = 0;
    let card = false;
    let geometry: 'ball' | 'frame' | 'card' = 'ball';
    let visible = true;

    const thumbCx = thumbV.x + thumbV.z / 2;
    const thumbCy = thumbV.y + thumbV.w / 2;
    const landR = thumbV.w * LAND_RADIUS;
    const fullCx = fullV.x + fullV.z / 2;
    const fullCy = fullV.y + fullV.w / 2;
    const closeR = fullV.w * CLOSE_RADIUS;

    if (sY < pinScroll) {
      // Acts 1 and 2.
      setDelivered(false);
      if (s < EXIT_END) {
        // Tracking the hero's droplet; visible only once it is in the fade
        // band at the panel's lower edge.
        direct = true;
        opacity = smoothstep(panelBottom - 90, panelBottom - 20, heroPos.y);
        float = opacity;
      } else {
        opacity = 1;
        float = 1;
        const fallT = clamp((s - EXIT_END) / (FALL_END - EXIT_END), 0, 1);
        const exitBottomDoc = exitY + exitR;
        const bottomDoc = lerp(exitBottomDoc, restSurfaceDoc, bounce(fallT));
        squashT = 1 - 0.28 * impact(fallT);
        tx = exitX;
        ty = bottomDoc - sY - exitR * squashT;
        tr = exitR;

        const pT =
          pinScroll - REST_END * vh > 40
            ? smoothstep(REST_END * vh, pinScroll, sY)
            : sY >= pinScroll
              ? 1
              : 0;
        travel = pT;
        if (pT > 0) {
          const sway = pT * (1 - pT);
          tx = lerp(exitX, thumbCx, pT) + Math.sin(time * 1.3) * 14 * sway;
          ty = lerp(restSurfaceDoc - sY - exitR, thumbCy, pT) + Math.sin(time * 1.9) * 10 * sway;
          tr = lerp(exitR, landR, pT);
        }
      }
      visible = opacity > 0 && ty - tr * 2 < vh + 40 && ty + tr * 2 > -40;
    } else if (inHold) {
      // Act 3, and the close.
      setDelivered(false);
      travel = 1;
      opacity = 1;
      geometry = 'frame';
      const toCentre = smoothstep(0.55, CLOSE_START, f);
      tx = lerp(thumbCx, fullCx, toCentre);
      ty = lerp(thumbCy, fullCy, toCentre);
      tr = lerp(landR, closeR, toCentre);
      shape = smoothstep(0, 0.3, progress) * (1 - close);
      mixAmt = smoothstep(0.08, 0.5, progress) * (1 - close);
      float = 1 - shape;
    } else if (leadCard) {
      // Acts 4 and 5.
      travel = 1;
      const lead = leadCard.getBoundingClientRect();
      leadV.set(lead.left, lead.top, lead.width, lead.height);
      const leadCx = lead.left + lead.width / 2;
      const leadCyDoc = lead.top + sY + lead.height / 2;
      const deliverScroll = leadCyDoc - DELIVER_AT * vh;
      const d =
        deliverScroll - dropScroll > 40
          ? clamp((sY - dropScroll) / (deliverScroll - dropScroll), 0, 1)
          : 1;
      const head = workHead?.getBoundingClientRect() ?? null;
      const headDoc = head ? head.bottom + sY : lead.top + sY - 40;
      // The ball's document position as it lets go: the frame's centre while
      // the stage was still pinned, not wherever the stage has scrolled to.
      const y0Doc = dropScroll + fullOff.y + fullOff.w / 2;
      const cardR = lead.height * CARD_RADIUS;

      opacity = 1;
      float = 1;
      if (d < 0.7) {
        const a = d / 0.7;
        const bottomDoc = lerp(y0Doc + closeR, headDoc, bounce(a));
        squashT = 1 - 0.28 * impact(a);
        tr = closeR;
        tx = lerp(fullCx, lerp(fullCx, leadCx, 0.35), a);
        ty = bottomDoc - sY - tr * squashT;
      } else if (d < 0.85) {
        const b = smoothstep(0, 1, (d - 0.7) / 0.15);
        tr = lerp(closeR, cardR, b);
        tx = lerp(lerp(fullCx, leadCx, 0.35), leadCx, b);
        ty = lerp(headDoc - closeR, leadCyDoc, b) - sY;
      } else {
        const c = (d - 0.85) / 0.15;
        geometry = 'card';
        card = true;
        tr = cardR;
        tx = leadCx;
        ty = leadCyDoc - sY;
        shape = smoothstep(0, 1, c);
        mixAmt = cardTexture ? smoothstep(0.3, 0.9, c) : 0;
        opacity = 1 - smoothstep(0.96, 1, d);
        float = 1 - shape;
      }
      setDelivered(d >= 0.96);
      visible = opacity > 0 && ty - tr * 2 < vh + 40 && ty + tr * 2 > -40;
    } else {
      // No card to become: the closed ball just leaves with the stage.
      travel = 1;
      opacity = 1;
      float = 1;
      tx = fullCx;
      ty = fullCy;
      tr = closeR;
      visible = ty + tr * 2 > -40 && ty - tr * 2 < vh + 40;
    }

    // --- Follow ------------------------------------------------------------------
    if (!placed || direct) {
      pos.set(tx, ty);
      rad = tr;
      squash = squashT;
      placed = true;
    } else {
      pos.x = damp(pos.x, tx, 9, dt);
      pos.y = damp(pos.y, ty, 9, dt);
      rad = damp(rad, tr, 9, dt);
      squash = damp(squash, squashT, 14, dt);
    }

    // --- Draw ----------------------------------------------------------------------
    if (!visible) {
      if (!cleared) {
        renderer.clear();
        cleared = true;
      }
      setOpen(false);
      raf = requestAnimationFrame(frame);
      return;
    }
    cleared = false;

    const u = uniforms;
    if (geometry === 'frame') {
      u.uStart.value.copy(thumbV);
      u.uEnd.value.copy(fullV);
      u.uProgress.value = progress;
      u.uBend.value = 26;
    } else if (geometry === 'card') {
      u.uStart.value.copy(leadV);
      u.uEnd.value.copy(leadV);
      u.uProgress.value = 0;
      u.uBend.value = 0;
    } else {
      // A square around the ball, with room for its shadow (which reaches
      // about 2.1 radii to each side once the squash widens it) and for the
      // squash itself. Too tight and the shadow shows a straight edge.
      const side = rad * 5.4;
      u.uStart.value.set(pos.x - side / 2, pos.y - side / 2 + rad * 0.5, side, side);
      u.uEnd.value.copy(u.uStart.value);
      u.uProgress.value = 0;
      u.uBend.value = 10;
    }
    u.uShape.value = shape;
    u.uMix.value = mixAmt;
    u.uFloat.value = float;
    u.uOpacity.value = opacity;
    u.uSquash.value = squash;
    u.uDrop.value.set(pos.x, pos.y, rad);
    u.uCard.value = card ? 1 : 0;
    if (card && cardTexture) {
      u.uMap.value = cardTexture;
      u.uTexAspect.value = cardAspect;
    } else {
      u.uMap.value = droplets.target.texture;
      u.uTexAspect.value = droplets.target.width / Math.max(1, droplets.target.height);
    }
    const v = moved ? velocityOf() : 0;
    u.uVelocity.value = damp(u.uVelocity.value, v, 12, dt);

    // --- The scene inside, the pointer on it, the words around it -------------
    const sceneLive = geometry === 'frame' && mixAmt > 0.001;
    if (sceneLive) {
      const rx = lerp(thumbV.x, fullV.x, progress);
      const ry = lerp(thumbV.y, fullV.y, progress);
      const rw = lerp(thumbV.z, fullV.z, progress);
      const rh = lerp(thumbV.w, fullV.w, progress);
      if (pointer.dirty) {
        pointer.dirty = false;
        const nx = ((pointer.x - rx) / rw) * 2 - 1;
        const ny = -(((pointer.y - ry) / rh) * 2 - 1);
        pointer.inside = Math.abs(nx) < 1.15 && Math.abs(ny) < 1.15;
        droplets.setPointer(nx, ny, pointer.inside && mixAmt > 0.5, now);
      }
      if (pointer.down) {
        pointer.down = false;
        if (pointer.inside && mixAmt > 0.5) droplets.burst();
        pointerLast = now;
      }
      // The texture is sized to the frame as it is right now, not to the
      // open frame: during the bloom and the close it is a fraction of the
      // size. Quantised so a growing frame reallocates a handful of times,
      // not every frame.
      const dpr = Math.min(window.devicePixelRatio || 1, SCENE_DPR) * SCENE_SCALE;
      const tw = Math.min(1600, Math.max(64, Math.round((rw * dpr) / 64) * 64));
      droplets.setSize(tw, Math.round(tw * (rh / Math.max(1, rw))));

      // At rest — no cursor for a while, page still — the scene breathes at
      // half rate, and after a while longer it stops and holds its frame.
      // Any pointer move or scroll wakes it, so nobody sees the pause.
      const still = !moved && progress >= 1;
      const quiet = now - pointerLast;
      const idle = still && quiet > 3000;
      asleep = still && quiet > 7000;
      frameIndex++;
      if (asleep) {
        droplets.pause();
      } else if (!idle || frameIndex % 2 === 0) {
        if (idle) droplets.pause();
        else droplets.govern(now, Math.max(1000 / 60, refresh));
        droplets.update(idle ? dt * 2 : dt, now);
        droplets.render(renderer);
      }
      const open = progress > 0.9 && close < 0.02;
      setOpen(open);
      setClear(droplets.clarity > 0.55);
    } else {
      pointer.down = false;
      asleep = false;
      droplets.pause();
      setOpen(false);
    }

    if (import.meta.env.DEV) {
      (window as unknown as { __reelDebug?: object }).__reelDebug = {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        r: +rad.toFixed(1),
        squash: +squash.toFixed(2),
        release: +release.toFixed(2),
        travel: +travel.toFixed(2),
        progress: +progress.toFixed(2),
        hold: +f.toFixed(2),
        shape: +shape.toFixed(2),
        mix: +mixAmt.toFixed(2),
        geometry,
        delivered,
        clarity: +droplets.clarity.toFixed(2),
        quality: droplets.quality,
        texture: [droplets.target.width, droplets.target.height],
        refresh: +refresh.toFixed(1),
        quiet: Math.round(now - pointerLast),
        asleep,
      };
    }

    // Asleep: nothing on the canvas changes, so nothing is drawn.
    if (asleep) {
      raf = requestAnimationFrame(frame);
      return;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (running && !raf) {
      lastTime = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  // Run while the stretch from the hero to the delivered card is near the
  // viewport and the tab is visible.
  // A batch only carries the targets whose state changed, so each target's
  // state is kept and the union decides.
  const inView = new Map<Element, boolean>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) inView.set(e.target, e.isIntersecting);
      active = Array.from(inView.values()).some(Boolean);
      kick();
    },
    { rootMargin: '150% 0px' }
  );
  // Nothing draws while the tab is hidden or the menu is open over the page
  // (the nav flags that on <html> and announces it as `sw:menu`).
  const onVisibility = () => {
    const covered =
      document.visibilityState === 'hidden' || document.documentElement.dataset.menuOpen === 'true';
    if (covered) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      droplets.pause();
    } else {
      lastTime = 0;
      kick();
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.dirty = true;
    pointerLast = performance.now();
  };
  const onPointerDown = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.dirty = true;
    pointer.down = true;
  };
  const onResize = () => {
    measure();
    kick();
  };
  const ro = new ResizeObserver(onResize);

  // Follow the theme toggle, as the hero does.
  let dark = document.documentElement.classList.contains('dark');
  const themeObserver = new MutationObserver(() => {
    const next = document.documentElement.classList.contains('dark');
    if (next === dark) return;
    dark = next;
    applyPalette();
    kick();
  });

  measure();

  return {
    get progress() {
      return progress;
    },
    get travel() {
      return travel;
    },
    start() {
      if (running) return;
      running = true;
      io.observe(runway);
      if (leadCard) io.observe(leadCard);
      ro.observe(stage);
      window.addEventListener('resize', onResize);
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
      document.addEventListener('sw:menu', onVisibility);
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      kick();
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('sw:menu', onVisibility);
      window.__heroDropletRelease = 0;
      setOpen(false);
      setClear(false);
    },
    destroy() {
      this.stop();
      if (copy) copy.style.removeProperty('transform');
      mesh.geometry.dispose();
      material.dispose();
      droplets.dispose();
      cardTexture?.dispose();
      renderer.dispose();
    },
  };
}
