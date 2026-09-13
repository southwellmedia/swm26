/**
 * Menu edge — the ink's liquid underside.
 *
 * The menu is ink poured from the top: a sheet that drops down and settles
 * at about three quarters of the viewport. This draws its bottom edge, in a
 * strip of canvas that overlaps the sheet's last few pixels and hangs below
 * it. The edge is a 2D distance field: the ink fill, smooth-joined with a
 * handful of drips that hang, stretch, let go and fall into the strip of
 * page showing underneath, then form again somewhere else.
 *
 *   hover   the edge swells into a drip under the menu item under the
 *           cursor, and follows it along the list
 *   lean    bring the cursor near the edge and the ink reaches toward it
 *   lift    as the sheet closes, the drips stretch with its motion and snap
 *
 * Raw WebGL, one triangle, one fragment pass over a strip a couple of
 * hundred pixels tall — cheap enough to ignore, and it does not pull three
 * into pages that never load it. The sheet's colour is read off the sheet
 * itself, so the join is exact in either colour scheme.
 *
 * The caller decides whether to run it (reduced motion, no WebGL) and shows
 * the stylesheet's still scalloped edge otherwise.
 */

const MAX_DROPS = 8;
/** Ambient drips, plus one that belongs to the hovered menu item. Few and
 *  slow: the edge should be calm, with one drip letting go now and then. */
const AMBIENT = 4;
const HOVER = AMBIENT; // slot index

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;       // strip size, CSS px
uniform float uDpr;
uniform float uTime;
uniform float uTop;       // the sheet's bottom, in strip px from the top
uniform vec3  uInk;
uniform vec3  uGloss;
uniform vec2  uPointer;   // strip px; x far negative = none
uniform float uLean;
uniform vec4  uDrops[${MAX_DROPS}];  // x, y (centre), r, neck 0…1
uniform int   uCount;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float edgeAt(float x) {
  float e = uTop + 6.0 + 3.0 * sin(x * 0.021 + uTime * 0.7) + 2.0 * sin(x * 0.053 - uTime * 0.45);
  float dx = (x - uPointer.x) / 110.0;
  return e + uLean * 16.0 * exp(-dx * dx);
}

// Negative inside the ink.
float field(vec2 p) {
  float edge = edgeAt(p.x);
  float d = p.y - edge;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uCount) break;
    vec4 dr = uDrops[i];
    if (dr.z <= 0.0) continue;
    float c = length(p - dr.xy) - dr.z;
    if (dr.w > 0.01) {
      // Hanging: a neck runs from the edge down to the drop, thinning as
      // the drop gets ready to let go.
      float neck = sdSegment(p, vec2(dr.x, edge - 4.0), dr.xy) - dr.z * 0.42 * dr.w;
      d = smin(d, min(c, neck), 20.0);
    } else {
      d = smin(d, c, 5.0);
    }
  }
  return d;
}

void main() {
  vec2 p = gl_FragCoord.xy / uDpr;
  p.y = uRes.y - p.y;                 // y down, from the strip's top
  float d = field(p);
  float alpha = 1.0 - smoothstep(-0.8, 0.8, d);
  if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // A wet rim: the underside catches the bright floor below, the crease
  // where a neck meets the sheet sits a touch darker.
  vec2 e = vec2(1.2, 0.0);
  vec2 n = normalize(vec2(field(p + e.xy) - field(p - e.xy), field(p + e.yx) - field(p - e.yx)) + 1e-5);
  float band = 1.0 - smoothstep(-9.0, 0.0, d);   // 1 deep inside … 0 at the edge
  float rim = (1.0 - band) * smoothstep(0.15, 0.95, n.y);
  float crease = (1.0 - band) * smoothstep(0.2, 0.9, -n.y) * step(uTop + 2.0, p.y);
  vec3 col = uInk;
  col = mix(col, uGloss, rim * 0.45);
  col *= 1.0 - crease * 0.35;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

type Drop = {
  x: number;
  y: number;
  r: number;
  rBase: number;
  len: number;
  maxLen: number;
  neck: number;
  vy: number;
  state: 'wait' | 'hang' | 'fall';
  timer: number;
};

export interface MenuEdgeOptions {
  canvas: HTMLCanvasElement;
  /** The sheet whose bottom this edge belongs to; its colour and motion are read off it. */
  sheet: HTMLElement;
  /** How many strip px the canvas overlaps the sheet's bottom. */
  overlap: number;
}

export interface MenuEdge {
  start(): void;
  stop(): void;
  destroy(): void;
  /** Cursor in viewport px, or null when it has left. */
  setPointer(x: number | null, y: number | null): void;
  /** Viewport x of the hovered menu item's centre, or null. */
  setHover(x: number | null): void;
  readonly supported: boolean;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function parseColor(css: string): [number, number, number] {
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) return [0.05, 0.06, 0.09];
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
}

export function createMenuEdge(options: MenuEdgeOptions): MenuEdge {
  const { canvas, sheet, overlap } = options;
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
  });
  const unsupported: MenuEdge = {
    start() {},
    stop() {},
    destroy() {},
    setPointer() {},
    setHover() {},
    supported: false,
  };
  if (!gl) return unsupported;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[menu-edge]', gl.getShaderInfoLog(s));
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
    console.error('[menu-edge]', gl.getProgramInfoLog(program));
    return unsupported;
  }
  gl.useProgram(program);

  // One triangle that covers the clip space.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uRes = u('uRes');
  const uDpr = u('uDpr');
  const uTime = u('uTime');
  const uTop = u('uTop');
  const uInk = u('uInk');
  const uGloss = u('uGloss');
  const uPointer = u('uPointer');
  const uLean = u('uLean');
  const uDrops = u('uDrops');
  const uCount = u('uCount');
  const dropData = new Float32Array(MAX_DROPS * 4);

  // --- state -----------------------------------------------------------------
  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let running = false;
  let lastTime = 0;
  let time = 0;
  let lastBottom = Number.NaN;
  let lift = 0; // px/s the sheet is moving, smoothed; negative = lifting
  const pointer = { x: -1e5, y: -1e5, active: false };
  let hoverX: number | null = null;
  let lean = 0;
  let hoverSlotX = 0;

  const drops: Drop[] = Array.from({ length: AMBIENT + 1 }, () => ({
    x: 0,
    y: 0,
    r: 0,
    rBase: 12,
    len: 0,
    maxLen: 50,
    neck: 1,
    vy: 0,
    state: 'wait' as const,
    timer: rand(0.2, 2.5),
  }));

  const spawn = (d: Drop, immediate = false) => {
    d.x = rand(0.04, 0.96) * width;
    d.rBase = rand(8, 13);
    d.maxLen = rand(30, 54);
    d.len = 0;
    d.r = d.rBase * 0.4;
    d.neck = 1;
    d.vy = 0;
    d.state = immediate ? 'hang' : 'wait';
    d.timer = immediate ? 0 : rand(1.5, 6);
  };

  const measure = () => {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, width, height);
    gl.uniform1f(uDpr, dpr);
    for (const d of drops) if (d.x > width) d.x = rand(0.04, 0.96) * width;
  };

  const readColors = () => {
    const ink = parseColor(getComputedStyle(sheet).backgroundColor);
    gl.uniform3f(uInk, ink[0], ink[1], ink[2]);
    // The rim: a dark sheet catches the lighter page it hangs over; a light
    // sheet shows a shaded underside instead.
    const luma = 0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2];
    if (luma < 0.5) {
      const page = parseColor(getComputedStyle(document.body).backgroundColor);
      gl.uniform3f(
        uGloss,
        ink[0] * 0.55 + page[0] * 0.45,
        ink[1] * 0.55 + page[1] * 0.45,
        ink[2] * 0.55 + page[2] * 0.45
      );
    } else {
      gl.uniform3f(uGloss, ink[0] * 0.78, ink[1] * 0.79, ink[2] * 0.81);
    }
  };

  const edgeY = () => overlap + 6;

  const step = (dt: number) => {
    // The sheet's motion: lifting stretches every drip downward.
    const bottom = sheet.getBoundingClientRect().bottom;
    const v = Number.isNaN(lastBottom) ? 0 : (bottom - lastBottom) / Math.max(dt, 1e-3);
    lastBottom = bottom;
    lift = damp(lift, v, 14, dt);
    const stretch = 1 + clamp(-lift / 1400, 0, 1.2);

    // Cursor lean: only when the cursor is within reach of the edge.
    const near = pointer.active ? 1 - clamp(Math.abs(pointer.y - edgeY()) / 140, 0, 1) : 0;
    lean = damp(lean, near, 8, dt);

    for (let i = 0; i < AMBIENT; i++) {
      const d = drops[i];
      if (d.state === 'wait') {
        d.timer -= dt;
        if (d.timer <= 0) spawn(d, true);
        d.r = 0;
        continue;
      }
      if (d.state === 'hang') {
        d.len = damp(d.len, d.maxLen * 1.04, 0.38, dt);
        const t = clamp(d.len / d.maxLen, 0, 1);
        d.r = d.rBase * (0.45 + 0.55 * t);
        d.neck = 1 - 0.7 * t * t;
        d.y = edgeY() + d.len * stretch;
        // Never let go while the sheet is lifting: a drip that fell then
        // would be left over the page after the menu had gone.
        if (t > 0.985 && lift > -60) {
          d.state = 'fall';
          d.vy = 40;
        }
        continue;
      }
      // Falling.
      d.neck = damp(d.neck, 0, 18, dt);
      d.vy += 1500 * dt;
      d.y += d.vy * dt;
      d.r = damp(d.r, d.rBase * 0.85, 4, dt);
      if (d.y - d.r > height) spawn(d);
    }

    // The hover drip: under the item, following the cursor along the list.
    const h = drops[HOVER];
    if (hoverX !== null) {
      hoverSlotX = h.r > 0 ? damp(hoverSlotX, hoverX, 10, dt) : hoverX;
      h.len = damp(h.len, 30, 6, dt);
    } else {
      h.len = damp(h.len, 0, 7, dt);
    }
    h.x = hoverSlotX;
    h.r = h.len > 0.5 ? 12 + 8 * clamp(h.len / 30, 0, 1) : 0;
    h.neck = 1;
    h.y = edgeY() + h.len * stretch;
  };

  const draw = () => {
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      dropData[i * 4] = d.x;
      dropData[i * 4 + 1] = d.y;
      dropData[i * 4 + 2] = d.r;
      dropData[i * 4 + 3] = d.neck;
    }
    gl.uniform4fv(uDrops, dropData);
    gl.uniform1i(uCount, drops.length);
    gl.uniform1f(uTime, time);
    gl.uniform1f(uTop, overlap);
    gl.uniform2f(uPointer, pointer.active ? pointer.x : -1e5, pointer.active ? pointer.y : -1e5);
    gl.uniform1f(uLean, lean);
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
    draw();
    raf = requestAnimationFrame(frame);
  };

  const ro = new ResizeObserver(() => {
    measure();
    if (running) draw();
  });

  const toStrip = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  };

  return {
    supported: true,
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      lastBottom = Number.NaN;
      measure();
      readColors();
      ro.observe(canvas);
      for (const d of drops) if (d.state === 'wait' && d.timer > 2) d.timer = rand(0.1, 1.5);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
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
      const p = toStrip(x, y);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.active = true;
    },
    setHover(x) {
      if (x === null) {
        hoverX = null;
        return;
      }
      hoverX = toStrip(x, 0).x;
    },
  };
}
