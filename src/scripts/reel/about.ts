/**
 * The story inside the reel's open frame.
 *
 * Two concepts share the frame while they are compared: the statement (one
 * sentence, lit word by word) and the
 * lens (the portrait surfacing in the frame's own picture while three
 * statements pass through). The page carries both; ?about=lens or
 * ?about=statement picks one, statement by default.
 *
 * The engine (morph.ts) calls update() every frame with where the pinned
 * hold is; everything here is a pure function of that, so scrolling back
 * plays it backwards. The markup is each concept's finished state: without
 * the engine nothing here runs and that is what shows.
 */

export type AboutConcept = 'statement' | 'lens';

/** Where in the hold the story plays: from just after the frame is fully
 *  open to just before it folds back. Matches the timing given to morph.ts. */
export const TIMING = { open: 0.2, closeStart: 0.84, closeEnd: 0.93, drop: 0.95 };
const STORY_START = 0.23;
const STORY_END = 0.8;

export type AboutTone = 'dark' | 'light';

/** The statement's field: brand ink, or ?tone=light for ink on ice. */
export function pickTone(): AboutTone {
  return new URLSearchParams(location.search).get('tone') === 'light' ? 'light' : 'dark';
}

export function pickConcept(): AboutConcept {
  return new URLSearchParams(location.search).get('about') === 'lens' ? 'lens' : 'statement';
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const storyAt = (hold: number) => clamp((hold - STORY_START) / (STORY_END - STORY_START));

export interface AboutStory {
  /** Hold position 0…1, from the engine. */
  update(hold: number): void;
  destroy(): void;
}

export interface AboutHooks {
  /** How much of the frame's picture has surfaced (lens only). */
  setReveal(value: number): void;
}

export function createAboutStory(
  root: HTMLElement,
  concept: AboutConcept,
  hooks: AboutHooks
): AboutStory {
  const el = root.querySelector<HTMLElement>(`[data-about-concept='${concept}']`);
  if (!el) return { update() {}, destroy() {} };
  return concept === 'statement' ? createStatement(el) : createLens(el, hooks);
}

// --- the frame's picture -------------------------------------------------------

export interface Panel {
  canvas: HTMLCanvasElement;
  /** Repaint at the frame's current size. */
  draw(): void;
  /** Settles once the picture's image (if any) is in. */
  ready: Promise<void>;
}

/** What the chrome blooms into. The statement's is the dark field it sits
 *  on; the lens's is the portrait on its own studio backdrop, standing at the
 *  right and fading into the ground the statements pass through (on a phone,
 *  across the top). The ground is sampled from the photo so no seam shows. */
export function createPanel(
  concept: AboutConcept,
  full: HTMLElement,
  portrait?: string,
  tone: AboutTone = 'dark'
): Panel {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  if (concept === 'statement' || !portrait) {
    canvas.width = canvas.height = 4;
    if (g) {
      // The same token the statement's field is painted with.
      const token = tone === 'light' ? '--ice-200' : '--ink-950';
      g.fillStyle =
        getComputedStyle(full).getPropertyValue(token).trim() ||
        (tone === 'light' ? '#e1e7ec' : '#0c1016');
      g.fillRect(0, 0, 4, 4);
    }
    return { canvas, draw() {}, ready: Promise.resolve() };
  }

  const img = new Image();
  img.decoding = 'async';
  img.src = portrait;
  let rgb = [40, 45, 47];

  const sample = () => {
    // The top corners of the photo are clean backdrop.
    const probe = document.createElement('canvas');
    probe.width = 40;
    probe.height = 54;
    const p = probe.getContext('2d', { willReadFrequently: true });
    if (!p) return;
    p.drawImage(img, 0, 0, probe.width, probe.height);
    const sum = [0, 0, 0];
    let n = 0;
    for (const x0 of [0, probe.width - 5]) {
      const { data } = p.getImageData(x0, 0, 5, 12);
      for (let i = 0; i < data.length; i += 4) {
        sum[0] += data[i];
        sum[1] += data[i + 1];
        sum[2] += data[i + 2];
        n++;
      }
    }
    rgb = sum.map((v) => Math.round(v / n));
  };

  const draw = () => {
    if (!g) return;
    const box = full.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(box.width * dpr));
    const h = Math.max(2, Math.round(box.height * dpr));
    canvas.width = w;
    canvas.height = h;
    const ground = `rgba(${rgb.join(', ')}, 1)`;
    const clear = `rgba(${rgb.join(', ')}, 0)`;
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);
    if (!img.naturalWidth) return;
    const aspect = img.naturalWidth / img.naturalHeight;
    if (w >= h) {
      const ph = h;
      const pw = ph * aspect;
      const px = w - pw;
      g.drawImage(img, px, 0, pw, ph);
      const fade = g.createLinearGradient(px, 0, px + pw * 0.45, 0);
      fade.addColorStop(0, ground);
      fade.addColorStop(1, clear);
      g.fillStyle = fade;
      g.fillRect(px - 1, 0, pw * 0.45 + 1, h);
    } else {
      const pw = w;
      const ph = pw / aspect;
      g.drawImage(img, 0, -ph * 0.1, pw, ph);
      const top = h * 0.36;
      const fade = g.createLinearGradient(0, top, 0, h * 0.62);
      fade.addColorStop(0, clear);
      fade.addColorStop(1, ground);
      g.fillStyle = fade;
      g.fillRect(0, top, w, h - top);
    }
  };

  const ready = img
    .decode()
    .then(() => {
      sample();
      draw();
    })
    .catch(() => {});
  draw();
  return { canvas, draw, ready };
}

// --- the statement ---------------------------------------------------------------

function createStatement(el: HTMLElement): AboutStory {
  const words = Array.from(el.querySelectorAll<HTMLElement>('.statement__w'));
  // The speaker is introduced with the first words; the facts and the way
  // on arrive once the sentence is lit.
  const sig = el.querySelector<HTMLElement>('.statement__sig');
  const tail = Array.from(
    el.querySelectorAll<HTMLElement>('[data-statement-foot] > :not(.statement__sig)')
  );
  let lit = -1;
  let lastSig = -1;
  let lastTail = -1;

  const fade = (node: HTMLElement, v: number) => {
    node.style.opacity = String(v);
    node.style.translate = `0 ${10 * (1 - v)}px`;
  };

  return {
    update(hold) {
      const t = storyAt(hold);

      // The sentence lights up over most of the story; each word eases on
      // (a short CSS transition), so a fast scroll still reads as a sweep.
      const count = Math.round(smooth(0, 0.72, t) * words.length);
      if (count !== lit) {
        for (let i = 0; i < words.length; i++) words[i].classList.toggle('is-on', i < count);
        lit = count;
      }

      const intro = smooth(0, 0.1, t);
      if (sig && Math.abs(intro - lastSig) >= 0.001) {
        lastSig = intro;
        fade(sig, intro);
      }

      const out = smooth(0.8, 0.95, t);
      if (Math.abs(out - lastTail) >= 0.001) {
        lastTail = out;
        for (const node of tail) fade(node, out);
      }
    },
    destroy() {
      for (const w of words) w.classList.remove('is-on');
      for (const node of [sig, ...tail]) {
        node?.style.removeProperty('opacity');
        node?.style.removeProperty('translate');
      }
    },
  };
}

// --- the lens --------------------------------------------------------------------

function createLens(el: HTMLElement, hooks: AboutHooks): AboutStory {
  const says = Array.from(el.querySelectorAll<HTMLElement>('[data-lens-say]'));
  const foot = el.querySelector<HTMLElement>('[data-lens-foot]');
  const last = says.map(() => -1);
  let lastFoot = -1;
  let lastReveal = -1;

  // Each statement owns a stretch of the story, centred here; the last one
  // stays once it has arrived.
  const centres = says.map((_, i) => 0.24 + (i * 0.5) / Math.max(1, says.length - 1));
  const HALF = 0.13;

  return {
    update(hold) {
      const t = storyAt(hold);

      const reveal = smooth(0, 0.45, t);
      if (Math.abs(reveal - lastReveal) >= 0.0005) {
        lastReveal = reveal;
        hooks.setReveal(reveal);
      }

      says.forEach((say, i) => {
        const c = centres[i];
        const enter = smooth(c - HALF, c - HALF * 0.35, t);
        const leave = i < says.length - 1 ? smooth(c + HALF * 0.35, c + HALF, t) : 0;
        const key = enter * 10 + leave;
        if (Math.abs(key - last[i]) < 0.0005) return;
        last[i] = key;
        say.style.opacity = String(enter * (1 - leave));
        say.style.translate = `0 ${36 * (1 - enter) - 36 * leave}px`;
      });

      const out = smooth(0.84, 0.96, t);
      if (foot && Math.abs(out - lastFoot) >= 0.001) {
        lastFoot = out;
        foot.style.opacity = String(out);
        foot.style.translate = `0 ${10 * (1 - out)}px`;
      }
    },
    destroy() {
      hooks.setReveal(1);
      for (const say of says) {
        say.style.removeProperty('opacity');
        say.style.removeProperty('translate');
      }
      foot?.style.removeProperty('opacity');
      foot?.style.removeProperty('translate');
    },
  };
}
