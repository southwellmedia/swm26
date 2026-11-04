/**
 * Motion
 *
 * Every arrival and hover on the site runs through Motion (motion.dev) — the
 * hero sequence, the [data-reveal] system, the work grid — via its vanilla
 * DOM API, so Astro's server-rendered markup and image pipeline stay as they
 * are and nothing hydrates just to animate.
 *
 * Progressive: an inline script in BaseLayout sets `html.js` before first
 * paint, which hides the elements this module is about to reveal; without JS
 * nothing is ever hidden. That script also starts a failsafe timer, cleared
 * here. If it fired first the page is already showing, so Motion leaves that
 * one page alone rather than hiding it again, and takes over from the next
 * navigation: the router never reloads the document, so giving up for good
 * here would leave a visitor without motion for the whole visit. Under
 * prefers-reduced-motion everything is shown in place.
 *
 * Lifecycle follows the ClientRouter: set up on every page load, torn down
 * before each swap so observers never outlive their DOM.
 */
import { initReveal } from './reveal';
import { initHero } from './hero';
import { initWork } from './work';
import { initFlow } from './flow';

declare global {
  interface Window {
    __motionFailsafe?: number;
  }
}

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

clearTimeout(window.__motionFailsafe);
/** The failsafe won the race, for the page on screen now. */
let gaveUp = !document.documentElement.classList.contains('js');

let teardown: VoidFunction[] = [];

function setup() {
  if (gaveUp) return;
  const reduced = reducedQuery.matches;
  try {
    for (const init of [initReveal, initHero, initWork, initFlow]) teardown.push(init(reduced));
  } catch (error) {
    cleanup();
    document.documentElement.classList.remove('js');
    document
      .querySelectorAll<HTMLElement>(
        '[data-reveal], .card, .hero__word, .hero__render, .hero__foot'
      )
      .forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
    console.warn('Motion unavailable; showing the static page.', error);
  }
}

function cleanup() {
  for (const stop of teardown) stop();
  teardown = [];
}

// The swap replaces <html>'s attributes with the new page's, which drops the
// class. Restore it before the new page paints, or its reveals would flash.
document.addEventListener('astro:after-swap', () => {
  gaveUp = false;
  document.documentElement.classList.add('js');
});
document.addEventListener('astro:page-load', setup);
document.addEventListener('astro:before-swap', cleanup);
