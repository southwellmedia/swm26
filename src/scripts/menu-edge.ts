/**
 * Menu edge — the sheet's liquid underside.
 *
 * The menu is a sheet poured from the top. This draws its bottom edge, in a
 * strip of canvas that overlaps the sheet's last few pixels and hangs below
 * it: a liquid surface, not a line. Three things shape it:
 *
 *   waves   slow, broad swells that never stop — the sheet is liquid at rest
 *   mound   the surface rises toward the cursor when it comes near the edge,
 *           and a stroke along the edge sends ripples out both ways
 *   swell   a wide, gentle rise under the menu item under the cursor, so the
 *           edge points at what you are about to choose
 *
 * As the sheet lifts away the swells stretch with its motion.
 *
 * Raw WebGL, one triangle, one fragment pass over a strip a hundred and
 * some pixels tall — cheap enough to ignore, and it pulls no library into
 * pages that never load one. The sheet's colour is read off the sheet, so
 * the join is exact in either scheme; a dark sheet catches the lighter page
 * along its rim, a light sheet shows a shaded underside.
 *
 * The caller decides whether to run it (reduced motion, no WebGL) and shows
 * the stylesheet's still scalloped edge otherwise.
 */

const MAX_RIPPLES = 6;

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
uniform float uStretch;   // swells scale with the sheet's motion
uniform vec3  uInk;
uniform vec3  uGloss;
uniform vec3  uMound;     // x, height px, width px
uniform vec3  uSwell;     // x, height px, width px
uniform vec3  uRipples[${MAX_RIPPLES}];  // x, age s, amplitude px

float edgeAt(float x) {
  // Broad slow swells at three scales, none in step with another.
  float e = uTop + 14.0;
  e += 9.0 * sin(x * 0.0071 + uTime * 0.55);
  e += 6.0 * sin(x * 0.0138 - uTime * 0.38 + 1.7);
  e += 3.0 * sin(x * 0.031 + uTime * 0.9 + 0.6);
  e = uTop + (e - uTop) * uStretch;

  // The cursor's mound and the hovered item's swell: soft bells.
  float dm = (x - uMound.x) / max(uMound.z, 1.0);
  e += uMound.y * exp(-dm * dm);
  float ds = (x - uSwell.x) / max(uSwell.z, 1.0);
  e += uSwell.y * exp(-ds * ds);

  // Ripples: a pair of crests running out from where the cursor stroked,
  // fading as they go.
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec3 r = uRipples[i];
    if (r.z <= 0.0) continue;
    float run = r.y * 260.0;
    float d = abs(x - r.x) - run;
    float crest = exp(-d * d / (55.0 * 55.0));
    e += r.z * exp(-r.y * 1.9) * crest * cos(d * 0.045);
  }
  return e;
}

void main() {
  vec2 p = gl_FragCoord.xy / uDpr;
  p.y = uRes.y - p.y;                 // y down, from the strip's top
  float edge = edgeAt(p.x);
  float d = p.y - edge;               // negative inside the ink
  float alpha = 1.0 - smoothstep(-0.8, 0.8, d);
  if (alpha <= 0.0) { gl_FragColor = vec4(0.0); return; }

  // The surface's slope, for a rim that reads as a lit, wet curve rather
  // than a flat cut-out: where the edge faces down it catches the light.
  float slope = (edgeAt(p.x + 1.5) - edgeAt(p.x - 1.5)) / 3.0;
  float facing = 1.0 / sqrt(1.0 + slope * slope);     // 1 flat, less on steep flanks
  float band = 1.0 - smoothstep(-7.0, 0.0, d);       // 1 deep inside … 0 at the edge
  float rim = (1.0 - band) * facing;
  vec3 col = mix(uInk, uGloss, rim * 0.5);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

export interface MenuEdgeOptions {
  canvas: HTMLCanvasElement;
  /** The sheet whose bottom this edge belongs to; its motion is read off it. */
  sheet: HTMLElement;
  /** The element carrying the sheet's colour, when the sheet itself is
   *  transparent (its fill layer). Defaults to the sheet. */
  paint?: HTMLElement | null;
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

function parseColor(css: string): [number, number, number] {
  const m = css.match(/[\d.]+/g);
  if (!m || m.length < 3) return [0.05, 0.06, 0.09];
  return [Number(m[0]) / 255, Number(m[1]) / 255, Number(m[2]) / 255];
}

export function createMenuEdge(options: MenuEdgeOptions): MenuEdge {
  const { canvas, sheet, overlap } = options;
  const paint = options.paint ?? sheet;
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
  const uStretch = u('uStretch');
  const uInk = u('uInk');
  const uGloss = u('uGloss');
  const uMound = u('uMound');
  const uSwell = u('uSwell');
  const uRipples = u('uRipples');
  const rippleData = new Float32Array(MAX_RIPPLES * 3);

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
  const pointer = { x: 0, y: 0, active: false, lastX: 0, lastY: 0 };
  let hoverX: number | null = null;
  const mound = { x: 0, h: 0, w: 120 };
  const swell = { x: 0, h: 0, w: 150 };
  const ripples = Array.from({ length: MAX_RIPPLES }, () => ({ x: 0, age: 0, amp: 0 }));
  let rippleNext = 0;
  let strokeX = Number.NaN;

  const edgeY = () => overlap + 14;

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
  };

  const readColors = () => {
    const ink = parseColor(getComputedStyle(paint).backgroundColor);
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
      gl.uniform3f(uGloss, ink[0] * 0.8, ink[1] * 0.81, ink[2] * 0.83);
    }
  };

  const ripple = (x: number, amp: number) => {
    const r = ripples[rippleNext];
    rippleNext = (rippleNext + 1) % MAX_RIPPLES;
    r.x = x;
    r.age = 0;
    r.amp = amp;
  };

  const step = (dt: number) => {
    // The sheet's motion: lifting stretches the swells downward.
    const bottom = sheet.getBoundingClientRect().bottom;
    const v = Number.isNaN(lastBottom) ? 0 : (bottom - lastBottom) / Math.max(dt, 1e-3);
    lastBottom = bottom;
    lift = damp(lift, v, 14, dt);
    const stretch = 1 + clamp(-lift / 1600, 0, 1);

    // The mound rises toward a cursor near the edge, up to 30 px, and
    // follows it along.
    const near = pointer.active ? 1 - clamp(Math.abs(pointer.y - edgeY()) / 170, 0, 1) : 0;
    const target = near * near * 30;
    mound.h = damp(mound.h, target, 9, dt);
    mound.x = mound.h > 0.5 ? damp(mound.x, pointer.x, 12, dt) : pointer.x;

    // A stroke along the edge — the cursor moving while near it — sends
    // ripples out from where it passed, stronger the faster it moves.
    if (pointer.active && near > 0.15) {
      if (Number.isNaN(strokeX)) strokeX = pointer.x;
      const moved = pointer.x - strokeX;
      if (Math.abs(moved) > 48) {
        ripple(pointer.x, clamp(Math.abs(moved) / 6, 5, 14) * near);
        strokeX = pointer.x;
      }
    } else {
      strokeX = Number.NaN;
    }
    for (const r of ripples) {
      if (r.amp <= 0) continue;
      r.age += dt;
      if (r.age > 4) r.amp = 0;
    }

    // The swell under the hovered item.
    if (hoverX !== null) {
      swell.x = swell.h > 0.5 ? damp(swell.x, hoverX, 10, dt) : hoverX;
      swell.h = damp(swell.h, 16, 7, dt);
    } else {
      swell.h = damp(swell.h, 0, 7, dt);
    }

    gl.uniform1f(uStretch, stretch);
  };

  const draw = () => {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = ripples[i];
      rippleData[i * 3] = r.x;
      rippleData[i * 3 + 1] = r.age;
      rippleData[i * 3 + 2] = r.amp;
    }
    gl.uniform3fv(uRipples, rippleData);
    gl.uniform1f(uTime, time);
    gl.uniform1f(uTop, overlap);
    gl.uniform3f(uMound, mound.x, mound.h, mound.w);
    gl.uniform3f(uSwell, swell.x, swell.h, swell.w);
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
