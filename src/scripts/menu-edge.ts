/**
 * Menu edge — the sheet's liquid underside.
 *
 * The menu is a sheet poured from the top. This shapes its bottom edge: a
 * liquid surface, not a line. Three things shape it:
 *
 *   waves   slow, broad swells that never stop — the sheet is liquid at rest
 *   mound   the surface rises toward the cursor when it comes near the edge,
 *           and a stroke along the edge sends ripples out both ways
 *   swell   a wide, gentle rise under the menu item under the cursor, so the
 *           edge points at what you are about to choose
 *
 * As the sheet lifts away the swells stretch with its motion.
 *
 * It is drawn with clip-path, not a canvas. The sheet's colour lives on a
 * fill layer that hangs below the sheet's box; each frame the edge is sampled
 * across the width and written as a polygon clip on that layer, and on a
 * second, gloss-coloured layer behind it whose clip runs a few pixels lower,
 * so a rim shows along the edge. Two flat fills, one clip each — nothing
 * transparent for the compositor to get wrong. (The first version drew the
 * edge on a transparent WebGL strip, and Chrome would sometimes paint the
 * strip's empty half solid once a link's hover transition ended.)
 *
 * The caller decides whether to run it (reduced motion) and shows the
 * stylesheet's still scalloped edge otherwise.
 */

const MAX_RIPPLES = 6;
/** Sample points across the width; the polygon has this many bottom vertices. */
const SAMPLES = 96;
/** Thickness of the gloss rim, px. */
const RIM = 4;

export interface MenuEdgeOptions {
  /** The sheet whose bottom this edge belongs to; its motion is read off it. */
  sheet: HTMLElement;
  /** The layer carrying the sheet's colour, hanging `hang` px below the sheet. */
  fill: HTMLElement;
  /** The layer behind it that shows as the rim. Same box as `fill`. */
  gloss: HTMLElement;
  /** How far `fill` and `gloss` extend below the sheet's box, px. */
  hang: number;
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

const toCss = (c: [number, number, number]) =>
  `rgb(${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)})`;

export function createMenuEdge(options: MenuEdgeOptions): MenuEdge {
  const { sheet, fill, gloss, hang } = options;
  if (!CSS.supports('clip-path', 'polygon(0 0, 1px 0, 0 1px)')) {
    return {
      start() {},
      stop() {},
      destroy() {},
      setPointer() {},
      setHover() {},
      supported: false,
    };
  }

  // --- state -----------------------------------------------------------------
  let width = 0;
  let sheetH = 0;
  let raf = 0;
  let running = false;
  let lastTime = 0;
  let time = 0;
  let lastBottom = Number.NaN;
  let lift = 0; // px/s the sheet is moving, smoothed; negative = lifting
  let stretch = 1;
  const pointer = { x: 0, y: 0, active: false };
  let hoverX: number | null = null;
  const mound = { x: 0, h: 0, w: 120 };
  const swell = { x: 0, h: 0, w: 150 };
  const ripples = Array.from({ length: MAX_RIPPLES }, () => ({ x: 0, age: 0, amp: 0 }));
  let rippleNext = 0;
  let strokeX = Number.NaN;
  const xs = new Float32Array(SAMPLES);
  const ys = new Float32Array(SAMPLES);

  // The edge, in px below the sheet's bottom, at x px from its left. The
  // same surface the WebGL version drew, point for point.
  const edgeAt = (x: number) => {
    let e = 14;
    e += 9 * Math.sin(x * 0.0071 + time * 0.55);
    e += 6 * Math.sin(x * 0.0138 - time * 0.38 + 1.7);
    e += 3 * Math.sin(x * 0.031 + time * 0.9 + 0.6);
    e *= stretch;

    const dm = (x - mound.x) / Math.max(mound.w, 1);
    e += mound.h * Math.exp(-dm * dm);
    const ds = (x - swell.x) / Math.max(swell.w, 1);
    e += swell.h * Math.exp(-ds * ds);

    for (const r of ripples) {
      if (r.amp <= 0) continue;
      const run = r.age * 260;
      const d = Math.abs(x - r.x) - run;
      const crest = Math.exp((-d * d) / (55 * 55));
      e += r.amp * Math.exp(-r.age * 1.9) * crest * Math.cos(d * 0.045);
    }
    return e;
  };

  const measure = () => {
    const rect = sheet.getBoundingClientRect();
    width = Math.max(1, rect.width);
    sheetH = Math.max(1, sheet.offsetHeight);
    for (let i = 0; i < SAMPLES; i++) xs[i] = (i / (SAMPLES - 1)) * width;
  };

  const readColors = () => {
    const ink = parseColor(getComputedStyle(fill).backgroundColor);
    // The rim: a dark sheet catches the lighter page it hangs over; a light
    // sheet shows a shaded underside instead.
    const luma = 0.2126 * ink[0] + 0.7152 * ink[1] + 0.0722 * ink[2];
    if (luma < 0.5) {
      const page = parseColor(getComputedStyle(document.body).backgroundColor);
      gloss.style.backgroundColor = toCss([
        ink[0] * 0.55 + page[0] * 0.45,
        ink[1] * 0.55 + page[1] * 0.45,
        ink[2] * 0.55 + page[2] * 0.45,
      ]);
    } else {
      gloss.style.backgroundColor = toCss([ink[0] * 0.8, ink[1] * 0.81, ink[2] * 0.83]);
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
    stretch = 1 + clamp(-lift / 1600, 0, 1);

    // The mound rises toward a cursor near the edge, up to 30 px, and
    // follows it along. pointer.y is px below the sheet's bottom.
    const near = pointer.active ? 1 - clamp(Math.abs(pointer.y - 14) / 170, 0, 1) : 0;
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
  };

  // Both layers share the sheet's box plus `hang` px below it. The polygon
  // runs along the top, down the right side, back along the edge, and up.
  const polygon = (offset: number) => {
    let s = '0 0, 100% 0';
    for (let i = SAMPLES - 1; i >= 0; i--) {
      s += `, ${xs[i].toFixed(1)}px ${(sheetH + ys[i] + offset).toFixed(1)}px`;
    }
    return `polygon(${s})`;
  };

  const draw = () => {
    for (let i = 0; i < SAMPLES; i++) ys[i] = clamp(edgeAt(xs[i]), -sheetH, hang - RIM);
    gloss.style.clipPath = polygon(RIM);
    fill.style.clipPath = polygon(0);
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

  return {
    supported: true,
    start() {
      if (running) return;
      running = true;
      lastTime = 0;
      lastBottom = Number.NaN;
      measure();
      readColors();
      ro.observe(sheet);
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
      fill.style.clipPath = '';
      gloss.style.clipPath = '';
    },
    setPointer(x, y) {
      if (x === null || y === null) {
        pointer.active = false;
        return;
      }
      const rect = sheet.getBoundingClientRect();
      pointer.x = x - rect.left;
      pointer.y = y - rect.bottom;
      pointer.active = true;
    },
    setHover(x) {
      if (x === null) {
        hoverX = null;
        return;
      }
      hoverX = x - sheet.getBoundingClientRect().left;
    },
  };
}
