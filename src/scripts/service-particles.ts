import { particlePosition, accentWeight } from './particle-layout';

/** A lightweight particle study; particles have depth, drift and damped pointer displacement. */
export function mountParticles(host: HTMLElement) {
  const canvas = host.querySelector('canvas');
  const card = host.closest<HTMLElement>('.service');
  if (!canvas || !card) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ctx = context;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
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
    ink = styles.color || '#343d48';
    accent = styles.getPropertyValue('--signature-color').trim() || '#ff542e';
  };
  const draw = (now: number) => {
    frame = 0;
    if (disposed) return;
    const dt = Math.min((now - (previous || now)) / 1000, .05);
    previous = now;
    if (!reduced.matches) time += dt;
    const rect = card.getBoundingClientRect();
    const desired = reduced.matches ? 0 : Math.max(-1, Math.min(1, (innerHeight * .5 - rect.top - rect.height * .5) / innerHeight));
    scroll += (desired - scroll) * .06;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const damp = reduced.matches ? 1 : 1 - Math.exp(-5 * dt);
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
      ctx.globalAlpha = fade * (p.colored ? p.weight.opacity * (.7 + p.depth * .3) : .13 + p.depth * .4);
      ctx.fillStyle = p.colored ? accent : ink;
      const size = p.colored ? p.weight.radius * (.75 + p.depth * .4) : p.size * (.55 + p.depth * .95);
      ctx.beginPath();
      ctx.arc(x + p.x, y + p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
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
    pixelRatio = Math.min(devicePixelRatio, 1.5);
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
