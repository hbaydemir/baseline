// Vektör dışa / içe aktarma: SVG (birebir mm), PDF (artboard başına sayfa ya da tek sayfa), DXF; PDF / AI / DXF içe aktarma.
import * as V from './vector';
import { css, isCmyk, parseCmyk, rgbOf, hexOf, type Mode } from './color';

type P = V.V;
export interface Board { id: number; name: string; x: number; y: number; w: number; h: number }
export interface Guide { axis: 'x' | 'y'; pos: number }
/** Serbest vektör çizimi: belgeyle birlikte saklanır. */
export interface Sketch { items: V.Item[]; boards: Board[]; guides: Guide[]; mode: Mode }
export interface Box { x0: number; y0: number; x1: number; y1: number }

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
export const boardsBox = (bs: Board[]): Box | null => bs.length ? { x0: Math.min(...bs.map(b => b.x)), y0: Math.min(...bs.map(b => b.y)), x1: Math.max(...bs.map(b => b.x + b.w)), y1: Math.max(...bs.map(b => b.y + b.h)) } : null;
function guideBox(guide: string): Box | null {
  const g = guide.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) ?? []; if (g.length < 4) return null;
  const xs = g.filter((_, i) => i % 2 === 0), ys = g.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
const unite = (a: Box | null, b: Box | null): Box | null => !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };

// ---------- SVG ----------
/** Tek öğenin SVG'si (şeffaflık, gölge, kesik çizgi, PowerClip dahil). */
export function itemSvg(it: V.Item, byId: Map<number, V.Item>, defs: string[], free = true): string {
  const a: string[] = [`d="${V.itemD(it)}"`, `fill="${css(it.fill)}"`];
  if (it.even) a.push('fill-rule="evenodd"');
  if (it.stroke) {
    a.push(`stroke="${css(it.stroke)}"`, `stroke-width="${r4(it.sw)}"`, `stroke-linejoin="${it.join ?? 'round'}"`, `stroke-linecap="${it.cap ?? 'round'}"`);
    if (it.dash?.length) a.push(`stroke-dasharray="${it.dash.map(r4).join(' ')}"`);
  }
  if (free && it.opacity !== undefined && it.opacity < 1) a.push(`opacity="${r4(it.opacity)}"`);
  if (free && it.shadow) { const f = `sh${it.id}`, s = it.shadow; defs.push(`<filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${r4(s.dx)}" dy="${r4(s.dy)}" stdDeviation="${r4(s.blur / 2)}" flood-color="${css(s.color)}" flood-opacity="${r4(s.opacity)}"/></filter>`); a.push(`filter="url(#${f})"`); }
  let el = `<path ${a.join(' ')}/>`;
  if (it.clip !== undefined) { const box = byId.get(it.clip); if (!box) return ''; const c = `cl${it.clip}`; if (!defs.some(d => d.includes(`id="${c}"`))) defs.push(`<clipPath id="${c}"><path d="${V.itemD(box)}"${box.even ? ' clip-rule="evenodd"' : ''}/></clipPath>`); el = `<g clip-path="url(#${c})">${el}</g>`; }
  return el;
}
/** Birebir mm ölçüyle SVG. Yüzeye çizde yüzey sınırı kırmızı kıl çizgi; serbest çizimde kutu artboardlar. */
export function exportSvg(items: V.Item[], o: { guide?: string; what?: 'both' | 'surface' | 'design'; box?: Box | null; free?: boolean }): string {
  const what = o.what ?? 'design', vis = items.filter(i => !i.hidden), useG = !!o.guide && what !== 'design', useI = what !== 'surface' && vis.length > 0;
  let b = o.box ?? null;
  if (!b) { if (useI) b = V.bounds(vis); if (useG) b = unite(b, guideBox(o.guide!)); }
  b ??= { x0: 0, y0: 0, x1: 1, y1: 1 };
  const w = r4(b.x1 - b.x0), h = r4(b.y1 - b.y0), byId = new Map(vis.map(i => [i.id, i])), defs: string[] = [];
  const body = useI ? vis.map(it => itemSvg(it, byId, defs, o.free)).join('\n') : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${r4(b.x0)} ${r4(b.y0)} ${w} ${h}">\n`
    + (defs.length ? `<defs>${defs.join('')}</defs>\n` : '')
    + (useG ? `<g id="yuzey"><path d="${V.joinOutline(o.guide!)}" fill-rule="evenodd" fill="none" stroke="#ff0000" stroke-width="0.1"/></g>\n` : '')
    + (useI ? `<g id="tasarim">\n${body}\n</g>\n` : '')
    + '</svg>\n';
}

// ---------- PDF ----------
const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
function colorOp(c: string, stroke: boolean) {
  if (isCmyk(c)) return `${parseCmyk(c).map(v => n3(v / 100)).join(' ')} ${stroke ? 'K' : 'k'}`;
  return `${rgbOf(c).map(v => n3(v / 255)).join(' ')} ${stroke ? 'RG' : 'rg'}`;
}
function pathOps(it: V.Item, dx = 0, dy = 0) {
  const o: string[] = [];
  for (const s of it.subs) {
    const p = s.pts; if (!p.length) continue;
    o.push(`${n3(p[0].x + dx)} ${n3(p[0].y + dy)} m`);
    const seg = (a: V.Pt, b: V.Pt) => a.ox !== undefined || b.ix !== undefined ? o.push(`${n3((a.ox ?? a.x) + dx)} ${n3((a.oy ?? a.y) + dy)} ${n3((b.ix ?? b.x) + dx)} ${n3((b.iy ?? b.y) + dy)} ${n3(b.x + dx)} ${n3(b.y + dy)} c`) : o.push(`${n3(b.x + dx)} ${n3(b.y + dy)} l`);
    for (let i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
    if (s.closed) { if (p.length > 1) seg(p[p.length - 1], p[0]); o.push('h'); }
  }
  return o.join('\n');
}
/** Vektör PDF: her sayfa bir kutu (mm). Yazılar zaten eğri; gölge bulanıksız kaydırılmış kopya olarak yazılır. */
export function exportPdf(items: V.Item[], pages: Box[]): Uint8Array {
  const vis = items.filter(i => !i.hidden), byId = new Map(vis.map(i => [i.id, i])), K = 72 / 25.4, gs = new Map<number, string>();
  const gsOf = (a: number) => { const k = Math.round(a * 100) / 100; if (!gs.has(k)) gs.set(k, `GS${gs.size}`); return `/${gs.get(k)} gs`; };
  const draw = (it: V.Item) => {
    const o: string[] = ['q'];
    if (it.clip !== undefined) { const box = byId.get(it.clip); if (!box) return ''; o.push(pathOps(box), box.even ? 'W* n' : 'W n'); }
    if (it.shadow && it.subs.length) { const s = it.shadow; o.push('q', gsOf(s.opacity * (it.opacity ?? 1)), colorOp(s.color, false), colorOp(s.color, true), `${n3(it.sw)} w`, pathOps(it, s.dx, s.dy), it.fill ? (it.even ? 'f*' : 'f') : 'S', 'Q'); }
    if (it.opacity !== undefined && it.opacity < 1) o.push(gsOf(it.opacity));
    if (it.fill) o.push(colorOp(it.fill, false));
    if (it.stroke) { o.push(colorOp(it.stroke, true), `${n3(Math.max(0.05, it.sw))} w`, `${{ miter: 0, round: 1, bevel: 2 }[it.join ?? 'round']} j`, `${{ butt: 0, round: 1, square: 2 }[it.cap ?? 'round']} J`, `[${(it.dash ?? []).map(n3).join(' ')}] 0 d`); }
    o.push(pathOps(it), it.fill && it.stroke ? (it.even ? 'B*' : 'B') : it.fill ? (it.even ? 'f*' : 'f') : it.stroke ? 'S' : 'n', 'Q');
    return o.join('\n');
  };
  const streams = pages.map(b => `q ${n3(K)} 0 0 ${n3(-K)} ${n3(-b.x0 * K)} ${n3(b.y1 * K)} cm\n${vis.map(draw).join('\n')}\nQ`);
  const objs: string[] = [], pageIds: number[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add('');
  const gsDict = () => `<< ${[...gs].map(([a, n]) => `/${n} << /Type /ExtGState /ca ${a} /CA ${a} >>`).join(' ')} >>`;
  const contentIds = streams.map(s => add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`));
  pages.forEach((b, i) => pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n3((b.x1 - b.x0) * K)} ${n3((b.y1 - b.y0) * K)}] /Resources << /ExtGState ${gsDict()} >> /Contents ${contentIds[i]} 0 R >>`)));
  objs[1] = `<< /Type /Pages /Kids [${pageIds.map(i => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255; return bytes;
}

// ---------- DXF ----------
/** DXF (R12, mm): her şekil POLYLINE; katman adı renkten (lazer yazılımlarında kes / kazı ayrımı için). */
export function exportDxf(items: V.Item[], guide?: string): string {
  const L: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const poly = (pts: P[], closed: boolean, layer: string) => { L.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0'); for (const [x, y] of pts) L.push('0', 'VERTEX', '8', layer, '10', n3(x), '20', n3(-y)); L.push('0', 'SEQEND', '8', layer); };
  const lay = (c: string | null) => c ? 'RENK_' + css(c).slice(1).toUpperCase() : 'CIZGI';
  for (const it of items.filter(i => !i.hidden)) for (const s of it.subs) { const p = V.flattenSub(s, 24); if (p.length > 1) poly(p, s.closed, lay(it.fill ?? it.stroke)); }
  if (guide) for (const s of V.parseD(V.joinOutline(guide))) poly(V.flattenSub(s, 8), s.closed, 'YUZEY');
  L.push('0', 'ENDSEC', '0', 'EOF');
  return L.join('\n') + '\n';
}
/** DXF içe aktarma: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, SPLINE (mm kabul edilir). */
export function importDxf(text: string): V.Item[] {
  const t = text.split(/\r?\n/), pairs: [number, string][] = [];
  for (let i = 0; i + 1 < t.length; i += 2) pairs.push([parseInt(t[i].trim()), t[i + 1].trim()]);
  let i = pairs.findIndex(([c, v], k) => c === 2 && v === 'ENTITIES' && pairs[k - 1]?.[1] === 'SECTION'); if (i < 0) throw new Error('DXF içinde çizim bulunamadı');
  const items: V.Item[] = [], lines: V.Sub[] = [];
  const item = (subs: V.Sub[]) => subs.length && items.push({ id: V.newId(), subs, fill: null, stroke: '#222222', sw: 0.25, even: false, name: 'DXF' });
  const arcPts = (cx: number, cy: number, r: number, a0: number, a1: number): P[] => { while (a1 <= a0) a1 += Math.PI * 2; const n = Math.max(8, Math.ceil((a1 - a0) / (Math.PI / 32))); return Array.from({ length: n + 1 }, (_, k) => { const a = a0 + (a1 - a0) * k / n; return [cx + r * Math.cos(a), -(cy + r * Math.sin(a))]; }); };
  const bulge = (a: P, b: P, bu: number): P[] => { if (!bu) return [b]; const th = 4 * Math.atan(bu), d = Math.hypot(b[0] - a[0], b[1] - a[1]), r = d / (2 * Math.sin(th / 2)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = r * Math.cos(th / 2), nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d, cx = mx + nx * h, cy = my + ny * h, a0 = Math.atan2(a[1] - cy, a[0] - cx), n = Math.max(4, Math.ceil(Math.abs(th) / (Math.PI / 32))); return Array.from({ length: n }, (_, k) => { const ang = a0 + th * (k + 1) / n; return [cx + Math.abs(r) * Math.cos(ang) * Math.sign(r), cy + Math.abs(r) * Math.sin(ang) * Math.sign(r)] as P; }).map((p, k, arr) => k === arr.length - 1 ? b : p); };
  const sub = (pts: P[], closed: boolean): V.Sub => ({ closed, pts: pts.map(([x, y]) => ({ x, y })) });
  i++;
  while (i < pairs.length) {
    const [c, v] = pairs[i]; if (c !== 0) { i++; continue; }
    if (v === 'ENDSEC') break;
    const ent = v, g: [number, string][] = []; i++;
    while (i < pairs.length && pairs[i][0] !== 0) g.push(pairs[i++]);
    const num = (code: number, d = 0) => { const f = g.find(p => p[0] === code); return f ? parseFloat(f[1]) : d; };
    if (ent === 'LINE') lines.push(sub([[num(10), -num(20)], [num(11), -num(21)]], false));
    else if (ent === 'LWPOLYLINE') {
      const pts: P[] = [], bs: number[] = []; for (const [code, val] of g) { if (code === 10) { pts.push([parseFloat(val), 0]); bs.push(0); } else if (code === 20) pts[pts.length - 1][1] = parseFloat(val); else if (code === 42) bs[bs.length - 1] = parseFloat(val); }
      const closed = (num(70) & 1) === 1, out: P[] = pts.length ? [pts[0]] : [];
      for (let k = 1; k < (closed ? pts.length + 1 : pts.length); k++) out.push(...bulge(pts[k - 1], pts[k % pts.length], bs[k - 1]));
      if (closed) out.pop();
      item([sub(out.map(([x, y]) => [x, -y]), closed)]);
    } else if (ent === 'POLYLINE') {
      const closed = (num(70) & 1) === 1, pts: P[] = [], bs: number[] = [];
      while (i < pairs.length && pairs[i][1] === 'VERTEX' && pairs[i][0] === 0) { i++; const vg: [number, string][] = []; while (i < pairs.length && pairs[i][0] !== 0) vg.push(pairs[i++]); const f = (cd: number) => parseFloat(vg.find(p => p[0] === cd)?.[1] ?? '0'); pts.push([f(10), f(20)]); bs.push(f(42)); }
      if (pairs[i]?.[1] === 'SEQEND') { i++; while (i < pairs.length && pairs[i][0] !== 0) i++; }
      const out: P[] = pts.length ? [pts[0]] : []; for (let k = 1; k < (closed ? pts.length + 1 : pts.length); k++) out.push(...bulge(pts[k - 1], pts[k % pts.length], bs[k - 1])); if (closed) out.pop();
      if (out.length > 1) item([sub(out.map(([x, y]) => [x, -y]), closed)]);
    } else if (ent === 'CIRCLE') item([V.ellipseSub(num(10), -num(20), num(40), num(40))]);
    else if (ent === 'ARC') item([sub(arcPts(num(10), num(20), num(40), num(50) * Math.PI / 180, num(51) * Math.PI / 180), false)]);
    else if (ent === 'ELLIPSE') {
      const cx = num(10), cy = num(20), mx = num(11), my = num(21), ratio = num(40, 1), t0 = num(41, 0), t1 = num(42, Math.PI * 2), R = Math.hypot(mx, my), rot = Math.atan2(my, mx), full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-6 || Math.abs(t1 - t0) < 1e-9;
      const n = 72, a1 = t1 <= t0 ? t1 + Math.PI * 2 : t1, pts = Array.from({ length: full ? n : n + 1 }, (_, k) => { const t = full ? k / n * Math.PI * 2 : t0 + (a1 - t0) * k / n, x = R * Math.cos(t), y = R * ratio * Math.sin(t); return [cx + x * Math.cos(rot) - y * Math.sin(rot), -(cy + x * Math.sin(rot) + y * Math.cos(rot))] as P; });
      item([sub(pts, full)]);
    } else if (ent === 'SPLINE') {
      const cp: P[] = []; for (const [code, val] of g) { if (code === 10) cp.push([parseFloat(val), 0]); else if (code === 20) cp[cp.length - 1][1] = -parseFloat(val); }
      if (cp.length > 1) item([V.smooth(cp, 0.001, (num(70) & 1) === 1)]);
    }
  }
  if (lines.length) items.unshift({ id: V.newId(), subs: lines, fill: null, stroke: '#222222', sw: 0.25, even: false, name: 'DXF çizgiler' });
  if (!items.length) throw new Error('DXF içinde desteklenen çizim yok');
  return items;
}

// ---------- PDF / AI içe aktarma ----------
/** PDF ya da AI (PDF uyumlu) dosyasının ilk sayfasındaki vektör yolları. Yazılar eğriye çevrilmemişse gelmez. */
export async function importPdf(data: ArrayBuffer): Promise<V.Item[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise, page = await doc.getPage(1), list = await page.getOperatorList(), vp = page.getViewport({ scale: 1 }), OPS = pdfjs.OPS;
  const MM = 25.4 / 72, mul = (m: number[], n: number[]) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  type St = { ctm: number[]; fill: string; stroke: string; lw: number };
  let st: St = { ctm: vp.transform as number[], fill: '#000000', stroke: '#000000', lw: 1 }; const stack: St[] = [], items: V.Item[] = [];
  let subs: V.Sub[] = [], cur: V.Sub | null = null;
  const T = (x: number, y: number): [number, number] => { const m = st.ctm; return [(m[0] * x + m[2] * y + m[4]) * MM, (m[1] * x + m[3] * y + m[5]) * MM]; };
  const pt = (x: number, y: number): V.Pt => { const [a, b] = T(x, y); return { x: a, y: b }; };
  const emit = (fill: boolean, stroke: boolean, even: boolean) => {
    const s = subs.filter(q => q.pts.length > 1 || q.closed); subs = []; cur = null; if (!s.length || (!fill && !stroke)) return;
    const k = Math.sqrt(Math.abs(st.ctm[0] * st.ctm[3] - st.ctm[1] * st.ctm[2])) * MM;
    items.push({ id: V.newId(), subs: s, fill: fill ? st.fill : null, stroke: stroke ? st.stroke : null, sw: Math.max(0.05, st.lw * k), even, name: 'PDF' });
  };
  for (let k = 0; k < list.fnArray.length; k++) {
    const fn = list.fnArray[k], a = list.argsArray[k] as unknown[];
    switch (fn) {
      case OPS.save: stack.push({ ...st, ctm: [...st.ctm] }); break;
      case OPS.restore: st = stack.pop() ?? st; break;
      case OPS.transform: st.ctm = mul(st.ctm, a as number[]); break;
      case OPS.paintFormXObjectBegin: stack.push({ ...st, ctm: [...st.ctm] }); if (Array.isArray(a[0]) && (a[0] as number[]).length === 6) st.ctm = mul(st.ctm, a[0] as number[]); break;
      case OPS.paintFormXObjectEnd: st = stack.pop() ?? st; break;
      case OPS.setFillRGBColor: st.fill = typeof a[0] === 'string' ? a[0] as string : hexOf(a[0] as number, a[1] as number, a[2] as number); break;
      case OPS.setStrokeRGBColor: st.stroke = typeof a[0] === 'string' ? a[0] as string : hexOf(a[0] as number, a[1] as number, a[2] as number); break;
      case OPS.setLineWidth: st.lw = a[0] as number; break;
      case OPS.constructPath: {
        const ops = a[0] as number[], c = a[1] as number[]; let j = 0;
        for (const op of ops) {
          if (op === OPS.moveTo) { cur = { pts: [pt(c[j], c[j + 1])], closed: false }; subs.push(cur); j += 2; }
          else if (op === OPS.lineTo) { cur?.pts.push(pt(c[j], c[j + 1])); j += 2; }
          else if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) {
            if (!cur) { j += op === OPS.curveTo ? 6 : 4; continue; }
            const last = cur.pts[cur.pts.length - 1];
            let c1: V.Pt, c2: V.Pt, e: V.Pt;
            if (op === OPS.curveTo) { c1 = pt(c[j], c[j + 1]); c2 = pt(c[j + 2], c[j + 3]); e = pt(c[j + 4], c[j + 5]); j += 6; }
            else if (op === OPS.curveTo2) { c1 = { x: last.x, y: last.y }; c2 = pt(c[j], c[j + 1]); e = pt(c[j + 2], c[j + 3]); j += 4; }
            else { c1 = pt(c[j], c[j + 1]); e = pt(c[j + 2], c[j + 3]); c2 = { x: e.x, y: e.y }; j += 4; }
            last.ox = c1.x; last.oy = c1.y; cur.pts.push({ x: e.x, y: e.y, ix: c2.x, iy: c2.y });
          } else if (op === OPS.closePath) { if (cur) { const f = cur.pts[0], l = cur.pts[cur.pts.length - 1]; if (cur.pts.length > 1 && Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; cur.pts.pop(); } cur.closed = true; } }
          else if (op === OPS.rectangle) { const [x, y, w, h] = c.slice(j, j + 4); subs.push({ closed: true, pts: [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)] }); cur = null; j += 4; }
        }
        break;
      }
      case OPS.fill: emit(true, false, false); break;
      case OPS.eoFill: emit(true, false, true); break;
      case OPS.stroke: emit(false, true, false); break;
      case OPS.closeStroke: subs.forEach(s => s.closed = true); emit(false, true, false); break;
      case OPS.fillStroke: emit(true, true, false); break;
      case OPS.eoFillStroke: emit(true, true, true); break;
      case OPS.closeFillStroke: subs.forEach(s => s.closed = true); emit(true, true, false); break;
      case OPS.closeEOFillStroke: subs.forEach(s => s.closed = true); emit(true, true, true); break;
      case OPS.endPath: subs = []; cur = null; break;
    }
  }
  await doc.destroy();
  if (!items.length) throw new Error('Bu PDF içinde vektör çizim bulunamadı (yazılar eğriye çevrilmemiş olabilir)');
  return items;
}
