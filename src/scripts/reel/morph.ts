/**
 * Reel morph — the droplet that follows the scroll.
 *
 * One WebGL quad on a canvas fixed to the viewport, drawn only while there is
 * something to draw. It carries one thing through three acts:
 *
 *   release   the hero's stray chrome droplet leaves the sculpture. The hero
 *             projects that droplet's centre and radius to the screen every
 *             frame (window.__heroDroplet), we draw our own droplet at the
 *             same pixels and tell the hero to let go of its copy
 *             (window.__heroDropletRelease), so the handoff has no seam to
 *             hide — only a pop, which we lean into.
 *   travel    freed, it floats down with you, damped a beat behind the
 *             scroll, swaying, growing as it comes closer, until it lands
 *             in the thumbnail slot of the reel's intro copy.
 *   bloom     as the reel pins, the sphere spreads into the rounded frame —
 *             the circle's SDF blends into the box's — while the frame peels
 *             out of its slot per vertex (top-right leads), tilts, and opens
 *             to the full width. Inside, the droplet's chrome dissolves into
 *             the playable droplet scene (droplet-scene.ts), which renders
 *             to a texture the frame samples.
 *
 * Everything is measured in viewport pixels each frame, so a fixed canvas can
 * draw over the hero, the gap and the sticky stage alike. The reel's slots
 * are still resolved with offsetTop/offsetLeft inside the stage, which
 * ignores the copy block's own translate: the thumbnail slot stays where it
 * was while the copy scrolls away above it.
 *
 *   - Progress is damped, so the frame trails the scroll by ~100ms: that lag
 *     is the "follows you" feeling, not a bug.
 *   - The scene only renders while it can be seen inside the frame.
 *   - Pixel ratio capped at 2 for the frame, 1.5 for the scene.
 *
 * The caller decides whether to run it at all (reduced motion, no WebGL).
 */
import {
  Color,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
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
  /** The hero's picture panel: where the droplet comes from if the hero
   *  scene is not running (no WebGL there, not hydrated yet). */
  heroPanel?: HTMLElement | null;
  /** Element to read the --hero-* palette hooks from. */
  paletteScope?: HTMLElement | null;
  /** Corner radius in CSS px. */
  radius?: number;
  /** Fraction of the pinned scroll distance over which the morph completes. */
  morphSpan?: number;
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

/** Scroll, as a fraction of the viewport height, over which the droplet
 *  leaves the hero. Ends before the headline has crossed the top. */
const RELEASE_START = 0.06;
const RELEASE_END = 0.3;
/** Landing radius, as a fraction of the thumbnail slot's height. */
const LAND_RADIUS = 0.2;
/** How far the droplet lifts on release, as a fraction of the viewport. */
const LIFT = 0.05;
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
uniform float uMix;      // 0 chrome … 1 the scene
uniform float uFloat;    // shadow under the floating droplet
uniform float uOpacity;
uniform vec3 uDrop;      // droplet centre (viewport px) and radius
uniform vec3 uInk, uMid, uSilver, uBg, uBg2, uWarm, uCool;

varying vec2 vUv;

${STUDIO_GLSL}

float roundedBox(vec2 q, vec2 b, float r) {
  vec2 d = abs(q) - b + vec2(r);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// A chrome droplet, lit by the studio, seen head on. Beyond its radius the
// normal flattens out, so as the shape blooms into the frame the surface
// becomes a still slab of the same metal for the scene to rise through.
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

void main() {
  vec2 size = mix(uStart.zw, uEnd.zw, uProgress);
  vec2 centre = mix(uStart.xy + uStart.zw * 0.5, uEnd.xy + uEnd.zw * 0.5, uProgress);
  vec2 q = (vUv - 0.5) * size;                       // local px, y up
  vec2 dc = vec2(uDrop.x - centre.x, centre.y - uDrop.y);
  float r = max(uDrop.z, 1.0);
  vec2 dq = q - dc;

  // Shape: the droplet's circle blends into the frame's rounded box.
  float sd = mix(length(dq) - r, roundedBox(q, size * 0.5, uRadius), uShape);
  float alpha = 1.0 - smoothstep(-0.75, 0.75, sd);

  // Surface: chrome, then the scene (object-fit: cover).
  float aspect = size.x / size.y;
  vec2 s = aspect > uTexAspect ? vec2(1.0, uTexAspect / aspect) : vec2(aspect / uTexAspect, 1.0);
  vec2 tuv = (vUv - 0.5) * s + 0.5;
  vec3 col = chrome(dq, r);
  if (uMix > 0.001) col = mix(col, texture2D(uMap, tuv).rgb, uMix);

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
function readPalette(scope: HTMLElement): ScenePalette {
  const probe = document.createElement('span');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const read = (expr: string, fallback: string) => {
    try {
      if (!ctx) throw new Error('no 2d context');
      probe.style.color = expr;
      scope.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();
      ctx.fillStyle = computed;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return new Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
    } catch {
      probe.remove();
      return new Color(fallback).convertSRGBToLinear();
    }
  };
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
    stage,
    runway,
    thumb,
    full,
    copy,
    heroPanel,
    paletteScope,
    radius = 16,
    morphSpan = 0.62,
  } = options;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
  const applyPalette = () => {
    const p = readPalette(paletteScope ?? document.body);
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
    uMap: { value: droplets.target.texture },
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
    uDrop: { value: new Vector3() },
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

  // --- layout ----------------------------------------------------------------
  let width = 0;
  let height = 0;
  let holdDistance = 1; // px the stage stays pinned for
  let copyExit = 0; // px the copy travels before it is fully off the stage
  const thumbOff = new Vector4();
  const fullOff = new Vector4();
  const thumbV = new Vector4();
  const fullV = new Vector4();

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
    uniforms.uTexAspect.value = sw / Math.max(1, sh);
  };

  // --- state -----------------------------------------------------------------
  let raf = 0;
  let running = false;
  let active = false; // the journey's stretch of page is near the viewport
  let cleared = false;
  let progress = 0;
  let travel = 0;
  let time = 0;
  let lastTop = Number.NaN;
  let lastTime = 0;
  let anchored = false;
  const anchor = new Vector3(); // where the droplet detached, viewport px + r
  const heroPos = new Vector3();
  const pos = new Vector2();
  let rad = 0;
  let placed = false;
  const pointer = { x: 0, y: 0, dirty: false, inside: false, down: false };
  let pointerLast = -Infinity;
  let frameIndex = 0;

  const scrollVelocity = () => {
    const top = runway.getBoundingClientRect().top;
    const v = Number.isNaN(lastTop) ? 0 : lastTop - top; // px per frame, down = +
    lastTop = top;
    return clamp(v / 42, -1, 1);
  };
  const velocityOf = options.velocity ?? scrollVelocity;

  /** The hero's droplet right now, or a stand-in on its panel. */
  const readHero = (now: number) => {
    const h = window.__heroDroplet;
    if (h && now - h.at < 400) {
      heroPos.set(h.x, h.y, h.r);
      return;
    }
    const rect = heroPanel?.getBoundingClientRect();
    if (rect && rect.width > 0) {
      heroPos.set(
        rect.left + rect.width * 0.68,
        rect.top + rect.height * 0.42,
        rect.height * 0.045
      );
    } else {
      heroPos.set(width * 0.7, height * 0.35, 18);
    }
  };

  const frame = (now: number) => {
    raf = 0;
    if (!running) return;

    const dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;
    time += dt;

    const stageRect = stage.getBoundingClientRect();
    const runwayRect = runway.getBoundingClientRect();
    thumbV.set(stageRect.left + thumbOff.x, stageRect.top + thumbOff.y, thumbOff.z, thumbOff.w);
    fullV.set(stageRect.left + fullOff.x, stageRect.top + fullOff.y, fullOff.z, fullOff.w);

    const sY = window.scrollY;
    const vh = height || 1;

    // --- Act 1: release ---------------------------------------------------------
    const pRelease = smoothstep(RELEASE_START * vh, RELEASE_END * vh, sY);
    window.__heroDropletRelease = smoothstep(0.05, 0.5, pRelease);
    readHero(now);
    if (pRelease <= 0) {
      anchor.copy(heroPos);
      anchored = false;
    } else if (!anchored) {
      anchored = true;
    }

    // --- Act 2: travel ----------------------------------------------------------
    const pinScroll = runwayRect.top + sY;
    const travelStart = RELEASE_END * vh;
    const pTravel =
      pinScroll - travelStart > 40
        ? smoothstep(travelStart, pinScroll, sY)
        : sY >= pinScroll
          ? 1
          : 0;
    travel = pTravel;

    // --- Act 3: bloom and peel --------------------------------------------------
    const pinned = runwayRect.top <= 0;
    const scrolled = clamp(-runwayRect.top, 0, holdDistance);
    const target = clamp(scrolled / (holdDistance * morphSpan), 0, 1);
    if (copy) {
      copy.style.transform = `translate3d(0, ${-Math.min(scrolled, copyExit).toFixed(1)}px, 0)`;
    }
    if (!active) {
      // Off the journey's stretch: snap and sleep. The observer wakes us.
      progress = target;
      uniforms.uVelocity.value = 0;
      lastTop = Number.NaN;
      return;
    }
    progress = damp(progress, target, 9, dt);

    // --- Where the droplet wants to be ------------------------------------------
    const thumbCx = thumbV.x + thumbV.z / 2;
    const thumbCy = thumbV.y + thumbV.w / 2;
    const landR = thumbV.w * LAND_RADIUS;
    const detach = smoothstep(0.12, 0.7, pRelease);
    const pulse = 1 + 0.35 * Math.sin(Math.PI * smoothstep(0.08, 0.75, pRelease));
    const liftY = anchor.y - LIFT * vh;
    const swayGain = pRelease * (1 - progress) * (1 - 0.6 * pTravel);
    const tx =
      lerp(heroPos.x, lerp(anchor.x, thumbCx, pTravel), detach) +
      Math.sin(time * 1.3) * 7 * swayGain;
    const ty =
      lerp(heroPos.y, lerp(liftY, thumbCy, pTravel), detach) + Math.sin(time * 1.9) * 5 * swayGain;
    const tr = lerp(heroPos.z * pulse, landR, pTravel);
    if (!placed || pRelease <= 0) {
      pos.set(tx, ty);
      rad = tr;
      placed = true;
    } else {
      pos.x = damp(pos.x, tx, 7, dt);
      pos.y = damp(pos.y, ty, 7, dt);
      rad = damp(rad, tr, 7, dt);
    }

    // --- What's visible ---------------------------------------------------------
    const shape = smoothstep(0, 0.3, progress);
    const mixAmt = smoothstep(0.08, 0.5, progress);
    const opacity = smoothstep(0, 0.25, pRelease);
    const frameOff = pinned && fullV.y + fullV.w < -20; // the opened frame has scrolled out
    const visible = opacity > 0 && !frameOff && pos.y - rad * 2 < vh + 40 && pos.y + rad * 2 > -40;
    if (!visible && !(pinned && progress > 0.01 && !frameOff)) {
      if (!cleared) {
        renderer.clear();
        cleared = true;
      }
      raf = requestAnimationFrame(frame);
      return;
    }
    cleared = false;

    const u = uniforms;
    if (pinned) {
      u.uStart.value.copy(thumbV);
      u.uEnd.value.copy(fullV);
      u.uProgress.value = progress;
      u.uBend.value = 26;
    } else {
      // Travelling: a square around the droplet, with room below for its shadow.
      const side = rad * 3.6;
      u.uStart.value.set(pos.x - side / 2, pos.y - side / 2 + rad * 0.4, side, side);
      u.uEnd.value.copy(u.uStart.value);
      u.uProgress.value = 0;
      u.uBend.value = 10;
    }
    u.uShape.value = shape;
    u.uMix.value = mixAmt;
    u.uFloat.value = smoothstep(0.1, 0.6, pRelease);
    u.uOpacity.value = opacity;
    u.uDrop.value.set(pos.x, pos.y, rad);
    const v = velocityOf();
    u.uVelocity.value = damp(u.uVelocity.value, v, 12, dt);

    // --- The scene inside, and the pointer on it --------------------------------
    if (mixAmt > 0.001) {
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
      // At rest — no cursor for a while, page still — the scene breathes at
      // half rate, which halves the cost of a held reel nobody is touching.
      const idle = now - pointerLast > 3000 && Math.abs(v) < 0.01 && progress >= 1;
      frameIndex++;
      if (!idle || frameIndex % 2 === 0) {
        droplets.update(idle ? dt * 2 : dt, now);
        droplets.render(renderer);
      }
    } else {
      pointer.down = false;
    }

    renderer.render(scene, camera);
    if (import.meta.env.DEV) {
      (window as unknown as { __reelDebug?: object }).__reelDebug = {
        x: Math.round(pos.x),
        y: Math.round(pos.y),
        r: +rad.toFixed(1),
        release: +pRelease.toFixed(2),
        travel: +pTravel.toFixed(2),
        progress: +progress.toFixed(2),
        shape: +shape.toFixed(2),
        mix: +mixAmt.toFixed(2),
        pinned,
      };
    }
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (running && !raf) {
      lastTime = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  // Run while the stretch from the hero to the opened reel is near the
  // viewport and the tab is visible.
  const io = new IntersectionObserver(
    ([entry]) => {
      active = entry.isIntersecting;
      kick();
    },
    { rootMargin: '150% 0px' }
  );
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
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
      ro.observe(stage);
      window.addEventListener('resize', onResize);
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
      document.addEventListener('visibilitychange', onVisibility);
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
      window.__heroDropletRelease = 0;
    },
    destroy() {
      this.stop();
      if (copy) copy.style.removeProperty('transform');
      mesh.geometry.dispose();
      material.dispose();
      droplets.dispose();
      renderer.dispose();
    },
  };
}
