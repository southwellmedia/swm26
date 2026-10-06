/**
 * Footer rest — the sculpture, surfacing at the end of the page.
 *
 * The droplets from the hero's "Clarity in Chaos" come back one last time:
 * a large cluster, centred, rising out of the very bottom of the page and
 * never fully in. They orbit, collide and merge on their own, slowly; bring
 * the cursor near and they lean toward it and gather, like the hero's chaos
 * reaching for you.
 *
 * The material is the ink the hero resolves into — wet, glossy, a shade off
 * the slab — lit by the reel's three softboxes in a room gone dark and cool
 * (see droplet-scene.ts for the lights). On ink, the reflections are all
 * that draw the form: a warm key, a cool rim, an ice sheen across the top.
 * The canvas is transparent: only the sculpture is ever painted, and the
 * slab shows through around it. There is no floor and nothing casts a
 * shadow — the form is cut by the bottom edge of the page, which is the
 * whole idea.
 *
 * One raymarch pass over a strip a few hundred pixels tall, a tight loop
 * over a handful of spheres — a fraction of the hero's cost. Raw WebGL, like
 * the menu edge, so it pulls no library into pages that never load one.
 * Runs only while the footer is on screen: 60 fps with a live cursor, 30 fps
 * on its own, one frame and done under reduced motion.
 */

const NBLOB = 8;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform vec3  uRo, uFw, uRt, uUp;
uniform vec4  uBlobs[${NBLOB}];   // xyz centre, w radius
uniform float uTint[${NBLOB}];    // 0 ink … 1 chrome
uniform float uK;                 // how readily they merge
uniform vec3  uKey;               // key light direction, unit
uniform vec3  uInk, uMid, uSilver, uBg, uBg2, uWarm, uCool; // linear

#define FOCAL 1.9
#define STEPS 56

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

// The studio after hours, seen in reflections: the same three softboxes the
// reel lights with, but the room around them has gone dark and cool. The
// form is ink, so the reflections are all that draw it — a warm key, a cool
// rim, a faint ice sheen across the top.
vec3 env(vec3 r) {
  vec3 col = mix(uInk * 0.4, uCool * 0.3, smoothstep(-0.3, 1.0, r.y));
  col += softbox(r, uKey, vec2(0.7, 0.24), 0.35) * 1.3 * uWarm;
  col += softbox(r, normalize(vec3(0.9, 0.3, -0.25)), vec2(0.14, 0.85), 0.2) * 0.9 * uCool;
  col += softbox(r, normalize(vec3(0.0, -0.1, 1.0)), vec2(1.1, 0.4), 0.4) * 0.16;
  return col;
}

// Ink, lifted off the slab so the silhouette reads but keeping the ink's own
// hue — scaled, not mixed toward the neutral greys, which is what turned it
// grey. The ramp runs only a little way lighter: the same liquid the hero
// resolves into, not the chrome it starts as.
vec3 dropletColor(float t) {
  return uInk * mix(7.0, 11.0, t);
}

// Filmic roll-off and sRGB encode, as the hero does it.
vec3 finish(vec3 col) {
  col = clamp((col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14), 0.0, 1.0);
  return pow(col, vec3(1.0 / 2.2));
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < ${NBLOB}; i++) {
    vec4 bl = uBlobs[i];
    d = smin(d, length(p - bl.xyz) - bl.w, uK);
  }
  return d;
}

float tintAt(vec3 p) {
  float wsum = 0.0, tsum = 0.0;
  for (int i = 0; i < ${NBLOB}; i++) {
    vec4 bl = uBlobs[i];
    float di = length(p - bl.xyz) - bl.w;
    float w = exp(-9.0 * max(di, 0.0));
    wsum += w; tsum += w * uTint[i];
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

float ambientOcclusion(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 4; i++) {
    float h = 0.05 + 0.18 * float(i);
    occ += (h - map(p + n * h)) * sca;
    sca *= 0.7;
  }
  return clamp(1.0 - 1.4 * occ, 0.0, 1.0);
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float tint) {
  vec3 v = -rd;
  vec3 r = reflect(rd, n);
  vec3 L = uKey;
  float ao = ambientOcclusion(p, n);
  float ndl = max(dot(n, L), 0.0);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 albedo = dropletColor(tint);
  // Wet ink: a dark body under a clear gloss. Head-on it reflects little
  // (f0 of a dielectric), at the rim nearly everything — so the edges glow
  // with the cool dome and the key reads as one soft bright shape.
  vec3 diffuse = albedo * (0.35 + 0.65 * ndl) * ao;
  vec3 spec = env(r) * ao * mix(0.08, 1.0, fres);
  vec3 h = normalize(L + v);
  spec += pow(max(dot(n, h), 0.0), 120.0) * 0.5 * uWarm;
  return diffuse + spec;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = uRo;
  vec3 rd = normalize(uFw * FOCAL + uRt * uv.x + uUp * uv.y);
  float px = 1.0 / (uRes.y * FOCAL);

  float t = 0.0, d = 0.0, minD = 1e5, tMin = 0.0;
  bool hit = false;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * t;
    d = map(p);
    float m = d / max(t * px, 1e-4);
    if (m < minD) { minD = m; tMin = t; }
    if (d < 0.0008 * t) { hit = true; break; }
    t += d * 0.9;
    if (t > 16.0) break;
  }
  // Coverage: a hit is solid; a near miss fades over about a pixel, which
  // is the whole of the anti-aliasing and all it needs.
  float cover = hit ? 1.0 : 1.0 - smoothstep(0.0, 1.0, minD);
  if (cover <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float ts = hit ? t : tMin;
  vec3 p = ro + rd * ts;
  vec3 n = calcNormal(p, 0.002 + 0.0015 * ts);
  vec3 col = finish(shade(p, n, rd, tintAt(p)));
  gl_FragColor = vec4(col * cover, cover);
}
`;

export interface FooterRestOptions {
  canvas: HTMLCanvasElement;
  /** Where to read the --hero-* palette hooks from: the hero's own section
   *  when the page has one, else the body. Never the ink slab — its tokens
   *  are inverted. */
  paletteScope?: HTMLElement | null;
}

export interface FooterRest {
  start(): void;
  stop(): void;
  destroy(): void;
  /** Draw one frame now (reduced motion, or the first paint). */
  renderOnce(): void;
  /** Cursor in viewport px, or null when it has left. */
  setPointer(x: number | null, y: number | null): void;
  readonly supported: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));

type RGB = [number, number, number];

function parseColor(css: string): RGB | null {
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
}

/** A CSS colour expression, resolved in `scope`, as 0…1 sRGB. The theme's
 *  tokens are oklch, which a computed style hands back as-is; a 2D canvas
 *  turns whatever the browser resolved into bytes. */
function readColor(scope: HTMLElement, expr: string, fallback: string): RGB {
  const probe = document.createElement('span');
  probe.style.color = expr;
  scope.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return toBytes(resolved) ?? toBytes(fallback) ?? [0.5, 0.5, 0.5];
}

let swatch: CanvasRenderingContext2D | null | undefined;
function toBytes(css: string): RGB | null {
  if (swatch === undefined) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    swatch = c.getContext('2d', { willReadFrequently: true });
  }
  if (!swatch) return parseColor(css);
  swatch.fillStyle = '#000';
  swatch.fillStyle = css;
  swatch.fillRect(0, 0, 1, 1);
  const d = swatch.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}

const toLinear = (c: RGB): RGB => [c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2];

const normalize = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// --- the cluster -------------------------------------------------------------
// World units, at a fixed number of pixels each, so the form is the same
// size whatever the canvas is: the canvas covers the whole footer, and the
// cluster's heart sits just below its bottom edge, so the form is always
// cut by the end of the page and by nothing else.

/** Pixels per world unit: a seventh of the width, within reason. */
const pxPerUnit = (width: number) => clamp(width / 7, 90, 210);
/** How far the heart sits above the bottom edge. */
const HEART_LIFT = 0.075;
/** Sideways stretch on every orbit and resting pose: the form is a wide,
 *  low mound the width of the shell, not a heap. */
const SPREAD = 1.6;
/** The shader's focal length; with it, a camera FRAME_H × FOCAL back frames
 *  exactly FRAME_H world units across the canvas height. */
const FOCAL = 1.9;

interface Blob {
  r: number;
  tint: number;
  /** Orbit amplitudes and rates, per axis. */
  ax: number;
  ay: number;
  az: number;
  wx: number;
  wy: number;
  wz: number;
  /** Phase offsets, so nothing moves in step. */
  px: number;
  py: number;
  pz: number;
  /** Where it rests when gathered, relative to the heart. */
  hx: number;
  hy: number;
  hz: number;
}

// The heart is chrome: on ink, ink droplets vanish, so the big central mass
// is the bright one and the graphite and the odd ink stray play around it.
// prettier-ignore
const BLOBS: Blob[] = [
  { r: 1.25, tint: 1.0,  ax: 0.35, ay: 0.18, az: 0.25, wx: 0.18, wy: 0.14, wz: 0.21, px: 0.0, py: 1.1, pz: 2.3, hx: 0.0,  hy: 0.0,  hz: 0.0 },
  { r: 0.85, tint: 0.6,  ax: 1.1,  ay: 0.45, az: 0.6,  wx: 0.22, wy: 0.27, wz: 0.19, px: 2.1, py: 0.4, pz: 3.9, hx: -1.0, hy: 0.35, hz: 0.2 },
  { r: 0.8,  tint: 0.9,  ax: 1.2,  ay: 0.5,  az: 0.5,  wx: 0.19, wy: 0.24, wz: 0.26, px: 4.2, py: 2.6, pz: 0.8, hx: 1.05, hy: 0.45, hz: -0.1 },
  { r: 0.6,  tint: 0.45, ax: 1.5,  ay: 0.7,  az: 0.7,  wx: 0.27, wy: 0.21, wz: 0.18, px: 1.3, py: 3.7, pz: 5.1, hx: 0.35, hy: 1.1,  hz: 0.3 },
  { r: 0.52, tint: 1.0,  ax: 1.7,  ay: 0.7,  az: 0.8,  wx: 0.24, wy: 0.3,  wz: 0.22, px: 5.5, py: 1.9, pz: 2.9, hx: -1.4, hy: 0.95, hz: -0.4 },
  { r: 0.42, tint: 0.7,  ax: 1.9,  ay: 0.75, az: 0.9,  wx: 0.3,  wy: 0.19, wz: 0.29, px: 3.3, py: 5.2, pz: 1.6, hx: 1.7,  hy: 1.05, hz: 0.5 },
  { r: 0.32, tint: 1.0,  ax: 2.1,  ay: 0.85, az: 1.0,  wx: 0.34, wy: 0.26, wz: 0.24, px: 0.7, py: 4.4, pz: 3.4, hx: -0.5, hy: 1.4,  hz: 0.6 },
  { r: 0.25, tint: 0.3,  ax: 2.3,  ay: 0.9,  az: 1.1,  wx: 0.26, wy: 0.34, wz: 0.3,  px: 2.8, py: 0.9, pz: 4.7, hx: 0.95, hy: 1.5,  hz: -0.5 },
];

export function createFooterRest(options: FooterRestOptions): FooterRest {
  const { canvas } = options;
  const scope = options.paletteScope ?? document.body;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  });
  const unsupported: FooterRest = {
    start() {},
    stop() {},
    destroy() {},
    renderOnce() {},
    setPointer() {},
    supported: false,
  };
  if (!gl) return unsupported;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[footer-rest]', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return unsupported;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[footer-rest]', gl.getProgramInfoLog(program));
    return unsupported;
  }
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u('uRes');
  const uRo = u('uRo');
  const uFw = u('uFw');
  const uRt = u('uRt');
  const uUp = u('uUp');
  const uBlobs = u('uBlobs');
  const uTint = u('uTint');
  const uK = u('uK');
  const uKey = u('uKey');
  const blobData = new Float32Array(NBLOB * 4);
  const tintData = new Float32Array(NBLOB);
  for (let i = 0; i < NBLOB; i++) tintData[i] = BLOBS[i].tint;

  // --- state -----------------------------------------------------------------
  let width = 0;
  let height = 0;
  let dpr = 1;
  // The frame, in world units: how tall the canvas is, and where the heart
  // sits so that it is HEART_LIFT above the bottom edge.
  let frameH = 2;
  let heartY = -1;
  let raf = 0;
  let running = false;
  let lastTime = 0;
  let time = 0;
  let frameToggle = false;
  const pointer = { x: 0.5, y: 0.5, active: false, movedAt: 0 };
  // Smoothed: how gathered the form is, where it leans, where the lamp is.
  let gather = 0;
  let leanX = 0;
  let leanY = 0;
  let lampX = -0.55;
  let lampY = 0.8;

  const measure = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    frameH = height / pxPerUnit(width);
    heartY = -frameH / 2 + HEART_LIFT;
  };

  const readColors = () => {
    const set = (name: string, c: RGB) => gl.uniform3f(u(name), c[0], c[1], c[2]);
    set('uInk', toLinear(readColor(scope, 'var(--hero-ink, var(--color-foreground))', '#0c1016')));
    set('uMid', toLinear(readColor(scope, 'var(--hero-mid, var(--gray-500))', '#7a7f86')));
    set('uSilver', toLinear(readColor(scope, 'var(--hero-chrome, var(--gray-200))', '#e2e5e8')));
    set('uBg', toLinear(readColor(scope, 'var(--color-background-secondary)', '#e6ebef')));
    set('uBg2', toLinear(readColor(scope, 'var(--color-background-tertiary)', '#d9dfe4')));
    set('uWarm', toLinear(readColor(scope, 'var(--hero-warm, #ffffff)', '#ffffff')));
    set('uCool', toLinear(readColor(scope, 'var(--hero-cool, #f4f7fa)', '#f4f7fa')));
  };

  // Straight on, level with the canvas's centre, far enough back that the
  // canvas is frameH world units tall.
  const setCamera = () => {
    const ro: [number, number, number] = [0, 0, frameH * FOCAL];
    gl.uniform3f(uRo, ro[0], ro[1], ro[2]);
    gl.uniform3f(uFw, 0, 0, -1);
    gl.uniform3f(uRt, 1, 0, 0);
    gl.uniform3f(uUp, 0, 1, 0);
  };

  const step = (dt: number) => {
    const now = performance.now();
    const live = pointer.active && now - pointer.movedAt < 3000;

    // Gather toward the cursor's side; scatter back when it has gone.
    const near = live ? 1 - clamp(Math.abs(pointer.y - 0.5) * 1.2, 0, 1) : 0;
    gather = damp(gather, near * 0.8, 2.2, dt);
    leanX = damp(leanX, live ? (pointer.x - 0.5) * 2.4 : 0, 2.5, dt);
    leanY = damp(leanY, live ? (0.5 - pointer.y) * 0.5 : 0, 2.5, dt);

    // The lamp: toward the cursor while it is here, on a slow orbit otherwise.
    const tx = live ? -0.55 + (pointer.x - 0.5) * 1.6 : -0.55 + 0.4 * Math.sin(time * 0.19);
    const ty = live ? 0.8 - (pointer.y - 0.5) * 0.4 : 0.8 + 0.1 * Math.sin(time * 0.27 + 1.2);
    lampX = damp(lampX, tx, 3, dt);
    lampY = damp(lampY, clamp(ty, 0.45, 1.1), 3, dt);

    // Blob positions: a free orbit, pulled toward the gathered pose. The
    // orbits are re-centred on their mass each frame, so however the sines
    // line up the form stays put in the middle of the strip and only leans
    // where the cursor asks it to.
    let cx = 0;
    let mass = 0;
    for (let i = 0; i < NBLOB; i++) {
      const b = BLOBS[i];
      const w = b.r * b.r;
      cx += w * Math.sin(time * b.wx + b.px) * b.ax * SPREAD;
      mass += w;
    }
    cx /= mass;
    for (let i = 0; i < NBLOB; i++) {
      const b = BLOBS[i];
      const ox = b.ax * SPREAD * Math.sin(time * b.wx + b.px) - cx;
      const oy = b.ay * Math.sin(time * b.wy + b.py);
      const oz = b.az * Math.sin(time * b.wz + b.pz);
      const x = lerp(ox, b.hx * SPREAD, gather) + leanX * (0.4 + 0.6 * (i / NBLOB));
      const y = heartY + lerp(oy, b.hy, gather) + leanY * (0.4 + 0.6 * (i / NBLOB));
      const z = lerp(oz, b.hz, gather);
      blobData[i * 4] = x;
      blobData[i * 4 + 1] = y;
      blobData[i * 4 + 2] = z;
      blobData[i * 4 + 3] = b.r;
    }
  };

  const draw = () => {
    setCamera();
    gl.uniform4fv(uBlobs, blobData);
    gl.uniform1fv(uTint, tintData);
    gl.uniform1f(uK, lerp(0.85, 1.15, gather));
    const key = normalize([lampX, lampY, 0.4]);
    gl.uniform3f(uKey, key[0], key[1], key[2]);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const frame = (now: number) => {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;
    time += dt;
    step(dt);
    // Half rate while nothing is asking for more.
    frameToggle = !frameToggle;
    const live = pointer.active && now - pointer.movedAt < 3000;
    if (live || frameToggle) draw();
    raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(() => {
    measure();
    draw();
  });

  return {
    supported: true,
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      measure();
      readColors();
      ro.observe(canvas);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
    },
    renderOnce() {
      measure();
      readColors();
      time += 1 / 60;
      step(1 / 60);
      draw();
    },
    destroy() {
      this.stop();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    },
    setPointer(x, y) {
      if (x === null || y === null) {
        pointer.active = false;
        return;
      }
      const rect = canvas.getBoundingClientRect();
      pointer.x = clamp((x - rect.left) / Math.max(1, rect.width), -0.5, 1.5);
      pointer.y = clamp((y - rect.top) / Math.max(1, rect.height), -1.5, 2.5);
      pointer.active = true;
      pointer.movedAt = performance.now();
    },
  };
}
