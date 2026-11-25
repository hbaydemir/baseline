import Delaunator from 'delaunator';
import Constrainautor from '@kninnug/constrainautor';
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
type P2 = [number, number];

/** Kenarları y şeritlerine ayırıp hızlı içeride-mi testi. */
class Inside {
  private rows: number[][]; private y0: number; private k: number; private e: number[][] = [];
  constructor(polys: P2[][]) {
    for (const p of polys) p.forEach((a, i) => { const b = p[(i + 1) % p.length]; if (a[1] !== b[1]) this.e.push([a[0], a[1], b[0], b[1]]); });
    let lo = Infinity, hi = -Infinity; for (const e of this.e) { lo = Math.min(lo, e[1], e[3]); hi = Math.max(hi, e[1], e[3]); }
    const n = Math.max(1, Math.min(2000, this.e.length)); this.y0 = lo; this.k = n / (hi - lo || 1);
    this.rows = Array.from({ length: n }, () => []);
    this.e.forEach((e, i) => { const r = (y: number) => Math.min(n - 1, Math.max(0, Math.floor((y - lo) * this.k))); for (let q = r(Math.min(e[1], e[3])); q <= r(Math.max(e[1], e[3])); q++) this.rows[q].push(i); });
  }
  has(x: number, y: number) {
    const row = this.rows[Math.floor((y - this.y0) * this.k)]; if (!row) return false;
    let c = false;
    for (const i of row) { const [ax, ay, bx, by] = this.e[i]; if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) c = !c; }
    return c;
  }
}
function resample(poly: P2[], s: number): P2[] {
  const out: P2[] = [];
  poly.forEach((a, i) => { const b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / s)); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); });
  return out;
}

interface Sheet { xy: P2[]; tris: [number, number, number][]; u: Float64Array }
function sheet(cs: CrossSection, s: number): Sheet {
  const index = new Map<string, number>(), pts: P2[] = [], cons = new Map<string, [number, number]>();
  const put = (p: P2) => { const k = `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`; let i = index.get(k); if (i === undefined) { i = pts.length; pts.push(p); index.set(k, i); } return i; };
  const con = (a: number, b: number) => { if (a !== b) cons.set(a < b ? `${a},${b}` : `${b},${a}`, [a, b]); };
  const border = (cs.toPolygons() as P2[][]).map(p => resample(p, s * 0.6));
  for (const p of border) { const id = p.map(put); id.forEach((a, i) => con(a, id[(i + 1) % id.length])); }
  const nb = pts.length;
  // kenarın dik kısmını yakalamak için içe doğru sıklaşan halkalar
  let core: P2[][] = [];
  for (const d of [0.08, 0.25, 0.5, 0.85, 1.3]) {
    const o = cs.offset(-d * s, 'Round', 2, 16), p = o.toPolygons() as P2[][]; o.delete();
    if (d === 1.3) core = p; else for (const q of p) for (const v of resample(q, s * 0.7)) put(v);
  }
  if (core.length) {
    const b = cs.bounds(), inn = new Inside(core); let row = 0;
    for (let y = b.min[1]; y < b.max[1]; y += s * 0.866, row++) for (let x = b.min[0] + (row % 2) * s / 2; x < b.max[0]; x += s) if (inn.has(x, y)) put([x, y]);
  }
  const ins = new Inside(border);
  let tris: [number, number, number][] = [];
  for (let pass = 0; ; pass++) {
    const del = Delaunator.from(pts);
    new Constrainautor(del as any, [...cons.values()]);
    tris = [];
    for (let i = 0; i < del.triangles.length; i += 3) {
      let [a, b, c] = del.triangles.subarray(i, i + 3);
      const A = pts[a], B = pts[b], C = pts[c], area = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (Math.abs(area) < 1e-10 || !ins.has((A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3)) continue;
      if (area < 0) [b, c] = [c, b];
      tris.push([a, b, c]);
    }
    if (pass === 4) break;
    // iki ucu da kenarda olan iç kirişler yüzeyi çökertir: ortasına nokta koy
    const n0 = pts.length;
    for (const t of tris) for (let q = 0; q < 3; q++) { const a = t[q], b = t[(q + 1) % 3]; if (a < b && a < nb && b < nb && !cons.has(`${a},${b}`)) put([(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2]); }
    if (pts.length === n0) break;
  }
  // Poisson: -Δu = 4, kenarda u = 0. Dairede √u tam yarım küredir.
  const n = pts.length, nbr: Map<number, number>[] = Array.from({ length: n }, () => new Map()), f = new Float64Array(n), diag = new Float64Array(n);
  for (const t of tris) {
    const [A, B, C] = t.map(i => pts[i]), area = ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) / 2;
    for (let q = 0; q < 3; q++) {
      const o = pts[t[q]], a = t[(q + 1) % 3], b = t[(q + 2) % 3], ux = pts[a][0] - o[0], uy = pts[a][1] - o[1], vx = pts[b][0] - o[0], vy = pts[b][1] - o[1];
      const w = (ux * vx + uy * vy) / (4 * area);
      nbr[a].set(b, (nbr[a].get(b) ?? 0) + w); nbr[b].set(a, (nbr[b].get(a) ?? 0) + w); diag[a] += w; diag[b] += w; f[t[q]] += 4 * area / 3;
    }
  }
  const edges = nbr.map(m => [...m]);
  const u = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
  const free = (i: number) => i >= nb && diag[i] > 0;
  let rz = 0; for (let i = nb; i < n; i++) if (free(i)) { r[i] = f[i]; z[i] = p[i] = r[i] / diag[i]; rz += r[i] * z[i]; }
  const stop = rz * 1e-14;
  for (let it = 0; it < 4000 && rz > stop; it++) {
    let pAp = 0;
    for (let i = nb; i < n; i++) if (free(i)) { let v = diag[i] * p[i]; for (const [j, w] of edges[i]) if (j >= nb) v -= w * p[j]; Ap[i] = v; pAp += v * p[i]; }
    const al = rz / pAp; let rz2 = 0;
    for (let i = nb; i < n; i++) if (free(i)) { u[i] += al * p[i]; r[i] -= al * Ap[i]; z[i] = r[i] / diag[i]; rz2 += r[i] * z[i]; }
    const be = rz2 / rz; rz = rz2; for (let i = nb; i < n; i++) p[i] = z[i] + be * p[i];
  }
  return { xy: pts, tris, u };
}

export function balloon(wasm: ManifoldToplevel, cs: CrossSection, o: { height: number; base: number; detail: number; both: boolean }): Manifold {
  const b = cs.bounds(), s = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) / o.detail;
  const parts = cs.decompose(), sheets: Sheet[] = [];
  let peak = 0;
  for (const c of parts) {
    // ortalama kol genişliği: ince harflerde ağ kendiliğinden sıklaşır
    const len = (c.toPolygons() as P2[][]).reduce((q, p) => q + p.reduce((w, a, i) => w + Math.hypot(a[0] - p[(i + 1) % p.length][0], a[1] - p[(i + 1) % p.length][1]), 0), 0), thick = 2 * c.area() / len;
    if (c.area() > s * s * 0.05) { const sh = sheet(c, Math.max(s / 6, Math.min(s, thick / 12))); sheets.push(sh); for (const v of sh.u) peak = Math.max(peak, v); }
    c.delete();
  }
  if (!peak) throw new Error('Balon için şekil çok ince; detayı artır');
  const k = o.height / Math.sqrt(peak);
  const solids = sheets.map(sh => {
    const map = new Int32Array(sh.xy.length).fill(-1), used: number[] = [];
    for (const t of sh.tris) for (const i of t) if (map[i] < 0) { map[i] = used.length; used.push(i); }
    const n = used.length, vert = new Float32Array(n * 6), tri: number[] = [], seen = new Set<string>();
    used.forEach((i, q) => {
      const h = Math.sqrt(Math.max(0, sh.u[i])) * k, [x, y] = sh.xy[i];
      vert.set([x, y, o.base + h], q * 3); vert.set([x, y, o.both ? -h : 0], (n + q) * 3);
    });
    for (const t of sh.tris) for (let q = 0; q < 3; q++) seen.add(`${t[q]},${t[(q + 1) % 3]}`);
    for (const t of sh.tris) {
      const [a, b2, c] = t.map(i => map[i]); tri.push(a, b2, c, n + a, n + c, n + b2);
      for (let q = 0; q < 3; q++) if (!seen.has(`${t[(q + 1) % 3]},${t[q]}`)) { const e = t[q], g = t[(q + 1) % 3]; tri.push(map[g], map[e], n + map[e], map[g], n + map[e], n + map[g]); }
    }
    const mesh = new wasm.Mesh({ numProp: 3, vertProperties: vert, triVerts: new Uint32Array(tri) });
    return new wasm.Manifold(mesh);
  });
  if (solids.length === 1) return solids[0];
  const all = wasm.Manifold.union(solids); solids.forEach(m => m.delete()); return all;
}
