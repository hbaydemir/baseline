// Vektör dışa / içe aktarma: SVG (birebir mm), PDF (artboard başına sayfa ya da tek sayfa), DXF; PDF / AI / DXF içe aktarma.
import * as V from './vector';
import { css, isCmyk, parseCmyk, rgbOf, hexOf, type Mode } from './color';

type P = V.V;
export interface Board { id: number; name: string; x: number; y: number; w: number; h: number }
export interface Guide { axis: 'x' | 'y'; pos: number }
export interface Layer { id: number; name: string; hidden?: boolean; locked?: boolean; noPrint?: boolean }
/** Desen dolgu: döşenecek çizim (karo kökeni 0,0) ve karo ölçüsü (mm). */
export interface Pattern { name: string; items: V.Item[]; w: number; h: number }
/** Serbest vektör çizimi: belgeyle birlikte saklanır. */
export interface Sketch { items: V.Item[]; boards: Board[]; guides: Guide[]; mode: Mode; assets?: Record<string, string>; layers?: Layer[]; patterns?: Record<string, Pattern> }
export interface Box { x0: number; y0: number; x1: number; y1: number }
/** Dışa aktarmada gereken ek veriler. */
export interface Res { assets?: Record<string, string>; patterns?: Record<string, Pattern> }

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
export const boardsBox = (bs: Board[]): Box | null => bs.length ? { x0: Math.min(...bs.map(b => b.x)), y0: Math.min(...bs.map(b => b.y)), x1: Math.max(...bs.map(b => b.x + b.w)), y1: Math.max(...bs.map(b => b.y + b.h)) } : null;
function guideBox(guide: string): Box | null {
  const g = guide.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) ?? []; if (g.length < 4) return null;
  const xs = g.filter((_, i) => i % 2 === 0), ys = g.filter((_, i) => i % 2 === 1);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
const unite = (a: Box | null, b: Box | null): Box | null => !a ? b : !b ? a : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
/** Resim çerçevesinden birim kareyi çerçeveye eşleyen matris (a b c d e f). */
export function imgMatrix(it: V.Item): number[] { const [p0, p1, , p3] = it.subs[0].pts; return [p1.x - p0.x, p1.y - p0.y, p3.x - p0.x, p3.y - p0.y, p0.x, p0.y]; }

// ---------- SVG ----------
export interface SvgCtx { byId: Map<number, V.Item>; defs: string[]; free: boolean; res: Res }
const gradDef = (id: string, g: V.Grad) => {
  const st = g.stops.map(s => `<stop offset="${r4(s.o)}" stop-color="${css(s.c)}"/>`).join('');
  return g.type === 'radial' ? `<radialGradient id="${id}" cx=".5" cy=".5" r=".5">${st}</radialGradient>` : `<linearGradient id="${id}" x1="0" y1=".5" x2="1" y2=".5" gradientTransform="rotate(${r4(g.angle)} .5 .5)">${st}</linearGradient>`;
};
/** Tek öğenin SVG'si (harf renkleri, gradient, desen, resim, şeffaflık, gölge, kesik çizgi, PowerClip). */
export function itemSvg(it: V.Item, c: SvgCtx): string {
  const wrap: string[] = [];
  if (c.free && it.opacity !== undefined && it.opacity < 1) wrap.push(`opacity="${r4(it.opacity)}"`);
  if (c.free && it.shadow) { const f = `sh${it.id}`, s = it.shadow; c.defs.push(`<filter id="${f}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="${r4(s.dx)}" dy="${r4(s.dy)}" stdDeviation="${r4(s.blur / 2)}" flood-color="${css(s.color)}" flood-opacity="${r4(s.opacity)}"/></filter>`); wrap.push(`filter="url(#${f})"`); }
  let body = '';
  if (it.img) { const src = c.res.assets?.[it.img.key]; if (!src) return ''; body = `<image href="${src}" x="0" y="0" width="1" height="1" preserveAspectRatio="none" transform="matrix(${imgMatrix(it).map(r4).join(' ')})"/>`; }
  else {
    let fillRef: string | null = null;
    if (it.fill && it.grad && c.free) { const id = `gr${it.id}`; c.defs.push(gradDef(id, it.grad)); fillRef = `url(#${id})`; }
    else if (it.fill && it.pat && c.res.patterns?.[it.pat]) { const id = `pt${it.pat}`; if (!c.defs.some(d => d.includes(`id="${id}"`))) { const P = c.res.patterns[it.pat], inner = P.items.map(x => itemSvg(x, { ...c, byId: new Map(P.items.map(q => [q.id, q])) })).join(''); c.defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${r4(P.w)}" height="${r4(P.h)}">${inner}</pattern>`); } fillRef = `url(#${id})`; }
    const st = it.stroke ? ` stroke="${css(it.stroke)}" stroke-width="${r4(it.sw)}" stroke-linejoin="${it.join ?? 'round'}" stroke-linecap="${it.cap ?? 'round'}"${it.dash?.length ? ` stroke-dasharray="${it.dash.map(r4).join(' ')}"` : ''}` : '';
    const groups = fillRef ? [{ fill: it.fill, subs: it.subs }] : V.fillGroups(it);
    if (groups.length === 1) body = `<path d="${V.itemD(it)}" fill="${fillRef ?? css(groups[0].fill)}"${it.even ? ' fill-rule="evenodd"' : ''}${st}/>`;
    else body = groups.map(g => `<path d="${g.subs.map(V.subD).join('')}" fill="${css(g.fill)}"${it.even ? ' fill-rule="evenodd"' : ''}/>`).join('') + (st ? `<path d="${V.itemD(it)}" fill="none"${st}/>` : '');
  }
  let el = wrap.length || it.img ? `<g ${wrap.join(' ')}>${body}</g>` : body;
  if (it.clip !== undefined) { const box = c.byId.get(it.clip); if (!box) return ''; const id = `cl${it.clip}`; if (!c.defs.some(d => d.includes(`id="${id}"`))) c.defs.push(`<clipPath id="${id}"><path d="${V.itemD(box)}"${box.even ? ' clip-rule="evenodd"' : ''}/></clipPath>`); el = `<g clip-path="url(#${id})">${el}</g>`; }
  return el;
}
/** Birebir mm ölçüyle SVG. Yüzeye çizde yüzey sınırı kırmızı kıl çizgi; serbest çizimde kutu artboardlar. */
export function exportSvg(items: V.Item[], o: { guide?: string; what?: 'both' | 'surface' | 'design'; box?: Box | null; free?: boolean; res?: Res }): string {
  const what = o.what ?? 'design', vis = items.filter(i => !i.hidden), useG = !!o.guide && what !== 'design', useI = what !== 'surface' && vis.length > 0;
  let b = o.box ?? null;
  if (!b) { if (useI) b = V.bounds(vis); if (useG) b = unite(b, guideBox(o.guide!)); }
  b ??= { x0: 0, y0: 0, x1: 1, y1: 1 };
  const w = r4(b.x1 - b.x0), h = r4(b.y1 - b.y0), ctx: SvgCtx = { byId: new Map(vis.map(i => [i.id, i])), defs: [], free: !!o.free, res: o.res ?? {} };
  const body = useI ? vis.map(it => itemSvg(it, ctx)).join('\n') : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="${r4(b.x0)} ${r4(b.y0)} ${w} ${h}">\n`
    + (ctx.defs.length ? `<defs>${ctx.defs.join('')}</defs>\n` : '')
    + (useG ? `<g id="yuzey"><path d="${V.joinOutline(o.guide!)}" fill-rule="evenodd" fill="none" stroke="#ff0000" stroke-width="0.1"/></g>\n` : '')
    + (useI ? `<g id="tasarim">\n${body}\n</g>\n` : '')
    + '</svg>\n';
}
/** SVG'yi resme çevirir (PNG / JPG); ölçü piksel. JPG'de arka plan beyaz. */
export async function rasterize(svg: string, w: number, h: number, type: 'png' | 'jpg'): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w)); cv.height = Math.max(1, Math.round(h));
    const g = cv.getContext('2d')!; if (type === 'jpg') { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); } g.drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, type === 'jpg' ? 'image/jpeg' : 'image/png', 0.92)); if (!blob) throw new Error('Resim oluşturulamadı (çok büyük olabilir; DPI\'yi düşür)');
    return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); }
}

// ---------- PDF ----------
const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();
function colorOp(c: string, stroke: boolean) {
  if (isCmyk(c)) return `${parseCmyk(c).map(v => n3(v / 100)).join(' ')} ${stroke ? 'K' : 'k'}`;
  return `${rgbOf(c).map(v => n3(v / 255)).join(' ')} ${stroke ? 'RG' : 'rg'}`;
}
function subsOps(subs: V.Sub[], dx = 0, dy = 0) {
  const o: string[] = [];
  for (const s of subs) {
    const p = s.pts; if (!p.length) continue;
    o.push(`${n3(p[0].x + dx)} ${n3(p[0].y + dy)} m`);
    const seg = (a: V.Pt, b: V.Pt) => a.ox !== undefined || b.ix !== undefined ? o.push(`${n3((a.ox ?? a.x) + dx)} ${n3((a.oy ?? a.y) + dy)} ${n3((b.ix ?? b.x) + dx)} ${n3((b.iy ?? b.y) + dy)} ${n3(b.x + dx)} ${n3(b.y + dy)} c`) : o.push(`${n3(b.x + dx)} ${n3(b.y + dy)} l`);
    for (let i = 1; i < p.length; i++) seg(p[i - 1], p[i]);
    if (s.closed) { if (p.length > 1) seg(p[p.length - 1], p[0]); o.push('h'); }
  }
  return o.join('\n');
}
const latin1 = (b: Uint8Array) => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return s; };
async function decodeImage(src: string): Promise<{ w: number; h: number; rgb: Uint8Array; a: Uint8Array | null }> {
  const bmp = await createImageBitmap(await (await fetch(src)).blob()), k = Math.min(1, 4000 / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d')!; g.drawImage(bmp, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, rgb = new Uint8Array(w * h * 3), a = new Uint8Array(w * h); let alpha = false;
  for (let i = 0, j = 0; i < w * h; i++) { rgb[j++] = d[i * 4]; rgb[j++] = d[i * 4 + 1]; rgb[j++] = d[i * 4 + 2]; a[i] = d[i * 4 + 3]; if (a[i] < 255) alpha = true; }
  return { w, h, rgb, a: alpha ? a : null };
}
/** Vektör PDF: her sayfa bir kutu (mm). Resimler gömülür; gradient gölgelendirme, desen döşeme olarak yazılır; gölge bulanıksız. */
export async function exportPdf(items: V.Item[], pages: Box[], res: Res = {}): Promise<Uint8Array> {
  const { zlibSync } = await import('fflate');
  const vis = items.filter(i => !i.hidden), byId = new Map(vis.map(i => [i.id, i])), K = 72 / 25.4, gs = new Map<number, string>();
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add('');
  const gsOf = (a: number) => { const k = Math.round(a * 100) / 100; if (!gs.has(k)) gs.set(k, `GS${gs.size}`); return `/${gs.get(k)} gs`; };
  // resimler
  const imgs = new Map<string, string>();
  for (const it of vis) if (it.img && !imgs.has(it.img.key) && res.assets?.[it.img.key]) {
    try {
      const im = await decodeImage(res.assets[it.img.key]), data = latin1(zlibSync(im.rgb));
      let smask = '';
      if (im.a) { const ad = latin1(zlibSync(im.a)); smask = ` /SMask ${add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${ad.length} >>\nstream\n${ad}\nendstream`)} 0 R`; }
      imgs.set(it.img.key, `Im${imgs.size}:${add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask} /Length ${data.length} >>\nstream\n${data}\nendstream`)}`);
    } catch { /* okunamayan resim atlanır */ }
  }
  // gradientler (sh: geçerli dönüşümle çizilir)
  const shades = new Map<number, string>();
  const fn = (g: V.Grad, cmyk: boolean) => {
    const col = (c: string) => cmyk ? parseCmyk(isCmyk(c) ? c : 'cmyk(0,0,0,0)').map(v => n3(v / 100)).join(' ') : rgbOf(c).map(v => n3(v / 255)).join(' ');
    const st = [...g.stops].sort((a, b) => a.o - b.o); if (st.length === 1) st.push(st[0]);
    const parts = st.slice(1).map((s, i) => `<< /FunctionType 2 /Domain [0 1] /C0 [${col(st[i].c)}] /C1 [${col(s.c)}] /N 1 >>`);
    if (parts.length === 1 && st[0].o <= 0 && st[1].o >= 1) return parts[0];
    const all = [`<< /FunctionType 2 /Domain [0 1] /C0 [${col(st[0].c)}] /C1 [${col(st[0].c)}] /N 1 >>`, ...parts, `<< /FunctionType 2 /Domain [0 1] /C0 [${col(st[st.length - 1].c)}] /C1 [${col(st[st.length - 1].c)}] /N 1 >>`];
    const bounds = [Math.max(1e-4, st[0].o), ...st.slice(1).map(s => Math.min(1 - 1e-4, s.o))];
    return `<< /FunctionType 3 /Domain [0 1] /Functions [${all.join(' ')}] /Bounds [${bounds.map(n3).join(' ')}] /Encode [${all.map(() => '0 1').join(' ')}] >>`;
  };
  for (const it of vis) if (it.fill && it.grad && !it.img) {
    const b = V.bounds([{ ...it, stroke: null }]); if (!b) continue;
    const g = it.grad, cmyk = g.stops.every(s => isCmyk(s.c)), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, w = b.x1 - b.x0, h = b.y1 - b.y0;
    let coords: string;
    if (g.type === 'radial') coords = `[${n3(cx)} ${n3(cy)} 0 ${n3(cx)} ${n3(cy)} ${n3(Math.max(w, h) / 2)}]`;
    else { const a = g.angle * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), L = (Math.abs(dx) * w + Math.abs(dy) * h) / 2; coords = `[${n3(cx - dx * L)} ${n3(cy - dy * L)} ${n3(cx + dx * L)} ${n3(cy + dy * L)}]`; }
    shades.set(it.id, `Sh${shades.size}:${add(`<< /ShadingType ${g.type === 'radial' ? 3 : 2} /ColorSpace /Device${cmyk ? 'CMYK' : 'RGB'} /Coords ${coords} /Function ${fn(g, cmyk)} /Extend [true true] >>`)}`);
  }
  const draw = (it: V.Item, pats: Map<string, string>): string => {
    const o: string[] = ['q'];
    if (it.clip !== undefined) { const box = byId.get(it.clip); if (!box) return ''; o.push(subsOps(box.subs), box.even ? 'W* n' : 'W n'); }
    if (it.img) { const im = imgs.get(it.img.key); if (!im) return ''; const [a, b, c, d, e, f] = imgMatrix(it); if (it.opacity !== undefined && it.opacity < 1) o.push(gsOf(it.opacity)); o.push(`${n3(a)} ${n3(b)} ${n3(-c)} ${n3(-d)} ${n3(e + c)} ${n3(f + d)} cm`, `/${im.split(':')[0]} Do`, 'Q'); return o.join('\n'); }
    if (it.shadow && it.subs.length) { const s = it.shadow; o.push('q', gsOf(s.opacity * (it.opacity ?? 1)), colorOp(s.color, false), colorOp(s.color, true), `${n3(it.sw)} w`, subsOps(it.subs, s.dx, s.dy), it.fill ? (it.even ? 'f*' : 'f') : 'S', 'Q'); }
    if (it.opacity !== undefined && it.opacity < 1) o.push(gsOf(it.opacity));
    const fr = it.even ? '*' : '';
    if (it.fill) {
      const sh = shades.get(it.id), pt = it.pat ? pats.get(it.pat) : undefined;
      if (sh) o.push('q', subsOps(it.subs), `W${fr} n`, `/${sh.split(':')[0]} sh`, 'Q');
      else if (pt) o.push('/Pattern cs', `/${pt.split(':')[0]} scn`, subsOps(it.subs), `f${fr}`);
      else for (const g of V.fillGroups(it)) if (g.fill) o.push(colorOp(g.fill, false), subsOps(g.subs), `f${fr}`);
    }
    if (it.stroke) o.push(colorOp(it.stroke, true), `${n3(Math.max(0.05, it.sw))} w`, `${{ miter: 0, round: 1, bevel: 2 }[it.join ?? 'round']} j`, `${{ butt: 0, round: 1, square: 2 }[it.cap ?? 'round']} J`, `[${(it.dash ?? []).map(n3).join(' ')}] 0 d`, subsOps(it.subs), 'S');
    o.push('Q'); return o.join('\n');
  };
  const pageIds: number[] = [];
  for (const b of pages) {
    const M = `${n3(K)} 0 0 ${n3(-K)} ${n3(-b.x0 * K)} ${n3(b.y1 * K)}`, pats = new Map<string, string>();
    for (const it of vis) if (it.fill && it.pat && !it.grad && res.patterns?.[it.pat] && !pats.has(it.pat)) {
      const P = res.patterns[it.pat], pb = new Map(P.items.map(q => [q.id, q])), body = P.items.map(x => draw(x, new Map())).join('\n'); void pb;
      pats.set(it.pat, `Pt${pats.size}:${add(`<< /Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 ${n3(P.w)} ${n3(P.h)}] /XStep ${n3(P.w)} /YStep ${n3(P.h)} /Matrix [${M}] /Resources << /ExtGState GSREF >> /Length ${body.length} >>\nstream\n${body}\nendstream`)}`);
    }
    const on = (it: V.Item) => { const q = V.bounds([it.clip !== undefined ? byId.get(it.clip) ?? it : it]); return !q || (q.x1 >= b.x0 && q.x0 <= b.x1 && q.y1 >= b.y0 && q.y0 <= b.y1); };
    const content = latin1(zlibSync(new TextEncoder().encode(`q ${M} cm\n${vis.filter(on).map(it => draw(it, pats)).join('\n')}\nQ`))), cid = add(`<< /Length ${content.length} /Filter /FlateDecode >>\nstream\n${content}\nendstream`);
    const dict = (m: Map<string, string> | Map<number, string>) => [...m.values()].map(v => `/${v.split(':')[0]} ${v.split(':')[1]} 0 R`).join(' ');
    pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n3((b.x1 - b.x0) * K)} ${n3((b.y1 - b.y0) * K)}] /Resources << /ExtGState GSREF /XObject << ${dict(imgs)} >> /Shading << ${dict(shades)} >> /Pattern << ${dict(pats)} >> >> /Contents ${cid} 0 R >>`));
  }
  const gsDict = `<< ${[...gs].map(([a, n]) => `/${n} << /Type /ExtGState /ca ${a} /CA ${a} >>`).join(' ')} >>`;
  for (let k = 0; k < objs.length; k++) if (objs[k].includes('GSREF')) objs[k] = objs[k].replace(/GSREF/g, gsDict).replace(/\/Length (\d+) >>\nstream\n([\s\S]*)\nendstream$/, (_m, _l, body: string) => `/Length ${body.length} >>\nstream\n${body}\nendstream`);
  objs[1] = `<< /Type /Pages /Kids [${pageIds.map(i => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const parts: string[] = ['%PDF-1.4\n%\xE2\xE3\xCF\xD3\n']; let len = parts[0].length; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(len); const t = `${i + 1} 0 obj\n${o}\nendobj\n`; parts.push(t); len += t.length; });
  parts.push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${len}\n%%EOF\n`);
  const total = parts.reduce((s, x) => s + x.length, 0), bytes = new Uint8Array(total); let at = 0;
  for (const t of parts) { for (let i = 0; i < t.length; i++) bytes[at + i] = t.charCodeAt(i) & 255; at += t.length; }
  return bytes;
}

// ---------- DXF ----------
/** DXF (R12, mm): her şekil POLYLINE; katman adı renkten (lazer yazılımlarında kes / kazı ayrımı için). */
export function exportDxf(items: V.Item[], guide?: string): string {
  const L: string[] = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const poly = (pts: P[], closed: boolean, layer: string) => { L.push('0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0'); for (const [x, y] of pts) L.push('0', 'VERTEX', '8', layer, '10', n3(x), '20', n3(-y)); L.push('0', 'SEQEND', '8', layer); };
  const lay = (c: string | null) => c ? 'RENK_' + css(c).slice(1).toUpperCase() : 'CIZGI';
  for (const it of items.filter(i => !i.hidden && !i.img)) V.fillGroups(it).forEach(g => { for (const s of g.subs) { const p = V.flattenSub(s, 24); if (p.length > 1) poly(p, s.closed, lay(g.fill ?? it.stroke)); } });
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
export async function pdfPages(data: ArrayBuffer): Promise<number> { const pdfjs = await import('pdfjs-dist'); pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default; const d = await pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) }).promise; const n = d.numPages; await d.destroy(); return n; }
export async function importPdf(data: ArrayBuffer, pageNo = 1): Promise<V.Item[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise, page = await doc.getPage(Math.max(1, Math.min(doc.numPages, pageNo))), list = await page.getOperatorList(), vp = page.getViewport({ scale: 1 }), OPS = pdfjs.OPS;
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
