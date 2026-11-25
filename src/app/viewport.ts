import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Built, Part } from '../core/kernel';

export type Tool = 'translate' | 'rotate' | 'scale';
export interface Moved { id: string; pos: number[]; rot: number[]; scale: number[] }
const DEG = 180 / Math.PI;
const geoCache = new WeakMap<Part, THREE.BufferGeometry>();
function geometry(p: Part) {
  let g = geoCache.get(p);
  if (!g) {
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    raw.setIndex(new THREE.BufferAttribute(p.indices, 1));
    g = toCreasedNormals(raw, 0.6);
    geoCache.set(p, g);
  }
  return g;
}

export class Viewport {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
  private orbit: OrbitControls;
  private gizmo: TransformControls;
  private objs = new Map<string, THREE.Group>();
  private pivot = new THREE.Object3D();
  private pivotStart = new THREE.Vector3();
  private starts = new Map<string, THREE.Vector3>();
  private sel: string[] = [];
  private ro: ResizeObserver;
  private dirty = true;
  private raf = 0;
  private placedOnce = false;
  magnet = true;

  constructor(private host: HTMLElement, private cb: { select(id: string | null, add: boolean): void; moved(m: Moved[]): void }) {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.scene.background = new THREE.Color('#eef1f4');
    this.camera.up.set(0, 0, 1); this.camera.position.set(110, -190, 150);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    const key = new THREE.DirectionalLight('#fff', 2.2); key.position.set(-80, -120, 200);
    const fill = new THREE.DirectionalLight('#fff', 0.7); fill.position.set(150, 100, 60);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9aa4b0', 1.5), key, fill, this.pivot);
    const grid = new THREE.GridHelper(260, 26, '#8fa1b5', '#cbd5df'); grid.rotation.x = Math.PI / 2; grid.position.z = -0.02; this.scene.add(grid);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 0, 10); this.orbit.update();
    this.orbit.addEventListener('change', () => { this.dirty = true; });
    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setTranslationSnap(1); this.gizmo.setRotationSnap(15 / DEG); this.gizmo.setSize(0.8);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('change', () => { this.dirty = true; });
    this.gizmo.addEventListener('objectChange', () => this.dragging());
    this.gizmo.addEventListener('dragging-changed', e => { this.orbit.enabled = !e.value; if (e.value) this.begin(); else this.commit(); });
    let down: [number, number] | null = null;
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => { down = e.button === 0 && !this.gizmo.axis ? [e.clientX, e.clientY] : null; });
    el.addEventListener('pointerup', e => { if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 4) this.pick(e); down = null; });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    const loop = () => { this.raf = requestAnimationFrame(loop); if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); } };
    loop();
  }
  dispose() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.gizmo.dispose(); this.orbit.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); }

  private resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true;
  }
  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), this.camera);
    const hit = ray.intersectObjects([...this.objs.values()], true).find(h => (h.object as THREE.Mesh).isMesh);
    this.cb.select((hit?.object.userData.id as string) ?? null, e.shiftKey || e.ctrlKey);
  }

  update(built: Built[], sel: string[]) {
    const live = new Set(built.map(b => b.id));
    for (const [id, o] of this.objs) if (!live.has(id)) { this.scene.remove(o); this.objs.delete(id); }
    for (const b of built) {
      let o = this.objs.get(b.id);
      if (!o) { o = new THREE.Group(); o.rotation.order = 'ZYX'; this.objs.set(b.id, o); this.scene.add(o); }
      o.position.fromArray(b.pos); o.rotation.set(b.rot[0] / DEG, b.rot[1] / DEG, b.rot[2] / DEG, 'ZYX'); o.scale.fromArray(b.scale);
      const on = sel.includes(b.id), stamp = b.parts;
      if (o.userData.parts !== stamp || o.userData.on !== on) {
        o.userData = { parts: stamp, on };
        for (const c of [...o.children]) { o.remove(c); ((c as THREE.Mesh).material as THREE.Material).dispose(); }
        for (const p of b.parts) {
          const mat = p.hole
            ? new THREE.MeshStandardMaterial({ color: '#7c8794', transparent: true, opacity: 0.35, depthWrite: false })
            : new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
          if (on) { mat.emissive.set('#1677ff'); mat.emissiveIntensity = 0.28; }
          const m = new THREE.Mesh(geometry(p), mat); m.userData.id = b.id; o.add(m);
        }
      }
    }
    this.sel = sel.filter(id => this.objs.has(id));
    if (this.sel.length === 1) this.gizmo.attach(this.objs.get(this.sel[0])!);
    else if (this.sel.length > 1) { const bx = this.box(this.sel); bx.getCenter(this.pivot.position); this.gizmo.attach(this.pivot); this.gizmo.setMode('translate'); }
    else this.gizmo.detach();
    if (!this.placedOnce && built.length) { this.placedOnce = true; this.fit(); }
    this.dirty = true;
  }
  setTool(t: Tool) { this.gizmo.setMode(this.sel.length > 1 ? 'translate' : t); this.dirty = true; }
  private box(ids: string[]) { const b = new THREE.Box3(); for (const id of ids) { const o = this.objs.get(id); if (o) { o.updateMatrixWorld(true); b.union(new THREE.Box3().setFromObject(o, false)); } } return b; }
  fit() {
    const b = this.box([...this.objs.keys()]); if (b.isEmpty()) b.set(new THREE.Vector3(-60, -60, 0), new THREE.Vector3(60, 60, 30));
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(30, b.getSize(new THREE.Vector3()).length() / 2);
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    this.orbit.target.copy(c); this.camera.position.copy(c).addScaledVector(dir, r / Math.sin(20 / DEG) * 1.1); this.orbit.update(); this.dirty = true;
  }
  view(v: 'top' | 'front' | 'right' | 'iso') {
    const d = { top: [0, -0.001, 1], front: [0, -1, 0], right: [1, 0, 0], iso: [0.45, -0.75, 0.55] }[v];
    const len = this.camera.position.distanceTo(this.orbit.target);
    this.camera.position.copy(this.orbit.target).add(new THREE.Vector3(...d as [number, number, number]).normalize().multiplyScalar(len)); this.orbit.update(); this.dirty = true;
  }
  private begin() { this.pivotStart.copy(this.pivot.position); this.starts.clear(); for (const id of this.sel) this.starts.set(id, this.objs.get(id)!.position.clone()); }
  private dragging() {
    this.dirty = true;
    if (this.gizmo.mode !== 'translate' || !this.gizmo.dragging) return;
    const multi = this.sel.length > 1;
    const follow = () => { if (multi) for (const id of this.sel) this.objs.get(id)!.position.copy(this.starts.get(id)!).add(this.pivot.position).sub(this.pivotStart); };
    follow();
    if (!this.magnet) return;
    // mıknatıs: kenar, orta ve tabla hizasına yapış
    const me = this.box(this.sel), others = [...this.objs.keys()].filter(id => !this.sel.includes(id)).map(id => this.box([id]));
    const target = multi ? this.pivot : this.objs.get(this.sel[0])!;
    (['x', 'y', 'z'] as const).forEach(ax => {
      if (!this.gizmo.axis?.toLowerCase().includes(ax)) return;
      let best = 1.6, d = 0;
      const tryAt = (a: number, b: number) => { const q = b - a; if (Math.abs(q) < best) { best = Math.abs(q); d = q; } };
      const mid = (me.min[ax] + me.max[ax]) / 2;
      if (ax === 'z') tryAt(me.min.z, 0);
      for (const o of others) { for (const t of [o.min[ax], o.max[ax]]) { tryAt(me.min[ax], t); tryAt(me.max[ax], t); } tryAt(mid, (o.min[ax] + o.max[ax]) / 2); }
      target.position[ax] += d;
    });
    follow();
  }
  private commit() {
    this.cb.moved(this.sel.map(id => { const o = this.objs.get(id)!; return { id, pos: o.position.toArray(), rot: [o.rotation.x * DEG, o.rotation.y * DEG, o.rotation.z * DEG], scale: o.scale.toArray() }; }));
  }
}
