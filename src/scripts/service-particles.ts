import { particlePosition, accentWeight } from './particle-layout';

const COUNT = 1600;
/** Floats per particle in the vertex buffer: x, y, radius, alpha, colored. */
const STRIDE = 5;

// Every particle is one GL point: a quad the size of its dot plus a pixel of
// antialiased rim, coloured and composited in order, premultiplied, exactly as
// a 2D canvas fill would be. The positions are worked out on the CPU (they
// carry damped pointer state) and uploaded once a frame; the GPU then draws all
// 1600 in a single call. The 2D canvas this replaces rasterised every dot on
// every frame, and at large windows that alone held the section near 80 fps.
const VERT = `
attribute vec2 aPos;
attribute float aRadius;
attribute float aAlpha;
attribute float aColored;
uniform vec2 uRes;
varying float vRadius;
varying float vAlpha;
varying float vColored;
void main() {
  vec2 clip = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  // Dots under a pixel are drawn at a pixel and dimmed by their real area, so
  // the dust keeps its weight instead of flickering in and out of the grid.
  float r = max(aRadius, 1.0);
  gl_PointSize = 2.0 * r + 2.0;
  vRadius = r;
  vAlpha = aAlpha * min(1.0, aRadius * aRadius);
  vColored = aColored;
}`;

const FRAG = `
precision mediump float;
uniform vec3 uInk;
uniform vec3 uAccent;
varying float vRadius;
varying float vAlpha;
varying float vColored;
void main() {
  float d = length(gl_PointCoord - 0.5) * (2.0 * vRadius + 2.0);
  float a = clamp(vRadius + 0.5 - d, 0.0, 1.0) * vAlpha;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(mix(uInk, uAccent, vColored) * a, a);
}`;

/** Any CSS colour, as 0–1 RGB, by letting the browser paint it. */
function toRgb(color: string): [number, number, number] {
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const g = probe.getContext('2d', { willReadFrequently: true });
  if (!g) return [0, 0, 0];
  g.fillStyle = '#000';
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
  return [r / 255, gr / 255, b / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/** A lightweight particle study; particles have depth, drift and damped pointer displacement. */
export function mountParticles(host: HTMLElement) {
  const canvas = host.querySelector('canvas');
  const card = host.closest<HTMLElement>('.service');
  if (!canvas || !card) return;
  const context = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!context) return; // the static SVG stays
  const gl = context;
  const vert = compile(gl, gl.VERTEX_SHADER, VERT);
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram();
  if (!vert || !frag || !program) return;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  gl.useProgram(program);
  const data = new Float32Array(COUNT * STRIDE);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  const bytes = Float32Array.BYTES_PER_ELEMENT;
  ([['aPos', 2, 0], ['aRadius', 1, 2], ['aAlpha', 1, 3], ['aColored', 1, 4]] as const).forEach(([name, size, offset]) => {
    const at = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, size, gl.FLOAT, false, STRIDE * bytes, offset * bytes);
  });
  const uRes = gl.getUniformLocation(program, 'uRes');
  const uInk = gl.getUniformLocation(program, 'uInk');
  const uAccent = gl.getUniformLocation(program, 'uAccent');
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Matches the stylesheet's stacked layout, where the art sits under the copy
  // and fades out downward instead of to the left.
  const stackedQuery = matchMedia('(max-width: 800px)');
  const next = card.parentElement?.nextElementSibling?.querySelector<HTMLElement>('.service') ?? null;
  let width = 1, height = 1, pixelRatio = 1;
  let frame = 0, visible = false, disposed = false, previous = 0, time = 0;
  let pointerX = -1000, pointerY = -1000, active = false, scroll = 0;
  let ink = '', accent = '';
  const variant = Number(host.dataset.particleVariant || 0);
  let seed = 26 + variant * 7919;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const particles = Array.from({ length: COUNT }, () => ({
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
    gl.uniform3fv(uInk, toRgb(ink));
    gl.uniform3fv(uAccent, toRgb(accent));
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
    const damp = reduced.matches ? 1 : 1 - Math.exp(-5 * dt);
    const stacked = stackedQuery.matches;
    let count = 0;
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
      const o = count++ * STRIDE;
      data[o] = px * pixelRatio;
      data[o + 1] = py * pixelRatio;
      data[o + 2] = size * pixelRatio;
      data[o + 3] = alpha;
      data[o + 4] = p.colored ? 1 : 0;
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, count * STRIDE));
    gl.drawArrays(gl.POINTS, 0, count);
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
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    readColors(); wake();
  };
  const move = (event: PointerEvent) => {
    const box = host.getBoundingClientRect();
    pointerX = event.clientX - box.left; pointerY = event.clientY - box.top;
    active = pointerX >= 0 && pointerX <= width && pointerY >= 0 && pointerY <= height;
    wake();
  };
  const leave = () => { active = false; wake(); };
  // A lost context (driver reset, too many contexts) falls back to the SVG.
  const onLost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame); frame = 0;
    disposed = true;
    delete host.dataset.ready;
  };
  canvas.addEventListener('webglcontextlost', onLost);
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
    canvas.removeEventListener('webglcontextlost', onLost);
    card.removeEventListener('pointermove', move); card.removeEventListener('pointerleave', leave);
    reduced.removeEventListener('change', wake); document.removeEventListener('visibilitychange', wake);
    document.removeEventListener('astro:before-swap', cleanup);
    gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vert); gl.deleteShader(frag);
  };
  document.addEventListener('astro:before-swap', cleanup, { once: true });
  resize();
}
