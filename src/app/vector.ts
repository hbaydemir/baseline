// Vektör düzenleyicinin yol modeli: alt yollar, düğümler ve tutamaçlar (mm, y aşağı).
import type { ManifoldToplevel } from 'manifold-3d';
import { css, mix } from './color';

export interface Pt { x: number; y: number; ix?: number; iy?: number; ox?: number; oy?: number }
export interface Sub { pts: Pt[]; closed: boolean }
/** text: düzenlenebilir yazı (merkez x,y); noktaları elle değişince yola dönüşür. */
export interface TextMeta {
  value: string; size: number; font: string;
  /** İlk satırın taban çizgisindeki çapa noktası (hizaya göre sol / orta / sağ). */
  x: number; y: number; rot?: number;
  /** Harf aralığı (mm), satır aralığı (çarpan), hiza. */
  ls?: number; lh?: number; align?: 'left' | 'center' | 'right' | 'justify';
  /** Harf harf stil (renk, yazı tipi, boy); dizi metnin karakterleriyle hizalı. */
  cs?: (CharStyle | null)[];
  /** Paragraf yazı: kutu genişliği (mm); x,y kutunun sol üst köşesi. */
  box?: { w: number };
  /** Yola oturtulmuş yazı: yolun noktaları, baştan uzaklık (mm), alta çevir. */
  path?: { pts: V[]; offset: number; flip?: boolean };
}
export type ArrowKind = 'tri' | 'open' | 'dot' | 'square' | 'bar';
/** Harf stili; dx / dy: şekil aracıyla elle kaydırılan harfin kayması (mm, yazının kendi ekseninde). */
export interface CharStyle { fill?: string; font?: string; size?: number; dx?: number; dy?: number }
export interface Grad { type: 'linear' | 'radial' | 'conic' | 'square'; angle: number; stops: { o: number; c: string }[] }
/** Gölge; persp: alt kenardan yere yatan (perspektif) gölge. */
export interface Shadow { dx: number; dy: number; blur: number; color: string; opacity: number; persp?: boolean }
export interface Item {
  id: number; subs: Sub[]; fill: string | null; stroke: string | null; sw: number; even: boolean; text?: TextMeta;
  name?: string; hidden?: boolean; locked?: boolean; group?: number;
  /** Kenar çizgisi: kesik desen (mm), köşe, uç; fixedStroke: ölçeklenince kalınlık değişmesin. */
  dash?: number[]; join?: 'miter' | 'round' | 'bevel'; cap?: 'butt' | 'round' | 'square'; fixedStroke?: boolean;
  /** Şeffaflık (0–1) ve gölge: yalnız serbest çizimde. */
  opacity?: number; shadow?: Shadow;
  /** PowerClip: bu öğe şu kabın içinde kırpılır. */
  clip?: number;
  /** Alt yol başına dolgu (harf renkleri); null: öğenin dolgusu. */
  subFill?: (string | null)[];
  /** Yerleştirilmiş resim: çerçeve subs[0] (sol üst, sağ üst, sağ alt, sol alt); key: çizimin resim deposu. */
  img?: { key: string; w: number; h: number };
  /** Geçişli dolgu ve desen dolgu (desen kimliği). */
  grad?: Grad; pat?: string;
  /** Katman kimliği. */
  layer?: number;
  /** Açık çizgilerin uçlarında ok (başlangıç / bitiş) ve boyu (mm). */
  arrows?: { s?: ArrowKind; e?: ArrowKind; size?: number };
  /** Canlı efektler: asıl yollar (subs) değişmez, efekt kaldırılınca şekil geri gelir. */
  fx?: Fx;
}
export interface ContourFx { dist: number; steps: number; dir: 'out' | 'in'; join: 'Miter' | 'Round' | 'Square'; color: string; filled: boolean }
type Cubic = [V, V, V, V];
/** Zarf: kaynak yollar, çerçeve (sol üst, sağ üst, sol alt), kip ve dört kenar eğrisi (üst, sağ, alt, sol). */
export interface EnvFx { src: Sub[]; frame: [V, V, V]; mode: 'line' | 'arc' | 'double' | 'free'; e: [Cubic, Cubic, Cubic, Cubic] }
/** Bozma: itme / çekme (amt −1…1), fermuar (amt: genlik mm, freq: diş sayısı), girdap (amt: derece); c: merkez. */
export interface DistortFx { src: Sub[]; kind: 'push' | 'zipper' | 'twist'; amt: number; freq: number; c: V }
export interface BlockFx { dx: number; dy: number; color: string; noHoles?: boolean }
export interface InnerFx { dx: number; dy: number; size: number; color: string; opacity: number }
/** Geçişli şeffaflık: a noktasında from, b noktasında to (0 opak … 1 tam saydam). */
export interface TranspFx { a: V; b: V; from: number; to: number }
export interface Fx { contour?: ContourFx; env?: EnvFx; distort?: DistortFx; block?: BlockFx; inner?: InnerFx; transp?: TranspFx }
/** Gradientin t (0–1) noktasındaki rengi (ekran rengi). */
export function gradAt(g: Grad, t: number): string {
  const st = [...g.stops].sort((a, b) => a.o - b.o); if (!st.length) return '#000000';
  if (t <= st[0].o) return css(st[0].c); if (t >= st[st.length - 1].o) return css(st[st.length - 1].c);
  for (let i = 1; i < st.length; i++) if (t <= st[i].o) { const a = st[i - 1], b = st[i]; return mix(css(a.c), css(b.c), (t - a.o) / ((b.o - a.o) || 1)); }
  return css(st[st.length - 1].c);
}
/** SVG ve PDF'in doğrudan çizemediği gradientler (konik, kare) için şekle kırpılacak renk bantları. */
export function gradBands(it: Item): { d: string; c: string }[] {
  const g = it.grad; if (!g || (g.type !== 'conic' && g.type !== 'square')) return [];
  const b = bounds([{ ...it, stroke: null, grad: undefined }]); if (!b) return [];
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, hw = (b.x1 - b.x0) / 2, hh = (b.y1 - b.y0) / 2, out: { d: string; c: string }[] = [], f = (v: number) => r4(v);
  if (g.type === 'conic') {
    const N = 96, R = Math.hypot(hw, hh) * 1.1, a0 = g.angle * Math.PI / 180;
    for (let k = 0; k < N; k++) { const a = a0 + k / N * Math.PI * 2 - 0.004, e = a0 + (k + 1) / N * Math.PI * 2 + 0.004; out.push({ d: `M${f(cx)} ${f(cy)}L${f(cx + R * Math.cos(a))} ${f(cy + R * Math.sin(a))}L${f(cx + R * Math.cos(e))} ${f(cy + R * Math.sin(e))}Z`, c: gradAt(g, (k + 0.5) / N) }); }
  } else {
    const N = 48;
    for (let k = N; k > 0; k--) { const s = k / N; out.push({ d: `M${f(cx - hw * s)} ${f(cy - hh * s)}L${f(cx + hw * s)} ${f(cy - hh * s)}L${f(cx + hw * s)} ${f(cy + hh * s)}L${f(cx - hw * s)} ${f(cy + hh * s)}Z`, c: gradAt(g, (k - 0.5) / N) }); }
  }
  return out;
}
/** Aynı dolgulu ardışık alt yollar (harf renkleri için). */
export function fillGroups(it: Item): { fill: string | null; subs: Sub[] }[] {
  if (!it.subFill?.some(f => f)) return [{ fill: it.fill, subs: it.subs }];
  const out: { fill: string | null; subs: Sub[] }[] = [];
  it.subs.forEach((s, i) => { const f = it.subFill![i] ?? it.fill, last = out[out.length - 1]; if (last && last.fill === f) last.subs.push(s); else out.push({ fill: f, subs: [s] }); });
  return out;
}
const dCache = new WeakMap<Sub[], string>();
/** Öğenin yolu (alt yol dizisine göre önbellekli). */
export const itemDc = (it: Item) => { let d = dCache.get(it.subs); if (d === undefined) { d = it.subs.map(subD).join(''); dCache.set(it.subs, d); } return d; };
export type V = [number, number];
let nextId = 1;
export const newId = () => nextId++;
/** Kayıttan gelen kimliklerle çakışmasın. */
export const bumpId = (items: { id: number }[]) => { for (const it of items) nextId = Math.max(nextId, it.id + 1); };
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

export function parseD(d: string): Sub[] {
  const subs: Sub[] = []; let cur: Sub | null = null;
  const t = d.match(/[MLCZ]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) ?? []; let i = 0, cmd = "";
  const n = () => Number(t[i++]);
  while (i < t.length) {
    if (/[MLCZ]/i.test(t[i])) cmd = t[i++].toUpperCase();
    if (cmd === 'M') { cur = { pts: [{ x: n(), y: n() }], closed: false }; subs.push(cur); cmd = 'L'; }
    else if (cmd === 'L') cur!.pts.push({ x: n(), y: n() });
    else if (cmd === 'C') { const a = n(), b = n(), c = n(), e = n(), x = n(), y = n(), last = cur!.pts[cur!.pts.length - 1]; last.ox = a; last.oy = b; cur!.pts.push({ x, y, ix: c, iy: e }); }
    else if (cmd === 'Z') {
      if (cur) { const f = cur.pts[0], l = cur.pts[cur.pts.length - 1]; if (cur.pts.length > 1 && Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; cur.pts.pop(); } cur.closed = true; const s0: Pt = cur.pts[0]; cur = { pts: [{ x: s0.x, y: s0.y }], closed: false }; subs.push(cur); }
      cmd = '';
    } else i++;
  }
  return subs.filter(s => s.pts.length > 1 || s.closed);
}
const seg = (a: Pt, b: Pt) => a.ox !== undefined || b.ix !== undefined ? `C${r4(a.ox ?? a.x)} ${r4(a.oy ?? a.y)} ${r4(b.ix ?? b.x)} ${r4(b.iy ?? b.y)} ${r4(b.x)} ${r4(b.y)}` : `L${r4(b.x)} ${r4(b.y)}`;
export function subD(s: Sub) {
  if (!s.pts.length) return '';
  let d = `M${r4(s.pts[0].x)} ${r4(s.pts[0].y)}`;
  for (let i = 1; i < s.pts.length; i++) d += seg(s.pts[i - 1], s.pts[i]);
  if (s.closed) { if (s.pts.length > 1) d += seg(s.pts[s.pts.length - 1], s.pts[0]); d += 'Z'; }
  return d;
}
export const itemD = (it: Item) => it.subs.map(subD).join('');
export function toSvg(items: Item[]): string {
  items = items.filter(it => !it.hidden && !it.img).flatMap(it => fillGroups(it).map(g => ({ ...it, subs: g.subs, subFill: undefined, fill: g.fill && it.grad ? it.grad.stops[0]?.c ?? g.fill : g.fill })));
  const b = bounds(items) ?? { x0: 0, y0: 0, x1: 1, y1: 1 }, pad = 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r4(b.x0 - pad)} ${r4(b.y0 - pad)} ${r4(b.x1 - b.x0 + 2 * pad)} ${r4(b.y1 - b.y0 + 2 * pad)}">` + items.map(it => `<path d="${itemD(it)}" fill="${css(it.fill)}"${it.even ? ' fill-rule="evenodd"' : ''}${it.stroke ? ` stroke="${css(it.stroke)}" stroke-width="${r4(it.sw)}" stroke-linejoin="round" stroke-linecap="round"` : ''}/>`).join('') + '</svg>';
}

// --- geometri ---
const bez = (p: V[], t: number): V => { let q = p; while (q.length > 1) q = q.slice(1).map((b, i) => [q[i][0] + (b[0] - q[i][0]) * t, q[i][1] + (b[1] - q[i][1]) * t] as V); return q[0]; };
export const segPts = (a: Pt, b: Pt): V[] => [[a.x, a.y], [a.ox ?? a.x, a.oy ?? a.y], [b.ix ?? b.x, b.iy ?? b.y], [b.x, b.y]];
const curved = (a: Pt, b: Pt) => a.ox !== undefined || b.ix !== undefined;
export function flattenSub(s: Sub, steps = 16): V[] {
  const out: V[] = [], n = s.pts.length;
  for (let i = 0; i < (s.closed ? n : n - 1); i++) { const a = s.pts[i], b = s.pts[(i + 1) % n], p = segPts(a, b), k = curved(a, b) ? steps : 1; for (let q = 0; q < k; q++) out.push(bez(p, q / k)); }
  if (!s.closed && n) out.push([s.pts[n - 1].x, s.pts[n - 1].y]);
  return out;
}
/** Yolu f ile büker: düz kenarlar da step aralıkla bölünür (yoksa yalnız köşeler oynar), gerçek köşeler sivri kalır. */
export function warpSub(s: Sub, f: (x: number, y: number, t?: number) => V, step: number): Sub {
  const n = s.pts.length, out: { p: V; corner: boolean }[] = [];
  if (!n) return { pts: [], closed: s.closed };
  const sharp = (i: number) => { const q = s.pts[i]; return (!s.closed && (i === 0 || i === n - 1)) || q.ix === undefined || q.ox === undefined; };
  for (let i = 0; i < (s.closed ? n : n - 1); i++) {
    const a = s.pts[i], b = s.pts[(i + 1) % n], p = segPts(a, b), L = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(curved(a, b) ? 12 : 1, Math.min(200, Math.ceil(L / step)));
    for (let q = 0; q < k; q++) { const [x, y] = bez(p, q / k); out.push({ p: f(x, y, q / k), corner: q === 0 && sharp(i) }); }
  }
  if (!s.closed) { const l = s.pts[n - 1]; out.push({ p: f(l.x, l.y, 0), corner: true }); }
  const m = out.length, pts: Pt[] = out.map(({ p: [x, y] }) => ({ x, y }));
  pts.forEach((p, i) => { // Catmull-Rom; köşede tutamaç komşuya doğru (düz çıkış)
    const hasA = s.closed || i > 0, hasB = s.closed || i < m - 1, A = pts[(i + m - 1) % m], B = pts[(i + 1) % m];
    if (out[i].corner) { if (hasA) { p.ix = p.x + (A.x - p.x) / 3; p.iy = p.y + (A.y - p.y) / 3; } if (hasB) { p.ox = p.x + (B.x - p.x) / 3; p.oy = p.y + (B.y - p.y) / 3; } return; }
    const tx = (B.x - A.x) / 6, ty = (B.y - A.y) / 6;
    if (hasA) { p.ix = p.x - tx; p.iy = p.y - ty; } if (hasB) { p.ox = p.x + tx; p.oy = p.y + ty; }
  });
  return { pts, closed: s.closed };
}
export function bounds(items: Item[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const it of items) { const w = it.stroke ? it.sw / 2 : 0; for (const s of it.subs) for (const [x, y] of flattenSub(s, 8)) { x0 = Math.min(x0, x - w); y0 = Math.min(y0, y - w); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + w); } }
  return x0 < Infinity ? { x0, y0, x1, y1 } : null;
}
/** (cx, cy) çevresinde derece cinsinden döndürme. */
export const rotFn = (deg: number, cx: number, cy: number) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return (a: number, b: number): V => [cx + (a - cx) * c - (b - cy) * s, cy + (a - cx) * s + (b - cy) * c]; };
/** Öğeyi döndürür; yazıysa açısını da hatırlar (metin değişince dönük kalsın). */
export const rotateItem = (it: Item, deg: number, cx: number, cy: number): Item => { const m = mapItem(it, rotFn(deg, cx, cy)); return m.text ? { ...m, text: { ...m.text, rot: ((m.text.rot ?? 0) + deg) % 360 } } : m; };
/** "M a b L c d" parçalarından oluşan sınırı kapalı yollara birleştirir (Corel ve lazerde tek şekil olsun). */
export function joinOutline(d: string): string {
  const re = /M\s*(-?[\d.e-]+)[\s,]+(-?[\d.e-]+)\s*L\s*(-?[\d.e-]+)[\s,]+(-?[\d.e-]+)/g, segs: V[][] = [];
  let m: RegExpExecArray | null; while ((m = re.exec(d))) segs.push([[+m[1], +m[2]], [+m[3], +m[4]]]);
  if (!segs.length || d.replace(re, '').trim()) return d;
  const k = (p: V) => `${Math.round(p[0] * 1e3)},${Math.round(p[1] * 1e3)}`, by = new Map<string, number[]>(), used = new Set<number>();
  segs.forEach((s, i) => s.forEach(p => { const q = k(p); by.set(q, [...(by.get(q) ?? []), i]); }));
  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used.has(i)) continue; used.add(i);
    const loop = [segs[i][0], segs[i][1]];
    for (;;) { const end = loop[loop.length - 1], j = (by.get(k(end)) ?? []).find(x => !used.has(x)); if (j === undefined) break; used.add(j); loop.push(k(segs[j][0]) === k(end) ? segs[j][1] : segs[j][0]); }
    const closed = loop.length > 2 && k(loop[0]) === k(loop[loop.length - 1]); if (closed) loop.pop();
    out.push('M' + loop.map(p => `${r4(p[0])} ${r4(p[1])}`).join('L') + (closed ? 'Z' : ''));
  }
  return out.join('');
}
const mapSubs = (subs: Sub[], f: (x: number, y: number) => V): Sub[] => subs.map(s => ({ closed: s.closed, pts: s.pts.map(p => { const [x, y] = f(p.x, p.y), o: Pt = { x, y }; if (p.ix !== undefined) [o.ix, o.iy] = f(p.ix, p.iy!); if (p.ox !== undefined) [o.ox, o.oy] = f(p.ox, p.oy!); return o; }) }));
/** Efektlerin taşıdığı noktalar (zarf kaynağı ve kenarları, bozma merkezi, şeffaflık uçları) şekille birlikte taşınır. */
function mapFx(fx: Fx | undefined, f: (x: number, y: number) => V): Fx | undefined {
  if (!fx) return fx;
  const out = { ...fx }, g = (p: V) => f(p[0], p[1]);
  if (fx.env) out.env = { ...fx.env, src: mapSubs(fx.env.src, f), frame: fx.env.frame.map(g) as [V, V, V], e: fx.env.e.map(c => c.map(g)) as EnvFx['e'] };
  if (fx.distort) out.distort = { ...fx.distort, src: mapSubs(fx.distort.src, f), c: g(fx.distort.c) };
  if (fx.transp) out.transp = { ...fx.transp, a: g(fx.transp.a), b: g(fx.transp.b) };
  return out;
}
export function mapItem(it: Item, f: (x: number, y: number) => V, swK = 1): Item {
  const t = it.text && (() => { const [x, y] = f(it.text!.x, it.text!.y); return { ...it.text!, x, y, size: it.text!.size * swK, ls: (it.text!.ls ?? 0) * swK }; })();
  if (t?.path) t.path = { ...t.path, pts: t.path.pts.map(([x, y]) => f(x, y)) };
  return { ...it, ...(t ? { text: t } : {}), ...(it.fx ? { fx: mapFx(it.fx, f) } : {}), sw: it.fixedStroke ? it.sw : it.sw * swK, subs: it.subs.map(s => ({ closed: s.closed, pts: s.pts.map(p => { const [x, y] = f(p.x, p.y), o: Pt = { x, y }; if (p.ix !== undefined) [o.ix, o.iy] = f(p.ix, p.iy!); if (p.ox !== undefined) [o.ox, o.oy] = f(p.ox, p.oy!); return o; }) })) };
}
/** Bezier'i t'de ikiye böler. */
function split(p: V[], t: number): [V[], V[]] {
  const L = (a: V, b: V): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = L(p[0], p[1]), b = L(p[1], p[2]), c = L(p[2], p[3]), d = L(a, b), e = L(b, c), f = L(d, e);
  return [[p[0], a, d, f], [f, e, c, p[3]]];
}
export function insertAt(s: Sub, i: number, t: number) {
  const n = s.pts.length, a = s.pts[i], b = s.pts[(i + 1) % n];
  if (!curved(a, b)) { s.pts.splice(i + 1, 0, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); return; }
  const [l, r] = split(segPts(a, b), t); a.ox = l[1][0]; a.oy = l[1][1]; b.ix = r[2][0]; b.iy = r[2][1];
  s.pts.splice(i + 1, 0, { x: l[3][0], y: l[3][1], ix: l[2][0], iy: l[2][1], ox: r[1][0], oy: r[1][1] });
}
/** Segmentte noktaya en yakın t. */
export function nearestT(a: Pt, b: Pt, x: number, y: number) { const p = segPts(a, b); let best = 0, bd = Infinity; for (let q = 0; q <= 64; q++) { const [u, v] = bez(p, q / 64), d = (u - x) ** 2 + (v - y) ** 2; if (d < bd) { bd = d; best = q / 64; } } return best; }

/** Düğüm i'yi pah ya da yuvarlama ile iki düğüme çevirir. */
export function cornerAt(s: Sub, i: number, size: number, style: 'chamfer' | 'round'): boolean {
  const n = s.pts.length; if (n < 3 || (!s.closed && (i === 0 || i === n - 1))) return false;
  const pi = (i + n - 1) % n, ni = (i + 1) % n, P = s.pts[pi], C = s.pts[i], N = s.pts[ni];
  const prev = segPts(P, C), next = segPts(C, N), dist = (q: V) => Math.hypot(q[0] - C.x, q[1] - C.y);
  // node'dan d kadar uzaktaki t
  const find = (p: V[], fromEnd: boolean) => { const len = dist(fromEnd ? p[0] : p[3]), d = Math.min(size, len * 0.49); let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, q = bez(p, fromEnd ? 1 - m : m); if (dist(q) < d) lo = m; else hi = m; } return fromEnd ? 1 - lo : lo; };
  const ta = find(prev, true), tb = find(next, false);
  const [pl] = split(prev, ta), [, nr] = split(next, tb);
  const A: Pt = { x: pl[3][0], y: pl[3][1] }, B: Pt = { x: nr[0][0], y: nr[0][1] };
  if (curved(P, C)) { P.ox = pl[1][0]; P.oy = pl[1][1]; A.ix = pl[2][0]; A.iy = pl[2][1]; }
  if (curved(C, N)) { B.ox = nr[1][0]; B.oy = nr[1][1]; N.ix = nr[2][0]; N.iy = nr[2][1]; }
  if (style === 'round') {
    const ua: V = [C.x - A.x, C.y - A.y], ub: V = [C.x - B.x, C.y - B.y], la = Math.hypot(...ua), lb = Math.hypot(...ub);
    const turn = Math.PI - Math.acos(Math.max(-1, Math.min(1, (ua[0] * ub[0] + ua[1] * ub[1]) / (la * lb || 1))));
    if (turn > 0.01) { const k = 4 / 3 * Math.tan(turn / 4) / Math.tan(turn / 2); A.ox = A.x + ua[0] * k; A.oy = A.y + ua[1] * k; B.ix = B.x + ub[0] * k; B.iy = B.y + ub[1] * k; }
  }
  s.pts.splice(i, 1, A, B);
  return true;
}
/** Keskin düğümler (tutamaçsız ya da kırık). */
export function isCorner(s: Sub, i: number) {
  const n = s.pts.length, p = s.pts[i]; if (!s.closed && (i === 0 || i === n - 1)) return false;
  const a = s.pts[(i + n - 1) % n], b = s.pts[(i + 1) % n], inV: V = p.ix !== undefined ? [p.x - p.ix, p.y - p.iy!] : [p.x - (a.ox ?? a.x), p.y - (a.oy ?? a.y)], outV: V = p.ox !== undefined ? [p.ox - p.x, p.oy! - p.y] : [(b.ix ?? b.x) - p.x, (b.iy ?? b.y) - p.y];
  const c = (inV[0] * outV[0] + inV[1] * outV[1]) / (Math.hypot(...inV) * Math.hypot(...outV) || 1); return c < Math.cos(20 * Math.PI / 180);
}

/** Kapalı alt yolları çokgenlere çevirip birleştir / çıkar / kesiştir. */
export function boolean(wasm: ManifoldToplevel, items: Item[], op: 'union' | 'subtract' | 'intersect'): Item {
  const { CrossSection } = wasm, css = items.map(it => CrossSection.ofPolygons(it.subs.filter(s => s.closed).map(s => flattenSub(s, 24).map(([x, y]) => [x, -y] as V)), it.even ? 'EvenOdd' : 'NonZero'));
  let r = css[0].translate([0, 0]);
  for (const c of css.slice(1)) { const o = r; r = op === 'union' ? o.add(c) : op === 'subtract' ? o.subtract(c) : o.intersect(c); o.delete(); }
  const s = r.simplify(0.005), polys = s.toPolygons() as V[][]; css.forEach(c => c.delete()); r.delete(); s.delete();
  return { id: newId(), fill: items[0].fill ?? '#4f8cff', stroke: null, sw: 1, even: false, subs: polys.map(p => ({ closed: true, pts: p.map(([x, y]) => ({ x, y: -y })) })) };
}
/** Serbest çizim: sadeleştir ve yumuşak eğriye çevir. */
export function smooth(raw: V[], tol: number, closed: boolean): Sub {
  const rdp = (p: V[]): V[] => { if (p.length < 3) return p; const [a, b] = [p[0], p[p.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let k = 0, m = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > m) { m = d; k = i; } } return m > tol ? [...rdp(p.slice(0, k + 1)).slice(0, -1), ...rdp(p.slice(k))] : [a, b]; };
  const q = rdp(raw), n = q.length, pts: Pt[] = q.map(([x, y]) => ({ x, y }));
  if (closed && n > 2 && Math.hypot(q[0][0] - q[n - 1][0], q[0][1] - q[n - 1][1]) < tol * 4) pts.pop();
  const m = pts.length;
  pts.forEach((p, i) => { // Catmull-Rom tutamaçları
    const a = pts[closed ? (i + m - 1) % m : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % m : Math.min(m - 1, i + 1)], tx = (b.x - a.x) / 6, ty = (b.y - a.y) / 6;
    if (closed || i > 0) { p.ix = p.x - tx; p.iy = p.y - ty; } if (closed || i < m - 1) { p.ox = p.x + tx; p.oy = p.y + ty; }
  });
  return { pts, closed };
}
export const rectSub = (x: number, y: number, w: number, h: number): Sub => ({ closed: true, pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
export function ellipseSub(cx: number, cy: number, rx: number, ry: number): Sub {
  const k = 0.5523;
  return { closed: true, pts: [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([a, b]) => ({ x: cx + a * rx, y: cy + b * ry, ix: cx + a * rx + b * k * rx, iy: cy + b * ry - a * k * ry, ox: cx + a * rx - b * k * rx, oy: cy + b * ry + a * k * ry })) };
}
export const polySub = (cx: number, cy: number, r: number, n: number, inner = 0): Sub => ({ closed: true, pts: Array.from({ length: inner ? 2 * n : n }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI * 2 / (inner ? 2 * n : n), rr = inner && i % 2 ? inner : r; return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) }; }) });
export function heartSub(cx: number, cy: number, w: number): Sub {
  const k = w / 32, raw: V[] = Array.from({ length: 48 }, (_, i) => { const a = i / 48 * 2 * Math.PI; return [cx + 16 * Math.sin(a) ** 3 * k, cy - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * k]; });
  return smooth(raw, w / 400, true);
}
