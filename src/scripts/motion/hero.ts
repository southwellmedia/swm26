/**
 * Hero entrance — one sequence, four beats.
 *
 * The panel settles in from slightly below and smaller; each headline line
 * rises out of its mask; the foot follows. Offsets are uneven on purpose:
 * equal spacing is what makes a stagger look mechanical. Line two arrives
 * faster and lighter than line one.
 */
import { animate, type AnimationSequence } from 'motion';

export function initHero(reduced: boolean): VoidFunction {
  const hero = document.querySelector<HTMLElement>('.hero');
  if (!hero) return () => {};

  const panel = hero.querySelector<HTMLElement>('.hero__render');
  const words = hero.querySelectorAll<HTMLElement>('.hero__word');
  const foot = hero.querySelector<HTMLElement>('.hero__foot');
  const parts = [panel, ...words, foot].filter((el): el is HTMLElement => Boolean(el));

  if (reduced) {
    for (const el of parts) {
      el.style.opacity = '1';
      el.style.transform = 'none';
    }
    return () => {};
  }

  const sequence: AnimationSequence = [];
  if (panel) {
    sequence.push([
      panel,
      { opacity: [0, 1], y: [34, 0], scale: [0.97, 1] },
      { type: 'spring', visualDuration: 1.25, bounce: 0.06, at: 0.1 },
    ]);
  }
  words.forEach((word, i) => {
    sequence.push([
      word,
      { y: ['112%', '0%'] },
      {
        type: 'spring',
        visualDuration: i === 0 ? 0.95 : 0.85,
        bounce: 0.14,
        at: i === 0 ? 0.35 : 0.47,
      },
    ]);
  });
  if (foot) {
    sequence.push([
      foot,
      { opacity: [0, 1], y: [24, 0] },
      { type: 'spring', visualDuration: 0.9, bounce: 0.1, at: 0.95 },
    ]);
  }

  const controls = animate(sequence);

  return () => controls.stop();
}
