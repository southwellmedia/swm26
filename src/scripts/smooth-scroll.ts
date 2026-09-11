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
 *   - anchors: in-page links (the skip link, section jumps) scroll through
 *     Lenis rather than fighting it.
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
    anchors: true,
    lerp: 0.1,
    smoothWheel: true,
    // Touch stays native: synced touch scrolling on mobile feels laggy and
    // costs battery for no gain over the OS's own inertia.
    syncTouch: false,
  });
}

// Fires on first load and after every ClientRouter navigation.
document.addEventListener('astro:page-load', create);
document.addEventListener('astro:before-swap', destroy);
reduced.addEventListener('change', create);
