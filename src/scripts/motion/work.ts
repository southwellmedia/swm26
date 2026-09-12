/**
 * Work grid — arrival and hover.
 *
 * Arrival: as a card comes into view it lifts in while the picture inside
 * pulls back from a close crop and the caption rises to meet its resting
 * place. Cards in the same row arrive a beat apart, by column.
 *
 * Hover: the picture and the caption drift against each other under the
 * pointer, on springs, and the picture eases up to a slight zoom on the same
 * clock as the stylesheet's colour dissolve. Only the layers inside the card
 * move; the card's own box never does, so it can never reach across the grid
 * gap into a neighbour. Pointer-only — touch has no hover, and the
 * stylesheet shows the work in full there.
 *
 * Every transform here is owned by Motion: x, y and scale are motion values
 * bound to the elements with styleEffect, so the arrival zoom and the hover
 * zoom animate the same value and can never fight over one property.
 */
import {
  animate,
  hover,
  inView,
  motionValue,
  styleEffect,
  springValue,
  transformValue,
  type AnimationSequence,
} from 'motion';

const MEDIA_DRIFT = 6; // px, capped against the hover zoom's 3% overhang
const CAPTION_DRIFT = 4; // px, the other way

export function initWork(reduced: boolean): VoidFunction {
  const grid = document.querySelector<HTMLElement>('[data-work-grid]');
  if (!grid) return () => {};

  const stops: VoidFunction[] = [];
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  for (const card of grid.querySelectorAll<HTMLElement>('.card')) {
    const media = card.querySelector<HTMLElement>('.card__media');
    const caption = card.querySelector<HTMLElement>('.card__caption');
    const meta = card.querySelector<HTMLElement>('.card__meta');
    if (!media) continue;

    // Owned values. Position springs chase the pointer; scale is animated
    // directly so arrival and hover both drive it with their own curves.
    const px = motionValue(0);
    const py = motionValue(0);
    const scale = motionValue(1);
    const sx = springValue(px, { stiffness: 180, damping: 24, mass: 0.9 });
    const sy = springValue(py, { stiffness: 180, damping: 24, mass: 0.9 });
    const cx = transformValue(() => -sx.get() * (CAPTION_DRIFT / MEDIA_DRIFT));
    const cy = transformValue(() => -sy.get() * (CAPTION_DRIFT / MEDIA_DRIFT));

    stops.push(styleEffect(media, { x: sx, y: sy, scale }));
    if (caption) stops.push(styleEffect(caption, { x: cx, y: cy }));

    // Both pictures decoded before the first hover asks for them. Cheap, and
    // it keeps the colour layer's first frame from waiting on a decode.
    const warm = () => {
      for (const img of card.querySelectorAll('img')) img.decode().catch(() => {});
    };

    // --- arrival ---------------------------------------------------------
    if (reduced) {
      card.classList.add('is-in');
      warm();
    } else {
      stops.push(
        inView(
          card,
          () => {
            card.classList.add('is-in');
            warm();
            const at = columnOf(card, grid) * 0.09;
            const sequence: AnimationSequence = [
              [
                card,
                { opacity: [0, 1], y: [64, 0] },
                { type: 'spring', visualDuration: 1.0, bounce: 0.08, at },
              ],
            ];
            if (caption) {
              sequence.push([
                caption,
                { opacity: [0, 1], y: [28, 0] },
                { type: 'spring', visualDuration: 0.9, bounce: 0.1, at: at + 0.18 },
              ]);
            }
            if (meta) {
              sequence.push([
                meta,
                { opacity: [0, 1], y: [-8, 0] },
                { duration: 0.5, at: at + 0.35 },
              ]);
            }
            animate(sequence);
            animate(scale, [1.18, 1], {
              type: 'spring',
              visualDuration: 1.5,
              bounce: 0,
              delay: at,
            });
          },
          { amount: 0.22 }
        )
      );
    }

    // --- hover -----------------------------------------------------------
    if (!fine || reduced) continue;

    let rect: DOMRect | null = null;
    const invalidate = () => {
      rect = null;
    };
    const onMove = (event: PointerEvent) => {
      rect ??= card.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      px.set((0.5 - x) * 2 * MEDIA_DRIFT);
      py.set((0.5 - y) * 2 * MEDIA_DRIFT);
    };

    stops.push(
      hover(card, () => {
        invalidate();
        animate(scale, 1.06, { type: 'spring', visualDuration: 1.0, bounce: 0 });
        card.addEventListener('pointermove', onMove);
        window.addEventListener('scroll', invalidate, { passive: true });
        return () => {
          card.removeEventListener('pointermove', onMove);
          window.removeEventListener('scroll', invalidate);
          px.set(0);
          py.set(0);
          animate(scale, 1, { type: 'spring', visualDuration: 0.9, bounce: 0 });
        };
      })
    );
  }

  return () => stops.forEach((stop) => stop());
}

/** 0, 1 or 2 by horizontal position — the stagger key for a row. */
function columnOf(card: HTMLElement, grid: HTMLElement): number {
  const t = card.offsetLeft / Math.max(1, grid.clientWidth);
  return t > 0.6 ? 2 : t > 0.25 ? 1 : 0;
}
