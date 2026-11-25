// Poligon köşelerini kırma / yuvarlama. Eğrilerin sık noktaları köşe sayılmaz.
export type P2 = [number, number];
const CORNER = 20 * Math.PI / 180;
export function cornerPolys(polys: P2[][], size: number, style: string, pick: (p: P2) => boolean = () => true): P2[][] {
  return size > 0 ? polys.map(p => cornerPoly(p, size, style, pick)) : polys;
}
function cornerPoly(src: P2[], size: number, style: string, pick: (p: P2) => boolean): P2[] {
  const p = src.filter((a, i) => { const b = src[(i + 1) % src.length]; return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9; }), n = p.length;
  if (n < 3) return src;
  const turn = (i: number) => { const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n]; const x = Math.atan2(b[1] - a[1], b[0] - a[0]), y = Math.atan2(c[1] - b[1], c[0] - b[0]); let d = y - x; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const at: number[] = [0]; for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; at.push(at[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const total = at[n], pos = (s: number): P2 => { s = ((s % total) + total) % total; let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (at[m] <= s) lo = m; else hi = m; } const a = p[lo], b = p[(lo + 1) % n], t = (s - at[lo]) / (at[lo + 1] - at[lo] || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const cs = p.map((_, i) => i).filter(i => Math.abs(turn(i)) > CORNER && pick(p[i]));
  if (!cs.length) return p;
  const gaps = cs.map((c, k) => { const nx = cs[(k + 1) % cs.length]; let g = at[nx] - at[c]; if (g <= 0) g += total; return g; });
  const set = cs.map((_, k) => Math.min(size, gaps[k] * 0.49, gaps[(k + cs.length - 1) % cs.length] * 0.49));
  const out: P2[] = [];
  cs.forEach((c, k) => {
    const d = set[k], A = pos(at[c] - d), B = pos(at[c] + d), C = p[c];
    out.push(A);
    if (style === 'round') {
      const ux = A[0] - C[0], uy = A[1] - C[1], vx = B[0] - C[0], vy = B[1] - C[1], cosT = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
      const w = Math.sqrt(Math.max(0, (1 - cosT) / 2)); // koni eğrisi: düz kenarlarda tam yay
      const N = 12; for (let q = 1; q < N; q++) { const t = q / N, a = (1 - t) ** 2, b = 2 * t * (1 - t) * w, e = t * t, s = a + b + e; out.push([(a * A[0] + b * C[0] + e * B[0]) / s, (a * A[1] + b * C[1] + e * B[1]) / s]); }
    }
    out.push(B);
    // sonraki köşeye kadar aradaki noktalar
    const s0 = at[c] + d, s1 = at[c] + gaps[k] - set[(k + 1) % cs.length];
    for (let q = 1; q <= n; q++) { const j = (c + q) % n; let s = at[j]; while (s <= at[c]) s += total; if (s >= s1 - 1e-9) break; if (s > s0 + 1e-9) out.push(p[j]); }
  });
  return out;
}
