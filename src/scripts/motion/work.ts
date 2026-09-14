/**
 * Work grid — arrival and hover.
 *
 * Arrival: as a card comes into view it lifts in while the picture inside
 * pulls back from a close crop and the caption rises to meet its resting
 * place. Cards in the same row arrive a beat apart, by column.
 *
 * On the homepage the lead card is delivered by the reel's droplet (see
 * src/scripts/reel/morph.ts), and the rest of the grid waits for it: a card
 * that comes into view before the droplet has become the lead holds its
 * arrival, and the held cards follow the lead in one staggered run the
 * moment it is delivered. Nothing below the fold builds before the first
 * thing does.
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
 *
 * That now includes the card's own box. Its arrival (opacity, y) used to go
 * through animate(card, …), which writes style.transform from a separate
 * VisualElement and would clobber anything else on the element. It is a
 * styleEffect now too, so flow.ts can compose skewY/scaleY onto the same
 * transform — styleEffect calls on one element share one state.
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

  // --- the lead's gate -----------------------------------------------------
  // With a live reel on the page, no card arrives before the delivered lead
  // has (`is-in`, toggled by the reel engine). Arrivals that come due first
  // wait here and run, a beat apart, when it lands. Without a live reel the
  // lead shows on its own and there is nothing to wait for.
  const lead = grid.querySelector<HTMLElement>('.card[data-deliver]');
  const gated = Boolean(lead) && !reduced && Boolean(document.querySelector('[data-reel]'));
  const waiting: Array<(extra: number) => void> = [];
  let released = !gated || Boolean(lead?.classList.contains('is-in'));
  const release = () => {
    if (released) return;
    released = true;
    waiting.splice(0).forEach((arrive, i) => arrive(0.15 + i * 0.07));
  };
  if (!released && lead) {
    const gate = new MutationObserver(() => {
      if (lead.classList.contains('is-in')) release();
    });
    gate.observe(lead, { attributes: true, attributeFilter: ['class'] });
    stops.push(() => gate.disconnect());
  }

  for (const card of grid.querySelectorAll<HTMLElement>('.card')) {
    const media = card.querySelector<HTMLElement>('.card__media');
    const caption = card.querySelector<HTMLElement>('.card__caption');
    const meta = card.querySelector<HTMLElement>('.card__meta');
    if (!media) continue;

    // Owned values. Position springs chase the pointer; scale is animated
    // directly so arrival and hover both drive it with their own curves.
    // cardY / cardOpacity are the card's arrival, bound below so the card's
    // transform has exactly one writer.
    const px = motionValue(0);
    const py = motionValue(0);
    const scale = motionValue(1);
    const cardY = motionValue(reduced ? 0 : 64);
    const cardOpacity = motionValue(reduced ? 1 : 0);
    const sx = springValue(px, { stiffness: 180, damping: 24, mass: 0.9 });
    const sy = springValue(py, { stiffness: 180, damping: 24, mass: 0.9 });
    const cx = transformValue(() => -sx.get() * (CAPTION_DRIFT / MEDIA_DRIFT));
    const cy = transformValue(() => -sy.get() * (CAPTION_DRIFT / MEDIA_DRIFT));

    // A delivered card (data-deliver) leaves opacity to the stylesheet: the
    // reel engine shows it by adding `is-in`, and an inline opacity would
    // beat the `:not(.is-in)` rule that hides it until then.
    const delivered = card.dataset.deliver !== undefined;
    stops.push(styleEffect(card, delivered ? { y: cardY } : { y: cardY, opacity: cardOpacity }));
    stops.push(styleEffect(media, { x: sx, y: sy, scale }));
    if (caption) stops.push(styleEffect(caption, { x: cx, y: cy }));

    // Both pictures decoded before the first hover asks for them. Cheap, and
    // it keeps the colour layer's first frame from waiting on a decode.
    const warm = () => {
      for (const img of card.querySelectorAll('img')) img.decode().catch(() => {});
    };

    // --- arrival ---------------------------------------------------------
    // A delivered card (data-deliver) has no arrival of its own: the reel's
    // droplet drops down the page and becomes it, and the reel engine adds
    // `is-in` at that moment. Without a live reel to do that — reduced
    // motion, or no reel on the page — it simply shows. The bound values sit
    // at rest so the stylesheet's `:not(.is-in)` is the only thing hiding it.
    if (delivered) {
      cardY.set(0);
      cardOpacity.set(1);
      if (reduced || !document.querySelector('[data-reel]')) card.classList.add('is-in');
      warm();
    } else if (reduced) {
      card.classList.add('is-in');
      warm();
    } else {
      const arrive = (extra: number) => {
        card.classList.add('is-in');
        warm();
        const at = columnOf(card, grid) * 0.09 + extra;
        // The card itself: its values, not the element, so the write goes
        // through the styleEffect above rather than a second transform owner.
        const lift = { type: 'spring', visualDuration: 1.0, bounce: 0.08, delay: at } as const;
        animate(cardY, 0, lift);
        animate(cardOpacity, 1, lift);
        const sequence: AnimationSequence = [];
        if (caption) {
          sequence.push([
            caption,
            { opacity: [0, 1], y: [28, 0] },
            { type: 'spring', visualDuration: 0.9, bounce: 0.1, at: at + 0.18 },
          ]);
        }
        if (meta) {
          sequence.push([meta, { opacity: [0, 1], y: [-8, 0] }, { duration: 0.5, at: at + 0.35 }]);
        }
        if (sequence.length) animate(sequence);
        animate(scale, [1.18, 1], {
          type: 'spring',
          visualDuration: 1.5,
          bounce: 0,
          delay: at,
        });
      };
      stops.push(
        inView(
          card,
          () => {
            // The lead already scrolled off the top means the page was
            // opened, or jumped, past the delivery: nothing to wait for.
            if (lead && lead.getBoundingClientRect().bottom < 0) release();
            if (released) arrive(0);
            else waiting.push(arrive);
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
