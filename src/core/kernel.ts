import Module, { type CrossSection, type Manifold, type ManifoldToplevel } from 'manifold-3d';
import { parse as parseFont, type Font } from 'opentype.js/dist/opentype.mjs';
import { num, resolveParams, type Vars } from './expr';
import { SHAPES } from './shapes';
import { find, type Bounds, type Doc, type Node } from './doc';
import { flatten, svgRegions } from './svg';
import { balloon } from './balloon';

export interface Part { color: string; hole: boolean; positions: Float32Array; indices: Uint32Array }
export interface Built { id: string; name: string; parts: Part[]; pos: number[]; rot: number[]; scale: number[]; error?: string; volume: number }
interface Solid { color: string; m: Manifold }

export class Kernel {
  private constructor(readonly wasm: ManifoldToplevel, private font: Font) {}
  static async create(o: { wasmUrl?: string; wasmBinary?: ArrayBuffer | Uint8Array; font: ArrayBuffer }) {
    const wasm = await Module({ ...(o.wasmUrl ? { locateFile: () => o.wasmUrl! } : {}), ...(o.wasmBinary ? { wasmBinary: o.wasmBinary } : {}) } as any);
    wasm.setup();
    return new Kernel(wasm, parseFont(o.font));
  }
  private shapeCache = new Map<string, Solid[]>();
  private builtCache = new Map<string, Pick<Built, 'parts' | 'error' | 'volume'>>();
  private touched = new Set<string>();

  /** Tüm belgeyi üretir. Bir nesnenin hatası diğerlerini durdurmaz. */
  build(doc: Doc): Built[] {
    const vars = resolveParams(doc.params); this.touched.clear();
    const keys = new Set<string>(), out: Built[] = [];
    for (const n of doc.nodes) {
      if (n.hidden) continue;
      const base = { id: n.id, name: n.name, pos: n.pos.map(x => num(x, vars)), rot: n.rot.map(x => num(x, vars)), scale: n.scale.map(x => num(x, vars)) };
      const key = this.key(n, vars, false); keys.add(key);
      let hit = this.builtCache.get(key);
      if (hit) this.touch(n, vars);
      else {
        const temps: Manifold[] = [];
        try {
          const solids = this.local(n, vars, temps);
          let volume = 0;
          const parts = solids.filter(s => !s.m.isEmpty()).map(s => {
            const g = s.m.getMesh(); volume += s.m.volume();
            let positions = g.vertProperties;
            if (g.numProp !== 3) { positions = new Float32Array(g.numVert * 3); for (let i = 0; i < g.numVert; i++) for (let k = 0; k < 3; k++) positions[i * 3 + k] = g.vertProperties[i * g.numProp + k]; }
            return { color: s.color, hole: n.hole, positions: new Float32Array(positions), indices: new Uint32Array(g.triVerts) };
          });
          hit = { parts, volume, ...(parts.length ? {} : { error: 'Sonuç boş' }) };
        } catch (e) { hit = { parts: [], volume: 0, error: (e as Error).message ?? String(e) }; }
        temps.forEach(m => m.delete());
        this.builtCache.set(key, hit);
      }
      out.push({ ...base, ...hit });
    }
    for (const k of this.builtCache.keys()) if (!keys.has(k)) this.builtCache.delete(k);
    for (const [k, v] of this.shapeCache) if (!this.touched.has(k)) { v.forEach(s => s.m.delete()); this.shapeCache.delete(k); }
    return out;
  }
  bounds = (doc: Doc, id: string): Bounds => {
    const f = find(doc.nodes, id);
    if (!f) throw new Error(`Nesne bulunamadı: ${id}`);
    const b = this.build({ ...doc, nodes: doc.nodes.map(n => ({ ...n, hidden: n.id !== id })) })[0];
    if (!b) throw new Error('Yalnız en üst düzey nesneler ölçülebilir');
    if (b.error) throw new Error(b.error);
    return builtBounds(b);
  };

  private key(n: Node, vars: Vars, withPlace: boolean): string {
    const p = Object.fromEntries(Object.entries(n.params).map(([k, v]) => [k, this.val(n, k, vars)]));
    return JSON.stringify([n.type, p, n.color, n.hole, n.mode, withPlace ? [n.hidden, ...[...n.pos, ...n.rot, ...n.scale].map(x => num(x, vars))] : 0, n.children?.map(c => this.key(c, vars, true))]);
  }
  private shapeKey(n: Node, vars: Vars) { return JSON.stringify([n.type, n.color, ...SHAPES[n.type].fields.map(f => this.val(n, f.key, vars))]); }
  private touch(n: Node, vars: Vars) { if (n.children) n.children.forEach(c => this.touch(c, vars)); else this.touched.add(this.shapeKey(n, vars)); }
  private val(n: Node, k: string, vars: Vars) {
    const f = SHAPES[n.type]?.fields.find(x => x.key === k), v = n.params[k] ?? f?.def;
    if (f?.kind !== 'num' && f?.kind !== 'int') return v;
    let x = num(v!, vars); if (f.kind === 'int') x = Math.round(x);
    return x;
  }
  private local(n: Node, vars: Vars, temps: Manifold[]): Solid[] {
    if (!n.children) {
      const key = this.shapeKey(n, vars); this.touched.add(key);
      let s = this.shapeCache.get(key);
      if (!s) { s = this.shape(n, vars); this.shapeCache.set(key, s); }
      return s;
    }
    const T = (m: Manifold) => { temps.push(m); return m; };
    const placed = (c: Node) => this.local(c, vars, temps).map(s => {
      const a = T(s.m.scale(c.scale.map(x => num(x, vars)) as any)), b = T(a.rotate(c.rot.map(x => num(x, vars)) as any));
      return { color: s.color, m: T(b.translate(c.pos.map(x => num(x, vars)) as any)) };
    });
    const kids = n.children.filter(c => !c.hidden), solids = kids.filter(c => !c.hole).flatMap(placed), holes = kids.filter(c => c.hole).flatMap(placed);
    let res = solids;
    if (n.mode === 'fused') {
      // sonra gelen renk öncekini keser: renkler arası çakışma kalmaz
      res = [];
      for (const s of solids) {
        res = res.map(r => r.color === s.color ? r : { color: r.color, m: T(r.m.subtract(s.m)) });
        const same = res.find(r => r.color === s.color);
        if (same) same.m = T(same.m.add(s.m)); else res.push({ ...s });
      }
    }
    if (holes.length) { const h = T(this.wasm.Manifold.union(holes.map(x => x.m))); res = res.map(r => ({ color: r.color, m: T(r.m.subtract(h)) })); }
    if (n.color) { const u = T(this.wasm.Manifold.union(res.map(r => r.m))); return [{ color: n.color, m: u }]; }
    return res;
  }
  private shape(n: Node, vars: Vars): Solid[] {
    const { Manifold, CrossSection } = this.wasm, g = (k: string) => this.val(n, k, vars) as number, t = (k: string) => String(this.val(n, k, vars));
    const ext = (cs: CrossSection, h: number) => { const m = cs.extrude(h); cs.delete(); return m; };
    const one = (m: Manifold): Solid[] => [{ color: n.color || '#cccccc', m }];
    const blow = (cs: CrossSection) => { const m = balloon(this.wasm, cs, { height: g('height'), base: g('base'), detail: g('detail'), both: t('style') === 'both' }); cs.delete(); return m; };
    switch (n.type) {
      case 'box': {
        const w = g('w'), d = g('d'), h = g('h'), r = Math.min(g('r'), w / 2 - 0.01, d / 2 - 0.01);
        if (r <= 0) { const c = Manifold.cube([w, d, h], true), m = c.translate([0, 0, h / 2]); c.delete(); return one(m); }
        const q = CrossSection.square([w - 2 * r, d - 2 * r], true), o = q.offset(r, 'Round', 2, 64); q.delete(); return one(ext(o, h));
      }
      case 'cylinder': {
        const lo = g('dia') / 2, hi = g('top') / 2, h = g('h');
        if (lo <= 0 && hi <= 0) throw new Error('İki çap birden sıfır olamaz');
        if (lo > 0) return one(Manifold.cylinder(h, lo, hi, g('seg')));
        const c = Manifold.cylinder(h, hi, 0, g('seg')), r = c.rotate([180, 0, 0]), m = r.translate([0, 0, h]); c.delete(); r.delete(); return one(m);
      }
      case 'sphere': { const s = Manifold.sphere(g('dia') / 2, g('seg')), m = s.translate([0, 0, g('dia') / 2]); s.delete(); return one(m); }
      case 'tube': {
        if (g('inner') >= g('dia')) throw new Error('İç çap dış çaptan küçük olmalı');
        const a = CrossSection.circle(g('dia') / 2, g('seg')), b = CrossSection.circle(g('inner') / 2, g('seg')), c = a.subtract(b); a.delete(); b.delete(); return one(ext(c, g('h')));
      }
      case 'gear': return one(this.gear(g('module'), g('teeth'), g('h'), g('bore'), g('angle'), g('backlash')));
      case 'text': return one(ext(this.textCS(t('text'), g('size')), g('h')));
      case 'balloonText': return one(blow(this.textCS(t('text'), g('size'))));
      case 'svg': case 'balloonSvg': {
        const regs = svgRegions(this.wasm, t('svg'), g('width'));
        const solids = regs.map((r, i) => ({ color: n.color || r.color, m: n.type === 'svg' ? ext(r.cs, g('h') + i * g('step')) : blow(r.cs) }));
        if (!n.color || solids.length === 1) return solids;
        const u = Manifold.union(solids.map(s => s.m)); solids.forEach(s => s.m.delete()); return [{ color: n.color, m: u }];
      }
    }
    throw new Error(`Bilinmeyen şekil: ${n.type}`);
  }
  private textCS(text: string, size: number): CrossSection {
    if (!text.trim()) throw new Error('Yazı boş');
    if (text.length > 200) throw new Error('Yazı çok uzun');
    const k = size / 0.62, polys = flatten(this.font.getPath(text, 0, 0, k).toPathData(5), '', size / 1500).filter(c => c.pts.length > 2).map(c => c.pts.map(([x, y]) => [x, -y] as [number, number]).reverse());
    const a = this.wasm.CrossSection.ofPolygons(polys, 'NonZero'), b = a.bounds(), s = a.simplify(0.01); a.delete();
    const m = s.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]); s.delete();
    if (m.isEmpty()) throw new Error('Bu yazı için harf bulunamadı');
    return m;
  }
  private gear(mod: number, z: number, h: number, bore: number, angle: number, backlash: number): Manifold {
    const { CrossSection } = this.wasm, rp = mod * z / 2, ro = rp + mod, rr = Math.max(rp - 1.25 * mod, mod * 0.5), rb = rp * Math.cos(angle * Math.PI / 180);
    if (bore / 2 > rr - 0.8) throw new Error(`Mil deliği çok büyük (en fazla ${(2 * (rr - 0.8)).toFixed(1)} mm)`);
    const inv = (r: number) => { const a = Math.acos(Math.min(1, rb / r)); return Math.tan(a) - a; };
    const half = Math.PI / (2 * z) - backlash / (4 * rp), at = (r: number) => Math.max(0.002, half + inv(rp) - inv(Math.max(r, rb)));
    const start = Math.max(rb, rr), pts: [number, number][] = [], P = (r: number, a: number) => pts.push([r * Math.cos(a), r * Math.sin(a)]);
    for (let i = 0; i < z; i++) {
      const c = i * 2 * Math.PI / z, foot = Math.min(at(start), Math.PI / z * 0.95);
      P(rr, c - foot);
      for (let k = 0; k <= 10; k++) { const r = start + (ro - start) * k / 10; P(r, c - Math.min(at(r), foot)); }
      for (let k = 10; k >= 0; k--) { const r = start + (ro - start) * k / 10; P(r, c + Math.min(at(r), foot)); }
      P(rr, c + foot);
    }
    let cs = CrossSection.ofPolygons([pts], 'NonZero');
    if (bore > 0) { const b = CrossSection.circle(bore / 2, 64), o = cs; cs = o.subtract(b); o.delete(); b.delete(); }
    const m = cs.extrude(h); cs.delete(); return m;
  }
}

/** Nesnenin dünya koordinatındaki dönüşüm matrisi (satır öncelikli 3x4). */
export function matrix(b: Pick<Built, 'pos' | 'rot' | 'scale'>): number[][] {
  const [a, c, e] = b.rot.map(d => d * Math.PI / 180), [sa, ca, sb, cb, sc, cc] = [Math.sin(a), Math.cos(a), Math.sin(c), Math.cos(c), Math.sin(e), Math.cos(e)];
  const R = [[cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa], [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa], [-sb, cb * sa, cb * ca]];
  return R.map((r, i) => [r[0] * b.scale[0], r[1] * b.scale[1], r[2] * b.scale[2], b.pos[i]]);
}
/** Parçaları dünya koordinatına taşır; aynalamada üçgen yönünü düzeltir. */
export function world(b: Built): Part[] {
  const M = matrix(b), flip = b.scale[0] * b.scale[1] * b.scale[2] < 0;
  return b.parts.map(p => {
    const q = new Float32Array(p.positions.length);
    for (let i = 0; i < q.length; i += 3) for (let k = 0; k < 3; k++) q[i + k] = M[k][0] * p.positions[i] + M[k][1] * p.positions[i + 1] + M[k][2] * p.positions[i + 2] + M[k][3];
    const ix = new Uint32Array(p.indices); if (flip) for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; }
    return { ...p, positions: q, indices: ix };
  });
}
export function builtBounds(b: Built): Bounds {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of world(b)) for (let i = 0; i < p.positions.length; i++) { const k = i % 3; min[k] = Math.min(min[k], p.positions[i]); max[k] = Math.max(max[k], p.positions[i]); }
  return { min, max };
}
