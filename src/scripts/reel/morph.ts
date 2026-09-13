/**
 * Reel morph — the picture that follows the scroll.
 *
 * One WebGL quad, drawn on a canvas that covers the reel's sticky stage. Two
 * empty DOM boxes give it its two homes: the thumbnail slot in the intro copy
 * and the full-width slot in the middle of the stage. Each frame the quad is
 * interpolated between those two rectangles by a scroll-driven progress, and
 * the interpolation runs per vertex — every vertex carries its own delay by
 * corner, so the top-right leads, the bottom-left trails, and the plane peels
 * out of its slot rather than sliding. A tilt peaks mid-travel and the sheet
 * bends with scroll velocity, the same bend the work grid uses.
 *
 * Because the canvas lives inside the sticky stage, both slots are measured
 * in stage space via offsetLeft/offsetTop (which ignore transforms) and stay
 * valid while the copy block translates away above. No DOM/WebGL scroll sync
 * is needed: the canvas moves with the page like any other element.
 *
 *   - Progress is damped, so the plane trails the scroll by ~100ms: that lag
 *     is the "follows you" feeling, not a bug.
 *   - Renders only while the stage is on screen and the tab is visible, and
 *     only when something changed (unless the source is a playing video).
 *   - Pixel ratio capped at 2.
 *
 * The caller decides whether to run it at all (reduced motion, no WebGL).
 */
import {
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  Vector4,
  VideoTexture,
  WebGLRenderer,
} from 'three';

export interface ReelMorphOptions {
  canvas: HTMLCanvasElement;
  /** The sticky, 100vh stage the canvas covers. Must be `position: sticky`
   *  (or otherwise positioned) so the slots' offsets resolve against it. */
  stage: HTMLElement;
  /** The tall wrapper that gives the stage its scroll distance. */
  runway: HTMLElement;
  /** Where the picture starts — an empty box in the intro copy. */
  thumb: HTMLElement;
  /** Where the picture ends — an empty box in the middle of the stage. */
  full: HTMLElement;
  /** The block that should scroll away 1:1 while the stage is pinned. */
  copy?: HTMLElement;
  /** What the quad shows. A video is sampled live; an image once. */
  source: HTMLVideoElement | HTMLImageElement;
  /** Corner radius in CSS px. */
  radius?: number;
  /** Fraction of the pinned scroll distance over which the morph completes.
   *  The remainder is the held, full-width reel. */
  morphSpan?: number;
  /** Rest tint, 0–1 RGB, multiplied into the desaturated thumbnail. */
  tint?: [number, number, number];
  /** Normalised scroll velocity, -1…1. Defaults to a scroll delta. */
  velocity?: () => number;
}

export interface ReelMorph {
  start(): void;
  stop(): void;
  destroy(): void;
  /** Current damped progress, 0…1. Useful for driving DOM alongside. */
  readonly progress: number;
}

const VERT = /* glsl */ `
uniform vec4 uStart;   // x, y, w, h in stage px, y down
uniform vec4 uEnd;
uniform float uProgress;
uniform float uVelocity;
uniform float uBend;   // px of bend at full velocity

varying vec2 vUv;
varying float vLocal;

const float SPREAD = 0.38;   // how far apart the corners' timings are
const float TILT   = 0.055;  // radians, peak mid-travel

vec2 rectPoint(vec4 r, vec2 uv) {
  // PlaneGeometry uv: (0,0) bottom-left, (1,1) top-right. Stage px is y-down.
  return vec2(r.x + r.z * uv.x, r.y + r.w * (1.0 - uv.y));
}

vec2 rotateAbout(vec2 p, vec2 c, float a) {
  float s = sin(a), k = cos(a);
  p -= c;
  return vec2(p.x * k - p.y * s, p.x * s + p.y * k) + c;
}

void main() {
  // Per-vertex delay by distance from the top-right corner, weighted toward
  // x so the right EDGE leads as a rounded front rather than the corner
  // alone spiking out. Bottom-left (0,0) trails at delay 1.
  float dx = 1.0 - uv.x;
  float dy = 1.0 - uv.y;
  float delay = sqrt(dx * dx * 0.65 + dy * dy * 0.35);
  float t0 = delay * SPREAD;
  float local = smoothstep(t0, t0 + (1.0 - SPREAD), uProgress);
  vLocal = local;

  vec2 p = mix(rectPoint(uStart, uv), rectPoint(uEnd, uv), local);

  // Swing: rotate about the interpolated centre, peaking mid-travel.
  vec2 c0 = uStart.xy + uStart.zw * 0.5;
  vec2 c1 = uEnd.xy + uEnd.zw * 0.5;
  vec2 c = mix(c0, c1, uProgress);
  p = rotateAbout(p, c, -sin(local * 3.14159265) * TILT);

  // Scroll bend: the centre of the sheet leads, the sides trail.
  float across = uv.x * 2.0 - 1.0;
  p.y -= uVelocity * (1.0 - across * across) * uBend;

  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, -p.y, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform sampler2D uMap;
uniform float uTexAspect;
uniform vec4 uStart;
uniform vec4 uEnd;
uniform float uProgress;
uniform float uRadius;
uniform vec3 uTint;

varying vec2 vUv;
varying float vLocal;

// Signed distance to a rounded box of half-size b and radius r, in px.
float roundedBox(vec2 q, vec2 b, float r) {
  vec2 d = abs(q) - b + vec2(r);
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

void main() {
  vec2 size = mix(uStart.zw, uEnd.zw, uProgress);
  float aspect = size.x / size.y;

  // object-fit: cover
  vec2 s = aspect > uTexAspect ? vec2(1.0, uTexAspect / aspect) : vec2(aspect / uTexAspect, 1.0);
  vec2 tuv = (vUv - 0.5) * s + 0.5;
  vec4 tex = texture2D(uMap, tuv);

  // Rest state mirrors the work cards: desaturated with a cool wash, coming
  // up to full colour as the reel opens.
  float luma = dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 rest = vec3(luma) * uTint;
  vec3 col = mix(rest, tex.rgb, smoothstep(0.2, 0.85, uProgress));

  // Rounded corners, anti-aliased over ~1.5px.
  vec2 q = (vUv - 0.5) * size;
  float d = roundedBox(q, size * 0.5, uRadius);
  float alpha = 1.0 - smoothstep(-0.75, 0.75, d);

  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt));

/** Box of `el` in `stage` space, ignoring transforms on anything between. */
function offsetRect(el: HTMLElement, stage: HTMLElement, out: Vector4) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== stage) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  out.set(x, y, el.offsetWidth, el.offsetHeight);
}

export function createReelMorph(options: ReelMorphOptions): ReelMorph {
  const {
    canvas,
    stage,
    runway,
    thumb,
    full,
    copy,
    source,
    radius = 16,
    morphSpan = 0.62,
    tint = [0.86, 0.9, 0.94],
  } = options;

  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  const camera = new OrthographicCamera(0, 1, 0, -1, -10, 10);
  camera.position.set(0, 0, 1);
  camera.lookAt(new Vector3(0, 0, 0));

  const isVideo = source instanceof HTMLVideoElement;
  const map: Texture = isVideo ? new VideoTexture(source) : new Texture(source);
  map.colorSpace = SRGBColorSpace;
  if (!isVideo) map.needsUpdate = true;

  const texAspect = () =>
    isVideo
      ? (source as HTMLVideoElement).videoWidth /
          Math.max(1, (source as HTMLVideoElement).videoHeight) || 16 / 9
      : (source as HTMLImageElement).naturalWidth /
          Math.max(1, (source as HTMLImageElement).naturalHeight) || 16 / 9;

  const uniforms = {
    uMap: { value: map },
    uTexAspect: { value: texAspect() },
    uStart: { value: new Vector4() },
    uEnd: { value: new Vector4() },
    uProgress: { value: 0 },
    uVelocity: { value: 0 },
    uBend: { value: 26 },
    uRadius: { value: radius },
    uTint: { value: new Vector3(...tint) },
  };

  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });

  // 48×48 is plenty for a smooth peel; the vertex shader is trivial.
  const mesh = new Mesh(new PlaneGeometry(1, 1, 48, 48), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // --- layout ----------------------------------------------------------------
  let width = 0;
  let height = 0;
  let holdDistance = 1; // px the stage stays pinned for
  let copyExit = 0; // px the copy travels before it is fully off the stage

  const measure = () => {
    width = stage.clientWidth;
    height = stage.clientHeight;
    renderer.setSize(width, height, false);
    camera.left = 0;
    camera.right = width;
    camera.top = 0;
    camera.bottom = -height;
    camera.updateProjectionMatrix();

    offsetRect(thumb, stage, uniforms.uStart.value);
    offsetRect(full, stage, uniforms.uEnd.value);
    holdDistance = Math.max(1, runway.offsetHeight - stage.offsetHeight);
    copyExit = copy ? copy.offsetTop + copy.offsetHeight : 0;
    uniforms.uTexAspect.value = texAspect();
    dirty = true;
  };

  // --- loop ------------------------------------------------------------------
  let raf = 0;
  let running = false;
  let onScreen = false;
  let dirty = true;
  let progress = 0;
  let lastTop = Number.NaN;
  let lastTime = 0;

  const scrollVelocity = () => {
    const top = runway.getBoundingClientRect().top;
    const v = Number.isNaN(lastTop) ? 0 : lastTop - top; // px per frame, down = +
    lastTop = top;
    return clamp(v / 42, -1, 1);
  };
  const velocityOf = options.velocity ?? scrollVelocity;

  const frame = (now: number) => {
    raf = 0;
    if (!running) return;

    const dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;

    // Where the stage is in its pin: 0 as it locks, 1 as it releases.
    const scrolled = clamp(-runway.getBoundingClientRect().top, 0, holdDistance);
    const target = clamp(scrolled / (holdDistance * morphSpan), 0, 1);

    // The copy leaves at native speed, then parks off the top of the stage.
    if (copy) {
      copy.style.transform = `translate3d(0, ${-Math.min(scrolled, copyExit).toFixed(1)}px, 0)`;
    }

    // Off screen: snap to where the scroll says we are and go to sleep. The
    // observer wakes the loop again on the way back in.
    if (!onScreen) {
      progress = target;
      uniforms.uProgress.value = progress;
      uniforms.uVelocity.value = 0;
      lastTop = Number.NaN;
      dirty = true;
      return;
    }

    const next = damp(progress, target, 9, dt);
    const v = velocityOf();
    const moved = Math.abs(next - progress) > 1e-4 || Math.abs(v - uniforms.uVelocity.value) > 1e-3;
    progress = next;
    uniforms.uProgress.value = progress;
    uniforms.uVelocity.value = damp(uniforms.uVelocity.value, v, 12, dt);

    if (moved || dirty || isVideo) {
      renderer.render(scene, camera);
      dirty = false;
    }
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (running && !raf) {
      lastTime = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  // Render only while the stage can be seen and the tab is visible.
  const io = new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting;
      if (isVideo) {
        const video = source as HTMLVideoElement;
        if (onScreen && document.visibilityState === 'visible') video.play().catch(() => {});
        else video.pause();
      }
      dirty = true;
      kick();
    },
    { rootMargin: '10% 0px' }
  );
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (isVideo) (source as HTMLVideoElement).pause();
    } else {
      dirty = true;
      if (isVideo && onScreen) (source as HTMLVideoElement).play().catch(() => {});
      kick();
    }
  };

  const ro = new ResizeObserver(() => {
    measure();
    kick();
  });

  const onMedia = () => {
    uniforms.uTexAspect.value = texAspect();
    dirty = true;
  };

  measure();

  return {
    get progress() {
      return progress;
    },
    start() {
      if (running) return;
      running = true;
      io.observe(stage);
      ro.observe(stage);
      document.addEventListener('visibilitychange', onVisibility);
      if (isVideo) source.addEventListener('loadedmetadata', onMedia);
      else source.addEventListener('load', onMedia);
      kick();
    },
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      source.removeEventListener('loadedmetadata', onMedia);
      source.removeEventListener('load', onMedia);
      if (isVideo) (source as HTMLVideoElement).pause();
    },
    destroy() {
      this.stop();
      if (copy) copy.style.removeProperty('transform');
      mesh.geometry.dispose();
      material.dispose();
      map.dispose();
      renderer.dispose();
    },
  };
}
