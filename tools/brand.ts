// Baseline kurumsal kimlik kılavuzu: logoyu Sora'dan vektör olarak kurar, kılavuzu PDF'e ve logoları SVG'ye yazar.
// Çalıştır: npx tsx tools/brand.ts   (çıktı: brand/)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse, type Font } from 'opentype.js/dist/opentype.mjs';
import * as V from '../src/app/vector';
import * as IO from '../src/app/vectorIO';
import { toCmyk, parseCmyk, rgbOf } from '../src/app/color';

type It = V.Item;
const load = (f: string) => { const b = readFileSync(`brand/fonts/${f}`); return parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const FONTS: Record<number, Font[]> = { 400: [load('sora-latin-400-normal.woff'), load('sora-latin-ext-400-normal.woff')], 700: [load('sora-latin-700-normal.woff'), load('sora-latin-ext-700-normal.woff')] };

// --- marka renkleri ---
export const C = { blue: '#1677FF', navy: '#0E3A8C', orange: '#FF8A00', ink: '#152033', paper: '#F3F6F9', white: '#FFFFFF', gray: '#6B7785', line: '#DDE3EA', red: '#E5484D' };

let nid = 1;
const item = (subs: V.Sub[], fill: string | null, extra: Partial<It> = {}): It => ({ id: nid++, subs, fill, stroke: null, sw: 0, even: false, ...extra });
const rr = (x: number, y: number, w: number, h: number, r: number): V.Sub => { r = Math.min(r, w / 2, h / 2); const k = 0.5523 * r, x1 = x + w, y1 = y + h; return { closed: true, pts: [
  { x: x + r, y, ix: x + r - k, iy: y }, { x: x1 - r, y, ox: x1 - r + k, oy: y }, { x: x1, y: y + r, ix: x1, iy: y + r - k }, { x: x1, y: y1 - r, ox: x1, oy: y1 - r + k },
  { x: x1 - r, y: y1, ix: x1 - r + k, iy: y1 }, { x: x + r, y: y1, ox: x + r - k, oy: y1 }, { x, y: y1 - r, ix: x, iy: y1 - r + k }, { x, y: y + r, ox: x, oy: y + r - k }] }; };
const rect = (x: number, y: number, w: number, h: number, fill: string, r = 0, extra: Partial<It> = {}) => item([r ? rr(x, y, w, h, r) : V.rectSub(x, y, w, h)], fill, extra);
const line = (x0: number, y0: number, x1: number, y1: number, color: string, w = 0.25, dash?: number[]) => item([{ closed: false, pts: [{ x: x0, y: y0 }, { x: x1, y: y1 }] }], null, { stroke: color, sw: w, dash, cap: 'butt' });

// --- yazı: harfler eğriye çevrilir (Sora latin + latin-ext) ---
function glyph(ch: string, w: number) { for (const f of FONTS[w]) { const i = f.charToGlyphIndex(ch); if (i > 0) return { f, g: f.glyphs.get(i) }; } return { f: FONTS[w][0], g: FONTS[w][0].glyphs.get(0) }; }
function cmds(path: { commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[] }): V.Sub[] {
  const subs: V.Sub[] = []; let cur: V.Sub | null = null;
  for (const c of path.commands) {
    if (c.type === 'M') { cur = { closed: false, pts: [{ x: c.x!, y: c.y! }] }; subs.push(cur); }
    else if (c.type === 'L') cur!.pts.push({ x: c.x!, y: c.y! });
    else if (c.type === 'C') { const l = cur!.pts[cur!.pts.length - 1]; l.ox = c.x1; l.oy = c.y1; cur!.pts.push({ x: c.x!, y: c.y!, ix: c.x2, iy: c.y2 }); }
    else if (c.type === 'Q') { const l = cur!.pts[cur!.pts.length - 1]; l.ox = l.x + 2 / 3 * (c.x1! - l.x); l.oy = l.y + 2 / 3 * (c.y1! - l.y); cur!.pts.push({ x: c.x!, y: c.y!, ix: c.x! + 2 / 3 * (c.x1! - c.x!), iy: c.y! + 2 / 3 * (c.y1! - c.y!) }); }
    else if (c.type === 'Z' && cur) { const f = cur.pts[0], l = cur.pts[cur.pts.length - 1]; if (cur.pts.length > 1 && Math.hypot(f.x - l.x, f.y - l.y) < 1e-6) { f.ix = l.ix; f.iy = l.iy; cur.pts.pop(); } cur.closed = true; }
  }
  return subs.filter(s => s.pts.length > 1);
}
/** Tek satır yazı (x: sol, y: taban çizgisi, size: punto mm). */
function text(str: string, x: number, y: number, size: number, w: 400 | 700, fill: string, ls = 0, align: 'left' | 'center' | 'right' = 'left') {
  const width = measure(str, size, w, ls); let cx = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const subs: V.Sub[] = []; let prev: { f: Font; g: ReturnType<Font['glyphs']['get']> } | null = null;
  for (const ch of str) {
    const q = glyph(ch, w), sc = size / q.f.unitsPerEm;
    if (prev && prev.f === q.f) cx += q.f.getKerningValue(prev.g, q.g) * sc;
    subs.push(...cmds(q.g.getPath(cx, y, size))); cx += (q.g.advanceWidth ?? 0) * sc + ls; prev = q;
  }
  return item(subs, fill, { name: str.slice(0, 30) });
}
function measure(str: string, size: number, w: 400 | 700, ls = 0) { let s = 0, prev: { f: Font; g: ReturnType<Font['glyphs']['get']> } | null = null; for (const ch of str) { const q = glyph(ch, w), sc = size / q.f.unitsPerEm; if (prev && prev.f === q.f) s += q.f.getKerningValue(prev.g, q.g) * sc; s += (q.g.advanceWidth ?? 0) * sc + ls; prev = q; } return s - ls; }
/** Paragraf: kelime kaydırır; dönen y son satırın altı. */
function para(str: string, x: number, y: number, maxW: number, size: number, fill: string, w: 400 | 700 = 400, lh = 1.55): { items: It[]; y: number } {
  const out: It[] = []; let lineS = '';
  for (const word of str.split(' ')) { const t = lineS ? lineS + ' ' + word : word; if (measure(t, size, w) > maxW && lineS) { out.push(text(lineS, x, y, size, w, fill)); y += size * lh; lineS = word; } else lineS = t; }
  if (lineS) { out.push(text(lineS, x, y, size, w, fill)); y += size * lh; }
  return { items: out, y };
}
const inkB = (size: number) => { const q = glyph('b', 700), bb = q.g.getBoundingBox(), sc = size / q.f.unitsPerEm; return { x0: bb.x1 * sc, x1: bb.x2 * sc, h: bb.y2 * sc }; };

// --- logo ---
/** Simge: yuvarlak köşeli kare, ortada b, altında turuncu tabla çizgisi. */
export function icon(x: number, y: number, s: number, bg: string = C.blue, fg: string = C.white, bar: string = C.orange): It[] {
  const fs = s * 0.82, ib = inkB(fs), bx = x + s / 2 - (ib.x0 + ib.x1) / 2, base = y + s * 0.78;
  return [rect(x, y, s, s, bg, s * 0.22), text('b', bx, base, fs, 700, fg), rect(bx + ib.x0 + s * 0.02, y + s * 0.83, ib.x1 - ib.x0 - s * 0.04, s * 0.07, bar, s * 0.035)];
}
/** Yazı logosu: “baseline”, ilk harfin altında turuncu tabla çizgisi. (x: sol, y: taban çizgisi, size: punto) */
export function wordmark(x: number, y: number, size: number, fg: string = C.ink, bar: string = C.orange): It[] {
  const ib = inkB(size);
  return [text('baseline', x, y, size, 700, fg, -0.02 * size), rect(x + ib.x0 + size * 0.02, y + size * 0.1, ib.x1 - ib.x0 - size * 0.04, size * 0.09, bar, size * 0.045)];
}
const wmWidth = (size: number) => measure('baseline', size, 700, -0.02 * size);

// --- kılavuz sayfaları (A4 yatay) ---
const PW = 297, PH = 210, GAP = 30;
const pages: IO.Box[] = [], all: It[] = [];
function page(fn: (ox: number, add: (...its: It[]) => void) => void, bg = C.white) {
  const ox = pages.length * (PW + GAP); pages.push({ x0: ox, y0: 0, x1: ox + PW, y1: PH });
  all.push(rect(ox, 0, PW, PH, bg)); fn(ox, (...its) => all.push(...its));
}
const M = 22; // kenar boşluğu
function head(ox: number, add: (...its: It[]) => void, no: string, title: string, lead: string) {
  add(text(no, ox + M, 34, 5, 700, C.orange), text(title, ox + M, 47, 11, 700, C.ink, -0.15));
  add(...para(lead, ox + M, 58, 120, 3.5, C.gray).items);
  add(line(ox + M, PH - 14, ox + PW - M, PH - 14, C.line, 0.25), text('Baseline · Kurumsal kimlik kılavuzu', ox + M, PH - 8, 2.6, 400, C.gray), text(String(pages.length).padStart(2, '0'), ox + PW - M, PH - 8, 2.6, 700, C.gray, 0, 'right'));
}
const label = (x: number, y: number, a: string, b?: string) => [text(a, x, y, 3, 700, C.ink), ...(b ? [text(b, x, y + 4.6, 2.8, 400, C.gray)] : [])];

// 1. Kapak
page((ox, add) => {
  const s = 26, w = wmWidth(s);
  add(...icon(ox + PW / 2 - 15, 46, 30, C.white, C.blue));
  add(...wordmark(ox + PW / 2 - w / 2, 120, s, C.white));
  add(text('Kurumsal kimlik kılavuzu', ox + M, PH - 16, 4.2, 700, C.white), text('Sürüm 1.0 · 2026', ox + PW - M, PH - 16, 3.4, 400, '#9CC2FF', 0, 'right'));
}, C.navy);

// 2. Logo sistemi
page((ox, add) => {
  head(ox, add, '01', 'Logo', 'Baseline logosu iki hâlden oluşur: simge ve yazı logosu. İkisi aynı logonun parçalarıdır; birlikte ya da ayrı kullanılabilir. Simgedeki b, yazının ilk harfidir. Altındaki turuncu çizgi, 3B baskıda tablaya oturan ilk katmanı, yani taban çizgisini (baseline) anlatır.');
  const y0 = 92;
  add(rect(ox + M, y0, 100, 82, C.paper, 4), ...icon(ox + M + 27, y0 + 14, 46));
  add(rect(ox + M + 108, y0, PW - 2 * M - 108, 82, C.paper, 4));
  const s = 22, w = wmWidth(s); add(...wordmark(ox + M + 108 + (PW - 2 * M - 108) / 2 - w / 2, y0 + 47, s));
  add(...label(ox + M, y0 + 90, 'Simge', 'Uygulama ikonu, favicon, profil resmi, küçük alanlar'), ...label(ox + M + 108, y0 + 90, 'Yazı logosu', 'Uygulama başlığı, web sitesi, belgeler, ambalaj'));
});

// 3. Yapı, güvenli alan, en küçük boy
page((ox, add) => {
  head(ox, add, '02', 'Yapı ve güvenli alan', 'Simgenin köşe yarıçapı kenarın %22\'sidir. b harfi Sora Bold, kenarın %82\'si boyundadır; turuncu çizgi b\'nin genişliğinde ve kenarın %7\'si kalınlığındadır. Logonun çevresinde, çizimde gösterilen boşluk bırakılır; bu alana başka hiçbir öğe girmez.');
  const s = 52, x = ox + M + 14, y = 100;
  add(rect(x - s * 0.25, y - s * 0.25, s * 1.5, s * 1.5, '#FFF4E6', 2), ...icon(x, y, s));
  add(item([rr(x - s * 0.25, y - s * 0.25, s * 1.5, s * 1.5, 2)], null, { stroke: C.orange, sw: 0.3, dash: [1.2, 1] }));
  for (const f of [0.22, 0.78, 0.83, 0.9]) add(line(x - s * 0.25, y + s * f, x + s * 1.25, y + s * f, '#9CC2FF', 0.2, [0.8, 0.8]));
  add(text('%22 köşe', x + s * 1.3, y + 4, 2.6, 400, C.gray), text('taban çizgisi %78', x + s * 1.3, y + s * 0.78 + 1, 2.6, 400, C.gray), text('tabla %83–90', x + s * 1.3, y + s * 0.9 + 1, 2.6, 400, C.gray), text('güvenli alan: kenarın ¼\'ü', x - s * 0.25, y + s * 1.25 + 6, 2.6, 400, C.gray));
  const ws = 16, ww = wmWidth(ws), wx = ox + 168, wy = 116, pad = ws * 0.6;
  add(rect(wx - pad, wy - ws * 0.78 - pad, ww + 2 * pad, ws * 0.78 + ws * 0.2 + 2 * pad, '#FFF4E6', 2), ...wordmark(wx, wy, ws));
  add(item([rr(wx - pad, wy - ws * 0.78 - pad, ww + 2 * pad, ws * 0.78 + ws * 0.2 + 2 * pad, 2)], null, { stroke: C.orange, sw: 0.3, dash: [1.2, 1] }), text('güvenli alan: b\'nin yüksekliğinin yarısı', wx - pad, wy + ws * 0.2 + pad + 6, 2.6, 400, C.gray));
  add(text('En küçük boy', ox + 168, 162, 3.2, 700, C.ink));
  add(...icon(ox + 168, 168, 6), text('Simge: 6 mm · 16 px', ox + 177, 172.5, 2.8, 400, C.gray));
  add(...wordmark(ox + 222, 173, 5.2), text('Yazı: 24 mm · 90 px', ox + 222, 180, 2.8, 400, C.gray));
});

// 4. Renkler
page((ox, add) => {
  head(ox, add, '03', 'Renkler', 'Ana renk Baseline mavisidir; turuncu yalnız tabla çizgisinde ve küçük vurgularda kullanılır. CMYK değerleri RGB\'den hesaplanmış yaklaşık değerlerdir; baskıdan önce prova alınmalıdır.');
  const cols: [string, string, string][] = [[C.blue, 'Baseline mavisi', 'Ana renk'], [C.navy, 'Gece laciverti', 'Koyu zemin'], [C.orange, 'Tabla turuncusu', 'Vurgu, tabla çizgisi'], [C.ink, 'Mürekkep', 'Yazı'], [C.paper, 'Kağıt', 'Açık zemin'], [C.white, 'Beyaz', 'Zemin, ters logo']];
  const w = (PW - 2 * M - 5 * 6) / 6;
  cols.forEach(([c, n, u], i) => {
    const x = ox + M + i * (w + 6), y = 86, [r, g, b] = rgbOf(c).map(Math.round), [cc, mm, yy, kk] = parseCmyk(toCmyk(c)).map(Math.round);
    add(rect(x, y, w, 46, c, 3, c === C.white || c === C.paper ? { stroke: C.line, sw: 0.25 } : {}));
    add(text(n, x, y + 54, 3.2, 700, C.ink), text(u, x, y + 59, 2.6, 400, C.gray));
    add(text(`HEX  ${c}`, x, y + 67, 2.6, 400, C.ink), text(`RGB  ${r} ${g} ${b}`, x, y + 72, 2.6, 400, C.ink), text(`CMYK ≈ ${cc} ${mm} ${yy} ${kk}`, x, y + 77, 2.6, 400, C.ink));
  });
  add(rect(ox + M, 172, (PW - 2 * M) * 0.7, 6, C.blue, 3), rect(ox + M + (PW - 2 * M) * 0.7, 172, (PW - 2 * M) * 0.2, 6, C.navy, 0), rect(ox + M + (PW - 2 * M) * 0.9, 172, (PW - 2 * M) * 0.1, 6, C.orange, 3));
  add(text('Oran: mavi %70 · lacivert %20 · turuncu %10', ox + M, 185, 2.8, 400, C.gray));
});

// 5. Tipografi
page((ox, add) => {
  head(ox, add, '04', 'Tipografi', 'Logo ve bütün marka yazıları Sora ile yazılır. Başlıklar Sora Bold, metinler Sora Regular. Sora, SIL Open Font License ile ücretsiz kullanılabilir.');
  add(text('Aa', ox + M, 150, 62, 700, C.ink, -1), text('Sora', ox + M + 2, 166, 6, 700, C.blue));
  const x = ox + 120;
  add(text('Bold 700', x, 96, 3, 700, C.orange), text('Tablaya oturan ilk katman', x, 108, 8, 700, C.ink, -0.1));
  add(text('Regular 400', x, 122, 3, 700, C.orange), text('Çiz, böl, bas. 2D ve 3D aynı yerde.', x, 132, 5.5, 400, C.ink));
  add(text('ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ', x, 150, 4.2, 700, C.ink, 0.3), text('abcçdefgğhıijklmnoöprsştuüvyz', x, 158, 4.2, 400, C.ink, 0.3), text('0123456789  % & ( ) . , : ; ! ?', x, 166, 4.2, 400, C.gray, 0.3));
});

// 6. Doğru kullanım
page((ox, add) => {
  head(ox, add, '05', 'Kullanım', 'Logo açık zeminde mürekkep, koyu ve mavi zeminde beyaz kullanılır; tabla çizgisi her zaman turuncudur. Tek renk baskıda (damga, lazer, kabartma) çizgi de logoyla aynı renk olur.');
  const tiles: [string, string, string, string, string][] = [[C.paper, C.ink, C.orange, 'Açık zemin', ''], [C.navy, C.white, C.orange, 'Koyu zemin', ''], [C.blue, C.white, C.orange, 'Mavi zemin', ''], [C.white, '#000000', '#000000', 'Tek renk: siyah', 'damga, lazer kazıma'], [C.ink, C.white, C.white, 'Tek renk: beyaz', 'koyu malzeme, kabartma'], [C.orange, C.white, C.ink, 'Turuncu zemin', 'çizgi mürekkep olur']];
  const tw = (PW - 2 * M - 2 * 6) / 3, th = 40;
  tiles.forEach(([bg, fg, bar, n, d], i) => {
    const x = ox + M + (i % 3) * (tw + 6), y = 84 + Math.floor(i / 3) * (th + 18), s = 11, w = wmWidth(s);
    add(rect(x, y, tw, th, bg, 3, bg === C.white ? { stroke: C.line, sw: 0.25 } : {}), ...wordmark(x + tw / 2 - w / 2, y + th / 2 + 3.5, s, fg, bar));
    add(text(n, x, y + th + 6, 2.9, 700, C.ink), ...(d ? [text(d, x + measure(n, 2.9, 700) + 2, y + th + 6, 2.7, 400, C.gray)] : []));
  });
});

// 7. Yanlış kullanım
page((ox, add) => {
  head(ox, add, '06', 'Yanlış kullanım', 'Logonun oranları, renkleri ve harfleri değiştirilmez. Aşağıdakiler logoyu zayıflatır.');
  const tw = (PW - 2 * M - 2 * 6) / 3, th = 40, s = 11, w = wmWidth(s);
  const bad: [string, (cx: number, cy: number) => It[]][] = [
    ['Esnetme', (cx, cy) => wordmark(cx - w / 2, cy, s).map(it => V.mapItem(it, (x, y) => [cx + (x - cx) * 1.35, cy + (y - cy) * 0.8]))],
    ['Çizgiyi başka renk yapma', (cx, cy) => wordmark(cx - w / 2, cy, s, C.ink, C.blue)],
    ['Döndürme', (cx, cy) => wordmark(cx - w / 2, cy, s).map(it => V.rotateItem(it, -12, cx, cy - 4))],
    ['Çizgiyi kaydırma', (cx, cy) => { const [t] = wordmark(cx - w / 2, cy, s); const ib = inkB(s); return [t, rect(cx - w / 2 + w - (ib.x1 - ib.x0), cy + s * 0.1, ib.x1 - ib.x0, s * 0.09, C.orange, s * 0.045)]; }],
    ['İnce yazı', (cx, cy) => { const ib = inkB(s); return [text('baseline', cx - w / 2, cy, s, 400, C.ink, -0.02 * s), rect(cx - w / 2 + ib.x0, cy + s * 0.1, ib.x1 - ib.x0, s * 0.09, C.orange, s * 0.045)]; }],
    ['Kontur ve gölge ekleme', (cx, cy) => [...wordmark(cx - w / 2 + 0.8, cy + 0.8, s, '#B8C2CE', '#B8C2CE'), ...wordmark(cx - w / 2, cy, s).map(it => ({ ...it, stroke: C.blue, sw: 0.35 }))]],
  ];
  bad.forEach(([n, f], i) => {
    const x = ox + M + (i % 3) * (tw + 6), y = 76 + Math.floor(i / 3) * (th + 18);
    add(rect(x, y, tw, th, C.paper, 3), ...f(x + tw / 2, y + th / 2 + 3.5));
    add(item([{ closed: false, pts: [{ x: x + tw - 9, y: y + 4 }, { x: x + tw - 4, y: y + 9 }] }, { closed: false, pts: [{ x: x + tw - 4, y: y + 4 }, { x: x + tw - 9, y: y + 9 }] }], null, { stroke: C.red, sw: 0.8, cap: 'round' }));
    add(text(n, x, y + th + 6, 2.9, 700, C.ink));
  });
});

// 8. Uygulama ikonu ve uygulamada
page((ox, add) => {
  head(ox, add, '07', 'Uygulama ikonu', 'Simge, işletim sistemi ve tarayıcı ikonlarında aynı çizimle kullanılır; küçüldükçe sadeleştirilmez. Uygulama başlığında yazı logosu kullanılır.');
  let x = ox + M; const base = 128;
  for (const [px, mm] of [[512, 48], [256, 32], [128, 20], [64, 12], [32, 8], [16, 5]] as const) { add(...icon(x, base - mm, mm), text(`${px} px`, x, base + 6, 2.6, 400, C.gray)); x += mm + 14; }
  const hx = ox + M, hy = 146, hw = PW - 2 * M, hh = 40;
  add(rect(hx, hy, hw, hh, C.paper, 3), rect(hx, hy, hw, 10, C.white, 3, { stroke: C.line, sw: 0.25 }));
  add(...wordmark(hx + 5, hy + 6.8, 4.6), rect(hx + 31, hy + 2.6, 17, 4.8, C.paper, 1.4), rect(hx + 39.5, hy + 3, 8, 4, C.white, 1.2), text('2D', hx + 33.6, hy + 6.2, 2.1, 700, C.gray), text('3D', hx + 41.6, hy + 6.2, 2.1, 700, C.blue));
  for (const [k, l] of ['Yeni', 'Aç', 'Kaydet', 'İçe aktar', 'Dışa aktar'].entries()) { const bx = hx + hw / 2 - 52 + k * 21; add(rect(bx, hy + 2.4, 19, 5.2, k === 4 ? C.blue : C.white, 1.4, k === 4 ? {} : { stroke: C.line, sw: 0.2 }), text(l, bx + 9.5, hy + 5.9, 2.1, 700, k === 4 ? C.white : C.ink, 0, 'center')); }
  add(...icon(hx + hw / 2 - 9, hy + 16, 18));
  add(text('Uygulama başlığında yazı logosu; açılış ekranında simge', hx, hy + hh + 6, 2.8, 400, C.gray));
});

// --- çıktılar ---
mkdirSync('brand/logo', { recursive: true });
const svg = (its: It[], name: string, pad = 0) => { const b = V.bounds(its)!; writeFileSync(`brand/logo/${name}.svg`, IO.exportSvg(its, { box: { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, free: true })); };
svg(icon(0, 0, 100), 'baseline-simge');
svg(icon(0, 0, 100, C.white, C.blue), 'baseline-simge-beyaz');
svg(wordmark(0, 50, 50), 'baseline-yazi');
svg(wordmark(0, 50, 50, C.white), 'baseline-yazi-beyaz');
svg(wordmark(0, 50, 50, '#000000', '#000000'), 'baseline-yazi-siyah');
const pdf = await IO.exportPdf(all, pages);
writeFileSync('brand/Baseline-Kurumsal-Kimlik.pdf', pdf);
console.log(`${pages.length} sayfa, ${(pdf.length / 1024).toFixed(0)} KB`);

// --- uygulamaya giden logo verisi ve uygulama ikonu ---
{
  const r = (n: number) => Math.round(n * 100) / 100, d = (its: It[]) => its.map(V.itemD).join('').replace(/-?\d+\.\d+/g, m => String(r(+m)));
  const ic = icon(0, 0, 100), wm = wordmark(0, 50, 50), wb = V.bounds(wm)!, wmN = wm.map(it => V.mapItem(it, (x, y) => [x - wb.x0, y - wb.y0]));
  writeFileSync('src/app/brandData.ts', `// tools/brand.ts üretir; elle değiştirme.\n/** Simge: viewBox 0 0 100 100 (karo, b, tabla çizgisi). */\nexport const ICON = { tile: '${d([ic[0]])}', b: '${d([ic[1]])}', bar: '${d([ic[2]])}' };\n/** Yazı logosu: viewBox 0 0 w h (yazı, tabla çizgisi). */\nexport const WORD = { w: ${r(wb.x1 - wb.x0)}, h: ${r(wb.y1 - wb.y0)}, text: '${d([wmN[0]])}', bar: '${d([wmN[1]])}' };\nexport const BRAND = { blue: '${C.blue}', navy: '${C.navy}', orange: '${C.orange}', ink: '${C.ink}', paper: '${C.paper}' };\n`);
  const m = 3, app = icon(m, m, 100 - 2 * m);
  writeFileSync('brand/logo/app-icon.svg', IO.exportSvg(app, { box: { x0: 0, y0: 0, x1: 100, y1: 100 }, free: true }).replace(/width="100mm" height="100mm"/, 'width="1024" height="1024"'));
  writeFileSync('public/favicon.svg', IO.exportSvg(icon(0, 0, 100), { box: { x0: 0, y0: 0, x1: 100, y1: 100 }, free: true }).replace(/width="100mm" height="100mm"/, 'width="64" height="64"'));
}
