import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** One sculpture and renderer spanning the complete services story. */
export function mountSculpture(host: HTMLElement) {
  const canvas = host.querySelector('canvas');
  const story = host.closest<HTMLElement>('[data-services-story]');
  if (!canvas || !story) return;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x111519);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 4);
  key.position.set(-3, 6, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 30 });
  key.shadow.bias = -0.001;
  key.shadow.normalBias = 0.025;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbac8d8, 2.5);
  rim.position.set(5, 1, -3);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xe6ecf3, 0x101419, 0.35));
  // Sweep a rounded rectangular section along a curved spine. Subdivision
  // along the spine keeps twisting surfaces smooth and watertight.
  const segments = 144,
    sides = 32;
  const vertices: number[] = [],
    indices: number[] = [];
  const tangent = new THREE.Vector3(),
    normal = new THREE.Vector3(),
    binormal = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const x = -3.9 + (7.8 * i) / segments;
    const y = Math.sin(x * 0.66) * 1.35;
    const z = Math.cos(x * 0.55) * 0.55;
    tangent.set(1, Math.cos(x * 0.66) * 0.891, -Math.sin(x * 0.55) * 0.3025).normalize();
    normal.set(0, 1, 0).addScaledVector(tangent, -tangent.y).normalize();
    binormal.crossVectors(tangent, normal).normalize();
    const twist = x * 0.23;
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const c = Math.cos(angle),
        d = Math.sin(angle);
      const sy = 0.43 * Math.sign(c) * Math.pow(Math.abs(c), 0.32);
      const sz = 0.09 * Math.sign(d) * Math.pow(Math.abs(d), 0.32);
      const a = sy * Math.cos(twist) - sz * Math.sin(twist);
      const b = sy * Math.sin(twist) + sz * Math.cos(twist);
      vertices.push(
        x + normal.x * a + binormal.x * b,
        y + normal.y * a + binormal.y * b,
        z + normal.z * a + binormal.z * b
      );
      if (i < segments) {
        const n = i * sides + j,
          next = i * sides + ((j + 1) % sides);
        indices.push(n, next, n + sides, next, next + sides, n + sides);
      }
    }
  }
  for (const end of [0, segments]) {
    const offset = end * sides;
    for (let j = 1; j < sides - 1; j++) {
      if (end === 0) indices.push(offset, offset + j + 1, offset + j);
      else indices.push(offset, offset + j, offset + j + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0x4a4e53,
    metalness: 0.94,
    roughness: 0.32,
    envMapIntensity: 1.5,
  });
  const group = new THREE.Group();
  scene.add(group);
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((i - 3.5) * 0.18, (i - 3.5) * 0.06, (i - 3.5) * 0.48);
    mesh.rotation.z = (i - 3.5) * 0.025;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = new THREE.Vector2();
  const target = new THREE.Vector2();
  let frame = 0,
    visible = false,
    disposed = false,
    previous = 0,
    progress = 0,
    active = false;
  let width = 1,
    height = 1;
  const draw = (now: number) => {
    frame = 0;
    if (disposed) return;
    const dt = Math.min((now - (previous || now)) / 1000, 0.05);
    previous = now;
    const box = story.getBoundingClientRect();
    const desired = reduced.matches
      ? 0
      : Math.max(0, Math.min(1, -(box.top - 76) / Math.max(1, box.height - height)));
    progress += (desired - progress) * (reduced.matches ? 1 : 1 - Math.exp(-4 * dt));
    pointer.lerp(reduced.matches ? new THREE.Vector2() : target, 1 - Math.exp(-4 * dt));
    const mobile = width < 800;
    group.rotation.set(
      0.35 + progress * 0.55 + pointer.y * 0.05,
      -0.65 + progress * 1.2 + pointer.x * 0.08,
      -0.5 + progress * 0.32
    );
    group.position.set(mobile ? 0.4 : 2.2, mobile ? 1.55 : -0.05, 0);
    camera.position.set(
      0.3 + progress * 0.8,
      0.2 + progress * 0.4,
      mobile ? 15.4 : 12.5 - progress * 1.1
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    host.dataset.ready = 'true';
    host.dataset.interacting = active && !reduced.matches ? 'true' : 'false';
    host.dataset.chapter = String(Math.min(3, Math.round(progress * 3)));
    const settling = Math.abs(desired - progress) > 0.0005 || pointer.distanceTo(target) > 0.0005;
    if (visible && !document.hidden && !reduced.matches && settling)
      frame = requestAnimationFrame(draw);
  };
  const wake = () => {
    if (!frame && !disposed && visible && !document.hidden) {
      previous = 0;
      frame = requestAnimationFrame(draw);
    }
  };
  const resize = () => {
    const b = host.getBoundingClientRect();
    width = Math.max(1, b.width);
    height = Math.max(1, b.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    wake();
  };
  const move = (event: PointerEvent) => {
    const b = host.getBoundingClientRect();
    active = true;
    target.set(
      Math.max(-1, Math.min(1, ((event.clientX - b.left) / width) * 2 - 1)),
      Math.max(-1, Math.min(1, ((event.clientY - b.top) / height) * 2 - 1))
    );
    wake();
  };
  const leave = () => {
    active = false;
    target.set(0, 0);
    wake();
  };
  const scroll = () => wake();
  const observer = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (!visible && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      wake();
    },
    { threshold: 0.01 }
  );
  observer.observe(host);
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  story.addEventListener('pointermove', move);
  story.addEventListener('pointerleave', leave);
  window.addEventListener('scroll', scroll, { passive: true });
  document.addEventListener('visibilitychange', wake);
  reduced.addEventListener('change', wake);
  const cleanup = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    ro.disconnect();
    story.removeEventListener('pointermove', move);
    story.removeEventListener('pointerleave', leave);
    window.removeEventListener('scroll', scroll);
    document.removeEventListener('visibilitychange', wake);
    reduced.removeEventListener('change', wake);
    canvas.removeEventListener('webglcontextlost', lost);
    document.removeEventListener('astro:before-swap', cleanup);
    geometry.dispose();
    material.dispose();
    environment.dispose();
    renderer.dispose();
  };
  const lost = (event: Event) => {
    event.preventDefault();
    delete host.dataset.ready;
    cleanup();
  };
  canvas.addEventListener('webglcontextlost', lost);
  document.addEventListener('astro:before-swap', cleanup, { once: true });
  resize();
}
