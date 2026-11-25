import { XMLParser } from 'fast-xml-parser';
import svgpath from 'svgpath';
import type { CrossSection, ManifoldToplevel } from 'manifold-3d';

type P2 = [number, number];
export interface Region { color: string; cs: CrossSection }
type Style = Record<string, string>;
const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', lime: '#00ff00', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', gray: '#808080', grey: '#808080', brown: '#a52a2a', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', navy: '#000080', gold: '#ffd700', silver: '#c0c0c0', teal: '#008080', maroon: '#800000', olive: '#808000' };

function color(v: string | undefined, cur: string): string | null {
  v = (v ?? '').trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor') return cur;
  let m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])[0-9a-f]?$/);
  if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(v)) return v.slice(0, 7);
  m = v.match(/^rgba?\(\s*([\d.]+)(%?)[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?/);
  if (m) return '#' + [m[1], m[3], m[4]].map(x => Math.min(255, Math.round(+x * (m![2] ? 2.55 : 1))).toString(16).padStart(2, '0')).join('');
  return NAMED[v] ?? (v.startsWith('url(') ? '#808080' : '#000000');
}

/** SVG yolunu poligon konturlarına çevirir; tol = en büyük sapma. */
export function flatten(d: string, transform = '', tol = 0.05): { pts: P2[]; closed: boolean }[] {
  const out: { pts: P2[]; closed: boolean }[] = [];
  let cur: P2[] = [], x = 0, y = 0;
  const end = (closed: boolean) => { if (cur.length > 1) out.push({ pts: cur, closed }); cur = []; };
  svgpath(d).transform(transform).abs().unshort().unarc().iterate((s) => {
    const a = s as unknown as [string, ...number[]], c = a[0], n = a.slice(1) as number[];
    if (c === 'M') { end(false); [x, y] = n; cur = [[x, y]]; return; }
    if (c === 'Z') { const s0 = cur[0]; end(true); if (s0) { [x, y] = s0; cur = [[x, y]]; } return; }
    if (!cur.length) cur = [[x, y]];
    if (c === 'L') { [x, y] = n; cur.push([x, y]); }
    else if (c === 'H') { x = n[0]; cur.push([x, y]); }
    else if (c === 'V') { y = n[0]; cur.push([x, y]); }
    else if (c === 'C' || c === 'Q') {
      const p: P2[] = [[x, y]]; for (let i = 0; i < n.length; i += 2) p.push([n[i], n[i + 1]]);
      // ikinci türev sınırından parça sayısı
      let dd = 0; for (let i = 0; i + 2 < p.length; i++) dd = Math.max(dd, Math.hypot(p[i][0] - 2 * p[i + 1][0] + p[i + 2][0], p[i][1] - 2 * p[i + 1][1] + p[i + 2][1]));
      const deg = p.length - 1, N = Math.min(200, Math.max(2, Math.ceil(Math.sqrt(deg * (deg - 1) * dd / (8 * tol)))));
      for (let k = 1; k <= N; k++) {
        const t = k / N; let q = p;
        while (q.length > 1) q = q.slice(1).map((b, i) => [q[i][0] + (b[0] - q[i][0]) * t, q[i][1] + (b[1] - q[i][1]) * t] as P2);
        cur.push(q[0]);
      }
      [x, y] = p[deg];
    }
  });
  end(false);
  return out;
}

const L = (v: string | undefined, d = 0) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : d; };
function pathOf(tag: string, a: Style): string {
  const ell = (cx: number, cy: number, rx: number, ry: number) => rx > 0 && ry > 0 ? `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z` : '';
  switch (tag) {
    case 'path': return a.d ?? '';
    case 'circle': return ell(L(a.cx), L(a.cy), L(a.r), L(a.r));
    case 'ellipse': return ell(L(a.cx), L(a.cy), L(a.rx), L(a.ry));
    case 'rect': {
      const x = L(a.x), y = L(a.y), w = L(a.width), h = L(a.height), rx = Math.min(L(a.rx, L(a.ry)), w / 2), ry = Math.min(L(a.ry, L(a.rx)), h / 2);
      if (w <= 0 || h <= 0) return '';
      if (!rx || !ry) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      const c = `A${rx} ${ry} 0 0 1 `;
      return `M${x + rx} ${y}H${x + w - rx}${c}${x + w} ${y + ry}V${y + h - ry}${c}${x + w - rx} ${y + h}H${x + rx}${c}${x} ${y + h - ry}V${y + ry}${c}${x + rx} ${y}Z`;
    }
    case 'polygon': case 'polyline': return a.points ? `M${a.points.trim()}${tag === 'polygon' ? 'Z' : ''}` : '';
    case 'line': return `M${L(a.x1)} ${L(a.y1)}L${L(a.x2)} ${L(a.y2)}`;
  }
  return '';
}

/** SVG -> renk başına, birbiriyle çakışmayan bölgeler (üstteki alttakini keser). width mm'ye ölçekli, ortalı. */
export function svgRegions(wasm: ManifoldToplevel, text: string, width: number): Region[] {
  if (text.length > 5_000_000) throw new Error('SVG çok büyük');
  const { CrossSection } = wasm;
  const tree = new XMLParser({ preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, parseTagValue: false }).parse(text) as any[];
  const css: Record<string, Style> = {}, ids: Record<string, any> = {};
  const decl = (s: string): Style => Object.fromEntries(s.split(';').map(x => { const k = x.indexOf(':'); return [x.slice(0, k).trim(), x.slice(k + 1).replace('!important', '').trim()]; }).filter(x => x[0]));
  const tagOf = (n: any) => Object.keys(n).find(k => k !== ':@') ?? '';
  const scan = (ns: any[]) => ns.forEach(n => {
    const t = tagOf(n), a = n[':@'] ?? {};
    if (a.id) ids[a.id] = n;
    if (t === 'style') for (const m of (n.style.map((x: any) => x['#text'] ?? '').join('')).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g))
      for (const sel of m[1].split(',')) Object.assign(css[sel.trim()] ??= {}, decl(m[2]));
    if (Array.isArray(n[t])) scan(n[t]);
  });
  scan(tree);

  const raw: { color: string; d: string; tf: string; even: boolean; stroke: number; join: string }[] = [];
  const SKIP = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'style', 'title', 'metadata', 'marker', 'linearGradient', 'radialGradient', 'text', 'image']);
  const walk = (ns: any[], inh: Style, tf: string, depth: number) => ns.forEach(n => {
    const tag = tagOf(n), a: Style = n[':@'] ?? {};
    if (tag.startsWith('#') || tag.startsWith('?') || SKIP.has(tag) || depth > 40) return;
    const own: Style = { ...a, ...css[tag], ...(a.class ?? '').split(/\s+/).reduce((o: Style, c: string) => ({ ...o, ...css['.' + c] }), {}), ...(a.id ? css['#' + a.id] : {}), ...decl(a.style ?? '') };
    if (own.display === 'none' || own.visibility === 'hidden') return;
    const st: Style = { ...inh };
    for (const k of ['fill', 'stroke', 'stroke-width', 'fill-rule', 'color', 'fill-opacity', 'stroke-opacity']) if (own[k] !== undefined && own[k] !== 'inherit') st[k] = own[k];
    const t2 = a.transform ? `${tf} ${a.transform}` : tf;
    if (tag === 'use') {
      const r = ids[(a.href ?? a['xlink:href'] ?? '').replace('#', '')];
      if (r) { const rt = tagOf(r); walk(rt === 'symbol' ? r.symbol : [r], st, `${t2} translate(${L(a.x)} ${L(a.y)})`, depth + 8); }
      return;
    }
    const d = pathOf(tag, a);
    if (d) {
      const cur = color(st.color ?? 'black', '#000000') ?? '#000000';
      const fill = L(st['fill-opacity'], 1) === 0 ? null : color(st.fill ?? 'black', cur), str = !st.stroke || L(st['stroke-opacity'], 1) === 0 ? null : color(st.stroke, cur);
      if (fill && tag !== 'line') raw.push({ color: fill, d, tf: t2, even: st['fill-rule'] === 'evenodd', stroke: 0, join: '' });
      if (str) raw.push({ color: str, d, tf: t2, even: false, stroke: L(st['stroke-width'], 1), join: '' });
    }
    if (Array.isArray(n[tag])) walk(n[tag], st, t2, depth + 1);
  });
  walk(tree, {}, '', 0);
  if (!raw.length) throw new Error('SVG içinde çizim bulunamadı (yazılar önce yola çevrilmeli)');
  if (raw.length > 5000) throw new Error('SVG çok karmaşık');

  // kaba ölçü -> eğri toleransı
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of raw) for (const c of flatten(r.d, r.tf, 1)) for (const [x, y] of c.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const span = Math.max(x1 - x0, y1 - y0) || 1, tol = span / 4000;
  const layers: { color: string; cs: CrossSection }[] = [];
  for (const r of raw) {
    const contours = flatten(r.d, r.tf, tol);
    let cs: CrossSection;
    if (!r.stroke) cs = CrossSection.ofPolygons(contours.filter(c => c.pts.length > 2).map(c => c.pts), r.even ? 'EvenOdd' : 'NonZero');
    else {
      const m = svgpath('M0 0L1 0M0 0L0 1').transform(r.tf).toString().match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number) ?? [];
      const sc = m.length >= 8 ? Math.sqrt(Math.abs((m[2] - m[0]) * (m[7] - m[5]) - (m[3] - m[1]) * (m[6] - m[4]))) : 1;
      const w = r.stroke * (sc || 1) / 2, polys: P2[][] = [];
      for (const c of contours) {
        const p = c.closed ? [...c.pts, c.pts[0]] : c.pts;
        p.forEach(([x, y], i) => {
          polys.push(Array.from({ length: 24 }, (_, k) => [x + w * Math.cos(k * Math.PI / 12), y + w * Math.sin(k * Math.PI / 12)] as P2));
          const q = p[i + 1]; if (!q) return;
          const len = Math.hypot(q[0] - x, q[1] - y); if (len < 1e-9) return;
          const nx = -(q[1] - y) / len * w, ny = (q[0] - x) / len * w;
          polys.push([[x - nx, y - ny], [q[0] - nx, q[1] - ny], [q[0] + nx, q[1] + ny], [x + nx, y + ny]]);
        });
      }
      cs = CrossSection.ofPolygons(polys, 'NonZero');
    }
    if (cs.isEmpty()) { cs.delete(); continue; }
    for (const l of layers) { const o = l.cs; l.cs = o.subtract(cs); o.delete(); }
    const same = layers.find(l => l.color === r.color);
    if (same) { const o = same.cs; same.cs = o.add(cs); o.delete(); cs.delete(); } else layers.push({ color: r.color, cs });
  }
  const live = layers.filter(l => !l.cs.isEmpty() || (l.cs.delete(), false));
  if (!live.length) throw new Error('SVG boş');
  x0 = y0 = Infinity; x1 = y1 = -Infinity;
  for (const l of live) { const b = l.cs.bounds(); x0 = Math.min(x0, b.min[0]); y0 = Math.min(y0, b.min[1]); x1 = Math.max(x1, b.max[0]); y1 = Math.max(y1, b.max[1]); }
  const k = width / (x1 - x0);
  return live.map(l => {
    const a = l.cs.translate([-(x0 + x1) / 2, -(y0 + y1) / 2]), b = a.scale([k, -k]), c = b.simplify(Math.max(1e-4, k * tol / 2));
    l.cs.delete(); a.delete(); b.delete(); return { color: l.color, cs: c };
  }).filter(l => !l.cs.isEmpty());
}
