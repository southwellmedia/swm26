/**
 * FounderRelight
 *
 * The founder's portrait, lit live. A depth map of the photograph gives every
 * pixel a height above the page; the shader takes surface normals from it and
 * re-lights the photograph with a lamp that follows the cursor. The
 * photograph's own key is estimated from the same normals and divided out
 * first, so the lamp replaces the light that was there rather than stacking
 * a second key on top of it: at rest the photograph is shown exactly as
 * shot, and the head leans a touch away from the hand so the relief reads
 * as depth rather than as a filter. With no cursor — on touch, or while
 * the reader is elsewhere — the lamp drifts on a slow orbit around the
 * photograph's own key, so the portrait is never quite still.
 *
 * Structure:
 *
 *   prep    scripts/founder-relight.mjs resizes the photograph and the depth
 *           map to one 1024-wide frame: MichaelFroseth-relight.webp and
 *           MichaelFroseth-relight-depth.webp (lossless, 0 far .. 1 near).
 *   quad    one full-canvas quad with a ShaderMaterial. Cover-fit, anchored
 *           top like the photograph it sits over, so the crop matches at
 *           every card size.
 *   frame   the pointer is smoothed on the CPU each frame; the shader gets a
 *           light position and a lean.
 *
 * Space: everything in the shader is in "page units", the canvas one unit
 * tall, y up, origin bottom-left, x running 0 .. aspect. The light lives in
 * that space at a height above the page. Depth is scaled by RELIEF, the
 * height of the relief in the same units.
 *
 * The loop runs only while the section is within 20% of the viewport and
 * the tab is visible: 60 fps while the pointer is moving, 30 fps while the
 * lamp drifts on its own, off when reduced motion holds the lamp still.
 * Plain three.js from one React effect, like HeroScene. The photograph
 * under the canvas stays the accessible image; the canvas is presentation.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';

/** What the canvas shows: the lit photograph, the relief as clay, the raw
 *  depth map, or the photograph as shot. */
export type RelightView = 'lit' | 'clay' | 'depth' | 'photo';
const VIEWS: { id: RelightView; label: string }[] = [
  { id: 'lit', label: 'Lit' },
  { id: 'clay', label: 'Clay' },
  { id: 'depth', label: 'Depth' },
  { id: 'photo', label: 'Photo' },
];

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Height of the relief, in page units (the canvas is one unit tall). */
const RELIEF = 0.3;
/** Texels each side of the sample the normal is measured across. */
const NORMAL_STEP = 3.0;
/** Height of the lamp above the page, in page units. */
const LIGHT_Z = 0.7;
/** Distance at which the lamp has fallen to half strength. */
const LIGHT_REACH = 0.68;
/** The shading model the photograph is assumed to carry, and the lamp
 *  re-applies: light that is always there, and the key on top of it. The
 *  ambient is high enough that the ratio never divides by a small number
 *  on the far side of the head. */
const AMBIENT = 0.55;
const KEY = 1.15;
/** Wrap of the diffuse term: 0 is a hard Lambert terminator, which draws a
 *  line along every ridge; 0.5 lets the light roll around the form. */
const WRAP = 0.5;
/** How far the lamp may take a pixel from the photograph, as a ratio of the
 *  photograph's own shading: below one darkens, above one brightens. */
const RATIO_MIN = 0.58;
const RATIO_MAX = 1.85;
/** Sheen on the clay view only: strength and tightness. */
const SHEEN = 0.12;
const SHEEN_POWER = 24.0;
/** How far the head leans away from the hand, in texture uv per unit depth. */
const LEAN = 0.008;
/** Where the photograph's own key sits, in page units relative to the
 *  canvas centre: the lamp rests there, and there the photograph is shown
 *  exactly as shot. Upper left, a little in front. */
const REST_LIGHT = new THREE.Vector2(-0.22, 0.28);
/** Radius and period of the resting drift. */
const DRIFT_R = 0.18;
const DRIFT_S = 16;
/** How far the pointer pulls the lamp from its rest, and the box it stays
 *  in (page units from the canvas centre): a nudge, not a torch. */
const PULL = 0.85;
const LAMP_BOX = new THREE.Vector2(0.7, 0.5);
/** Pointer smoothing, per second. */
const FOLLOW = 4.5;

const KEY_COLOR = new THREE.Color(1.0, 0.96, 0.91);

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uPhoto, uDepth;
  uniform vec2 uTexel;        // one texel of the textures, in uv
  uniform vec4 uCover;        // screen uv -> texture uv: scale.xy, offset.zw
  uniform float uAspect;      // canvas width / height
  uniform vec3 uLight;        // lamp, in page units (x 0..aspect, y 0..1, z up)
  uniform vec3 uRestLight;    // where the photograph's own key sits, same units
  uniform vec2 uLean;         // parallax, texture uv per unit depth
  uniform float uRelief, uStep, uReach, uAmbient, uKey, uSheen, uSheenPower;
  uniform float uRatioMin, uRatioMax, uWrap;
  uniform int uView;          // 0 lit, 1 clay, 2 depth, 3 photo
  uniform vec3 uKeyColor;

  varying vec2 vUv;

  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
  float depthAt(vec2 uv) { return texture2D(uDepth, uv).r; }

  void main() {
    vec2 uv0 = vUv * uCover.xy + uCover.zw;
    if (uView == 3) {
      gl_FragColor = vec4(texture2D(uPhoto, uv0).rgb, 1.0);
      return;
    }

    // Parallax: near pixels slide with the lean, the backdrop against it.
    // Two refinements are enough for a lean this small.
    float d = depthAt(uv0);
    vec2 uv = uv0 + (d - 0.5) * uLean;
    d = depthAt(uv);
    uv = uv0 + (d - 0.5) * uLean;
    d = depthAt(uv);

    // Normal from the depth gradient, measured in page units: the texture's
    // uv is stretched into the cover crop, so the slope is rescaled by it.
    vec2 s = uTexel * uStep;
    float dx = depthAt(uv + vec2(s.x, 0.0)) - depthAt(uv - vec2(s.x, 0.0));
    float dy = depthAt(uv + vec2(0.0, s.y)) - depthAt(uv - vec2(0.0, s.y));
    float dzdx = dx * uRelief / (2.0 * s.x) * uCover.x / uAspect;
    float dzdy = dy * uRelief / (2.0 * s.y) * uCover.y;
    vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0));

    // The surface point, and the lamp seen from it.
    vec3 p = vec3(vUv.x * uAspect, vUv.y, d * uRelief);
    vec3 l = uLight - p;
    float dist = length(l);
    l /= dist;
    float att = 1.0 / (1.0 + (dist * dist) / (uReach * uReach));
    float diff = clamp((dot(n, l) + uWrap) / (1.0 + uWrap), 0.0, 1.0);

    float shade = uAmbient + uKey * diff * att;

    // The photograph's own key, as the same lamp would have cast it: the
    // shading already baked into the pixels, estimated from the same
    // normals. With the lamp at rest the two agree and the photograph is
    // untouched; as the lamp moves, only the ratio between them is applied,
    // so the new light replaces the old rather than stacking on it.
    vec3 l0 = uRestLight - p;
    float dist0 = length(l0);
    l0 /= dist0;
    float att0 = 1.0 / (1.0 + (dist0 * dist0) / (uReach * uReach));
    float shade0 = uAmbient + uKey * clamp((dot(n, l0) + uWrap) / (1.0 + uWrap), 0.0, 1.0) * att0;

    float subject = smoothstep(0.02, 0.1, d);

    if (uView == 2) {
      gl_FragColor = vec4(vec3(d), 1.0);
      return;
    }

    if (uView == 1) {
      // Clay: the relief and the lamp on matte plaster, so the depth reads
      // on its own; the backdrop drops to a slate so the bust stands off it.
      vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
      float sheen = pow(max(dot(n, h), 0.0), uSheenPower) * att * subject;
      vec3 clay = mix(vec3(0.06), vec3(0.62), subject) * (shade * 1.25) + uSheen * sheen;
      gl_FragColor = vec4(toSRGB(clay), 1.0);
      return;
    }

    vec3 albedo = toLinear(texture2D(uPhoto, uv).rgb);
    float ratio = clamp(shade / shade0, uRatioMin, uRatioMax);
    vec3 c = albedo * mix(vec3(1.0), uKeyColor, smoothstep(1.0, 1.6, ratio)) * ratio;

    // Skin brought up by the lamp loses a little saturation, as it does
    // under a real one, rather than going orange.
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(c, vec3(lum), 0.18 * smoothstep(1.0, 1.6, ratio));

    // Soft knee above white, so the lit cheek blooms rather than clips.
    c = mix(c, 1.0 - exp(-c), smoothstep(0.7, 1.4, max(c.r, max(c.g, c.b))));
    gl_FragColor = vec4(toSRGB(c), 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

class RelightEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private uniforms: Record<string, THREE.IUniform>;

  private width = 1;
  private height = 1;
  private texAspect = 1;
  private loaded = false;

  /** Pointer in page units relative to the canvas centre; null when away. */
  private pointer: THREE.Vector2 | null = null;
  private lastClient = new THREE.Vector2();
  private hasClient = false;
  private light = new THREE.Vector2().copy(REST_LIGHT);
  private lean = new THREE.Vector2();
  private target = new THREE.Vector2().copy(REST_LIGHT);

  private near = false;
  private visible = true;
  private raf = 0;
  private last = 0;
  private clock = 0;

  reducedMotion = false;
  touch = false;
  onReady: (() => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private section: HTMLElement
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1);

    this.uniforms = {
      uPhoto: { value: null },
      uDepth: { value: null },
      uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
      uCover: { value: new THREE.Vector4(1, 1, 0, 0) },
      uAspect: { value: 1 },
      uLight: { value: new THREE.Vector3(0.3, 0.7, LIGHT_Z) },
      uRestLight: { value: new THREE.Vector3(0.3, 0.7, LIGHT_Z) },
      uLean: { value: new THREE.Vector2() },
      uRelief: { value: RELIEF },
      uStep: { value: NORMAL_STEP },
      uReach: { value: LIGHT_REACH },
      uAmbient: { value: AMBIENT },
      uKey: { value: KEY },
      uSheen: { value: SHEEN },
      uSheenPower: { value: SHEEN_POWER },
      uKeyColor: { value: KEY_COLOR },
      uRatioMin: { value: RATIO_MIN },
      uRatioMax: { value: RATIO_MAX },
      uWrap: { value: WRAP },
      uView: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));

    section.addEventListener('pointermove', this.onPointerMove);
    section.addEventListener('pointerleave', this.onPointerLeave);
  }

  async load(src: string, depthSrc: string) {
    const loader = new THREE.TextureLoader();
    const [photo, depth] = await Promise.all([loader.loadAsync(src), loader.loadAsync(depthSrc)]);
    for (const t of [photo, depth]) {
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.generateMipmaps = true;
      t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    }
    const img = photo.image as { width: number; height: number };
    this.texAspect = img.width / img.height;
    this.uniforms.uTexel.value.set(1 / img.width, 1 / img.height);
    this.uniforms.uPhoto.value = photo;
    this.uniforms.uDepth.value = depth;
    this.loaded = true;
    this.cover();
    this.wake();
  }

  resize(w: number, h: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.uniforms.uAspect.value = this.width / this.height;
    this.cover();
    this.wake();
  }

  /** Cover-fit, anchored at the top, like object-position: 50% 0%. */
  private cover() {
    const ca = this.width / this.height;
    const ta = this.texAspect;
    const c = this.uniforms.uCover.value as THREE.Vector4;
    if (ca > ta) {
      const fy = ta / ca;
      c.set(1, fy, 0, 1 - fy);
    } else {
      const fx = ca / ta;
      c.set(fx, 1, (1 - fx) / 2, 0);
    }
  }

  setNear(near: boolean) {
    this.near = near;
    this.wake();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.wake();
  }

  setView(view: RelightView) {
    this.uniforms.uView.value = VIEWS.findIndex((v) => v.id === view);
    this.wake();
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    this.lastClient.set(e.clientX, e.clientY);
    this.hasClient = true;
    this.wake();
  };

  private onPointerLeave = () => {
    this.hasClient = false;
    this.pointer = null;
    this.wake();
  };

  wake() {
    if (this.raf || !this.loaded || !this.near || !this.visible) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.near || !this.visible) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.clock += dt;

    // The pointer, read against the canvas once per frame, in page units.
    if (this.hasClient && !this.touch) {
      const r = this.canvas.getBoundingClientRect();
      if (r.height > 0) {
        const x = (this.lastClient.x - (r.left + r.width / 2)) / r.height;
        const y = (r.top + r.height / 2 - this.lastClient.y) / r.height;
        this.pointer = (this.pointer ?? new THREE.Vector2()).set(x, y);
      }
    }

    const drifting = !this.pointer && !this.reducedMotion;
    if (this.pointer) {
      this.target
        .copy(this.pointer)
        .sub(REST_LIGHT)
        .multiplyScalar(PULL)
        .add(REST_LIGHT)
        .clamp(LAMP_BOX.clone().negate(), LAMP_BOX);
    } else if (drifting) {
      const t = (this.clock / DRIFT_S) * Math.PI * 2;
      this.target.set(
        REST_LIGHT.x + Math.cos(t) * DRIFT_R,
        REST_LIGHT.y + Math.sin(t * 2) * DRIFT_R * 0.45
      );
    } else {
      this.target.copy(REST_LIGHT);
    }

    const k = 1 - Math.exp(-FOLLOW * dt);
    this.light.lerp(this.target, k);
    // The lean follows the lamp, capped so the far corner of the card does
    // not drag the head off its frame.
    const lx = THREE.MathUtils.clamp(this.light.x, -0.6, 0.6);
    const ly = THREE.MathUtils.clamp(this.light.y, -0.6, 0.6);
    this.lean.set(-lx * LEAN, -ly * LEAN);

    const aspect = this.width / this.height;
    (this.uniforms.uLight.value as THREE.Vector3).set(
      this.light.x + aspect / 2,
      this.light.y + 0.5,
      LIGHT_Z
    );
    (this.uniforms.uRestLight.value as THREE.Vector3).set(
      REST_LIGHT.x + aspect / 2,
      REST_LIGHT.y + 0.5,
      LIGHT_Z
    );
    (this.uniforms.uLean.value as THREE.Vector2).copy(this.lean);

    this.renderer.render(this.scene, this.camera);
    if (this.onReady) {
      const cb = this.onReady;
      this.onReady = null;
      cb();
    }

    const moving = this.light.distanceToSquared(this.target) > 1e-7;
    if (!moving && !drifting) {
      return; // Holds still: nothing to draw until something changes.
    }
    // 60 fps under the hand, 30 while the lamp drifts on its own.
    if (this.pointer) this.raf = requestAnimationFrame(this.frame);
    else this.raf = requestAnimationFrame(() => (this.raf = requestAnimationFrame(this.frame)));
  };

  dispose() {
    this.stop();
    this.section.removeEventListener('pointermove', this.onPointerMove);
    this.section.removeEventListener('pointerleave', this.onPointerLeave);
    (this.uniforms.uPhoto.value as THREE.Texture | null)?.dispose();
    (this.uniforms.uDepth.value as THREE.Texture | null)?.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface Props {
  /** The photograph, at the frame the depth map was made for. */
  src: string;
  /** Its depth map, white near, black far. */
  depthSrc: string;
}

export default function FounderRelight({ src, depthSrc }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RelightEngine | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** The card the controls are portaled into: set once the canvas is live,
   *  so with no WebGL there is nothing to explain and no controls. */
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<RelightView>('lit');

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    // The lamp follows the pointer across the whole card, not just the
    // photograph, so the light rakes in from the copy side too.
    const section = wrap.closest<HTMLElement>('.founder') ?? wrap;

    let engine: RelightEngine;
    try {
      engine = new RelightEngine(canvas, section);
    } catch {
      return; // No WebGL: the photograph underneath stays.
    }
    engineRef.current = engine;
    if (import.meta.env.DEV) {
      (window as unknown as { __founderRelight?: RelightEngine }).__founderRelight = engine;
    }

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hover = window.matchMedia('(hover: none)');
    engine.reducedMotion = motion.matches;
    engine.touch = hover.matches;
    // Fade the canvas over the photograph once the first lit frame is up,
    // and only then offer the controls.
    engine.onReady = () => {
      wrap.classList.add('is-ready');
      setHost(section);
    };
    engine.load(src, depthSrc).catch(() => {
      /* the photograph underneath stays */
    });

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      engine.resize(width, height);
    });
    ro.observe(wrap);
    engine.resize(wrap.clientWidth, wrap.clientHeight);

    const io = new IntersectionObserver(([entry]) => engine.setNear(entry.isIntersecting), {
      rootMargin: '20%',
    });
    io.observe(wrap);

    const onVisibility = () => engine.setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);

    const onMotion = () => {
      engine.reducedMotion = motion.matches;
      engine.wake();
    };
    const onHover = () => {
      engine.touch = hover.matches;
      engine.wake();
    };
    motion.addEventListener('change', onMotion);
    hover.addEventListener('change', onHover);

    return () => {
      motion.removeEventListener('change', onMotion);
      hover.removeEventListener('change', onHover);
      document.removeEventListener('visibilitychange', onVisibility);
      io.disconnect();
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
      wrap.classList.remove('is-ready');
      setHost(null);
    };
  }, [src, depthSrc]);

  // The panel closes on Escape, or on a press anywhere outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const choose = (next: RelightView) => {
    setView(next);
    engineRef.current?.setView(next);
  };

  // Geometry is inline so it can never depend on a stylesheet arriving: a
  // canvas left in the flow grows the figure, which resizes the canvas,
  // which grows the figure. Only the fade lives in Founder.astro's CSS.
  return (
    <>
      <div
        ref={wrapRef}
        className="founder-relight"
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
      >
        <canvas
          ref={canvasRef}
          className="founder-relight__canvas"
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
      {/* The explainer and the view switch live on the card, not in the
          figure: the figure's edges fade into the ground, and a control
          must not fade with them. */}
      {host &&
        createPortal(
          <div className="founder-relight__ui" ref={panelRef}>
            <button
              type="button"
              className="founder-relight__info"
              aria-label="About this portrait"
              aria-expanded={open}
              aria-controls="founder-relight-panel"
              onClick={() => setOpen((o) => !o)}
            >
              {/* Lucide's info glyph, inline: the icon set is inlined at build
                  time in Astro files, and this island has no other reason to
                  pull the React package in. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
            <div
              id="founder-relight-panel"
              className="founder-relight__panel"
              role="region"
              aria-label="About this portrait"
              hidden={!open}
            >
              <p className="founder-relight__title label-mono">DEPTH RELIGHT</p>
              <p className="founder-relight__text">
                The portrait is lit live. A depth map estimated from the photograph gives every
                pixel a height; a custom shader takes the surface from it, divides out the
                photograph's own key, and re-lights it with a lamp that follows your cursor, with a
                hint of parallax.
              </p>
              <p className="founder-relight__text founder-relight__text--dim">
                three.js, one GLSL fragment shader, a 1024px depth map. No video, no pre-rendered
                frames.
              </p>
              <div className="founder-relight__views" role="group" aria-label="View">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className="founder-relight__view"
                    aria-pressed={view === v.id}
                    onClick={() => choose(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          host
        )}
    </>
  );
}
