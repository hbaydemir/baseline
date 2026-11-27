// Sanatsal ortam fırçası (Corel Artistic Media): çizilen yol kalınlığı değişen kapalı vektör şekle dönüşür.
// Hazır profil, kaligrafi (eğik uç), basınç (kalem tableti; fareyle ↑ ↓) ve püskürtme (yol boyunca şekil serpiştirme).
import type { ManifoldToplevel } from 'manifold-3d';
import * as V from './vector';
import * as O from './vectorOps';

type P = V.V;
type W = ManifoldToplevel;
export type BrushMode = 'preset' | 'calli' | 'pressure' | 'spray';
export type Profile = 'taper' | 'start' | 'end' | 'drop' | 'even' | 'bulge';
export interface Spray { src: string; size: number; gap: number; jitter: number; rot: number; follow: boolean }
export interface Brush { mode: BrushMode; w: number; profile: Profile; angle: number; smooth: number; spray: Spray }
export const BRUSH0: Brush = { mode: 'preset', w: 4, profile: 'taper', angle: 45, smooth: 50, spray: { src: 'star5', size: 6, gap: 8, jitter: 30, rot: 30, follow: true } };

/** Profil: yolun başından sonuna (t 0…1) kalınlık çarpanı. */
export const PROFILES: Record<Profile, (t: number) => number> = {
  taper: t => Math.pow(Math.sin(Math.PI * t), 0.6),
  start: t => Math.pow(1 - t, 0.8),
  end: t => Math.pow(t, 0.8),
  drop: t => t < 0.25 ? Math.sin(t / 0.25 * Math.PI / 2) : Math.pow(1 - (t - 0.25) / 0.75, 0.7),
  even: () => 1,
  bulge: t => 0.35 + 0.65 * Math.sin(Math.PI * t),
};

/** Eşit aralıkla yeniden örnekle ve yumuşat; basınç da aynı noktalara taşınır. */
function resample(pts: P[], pr: number[], step: number, smooth: number): { p: P[]; pr: number[]; t: number[]; ang: number[] } {
  const p: P[] = [pts[0]], q: number[] = [pr[0] ?? 0.5]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!d) continue;
    let u = step - acc;
    while (u <= d) { const k = u / d; p.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); q.push((pr[i - 1] ?? 0.5) + ((pr[i] ?? 0.5) - (pr[i - 1] ?? 0.5)) * k); u += step; }
    acc = d - (u - step);
  }
  const last = pts[pts.length - 1]; if (Math.hypot(last[0] - p[p.length - 1][0], last[1] - p[p.length - 1][1]) > step * 0.3) { p.push(last); q.push(pr[pr.length - 1] ?? 0.5); }
  const k = Math.round(smooth / 12); // hareketli ortalama (uçlar sabit)
  const sp = k ? p.map((v, i) => { if (i === 0 || i === p.length - 1) return v; let x = 0, y = 0, n = 0; for (let j = Math.max(0, i - k); j <= Math.min(p.length - 1, i + k); j++) { x += p[j][0]; y += p[j][1]; n++; } return [x / n, y / n] as P; }) : p;
  let L = 0; const len = sp.map((v, i) => (L += i ? Math.hypot(v[0] - sp[i - 1][0], v[1] - sp[i - 1][1]) : 0));
  const ang = sp.map((_, i) => { const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); });
  return { p: sp, pr: q, t: len.map(v => L ? v / L : 0), ang };
}
const circle = (c: P, r: number, n = 18): P[] => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [c[0] + r * Math.cos(a), -(c[1] + r * Math.sin(a))]; });

/** Fırça darbesi → kapalı yollar (birleşik, kendi üstüne binmeler temizlenmiş). */
export function brushStroke(w: W, pts: P[], pr: number[], b: Brush): V.Sub[] {
  if (pts.length < 2) return [];
  const R = resample(pts, pr, Math.max(0.15, b.w / 6), b.smooth), hulls: ReturnType<W['CrossSection']['hull']>[] = [];
  if (b.mode === 'calli') { // eğik uç: uç çizgisinin süpürülmesi
    const a = b.angle * Math.PI / 180, ux = Math.cos(a) * b.w / 2, uy = Math.sin(a) * b.w / 2, nib = (c: P): P[] => [[c[0] - ux, -(c[1] - uy)], [c[0] + ux, -(c[1] + uy)]];
    for (let i = 1; i < R.p.length; i++) hulls.push(w.CrossSection.hull([[...nib(R.p[i - 1]), ...nib(R.p[i])]]));
  } else {
    const rad = (i: number) => Math.max(0.02, b.w / 2 * (b.mode === 'pressure' ? Math.min(2, Math.max(0.05, R.pr[i] * 2)) : PROFILES[b.profile](R.t[i])));
    for (let i = 1; i < R.p.length; i++) hulls.push(w.CrossSection.hull([[...circle(R.p[i - 1], rad(i - 1)), ...circle(R.p[i], rad(i))]]));
  }
  const u = w.CrossSection.union(hulls); hulls.forEach(h => h.delete());
  const subs = O.fromCS(u, Math.max(0.005, b.w / 400)); u.delete();
  if (b.mode === 'calli') return subs; // eğik ucun sivri köşeleri: eğri yumuşatma taşırır, yoğun düz parçalar kalır
  return subs.map(s => V.smooth(s.pts.map(q => [q.x, q.y] as P), Math.max(0.01, b.w / 60), true));
}

/** Püskürtme: kaynak şekli yol boyunca serpiştirir (boy ve açı rastgele oynar). */
export function sprayItems(pts: P[], b: Brush, src: V.Sub[], base: Omit<V.Item, 'id' | 'subs'>): V.Item[] {
  if (pts.length < 2 || !src.length) return [];
  const bb = V.bounds([{ id: 0, subs: src, fill: null, stroke: null, sw: 0, even: false }]); if (!bb) return [];
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, k0 = 1 / Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0, 1e-6), s = b.spray;
  const R = resample(pts, [], Math.max(0.5, s.gap), 0), g = V.newId();
  return R.p.map((p, i) => {
    const sz = s.size * (1 + (Math.random() * 2 - 1) * s.jitter / 100), rot = (s.follow ? R.ang[i] : 0) + (Math.random() * 2 - 1) * s.rot * Math.PI / 180, c = Math.cos(rot), sn = Math.sin(rot);
    const it: V.Item = { ...base, id: 0, subs: src, group: g, name: `Püskürtme ${i + 1}` };
    return { ...V.mapItem(it, (x, y) => { const u = (x - cx) * k0 * sz, v = (y - cy) * k0 * sz; return [p[0] + u * c - v * sn, p[1] + u * sn + v * c]; }), id: V.newId() };
  });
}
