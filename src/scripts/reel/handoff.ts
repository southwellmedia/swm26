/**
 * The hero → reel handoff: one curve, evaluated by both sides.
 *
 * The hero's stray droplet and the reel's copy of it used to be two
 * trajectories meeting in the panel's fade: the hero rolled its droplet
 * toward the camera, the reel read where it had got to a frame later and
 * started a fresh fall from rest. The seam showed twice — a ghost a frame
 * behind during the crossfade, and a stall where a ball moving at three
 * times scroll speed restarted from nothing.
 *
 * Now the reel owns the path. It records where the hero's droplet is as the
 * release begins (`DropletArc`, in document space) and publishes that; from
 * there the position at any scroll is `arcAt`, a pure function of the scroll
 * position, so the hero can evaluate the same point in its own frame,
 * unproject it into its world and put its droplet exactly there. Nothing is
 * read a frame late, and the fall starts with the velocity the ball already
 * has on screen.
 *
 * All positions are document px, y down. Timeline in viewport heights.
 */

/** The reel begins to pull the droplet at this scroll … */
export const EXIT_START = 0.05;
/** … and has it entirely by here (the hero's blend toward the arc is done). */
export const EXIT_END = 0.2;
/** The fall, bounce and settle are over by here … */
export const FALL_END = 0.42;
/** … and the ball rests on the headline until here, then floats to the reel. */
export const REST_END = 0.5;
/** Where in the fall the ball first touches down. */
export const LAND_T = 0.62;
/** How far back up it comes, as a fraction of the fall: a droplet, not a
 *  rubber ball. */
export const BOUNCE = 0.08;
/** It lands this big, as a fraction of the panel's height: the size it would
 *  be at EXIT_Z, whatever size the scene happened to have it at. */
export const LAND_SIZE = 0.07;
/** Depth (world units in front of the hero's camera) the droplet is drawn at
 *  once it is entirely on the arc. Close enough to grow, far enough to stay
 *  a droplet. */
export const EXIT_Z = 3.0;
/** The reel's copy fades in as the ball's centre crosses this band above the
 *  panel's lower edge, px; the hero's own droplet is under the panel's fade
 *  there and lets go at the bottom of it. */
export const BAND_TOP = 90;
export const BAND_BOTTOM = 20;

export interface DropletArc {
  /** The droplet's centre and radius as the release began. NaN x: unknown. */
  x: number;
  y: number;
  r: number;
  /** The radius it lands with (see LAND_SIZE). */
  landR: number;
  /** The surface the ball lands on: the headline's baseline. */
  floor: number;
  /** The hero panel's lower edge. */
  panelBottom: number;
}

export interface ArcPoint {
  /** Centre, document px, and radius. */
  x: number;
  y: number;
  r: number;
  /** Vertical scale, 1 = round. */
  squash: number;
  /** How hard it is hitting the surface right now, 0…1. */
  impact: number;
  /** The lowest the centre has been so far: the fall is monotonic, so this
   *  is `y` until the landing and the landing point after it. The fade band
   *  and the shadow are judged on this, so the bounce cannot dip the ball
   *  back into the scene. */
  yMax: number;
  /** Progress along the fall, 0 at release … 1 at rest. */
  t: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** How far the hero has let go, 0…1, at scroll `s` (viewport heights). */
export const releaseAt = (s: number) => smoothstep(EXIT_START, EXIT_END, s);

/** The radius the ball lands with. */
export const landingRadius = (arc: DropletArc) => clamp(arc.landR, 14, 44);

/** Opacity of the reel's copy at centre `y`: 0 above the band, 1 below it. */
export const copyOpacity = (y: number, panelBottom: number) =>
  smoothstep(panelBottom - BAND_TOP, panelBottom - BAND_BOTTOM, y);

/** How much the ball is "on the page" rather than in the scene: 0 over the
 *  panel, 1 once it is clear of the panel's lower edge. Drives the shadow
 *  and the edge treatment, which the hero's render has neither of. */
export const onPageAt = (y: number, r: number, panelBottom: number) =>
  smoothstep(panelBottom + r * 0.5, panelBottom + r * 2.5, y);

/** Impact strength at fall progress t: the landing, and the second touch. */
const impactAt = (t: number) =>
  Math.exp(-(((t - LAND_T) / 0.05) ** 2)) + 0.5 * Math.exp(-(((t - 0.96) / 0.03) ** 2));

/**
 * Where the ball is at `scrollY`. Released at EXIT_START it falls from the
 * anchor to the floor under gravity, lands at LAND_T, bounces BOUNCE of the
 * way back and settles by FALL_END. The fall begins with exactly the
 * velocity that holds it still on screen (one page-length of scroll per
 * page-length of fall), so the ball a moment ago drifting in the scene
 * neither stalls nor jumps: it hangs, then drops.
 */
export function arcAt(arc: DropletArc, scrollY: number, vh: number, out: ArcPoint): ArcPoint {
  const s = scrollY / vh;
  const t = clamp((s - EXIT_START) / (FALL_END - EXIT_START), 0, 1);
  const rLand = landingRadius(arc);
  const top = arc.y + arc.r; // the ball's underside at release
  const distance = Math.max(1, arc.floor - top);
  // Scroll spent falling, in px; the initial velocity that cancels it.
  const span = (FALL_END - EXIT_START) * vh * LAND_T;
  const v = clamp(span / distance, 0, 1);

  let curve: number;
  if (t < LAND_T) {
    const u = t / LAND_T;
    curve = v * u + (1 - v) * u * u;
  } else {
    curve = 1 - BOUNCE * Math.sin((Math.PI * (t - LAND_T)) / (1 - LAND_T));
  }
  const impact = impactAt(t);
  const squash = 1 - 0.28 * impact;
  const r = lerp(arc.r, rLand, smoothstep(0, LAND_T, t));
  const bottom = lerp(top, arc.floor, curve);

  out.x = arc.x;
  out.y = bottom - r * squash;
  out.r = r;
  out.squash = squash;
  out.impact = impact;
  out.t = t;
  out.yMax = t < LAND_T ? out.y : arc.floor - rLand;
  return out;
}

declare global {
  interface Window {
    /** Published by the reel while it runs: the arc the hero's droplet is on.
     *  Absent, the hero keeps its droplet. */
    __heroDropletArc?: DropletArc;
  }
}
