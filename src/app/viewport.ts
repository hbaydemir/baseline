import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { triColor, type Built, type Part } from '../core/kernel';
import { flood } from '../core/paint';

export type Tool = 'translate' | 'rotate' | 'scale';
export type Mode = 'edit' | 'surface' | 'paint' | 'measure';
interface MPoint { p: THREE.Vector3; n: THREE.Vector3 | null }
interface Measure { a: MPoint; b: MPoint | null; el: HTMLDivElement }
export interface Moved { id: string; pos: number[]; rot: number[]; scale: number[] }
export interface PaintHit { id: string; pts: number[][]; n: number[]; r: number }
/** Seçilen yüzey: düzlem tabanı (dünya), yüzey sınırı (düzlem koordinatında mm, y aşağı) ve düz olup olmadığı. */
export interface Surface { id: string; origin: number[]; x: number[]; y: number[]; n: number[]; outline: string; flat: boolean }
const DEG = 180 / Math.PI, AX = ['x', 'y', 'z'] as const, COL = ['#e5484d', '#30a46c', '#1677ff'];
const v3 = (a: ArrayLike<number>) => new THREE.Vector3(a[0], a[1], a[2]);
const geoCache = new WeakMap<Part, THREE.BufferGeometry>();
function geometry(p: Part) {
  let g = geoCache.get(p);
  if (!g) {
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
    raw.setIndex(new THREE.BufferAttribute(p.indices, 1));
    g = toCreasedNormals(raw, 0.6);
    if (p.paint) { // üçgen başına renk
      const c = new Float32Array(p.indices.length * 3), col = new THREE.Color();
      for (let t = 0; t < p.indices.length / 3; t++) { col.set(triColor(p, t)).convertSRGBToLinear(); for (let k = 0; k < 3; k++) c.set([col.r, col.g, col.b], (t * 3 + k) * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    geoCache.set(p, g);
  }
  return g;
}
interface Drag { kind: 'move' | 'rot' | 'scale' | 'uniform' | 'body'; axis: number; sign: number; plane: THREE.Plane; start: THREE.Vector3; pivot: THREE.Vector3; objs: Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3; lo: THREE.Vector3; hi: THREE.Vector3 }>; box: THREE.Box3; moved: boolean; sx: number; sy: number }

export class Viewport {
  private renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  private scene = new THREE.Scene();
  private hud = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 1, 5000);
  private orbit: OrbitControls;
  private objs = new Map<string, THREE.Group>();
  private local = new Map<string, THREE.Box3>();
  private sel: string[] = [];
  private ro: ResizeObserver;
  private dirty = true;
  private raf = 0;
  private placedOnce = false;
  private handles = new THREE.Group();
  private hits: THREE.Mesh[] = [];
  private drag: Drag | null = null;
  private label: HTMLDivElement;
  private grid = new THREE.GridHelper(260, 26, '#8fa1b5', '#cbd5df');
  private measures: Measure[] = [];
  private hover3: MPoint | null = null;
  private mGroup = new THREE.Group();
  private cursor: THREE.Mesh;
  private stroke: THREE.Vector3[] = [];
  private strokeObj: string | null = null;
  private strokeN = new THREE.Vector3();
  private marks = new THREE.Group();
  tool: Tool = 'translate';
  mode: Mode = 'edit';
  magnet = true;
  symmetric = false;
  uniform = false;
  brush = 0; // 0 = yüz boya
  overhang = false;

  constructor(private host: HTMLElement, private cb: { select(id: string | null, add: boolean): void; moved(m: Moved[]): void; surface(s: Surface): void; paint(p: PaintHit): void; menu?(m: { x: number; y: number; id: string | null }): void }) {
    THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
    this.scene.background = new THREE.Color('#eef1f4');
    this.camera.up.set(0, 0, 1); this.camera.position.set(110, -190, 150);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.autoClear = false;
    host.appendChild(this.renderer.domElement);
    const key = new THREE.DirectionalLight('#fff', 2.2); key.position.set(-80, -120, 200);
    const fill = new THREE.DirectionalLight('#fff', 0.7); fill.position.set(150, 100, 60);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9aa4b0', 1.5), key, fill, this.marks);
    this.grid.rotation.x = Math.PI / 2; this.grid.position.z = -0.02; this.scene.add(this.grid);
    this.hud.add(this.handles, new THREE.AmbientLight('#fff', 2.4));
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color: '#1677ff', side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.9 }));
    this.cursor.visible = false; this.hud.add(this.cursor);
    this.label = document.createElement('div'); this.label.className = 'vp-label'; host.appendChild(this.label);
    const el = this.renderer.domElement;
    // OrbitControls'tan önce: tutamaç ya da seçili gövde tutulduysa kamerayı döndürme
    el.addEventListener('pointerdown', e => this.down(e));
    el.addEventListener('pointermove', e => this.move(e));
    el.addEventListener('pointerup', e => this.up(e));
    el.addEventListener('pointerleave', () => { this.cursor.visible = false; this.highlight(null); this.dirty = true; });
    // sağ tık menüsü: sağ sürükleme (kaydırma) değilse
    el.addEventListener('pointerdown', e => { if (e.button === 2) this.rdown = [e.clientX, e.clientY]; });
    el.addEventListener('contextmenu', e => {
      e.preventDefault(); const r0 = this.rdown; this.rdown = null;
      if (this.mode !== 'edit' || (r0 && Math.hypot(e.clientX - r0[0], e.clientY - r0[1]) > 4)) return;
      const h = this.hitObj(e); this.ctxHit = h ?? null; if (h && !this.sel.includes(h.object.userData.id)) this.cb.select(h.object.userData.id, false);
      this.cb.menu?.({ x: e.clientX, y: e.clientY, id: h ? h.object.userData.id : null });
    });
    this.orbit = new OrbitControls(this.camera, el);
    this.orbit.target.set(0, 0, 10); this.orbit.update();
    this.orbit.addEventListener('change', () => { this.dirty = true; });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.dirty) return;
      this.dirty = false; this.layout(); this.layoutMeasures();
      this.renderer.clear(); this.renderer.render(this.scene, this.camera); this.renderer.clearDepth(); this.renderer.render(this.hud, this.camera);
    };
    loop();
  }
  /** Yakındaki köşeye ya da kenar ortasına yapışan nokta; Shift ile serbest. */
  private snap(e: PointerEvent): MPoint | null {
    const h = this.hitObj(e); if (!h || !h.face) return null;
    const m = h.object as THREE.Mesh, P = (m.geometry as THREE.BufferGeometry).getAttribute('position'), f = h.face;
    const n = f.normal.clone().transformDirection(m.matrixWorld).normalize();
    if (e.shiftKey) return { p: h.point.clone(), n };
    const vs = [f.a, f.b, f.c].map(i => new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld));
    const cand = [...vs, ...[0, 1, 2].map(i => vs[i].clone().add(vs[(i + 1) % 3]).multiplyScalar(0.5))];
    const r = this.renderer.domElement.getBoundingClientRect(), scr = (v: THREE.Vector3) => { const q = v.clone().project(this.camera); return [(q.x + 1) / 2 * r.width + r.left, (1 - q.y) / 2 * r.height + r.top]; };
    let best: THREE.Vector3 | null = null, bd = 14;
    for (const c of cand) { const [x, y] = scr(c), d = Math.hypot(x - e.clientX, y - e.clientY); if (d < bd) { bd = d; best = c; } }
    return { p: best ?? h.point.clone(), n };
  }
  clearMeasures() { for (const m of this.measures) m.el.remove(); this.measures = []; this.hover3 = null; this.mGroup.clear(); this.dirty = true; }
  private layoutMeasures() {
    const G = this.mGroup; G.clear(); if (G.parent !== this.hud) this.hud.add(G);
    if (this.mode !== 'measure') return;
    const k = this.camera.position.distanceTo(this.orbit.target) * Math.tan(this.camera.fov / 2 / DEG) / (this.host.clientHeight || 1) * 2;
    const dot = (p: THREE.Vector3, c = '#ff8a00') => { const s = new THREE.Mesh(new THREE.SphereGeometry(4.5 * k, 16, 10), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); s.position.copy(p); G.add(s); };
    const line = (a: THREE.Vector3, b: THREE.Vector3, c = '#ff8a00') => { const g = new THREE.BufferGeometry().setFromPoints([a, b]); G.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: c, depthTest: false }))); };
    const r = this.host.getBoundingClientRect(), cr = this.renderer.domElement.getBoundingClientRect();
    for (const m of this.measures) {
      const b = m.b ?? this.hover3; dot(m.a.p);
      if (!b) { m.el.style.display = 'none'; continue; }
      dot(b.p, m.b ? '#ff8a00' : '#ffc380'); line(m.a.p, b.p, m.b ? '#ff8a00' : '#ffc380');
      const d = b.p.clone().sub(m.a.p), mid = m.a.p.clone().add(b.p).multiplyScalar(0.5).project(this.camera);
      const f = (x: number) => (Math.round(x * 100) / 100).toString();
      let extra = '';
      if (m.a.n && b.n) { const c = Math.abs(m.a.n.dot(b.n)); if (c > 0.9995) extra = `<br>yüzler arası ${f(Math.abs(d.dot(m.a.n)))} mm`; else extra = `<br>yüz açısı ${f(Math.acos(Math.min(1, Math.max(-1, -m.a.n.dot(b.n)))) * DEG)}°`; }
      m.el.innerHTML = `<b>${f(d.length())} mm</b><span>X ${f(Math.abs(d.x))} · Y ${f(Math.abs(d.y))} · Z ${f(Math.abs(d.z))}</span>${extra}`;
      Object.assign(m.el.style, { display: mid.z < 1 ? 'block' : 'none', left: `${(mid.x + 1) / 2 * cr.width + cr.left - r.left}px`, top: `${(1 - mid.y) / 2 * cr.height + cr.top - r.top}px` });
    }
    if (this.hover3 && (!this.measures.length || this.measures[this.measures.length - 1].b)) dot(this.hover3.p, '#ffc380');
  }
  /** Koyu temada arka plan ve ızgara. */
  setTheme(dark: boolean) {
    (this.scene.background as THREE.Color).set(dark ? '#1b1f24' : '#eef1f4');
    this.scene.remove(this.grid); this.grid.dispose();
    this.grid = new THREE.GridHelper(260, 26, dark ? '#4b5765' : '#8fa1b5', dark ? '#2c333c' : '#cbd5df'); this.grid.rotation.x = Math.PI / 2; this.grid.position.z = -0.02; this.scene.add(this.grid);
    this.dirty = true;
  }
  dispose() { cancelAnimationFrame(this.raf); this.ro.disconnect(); this.orbit.dispose(); this.renderer.dispose(); this.renderer.domElement.remove(); this.label.remove(); }
  private resize() { const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.dirty = true; }
  private ray(e: PointerEvent | MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, 1 - (e.clientY - r.top) / r.height * 2), this.camera); return ray;
  }
  private hitObj(e: PointerEvent | MouseEvent) { const hs = this.ray(e).intersectObjects([...this.objs.values()], true).filter(h => (h.object as THREE.Mesh).isMesh && h.object.userData.part); return hs.find(h => !h.object.userData.hole) ?? hs[0]; }

  update(built: Built[], sel: string[]) {
    const live = new Set(built.map(b => b.id));
    for (const [id, o] of this.objs) if (!live.has(id)) { this.scene.remove(o); this.objs.delete(id); }
    for (const b of built) {
      let o = this.objs.get(b.id);
      if (!o) { o = new THREE.Group(); o.rotation.order = 'ZYX'; this.objs.set(b.id, o); this.scene.add(o); }
      o.position.fromArray(b.pos); o.rotation.set(b.rot[0] / DEG, b.rot[1] / DEG, b.rot[2] / DEG, 'ZYX'); o.scale.fromArray(b.scale);
      const on = sel.includes(b.id), stamp = b.parts;
      if (o.userData.parts !== stamp || o.userData.on !== on || o.userData.over !== this.overhang) {
        o.userData = { parts: stamp, on, over: this.overhang };
        for (const c of [...o.children]) { o.remove(c); ((c as THREE.Mesh).material as THREE.Material).dispose(); }
        const box = new THREE.Box3();
        for (const p of b.parts) {
          const g = geometry(p); g.computeBoundingBox(); box.union(g.boundingBox!);
          const mat = p.hole
            ? new THREE.MeshStandardMaterial({ color: '#7c8794', transparent: true, opacity: 0.35, depthWrite: false })
            : new THREE.MeshStandardMaterial({ color: p.paint ? '#ffffff' : p.color, vertexColors: !!p.paint, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
          if (on) { mat.emissive.set('#1677ff'); mat.emissiveIntensity = 0.22; }
          const m = new THREE.Mesh(g, mat); m.userData = { id: b.id, hole: p.hole, part: p }; o.add(m);
          if (this.overhang && !p.hole) o.add(this.overhangMesh(p, o));
        }
        this.local.set(b.id, box);
      }
    }
    this.sel = sel.filter(id => this.objs.has(id));
    if (!this.placedOnce && built.length) { this.placedOnce = true; this.fit(); }
    this.dirty = true;
  }
  /** 45°'den yatık alt yüzeyler: destek ister. */
  private overhangMesh(p: Part, o: THREE.Group) {
    o.updateMatrixWorld(true);
    const nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld), pos: number[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), w = new THREE.Vector3();
    const P = p.positions, I = p.indices;
    let minZ = Infinity; for (let i = 0; i < P.length; i += 3) minZ = Math.min(minZ, w.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(o.matrixWorld).z);
    for (let t = 0; t < I.length; t += 3) {
      a.fromArray(P, I[t] * 3); b.fromArray(P, I[t + 1] * 3); c.fromArray(P, I[t + 2] * 3);
      n.subVectors(b, a).cross(w.subVectors(c, a)).applyMatrix3(nm).normalize();
      if (n.z > -0.7072) continue;
      const z = Math.min(a.clone().applyMatrix4(o.matrixWorld).z, b.clone().applyMatrix4(o.matrixWorld).z, c.clone().applyMatrix4(o.matrixWorld).z);
      if (z < minZ + 0.3) continue; // tablaya oturan yüz
      pos.push(...a.toArray(), ...b.toArray(), ...c.toArray());
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    m.raycast = () => {}; return m;
  }
  setOverhang(on: boolean) { this.overhang = on; for (const o of this.objs.values()) o.userData.over = !on; }
  private box(ids: string[]) { const b = new THREE.Box3(); for (const id of ids) { const o = this.objs.get(id); if (o) { o.updateMatrixWorld(true); for (const c of o.children) if (c.userData.part) b.union(new THREE.Box3().setFromObject(c, true)); } } return b; }
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
  /** Küçük resim (şablon kaydı için). */
  snapshot(size = 256): string {
    const c = document.createElement('canvas'), src = this.renderer.domElement, s = Math.min(src.width, src.height); c.width = c.height = size;
    this.dirty = true; this.renderer.render(this.scene, this.camera);
    c.getContext('2d')!.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size); return c.toDataURL('image/png');
  }

  // --- tutamaçlar ---
  private mat(c: string) { return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.4, depthTest: false, transparent: true }); }
  private hitMesh(geo: THREE.BufferGeometry, data: object) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false })); m.userData = data; this.hits.push(m); return m; }
  /** Her karede kameraya göre yeniden kurulur: sabit ekran boyu. */
  private layout() {
    this.handles.clear(); this.hits = [];
    if (this.mode !== 'edit' || !this.sel.length || (this.drag && this.drag.kind === 'body')) return;
    const box = this.box(this.sel); if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), k = this.camera.position.distanceTo(c) * Math.tan(this.camera.fov / 2 / DEG) / (this.host.clientHeight || 1) * 2; // px -> mm
    const G = this.handles;
    if (this.tool === 'translate') {
      const base = new THREE.Vector3(c.x, c.y, box.min.z), len = 70 * k;
      for (let i = 0; i < 3; i++) {
        const dir = new THREE.Vector3().setComponent(i, 1), from = i === 2 ? new THREE.Vector3(c.x, c.y, box.max.z) : base.clone().addScaledVector(dir, (box.max.getComponent(i) - box.min.getComponent(i)) / 2);
        const arrow = new THREE.Group(), shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * k, 2.2 * k, len), this.mat(COL[i])), head = new THREE.Mesh(new THREE.ConeGeometry(8 * k, 20 * k, 20), this.mat(COL[i]));
        shaft.position.y = len / 2; head.position.y = len + 8 * k; arrow.add(shaft, head, at(this.hitMesh(new THREE.CylinderGeometry(9 * k, 9 * k, len + 20 * k), { kind: 'move', axis: i }), new THREE.Vector3(0, len / 2 + 10 * k, 0)));
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); arrow.position.copy(from).addScaledVector(dir, 6 * k); G.add(arrow);
      }
      const disc = new THREE.Mesh(new THREE.CircleGeometry(14 * k, 32), this.mat('#1677ff')); (disc.material as THREE.MeshStandardMaterial).opacity = 0.55; disc.position.copy(base).setZ(box.min.z + 0.05);
      const ring = new THREE.Mesh(new THREE.RingGeometry(14 * k, 17 * k, 40), this.mat('#1677ff')); ring.position.copy(disc.position);
      G.add(disc, ring, at(this.hitMesh(new THREE.CircleGeometry(20 * k, 24), { kind: 'move', axis: -1 }), disc.position.clone()));
    } else if (this.tool === 'rotate') {
      const R = Math.max(box.getSize(new THREE.Vector3()).length() / 2 + 12 * k, 60 * k), view = this.camera.position.clone().sub(c).normalize();
      for (let i = 0; i < 3; i++) {
        const ax = new THREE.Vector3().setComponent(i, 1); let u = view.clone().projectOnPlane(ax); if (u.lengthSq() < 1e-6) u = new THREE.Vector3().setComponent((i + 1) % 3, 1); u.normalize();
        const v = ax.clone().cross(u), span = 70 / DEG, arc = new THREE.Group(), curve = new THREE.EllipseCurve(0, 0, R, R, -span / 2, span / 2), pts = curve.getPoints(40).map(p => new THREE.Vector3(p.x, p.y, 0));
        const path = new THREE.CatmullRomCurve3(pts);
        arc.add(new THREE.Mesh(new THREE.TubeGeometry(path, 40, 2.2 * k, 8), this.mat(COL[i])), this.hitMesh(new THREE.TubeGeometry(path, 20, 10 * k, 6), { kind: 'rot', axis: i }));
        for (const s of [-1, 1]) { const a = s * span / 2, cone = new THREE.Mesh(new THREE.ConeGeometry(7 * k, 18 * k, 20), this.mat(COL[i])); cone.position.set(R * Math.cos(a), R * Math.sin(a), 0); cone.rotation.z = a + (s > 0 ? 0 : Math.PI); arc.add(cone); }
        arc.matrixAutoUpdate = false; arc.matrix.makeBasis(u, v, ax).setPosition(c); G.add(arc);
      }
      const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.6 * k, R + 0.6 * k, 96), new THREE.MeshBasicMaterial({ color: '#8fa1b5', depthTest: false, transparent: true, opacity: 0.6, side: THREE.DoubleSide })); ring.position.copy(c); ring.lookAt(this.camera.position); G.add(ring);
    } else {
      const multi = this.sel.length > 1, o = this.objs.get(this.sel[0])!, lb = this.local.get(this.sel[0]);
      if (!multi && lb && !lb.isEmpty()) {
        o.updateMatrixWorld(true);
        const lc = lb.getCenter(new THREE.Vector3()), q = o.getWorldQuaternion(new THREE.Quaternion());
        for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
          const p = lc.clone().setComponent(i, s > 0 ? lb.max.getComponent(i) : lb.min.getComponent(i)).applyMatrix4(o.matrixWorld), dir = new THREE.Vector3().setComponent(i, s).applyQuaternion(q).normalize();
          const back = dir.dot(this.camera.position.clone().sub(p)) < 0, mat = this.mat(COL[i]); if (back) mat.opacity = 0.3;
          const cube = new THREE.Mesh(new THREE.BoxGeometry(14 * k, 14 * k, 14 * k), mat); cube.position.copy(p).addScaledVector(dir, 10 * k); cube.quaternion.copy(q);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * k, 1.4 * k, 10 * k), mat); stem.position.copy(p).addScaledVector(dir, 5 * k); stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          G.add(cube, stem, at(this.hitMesh(new THREE.SphereGeometry(13 * k, 10, 8), { kind: 'scale', axis: i, sign: s }), cube.position.clone()));
        }
      }
      const corner = box.max.clone(), ball = new THREE.Mesh(new THREE.SphereGeometry(8 * k, 20, 14), this.mat('#f5a524')); ball.position.copy(corner).add(new THREE.Vector3(8, 8, 8).multiplyScalar(k));
      G.add(ball, at(this.hitMesh(new THREE.SphereGeometry(15 * k, 10, 8), { kind: 'uniform', axis: -1 }), ball.position.clone()));
    }
  }

  // --- fare ---
  private start(kind: Drag['kind'], axis: number, sign: number, e: PointerEvent, at: THREE.Vector3) {
    const box = this.box(this.sel), c = box.getCenter(new THREE.Vector3()), view = this.camera.getWorldDirection(new THREE.Vector3());
    let plane: THREE.Plane, pivot = c.clone();
    if (kind === 'rot') plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3().setComponent(axis, 1), c);
    else if ((kind === 'move' && axis >= 0) || kind === 'scale' || kind === 'uniform') {
      const dir = kind === 'scale' ? new THREE.Vector3().setComponent(axis, 1).applyQuaternion(this.objs.get(this.sel[0])!.getWorldQuaternion(new THREE.Quaternion())) : kind === 'uniform' ? box.max.clone().sub(new THREE.Vector3(c.x, c.y, box.min.z)).normalize() : new THREE.Vector3().setComponent(axis, 1);
      const n = view.clone().projectOnPlane(dir); if (n.lengthSq() < 1e-8) n.copy(dir.clone().cross(new THREE.Vector3(0, 0, 1))); plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n.normalize(), at);
      if (kind === 'uniform') pivot = new THREE.Vector3(c.x, c.y, box.min.z);
    } else plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -at.z); // XY
    const start = this.ray(e).ray.intersectPlane(plane, new THREE.Vector3()) ?? at.clone();
    const objs = new Map([...this.sel].map(id => { const o = this.objs.get(id)!, lb = this.local.get(id) ?? new THREE.Box3(); return [id, { pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.clone(), lo: lb.min.clone(), hi: lb.max.clone() }]; }));
    this.drag = { kind, axis, sign, plane, start, pivot, objs, box, moved: false, sx: e.clientX, sy: e.clientY };
    this.orbit.enabled = false; this.renderer.domElement.setPointerCapture(e.pointerId);
  }
  private down(e: PointerEvent) {
    if (e.button === 0 && this.mode === 'measure') {
      const q = this.snap(e); if (!q) return;
      const last = this.measures[this.measures.length - 1];
      if (last && !last.b) last.b = q;
      else { const el = document.createElement('div'); el.className = 'vp-measure'; this.host.appendChild(el); this.measures.push({ a: q, b: null, el }); }
      this.dirty = true; return;
    }
    if (e.button !== 0) return;
    if (this.mode === 'surface') { const h = this.hitObj(e); if (h) { this.orbit.enabled = false; this.surface(h); } return; }
    if (this.mode === 'paint') {
      const h = this.hitObj(e); if (!h) return;
      this.orbit.enabled = false; this.renderer.domElement.setPointerCapture(e.pointerId);
      this.strokeObj = h.object.userData.id; this.stroke = [h.point.clone()]; this.strokeN.copy(h.face!.normal).transformDirection(h.object.matrixWorld);
      this.mark(h.point); if (!this.brush) this.finishStroke(); return;
    }
    const ray = this.ray(e), hh = ray.intersectObjects(this.hits, false)[0];
    if (hh) { e.stopImmediatePropagation(); this.start(hh.object.userData.kind, hh.object.userData.axis, hh.object.userData.sign ?? 1, e, hh.point); return; }
    const h = this.hitObj(e);
    this.drag = null;
    if (h && this.sel.includes(h.object.userData.id) && this.tool === 'translate') { e.stopImmediatePropagation(); this.start('body', -1, 1, e, h.point); return; }
    this.pressed = [e.clientX, e.clientY];
  }
  private pressed: [number, number] | null = null;
  private rdown: [number, number] | null = null;
  private ctxHit: THREE.Intersection | null = null;
  /** Sağ tıklanan yüze çiz. */
  surfaceAtMenu() { const h = this.ctxHit; this.ctxHit = null; if (h) this.surface(h); }
  hasMenuFace() { return !!this.ctxHit; }
  private mark(p: THREE.Vector3) {
    const r = this.brush || 1, m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: '#1677ff', transparent: true, opacity: 0.35, depthWrite: false }));
    m.position.copy(p); this.marks.add(m); this.dirty = true;
  }
  private finishStroke() {
    const o = this.objs.get(this.strokeObj ?? ''); this.marks.clear(); this.dirty = true;
    if (!o || !this.stroke.length) return;
    o.updateMatrixWorld(true);
    const inv = o.matrixWorld.clone().invert(), nm = new THREE.Matrix3().setFromMatrix4(o.matrixWorld).transpose(), s = o.scale, k = Math.cbrt(Math.abs(s.x * s.y * s.z)) || 1;
    const n = this.strokeN.clone().applyMatrix3(nm).normalize();
    this.cb.paint({ id: this.strokeObj!, pts: this.stroke.map(p => p.clone().applyMatrix4(inv).toArray().map(x => Math.round(x * 1000) / 1000)), n: n.toArray().map(x => Math.round(x * 1e4) / 1e4), r: this.brush / k });
    this.stroke = []; this.strokeObj = null;
  }
  private move(e: PointerEvent) {
    if (this.mode === 'measure') { this.hover3 = this.snap(e); this.dirty = true; return; }
    if (this.mode === 'surface') { this.highlight(e); return; }
    if (this.mode === 'paint') {
      const h = this.hitObj(e);
      this.cursor.visible = !!h && this.brush > 0;
      if (h) { this.cursor.position.copy(h.point); const n = h.face!.normal.clone().transformDirection(h.object.matrixWorld); this.cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); this.cursor.scale.setScalar(this.brush || 1); this.cursor.position.addScaledVector(n, 0.05); }
      if (h && this.strokeObj && h.object.userData.id === this.strokeObj && this.brush) { const last = this.stroke[this.stroke.length - 1]; const d = last.distanceTo(h.point); if (d > this.brush * 0.4 && this.stroke.length < 600) { const n = Math.min(40, Math.ceil(d / (this.brush * 0.4))); for (let i = 1; i <= n; i++) { const q = last.clone().lerp(h.point, i / n); this.stroke.push(q); this.mark(q); } } }
      this.dirty = true; return;
    }
    const d = this.drag; if (d) this.highlight(null); if (!d) { this.hover(e); this.highlight(e, true); return; }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
    d.moved = true;
    const p = this.ray(e).ray.intersectPlane(d.plane, new THREE.Vector3()); if (!p) return;
    const delta = p.clone().sub(d.start), fine = e.shiftKey, snap = (x: number, s: number) => Math.round(x / s) * s;
    if (d.kind === 'move' || d.kind === 'body') {
      if (d.axis >= 0) { const a = delta.getComponent(d.axis); delta.set(0, 0, 0).setComponent(d.axis, a); } else delta.z = 0;
      delta.set(snap(delta.x, fine ? 0.1 : 1), snap(delta.y, fine ? 0.1 : 1), snap(delta.z, fine ? 0.1 : 1));
      if (this.magnet && !fine) this.magnetize(d, delta);
      for (const [id, s] of d.objs) this.objs.get(id)!.position.copy(s.pos).add(delta);
      this.say(`X ${f1(delta.x)}  Y ${f1(delta.y)}  Z ${f1(delta.z)} mm`, e);
    } else if (d.kind === 'rot') {
      const ax = new THREE.Vector3().setComponent(d.axis, 1), a0 = d.start.clone().sub(d.pivot), a1 = p.clone().sub(d.pivot);
      let ang = Math.atan2(ax.dot(a0.clone().cross(a1)), a0.dot(a1)); ang = snap(ang * DEG, fine ? 1 : 15) / DEG;
      const q = new THREE.Quaternion().setFromAxisAngle(ax, ang);
      for (const [id, s] of d.objs) { const o = this.objs.get(id)!; o.quaternion.copy(q).multiply(s.quat); o.position.copy(s.pos).sub(d.pivot).applyQuaternion(q).add(d.pivot); }
      this.say(`${AX[d.axis].toUpperCase()} ekseninde ${f1(ang * DEG)}°`, e);
    } else if (d.kind === 'scale') {
      const [id, s] = [...d.objs][0], o = this.objs.get(id)!, dirW = new THREE.Vector3().setComponent(d.axis, d.sign).applyQuaternion(s.quat), ext = (s.hi.getComponent(d.axis) - s.lo.getComponent(d.axis)) * Math.abs(s.scale.getComponent(d.axis));
      let L = ext + delta.dot(dirW) * (this.symmetric ? 2 : 1); L = Math.max(0.1, fine ? L : Math.round(L));
      const f = L / (ext || 1), ns = s.scale.clone(); if (this.uniform) ns.multiplyScalar(f); else ns.setComponent(d.axis, s.scale.getComponent(d.axis) * f);
      // sabit kalan nokta: simetrikte orta, değilse karşı yüz; diğer eksenlerde orta (Z'de taban)
      const a = new THREE.Vector3(); for (let i = 0; i < 3; i++) a.setComponent(i, i === d.axis ? (this.symmetric ? (s.lo.getComponent(i) + s.hi.getComponent(i)) / 2 : d.sign > 0 ? s.lo.getComponent(i) : s.hi.getComponent(i)) : i === 2 ? s.lo.z : (s.lo.getComponent(i) + s.hi.getComponent(i)) / 2);
      o.scale.copy(ns); o.position.copy(s.pos).add(a.clone().multiply(s.scale.clone().sub(ns)).applyQuaternion(s.quat));
      const dims = [0, 1, 2].map(i => (s.hi.getComponent(i) - s.lo.getComponent(i)) * Math.abs(ns.getComponent(i)));
      this.say(`${dims.map(f1).join(' × ')} mm`, e);
    } else {
      const base = d.pivot, r0 = d.start.distanceTo(base), r1 = p.distanceTo(base); let f = r1 / (r0 || 1);
      const size = d.box.getSize(new THREE.Vector3()), big = Math.max(size.x, size.y, size.z); f = Math.max(0.01, fine ? f : Math.round(big * f) / big);
      for (const [id, s] of d.objs) { const o = this.objs.get(id)!; o.scale.copy(s.scale).multiplyScalar(f); o.position.copy(s.pos).sub(base).multiplyScalar(f).add(base); }
      this.say(`${f1(f * 100)} %  (${[size.x, size.y, size.z].map(x => f1(x * f)).join(' × ')} mm)`, e);
    }
    this.dirty = true;
  }
  private hover(e: PointerEvent) { const h = this.ray(e).intersectObjects(this.hits, false)[0]; this.renderer.domElement.style.cursor = h ? 'grab' : ''; }
  private up(e: PointerEvent) {
    this.orbit.enabled = true;
    if (this.mode === 'paint') { if (this.strokeObj) this.finishStroke(); return; }
    const d = this.drag; this.drag = null; this.label.style.display = 'none';
    if (d) { if (d.moved) this.commit([...d.objs.keys()]); else if (d.kind === 'body') this.cb.select(this.hitObj(e)?.object.userData.id ?? null, e.shiftKey || e.ctrlKey); this.dirty = true; return; }
    if (this.pressed && Math.hypot(e.clientX - this.pressed[0], e.clientY - this.pressed[1]) < 4) this.cb.select(this.hitObj(e)?.object.userData.id ?? null, e.shiftKey || e.ctrlKey);
    this.pressed = null;
  }
  private say(t: string, e: PointerEvent) { const r = this.host.getBoundingClientRect(); Object.assign(this.label.style, { display: 'block', left: `${e.clientX - r.left + 16}px`, top: `${e.clientY - r.top + 16}px` }); this.label.textContent = t; }
  /** Kenar, orta ve tabla hizasına yapış. */
  private magnetize(d: Drag, delta: THREE.Vector3) {
    const me = d.box.clone().translate(delta), others = [...this.objs.keys()].filter(id => !this.sel.includes(id)).map(id => this.box([id]));
    for (let i = 0; i < 3; i++) {
      if (d.axis >= 0 ? d.axis !== i : i === 2) continue;
      let best = 1.6, q = 0; const tryAt = (a: number, b: number) => { if (Math.abs(b - a) < best) { best = Math.abs(b - a); q = b - a; } };
      const lo = me.min.getComponent(i), hi = me.max.getComponent(i);
      if (i === 2) tryAt(lo, 0);
      for (const o of others) { for (const t of [o.min.getComponent(i), o.max.getComponent(i)]) { tryAt(lo, t); tryAt(hi, t); } tryAt((lo + hi) / 2, (o.min.getComponent(i) + o.max.getComponent(i)) / 2); }
      delta.setComponent(i, delta.getComponent(i) + q);
    }
  }
  private commit(ids: string[]) {
    this.cb.moved(ids.map(id => { const o = this.objs.get(id)!, r = new THREE.Euler().setFromQuaternion(o.quaternion, 'ZYX'); return { id, pos: o.position.toArray(), rot: [r.x * DEG, r.y * DEG, r.z * DEG], scale: o.scale.toArray() }; }));
  }

  // --- yüzey ---
  /** Tıklanan üçgenin yüzeyi: aynı düzlemdeki komşular; az çıkarsa eğri yüzey. */
  private region(p: Part, t: number) {
    let tris = flood(p.positions, p.indices, t, Math.cos(1 / DEG), Math.cos(1 / DEG)), flat = true;
    const area = (ts: number[]) => ts.reduce((s, i) => { const a = v3(p.positions.subarray(p.indices[i * 3] * 3)), b = v3(p.positions.subarray(p.indices[i * 3 + 1] * 3)), c = v3(p.positions.subarray(p.indices[i * 3 + 2] * 3)); return s + b.sub(a).cross(c.sub(a)).length() / 2; }, 0);
    if (tris.length < 3 && area(tris) < 30) { tris = flood(p.positions, p.indices, t, Math.cos(25 / DEG), Math.cos(70 / DEG)); flat = false; }
    return { tris, flat };
  }
  private hl: { mesh: THREE.Mesh; tris: Set<number>; obj: THREE.Mesh } | null = null;
  /** Yüzeye çizde imlecin altındaki yüzeyi vurgula. */
  private highlight(e: PointerEvent | null, onlySel = false) {
    const h0 = e && this.hitObj(e), h = h0 && (!onlySel || this.sel.includes(h0.object.userData.id)) ? h0 : null, m = h?.object as THREE.Mesh | undefined;
    if (!h || !m || h.faceIndex == null) { if (this.hl) { this.hl.obj.removeFromParent(); this.hl.obj.geometry.dispose(); this.hl = null; this.dirty = true; } return; }
    if (this.hl && this.hl.mesh === m && this.hl.tris.has(h.faceIndex)) return;
    if (this.hl) { this.hl.obj.removeFromParent(); this.hl.obj.geometry.dispose(); }
    const p = m.userData.part as Part, { tris } = this.region(p, h.faceIndex), pos = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => { for (let q = 0; q < 3; q++) pos.set(p.positions.subarray(p.indices[t * 3 + q] * 3, p.indices[t * 3 + q] * 3 + 3), i * 9 + q * 3); });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const obj = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffb020', transparent: true, opacity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false, side: THREE.DoubleSide }));
    obj.raycast = () => {}; m.parent!.add(obj);
    this.hl = { mesh: m, tris: new Set(tris), obj }; this.dirty = true;
  }
  private surface(h: THREE.Intersection) {
    const m = h.object as THREE.Mesh, p = m.userData.part as Part, t = h.faceIndex!;
    const { tris, flat } = this.region(p, t);
    m.updateMatrixWorld(true);
    const W = (i: number) => v3(p.positions.subarray(i * 3, i * 3 + 3)).applyMatrix4(m.matrixWorld);
    const n = h.face!.normal.clone().transformDirection(m.matrixWorld).normalize();
    const x = Math.abs(n.z) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1).cross(n).normalize(), y = n.clone().cross(x);
    // sınır kenarları: bir kez kullanılanlar
    const key = (a: THREE.Vector3) => `${Math.round(a.x * 1e3)},${Math.round(a.y * 1e3)},${Math.round(a.z * 1e3)}`, edges = new Map<string, [THREE.Vector3, THREE.Vector3]>();
    for (const i of tris) for (let q = 0; q < 3; q++) { const a = W(p.indices[i * 3 + q]), b = W(p.indices[i * 3 + (q + 1) % 3]), ka = key(a), kb = key(b); if (edges.has(`${kb}|${ka}`)) edges.delete(`${kb}|${ka}`); else edges.set(`${ka}|${kb}`, [a, b]); }
    const ptsAll = [...edges.values()].flat(), u = (a: THREE.Vector3) => a.dot(x), v = (a: THREE.Vector3) => a.dot(y);
    const lo = [Math.min(...ptsAll.map(u)), Math.min(...ptsAll.map(v))], hi = [Math.max(...ptsAll.map(u)), Math.max(...ptsAll.map(v))];
    const c2 = flat ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2] : [u(h.point), v(h.point)];
    const origin = x.clone().multiplyScalar(c2[0]).add(y.clone().multiplyScalar(c2[1])).add(n.clone().multiplyScalar(h.point.dot(n)));
    const outline = [...edges.values()].map(([a, b]) => `M${f3(u(a) - c2[0])} ${f3(-(v(a) - c2[1]))}L${f3(u(b) - c2[0])} ${f3(-(v(b) - c2[1]))}`).join('');
    this.cb.surface({ id: m.userData.id, origin: origin.toArray(), x: x.toArray(), y: y.toArray(), n: n.toArray(), outline, flat });
  }
  /** Düzlem noktalarından yüzeye uzaklık (eğri yüzeye oturtmak için). */
  heights(id: string, s: Surface, pts: [number, number][]): number[] {
    const o = this.objs.get(id); if (!o) return pts.map(() => 0);
    const O = v3(s.origin), X = v3(s.x), Y = v3(s.y), N = v3(s.n), ray = new THREE.Raycaster(), meshes = o.children.filter(c => c.userData.part && !c.userData.hole);
    return pts.map(([a, b]) => { const from = O.clone().addScaledVector(X, a).addScaledVector(Y, b).addScaledVector(N, 500); ray.set(from, N.clone().negate()); const h = ray.intersectObjects(meshes, false)[0]; return h ? h.point.clone().sub(O).dot(N) : NaN; });
  }
  setMode(m: Mode) { if (m !== 'measure') this.clearMeasures(); if (m !== 'surface') this.highlight(null); this.mode = m; this.cursor.visible = false; this.marks.clear(); this.renderer.domElement.style.cursor = m === 'edit' ? '' : 'crosshair'; this.dirty = true; }
}
const at = (m: THREE.Object3D, p: THREE.Vector3) => { m.position.copy(p); return m; };
const f1 = (x: number) => (Math.round(x * 10) / 10).toString(), f3 = (x: number) => (Math.round(x * 1000) / 1000).toString();
