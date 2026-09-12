/**
 * [data-reveal] — arrivals for any element, on any page.
 *
 *   data-reveal            lifts in: opacity 0→1, 56px rise on a spring
 *   data-reveal="rise"     masked rise: slides up from 112% inside a parent
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
          // Motion writes the first keyframe inline on its first frame, and
          // inline beats the class rule that was hiding the element — so the
          // class can come off now with no visible frame in between.
          el.classList.add('is-in');
          if (rise) animate(el, { y: ['112%', '0%'] }, { ...RISE, delay });
          else animate(el, { opacity: [0, 1], y: [56, 0] }, { ...LIFT, delay });
        },
        { amount: 0.25, margin: '0px 0px -6% 0px' }
      )
    );
  }

  return () => stops.forEach((stop) => stop());
}
