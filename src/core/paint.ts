// Yüzey boyama: üçgen başına renk. Fırça sınırında ağ, komşularla uyumlu bölünür (su geçirmez kalır).
import type { Part } from './kernel';

/** r = 0: tıklanan yüzün tamamı; r > 0: pts boyunca fırça (nesnenin kendi koordinatında mm). */
export interface Stroke { pts: number[][]; n: number[]; r: number; color: string }
const LIMIT = 400_000;

export function triNormal(p: Float32Array, a: number, b: number, c: number) {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2], vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l];
}
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Noktanın üçgene uzaklığının karesi. */
function distTri(p: number[], a: number[], b: number[], c: number[]) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap); const at = (u: number, v: number) => { const q = [0, 1, 2].map(k => a[k] + ab[k] * u + ac[k] * v - p[k]); return dot(q, q); };
  if (d1 <= 0 && d2 <= 0) return at(0, 0);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return at(1, 0);
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0);
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return at(0, 1);
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return at(1 - w, w); }
  const k = 1 / (va + vb + vc); return at(vb * k, vc * k);
}
/** Üçgenin komşularına, komşu açı cosTol'dan dik değilse (ve başlangıç normaline seedTol kadar yakınsa) yayılır. */
export function flood(positions: Float32Array, indices: Uint32Array, seed: number, cosTol: number, seedTol = -2): number[] {
  // konuma göre kenar anahtarı: aynı köşe kopyaları da komşu sayılsın
  const id = new Map<string, number>(), vid = new Uint32Array(positions.length / 3);
  for (let i = 0; i < vid.length; i++) { const k = `${Math.round(positions[i * 3] * 1e4)},${Math.round(positions[i * 3 + 1] * 1e4)},${Math.round(positions[i * 3 + 2] * 1e4)}`; let j = id.get(k); if (j === undefined) { j = id.size; id.set(k, j); } vid[i] = j; }
  const N = id.size, em = new Map<number, number[]>(), nt = indices.length / 3;
  for (let t = 0; t < nt; t++) for (let q = 0; q < 3; q++) { const a = vid[indices[t * 3 + q]], b = vid[indices[t * 3 + (q + 1) % 3]], k = a < b ? a * N + b : b * N + a, l = em.get(k); if (l) l.push(t); else em.set(k, [t]); }
  const nrm = (t: number) => triNormal(positions, indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]), n0 = nrm(seed), done = new Set([seed]), q = [seed];
  for (let h = 0; h < q.length; h++) { const t = q[h], n = nrm(t); for (let e = 0; e < 3; e++) { const a = vid[indices[t * 3 + e]], b = vid[indices[t * 3 + (e + 1) % 3]]; for (const o of em.get(a < b ? a * N + b : b * N + a)!) if (!done.has(o)) { const m = nrm(o); if (dot(n, m) >= cosTol && dot(n0, m) >= seedTol) { done.add(o); q.push(o); } } } }
  return q;
}

export function paintParts(parts: Part[], strokes: Stroke[]): Part[] {
  if (!strokes.length) return parts;
  const out = parts.map(p => ({ ...p, paint: p.paint ? { colors: [...p.paint.colors], ix: new Uint8Array(p.paint.ix) } : { colors: [] as string[], ix: new Uint8Array(p.indices.length / 3) } }));
  const slot = (p: typeof out[number], c: string) => { if (c === p.color) return 0; let i = p.paint.colors.indexOf(c); if (i < 0) { if (p.paint.colors.length > 250) return 0; i = p.paint.colors.push(c) - 1; } return i + 1; };
  for (const s of strokes) {
    if (s.r <= 0) {
      let best = Infinity, bp: typeof out[number] | null = null, bt = -1;
      for (const p of out) if (!p.hole) for (let t = 0; t < p.indices.length; t += 3) { const n = triNormal(p.positions, p.indices[t], p.indices[t + 1], p.indices[t + 2]); if (dot(n, s.n) < 0.8) continue; const v = [0, 1, 2].map(q => { const i = p.indices[t + q] * 3; return [p.positions[i], p.positions[i + 1], p.positions[i + 2]]; }), d = distTri(s.pts[0], v[0], v[1], v[2]); if (d < best) { best = d; bp = p; bt = t / 3; } }
      if (bp && best < 1) { const c = slot(bp, s.color); for (const t of flood(bp.positions, bp.indices, bt, Math.cos(20 * Math.PI / 180))) bp.paint.ix[t] = c; }
      continue;
    }
    for (const p of out) if (!p.hole) {
      refine(p, s); const near = nearOf(s);
      const c = slot(p, s.color), r2 = s.r * s.r;
      for (let t = 0; t < p.indices.length; t += 3) { if (!near(p.positions, p.indices[t], p.indices[t + 1], p.indices[t + 2])) continue; const m = [0, 0, 0]; for (let q = 0; q < 3; q++) for (let k = 0; k < 3; k++) m[k] += p.positions[p.indices[t + q] * 3 + k] / 3; if (s.pts.some(x => (x[0] - m[0]) ** 2 + (x[1] - m[1]) ** 2 + (x[2] - m[2]) ** 2 < r2) && dot(triNormal(p.positions, p.indices[t], p.indices[t + 1], p.indices[t + 2]), s.n) > -0.1) p.paint.ix[t / 3] = c; }
    }
  }
  return out.map(p => p.paint.ix.some(Boolean) ? p : { ...p, paint: undefined });
}
/** Fırça kutusuna değmeyen üçgen hiç incelenmez. */
function nearOf(s: Stroke) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of s.pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k] - s.r * 1.2); hi[k] = Math.max(hi[k], q[k] + s.r * 1.2); }
  return (P: Float32Array, a: number, b: number, c: number) => { for (let k = 0; k < 3; k++) { const x = P[a * 3 + k], y = P[b * 3 + k], z = P[c * 3 + k]; if (Math.max(x, y, z) < lo[k] || Math.min(x, y, z) > hi[k]) return false; } return true; };
}
function refine(p: Part & { paint: { ix: Uint8Array } }, s: Stroke) {
  const min = Math.max(0.15, s.r / 6), near = nearOf(s);
  for (let pass = 0; pass < 14; pass++) {
    if (p.indices.length / 3 > LIMIT) return;
    const P = p.positions, nv = P.length / 3, mids = new Map<number, number>(), extra: number[] = [], dist = new Float32Array(nv).fill(-1);
    const dv = (i: number) => { if (dist[i] < 0) { let d = Infinity; for (const q of s.pts) d = Math.min(d, Math.hypot(P[i * 3] - q[0], P[i * 3 + 1] - q[1], P[i * 3 + 2] - q[2])); dist[i] = d; } return dist[i]; };
    const memo = new Map<number, boolean>();
    const cut = (a: number, b: number) => {
      const k = a < b ? a * nv + b : b * nv + a, h = memo.get(k); if (h !== undefined) return h;
      const A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], d = sub(B, A), L2 = dot(d, d); let ok = false;
      if (L2 > min * min && !(dv(a) < s.r && dv(b) < s.r)) { let m = Infinity; for (const q of s.pts) { const t = Math.max(0, Math.min(1, dot(sub(q, A), d) / L2)); m = Math.min(m, Math.hypot(A[0] + d[0] * t - q[0], A[1] + d[1] * t - q[1], A[2] + d[2] * t - q[2])); } ok = m < s.r; }
      memo.set(k, ok); return ok;
    };
    const mid = (a: number, b: number) => { const k = a < b ? a * nv + b : b * nv + a; let m = mids.get(k); if (m === undefined) { m = nv + extra.length / 3; mids.set(k, m); for (let q = 0; q < 3; q++) extra.push((P[a * 3 + q] + P[b * 3 + q]) / 2); } return m; };
    const ix: number[] = [], col: number[] = [];
    // büyük üçgenin içinde kalan fırça: kenara değmese de böl
    const inside = (a: number, b: number, c: number) => { const v = [a, b, c].map(i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]); return s.pts.some(q => distTri(q, v[0], v[1], v[2]) < s.r * s.r * 0.8); };
    const force = new Set<number>(), long = (a: number, b: number) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
    for (let t = 0; t < p.indices.length; t += 3) { const v = [p.indices[t], p.indices[t + 1], p.indices[t + 2]]; if (!near(P, v[0], v[1], v[2])) continue; if (cut(v[0], v[1]) || cut(v[1], v[2]) || cut(v[2], v[0])) continue; if (v.every(i => dv(i) < s.r)) continue; const L = [long(v[0], v[1]), long(v[1], v[2]), long(v[2], v[0])], m = Math.max(...L); if (m > min * 1.5 && inside(v[0], v[1], v[2])) { const q = L.indexOf(m), a = v[q], b = v[(q + 1) % 3]; force.add(a < b ? a * nv + b : b * nv + a); } }
    const need = (a: number, b: number) => cut(a, b) || force.has(a < b ? a * nv + b : b * nv + a);
    let any = false;
    for (let t = 0; t < p.indices.length; t += 3) {
      const c = p.paint.ix[t / 3], v = [p.indices[t], p.indices[t + 1], p.indices[t + 2]], nr = near(P, v[0], v[1], v[2]), f = nr ? [need(v[0], v[1]), need(v[1], v[2]), need(v[2], v[0])] : [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]].map(([a, b]) => force.has(a < b ? a * nv + b : b * nv + a)), n = +f[0] + +f[1] + +f[2], put = (...q: number[]) => { ix.push(...q); for (let i = 0; i < q.length; i += 3) col.push(c); };
      if (!n) { put(...v); continue; }
      any = true;
      if (n === 3) { const [x, y, z] = [mid(v[0], v[1]), mid(v[1], v[2]), mid(v[2], v[0])]; put(v[0], x, z, x, v[1], y, z, y, v[2], x, y, z); continue; }
      const r = n === 1 ? f.indexOf(true) : (f.indexOf(false) + 1) % 3, a = v[r], b = v[(r + 1) % 3], d = v[(r + 2) % 3], m = mid(a, b);
      if (n === 1) put(a, m, d, m, b, d);
      else { const m2 = mid(b, d); put(m, b, m2, a, m, m2, a, m2, d); } // kenar (a,b) ve (b,d) bölünür
    }
    if (!any) return;
    const np = new Float32Array(P.length + extra.length); np.set(P); np.set(extra, P.length);
    p.positions = np; p.indices = Uint32Array.from(ix); p.paint.ix = Uint8Array.from(col);
  }
}
