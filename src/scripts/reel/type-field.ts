/**
 * Type field — a heading whose letters give way to the ball.
 *
 * The heading's text is split into per-glyph inline-blocks (words kept
 * whole, so nothing re-wraps) and each glyph gets a damped spring toward
 * a target the ball sets every frame:
 *
 *   sag      the line is a rope. Under the ball the glyphs dip in a bell
 *            around its x, tilt away from it, and spread a little — hard on
 *            impact, slight while the ball rests on the baseline.
 *   push     the ball is solid. Any glyph it overlaps is shoved radially
 *            out of its way and rotated off its feet, so the word parts
 *            around it as it passes and closes behind it.
 *
 * The targets are pure functions of where the ball is, so the whole thing
 * plays backwards with the scroll; the springs only add the twang. Rest
 * positions are layout offsets relative to the heading, which ignore
 * transforms, so a heading still rising out of its reveal mask measures
 * where it will be; the heading's own origin is read live each frame, so a
 * heading inside a sticky stage or a translated block is found where it is.
 *
 * Accessibility: the heading gets its text as aria-label and the split
 * markup is aria-hidden, so it is read as one word, not spelled.
 */

export interface TypeFieldOptions {
  /** A clipping ancestor (a reveal mask) to open the first time a glyph
   *  needs to leave it. Left alone if the heading is still inside its
   *  entrance, so the reveal keeps its edge. */
  mask?: HTMLElement | null;
  /** Element to set aria-label on; defaults to the root. */
  labelled?: HTMLElement | null;
}

export interface FieldBall {
  /** Centre in document px, and radius. */
  x: number;
  y: number;
  r: number;
  /** Rope strengths, 0…1: a hard landing and a resting weight. */
  impact: number;
  sag: number;
  /** Shove strength, 0…1. */
  push: number;
}

export interface TypeField {
  /** Advance the springs by dt seconds toward what `ball` asks; null lets
   *  the letters settle back. */
  update(dt: number, ball: FieldBall | null): void;
  /** Whether any glyph is off its rest position. */
  readonly moving: boolean;
  destroy(): void;
}

const STYLE_ID = 'sw-type-field';
const K = 260; // spring stiffness
const C = 20; // damping — under-critical, for the twang
const RAD = Math.PI / 180;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.tf__w{display:inline-block;white-space:nowrap}.tf__g{display:inline-block}`;
  document.head.appendChild(style);
}

/** Split every text node under `root` into word and glyph spans. */
function split(root: HTMLElement): HTMLElement[] {
  const glyphs: HTMLElement[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if ((n as Text).data.trim()) texts.push(n as Text);
  }
  for (const text of texts) {
    const frag = document.createDocumentFragment();
    const parts = text.data.split(/(\s+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(' '));
        continue;
      }
      const word = document.createElement('span');
      word.className = 'tf__w';
      for (const ch of Array.from(part)) {
        const g = document.createElement('span');
        g.className = 'tf__g';
        g.textContent = ch;
        word.appendChild(g);
        glyphs.push(g);
      }
      frag.appendChild(word);
    }
    text.replaceWith(frag);
  }
  return glyphs;
}

export function createTypeField(root: HTMLElement, options: TypeFieldOptions = {}): TypeField {
  ensureStyle();
  const labelled = options.labelled ?? root;
  const label = (root.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (label && !labelled.getAttribute('aria-label')) labelled.setAttribute('aria-label', label);
  for (const child of Array.from(root.children)) child.setAttribute('aria-hidden', 'true');

  const glyphs = split(root);
  const n = glyphs.length;
  // Rest centres relative to the root's border box, and half-widths.
  const cx = new Float32Array(n);
  const cy = new Float32Array(n);
  const hw = new Float32Array(n);
  // The root's origin in document px, read each update.
  let ox = 0;
  let oy = 0;
  // Spring state and targets: x, y (px), rotation (deg).
  const sx = new Float32Array(n);
  const sy = new Float32Array(n);
  const sr = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const vr = new Float32Array(n);
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const tr = new Float32Array(n);
  const written = new Uint8Array(n);
  let moving = false;
  let measured = false;
  let maskOpen = false;

  /** Layout position, transforms ignored, summed up the offsetParent chain. */
  const layoutPos = (el: HTMLElement) => {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = el;
    while (node) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return { x, y };
  };
  const measure = () => {
    const origin = layoutPos(root);
    for (let i = 0; i < n; i++) {
      const p = layoutPos(glyphs[i]);
      const w = glyphs[i].offsetWidth;
      cx[i] = p.x - origin.x + w / 2;
      cy[i] = p.y - origin.y + glyphs[i].offsetHeight / 2;
      hw[i] = w / 2;
    }
    measured = n > 0;
  };
  const ro = new ResizeObserver(() => {
    measured = false;
  });
  ro.observe(root);
  void document.fonts?.ready.then(() => {
    measured = false;
  });

  /** Open the reveal mask once the heading is sat where layout puts it. */
  const openMask = () => {
    const mask = options.mask;
    if (maskOpen || !mask) return;
    const first = glyphs[0];
    if (!first) return;
    const rect = first.getBoundingClientRect();
    const restTop = oy + cy[0] - first.offsetHeight / 2 - window.scrollY;
    if (Math.abs(rect.top - restTop) > 1) return; // still rising into place
    mask.style.overflow = 'visible';
    maskOpen = true;
  };

  const update = (dt: number, ball: FieldBall | null) => {
    if (n === 0) return;
    if (!measured) measure();
    const step = Math.min(dt, 1 / 30);
    const rootRect = root.getBoundingClientRect();
    ox = rootRect.left;
    oy = rootRect.top + window.scrollY;

    tx.fill(0);
    ty.fill(0);
    tr.fill(0);
    if (ball) {
      const { x: bx, y: by, r, impact, sag, push } = ball;
      const rope = impact > 0.001 || sag > 0.001;
      const sigma = Math.max(2.2 * r, 40);
      for (let i = 0; i < n; i++) {
        const dx = ox + cx[i] - bx;
        const dy = oy + cy[i] - by;
        if (rope) {
          const q = dx / sigma;
          const g = Math.exp(-q * q);
          const gd = q * g * 2.4; // derivative shape, peaks at ±0.7σ
          ty[i] += (impact * 12 + sag * 5) * g;
          tx[i] += (impact * 10 + sag * 3) * gd;
          tr[i] += (impact * 8 + sag * 2) * gd;
        }
        if (push > 0.001) {
          const reach = r + hw[i] * 1.1 + 4;
          const dist = Math.hypot(dx, dy);
          const overlap = reach - dist;
          if (overlap > 0) {
            const ux = dist > 1e-3 ? dx / dist : dx >= 0 ? 1 : -1;
            let uy = dist > 1e-3 ? dy / dist : 0;
            if (uy < 0) uy *= 0.5; // letters are heavy: thrown up less than aside
            const k = Math.min(1, overlap / reach);
            tx[i] += ux * overlap * push;
            ty[i] += uy * overlap * push;
            tr[i] += (dx >= 0 ? 1 : -1) * push * k * 22;
          }
        }
      }
      if (push > 0.001 || impact > 0.05) openMask();
    }

    let any = false;
    for (let i = 0; i < n; i++) {
      vx[i] += (K * (tx[i] - sx[i]) - C * vx[i]) * step;
      vy[i] += (K * (ty[i] - sy[i]) - C * vy[i]) * step;
      vr[i] += (K * (tr[i] - sr[i]) - C * vr[i]) * step;
      sx[i] += vx[i] * step;
      sy[i] += vy[i] * step;
      sr[i] += vr[i] * step;
      const still =
        Math.abs(sx[i]) + Math.abs(sy[i]) + Math.abs(sr[i]) < 0.05 &&
        Math.abs(vx[i]) + Math.abs(vy[i]) + Math.abs(vr[i]) < 0.5 &&
        tx[i] === 0 &&
        ty[i] === 0 &&
        tr[i] === 0;
      if (still) {
        if (written[i]) {
          sx[i] = sy[i] = sr[i] = vx[i] = vy[i] = vr[i] = 0;
          glyphs[i].style.transform = '';
          written[i] = 0;
        }
        continue;
      }
      any = true;
      written[i] = 1;
      glyphs[i].style.transform =
        `translate3d(${sx[i].toFixed(2)}px, ${sy[i].toFixed(2)}px, 0) rotate(${(sr[i] * RAD).toFixed(4)}rad)`;
    }
    moving = any;
  };

  return {
    update,
    get moving() {
      return moving;
    },
    destroy() {
      ro.disconnect();
      for (let i = 0; i < n; i++) glyphs[i].style.transform = '';
      if (maskOpen && options.mask) options.mask.style.removeProperty('overflow');
    },
  };
}
