// STL / OBJ / 3MF okuma, onarma ve belgede saklama.
import { strFromU8, unzipSync, unzlibSync, zlibSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type { ManifoldToplevel, Vec2 } from 'manifold-3d';

/** tri: üçgen başına renk dizini (colors içinde); yoksa hepsi colors[0]. */
export interface MeshPart { colors: string[]; positions: Float32Array; indices: Uint32Array; tri?: Uint8Array }
export interface Report { triangles: number; welded: number; removed: number; flipped: number; filled: number; ok: boolean }
const GREY = '#b8c0c8', MAX_TRI = 3_000_000;

// --- belge içi saklama ---
export function packMesh(parts: MeshPart[]): string {
  const head = new TextEncoder().encode(JSON.stringify(parts.map(p => ({ colors: p.colors, nv: p.positions.length, nt: p.indices.length, tri: !!p.tri })))), size = parts.reduce((s, p) => s + p.positions.length * 4 + p.indices.length * 4 + (p.tri?.length ?? 0), 4 + head.length);
  const u = new Uint8Array(size); new DataView(u.buffer).setUint32(0, head.length, true); u.set(head, 4); let o = 4 + head.length;
  const put = (a: ArrayBufferView) => { u.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o); o += a.byteLength; };
  for (const p of parts) { put(p.positions); put(p.indices); if (p.tri) put(p.tri); }
  const z = zlibSync(u, { level: 6 }); let s = '';
  for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode(...z.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unpackMesh(s: string): MeshPart[] {
  const u = unzlibSync(Uint8Array.from(atob(s), c => c.charCodeAt(0))), hl = new DataView(u.buffer, u.byteOffset).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(u.subarray(4, 4 + hl))) as { colors: string[]; nv: number; nt: number; tri: boolean }[];
  let o = 4 + hl; const take = (n: number) => { const b = u.slice(o, o + n); o += n; return b; };
  return head.map(h => ({ colors: h.colors, positions: new Float32Array(take(h.nv * 4).buffer), indices: new Uint32Array(take(h.nt * 4).buffer), ...(h.tri ? { tri: take(h.nt / 3) } : {}) }));
}
/** İçerikten kısa kimlik (FNV-1a, iki tur). */
export function hashOf(s: string): string {
  let a = 0x811c9dc5, b = 0x1000193 ^ s.length;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x85ebca6b) ^ (b >>> 13); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

// --- okuma ---
export interface ReadResult { name: string; parts: MeshPart[]; offset?: number[] }
export function readModel(file: string, data: Uint8Array): ReadResult[] {
  const ext = file.split('.').pop()!.toLowerCase(), name = file.replace(/\.[^.]+$/, '');
  if (data.length > 300e6) throw new Error('Dosya çok büyük');
  const r = ext === 'stl' ? [{ name, parts: [readStl(data)] }] : ext === 'obj' ? [{ name, parts: readObj(new TextDecoder().decode(data)) }] : ext === '3mf' ? read3mf(data, name) : null;
  if (!r) throw new Error(`Desteklenmeyen dosya: .${ext}`);
  const n = r.reduce((s, x) => s + x.parts.reduce((q, p) => q + p.indices.length / 3, 0), 0);
  if (!n) throw new Error('Dosyada model bulunamadı');
  if (n > MAX_TRI) throw new Error(`Model çok ayrıntılı (${n} üçgen)`);
  for (const x of r) for (const p of x.parts) for (const i of p.indices) if (i >= p.positions.length / 3) throw new Error('Bozuk dosya: geçersiz köşe numarası');
  for (const x of r) for (const p of x.parts) for (const v of p.positions) if (!Number.isFinite(v)) throw new Error('Bozuk dosya: geçersiz koordinat');
  return r;
}
function readStl(u: Uint8Array): MeshPart {
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), n = u.length >= 84 ? dv.getUint32(80, true) : -1;
  if (n > 0 && u.length >= 84 + n * 50 && n <= MAX_TRI) {
    const positions = new Float32Array(n * 9); for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) positions[t * 9 + k] = dv.getFloat32(84 + t * 50 + 12 + k * 4, true);
    return { colors: [GREY], positions, indices: Uint32Array.from({ length: n * 3 }, (_, i) => i) };
  }
  const v: number[] = []; for (const m of new TextDecoder().decode(u).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) v.push(+m[1], +m[2], +m[3]);
  return { colors: [GREY], positions: new Float32Array(v), indices: Uint32Array.from({ length: Math.floor(v.length / 9) * 3 }, (_, i) => i) };
}
function readObj(text: string): MeshPart[] {
  const pos: number[] = [], groups = new Map<string, number[]>(); let cur = GREY; const colorOf = new Map<string, string>();
  const PAL = [GREY, '#e5484d', '#4f8cff', '#30a46c', '#f5a524', '#9b5de5', '#222222', '#ffffff'];
  for (const line of text.split('\n')) {
    const a = line.trim().split(/\s+/);
    if (a[0] === 'v') { pos.push(+a[1], +a[2], +a[3]); }
    else if (a[0] === 'usemtl') { const k = a.slice(1).join(' '), hex = k.match(/([0-9a-f]{6})$/i); if (!colorOf.has(k)) colorOf.set(k, hex ? '#' + hex[1].toLowerCase() : PAL[colorOf.size % PAL.length]); cur = colorOf.get(k)!; }
    else if (a[0] === 'f') { const ix = a.slice(1).map(s => { const i = parseInt(s); return i < 0 ? pos.length / 3 + i : i - 1; }), g = groups.get(cur) ?? groups.set(cur, []).get(cur)!; for (let k = 2; k < ix.length; k++) g.push(ix[0], ix[k - 1], ix[k]); }
  }
  // tek gövde + üçgen rengi: renk sınırında gövde bölünmez
  const colors = [...groups.keys()], indices: number[] = [], tri: number[] = [];
  colors.forEach((c, i) => { const g = groups.get(c)!; for (let k = 0; k < g.length; k++) indices.push(g[k]); for (let k = 0; k < g.length / 3; k++) tri.push(i); });
  return [{ colors: colors.length ? colors : [GREY], positions: new Float32Array(pos), indices: new Uint32Array(indices), ...(colors.length > 1 ? { tri: Uint8Array.from(tri) } : {}) }];
}
type Mat = number[]; // 12 sayı (3MF satır düzeni)
const ID: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const parseMat = (s?: string): Mat => { const m = (s ?? '').trim().split(/\s+/).map(Number); return m.length === 12 && m.every(Number.isFinite) ? m : ID; };
const mulMat = (a: Mat, b: Mat): Mat => { const r: Mat = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j] + (i === 3 ? b[9 + j] : 0)); return r; };
/** Bambu paint_color: bölünmemiş üçgende tek renk kodu; bölünmüşse ilk görülen renk. */
export function paintState(code: string): number {
  const c = code.toUpperCase().split('').reverse().map(x => parseInt(x, 16)); let i = 0;
  const node = (): number => { const v = c[i++]; if (v === undefined) return 0; const split = v & 3; if (!split) { const s = v >> 2; return s < 3 ? s : 3 + (c[i++] ?? 0); } let best = 0; for (let k = 0; k <= split; k++) { const s = node(); if (!best) best = s; } return best; };
  return node();
}
export const paintCode = (state: number) => state <= 0 ? '' : state < 3 ? (state << 2).toString(16).toUpperCase() : (state - 3).toString(16).toUpperCase() + 'C';

function read3mf(data: Uint8Array, fallback: string): ReadResult[] {
  const z = unzipSync(data, { filter: f => /\.(model|config)$/i.test(f.name) && f.originalSize < 800e6 }), P = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, processEntities: true, isArray: n => ['object', 'item', 'component', 'vertex', 'triangle', 'base', 'color', 'basematerials', 'colorgroup', 'part', 'metadata'].includes(n.replace(/^\w+:/, '')), removeNSPrefix: true });
  const norm = (s: string) => s.replace(/^\//, ''), models = new Map<string, any>();
  for (const k of Object.keys(z)) if (/\.model$/i.test(k)) models.set(norm(k), P.parse(strFromU8(z[k])).model);
  const rootName = models.has('3D/3dmodel.model') ? '3D/3dmodel.model' : [...models.keys()].find(k => models.get(k)?.build?.item) ?? [...models.keys()][0], root = models.get(rootName);
  if (!root) throw new Error('3MF içinde model yok');
  const unit = ({ micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 } as Record<string, number>)[root.unit] ?? 1;
  // Bambu/Orca: parça -> ekstruder, ekstruder -> renk
  let filament: string[] = []; const ext = new Map<string, number>(), names = new Map<string, string>();
  try { const pr = z['Metadata/project_settings.config']; if (pr) filament = (JSON.parse(strFromU8(pr)).filament_colour as string[]).map(c => c.slice(0, 7).toLowerCase()); } catch { /* ayar dosyası yok sayılır */ }
  try {
    const cf = z['Metadata/model_settings.config'] && P.parse(strFromU8(z['Metadata/model_settings.config'])).config;
    const meta = (o: any, k: string) => o?.metadata?.find?.((m: any) => m.key === k)?.value;
    for (const o of cf?.object ?? []) { if (meta(o, 'extruder')) ext.set(String(o.id), +meta(o, 'extruder')); if (meta(o, 'name')) names.set(String(o.id), meta(o, 'name')); for (const p of o.part ?? []) ext.set(`${o.id}/${p.id}`, +(meta(p, 'extruder') ?? meta(o, 'extruder') ?? 1)); }
  } catch { /* yok sayılır */ }
  const hex = (c?: string) => /^#[0-9a-f]{6}/i.test(c ?? '') ? c!.slice(0, 7).toLowerCase() : null;
  const palettes = new Map<string, Map<string, string[]>>();
  for (const [k, m] of models) { const mp = new Map<string, string[]>(); for (const b of m?.resources?.basematerials ?? []) mp.set(b.id, (b.base ?? []).map((x: any) => hex(x.displaycolor) ?? GREY)); for (const b of m?.resources?.colorgroup ?? []) mp.set(b.id, (b.color ?? []).map((x: any) => hex(x.color) ?? GREY)); palettes.set(k, mp); }
  const collect = (file: string, id: string, mat: Mat, top: string, out: MeshPart[], depth: number) => {
    const m = models.get(file), o = m?.resources?.object?.find((x: any) => x.id === id); if (!o || depth > 12) return;
    if (o.type && !['model', 'solidsupport'].includes(o.type)) return;
    for (const c of o.components?.component ?? []) collect(c.path ? norm(c.path) : file, c.objectid, mulMat(parseMat(c.transform), mat), top, out, depth + 1);
    const vs = o.mesh?.vertices?.vertex as any[] | undefined, ts = o.mesh?.triangles?.triangle as any[] | undefined;
    if (!vs || !ts) return;
    const positions = new Float32Array(vs.length * 3), indices = new Uint32Array(ts.length * 3), pal = palettes.get(file)!, colors: string[] = [], cix = (c: string) => { let i = colors.indexOf(c); if (i < 0) { i = Math.min(254, colors.length); colors[i] = c; } return i; };
    vs.forEach((v, i) => { const [x, y, q] = [+v.x, +v.y, +v.z]; for (let k = 0; k < 3; k++) positions[i * 3 + k] = (x * mat[k] + y * mat[3 + k] + q * mat[6 + k] + mat[9 + k]) * unit; });
    const e = ext.get(`${top}/${id}`) ?? ext.get(top), base = (e && filament[e - 1]) || pal.get(o.pid)?.[+(o.pindex ?? 0)] || GREY;
    cix(base);
    const tri = new Uint8Array(ts.length);
    const det = mat[0] * (mat[4] * mat[8] - mat[5] * mat[7]) - mat[1] * (mat[3] * mat[8] - mat[5] * mat[6]) + mat[2] * (mat[3] * mat[7] - mat[4] * mat[6]);
    ts.forEach((t, i) => {
      indices.set(det < 0 ? [+t.v1, +t.v3, +t.v2] : [+t.v1, +t.v2, +t.v3], i * 3);
      const st = t.paint_color ? paintState(t.paint_color) : 0;
      if (st && filament[st - 1]) tri[i] = cix(filament[st - 1]);
      else if (t.pid !== undefined || t.p1 !== undefined) { const c = pal.get(t.pid ?? o.pid)?.[+(t.p1 ?? 0)]; if (c) tri[i] = cix(c); }
    });
    out.push({ colors, positions, indices, ...(colors.length > 1 ? { tri } : {}) });
  };
  const res: ReadResult[] = [];
  for (const it of root.build?.item ?? []) { const parts: MeshPart[] = []; collect(it.path ? norm(it.path) : rootName, it.objectid, parseMat(it.transform), it.objectid, parts, 0); if (parts.length) { const o = root.resources?.object?.find((x: any) => x.id === it.objectid); res.push({ name: names.get(it.objectid) || o?.name || fallback, parts }); } }
  return res;
}

// --- onarma ---
/** Köşe birleştir, bozuk üçgen at, yönleri düzelt, delikleri kapat. */
export function repair(wasm: ManifoldToplevel, p: MeshPart): { part: MeshPart; report: Report } {
  const rep: Report = { triangles: 0, welded: 0, removed: 0, flipped: 0, filled: 0, ok: false };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], p.positions[i]); hi[k] = Math.max(hi[k], p.positions[i]); }
  const eps = Math.max(1e-5, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) * 1e-6), key = new Map<string, number>(), pos: number[] = [], map = new Uint32Array(p.positions.length / 3);
  for (let i = 0; i < map.length; i++) { const q = [0, 1, 2].map(k => p.positions[i * 3 + k]), s = q.map(x => Math.round(x / eps)).join(','); let j = key.get(s); if (j === undefined) { j = pos.length / 3; key.set(s, j); pos.push(...q); } else rep.welded++; map[i] = j; }
  let tri: [number, number, number, number][] = []; const seen = new Map<string, number>();
  for (let t = 0; t < p.indices.length; t += 3) {
    const a = map[p.indices[t]], b = map[p.indices[t + 1]], c = map[p.indices[t + 2]];
    if (a === b || b === c || a === c) { rep.removed++; continue; }
    const s = [a, b, c].sort((x, y) => x - y).join(','); if (seen.has(s)) { rep.removed++; continue; }
    seen.set(s, tri.length); tri.push([a, b, c, p.tri ? p.tri[t / 3] : 0]);
  }
  const N = pos.length / 3 + 1_000_000, ek = (a: number, b: number) => a < b ? a * N + b : b * N + a;
  const adjacency = () => { const m = new Map<number, number[]>(); tri.forEach((t, i) => { for (let q = 0; q < 3; q++) { const k = ek(t[q], t[(q + 1) % 3]), l = m.get(k); if (l) l.push(i); else m.set(k, [i]); } }); return m; };
  const has = (t: number[], a: number, b: number) => (t[0] === a && t[1] === b) || (t[1] === a && t[2] === b) || (t[2] === a && t[0] === b);
  for (let round = 0; round < 4; round++) {
    // yön: yalnız iki yüzlü kenarlardan yayıl
    const adj = adjacency(), done = new Uint8Array(tri.length);
    for (let s = 0; s < tri.length; s++) if (!done[s]) {
      const q = [s]; done[s] = 1; let flips = 0;
      for (let h = 0; h < q.length; h++) { const t = tri[q[h]]; for (let e = 0; e < 3; e++) { const a = t[e], b = t[(e + 1) % 3], l = adj.get(ek(a, b))!; if (l.length !== 2) continue; const o = l[0] === q[h] ? l[1] : l[0]; if (done[o]) continue; if (has(tri[o], a, b)) { const u = tri[o]; tri[o] = [u[0], u[2], u[1], u[3]]; flips++; } done[o] = 1; q.push(o); } }
      rep.flipped += Math.min(flips, q.length - flips);
      if (flips > q.length / 2) for (const i of q) { const u = tri[i]; tri[i] = [u[0], u[2], u[1], u[3]]; }
    }
    const P = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const vol = (ix: number[]) => ix.reduce((s, i) => { const [a, b, c] = tri[i].slice(0, 3).map(P); return s + a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }, 0);
    if (vol(tri.map((_, i) => i)) < 0) { tri = tri.map(u => [u[0], u[2], u[1], u[3]]); rep.flipped = tri.length; }
    // fazla yüzlü, eşleşmeyen kenarlar: sorunlu üçgeni at, deliği kapat
    const dir = new Map<string, number>();
    const bad = new Set<number>();
    for (const [k, l] of adjacency()) if (l.length > 2) { const x = Math.floor(k / N), y = k % N, f = l.filter(i => has(tri[i], x, y)).length; if (f * 2 !== l.length) bad.add(l[l.length - 1]); }
    if (bad.size) { tri = tri.filter((_, i) => !bad.has(i)); rep.removed += bad.size; }
    // açık kenarlardan döngü
    const open = new Map<number, number[]>();
    for (const t of tri) for (let q = 0; q < 3; q++) { const k = `${t[q]},${t[(q + 1) % 3]}`; dir.set(k, (dir.get(k) ?? 0) + 1); }
    for (const [k, n] of dir) { const [a, b] = k.split(',').map(Number), m = n - (dir.get(`${b},${a}`) ?? 0); for (let i = 0; i < m; i++) { const l = open.get(b); if (l) l.push(a); else open.set(b, [a]); } } // ters yönde yürü
    if (!open.size) break;
    const loops: number[][] = [];
    for (const s of [...open.keys()]) while (open.get(s)?.length) {
      const path = [s], where = new Map([[s, 0]]); let cur = s;
      for (;;) {
        const nx = open.get(cur)?.pop(); if (nx === undefined) break;
        const w = where.get(nx);
        if (w !== undefined) { const lp = path.splice(w); for (const v of lp) where.delete(v); loops.push(lp); path.push(nx); where.set(nx, path.length - 1); if (path.length === 1 && !open.get(nx)?.length) break; cur = nx; continue; }
        where.set(nx, path.length); path.push(nx); cur = nx;
      }
    }
    for (const lp of loops) if (lp.length >= 3) {
      const col = 0;
      // Newell normali
      const nn = [0, 0, 0]; lp.forEach((v, i) => { const a = P(v), b = P(lp[(i + 1) % lp.length]); nn[0] += (a[1] - b[1]) * (a[2] + b[2]); nn[1] += (a[2] - b[2]) * (a[0] + b[0]); nn[2] += (a[0] - b[0]) * (a[1] + b[1]); });
      const l = Math.hypot(...nn) || 1, n = nn.map(x => x / l), u0 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], cr = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], ux = cr(u0, n), ul = Math.hypot(...ux), X = ux.map(x => x / ul), Y = cr(n, X), d = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      let add: number[][] = [];
      if (lp.length === 3) add = [[0, 1, 2]];
      else try { add = wasm.triangulate([lp.map(v => [d(P(v), X), d(P(v), Y)] as Vec2)] as any) as unknown as number[][]; if (add.length !== lp.length - 2) add = []; } catch { add = []; }
      if (add.length) for (const t of add) tri.push([lp[t[0]], lp[t[1]], lp[t[2]], col]);
      else { const m = lp.reduce((s, v) => s.map((x, k) => x + P(v)[k] / lp.length), [0, 0, 0]), id = pos.length / 3; pos.push(...m); lp.forEach((v, i) => tri.push([v, lp[(i + 1) % lp.length], id, col])); }
      rep.filled++;
    }
  }
  rep.triangles = tri.length;
  // kullanılmayan köşeleri at
  const use = new Int32Array(pos.length / 3).fill(-1), P2: number[] = [], ix = new Uint32Array(tri.length * 3);
  tri.forEach((t, i) => { for (let q = 0; q < 3; q++) { let j = use[t[q]]; if (j < 0) { j = use[t[q]] = P2.length / 3; P2.push(pos[t[q] * 3], pos[t[q] * 3 + 1], pos[t[q] * 3 + 2]); } ix[i * 3 + q] = j; } });
  const part: MeshPart = { colors: p.colors, positions: new Float32Array(P2), indices: ix, ...(p.tri ? { tri: Uint8Array.from(tri, t => t[3]) } : {}) };
  try { const m = new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: part.positions, triVerts: part.indices })); rep.ok = !m.isEmpty() && m.volume() > 0; m.delete(); } catch { rep.ok = false; }
  return { part, report: rep };
}

/** Okunan modelleri onarır, ortalayıp tablaya oturtur; belge komutları döndürür. */
export function importModel(wasm: ManifoldToplevel, file: string, data: Uint8Array): { cmds: { assets: { id: string; data: string }[]; nodes: { name: string; asset: string; pos: [number, number, number] }[] }; note: string } {
  const read = readModel(file, data), assets: { id: string; data: string }[] = [], nodes: { name: string; asset: string; pos: [number, number, number] }[] = [];
  const all = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }, tot = { welded: 0, removed: 0, flipped: 0, filled: 0 }; let bad = 0;
  const objs = read.map(o => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const parts = o.parts.filter(p => p.indices.length).map(p => { const { part, report } = repair(wasm, p); for (const k of ['removed', 'flipped', 'filled'] as const) tot[k] += report[k]; if (!report.ok) bad++; return part; });
    for (const p of parts) for (let i = 0; i < p.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], p.positions[i]); hi[k] = Math.max(hi[k], p.positions[i]); }
    for (let k = 0; k < 3; k++) { all.lo[k] = Math.min(all.lo[k], lo[k]); all.hi[k] = Math.max(all.hi[k], hi[k]); }
    return { name: o.name, parts, lo, hi };
  });
  const c = [(all.lo[0] + all.hi[0]) / 2, (all.lo[1] + all.hi[1]) / 2, all.lo[2]];
  for (const o of objs) {
    const m = [(o.lo[0] + o.hi[0]) / 2, (o.lo[1] + o.hi[1]) / 2, o.lo[2]];
    for (const p of o.parts) for (let i = 0; i < p.positions.length; i++) p.positions[i] -= m[i % 3];
    const d = packMesh(o.parts), id = hashOf(d); if (!assets.some(a => a.id === id)) assets.push({ id, data: d });
    nodes.push({ name: o.name, asset: id, pos: m.map((x, k) => Math.round((x - c[k]) * 1e4) / 1e4) as [number, number, number] });
  }
  const fixes = [tot.filled && `${tot.filled} delik kapatıldı`, tot.flipped && `${tot.flipped} üçgen çevrildi`, tot.removed && `${tot.removed} bozuk üçgen atıldı`, bad && `${bad} parça tam onarılamadı`].filter(Boolean);
  return { cmds: { assets, nodes }, note: fixes.length ? fixes.join(', ') : 'sorun bulunmadı' };
}
