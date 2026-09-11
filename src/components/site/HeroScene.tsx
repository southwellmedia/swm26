/**
 * HeroScene — "Clarity in Chaos"
 *
 * A raymarched, studio-lit sculpture. Monochrome, from the theme greys.
 *
 *   chaos    a swarm of ink, graphite and chrome droplets, orbiting,
 *            colliding and merging into one another
 *   clarity  the same droplets migrated into one smooth ink slab — with a
 *            few stray chrome droplets still being absorbed
 *
 * The cursor is the lens: bring it toward the form and the form resolves.
 * The chaos also leans toward the cursor, so it feels like it reaches for you.
 * Scroll completes the resolve as the headline rises. With no input the form
 * breathes between states on its own.
 *
 * Three light passes rather than one monster shader — Chrome on Windows
 * compiles GLSL through Direct3D, which unrolls nested raymarch loops and can
 * freeze the page for seconds on a shader that nests reflection and
 * supersampling inside the march:
 *
 *   1. march      the sculpture, shaded, into a half-float texture
 *   2. mirror     the same shader with the camera flipped under the floor
 *                 (a planar reflection — no extra loops, no extra compile)
 *   3. composite  a raymarched studio cyclorama (floor, cove, walls) lit by
 *                 the same key light, with true soft shadows and occlusion
 *                 from the droplets, the planar reflection on the floor,
 *                 tone mapping, edge smoothing and a fine grain
 *
 * Droplet positions are computed on the CPU each frame and passed as a
 * uniform array, so the SDF is a tight loop with no trig. Loop bounds are
 * uniforms so the Direct3D compiler cannot unroll them (10-20 s stalls) —
 * and so the quality governor can retune them without a recompile.
 *
 * Budget. This is the most expensive thing on the site, so it is only ever
 * allowed to cost what the machine can spare:
 *
 *   - it renders only while the panel is on screen and the tab is visible;
 *   - with no cursor and no scroll it drops to every other frame;
 *   - a governor watches the frame cadence and steps the render scale and
 *     march/shadow/occlusion budgets down when frames run long, and back up,
 *     more cautiously each time, when there is headroom;
 *   - nothing on the pointer path touches layout — the canvas rect is read at
 *     most once per rendered frame, inside the frame.
 *
 * Plain three.js driven from one React effect: an Astro island hydrates a
 * React tree in a way React Three Fiber's canvas measurement never survives,
 * so the renderer, resize observer and frame loop are owned here.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const NBLOB = 11;
const FLOOR_Y = -1.0;

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const quadVertex = /* glsl */ `
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const marchFragment = /* glsl */ `
  precision highp float;

  // Loop bounds are uniforms on purpose: with constant bounds the Direct3D
  // compiler behind Chrome-on-Windows unrolls the nested loops and can take
  // 10-20 s to compile. Uniform bounds cannot be unrolled.
  uniform int uSteps, uBlobCount, uShadowSteps, uAoSteps;

  uniform vec2  uRes;
  uniform vec3  uRo, uFw, uRt, uUp;   // camera basis
  uniform float uMirror;              // 1 = render the under-floor reflection
  uniform float uClarity;
  uniform vec4  uBlobs[${NBLOB}];     // xyz centre, w radius
  uniform float uBlobTint[${NBLOB}];  // 0 ink .. 1 chrome
  uniform float uK;                   // smooth-union radius of the main body
  uniform vec3  uInk, uMid, uSilver, uBg, uBg2;
  uniform vec3  uWarm, uCool;         // key / fill light tints

  in vec2 vUv;
  out vec4 fragColor;

  #define FLOOR_Y ${FLOOR_Y.toFixed(1)}
  #define FOCAL 1.9

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  float map(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < uBlobCount; i++) {
      vec4 bl = uBlobs[i];
      d = smin(d, length(p - bl.xyz) - bl.w, i < 8 ? uK : 0.32);
    }
    return d;
  }

  // Which droplet tone dominates at p — evaluated once, at the hit point.
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

  float softShadow(vec3 ro, vec3 rd) {
    float res = 1.0, t = 0.06;
    for (int i = 0; i < uShadowSteps; i++) {
      float h = map(ro + rd * t);
      res = min(res, 9.0 * h / t);
      t += clamp(h, 0.06, 0.4);
      if (res < 0.01 || t > 5.0) break;
    }
    return clamp(res, 0.0, 1.0);
  }

  float ambientOcclusion(vec3 p, vec3 n) {
    float occ = 0.0, sca = 1.0;
    for (int i = 0; i < uAoSteps; i++) {
      float h = 0.04 + 0.16 * float(i);
      occ += (h - map(p + n * h)) * sca;
      sca *= 0.7;
    }
    return clamp(1.0 - 1.5 * occ, 0.0, 1.0);
  }

  // Studio: gradient dome + three softboxes, read through the reflection.
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
    // Bright floor below: reflected into downward-facing surfaces.
    col += uBg * 0.5 * smoothstep(0.0, -0.6, r.y);
    return col;
  }

  vec3 dropletColor(float t) {
    return t < 0.5 ? mix(uInk, uMid, t * 2.0) : mix(uMid, uSilver, (t - 0.5) * 2.0);
  }

  vec3 shade(vec3 p, vec3 n, vec3 rd, float tint) {
    vec3 v = -rd;
    vec3 r = reflect(rd, n);
    vec3 L = normalize(KEY);

    float ao = ambientOcclusion(p, n);
    float sh = uMirror > 0.5 ? 1.0 : softShadow(p + n * 0.03, L);
    float ndl = max(dot(n, L), 0.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);

    vec3 albedo = dropletColor(tint);
    // Bounce from the bright floor lifts the underside (and the reflection).
    float bounce = smoothstep(0.2, -1.0, n.y) * smoothstep(1.5, FLOOR_Y, p.y);
    vec3 diffuse = albedo * ((0.22 + 0.62 * ndl * sh) * ao + bounce * 0.35 * uBg);

    float gloss = mix(0.7, 1.0, tint);
    vec3 spec = env(r) * ao * mix(0.05, 1.0, fres) * gloss;

    vec3 h = normalize(L + v);
    spec += pow(max(dot(n, h), 0.0), 160.0) * 0.7 * sh;

    return diffuse + spec;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    vec3 ro = uRo;
    vec3 rd = normalize(uFw * FOCAL + uRt * uv.x + uUp * uv.y);
    if (uMirror > 0.5) {
      ro.y = 2.0 * FLOOR_Y - ro.y;
      rd.y = -rd.y;
    }
    float px = 1.0 / (uRes.y * FOCAL);

    float t = 0.0, d = 0.0, minD = 1e5, tMin = 0.0;
    bool hit = false;
    for (int i = 0; i < uSteps; i++) {
      vec3 p = ro + rd * t;
      d = map(p);
      float m = d / max(t * px, 1e-4);
      if (m < minD) { minD = m; tMin = t; }
      if (d < 0.0008 * t) { hit = true; break; }
      t += d * 0.85;
      if (t > 16.0) break;
    }

    // Soft silhouette: pixels that grazed the surface get partial coverage.
    float cover = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.0, minD);
    if (cover <= 0.0) { fragColor = vec4(0.0); return; }

    float ts = hit ? t : tMin;
    vec3 p = ro + rd * ts;
    vec3 n = calcNormal(p, 0.002 + 0.0015 * ts);
    vec3 col = shade(p, n, rd, tintAt(p));
    fragColor = vec4(col, cover);
  }
`;

const compositeFragment = /* glsl */ `
  precision highp float;

  uniform int uBlobCount, uRoomSteps, uShadowSteps, uAoSteps;

  uniform sampler2D tScene;
  uniform sampler2D tMirror;
  uniform vec2  uRes;
  uniform vec2  uMirrorTexel;
  uniform vec3  uRo, uFw, uRt, uUp;
  uniform vec3  uBg, uBg2, uInk;
  uniform vec3  uWarm, uCool;
  uniform vec4  uBlobs[${NBLOB}];
  uniform float uK;

  in vec2 vUv;
  out vec4 fragColor;

  #define FLOOR_Y ${FLOOR_Y.toFixed(1)}
  #define BACK_Z -3.8
  #define SIDE_X 7.5
  #define FOCAL 1.9

  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // The sculpture, for shadows and occlusion on the room.
  float blobs(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < uBlobCount; i++) {
      vec4 bl = uBlobs[i];
      d = smin(d, length(p - bl.xyz) - bl.w, i < 8 ? uK : 0.32);
    }
    return d;
  }

  // Studio cyclorama: floor sweeping up into a back wall, side walls.
  float room(vec3 p) {
    float d = smin(p.y - FLOOR_Y, p.z - BACK_Z, 1.8);
    d = smin(d, SIDE_X - abs(p.x), 2.5);
    return d;
  }

  vec3 roomNormal(vec3 p) {
    vec2 e = vec2(0.01, -0.01);
    return normalize(
      e.xyy * room(p + e.xyy) + e.yyx * room(p + e.yyx) +
      e.yxy * room(p + e.yxy) + e.xxx * room(p + e.xxx)
    );
  }

  float softShadow(vec3 ro, vec3 rd) {
    float res = 1.0, t = 0.08;
    for (int i = 0; i < uShadowSteps; i++) {
      float h = blobs(ro + rd * t);
      res = min(res, 7.0 * h / t);
      t += clamp(h, 0.08, 0.45);
      if (res < 0.01 || t > 7.0) break;
    }
    return clamp(res, 0.0, 1.0);
  }

  float occlusion(vec3 p, vec3 n) {
    float occ = 0.0, sca = 1.0;
    for (int i = 0; i < uAoSteps; i++) {
      float h = 0.06 + 0.22 * float(i);
      occ += (h - blobs(p + n * h)) * sca;
      sca *= 0.75;
    }
    return clamp(1.0 - 0.9 * occ, 0.0, 1.0);
  }

  // Blurred reflection lookup: 3x5 taps, taller than wide.
  vec4 mirrorBlur(vec2 uv, vec2 radius) {
    vec4 acc = vec4(0.0);
    float wsum = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -2; i <= 2; i++) {
        float w = (1.0 - abs(float(i)) * 0.3) * (1.0 - abs(float(j)) * 0.4);
        acc += texture(tMirror, uv + vec2(float(j), float(i)) * uMirrorTexel * radius) * w;
        wsum += w;
      }
    }
    return acc / wsum;
  }

  // Cheap value noise for surface texture.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    return 0.5 * vnoise(p) + 0.25 * vnoise(p * 2.1 + 3.7) + 0.125 * vnoise(p * 4.3 + 9.1);
  }

  const vec3 KEY = vec3(-0.55, 0.8, 0.4);

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
    vec3 ro = uRo;
    vec3 rd = normalize(uFw * FOCAL + uRt * uv.x + uUp * uv.y);

    // --- Room --------------------------------------------------------------
    float t = 0.0;
    for (int i = 0; i < uRoomSteps; i++) {
      float d = room(ro + rd * t);
      if (d < 0.002 * t) break;
      t += d;
      if (t > 40.0) break;
    }
    vec3 p = ro + rd * t;
    vec3 n = roomNormal(p);
    vec3 L = normalize(KEY);

    float floorness = smoothstep(0.6, 0.95, n.y);
    float dist = length(p.xz);

    // Surface: matte studio paint with a fine mottle; hairline grid on the floor.
    vec3 albedo = mix(uBg2, uBg, mix(0.7, 0.25, floorness));
    albedo *= mix(uCool, uWarm, floorness);
    albedo *= 0.94 + 0.12 * fbm(mix(p.xy, p.xz, floorness) * 1.6);
    vec2 g = abs(fract(p.xz / 0.6) - 0.5) * 0.6;
    float line = 1.0 - smoothstep(0.0, 0.012 + t * 0.004, min(g.x, g.y));
    albedo *= 1.0 - 0.08 * line * floorness * (1.0 - smoothstep(0.0, 10.0, t));

    // Lighting: key with true soft shadow from the sculpture, a wide soft
    // pool of light on the floor, ambient occlusion where the droplets hover.
    float sh = softShadow(p + n * 0.04, L);
    float ao = occlusion(p, n);
    float ndl = max(dot(n, L), 0.0);
    float pool = 1.0 - 0.45 * smoothstep(1.5, 7.0, dist);
    vec3 light = uCool * 0.38 + uWarm * 0.55 * ndl * mix(0.22, 1.0, sh);
    vec3 col = albedo * light * pool * mix(0.4, 1.0, ao);
    // Wall falls off toward the top of the frame.
    col *= 1.0 - 0.25 * smoothstep(0.5, 3.5, p.y);

    // --- Floor reflection (planar, from the mirror pass) ----------------------
    if (floorness > 0.01) {
      float down = clamp(-rd.y * 3.5, 0.0, 1.0);
      float f = 0.5 + 0.45 * pow(1.0 - down, 2.0);
      vec2 radius = vec2(0.5 + 0.5 * down, 0.5 + 2.2 * down);
      vec4 refl = mirrorBlur(vUv, radius);
      col = mix(col, refl.rgb, refl.a * f * floorness);
    }

    // --- Sculpture, with a light 4-neighbour blend on its silhouette ---------
    vec4 s = texture(tScene, vUv);
    vec2 tx = 1.0 / uRes;
    vec4 s1 = texture(tScene, vUv + vec2(tx.x, 0.0));
    vec4 s2 = texture(tScene, vUv - vec2(tx.x, 0.0));
    vec4 s3 = texture(tScene, vUv + vec2(0.0, tx.y));
    vec4 s4 = texture(tScene, vUv - vec2(0.0, tx.y));
    float edge = abs(s1.a - s2.a) + abs(s3.a - s4.a);
    vec4 sm = (s * 2.0 + s1 + s2 + s3 + s4) / 6.0;
    s = mix(s, sm, clamp(edge * 2.0, 0.0, 1.0));
    col = mix(col, s.rgb, s.a);

    // Vignette, filmic roll-off, grain, sRGB encode.
    col *= 1.0 - 0.2 * smoothstep(0.4, 1.15, length(uv * vec2(0.8, 1.3)));
    col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
    // Fine static grain, in place of the CSS feTurbulence layer that used to
    // blend over the canvas — a mix-blend-mode layer over a live canvas is
    // recomposited every frame. Per pixel and still, so it reads as paper.
    col = clamp(col + (hash(gl_FragCoord.xy * 0.37) - 0.5) * 0.028, 0.0, 1.0);
    col = pow(col, vec3(1.0 / 2.2));

    fragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Palette = {
  ink: THREE.Color;
  mid: THREE.Color;
  silver: THREE.Color;
  bg: THREE.Color;
  bg2: THREE.Color;
  warm: THREE.Color;
  cool: THREE.Color;
};

/**
 * Resolve any CSS colour (incl. oklch / color-mix) to a linear THREE.Color.
 *
 * One probe span and one 1x1 canvas are shared across calls: reading a colour
 * is a forced style flush plus a GPU readback, so the seven reads of a palette
 * should not each build their own scratch DOM. Only ever runs on mount and on
 * a theme change.
 */
let probeEl: HTMLSpanElement | null = null;
let probeCtx: CanvasRenderingContext2D | null = null;

function cssColor(scope: HTMLElement, expr: string, fallback: string): THREE.Color {
  try {
    if (!probeEl) probeEl = document.createElement('span');
    if (!probeCtx) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      probeCtx = c.getContext('2d', { willReadFrequently: true });
    }
    if (!probeCtx) throw new Error('no 2d context');
    probeEl.style.color = expr;
    scope.appendChild(probeEl);
    const computed = getComputedStyle(probeEl).color;
    probeEl.remove();
    probeCtx.fillStyle = computed;
    probeCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data;
    return new THREE.Color(r / 255, g / 255, b / 255).convertSRGBToLinear();
  } catch {
    return new THREE.Color(fallback).convertSRGBToLinear();
  }
}

/**
 * Every colour is a CSS custom property so the scene can be art-directed from
 * the theme without touching the shader. The hooks are read from the .hero
 * section (set them there or on :root). Each --hero-* hook falls back to a
 * theme token:
 *
 *   --hero-ink     darkest droplet / resolved slab   (--color-foreground)
 *   --hero-mid     mid droplet                        (--gray-500)
 *   --hero-chrome  brightest droplet                  (--gray-200)
 *   --hero-warm    key-light tint, floor tint         (white)
 *   --hero-cool    fill-light tint, backdrop top      (ice white)
 */
function readPalette(scope: HTMLElement): Palette {
  return {
    ink: cssColor(scope, 'var(--hero-ink, var(--color-foreground))', '#0c1016'),
    mid: cssColor(scope, 'var(--hero-mid, var(--gray-500))', '#7a7f86'),
    silver: cssColor(scope, 'var(--hero-chrome, var(--gray-200))', '#e2e5e8'),
    bg: cssColor(scope, 'var(--color-background-secondary)', '#e6ebef'),
    bg2: cssColor(scope, 'var(--color-background-tertiary)', '#d9dfe4'),
    warm: cssColor(scope, 'var(--hero-warm, #ffffff)', '#ffffff'),
    cool: cssColor(scope, 'var(--hero-cool, #f4f7fa)', '#f4f7fa'),
  };
}

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

// ---------------------------------------------------------------------------
// Quality tiers
// ---------------------------------------------------------------------------

/**
 * What one frame is allowed to cost, from most to least. Every field is either
 * a render-target scale or a loop bound that is already a uniform, so moving
 * between tiers reallocates two textures and sets a few ints — no recompile.
 *
 *   dpr      cap on the device pixel ratio for the composite pass
 *   march    sculpture pass, as a fraction of composite pixels
 *   mirror   reflection pass, as a fraction of the march pass (it is blurred)
 *   steps    primary march steps; shadow / ao on the sculpture
 *   room     cyclorama march steps; roomShadow / roomAo cast by the droplets
 */
type Tier = {
  dpr: number;
  march: number;
  mirror: number;
  steps: number;
  shadow: number;
  ao: number;
  room: number;
  roomShadow: number;
  roomAo: number;
};

const TIERS: readonly Tier[] = [
  { dpr: 1.25, march: 0.8, mirror: 0.55, steps: 64, shadow: 10, ao: 4, room: 44, roomShadow: 12, roomAo: 4 },
  { dpr: 1.0, march: 0.72, mirror: 0.5, steps: 56, shadow: 8, ao: 3, room: 40, roomShadow: 10, roomAo: 4 },
  { dpr: 1.0, march: 0.6, mirror: 0.45, steps: 48, shadow: 6, ao: 3, room: 32, roomShadow: 8, roomAo: 3 },
  { dpr: 1.0, march: 0.5, mirror: 0.4, steps: 40, shadow: 5, ao: 2, room: 28, roomShadow: 6, roomAo: 3 },
];

/**
 * Render cadence. The scene draws on its own clock, not the display's: a
 * 240 Hz panel would otherwise run the raymarcher four times as often as
 * anyone can see. 60 fps while the cursor or the page is moving, 30 fps at
 * rest.
 */
const ACTIVE_INTERVAL = 1000 / 60;
const IDLE_INTERVAL = 1000 / 30;

/**
 * Governor. A rendered frame that lands this much later than its cadence
 * asked for is a miss — the GPU did not keep up. Judged per one-second
 * window: too many misses steps the quality down, a clean run steps it up.
 */
const MISS_SLACK_MS = 14;
const MISS_RATE_DOWN = 0.08;
const MISS_RATE_UP = 0.01;
const WINDOW_MS = 1000;

export type HeroStats = {
  ms: number;
  fps: number;
  tier: number;
  /** True while the panel is mostly off screen and drawing at minimum quality. */
  low: boolean;
  running: boolean;
  throttled: boolean;
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class HeroEngine {
  private renderer: THREE.WebGLRenderer;
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private marchScene = new THREE.Scene();
  private compScene = new THREE.Scene();
  private march: THREE.ShaderMaterial;
  private composite: THREE.ShaderMaterial;
  private rtScene: THREE.WebGLRenderTarget;
  private rtMirror: THREE.WebGLRenderTarget;
  private camera = {
    uRo: { value: new THREE.Vector3() },
    uFw: { value: new THREE.Vector3() },
    uRt: { value: new THREE.Vector3() },
    uUp: { value: new THREE.Vector3() },
  };
  private colors = {
    uInk: { value: new THREE.Color() },
    uMid: { value: new THREE.Color() },
    uSilver: { value: new THREE.Color() },
    uBg: { value: new THREE.Color() },
    uBg2: { value: new THREE.Color() },
    uWarm: { value: new THREE.Color() },
    uCool: { value: new THREE.Color() },
  };
  private blobs = Array.from({ length: NBLOB }, () => new THREE.Vector4(0, 0, 0, 0.3));
  private tints = new Float32Array(NBLOB);

  // Pointer: the event handler only records where; the frame does the maths,
  // so the layout read happens at most once per rendered frame.
  private pointer = { x: 0, y: 0, active: false, last: -Infinity };
  private pendingPointer = { x: 0, y: 0, dirty: false };

  private mouse = new THREE.Vector2();
  private mouseTarget = new THREE.Vector2();
  private clarity = 0.2;
  private scroll = 0;
  private lastScrollY = -1;
  private clock = new THREE.Clock();
  // Scene time accumulates only while rendering, so a pause (off screen,
  // hidden tab) never makes the droplets jump when the loop resumes.
  private time = 0;
  private raf = 0;
  private running = false;
  private narrow = false;
  private width = 0;
  private height = 0;
  private tmpTarget = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  // Governor state.
  private tier = 1;
  private appliedTier = -1;
  private tierCeiling = 0;
  private lowVisibility = false;
  private ema = 0;
  private windowStart = 0;
  private windowFrames = 0;
  private windowMisses = 0;
  private goodWindows = 0;
  private goodNeeded = 3;
  private settleUntil = 0;
  private lastRender = 0;
  private frameIndex = 0;
  private throttled = false;

  reducedMotion = false;
  onStats: ((s: HeroStats) => void) | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = true;

    const rtOpts = { depthBuffer: false, stencilBuffer: false, type: THREE.HalfFloatType };
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, rtOpts);
    this.rtMirror = new THREE.WebGLRenderTarget(1, 1, rtOpts);

    this.march = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: quadVertex,
      fragmentShader: marchFragment,
      uniforms: {
        ...this.camera,
        ...this.colors,
        uSteps: { value: 56 },
        uBlobCount: { value: NBLOB },
        uShadowSteps: { value: 8 },
        uAoSteps: { value: 3 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMirror: { value: 0 },
        uClarity: { value: 0.2 },
        uBlobs: { value: this.blobs },
        uBlobTint: { value: this.tints },
        uK: { value: 0.55 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.composite = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: quadVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        ...this.camera,
        uBg: this.colors.uBg,
        uBg2: this.colors.uBg2,
        uInk: this.colors.uInk,
        uWarm: this.colors.uWarm,
        uCool: this.colors.uCool,
        uBlobCount: { value: NBLOB },
        uRoomSteps: { value: 40 },
        uShadowSteps: { value: 10 },
        uAoSteps: { value: 4 },
        uBlobs: { value: this.blobs },
        uK: { value: 0.55 },
        tScene: { value: this.rtScene.texture },
        tMirror: { value: this.rtMirror.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uMirrorTexel: { value: new THREE.Vector2(1, 1) },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    const q1 = new THREE.Mesh(geo, this.march);
    q1.frustumCulled = false;
    this.marchScene.add(q1);
    const q2 = new THREE.Mesh(geo, this.composite);
    q2.frustumCulled = false;
    this.compScene.add(q2);

    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('pointerdown', this.onPointer, { passive: true });
    document.addEventListener('mouseleave', this.onLeave);

    if (import.meta.env.DEV) {
      // Renders one frame synchronously and returns it, for review tooling.
      (window as unknown as { __heroSnapshot?: () => string }).__heroSnapshot = () => {
        this.frame();
        return this.canvas.toDataURL('image/jpeg', 0.92);
      };
    }
  }

  setPalette(p: Palette) {
    this.colors.uInk.value.copy(p.ink);
    this.colors.uMid.value.copy(p.mid);
    this.colors.uSilver.value.copy(p.silver);
    this.colors.uBg.value.copy(p.bg);
    this.colors.uBg2.value.copy(p.bg2);
    this.colors.uWarm.value.copy(p.warm);
    this.colors.uCool.value.copy(p.cool);
    if (this.reducedMotion) this.frame();
  }

  resize(width: number, height: number) {
    if (width < 2 || height < 2) return;
    const wasNarrow = this.narrow;
    this.narrow = width < 700;
    this.width = width;
    this.height = height;
    // A narrow panel starts one tier lower; a fresh layout re-picks the start.
    if (this.narrow !== wasNarrow && this.narrow && this.tier < 2) this.tier = 2;
    this.applyTier(true);
    if (this.reducedMotion) this.frame();
  }

  /** The tier actually drawn: the governed one, or the floor while the panel
   *  is mostly scrolled out — a strip sliding off screen needs no detail. */
  private effectiveTier() {
    return this.lowVisibility ? TIERS.length - 1 : this.tier;
  }

  /** How much of the panel is in the viewport, from the IntersectionObserver.
   *  Hysteresis around a half so a slow scroll cannot flap the textures. */
  setVisibility(ratio: number) {
    const next = ratio < 0.45 ? true : ratio > 0.55 ? false : this.lowVisibility;
    if (next === this.lowVisibility) return;
    this.lowVisibility = next;
    this.applyTier();
    this.resetWindow(performance.now());
    this.settleUntil = performance.now() + WINDOW_MS;
  }

  /** Size the passes for the effective tier. Reallocates the two render
   *  targets, so it only does work when the tier actually changed or the
   *  panel was resized. */
  private applyTier(force = false) {
    if (this.width < 2 || this.height < 2) return;
    const tier = this.effectiveTier();
    if (!force && tier === this.appliedTier) return;
    this.appliedTier = tier;
    const q = TIERS[tier];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.renderer.setSize(this.width, this.height, false);
    const dpr = this.renderer.getPixelRatio();
    const w = Math.round(this.width * dpr);
    const h = Math.round(this.height * dpr);
    this.rtScene.setSize(Math.max(2, Math.round(w * q.march)), Math.max(2, Math.round(h * q.march)));
    this.rtMirror.setSize(
      Math.max(2, Math.round(w * q.march * q.mirror)),
      Math.max(2, Math.round(h * q.march * q.mirror))
    );
    this.composite.uniforms.uRes.value.set(w, h);
    this.composite.uniforms.uMirrorTexel.value.set(1 / this.rtMirror.width, 1 / this.rtMirror.height);

    const mu = this.march.uniforms;
    mu.uSteps.value = q.steps;
    mu.uShadowSteps.value = q.shadow;
    mu.uAoSteps.value = q.ao;
    const cu = this.composite.uniforms;
    cu.uRoomSteps.value = q.room;
    cu.uShadowSteps.value = q.roomShadow;
    cu.uAoSteps.value = q.roomAo;
  }

  /** Run while the panel is on screen and the tab is visible; otherwise stop. */
  setActive(active: boolean) {
    if (this.reducedMotion) {
      // One still frame, no loop.
      this.stopLoop();
      if (active) this.frame();
      return;
    }
    if (active && !this.running) this.startLoop();
    else if (!active && this.running) this.stopLoop();
  }

  private startLoop() {
    this.running = true;
    this.clock.getDelta(); // discard the pause
    this.lastRender = 0;
    this.resetWindow(performance.now());
    this.settleUntil = performance.now() + WINDOW_MS; // let textures warm before judging
    const loop = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stopLoop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pushStats();
  }

  dispose() {
    this.stopLoop();
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerdown', this.onPointer);
    document.removeEventListener('mouseleave', this.onLeave);
    this.rtScene.dispose();
    this.rtMirror.dispose();
    this.march.dispose();
    this.composite.dispose();
    this.renderer.dispose();
  }

  // Pointer on the window: the lens still works over the overlapping headline.
  // No layout here — the frame reads the rect once and does the conversion.
  private onPointer = (e: PointerEvent) => {
    this.pendingPointer.x = e.clientX;
    this.pendingPointer.y = e.clientY;
    this.pendingPointer.dirty = true;
  };
  private onLeave = () => {
    this.pointer.active = false;
  };

  private consumePointer(now: number) {
    const pp = this.pendingPointer;
    if (!pp.dirty) return;
    pp.dirty = false;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const nx = ((pp.x - rect.left) / rect.width) * 2 - 1;
    const ny = -(((pp.y - rect.top) / rect.height) * 2 - 1);
    if (nx < -1.5 || nx > 1.5 || ny < -1.8 || ny > 1.8) return;
    this.pointer.x = clamp(nx, -1.2, 1.2);
    this.pointer.y = clamp(ny, -1.2, 1.2);
    this.pointer.active = true;
    this.pointer.last = now;
  }

  // --- Governor ---------------------------------------------------------------

  private resetWindow(now: number) {
    this.windowStart = now;
    this.windowFrames = 0;
    this.windowMisses = 0;
  }

  private setTier(next: number, now: number) {
    next = clamp(next, this.tierCeiling, TIERS.length - 1);
    if (next === this.tier) return;
    this.tier = next;
    this.applyTier();
    this.resetWindow(now);
    this.settleUntil = now + WINDOW_MS;
  }

  /** Called once per rendered frame with the interval since the previous
   *  render and the interval the cadence asked for. */
  private govern(now: number, interval: number, target: number) {
    this.ema = this.ema === 0 ? interval : this.ema * 0.9 + interval * 0.1;
    if (now < this.settleUntil || this.lowVisibility) {
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
    } else if (missRate < MISS_RATE_UP && this.tier > this.tierCeiling) {
      this.goodWindows++;
      if (this.goodWindows >= this.goodNeeded) {
        // Step up, and demand a longer run of good windows before the next
        // one — a step that proves too much is paid for once, not every 4 s.
        this.goodWindows = 0;
        this.goodNeeded = Math.min(this.goodNeeded * 2, 48);
        this.setTier(this.tier - 1, now);
      }
    } else {
      this.goodWindows = 0;
    }
    this.resetWindow(now);
  }

  private pushStats() {
    if (!this.onStats) return;
    this.onStats({
      ms: this.ema,
      fps: this.ema > 0 ? 1000 / this.ema : 0,
      tier: this.tier,
      low: this.lowVisibility,
      running: this.running,
      throttled: this.throttled,
    });
  }

  // --- Frame ------------------------------------------------------------------

  private tick(now: number) {
    // Idle: no cursor for a while and the page is not scrolling. Half rate is
    // plenty for the breathing loop, and halves the GPU cost of a resting page.
    const scrollY = window.scrollY;
    const still = this.lastScrollY >= 0 && Math.abs(scrollY - this.lastScrollY) < 1;
    this.lastScrollY = scrollY;
    const idle = !this.pendingPointer.dirty && (!this.pointer.active || now - this.pointer.last > 3000);
    this.throttled = idle && still;

    // Fixed cadence, whatever the display's refresh rate. The 1.5 ms of slack
    // lets a 240 Hz vsync that lands just short of the interval count.
    const target = this.throttled ? IDLE_INTERVAL : ACTIVE_INTERVAL;
    if (this.lastRender && now - this.lastRender < target - 1.5) return;
    const interval = this.lastRender ? now - this.lastRender : target;
    this.lastRender = now;
    this.frameIndex++;

    this.govern(now, interval, target);
    this.frame(now);
    if (this.frameIndex % 10 === 0) this.pushStats();
  }

  private frame(now = performance.now()) {
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this.time += dt;
    const t = this.reducedMotion ? 4 : this.time;

    // --- Input -------------------------------------------------------------
    this.consumePointer(now);
    const p = this.pointer;
    const idle = !p.active || now - p.last > 3000;
    const scroll = clamp(window.scrollY / Math.max(window.innerHeight, 1), 0, 1);
    this.scroll = damp(this.scroll, scroll, 6, dt);

    let clarityTarget: number;
    if (this.reducedMotion) {
      this.mouseTarget.set(0, 0);
      clarityTarget = 1;
    } else if (idle) {
      this.mouseTarget.set(Math.sin(t * 0.23) * 0.5, Math.cos(t * 0.19) * 0.3);
      clarityTarget = 0.1 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.3));
    } else {
      this.mouseTarget.set(p.x, p.y);
      const dist = Math.hypot(p.x, p.y + 0.05);
      clarityTarget = 1 - THREE.MathUtils.smoothstep(dist, 0.12, 0.85);
    }
    clarityTarget = Math.min(1, Math.max(clarityTarget, scroll * 1.4));

    this.mouse.lerp(this.mouseTarget, 1 - Math.exp(-(idle ? 1.2 : 5) * dt));
    this.clarity = damp(this.clarity, clarityTarget, idle ? 1.4 : 3.5, dt);
    this.march.uniforms.uClarity.value = this.clarity;

    // --- Camera: low three-quarter, parallax from cursor, lifts on scroll ----
    const s = this.scroll;
    const yaw = this.mouse.x * 0.16 + 0.18;
    const pitch = this.mouse.y * 0.1 + 0.17 + s * 0.25;
    const target = this.tmpTarget.set(0, -0.15 + s * 0.6, 0);
    const cam = this.camera;
    cam.uRo.value
      .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      .multiplyScalar(5.6)
      .add(target);
    cam.uFw.value.subVectors(target, cam.uRo.value).normalize();
    cam.uRt.value.crossVectors(this.up, cam.uFw.value).normalize();
    cam.uUp.value.crossVectors(cam.uFw.value, cam.uRt.value);

    // --- Droplets ------------------------------------------------------------
    // In chaos they orbit and lean toward the cursor; as clarity rises they
    // migrate into a row and fuse into one smooth slab. Same droplets
    // throughout, so the morph has no creases.
    const ax = this.mouse.x * 1.9;
    const ay = this.mouse.y * 1.1 + 0.0;
    const az = 0.4;
    const c = this.clarity;
    const ce = c * c * (3 - 2 * c);
    const spin = t * 0.08 + 0.5;
    const cs = Math.cos(spin);
    const sn = Math.sin(spin);
    const k = lerp(0.55, 0.8, ce);
    this.march.uniforms.uK.value = k;
    this.composite.uniforms.uK.value = k;

    for (let i = 0; i < 8; i++) {
      const lean = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(i * 2.9));
      let cx = Math.sin(t * 0.4 + i * 1.7) * 1.1;
      let cy = Math.cos(t * 0.33 + i * 2.3) * 0.45 - 0.05;
      let cz = Math.sin(t * 0.29 + i * 3.1) * 0.65;
      cx += (ax - cx) * lean;
      cy += (ay - cy) * lean;
      cz += (az - cz) * lean;

      const ox0 = -1.15 + (2.3 * i) / 7;
      const oz0 = 0.18 * Math.sin(i * 2.4);
      const oy = -0.5 + 0.03 * Math.sin(i * 1.3);
      const rc = 0.3 + 0.16 * Math.sin(i * 2 + t * 0.55);
      this.blobs[i].set(
        lerp(cx, ox0 * cs - oz0 * sn, ce),
        lerp(cy, oy, ce),
        lerp(cz, -ox0 * sn + oz0 * cs, ce),
        lerp(rc, 0.44, ce)
      );

      // Ink → graphite → chrome per droplet; the resolved slab is ink.
      const own = (i * 0.37 + 0.11) % 1;
      this.tints[i] = lerp(own, 0.12, ce * 0.85);
    }
    for (let i = 0; i < 3; i++) {
      const a = t * (0.32 + 0.09 * i) + i * 2.1;
      this.blobs[8 + i].set(
        Math.cos(a) * 1.7,
        -0.05 + Math.sin(a * 1.6 + i) * 0.5,
        Math.sin(a) * 1.0,
        0.11 + 0.05 * Math.sin(t * 0.8 + i * 4)
      );
      this.tints[8 + i] = 0.95;
    }

    // --- Passes ----------------------------------------------------------------
    const gl = this.renderer;
    const mu = this.march.uniforms;
    mu.uRes.value.set(this.rtScene.width, this.rtScene.height);
    mu.uMirror.value = 0;
    gl.setRenderTarget(this.rtScene);
    gl.render(this.marchScene, this.quadCam);

    mu.uRes.value.set(this.rtMirror.width, this.rtMirror.height);
    mu.uMirror.value = 1;
    gl.setRenderTarget(this.rtMirror);
    gl.render(this.marchScene, this.quadCam);

    gl.setRenderTarget(null);
    gl.render(this.compScene, this.quadCam);
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    // The --hero-* hooks are set on the hero section; read them from there.
    const scope = (document.querySelector('.hero') as HTMLElement | null) ?? document.body;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');

    let engine: HeroEngine;
    try {
      engine = new HeroEngine(canvas);
    } catch {
      return; // No WebGL: the CSS panel underneath stays as the hero.
    }
    engine.reducedMotion = mq.matches;
    engine.setPalette(readPalette(scope));

    // Dev-only frame meter: localStorage.swPerf = '1' to show it.
    let meter: HTMLDivElement | null = null;
    if (import.meta.env.DEV) {
      let on = false;
      try {
        on = localStorage.getItem('swPerf') === '1';
      } catch {
        /* storage blocked */
      }
      if (on) {
        meter = document.createElement('div');
        meter.className = 'hero-scene__meter';
        wrap.appendChild(meter);
        engine.onStats = (s) => {
          if (!meter) return;
          meter.textContent = s.running
            ? `${s.ms.toFixed(1)} ms · ${s.fps.toFixed(0)} fps · tier ${s.tier}${s.low ? ' · low' : ''}${s.throttled ? ' · idle' : ''}`
            : `paused · tier ${s.tier}`;
        };
      }
    }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      engine.resize(width, height);
    });
    ro.observe(wrap);
    engine.resize(wrap.clientWidth, wrap.clientHeight);

    // Render only while the panel can be seen: on screen, in a visible tab.
    // Below about half visible it also drops to the lowest tier — the panel is
    // sliding out under the headline and nobody is reading detail off it.
    let onScreen = true;
    const sync = () => engine.setActive(onScreen && document.visibilityState === 'visible');
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting && entry.intersectionRatio > 0.02;
        engine.setVisibility(entry.intersectionRatio);
        sync();
      },
      { threshold: [0, 0.03, 0.45, 0.55, 1] }
    );
    io.observe(wrap);
    document.addEventListener('visibilitychange', sync);
    sync();

    // Follow the theme toggle: only the class on <html> matters, and only when
    // it actually flips light/dark. Anything else written to <html> (the nav
    // publishing its height, scroll locks) must not cost a palette read.
    let dark = document.documentElement.classList.contains('dark');
    const observer = new MutationObserver(() => {
      const next = document.documentElement.classList.contains('dark');
      if (next === dark) return;
      dark = next;
      engine.setPalette(readPalette(scope));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const onMotion = () => {
      engine.reducedMotion = mq.matches;
      engine.setActive(false);
      sync();
    };
    mq.addEventListener('change', onMotion);

    // Fade in over the CSS panel once the first frames are up.
    const id = window.setTimeout(() => wrap.classList.add('is-ready'), 250);

    return () => {
      window.clearTimeout(id);
      mq.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', sync);
      observer.disconnect();
      io.disconnect();
      ro.disconnect();
      meter?.remove();
      engine.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} className="hero-scene">
      <canvas ref={canvasRef} />
      <style>{`
        .hero-scene { position: absolute; inset: 0; opacity: 0; transition: opacity 1.4s cubic-bezier(0.2, 0.6, 0.2, 1); }
        .hero-scene.is-ready { opacity: 1; }
        .hero-scene canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .hero-scene__meter { position: absolute; top: 12px; left: 12px; z-index: 2; padding: 4px 8px; border-radius: 6px; font: 500 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #fff; background: rgb(12 16 22 / 0.7); pointer-events: none; white-space: nowrap; }
      `}</style>
    </div>
  );
}
