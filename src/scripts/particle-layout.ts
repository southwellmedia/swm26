/** Normalized paths shared by the live canvas and the static fallback. */
export function particlePosition(
  u: number, v: number, depth: number, phase: number,
  time: number, scroll: number, variant: number, colored: boolean,
) {
  const spread = colored ? .026 : .21;
  const drift = Math.sin(time * .35 + phase) * .008 + scroll * (depth - .5) * .055;
  if (variant === 1) {
    // An open spiral, rather than a closed sphere.
    const angle = u * Math.PI * 1.65 - 2.2 + time * .035;
    const radius = .07 + u * .37 + v * (colored ? .014 : .11);
    return { x: .55 + Math.cos(angle) * radius * 1.22, y: .46 + Math.sin(angle) * radius + drift };
  }
  if (variant === 2) {
    return {
      x: u * 1.25 - .12,
      y: .49 + Math.sin(u * 8.8 - time * .12) * .15 + v * spread * .85 + drift,
    };
  }
  if (variant === 3) {
    // A broader, asymmetric cloud with a short colored current inside it.
    return {
      x: colored ? .24 + u * .66 : u * 1.2 - .08,
      y: .48 + Math.sin(u * 3.7 + .5) * .1 + v * (colored ? .055 : .3) * (.45 + u) + drift,
    };
  }
  return {
    x: u * 1.25 - .12,
    y: .58 - u * .22 + Math.sin(u * 5.8 + time * .09) * .12 + v * spread + drift,
  };
}

/** Mostly fine dust, with fewer medium particles and rare heavier accents. */
export function accentWeight(sample: number) {
  if (sample < .7) return { radius: .65 + sample / .7 * .6, opacity: .48 };
  if (sample < .95) return { radius: 1.45 + (sample - .7) / .25 * .85, opacity: .73 };
  return { radius: 2.65 + (sample - .95) / .05 * 1.15, opacity: .96 };
}
