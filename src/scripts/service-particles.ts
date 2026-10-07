import { particlePosition, accentWeight } from './particle-layout';

/** Opacity steps the particles are batched into; fine enough to read as continuous. */
const ALPHA_STEPS = 24;
/** Below this radius (device px) a dot is drawn as a square of the same area:
 *  at that size the two are indistinguishable, and a square costs far less. */
const SQUARE_BELOW = 1.25;
/** Half-side of a square with the area of a unit circle: √π / 2. */
const SQUARE_HALF = Math.sqrt(Math.PI) / 2;

/** A lightweight particle study; particles have depth, drift and damped pointer displacement. */
export function mountParticles(host: HTMLElement) {
  const canvas = host.querySelector('canvas');
  const card = host.closest<HTMLElement>('.service');
  if (!canvas || !card) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx = context;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Matches the stylesheet's stacked layout, where the art sits under the copy
  // and fades out downward instead of to the left.
  const stackedQuery = matchMedia('(max-width: 800px)');
  const next = card.parentElement?.nextElementSibling?.querySelector<HTMLElement>('.service') ?? null;
  let width = 1, height = 1, pixelRatio = 1;
  let frame = 0, visible = false, disposed = false, previous = 0, time = 0;
  let pointerX = -1000, pointerY = -1000, active = false, scroll = 0;
  let ink = '#343d48', accent = '#ff542e';
  const variant = Number(host.dataset.particleVariant || 0);
  let seed = 26 + variant * 7919;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const particles = Array.from({ length: 1600 }, () => ({
    u: random(), v: (random() + random() + random() - 1.5),
    depth: random(), phase: random() * Math.PI * 2,
    size: .5 + random() * 1.1, colored: random() < .23, weight: accentWeight(random()),
    x: 0, y: 0,
  }));
  const readColors = () => {
    const styles = getComputedStyle(card);
    const nextInk = styles.color || '#343d48';
    const nextAccent = styles.getPropertyValue('--signature-color').trim() || '#ff542e';
    if (nextInk === ink && nextAccent === accent) return;
    ink = nextInk;
    accent = nextAccent;
  };
  const draw = (now: number) => {
    frame = 0;
    if (disposed) return;
    const dt = Math.min((now - (previous || now)) / 1000, .05);
    previous = now;
    if (!reduced.matches) time += dt;
    const rect = card.getBoundingClientRect();
    // The stack slides the next card over this one; once it is covered, the
    // last frame stays and nothing is drawn under it.
    const nextTop = next?.getBoundingClientRect().top ?? Infinity;
    if (!reduced.matches && nextTop < rect.top + rect.height * .15) {
      if (visible && !document.hidden) frame = requestAnimationFrame(draw);
      return;
    }
    const desired = reduced.matches ? 0 : Math.max(-1, Math.min(1, (innerHeight * .5 - rect.top - rect.height * .5) / innerHeight));
    scroll += (desired - scroll) * .06;
    // Device pixels throughout, so the square cutoff is in real pixels.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const damp = reduced.matches ? 1 : 1 - Math.exp(-5 * dt);
    // One path per colour and opacity step, filled once each, rather than a
    // fill per particle: under fifty fills a frame instead of 1600.
    const paths: Array<Path2D | undefined> = [];
    const stacked = stackedQuery.matches;
    for (const p of particles) {
      const u = (p.u + time * (.009 + p.depth * .007)) % 1;
      const point = particlePosition(u, p.v, p.depth, p.phase, time, scroll, variant, p.colored);
      const x = point.x * width;
      const y = point.y * height;
      const dx = x - pointerX, dy = y - pointerY;
      const distance = Math.hypot(dx, dy);
      const radius = Math.min(width, height) * .32;
      const push = active && !reduced.matches ? Math.pow(Math.max(0, 1 - distance / radius), 2) * radius * .55 : 0;
      const targetX = dx / Math.max(distance, 1) * push;
      const targetY = dy / Math.max(distance, 1) * push;
      p.x += (targetX - p.x) * damp;
      p.y += (targetY - p.y) * damp;
      const fade = Math.min(1, u * 10, (1 - u) * 10);
      const px = x + p.x, py = y + p.y;
      // The fade into the copy, drawn here rather than as a CSS mask: a mask
      // over a live canvas is recomposited every frame.
      const edge = stacked ? Math.min(1, (height - py) / (height * .16)) : Math.min(1, px / (width * .18));
      const alpha = fade * edge * (p.colored ? p.weight.opacity * (.7 + p.depth * .3) : .13 + p.depth * .4);
      if (alpha <= .004) continue;
      const size = p.colored ? p.weight.radius * (.75 + p.depth * .4) : p.size * (.55 + p.depth * .95);
      const step = Math.max(1, Math.round(alpha * ALPHA_STEPS));
      const key = (p.colored ? ALPHA_STEPS + 1 : 0) + step;
      const path = (paths[key] ??= new Path2D());
      const r = size * pixelRatio, cx = px * pixelRatio, cy = py * pixelRatio;
      if (r < SQUARE_BELOW) {
        const h = r * SQUARE_HALF;
        path.rect(cx - h, cy - h, h * 2, h * 2);
      } else {
        path.moveTo(cx + r, cy);
        path.arc(cx, cy, r, 0, Math.PI * 2);
      }
    }
    paths.forEach((path, key) => {
      if (!path) return;
      const colored = key > ALPHA_STEPS;
      ctx.globalAlpha = (key - (colored ? ALPHA_STEPS + 1 : 0)) / ALPHA_STEPS;
      ctx.fillStyle = colored ? accent : ink;
      ctx.fill(path);
    });
    ctx.globalAlpha = 1;
    host.dataset.ready = 'true';
    host.dataset.interacting = active && !reduced.matches ? 'true' : 'false';
    if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
  };
  const wake = () => {
    if (!frame && !disposed && visible && !document.hidden) {
      previous = 0;
      frame = requestAnimationFrame(draw);
    }
  };
  const resize = () => {
    const box = host.getBoundingClientRect();
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    const nextRatio = Math.min(devicePixelRatio, 1.5);
    pixelRatio = nextRatio;
    canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
    readColors(); wake();
  };
  const move = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    pointerX = event.clientX - box.left; pointerY = event.clientY - box.top;
    active = pointerX >= 0 && pointerX <= width && pointerY >= 0 && pointerY <= height;
    wake();
  };
  const leave = () => { active = false; wake(); };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
    wake();
  }, { threshold: .01 });
  observer.observe(host);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
  const paletteObserver = new MutationObserver(() => { readColors(); wake(); });
  paletteObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
  card.addEventListener('pointermove', move); card.addEventListener('pointerleave', leave);
  reduced.addEventListener('change', wake); document.addEventListener('visibilitychange', wake);
  const cleanup = () => {
    disposed = true; cancelAnimationFrame(frame);
    observer.disconnect(); resizeObserver.disconnect(); paletteObserver.disconnect();
    card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', leave);
    reduced.removeEventListener('change', wake); document.removeEventListener('visibilitychange', wake);
    document.removeEventListener('astro:before-swap', cleanup);
  };
  document.addEventListener('astro:before-swap', cleanup, { once: true });
  resize();
}
