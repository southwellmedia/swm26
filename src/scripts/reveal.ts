/**
 * Reveals
 *
 * Marks each [data-reveal] element `is-in` the first time it is 12% into the
 * viewport. Everything visual lives in CSS (styles/southwell.css, "Reveals"):
 * this only decides *when*, once, per element.
 *
 * Play-once and time-based on purpose. Scrubbing a text reveal against scroll
 * leaves letters half-risen whenever the reader pauses; a triggered entrance
 * always completes on its own clock, which is what makes it read as
 * intentional rather than mechanical.
 *
 * Two cases an IntersectionObserver alone gets wrong are handled here:
 *   - the page opens part-way down (back/forward, a reload, a hash) — anything
 *     already above the viewport is shown at once, not left hidden for the
 *     reader to scroll back up into;
 *   - a jump that skips past an element in one step never intersects it, so
 *     after any scroll settles, whatever is now above the viewport is shown.
 *
 * html.js is the gate for the hidden states, so a page without JavaScript —
 * or one where this module fails — ships fully visible. Reduced motion skips
 * the whole thing and lets the CSS show everything at rest.
 */
const SELECTOR = '[data-reveal]:not(.is-in)';

let observer: IntersectionObserver | null = null;
let pending = new Set<Element>();
let settleTimer = 0;

function show(el: Element) {
  el.classList.add('is-in');
  pending.delete(el);
  observer?.unobserve(el);
}

/** Anything the reader has already scrolled past should not still be waiting. */
function showPassed() {
  for (const el of pending) {
    if (el.getBoundingClientRect().bottom < 0) show(el);
  }
}

function onScroll() {
  window.clearTimeout(settleTimer);
  settleTimer = window.setTimeout(showPassed, 160);
}

function teardown() {
  observer?.disconnect();
  observer = null;
  pending = new Set();
  window.clearTimeout(settleTimer);
  window.removeEventListener('scroll', onScroll);
}

function init() {
  document.documentElement.classList.add('js');
  teardown();

  const targets = document.querySelectorAll<HTMLElement>(SELECTOR);
  if (!targets.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }

  pending = new Set(targets);
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // The first callback reports every element; anything already above
        // the viewport is shown straight away.
        if (entry.isIntersecting || entry.boundingClientRect.bottom < 0) show(entry.target);
      }
    },
    // 12% of the element showing, and clear of the bottom tenth of the
    // viewport, so nothing plays while it is still a sliver at the fold.
    { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
  );
  targets.forEach((el) => observer!.observe(el));
  window.addEventListener('scroll', onScroll, { passive: true });
}

document.addEventListener('astro:page-load', init);
document.addEventListener('astro:before-swap', teardown);
