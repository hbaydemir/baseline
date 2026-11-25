import Delaunator from 'delaunator';
import Constrainautor from '@kninnug/constrainautor';
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { Inside } from './balloon';
import type { P2 } from './corners';

/** Yükseltme + üst/alt kenar pahı: kenar ile içe ötelenmiş halkalar arasında ağ örer. */
export function loft(wasm: ManifoldToplevel, cs: CrossSection, h: number, top: number, bottom: number, style: string): Manifold {
  if (top <= 0 && bottom <= 0) return cs.extrude(h);
  if (top + bottom > h - 0.01) throw new Error(`Pah toplamı yükseklikten (${h} mm) küçük olmalı`);
  const comps = cs.decompose(), out: Manifold[] = [];
  for (const c of comps) {
    let m: Manifold | null = null;
    try { m = one(wasm, c, h, top, bottom, style); if (m.isEmpty()) { m.delete(); m = null; } } catch { m = null; }
    out.push(m ?? stepped(wasm, c, h, top, bottom, style)); c.delete();
  }
  if (out.length === 1) return out[0];
  const u = wasm.Manifold.union(out); out.forEach(m => m.delete()); return u;
}
const rings = (size: number, style: string, N: number) => Array.from({ length: N }, (_, i) => { const t = (i + 1) / N, a = t * Math.PI / 2; return style === 'round' ? { off: size * (1 - Math.cos(a)), drop: size * (1 - Math.sin(a)) } : { off: size * t, drop: size * (1 - t) }; });
function one(wasm: ManifoldToplevel, cs: CrossSection, h: number, top: number, bottom: number, style: string): Manifold {
  const border = cs.toPolygons() as P2[][], ins = new Inside(border);
  const cap = (size: number) => {
    const pts: P2[] = [], drop: number[] = [], idx = new Map<string, number>(), cons: [number, number][] = [];
    const add = (polys: P2[][], z: number) => { for (const p of polys) { const ids = p.map(v => { const k = `${Math.round(v[0] * 1e5)},${Math.round(v[1] * 1e5)}`; let i = idx.get(k); if (i === undefined) { i = pts.length; idx.set(k, i); pts.push(v); drop.push(z); } return i; }); ids.forEach((a, q) => { const b = ids[(q + 1) % ids.length]; if (a !== b) cons.push([a, b]); }); } };
    add(border, size); const nb = pts.length;
    if (size > 0) for (const r of rings(size, style, style === 'round' ? 8 : 3)) { const o = cs.offset(-r.off, style === 'round' ? 'Round' : 'Miter', 3, 32), s = o.simplify(1e-3); add(s.toPolygons() as P2[][], r.drop); o.delete(); s.delete(); }
    const del = Delaunator.from(pts); new Constrainautor(del as any, cons);
    const tris: [number, number, number][] = [];
    for (let i = 0; i < del.triangles.length; i += 3) {
      let [a, b, c] = del.triangles.subarray(i, i + 3); const A = pts[a], B = pts[b], C = pts[c], ar = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (Math.abs(ar) < 1e-12 || !ins.has((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3)) continue;
      if (ar < 0) [b, c] = [c, b]; tris.push([a, b, c]);
    }
    return { pts, drop, tris, nb };
  };
  const T = cap(top), B = cap(bottom), n = T.pts.length, vert = new Float32Array((n + B.pts.length) * 3), tri: number[] = [], seen = new Set<string>();
  T.pts.forEach((p, i) => vert.set([p[0], p[1], h - T.drop[i]], i * 3));
  B.pts.forEach((p, i) => vert.set([p[0], p[1], B.drop[i]], (n + i) * 3));
  for (const t of T.tris) { tri.push(...t); for (let q = 0; q < 3; q++) seen.add(`${t[q]},${t[(q + 1) % 3]}`); }
  for (const [a, b, c] of B.tris) tri.push(n + a, n + c, n + b);
  for (const t of T.tris) for (let q = 0; q < 3; q++) { const e = t[q], g = t[(q + 1) % 3]; if (!seen.has(`${g},${e}`)) { if (e >= T.nb || g >= T.nb) throw new Error('kenar'); tri.push(g, e, n + e, g, n + e, n + g); } }
  return new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: vert, triVerts: new Uint32Array(tri) }));
}
/** Ağ örülemezse ince basamaklarla aynı biçim. */
function stepped(wasm: ManifoldToplevel, cs: CrossSection, h: number, top: number, bottom: number, style: string): Manifold {
  const N = 8, ms: Manifold[] = [];
  const slab = (off: number, z0: number, z1: number) => { const o = cs.offset(-off, 'Round', 2, 24); if (!o.isEmpty() && z1 > z0) { const e = o.extrude(z1 - z0); ms.push(e.translate([0, 0, z0])); e.delete(); } o.delete(); };
  slab(0, bottom, h - top);
  if (top > 0) for (const r of rings(top, style, N)) slab(r.off, bottom + (h - top - bottom) / 2, h - r.drop);
  if (bottom > 0) for (const r of rings(bottom, style, N)) slab(r.off, r.drop, bottom + (h - top - bottom) / 2);
  const u = wasm.Manifold.union(ms); ms.forEach(m => m.delete()); return u;
}
