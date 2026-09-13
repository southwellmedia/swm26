/**
 * Work grid — scroll flow.
 *
 * The Lusion "flow": while the page is moving, the work cards behave like
 * one sheet being pulled through the viewport rather than boxes glued to the
 * scroll. Three things happen at once, all from one velocity input, and all
 * spring back to nothing the moment the scroll stops:
 *
 *   lag      every card trails its slot by up to LAG px — the pictures hang
 *            back behind the type — with the edge lanes trailing more than
 *            the middle, so a row forms a shallow tent across the grid.
 *   skew     each card shears toward the centre lane (left column's right
 *            side rises, right column's left side rises), which is the same
 *            tent drawn inside the card. Cards that straddle the centre get
 *            no skew.
 *   stretch  a slight scaleY on everything, so the sheet reads as pulled.
 *
 * Lusion does this per vertex on WebGL planes. This is the DOM version: three
 * transform channels per card via Motion's styleEffect, which composes them
 * with the arrival transform that work.ts owns on the same element (`y` and
 * `translateY` are separate slots that both emit as translateY(), so the
 * arrival keeps its own value).
 *
 * Skew is derived from a fixed pixel LEAN rather than fixed degrees, so a
 * 1344px lead card and a 448px tile overrun their box by the same amount.
 *
 * Input is Lenis's smoothed velocity (window.__lenis) — the value the page
 * is actually drawn at, so the bend can never disagree with the scroll. It
 * goes through a spring, which gives the lag on the way in and the one ring
 * on the way out. Without Lenis it falls back to a scrollY delta.
 *
 * Skipped for coarse pointers: the OS already adds inertia there, and a bend
 * on top reads as jank rather than flow.
 */
import { motionValue, springValue, styleEffect, transformValue } from 'motion';
import type Lenis from 'lenis';

/** px a card trails its slot at full velocity (edge lanes; middle is 60%). */
const LAG = 44;
/** px of vertical overrun at a card's far edge from skew, at full velocity. */
const LEAN = 18;
/** Extra height at full velocity (1 = none). */
const STRETCH = 1.045;
/** Lenis velocity (px per frame) that counts as "full". An ordinary trackpad
 *  scroll peaks around 15–25, a flick well past 40; everything clamps at 1. */
const FULL_VELOCITY = 26;

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function initFlow(reduced: boolean): VoidFunction {
  const grid = document.querySelector<HTMLElement>('[data-work-grid]');
  if (!grid || reduced) return () => {};
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};

  const stops: VoidFunction[] = [];

  // -1 … 1, normalised scroll velocity. Downward scroll is positive.
  const velocity = motionValue(0);
  const flow = springValue(velocity, { stiffness: 120, damping: 19, mass: 1 });

  const cards = Array.from(grid.querySelectorAll<HTMLElement>('.card'));

  // Each card's centre across the grid, -1 (left edge) … 1 (right edge).
  // Re-measured on resize; the bento reflows at 1100 and 700.
  const lanes = new Map<HTMLElement, number>();
  const measure = () => {
    const gw = grid.clientWidth || 1;
    for (const card of cards) {
      const centre = card.offsetLeft + card.offsetWidth / 2;
      lanes.set(card, clamp((centre / gw) * 2 - 1, -1, 1));
    }
  };
  measure();

  for (const card of cards) {
    const lane = () => lanes.get(card) ?? 0;

    // Trails the scroll: scrolling down (v > 0) the card sits below its slot
    // and springs back up when the page stops. Edges trail more than the
    // middle, which is what makes a row bend instead of just drop.
    const translateY = transformValue(() => {
      const l = Math.abs(lane());
      return flow.get() * LAG * (0.6 + 0.4 * l);
    });

    const skewY = transformValue(() => {
      const l = lane();
      const v = flow.get();
      // Full lean at the edges, tapering to nothing through the middle third.
      const dir = Math.sign(l) * clamp((Math.abs(l) - 0.15) / 0.55, 0, 1);
      if (dir === 0) return 0;
      // skewY(a) about the centre moves each far edge by (w/2)·tan(a):
      // solve for the angle that puts LEAN px at the edge.
      const angle = (Math.atan((2 * LEAN) / Math.max(1, card.offsetWidth)) * 180) / Math.PI;
      // Scrolling down the centre is ahead, i.e. higher. For a card left of
      // centre its right side rises; CSS skewY(a) lowers the right side for
      // positive a, so the left column (dir = -1) needs a negative angle.
      return dir * v * angle;
    });

    const scaleY = transformValue(() => 1 + Math.abs(flow.get()) * (STRETCH - 1));

    stops.push(styleEffect(card, { translateY, skewY, scaleY }));
  }

  // --- input ---------------------------------------------------------------
  const lenis = window.__lenis;
  if (lenis) {
    stops.push(lenis.on('scroll', (l) => velocity.set(clamp(l.velocity / FULL_VELOCITY, -1, 1))));
  } else {
    let last = window.scrollY;
    let raf = 0;
    const tick = () => {
      const y = window.scrollY;
      velocity.set(clamp((y - last) / FULL_VELOCITY, -1, 1));
      last = y;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    stops.push(() => cancelAnimationFrame(raf));
  }

  // A settled spring returns exactly 0 and 1, so at rest the cards carry no
  // residual transform (Motion writes `none`).
  const ro = new ResizeObserver(measure);
  ro.observe(grid);
  stops.push(() => ro.disconnect());

  return () => {
    for (const stop of stops) stop();
  };
}
