/**
 * Smooth scroll
 *
 * Lenis drives the native scroller with inertia, so wheel and touch glide
 * instead of stepping. Everything that reads scroll position — the CSS
 * scroll-driven reveals, the sticky service stack, the hero's scroll uniform —
 * keeps working because the page still scrolls natively; Lenis only shapes
 * the input.
 *
 *   - Skipped entirely under prefers-reduced-motion: the browser's own
 *     scrolling is the accessible behaviour, not a smoothed copy of it.
 *   - autoToggle: the nav locks the page by setting overflow: hidden on
 *     <html> while the menu is open; Lenis pauses and resumes off that, so
 *     nothing has to know Lenis exists.
 *   - In-page links (the skip link, section jumps) are handled here, in the
 *     capture phase, before anyone else sees the click. Both the
 *     ClientRouter and Lenis's own `anchors` option want them, and together
 *     they cancel out: the router jumps the page natively first, then Lenis
 *     measures the target against its stale position and glides straight
 *     back to where you were. The router steps aside for a click that is
 *     already defaultPrevented, so one preventDefault here is enough. The
 *     target lands just under the fixed nav; a link may name a different
 *     element to land on with data-scroll-target, and ask for a slower,
 *     eased ride with data-scroll-duration (seconds) when the page has
 *     something to show on the way.
 *   - Rebuilt across view transitions: one instance per document, torn down
 *     before the swap so listeners never stack.
 */
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

function destroy() {
  window.__lenis?.destroy();
  window.__lenis = undefined;
}

function create() {
  destroy();
  if (reduced.matches) return;
  window.__lenis = new Lenis({
    autoRaf: true,
    autoToggle: true,
    lerp: 0.1,
    smoothWheel: true,
    // Touch stays native: synced touch scrolling on mobile feels laggy and
    // costs battery for no gain over the OS's own inertia.
    syncTouch: false,
  });
}

/** Space between the fixed nav and a scrolled-to target. */
const NAV_CLEAR = 24;
/** For a timed ride: in and out, so the middle of the distance — where the
 *  scroll-driven work happens — passes at an even, watchable speed. */
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function onClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const lenis = window.__lenis;
  if (!lenis) return; // reduced motion: the browser's own jump is the right one
  const anchor = event
    .composedPath()
    .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
  if (!anchor || !anchor.getAttribute('href')) return;
  const url = new URL(anchor.href, location.href);
  if (!url.hash || url.origin !== location.origin || url.pathname !== location.pathname) return;
  const selector = anchor.dataset.scrollTarget;
  const target = selector
    ? document.querySelector<HTMLElement>(selector)
    : document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (!target) return;

  event.preventDefault();
  if (url.hash !== location.hash) history.pushState(null, '', url.hash);
  const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sw-nav-h'));
  const duration = parseFloat(anchor.dataset.scrollDuration ?? '');
  lenis.scrollTo(target, {
    offset: -((nav || 0) + NAV_CLEAR),
    ...(duration > 0 ? { duration, easing: easeInOutCubic } : {}),
  });
  // What a native jump would have done for keyboard users: the next Tab
  // continues from the target, not from the link.
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
}
document.addEventListener('click', onClick, true);

// Fires on first load and after every ClientRouter navigation.
document.addEventListener('astro:page-load', create);
document.addEventListener('astro:before-swap', destroy);
reduced.addEventListener('change', create);
