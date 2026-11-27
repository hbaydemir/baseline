// Canlı efektler (Corel efekt araçları): asıl şekil korunur, efekt kaldırılınca geri gelir.
// Geometriyi değiştirenler (zarf, bozma) kaynak yolları fx içinde saklar; süs efektleri (gölge, blok gölge, kontür) çizimde türetilir.
import type { ManifoldToplevel } from 'manifold-3d';
import * as V from './vector';
import * as O from './vectorOps';

type P = V.V;
type W = ManifoldToplevel;
type Cubic = [P, P, P, P];

// ---------- zarf ----------
const bez = (c: Cubic, t: number): P => { const s = 1 - t, a = s * s * s, b = 3 * s * s * t, d = 3 * s * t * t, e = t * t * t; return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]]; };
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const line = (a: P, b: P): Cubic => [a, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), b];
const add = (a: P, d: P, k = 1): P => [a[0] + d[0] * k, a[1] + d[1] * k];
/** Zarf çerçevesi: sol üst, sağ üst, sol alt (dönüş ve eğiklikle birlikte taşınır). */
export function envNew(src: V.Sub[]): V.EnvFx | null {
  const b = V.bounds([{ id: 0, subs: src, fill: null, stroke: null, sw: 0, even: false }]); if (!b) return null;
  const TL: P = [b.x0, b.y0], TR: P = [b.x1, b.y0], BL: P = [b.x0, b.y1], BR: P = [b.x1, b.y1];
  return { src, frame: [TL, TR, BL], mode: 'arc', e: [line(TL, TR), line(TR, BR), line(BL, BR), line(TL, BL)] };
}
/** Coons yaması: çerçevedeki (u,v) noktası dört kenar eğrisine göre yerleşir. */
export function envMap(env: V.EnvFx): (x: number, y: number) => P {
  const [o, tr, bl] = env.frame, ex: P = [tr[0] - o[0], tr[1] - o[1]], ey: P = [bl[0] - o[0], bl[1] - o[1]], det = ex[0] * ey[1] - ex[1] * ey[0] || 1;
  const [T, R, B, L] = env.e, c00 = T[0], c10 = T[3], c01 = B[0], c11 = B[3];
  return (x, y) => {
    const dx = x - o[0], dy = y - o[1], u = (dx * ey[1] - dy * ey[0]) / det, v = (ex[0] * dy - ex[1] * dx) / det;
    const t = bez(T, u), b = bez(B, u), l = bez(L, v), r = bez(R, v);
    return [0, 1].map(k => (1 - v) * t[k] + v * b[k] + (1 - u) * l[k] + u * r[k] - ((1 - u) * (1 - v) * c00[k] + u * (1 - v) * c10[k] + (1 - u) * v * c01[k] + u * v * c11[k])) as P;
  };
}
export type EnvPreset = 'arc' | 'arcTop' | 'arcBottom' | 'wave' | 'flag' | 'bulge' | 'pinch' | 'persp';
/** Hazır zarf biçimleri; amt −1…1. */
export function envPreset(env: V.EnvFx, kind: EnvPreset, amt: number): V.EnvFx {
  const [TL, TR, BL] = env.frame, BR: P = [TR[0] + BL[0] - TL[0], TR[1] + BL[1] - TL[1]];
  const h = Math.hypot(BL[0] - TL[0], BL[1] - TL[1]) || 1, w = Math.hypot(TR[0] - TL[0], TR[1] - TL[1]) || 1;
  const n: P = [(BL[0] - TL[0]) / h, (BL[1] - TL[1]) / h], m: P = [(TR[0] - TL[0]) / w, (TR[1] - TL[1]) / w], k = amt * h * 0.66, kw = amt * w * 0.4;
  let T = line(TL, TR), R = line(TR, BR), B = line(BL, BR), L = line(TL, BL);
  const bow = (c: Cubic, d: P, a: number, b = a): Cubic => [c[0], add(c[1], d, a), add(c[2], d, b), c[3]];
  if (kind === 'arc') { T = bow(T, n, -k); B = bow(B, n, -k); }
  else if (kind === 'arcTop') T = bow(T, n, -k);
  else if (kind === 'arcBottom') B = bow(B, n, k);
  else if (kind === 'wave') { T = bow(T, n, -k * 0.75, k * 0.75); B = bow(B, n, -k * 0.75, k * 0.75); }
  else if (kind === 'flag') { const d = k * 0.35, tr = add(TR, n, d), br = add(BR, n, d); T = [TL, add(lerp(TL, TR, 1 / 3), n, -k * 0.55), add(lerp(TL, TR, 2 / 3), n, k * 0.55), tr]; B = [BL, add(lerp(BL, BR, 1 / 3), n, -k * 0.55), add(lerp(BL, BR, 2 / 3), n, k * 0.55), br]; R = line(tr, br); }
  else if (kind === 'bulge' || kind === 'pinch') { const s = kind === 'pinch' ? -1 : 1; T = bow(T, n, -k * 0.5 * s); B = bow(B, n, k * 0.5 * s); L = bow(L, m, -kw * s); R = bow(R, m, kw * s); }
  else if (kind === 'persp') { const d = amt * w * 0.25, tl = add(TL, m, d), tr = add(TR, m, -d); T = line(tl, tr); L = line(tl, BL); R = line(tr, BR); }
  return { ...env, e: [T, R, B, L], mode: kind === 'persp' ? 'line' : kind === 'wave' || kind === 'flag' ? 'double' : 'arc' };
}
/** Zarf tutamacı sürükleme: köşe ya da kenar (kipine göre). which: 'c0'…'c3' köşe (TL,TR,BR,BL), 'm0'…'m3' kenar ortası, 'p0a' gibi serbest kontrol noktası. */
export function envDrag(env: V.EnvFx, base: V.EnvFx, which: string, d: P): V.EnvFx {
  const e = base.e.map(c => c.map(p => [p[0], p[1]] as P)) as Cubic[];
  if (which[0] === 'c') { // köşe: iki kenarın ucu birlikte
    const i = +which[1], ends: [number, number][] = [[[0, 0], [3, 0]], [[0, 3], [1, 0]], [[1, 3], [2, 3]], [[2, 0], [3, 3]]][i] as [number, number][];
    for (const [ei, pi] of ends) { e[ei][pi] = add(e[ei][pi], d); const ci = pi === 0 ? 1 : 2; e[ei][ci] = add(e[ei][ci], d); }
    if (env.mode === 'line') for (let k = 0; k < 4; k++) e[k] = line(e[k][0], e[k][3]);
  } else if (which[0] === 'm') { const i = +which[1], k = 4 / 3; if (env.mode === 'double') { e[i][1] = add(e[i][1], d, k * 1.5); e[i][2] = add(e[i][2], d, -k * 1.5); } else { e[i][1] = add(e[i][1], d, k); e[i][2] = add(e[i][2], d, k); } }
  else { const i = +which[1], ci = which[2] === 'a' ? 1 : 2; e[i][ci] = add(e[i][ci], d); }
  return { ...env, e: e as V.EnvFx['e'] };
}
/** Zarf tutamaçlarının yerleri (kipine göre). */
export function envHandles(env: V.EnvFx): { id: string; p: P; kind: 'corner' | 'mid' | 'ctrl'; from?: P }[] {
  const [T, R, B, L] = env.e, out: { id: string; p: P; kind: 'corner' | 'mid' | 'ctrl'; from?: P }[] = [{ id: 'c0', p: T[0], kind: 'corner' }, { id: 'c1', p: T[3], kind: 'corner' }, { id: 'c2', p: B[3], kind: 'corner' }, { id: 'c3', p: B[0], kind: 'corner' }];
  if (env.mode === 'arc' || env.mode === 'double') env.e.forEach((c, i) => out.push({ id: 'm' + i, p: bez(c, 0.5), kind: 'mid' }));
  if (env.mode === 'free') env.e.forEach((c, i) => { out.push({ id: `p${i}a`, p: c[1], kind: 'ctrl', from: c[0] }, { id: `p${i}b`, p: c[2], kind: 'ctrl', from: c[3] }); });
  return out;
}
export const envOutline = (env: V.EnvFx): string => { const [T, R, B, L] = env.e, c = (q: Cubic) => `C${q[1].join(' ')} ${q[2].join(' ')} ${q[3].join(' ')}`; return `M${T[0].join(' ')}${c(T)}${c(R)}${c([B[3], B[2], B[1], B[0]])}${c([L[3], L[2], L[1], L[0]])}Z`; };

// ---------- bozma ----------
export function distortSubs(src: V.Sub[], d: V.DistortFx): V.Sub[] {
  const b = V.bounds([{ id: 0, subs: src, fill: null, stroke: null, sw: 0, even: false }]); if (!b) return src;
  const [cx, cy] = d.c, R = Math.max(1e-6, ...src.flatMap(s => s.pts.map(p => Math.hypot(p.x - cx, p.y - cy)))), step = Math.max(b.x1 - b.x0, b.y1 - b.y0) / 60;
  if (d.kind === 'twist') { const a = d.amt * Math.PI / 180; return src.map(s => V.warpSub(s, (x, y) => { const r = Math.hypot(x - cx, y - cy), t = a * r / R, c = Math.cos(t), sn = Math.sin(t); return [cx + (x - cx) * c - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * c]; }, step)); }
  if (d.kind === 'push') // itme / çekme: düğümler yerinde, kenar ortaları merkezden uzaklaşır (+) ya da yaklaşır (−)
    return src.map(s => V.warpSub(s, (x, y, t) => { const k = 1 + d.amt * Math.sin(Math.PI * (t ?? 0)); return [cx + (x - cx) * k, cy + (y - cy) * k]; }, step));
  // fermuar: kenar boyunca zikzak (sivri)
  return src.map(s => {
    const pts = V.flattenSub(s, 24); if (s.closed) pts.push(pts[0]);
    const dense: P[] = []; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], q = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(q[0] - a[0], q[1] - a[1]) / (step / 3))); for (let j = 0; j < n; j++) dense.push(lerp(a, q, j / n)); }
    if (!s.closed) dense.push(pts[pts.length - 1]);
    let L = 0; const len = dense.map((p, i) => (L += i ? Math.hypot(p[0] - dense[i - 1][0], p[1] - dense[i - 1][1]) : 0)), per = Math.max(1e-3, L / Math.max(2, Math.round(d.freq * 2)));
    const out = dense.map((p, i) => { const a = dense[(i - 1 + dense.length) % dense.length], q = dense[(i + 1) % dense.length], tx = q[0] - a[0], ty = q[1] - a[1], tl = Math.hypot(tx, ty) || 1, ph = (len[i] / per) % 2, tri = ph < 1 ? ph : 2 - ph, off = (tri - 0.5) * 2 * d.amt; return [p[0] - ty / tl * off, p[1] + tx / tl * off] as P; });
    return { closed: s.closed, pts: out.map(([x, y]) => ({ x, y })) };
  });
}

// ---------- uygulama ----------
/** Zarf ya da bozmayı yeniden hesaplar (kaynak yollardan). */
export function regeo(it: V.Item): V.Item {
  if (it.fx?.env) { const f = envMap(it.fx.env), step = Math.hypot(it.fx.env.frame[1][0] - it.fx.env.frame[0][0], it.fx.env.frame[1][1] - it.fx.env.frame[0][1]) / 48 || 1; return { ...it, subs: it.fx.env.src.map(s => V.warpSub(s, f, step)) }; }
  if (it.fx?.distort) return { ...it, subs: distortSubs(it.fx.distort.src, it.fx.distort) };
  return it;
}
/** Efekti kaldır: zarf / bozmada asıl şekil geri gelir. */
export function dropFx(it: V.Item, k: keyof V.Fx): V.Item {
  if (!it.fx?.[k]) return it;
  const fx = { ...it.fx }; delete fx[k];
  const subs = k === 'env' ? it.fx.env!.src : k === 'distort' ? it.fx.distort!.src : it.subs;
  return { ...it, subs, fx: Object.keys(fx).length ? fx : undefined };
}
/** Efekti kalıcı yap: türetilmiş parçalar ayrı nesne olur, zarf / bozma kaynağı bırakılır. */
export function bakeFx(w: W, it: V.Item): V.Item[] {
  if (!it.fx) return [it];
  const { before, after } = derived(w, it), main = { ...it, fx: undefined };
  return [...before.map(q => ({ ...q, id: V.newId() })), main, ...after.map(q => ({ ...q, id: V.newId() }))];
}

const cache = new WeakMap<V.Item, { before: V.Item[]; after: V.Item[] }>();
/** Nesnenin arkasına ve önüne çizilen vektör efektler (blok gölge, kontür). */
export function derived(w: W, it: V.Item): { before: V.Item[]; after: V.Item[] } {
  const hit = cache.get(it); if (hit) return hit;
  const before: V.Item[] = [], after: V.Item[] = [], fx = it.fx;
  try {
    if (fx?.block && (fx.block.dx || fx.block.dy)) { const b = blockShadow(w, it, fx.block); if (b) before.push(b); }
    if (fx?.contour) { const r = O.contour(w, it, fx.contour).map(q => ({ ...q, fx: undefined, group: undefined, layer: it.layer })); if (fx.contour.dir === 'out' && fx.contour.filled) before.push(...r); else after.push(...r); }
  } catch { /* geçersiz geometri: efekt çizilmez */ }
  const r = { before, after }; cache.set(it, r); return r;
}
/** Blok gölge: şeklin vektör boyunca süpürülmüş hâli (düz renk, lazer ve UV baskıya uygun). */
export function blockShadow(w: W, it: V.Item, b: V.BlockFx): V.Item | null {
  if (!it.subs.some(s => s.closed)) return null;
  const cs = O.toCS(w, it), polys = cs.toPolygons() as P[][], parts = [cs.translate([0, 0]), cs.translate([b.dx, -b.dy])];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) { const a = poly[i], q = poly[(i + 1) % poly.length]; parts.push(w.CrossSection.ofPolygons([[a, q, [q[0] + b.dx, q[1] - b.dy], [a[0] + b.dx, a[1] - b.dy]]], 'Positive'), w.CrossSection.ofPolygons([[a, [a[0] + b.dx, a[1] - b.dy], [q[0] + b.dx, q[1] - b.dy], q]], 'Positive')); }
  const u = w.CrossSection.union(parts), sub = u.subtract(cs); parts.forEach(p => p.delete()); cs.delete(); u.delete();
  let subs = O.fromCS(sub, 0.002); sub.delete();
  if (b.noHoles && subs.length > 1) { const ar = subs.map(q => O.area(V.flattenSub(q, 4))), big = ar.reduce((m, a, i) => Math.abs(a) > Math.abs(ar[m]) ? i : m, 0); subs = subs.filter((_, i) => Math.sign(ar[i]) === Math.sign(ar[big])); }
  return subs.length ? { id: -it.id - 1e6, subs, fill: b.color, stroke: null, sw: 0, even: false, name: 'Blok gölge' } : null;
}
/** Gölge geometrisi (düz: kaydırma; perspektif: alt kenara yatar). */
export function shadowItem(it: V.Item, s: V.Shadow): V.Item {
  const b = V.bounds([it]); if (!b || !s.persp) return V.mapItem({ ...it, fx: undefined }, (x, y) => [x + s.dx, y + s.dy]);
  const h = b.y1 - b.y0 || 1;
  return V.mapItem({ ...it, fx: undefined }, (x, y) => { const t = (b.y1 - y) / h; return [x + t * s.dx, b.y1 + t * s.dy]; });
}
/** Dışa aktarma ve 3B için: türetilmiş vektör efektler ayrı nesne olur. */
export const withFx = (w: W, list: V.Item[]): V.Item[] => list.flatMap(it => { if (!it.fx) return [it]; const { before, after } = derived(w, it); return [...before, { ...it, fx: it.fx.inner || it.fx.transp ? { inner: it.fx.inner, transp: it.fx.transp } : undefined }, ...after]; });
