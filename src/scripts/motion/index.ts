/**
 * Motion
 *
 * Every arrival and hover on the site runs through Motion (motion.dev) — the
 * hero sequence, the [data-reveal] system, the work grid — via its vanilla
 * DOM API, so Astro's server-rendered markup and image pipeline stay as they
 * are and nothing hydrates just to animate.
 *
 * Progressive: until this module runs, `html.js` hides the elements it is
 * about to reveal; without JS nothing is ever hidden. Under
 * prefers-reduced-motion everything is shown in place.
 *
 * Lifecycle follows the ClientRouter: set up on every page load, torn down
 * before each swap so observers never outlive their DOM.
 */
import { initReveal } from './reveal';
import { initHero } from './hero';
import { initWork } from './work';

const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

let teardown: VoidFunction[] = [];

function setup() {
  document.documentElement.classList.add('js');
  const reduced = reducedQuery.matches;
  teardown = [initReveal(reduced), initHero(reduced), initWork(reduced)];
}

function cleanup() {
  for (const stop of teardown) stop();
  teardown = [];
}

// The swap replaces <html>'s attributes with the new page's, which drops the
// class. Restore it before the new page paints, or its reveals would flash.
document.addEventListener('astro:after-swap', () => document.documentElement.classList.add('js'));
document.addEventListener('astro:page-load', setup);
document.addEventListener('astro:before-swap', cleanup);
