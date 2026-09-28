import * as THREE from 'three';

/** One live material study, scoped to the first service card. */
export function mountTension(host: HTMLElement) {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas');
  const card = host.closest<HTMLElement>('.service');
  if (!canvas || !card) return;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  } catch {
    return; // The image remains a usable fallback.
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0xedf1f4, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x34404e, 2.3));
  const key = new THREE.DirectionalLight(0xffffff, 4);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc5d7e7, 2);
  rim.position.set(4, -2, 3);
  scene.add(rim);
  const rows = 60;
  const steps = 86;
  const positions = new Float32Array(rows * (steps + 1) * 2 * 3);
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let j = 0; j < steps; j++) {
      const n = (r * (steps + 1) + j) * 2;
      indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const material = new THREE.MeshStandardMaterial({
    color: 0x68717b,
    metalness: 0.48,
    roughness: 0.3,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  group.add(mesh);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = new THREE.Vector2(0, 0);
  const target = new THREE.Vector2(0, 0);
  let strength = 0;
  let over = false;
  let visible = false;
  let frame = 0;
  let time = 0;
  let previous = 0;
  let disposed = false;
  let scroll = 0;
  let width = 1;
  let height = 1;
  const draw = (now: number) => {
    frame = 0;
    if (disposed) return;
    const dt = Math.min((now - (previous || now)) / 1000, 0.04);
    previous = now;
    if (!motion.matches) time += dt;
    pointer.lerp(target, 1 - Math.exp(-7 * dt));
    strength += ((over && !motion.matches ? 1 : 0) - strength) * (1 - Math.exp(-5 * dt));
    const rect = card.getBoundingClientRect();
    const nextScroll = motion.matches
      ? 0
      : Math.max(-1, Math.min(1, (innerHeight * 0.5 - rect.top - rect.height * 0.5) / innerHeight));
    scroll += (nextScroll - scroll) * 0.08;
    group.rotation.set(-0.14 + scroll * 0.13, -0.18 + scroll * 0.18, -0.36);
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const v = (r / (rows - 1) - 0.5) * 4.7;
      for (let j = 0; j <= steps; j++) {
        const u = (j / steps - 0.5) * 7.3;
        const taper = Math.sin((j / steps) * Math.PI);
        const dx = u - pointer.x;
        const dy = v - pointer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const pull = Math.exp((-distance * distance) / 2.3) * strength;
        const wave = Math.sin(u * 0.95 + v * 0.6 + time * 0.38) * 0.13;
        const z =
          Math.sin(u * 0.67 + v * 0.42) * 1.05 +
          Math.cos(v * 0.72) * 0.38 +
          wave * taper +
          pull * 1.2;
        for (let edge = 0; edge < 2; edge++) {
          positions[k++] = u + pull * dx * -0.08;
          positions[k++] =
            v + Math.sin(u * 0.7) * 0.32 + (edge ? 0.014 : -0.014) + pull * dy * -0.12;
          positions[k++] = z;
        }
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    renderer.render(scene, camera);
    host.dataset.ready = 'true';
    host.dataset.interacting = strength > 0.15 ? 'true' : 'false';
    if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(draw);
  };
  const wake = () => {
    if (!frame && !disposed && visible && !document.hidden) {
      previous = 0;
      frame = requestAnimationFrame(draw);
    }
  };
  const resize = () => {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = width < 450 ? 12.4 : 10.5;
    camera.updateProjectionMatrix();
    wake();
  };
  const move = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    const x = (event.clientX - rect.left) / width;
    const y = (event.clientY - rect.top) / height;
    over = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    target.set((x - 0.5) * 8, (0.5 - y) * 6);
    wake();
  };
  const leave = () => {
    over = false;
  };
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      wake();
    },
    { threshold: 0.01 }
  );
  observer.observe(host);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerleave', leave);
  document.addEventListener('visibilitychange', wake);
  motion.addEventListener('change', wake);
  const lost = (event: Event) => {
    event.preventDefault();
    delete host.dataset.ready;
    cleanup();
  };
  const cleanup = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    sizeObserver.disconnect();
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerleave', leave);
    document.removeEventListener('visibilitychange', wake);
    motion.removeEventListener('change', wake);
    canvas.removeEventListener('webglcontextlost', lost);
    document.removeEventListener('astro:before-swap', cleanup);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
  };
  canvas.addEventListener('webglcontextlost', lost);
  document.addEventListener('astro:before-swap', cleanup, { once: true });
  resize();
}
