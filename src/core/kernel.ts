import Module, { type CrossSection, type Manifold, type ManifoldToplevel } from 'manifold-3d';
import { parse as parseFont, type Font } from 'opentype.js/dist/opentype.mjs';
import { num, resolveParams, type Vars } from './expr';
import { EFFECTS, SHAPES } from './shapes';
import { find, rotM, mulV, type Bounds, type Doc, type Node } from './doc';
import { flatten, plainPaths, svgRegions } from './svg';
import { balloon } from './balloon';
import { loft } from './loft';
import { buildSolids, profileOf } from './solids';
import { cornerPolys, type P2 } from './corners';
import { repair, unpackMesh } from './mesh';
import { paintParts, type Stroke } from './paint';

/** paint.ix: üçgen başına 0 = color, k = paint.colors[k-1] */
export interface Part { color: string; hole: boolean; positions: Float32Array; indices: Uint32Array; paint?: { colors: string[]; ix: Uint8Array } }
export const triColor = (p: Part, t: number) => p.paint && p.paint.ix[t] ? p.paint.colors[p.paint.ix[t] - 1] : p.color;
/** Parçada gerçekten görünen renkler. */
export const partColors = (p: Part) => p.paint ? [...new Set([p.color, ...p.paint.ix.reduce((s, i) => (i && s.add(p.paint!.colors[i - 1]), s), new Set<string>())])] : [p.color];
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
  private assets: Record<string, string> = {};
  private triOf = new Map<number, { colors: string[]; tri: Uint8Array }>(); // özgün ağ -> üçgen renkleri

  /** Tüm belgeyi üretir. Bir nesnenin hatası diğerlerini durdurmaz. */
  build(doc: Doc): Built[] {
    const vars = resolveParams(doc.params); this.touched.clear(); this.assets = doc.assets ?? {};
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
            const part: Part = { color: s.color, hole: n.hole, positions: new Float32Array(positions), indices: new Uint32Array(g.triVerts) };
            if (!n.hole && !n.color) this.meshColors(part, g);
            return part;
          });
          hit = { parts: n.hole ? parts : paintParts(parts, this.strokes(n, vars)), volume, ...(parts.length ? {} : { error: 'Sonuç boş' }) };
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

  private meshColors(part: Part, g: { runOriginalID: Uint32Array; runIndex: Uint32Array; faceID: Uint32Array }) {
    if (!this.triOf.size || !g.faceID?.length) return;
    const colors: string[] = [], ix = new Uint8Array(part.indices.length / 3);
    g.runOriginalID.forEach((id, r) => {
      const src = this.triOf.get(id); if (!src) return;
      for (let t = g.runIndex[r] / 3; t < (g.runIndex[r + 1] ?? part.indices.length) / 3; t++) { const c = src.colors[src.tri[g.faceID[t]] ?? 0]; if (!c || c === part.color) continue; let i = colors.indexOf(c); if (i < 0) i = colors.push(c) - 1; ix[t] = i + 1; }
    });
    if (colors.length) part.paint = { colors, ix };
  }
  /** Alt nesnelerin boyaları grup koordinatına taşınır. */
  private strokes(n: Node, vars: Vars): Stroke[] {
    const kids = (n.children ?? []).filter(c => !c.hidden && !c.hole).flatMap(c => {
      const R = rotM(c.rot.map(x => num(x, vars))), s = c.scale.map(x => num(x, vars)), p = c.pos.map(x => num(x, vars)), k = Math.cbrt(Math.abs(s[0] * s[1] * s[2]));
      return this.strokes(c, vars).map(q => { const m = mulV(R, q.n.map((x, i) => x / s[i])), l = Math.hypot(...m) || 1; return { ...q, r: q.r * k, n: m.map(x => x / l), pts: q.pts.map(v => mulV(R, v.map((x, i) => x * s[i])).map((x, i) => x + p[i])) }; });
    });
    return [...kids, ...(n.paint ?? [])];
  }

  private key(n: Node, vars: Vars, withPlace: boolean): string {
    const p = Object.fromEntries(Object.entries(n.params).map(([k, v]) => [k, this.val(n, k, vars)]));
    return JSON.stringify([n.type, p, n.color, n.hole, n.mode, this.fxKey(n, vars), n.paint?.length ? n.paint : 0, withPlace ? [n.hidden, ...[...n.pos, ...n.rot, ...n.scale].map(x => num(x, vars))] : 0, n.children?.map(c => this.key(c, vars, true))]);
  }
  private fxKey(n: Node, vars: Vars) { return (n.effects ?? []).filter(e => !e.off).map(e => [e.type, EFFECTS[e.type].fields.map(f => this.fval(e, f.key, vars))]); }
  private fval(e: { type: string; params: Record<string, import('./expr').Num> }, k: string, vars: Vars) { const f = EFFECTS[e.type].fields.find(x => x.key === k)!, v = e.params[k] ?? f.def; return f.kind === 'num' ? num(v, vars) : f.kind === 'int' ? Math.round(num(v, vars)) : v; }
  private shapeKey(n: Node, vars: Vars) { return JSON.stringify([n.type, n.color, this.fxKey(n, vars), ...SHAPES[n.type].fields.map(f => this.val(n, f.key, vars))]); }
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
      if (!s) { s = this.effects(this.shape(n, vars), n, vars); this.shapeCache.set(key, s); }
      return s;
    }
    const T = (m: Manifold) => { temps.push(m); return m; };
    const placed = (c: Node) => this.local(c, vars, temps).map(s => {
      const a = T(s.m.scale(c.scale.map(x => num(x, vars)) as any)), b = T(a.rotate(c.rot.map(x => num(x, vars)) as any));
      return { color: s.color, m: T(b.translate(c.pos.map(x => num(x, vars)) as any)) };
    });
    const kids = n.children.filter(c => !c.hidden), solids = kids.filter(c => !c.hole).flatMap(placed), holes = kids.filter(c => c.hole).flatMap(placed);
    let res = solids.map(x => ({ ...x }));
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
    if (n.color && res.length) { const u = T(this.wasm.Manifold.union(res.map(r => r.m))); res = [{ color: n.color, m: u }]; }
    if (n.effects?.some(e => !e.off)) { res = this.effects(res.map(r => ({ color: r.color, m: r.m.translate([0, 0, 0]) })), n, vars); res.forEach(r => T(r.m)); }
    return res;
  }
  /** Şeklin 2B kesiti (yazı, SVG, poligon...); yoksa null. Çağıran siler. */
  profile(n: Node, vars: Vars): { color: string; cs: CrossSection; h: number }[] | null {
    if (!SHAPES[n.type]?.profile) return null;
    const g = (k: string) => this.val(n, k, vars) as number, t = (k: string) => String(this.val(n, k, vars)), { CrossSection } = this.wasm;
    if (n.type === 'svg') return svgRegions(this.wasm, t('svg'), g('width'), g('corner'), t('cornerStyle')).map((r, i) => ({ color: n.color || r.color, cs: r.cs, h: g('h') + i * g('step') }));
    let polys: P2[][];
    if (n.type === 'text') { const c = this.textCS(t('text'), g('size')); polys = c.toPolygons() as P2[][]; c.delete(); }
    else polys = profileOf(n.type, { g, t, label: (x, q) => this.textCS(x, q) })!;
    return [{ color: n.color || '#cccccc', cs: CrossSection.ofPolygons(cornerPolys(polys, g('corner'), t('cornerStyle')), n.type === 'text' ? 'EvenOdd' : 'NonZero'), h: g('h') }];
  }
  private shape(n: Node, vars: Vars): Solid[] {
    const { Manifold, CrossSection } = this.wasm, g = (k: string) => this.val(n, k, vars) as number, t = (k: string) => String(this.val(n, k, vars)), color = n.color || '#cccccc';
    const prof = this.profile(n, vars);
    if (prof) {
      const fx = (n.effects ?? []).filter(e => !e.off), b = fx.find(e => e.type === 'balloon'), v = fx.find(e => e.type === 'bevel');
      let solids: Solid[];
      try {
        solids = prof.map(r => ({ color: r.color, m: b ? this.blow(r.cs, b, vars) : v ? loft(this.wasm, r.cs, r.h, this.fval(v, 'top', vars) as number, this.fval(v, 'bottom', vars) as number, this.fval(v, 'style', vars) as string) : r.cs.extrude(r.h) }));
      } finally { prof.forEach(r => r.cs.delete()); }
      if (!n.color || solids.length === 1) return solids;
      const u = Manifold.union(solids.map(s => s.m)); solids.forEach(s => s.m.delete()); return [{ color: n.color, m: u }];
    }
    if (n.type === 'box') {
      const w = g('w'), d = g('d'), h = g('h'), r = Math.min(g('r'), w / 2 - 0.01, d / 2 - 0.01), e = Math.min(g('edge'), w / 2 - 0.01, d / 2 - 0.01, h / 2 - 0.01);
      const q = CrossSection.square(r > 0 ? [w - 2 * r, d - 2 * r] : [w, d], true); let o = r > 0 ? q.offset(r, 'Round', 2, 64) : q; if (o !== q) q.delete();
      // dikey kenarlar da aynı pahı alsın
      if (e > 0 && r < e) { const c = CrossSection.ofPolygons(cornerPolys(o.toPolygons() as P2[][], t('edgeStyle') === 'round' ? e : e, t('edgeStyle'))); o.delete(); o = c; }
      const m = e > 0 ? loft(this.wasm, o, h, e, e, t('edgeStyle')) : o.extrude(h); o.delete(); return [{ color, m }];
    }
    if (n.type === 'mesh') return this.meshSolids(n, t('asset'));
    const ms = buildSolids(this.wasm, n.type, { g, t, label: (x, q) => this.textCS(x, q) });
    if (!ms) throw new Error(`Bilinmeyen şekil: ${n.type}`);
    return ms.map(m => ({ color, m }));
  }
  private meshSolids(n: Node, asset: string): Solid[] {
    const data = this.assets[asset]; if (!data) throw new Error('Model verisi yok');
    const { Manifold, Mesh } = this.wasm;
    return unpackMesh(data).map(p => {
      const make = (q: typeof p) => {
        const id = Manifold.reserveIDs(1), nt = q.indices.length / 3;
        const m = new Manifold(new Mesh({ numProp: 3, vertProperties: q.positions, triVerts: q.indices, runIndex: new Uint32Array([0, nt * 3]), runOriginalID: new Uint32Array([id]), faceID: Uint32Array.from({ length: nt }, (_, i) => i) }));
        if (q.tri) this.triOf.set(id, { colors: q.colors, tri: q.tri });
        return m;
      };
      let m: Manifold;
      try { m = make(p); } catch { try { m = make(repair(this.wasm, p).part); } catch { throw new Error('Model onarılamadı: açık ya da kendini kesen yüzeyler var'); } }
      if (m.isEmpty()) throw new Error('Model katı bir gövde değil (hacmi yok)');
      return { color: n.color || p.colors[0], m };
    });
  }
  private blow(cs: CrossSection, e: { type: string; params: Record<string, import('./expr').Num> }, vars: Vars) {
    return balloon(this.wasm, cs, { height: this.fval(e, 'height', vars) as number, base: this.fval(e, 'base', vars) as number, detail: this.fval(e, 'detail', vars) as number, both: this.fval(e, 'style', vars) === 'both' });
  }
  /** Efektler sırayla uygulanır; girdiyi tüketir. */
  private effects(src: Solid[], n: Node, vars: Vars): Solid[] {
    let cur = src;
    for (const e of n.effects ?? []) {
      if (e.off || e.type === 'bevel' || (e.type === 'balloon' && SHAPES[n.type]?.profile)) continue;
      const f = (k: string) => this.fval(e, k, vars) as number, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const s of cur) { const b = s.m.boundingBox(); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); } }
      const size = hi.map((x, k) => x - lo[k]), big = Math.max(...size);
      const warp = (m: Manifold, len: number, fn: (v: [number, number, number]) => void) => { const r = m.refineToLength(Math.max(len, big / 150)), w = r.warp(fn as any); r.delete(); return w; };
      const next = cur.map(s => {
        let m: Manifold;
        switch (e.type) {
          case 'balloon': { const c = s.m.project(), k = c.simplify(1e-3); c.delete(); try { m = this.blow(k, e, vars); } finally { k.delete(); } break; }
          case 'twist': { const a = f('angle') * Math.PI / 180, cx = 0, cy = 0; m = warp(s.m, Math.min(size[2] / 12, big / 20), v => { const q = a * (v[2] - lo[2]) / (size[2] || 1), c = Math.cos(q), z = Math.sin(q), x = v[0] - cx, y = v[1] - cy; v[0] = cx + x * c - y * z; v[1] = cy + x * z + y * c; }); break; }
          case 'taper': { const t = f('top') / 100; m = warp(s.m, big, v => { const k = 1 + (t - 1) * (v[2] - lo[2]) / (size[2] || 1); v[0] *= k; v[1] *= k; }); break; }
          case 'bend': { const a = f('angle') * Math.PI / 180, r = size[0] / a, c = (lo[0] + hi[0]) / 2; if (size[2] >= r) throw new Error('Bükmek için şekil çok kalın ya da açı çok büyük'); m = warp(s.m, size[0] / 40, v => { const q = (v[0] - c) / r, d = r - (v[2] - lo[2]); v[0] = c + d * Math.sin(q); v[2] = lo[2] + r - d * Math.cos(q); }); break; }
          case 'wave': { const a = f('amp') / 2, l = f('len'); m = warp(s.m, l / 12, v => { v[2] += a * Math.sin(v[0] / l * 2 * Math.PI); }); break; }
          case 'cut': { const ax = 'xyz'.indexOf(this.fval(e, 'axis', vars) as string), at = lo[ax] + size[ax] * f('at') / 100, low = this.fval(e, 'keep', vars) === 'low', nr: [number, number, number] = [0, 0, 0]; nr[ax] = low ? -1 : 1; m = s.m.trimByPlane(nr, low ? -at : at); break; }
          case 'simplify': m = s.m.simplify(f('tol')); break;
          case 'conform': {
            const G = JSON.parse(String(this.fval(e, 'grid', vars)) || 'null') as { x: number; y: number; dx: number; dy: number; nx: number; ny: number; h: number[] } | null;
            if (!G) { m = s.m.translate([0, 0, 0]); break; }
            const H = (i: number, j: number) => G.h[Math.max(0, Math.min(G.ny - 1, j)) * G.nx + Math.max(0, Math.min(G.nx - 1, i))];
            m = warp(s.m, Math.min(G.dx, G.dy), v => { const u = Math.max(0, Math.min(G.nx - 1, (v[0] - G.x) / G.dx)), w = Math.max(0, Math.min(G.ny - 1, (v[1] - G.y) / G.dy)), i = Math.floor(u), j = Math.floor(w), a = u - i, b = w - j; v[2] += (H(i, j) * (1 - a) + H(i + 1, j) * a) * (1 - b) + (H(i, j + 1) * (1 - a) + H(i + 1, j + 1) * a) * b; }); break;
          }
          default: throw new Error(`Bilinmeyen efekt: ${e.type}`);
        }
        return { color: s.color, m };
      });
      cur.forEach(s => s.m.delete()); cur = next;
    }
    return cur;
  }
  /** Yazının vektör yolu (mm, y aşağı, ortalı). */
  textPath(text: string, size: number): string {
    if (!text.trim()) throw new Error('Yazı boş');
    const p = this.font.getPath(text, 0, 0, size / 0.62), b = p.getBoundingBox(), d = pathD(this.font.getPath(text, -(b.x1 + b.x2) / 2, -(b.y1 + b.y2) / 2, size / 0.62));
    return plainPaths(`<svg><path d="${d}"/></svg>`).map(x => x.d).join(''); // yalnız M L C Z
  }
  private textCS(text: string, size: number): CrossSection {
    if (!text.trim()) throw new Error('Yazı boş');
    if (text.length > 200) throw new Error('Yazı çok uzun');
    const k = size / 0.62, polys = flatten(pathD(this.font.getPath(text, 0, 0, k)), '', size / 1500).filter(c => c.pts.length > 2).map(c => c.pts.map(([x, y]) => [x, -y] as [number, number]).reverse());
    const a = this.wasm.CrossSection.ofPolygons(polys, 'NonZero'), b = a.bounds(), s = a.simplify(0.01); a.delete();
    const m = s.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2]); s.delete();
    if (m.isEmpty()) throw new Error('Bu yazı için harf bulunamadı');
    return m;
  }
}

/** opentype'ın toPathData'sı bazı sayıları NaN yazıyor: yol komutlardan kurulur. */
function pathD(p: { commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[] }) {
  const n = (v?: number) => (Math.round((v ?? 0) * 1e5) / 1e5).toString();
  return p.commands.map(c => c.type === 'Z' ? 'Z' : c.type === 'Q' ? `Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}` : c.type === 'C' ? `C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}` : `${c.type}${n(c.x)} ${n(c.y)}`).join('');
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
