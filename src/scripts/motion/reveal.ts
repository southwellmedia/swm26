/**
 * [data-reveal] — arrivals for any element, on any page.
 *
 *   data-reveal            lifts in: opacity 0→1, 56px rise on a spring
 *   data-reveal="rise"     masked rise: slides up from 150% inside a parent
 *                          that clips overflow (the parent is the mask)
 *   data-reveal-delay      seconds to hold after entering view
 *
 * Each element fires once, when a quarter of it is in view. Elements that
 * share a row are naturally staggered by their scroll offsets; the delay
 * attribute is for the cases where they are not.
 */
import { animate, inView } from 'motion';

const LIFT = { type: 'spring', visualDuration: 0.9, bounce: 0.1 } as const;
const RISE = { type: 'spring', visualDuration: 0.95, bounce: 0.14 } as const;

export function initReveal(reduced: boolean): VoidFunction {
  const elements = document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-in)');
  const stops: VoidFunction[] = [];

  for (const el of elements) {
    if (reduced) {
      el.classList.add('is-in');
      continue;
    }

    const rise = el.dataset.reveal === 'rise';
    const delay = Number(el.dataset.revealDelay ?? 0) || 0;
    // A rising word starts translated out of its mask, and IntersectionObserver
    // clips by overflow — so the word itself never intersects. Watch the mask.
    const target = rise ? (el.parentElement ?? el) : el;

    stops.push(
      inView(
        target,
        () => {
          // Motion writes its first keyframe a frame or more after animate()
          // (165ms once, on a busy load). Hold the start state inline first:
          // lifting the class with nothing in its place shows the finished
          // element, which then snaps away and animates back in.
          //
          // The lift ends at the element's own opacity, read in the same tick
          // the class comes off, so nothing paints: muted text stays muted.
          el.classList.add('is-in');
          if (rise) {
            el.style.transform = 'translateY(150%)';
            animate(el, { y: ['150%', '0%'] }, { ...RISE, delay });
          } else {
            const rest = Number(getComputedStyle(el).opacity);
            el.style.opacity = '0';
            el.style.transform = 'translateY(56px)';
            animate(el, { opacity: [0, rest], y: [56, 0] }, { ...LIFT, delay });
          }
        },
        { amount: 0.25, margin: '0px 0px -6% 0px' }
      )
    );
  }

  return () => stops.forEach((stop) => stop());
}
