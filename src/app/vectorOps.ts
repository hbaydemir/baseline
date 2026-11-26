// Vektör düzenleyicinin geometri işleri: yazı dizgisi, hazır şekiller, kontür, çizgiyi nesneye çevirme,
// bıçak, silgi, geçiş (blend), sadeleştirme, PowerClip düzleştirme ve fotoğrafı vektöre çevirme.
import type { CrossSection, ManifoldToplevel } from 'manifold-3d';
import * as V from './vector';
import { mix } from './color';

type P = V.V;
type W = ManifoldToplevel;

// ---------- yazı ----------
export interface GlyphSource { glyphs(text: string, size: number, font?: string): { d: string; adv: number }[] }
export interface TextLayout { subs: V.Sub[]; carets: { x: number; y: number; a: number }[]; h: number }

/** Polyline üzerinde s uzaklığındaki nokta ve açı. */
function along(pts: P[], s: number): { p: P; a: number } {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], L = Math.hypot(x1 - x0, y1 - y0);
    if (acc + L >= s || i === pts.length - 1) { const t = L ? Math.max(0, Math.min(1.5, (s - acc) / L)) : 0; return { p: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], a: Math.atan2(y1 - y0, x1 - x0) }; }
    acc += L;
  }
  return { p: pts[0] ?? [0, 0], a: 0 };
}
export const pathLength = (pts: P[]) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);

/** Yazıyı yollara döker; carets[i]: i. karakterden önceki imleç yeri (taban çizgisi), açı. */
export function layoutText(k: GlyphSource, t: V.TextMeta): TextLayout {
  const fs = t.size / 0.62, lineAdv = fs * 1.15 * (t.lh ?? 1), ls = t.ls ?? 0, subs: V.Sub[] = [], carets: { x: number; y: number; a: number }[] = [];
  const onPath = t.path && t.path.pts.length > 1, lines = onPath ? [t.value.replace(/\n/g, ' ')] : t.value.split('\n');
  const local: { subs: V.Sub[]; x: number; y: number; adv: number }[] = [];
  lines.forEach((line, li) => {
    const gs = line ? k.glyphs(line, t.size, t.font) : [], total = gs.reduce((s, g) => s + g.adv, 0) + ls * Math.max(0, gs.length - 1);
    let x = t.align === 'center' ? -total / 2 : t.align === 'right' ? -total : 0; const y = li * lineAdv;
    for (const g of gs) { local.push({ subs: g.d ? V.parseD(g.d) : [], x, y, adv: g.adv }); carets.push({ x, y, a: 0 }); x += g.adv + ls; }
    carets.push({ x: gs.length ? x - ls : x, y, a: 0 });
  });
  const move = (s: V.Sub, f: (x: number, y: number) => P): V.Sub => ({ closed: s.closed, pts: s.pts.map(p => { const [x, y] = f(p.x, p.y), o: V.Pt = { x, y }; if (p.ix !== undefined) [o.ix, o.iy] = f(p.ix, p.iy!); if (p.ox !== undefined) [o.ox, o.oy] = f(p.ox, p.oy!); return o; }) });
  if (onPath) {
    const pts = t.path!.flip ? [...t.path!.pts].reverse() : t.path!.pts, off = t.path!.offset;
    const place = (gx: number, adv: number) => along(pts, off + gx + adv / 2);
    for (const g of local) { const { p, a } = place(g.x, g.adv), c = Math.cos(a), s = Math.sin(a); for (const sub of g.subs) subs.push(move(sub, (x, y) => { const u = x - g.adv / 2, v = y; return [p[0] + u * c - v * s, p[1] + u * s + v * c]; })); }
    for (const cr of carets) { const { p, a } = along(pts, off + cr.x); cr.x = p[0]; cr.y = p[1]; cr.a = a; }
    return { subs, carets, h: fs * 0.9 };
  }
  const r = (t.rot ?? 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), f = (x: number, y: number): P => [t.x + x * c - y * s, t.y + x * s + y * c];
  for (const g of local) for (const sub of g.subs) subs.push(move(sub, (x, y) => f(x + g.x, y + g.y)));
  for (const cr of carets) { const [x, y] = f(cr.x, cr.y); cr.x = x; cr.y = y; cr.a = r; }
  return { subs, carets, h: fs * 0.9 };
}

// ---------- manifold yardımcıları ----------
export function toCS(w: W, it: V.Item): CrossSection {
  return w.CrossSection.ofPolygons(it.subs.filter(s => s.closed && s.pts.length > 1).map(s => V.flattenSub(s, 24).map(([x, y]) => [x, -y] as P)), it.even ? 'EvenOdd' : 'NonZero');
}
export function fromCS(cs: CrossSection, tol = 0.005): V.Sub[] {
  const s = cs.simplify(tol), polys = s.toPolygons() as P[][]; s.delete();
  return polys.filter(p => p.length > 2).map(p => ({ closed: true, pts: p.map(([x, y]) => ({ x, y: -y })) }));
}
const style = (it: V.Item, over: Partial<V.Item>): V.Item => ({ ...it, id: V.newId(), text: undefined, clip: undefined, ...over });
const empty = (cs: CrossSection) => cs.isEmpty() || cs.area() < 1e-6;

/** Kenar çizgisinin kendi şekli (kalınlıklı). */
export function strokeCS(w: W, it: V.Item): CrossSection | null {
  const hw = Math.max(0.01, it.sw / 2), parts: CrossSection[] = [], join = it.join === 'miter' ? 'Miter' : it.join === 'bevel' ? 'Square' : 'Round';
  for (const s of it.subs) {
    const pts = V.flattenSub(s, 24).map(([x, y]) => [x, -y] as P); if (pts.length < 2) continue;
    if (s.closed) { const a = w.CrossSection.ofPolygons([pts], 'NonZero'), o = a.offset(hw, join, 4), i = a.offset(-hw, join, 4); parts.push(o.subtract(i)); a.delete(); o.delete(); i.delete(); }
    else for (let k = 1; k < pts.length; k++) { const c0 = w.CrossSection.circle(hw, 24).translate(pts[k - 1]), c1 = w.CrossSection.circle(hw, 24).translate(pts[k]); parts.push(w.CrossSection.hull([c0, c1])); c0.delete(); c1.delete(); }
  }
  if (!parts.length) return null;
  const u = w.CrossSection.union(parts); parts.forEach(p => p.delete()); return u;
}
/** Çizgiyi nesneye çevir (Ctrl+Shift+Q): kenar çizgisi dolu şekil olur. */
export function outlineToObject(w: W, it: V.Item): V.Item[] {
  if (!it.stroke) return [it];
  const cs = strokeCS(w, it); if (!cs) return [it];
  const ring = style(it, { subs: fromCS(cs), fill: it.stroke, stroke: null, even: false, dash: undefined, name: (it.name ?? 'Nesne') + ' çizgisi' }); cs.delete();
  return it.fill ? [{ ...it, stroke: null }, ring] : [ring];
}
/** Kontür: içe / dışa eşit aralıklı paralel şekiller. */
export function contour(w: W, it: V.Item, o: { dist: number; steps: number; dir: 'out' | 'in'; filled: boolean; color: string; join: 'Round' | 'Miter' | 'Square' }): V.Item[] {
  const base = it.subs.some(s => s.closed) ? toCS(w, it) : strokeCS(w, it); if (!base) return [];
  const out: V.Item[] = [];
  for (let i = 1; i <= Math.max(1, Math.min(50, o.steps)); i++) {
    const cs = base.offset((o.dir === 'out' ? 1 : -1) * o.dist * i, o.join, 4);
    if (empty(cs)) { cs.delete(); break; }
    const t = o.steps > 1 ? i / o.steps : 1;
    out.push(style(it, { subs: fromCS(cs), even: false, fill: o.filled ? mix(it.fill ?? o.color, o.color, t) : null, stroke: o.filled ? null : o.color, sw: 0.25, name: `Kontür ${i}` })); cs.delete();
  }
  base.delete();
  return o.dir === 'out' && o.filled ? out.reverse() : out; // dışa dolgulu: büyük olan arkada
}
/** Bıçak: a–b çizgisi boyunca böler, her parça ayrı nesne. */
export function knife(w: W, items: V.Item[], a: P, b: P): Map<number, V.Item[]> {
  const L = 1e4, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / d, (b[1] - a[1]) / d], n = [-u[1] * 0.01, u[0] * 0.01];
  const q = (s: number, t: number): P => [a[0] + u[0] * s + n[0] * t, -(a[1] + u[1] * s + n[1] * t)];
  const strip = w.CrossSection.ofPolygons([[q(-L, -1), q(L, -1), q(L, 1), q(-L, 1)]], 'NonZero'), out = new Map<number, V.Item[]>();
  for (const it of items) {
    if (!it.subs.some(s => s.closed)) continue;
    const cs = toCS(w, it), cut = cs.subtract(strip), parts = cut.decompose();
    if (parts.length > 1) out.set(it.id, parts.map((p, i) => style(it, { subs: fromCS(p, 0.002), even: false, name: `${it.name ?? 'Parça'} ${i + 1}` })));
    parts.forEach(p => p.delete()); cs.delete(); cut.delete();
  }
  strip.delete(); return out;
}
/** Silgi: fırça izini (r yarıçap) nesnelerden çıkarır. */
export function erase(w: W, items: V.Item[], pts: P[], r: number): Map<number, V.Item | null> {
  const caps = pts.map(p => w.CrossSection.circle(r, 24).translate([p[0], -p[1]])), hulls: CrossSection[] = [];
  for (let i = 0; i < caps.length; i++) hulls.push(i ? w.CrossSection.hull([caps[i - 1], caps[i]]) : caps[0].translate([0, 0]));
  const brush = w.CrossSection.union(hulls); caps.forEach(c => c.delete()); hulls.forEach(h => h.delete());
  const out = new Map<number, V.Item | null>();
  for (const it of items) {
    if (!it.subs.some(s => s.closed)) continue;
    const cs = toCS(w, it), cut = cs.subtract(brush);
    if (Math.abs(cut.area() - cs.area()) > 1e-6) out.set(it.id, empty(cut) ? null : { ...it, text: undefined, subs: fromCS(cut, 0.002), even: false });
    cs.delete(); cut.delete();
  }
  brush.delete(); return out;
}
/** Üst üste binenleri temizle: her nesneden üstündekiler çıkarılır. */
export function simplifyOverlaps(w: W, items: V.Item[]): V.Item[] {
  return items.map((it, i) => {
    const above = items.slice(i + 1).filter(x => x.subs.some(s => s.closed)); if (!above.length || !it.subs.some(s => s.closed)) return it;
    const css = above.map(x => toCS(w, x)), u = w.CrossSection.union(css), cs = toCS(w, it), r = cs.subtract(u);
    const res = { ...it, text: undefined, subs: fromCS(r, 0.002), even: false };
    css.forEach(c => c.delete()); u.delete(); cs.delete(); r.delete(); return res;
  }).filter(it => it.subs.length);
}
/** Birleştir (Ctrl+L): tek nesne, iç içe yollar delik. */
export const combine = (items: V.Item[]): V.Item => ({ ...items[0], id: V.newId(), text: undefined, even: true, subs: items.flatMap(i => i.subs), name: 'Birleşik' });
/** Parçala (Ctrl+K): her alt yol ayrı nesne. */
export const breakApart = (it: V.Item): V.Item[] => it.subs.map((s, i) => ({ ...it, id: V.newId(), text: undefined, subs: [s], even: false, name: `${it.name ?? 'Parça'} ${i + 1}` }));

/** Geçiş: iki şekil arasında ara şekiller. */
export function blend(a: V.Item, b: V.Item, steps: number): V.Item[] {
  const N = 96, main = (it: V.Item) => it.subs.filter(s => s.closed).map(s => V.flattenSub(s, 24)).sort((p, q) => Math.abs(area(q)) - Math.abs(area(p)))[0] ?? V.flattenSub(it.subs[0], 24);
  const res = (pts: P[]): P[] => { const c = [...pts, pts[0]], len = pathLength(c); return Array.from({ length: N }, (_, i) => along(c, len * i / N).p); };
  const A = res(main(a)); let B = res(main(b));
  if (Math.sign(area(A)) !== Math.sign(area(B))) B = B.reverse();
  let best = 0, bd = Infinity; for (let s = 0; s < N; s++) { let d = 0; for (let i = 0; i < N; i += 4) { const p = A[i], q = B[(i + s) % N]; d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; } if (d < bd) { bd = d; best = s; } }
  B = B.map((_, i) => B[(i + best) % N]);
  return Array.from({ length: steps }, (_, k) => {
    const t = (k + 1) / (steps + 1);
    return { ...a, id: V.newId(), text: undefined, even: false, name: `Geçiş ${k + 1}`, subs: [{ closed: true, pts: A.map((p, i) => ({ x: p[0] + (B[i][0] - p[0]) * t, y: p[1] + (B[i][1] - p[1]) * t })) }], fill: a.fill && b.fill ? mix(a.fill, b.fill, t) : a.fill ?? b.fill, stroke: a.stroke && b.stroke ? mix(a.stroke, b.stroke, t) : a.stroke ?? b.stroke, sw: a.sw + (b.sw - a.sw) * t };
  });
}
export const area = (p: P[]) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;

/** PowerClip içeriklerini kabın şekliyle kesip düz listeye çevirir (3B, DXF için). Gizliler çıkar. */
export function flattenClips(w: W, items: V.Item[]): V.Item[] {
  const vis = items.filter(i => !i.hidden), byId = new Map(vis.map(i => [i.id, i]));
  return vis.flatMap(it => {
    if (it.clip === undefined) return [it];
    const box = byId.get(it.clip); if (!box) return [];
    const cs = it.subs.some(s => s.closed) ? toCS(w, it) : strokeCS(w, it); if (!cs) return [];
    const bc = toCS(w, box), r = cs.intersect(bc), out = empty(r) ? [] : [{ ...it, clip: undefined, text: undefined, subs: fromCS(r, 0.002), even: false, ...(it.subs.some(s => s.closed) ? {} : { fill: it.stroke, stroke: null }) }];
    cs.delete(); bc.delete(); r.delete(); return out;
  });
}

// ---------- hazır şekiller ----------
export interface ShapeDef { id: string; label: string; even?: boolean; make: (w: W) => V.Sub[] }
const poly = (pts: P[]): V.Sub => ({ closed: true, pts: pts.map(([x, y]) => ({ x, y })) });
const param = (n: number, f: (t: number) => P): V.Sub => poly(Array.from({ length: n }, (_, i) => f(i / n * Math.PI * 2)));
const csSubs = (cs: CrossSection) => { const r = fromCS(cs, 0.002); cs.delete(); return r; };
const circ = (w: W, r: number, x: number, y: number) => w.CrossSection.circle(r, 64).translate([x, -y]);
const rr = (x0: number, y0: number, x1: number, y1: number, r: number): V.Sub => { const k = 0.5523 * r; return { closed: true, pts: [
  { x: x0 + r, y: y0, ix: x0 + r - k, iy: y0 }, { x: x1 - r, y: y0, ox: x1 - r + k, oy: y0 }, { x: x1, y: y0 + r, ix: x1, iy: y0 + r - k }, { x: x1, y: y1 - r, ox: x1, oy: y1 - r + k },
  { x: x1 - r, y: y1, ix: x1 - r + k, iy: y1 }, { x: x0 + r, y: y1, ox: x0 + r - k, oy: y1 }, { x: x0, y: y1 - r, ix: x0, iy: y1 - r + k }, { x: x0, y: y0 + r, ox: x0, oy: y0 + r - k }] }; };
const star = (n: number, k: number) => poly(Array.from({ length: 2 * n }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? k : 1; return [Math.cos(a) * r, Math.sin(a) * r]; }));
const ngon = (n: number) => poly(Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [Math.cos(a), Math.sin(a)]; }));
export const SHAPES: ShapeDef[] = [
  { id: 'rect', label: 'Dikdörtgen', make: () => [poly([[0, 0], [1, 0], [1, 1], [0, 1]])] },
  { id: 'rrect', label: 'Yuvarlak köşe', make: () => [rr(0, 0, 1, 1, 0.18)] },
  { id: 'ellipse', label: 'Elips', make: () => [V.ellipseSub(0, 0, 1, 1)] },
  { id: 'tri', label: 'Üçgen', make: () => [poly([[0.5, 0], [1, 1], [0, 1]])] },
  { id: 'rtri', label: 'Dik üçgen', make: () => [poly([[0, 0], [1, 1], [0, 1]])] },
  { id: 'diamond', label: 'Baklava', make: () => [poly([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]])] },
  { id: 'trap', label: 'Yamuk', make: () => [poly([[0.22, 0], [0.78, 0], [1, 1], [0, 1]])] },
  { id: 'para', label: 'Paralelkenar', make: () => [poly([[0.25, 0], [1, 0], [0.75, 1], [0, 1]])] },
  { id: 'pent', label: 'Beşgen', make: () => [ngon(5)] },
  { id: 'hex', label: 'Altıgen', make: () => [ngon(6)] },
  { id: 'oct', label: 'Sekizgen', make: () => [ngon(8)] },
  { id: 'star5', label: 'Yıldız', make: () => [star(5, 0.42)] },
  { id: 'star6', label: 'Altı köşe yıldız', make: () => [star(6, 0.58)] },
  { id: 'burst', label: 'Patlama', make: () => [star(14, 0.72)] },
  { id: 'heart', label: 'Kalp', make: () => [V.heartSub(0, 0, 32)] },
  { id: 'drop', label: 'Damla', make: () => [param(72, t => { const s = Math.sin(t / 2); return [Math.sin(t) * s * s * 1.2, -Math.cos(t)]; })] },
  { id: 'ring', label: 'Halka', even: true, make: () => [V.ellipseSub(0, 0, 1, 1), V.ellipseSub(0, 0, 0.6, 0.6)] },
  { id: 'frame', label: 'Çerçeve', even: true, make: () => [poly([[0, 0], [1, 0], [1, 1], [0, 1]]), poly([[0.15, 0.15], [0.85, 0.15], [0.85, 0.85], [0.15, 0.85]])] },
  { id: 'crescent', label: 'Hilal', make: w => { const a = circ(w, 1, 0, 0), b = circ(w, 0.85, 0.42, -0.18), r = a.subtract(b); a.delete(); b.delete(); return csSubs(r); } },
  { id: 'half', label: 'Yarım daire', make: () => [poly([...Array.from({ length: 49 }, (_, i) => { const a = Math.PI + i / 48 * Math.PI; return [Math.cos(a), Math.sin(a)] as P; })])] },
  { id: 'pie', label: 'Dilim', make: () => [poly([[0, 0], ...Array.from({ length: 37 }, (_, i) => { const a = -Math.PI / 2 + i / 36 * Math.PI * 1.5; return [Math.cos(a), Math.sin(a)] as P; })])] },
  { id: 'arch', label: 'Kemer', make: () => [poly([[0, 1], ...Array.from({ length: 33 }, (_, i) => { const a = Math.PI + i / 32 * Math.PI; return [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5] as P; }), [1, 1]])] },
  { id: 'arrow', label: 'Ok', make: () => [poly([[0, 0.32], [0.6, 0.32], [0.6, 0.05], [1, 0.5], [0.6, 0.95], [0.6, 0.68], [0, 0.68]])] },
  { id: 'darrow', label: 'Çift ok', make: () => [poly([[0, 0.5], [0.3, 0.08], [0.3, 0.32], [0.7, 0.32], [0.7, 0.08], [1, 0.5], [0.7, 0.92], [0.7, 0.68], [0.3, 0.68], [0.3, 0.92]])] },
  { id: 'chevron', label: 'Şerit ok', make: () => [poly([[0, 0], [0.65, 0], [1, 0.5], [0.65, 1], [0, 1], [0.35, 0.5]])] },
  { id: 'plus', label: 'Artı', make: () => [poly([[0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65], [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35]])] },
  { id: 'xmark', label: 'Çarpı', make: () => [poly([[0.2, 0], [0.5, 0.3], [0.8, 0], [1, 0.2], [0.7, 0.5], [1, 0.8], [0.8, 1], [0.5, 0.7], [0.2, 1], [0, 0.8], [0.3, 0.5], [0, 0.2]])] },
  { id: 'check', label: 'Onay', make: () => [poly([[0, 0.55], [0.15, 0.4], [0.38, 0.62], [0.85, 0.1], [1, 0.25], [0.38, 0.92]])] },
  { id: 'bolt', label: 'Şimşek', make: () => [poly([[0.55, 0], [0.1, 0.58], [0.45, 0.58], [0.35, 1], [0.9, 0.38], [0.55, 0.38], [0.7, 0]])] },
  { id: 'bubble', label: 'Konuşma balonu', make: w => { const a = w.CrossSection.ofPolygons([V.flattenSub(rr(0, 0, 1, 0.72, 0.14), 16).map(([x, y]) => [x, -y] as P)], 'NonZero'), b = w.CrossSection.ofPolygons([[[0.2, -0.6], [0.45, -0.6], [0.12, -1]]], 'NonZero'), r = a.add(b); a.delete(); b.delete(); return csSubs(r); } },
  { id: 'cloud', label: 'Bulut', make: w => { const cs = [circ(w, 0.28, 0.3, 0.62), circ(w, 0.36, 0.52, 0.45), circ(w, 0.26, 0.76, 0.6), circ(w, 0.22, 0.14, 0.72), circ(w, 0.2, 0.9, 0.74)], b = w.CrossSection.ofPolygons([[[0.14, -0.94], [0.9, -0.94], [0.9, -0.62], [0.14, -0.62]]], 'NonZero'), r = w.CrossSection.union([...cs, b]); cs.forEach(c => c.delete()); b.delete(); return csSubs(r); } },
  { id: 'shield', label: 'Kalkan', make: () => { const q = (t: number): P => { const u = 1 - t; return [u * u * 1 + 2 * u * t * 0.95 + t * t * 0.5, u * u * 0.45 + 2 * u * t * 0.85 + t * t * 1]; }; const right = Array.from({ length: 24 }, (_, i) => q(i / 24)); return [poly([[0, 0.1], [0.5, 0], [1, 0.1], ...right, [0.5, 1], ...right.map(([x, y]) => [1 - x, y] as P).reverse()])]; } },
  { id: 'gear', label: 'Dişli', even: true, make: () => { const n = 12, pts: P[] = []; for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n, d = Math.PI / n; for (const [o, r] of [[-0.55, 0.78], [-0.3, 1], [0.3, 1], [0.55, 0.78]] as const) pts.push([Math.cos(a + o * d) * r, Math.sin(a + o * d) * r]); } return [poly(pts), V.ellipseSub(0, 0, 0.3, 0.3)]; } },
  { id: 'badge', label: 'Rozet', make: () => [param(144, t => { const r = 1 + 0.07 * Math.cos(16 * t); return [Math.cos(t) * r, Math.sin(t) * r]; })] },
  { id: 'flower', label: 'Çiçek', make: () => [param(160, t => { const r = 0.45 + 0.55 * Math.abs(Math.cos(2.5 * t)); return [Math.cos(t) * r, Math.sin(t) * r]; })] },
  { id: 'tag', label: 'Etiket', even: true, make: () => [poly([[0, 0.5], [0.28, 0], [1, 0], [1, 1], [0.28, 1]]), V.ellipseSub(0.25, 0.5, 0.07, 0.07)] },
];
/** Şekli (x0,y0)–(x1,y1) kutusuna sığdırır. */
export function shapeIn(w: W, def: ShapeDef, x0: number, y0: number, x1: number, y1: number): V.Sub[] {
  const subs = def.make(w), b = V.bounds([{ id: 0, subs, fill: null, stroke: null, sw: 0, even: false }])!, sx = (x1 - x0) / ((b.x1 - b.x0) || 1), sy = (y1 - y0) / ((b.y1 - b.y0) || 1);
  return V.mapItem({ id: 0, subs, fill: null, stroke: null, sw: 0, even: false }, (x, y) => [x0 + (x - b.x0) * sx, y0 + (y - b.y0) * sy]).subs;
}

// ---------- fotoğrafı vektöre çevir ----------
export interface TraceOpts { colors: number; width: number; detail: number; removeBg: boolean; smooth: boolean }
/** Resmi renk sayısına indirip her renk bölgesinin sınırını vektöre çevirir. */
export function traceImage(w: W, img: CanvasImageSource & { width: number; height: number }, o: TraceOpts): V.Item[] {
  const maxPx = Math.round(200 + o.detail * 700), k0 = Math.min(1, maxPx / Math.max(img.width, img.height)), W_ = Math.max(2, Math.round(img.width * k0)), H = Math.max(2, Math.round(img.height * k0));
  const cv = document.createElement('canvas'); cv.width = W_; cv.height = H; const ctx = cv.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, W_, H);
  const px = ctx.getImageData(0, 0, W_, H).data, n = W_ * H, K = Math.max(1, Math.min(32, Math.round(o.colors)));
  // k-ortalama
  const samp: number[] = []; const stepS = Math.max(1, Math.floor(n / 25000)); for (let i = 0; i < n; i += stepS) if (px[i * 4 + 3] >= 128) samp.push(i);
  if (!samp.length) throw new Error('Resim tamamen şeffaf');
  const C: number[][] = [[px[samp[0] * 4], px[samp[0] * 4 + 1], px[samp[0] * 4 + 2]]];
  const dist = (i: number, c: number[]) => (px[i * 4] - c[0]) ** 2 + (px[i * 4 + 1] - c[1]) ** 2 + (px[i * 4 + 2] - c[2]) ** 2;
  while (C.length < K) { let bi = samp[0], bd = -1; for (const i of samp) { const d = Math.min(...C.map(c => dist(i, c))); if (d > bd) { bd = d; bi = i; } } if (bd <= 0) break; C.push([px[bi * 4], px[bi * 4 + 1], px[bi * 4 + 2]]); }
  for (let it = 0; it < 10; it++) { const S = C.map(() => [0, 0, 0, 0]); for (const i of samp) { let b = 0, bd = Infinity; C.forEach((c, j) => { const d = dist(i, c); if (d < bd) { bd = d; b = j; } }); const s = S[b]; s[0] += px[i * 4]; s[1] += px[i * 4 + 1]; s[2] += px[i * 4 + 2]; s[3]++; } S.forEach((s, j) => { if (s[3]) C[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; }); }
  const lab = new Int16Array(n);
  for (let i = 0; i < n; i++) { if (px[i * 4 + 3] < 128) { lab[i] = -1; continue; } let b = 0, bd = Infinity; C.forEach((c, j) => { const d = dist(i, c); if (d < bd) { bd = d; b = j; } }); lab[i] = b; }
  if (o.removeBg) { const cnt = new Map<number, number>(); const add = (i: number) => lab[i] >= 0 && cnt.set(lab[i], (cnt.get(lab[i]) ?? 0) + 1); for (let x = 0; x < W_; x++) { add(x); add((H - 1) * W_ + x); } for (let y = 0; y < H; y++) { add(y * W_); add(y * W_ + W_ - 1); } const bg = [...cnt].sort((a, b) => b[1] - a[1])[0]?.[0]; if (bg !== undefined) for (let i = 0; i < n; i++) if (lab[i] === bg) lab[i] = -1; }
  const sc = o.width / W_, items: { it: V.Item; a: number }[] = [];
  for (let j = 0; j < C.length; j++) {
    const loops = traceMask(lab, W_, H, j); if (!loops.length) continue;
    const cs0 = w.CrossSection.ofPolygons(loops.map(l => l.map(([x, y]) => [x * sc, -y * sc] as P)), 'EvenOdd'), cs1 = cs0.offset(0.45 * sc, 'Round', 2, 8), cs = cs1.simplify(0.35 * sc); cs0.delete(); cs1.delete();
    const a = cs.area(); if (a < (2 * sc) ** 2) { cs.delete(); continue; }
    const polys = (cs.toPolygons() as P[][]).filter(p => Math.abs(area(p)) > (1.5 * sc) ** 2); cs.delete();
    const subs = polys.map(p => o.smooth ? V.smooth(p.map(([x, y]) => [x, -y] as P), 0.6 * sc, true) : { closed: true, pts: p.map(([x, y]) => ({ x, y: -y })) });
    const [r, g, b] = C[j], hex = '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    items.push({ it: { id: V.newId(), subs, fill: hex, stroke: null, sw: 0.25, even: false, name: `İz ${hex}` }, a });
  }
  return items.sort((p, q) => q.a - p.a).map(x => x.it);
}
/** Etiketi j olan piksellerin sınırlarını kapalı döngüler olarak çıkarır (iç delikler dahil). */
function traceMask(lab: Int16Array, W_: number, H: number, j: number): P[][] {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W_ && y < H && lab[y * W_ + x] === j;
  const ex: number[] = [], out = new Map<number, number[]>(), key = (x: number, y: number) => y * (W_ + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => { const e = ex.length / 4; ex.push(x0, y0, x1, y1); const k = key(x0, y0); const l = out.get(k); if (l) l.push(e); else out.set(k, [e]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W_; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) add(x, y, x + 1, y);
    if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) add(x, y + 1, x, y);
  }
  const used = new Uint8Array(ex.length / 4), loops: P[][] = [];
  for (let s = 0; s < used.length; s++) {
    if (used[s]) continue;
    const loop: P[] = []; let e = s;
    for (let guard = 0; guard < used.length + 1; guard++) {
      used[e] = 1; const x0 = ex[e * 4], y0 = ex[e * 4 + 1], x1 = ex[e * 4 + 2], y1 = ex[e * 4 + 3]; loop.push([x0, y0]);
      const dx = x1 - x0, dy = y1 - y0, cand = (out.get(key(x1, y1)) ?? []).filter(c => !used[c]);
      if (!cand.length) break;
      // sağa dönüşü tercih et (köşegen dokunuşlarda bölgeler ayrı kalsın)
      const pick = cand.find(c => ex[c * 4 + 2] - ex[c * 4] === -dy && ex[c * 4 + 3] - ex[c * 4 + 1] === dx) ?? cand.find(c => ex[c * 4 + 2] - ex[c * 4] === dx && ex[c * 4 + 3] - ex[c * 4 + 1] === dy) ?? cand[0];
      e = pick;
    }
    const simp = loop.filter((p, i) => { const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length]; return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]); });
    if (simp.length > 2) loops.push(simp);
  }
  return loops;
}
