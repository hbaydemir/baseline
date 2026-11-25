import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Kernel, world, builtBounds, triColor, partColors, type Built } from '../src/core/kernel';
import { apply, newDoc, parseDoc, serialize, type Command, type Doc } from '../src/core/doc';
import { importModel } from '../src/core/mesh';
import type { ReadProfile } from '../src/core/bambu';
import { exportAll, PRINTERS } from '../src/core/export';

const here = dirname(fileURLToPath(import.meta.url));
function asset(bundled: string, pkg: string) {
  const p = join(here, bundled); // paketlenmiş sürümde dosyalar yan yana durur
  return readFileSync(existsSync(p) ? p : createRequire(import.meta.url).resolve(pkg));
}
let k: Promise<Kernel> | null = null;
export const kernel = () => k ??= (() => {
  const font = asset('font.ttf', '@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf');
  return Kernel.create({ wasmBinary: asset('manifold.wasm', 'manifold-3d/manifold.wasm'), font: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer });
})();

const activeFile = join(homedir(), '.baseline', 'active.json');
/** Dosya verilmezse uygulamada açık olan belge kullanılır. */
export function docPath(file?: string): string {
  if (file) { const p = resolve(file); if (extname(p) !== '.baseline') throw new Error('Dosya uzantısı .baseline olmalı'); return p; }
  try { const p = JSON.parse(readFileSync(activeFile, 'utf8')).path; if (typeof p === 'string') return p; } catch { /* yok */ }
  throw new Error('Açık belge yok: bir .baseline dosya yolu ver ya da uygulamada bir belge kaydet');
}
export const load = (p: string): Doc => existsSync(p) ? parseDoc(readFileSync(p, 'utf8')) : newDoc();
export function save(p: string, d: Doc) {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp`; writeFileSync(tmp, serialize(d)); renameSync(tmp, p); // yarım dosya okunmasın
}
export async function applyFile(p: string, cmds: Command[]) {
  const kr = await kernel(), r = apply(load(p), cmds, kr.bounds);
  save(p, r.doc);
  return { created: r.created, ...summary(kr.build(r.doc)) };
}
/** STL/OBJ/3MF/SVG dosyasını belgeye ekler. */
export async function importFile(p: string, src: string) {
  const kr = await kernel(), name = basename(src);
  if (/\.svg$/i.test(name)) return applyFile(p, [{ op: 'add', type: 'svg', name: name.replace(/\.svg$/i, ''), params: { svg: readFileSync(src, 'utf8') } }]);
  const r = importModel(kr.wasm, name, readFileSync(src));
  const res = await applyFile(p, [...r.cmds.assets.map(a => ({ op: 'asset', ...a }) as Command), ...r.cmds.nodes.map(n => ({ op: 'add', type: 'mesh', name: n.name, pos: n.pos, params: { asset: n.asset } }) as Command)]);
  return { repair: r.note, ...res };
}
export function summary(built: Built[]) {
  return { objects: built.map(b => ({ id: b.id, name: b.name, ...(b.error ? { error: b.error } : { ...(() => { const x = builtBounds(b), r = (v: number[]) => v.map(n => +n.toFixed(3)); return { min: r(x.min), max: r(x.max) }; })(), volume_mm3: Math.round(b.volume * Math.abs(b.scale[0] * b.scale[1] * b.scale[2])), colors: [...new Set(b.parts.flatMap(partColors))], triangles: b.parts.reduce((s, q) => s + q.indices.length / 3, 0) }) })) };
}
export const PROFILES = join(process.env.BAMBU_STUDIO ?? 'C:\\Program Files\\Bambu Studio', 'resources', 'profiles', 'BBL');
const readProfile: ReadProfile = async (kind, name) => {
  try { return readFileSync(join(PROFILES, kind, basename(name) + '.json'), 'utf8'); }
  catch { throw new Error(`Bambu Studio profili bulunamadı: ${name}`); }
};
export async function exportFile(p: string, out: string, printerId?: string): Promise<string[]> {
  const fmt = extname(out).slice(1).toLowerCase(), name = basename(out, extname(out)), pr = printerId ? PRINTERS.find(x => x.id === printerId) : PRINTERS[0];
  if (!pr) throw new Error(`Yazıcı: ${PRINTERS.map(x => x.id).join(' | ')}`);
  if (!existsSync(p)) throw new Error(`Belge yok: ${p}`);
  const files = await exportAll((await kernel()).build(load(p)), fmt, name, pr, readProfile), dir = dirname(resolve(out));
  mkdirSync(dir, { recursive: true });
  return files.map(f => { const q = join(dir, f.name); writeFileSync(q, f.data); return q; });
}

/** Yapay zekânın sonucu görmesi için küçük yazılım çizici (z-tampon, 2x kenar yumuşatma). */
export function render(built: Built[], W = 800, H = 600, az = -35, el = 35): Buffer {
  const S = 2, w = W * S, h = H * S, buf = new Float32Array(w * h).fill(-Infinity), rgb = new Float32Array(w * h * 3);
  for (let i = 0; i < w * h; i++) rgb.set([242, 243, 245], i * 3);
  const a = az * Math.PI / 180, e = el * Math.PI / 180, R = [Math.cos(a), Math.sin(a), 0], D = [-Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)], U = [-Math.sin(a) * Math.sin(e), Math.cos(a) * Math.sin(e), Math.cos(e)];
  const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const parts = built.flatMap(b => world(b)).filter(p => !p.hole), pr = parts.map(p => { const o: number[][] = []; for (let i = 0; i < p.positions.length; i += 3) { const v = [p.positions[i], p.positions[i + 1], p.positions[i + 2]]; o.push([dot(v, R), dot(v, U), -dot(v, D)]); } return o; });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const o of pr) for (const [x, y] of o) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = Math.min(w / (x1 - x0 || 1), h / (y1 - y0 || 1)) * 0.86, X = (x: number) => (x - (x0 + x1) / 2) * s + w / 2, Y = (y: number) => h / 2 - (y - (y0 + y1) / 2) * s;
  const light = (() => { const l = [R[0] * -0.45 + U[0] * 0.6 - D[0] * 0.66, R[1] * -0.45 + U[1] * 0.6 - D[1] * 0.66, R[2] * -0.45 + U[2] * 0.6 - D[2] * 0.66], n = Math.hypot(...l); return l.map(v => v / n); })();
  parts.forEach((p, pi) => {
    const rgbOf = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), o = pr[pi], P = p.positions;
    for (let t = 0; t < p.indices.length; t += 3) {
      const col = rgbOf(triColor(p, t / 3)), [i, j, k] = p.indices.subarray(t, t + 3), A = o[i], B = o[j], C = o[k];
      const u = [0, 1, 2].map(q => P[j * 3 + q] - P[i * 3 + q]), v = [0, 1, 2].map(q => P[k * 3 + q] - P[i * 3 + q]), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
      if (dot(n, D) >= 0) continue;
      const sh = 0.38 + 0.62 * Math.max(0, dot(n, light) / l), ax = X(A[0]), ay = Y(A[1]), bx = X(B[0]), by = Y(B[1]), cx = X(C[0]), cy = Y(C[1]), ar = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (!ar) continue;
      for (let y = Math.max(0, Math.ceil(Math.min(ay, by, cy))); y <= Math.min(h - 1, Math.max(ay, by, cy)); y++) for (let x = Math.max(0, Math.ceil(Math.min(ax, bx, cx))); x <= Math.min(w - 1, Math.max(ax, bx, cx)); x++) {
        const g = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / ar, m = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / ar;
        if (g < 0 || m < 0 || g + m > 1) continue;
        const z = A[2] + (B[2] - A[2]) * g + (C[2] - A[2]) * m, q = y * w + x;
        if (z > buf[q]) { buf[q] = z; for (let c = 0; c < 3; c++) rgb[q * 3 + c] = col[c] * sh; }
      }
    }
  });
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) { let v = 0; for (let q = 0; q < S * S; q++) v += rgb[((y * S + (q >> 1)) * w + x * S + (q & 1)) * 3 + c]; raw[y * (W * 3 + 1) + 1 + x * 3 + c] = Math.min(255, v / (S * S)); }
  const chunk = (t: string, d: Buffer) => { const b = Buffer.concat([Buffer.from(t), d]), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(d.length); c.writeUInt32BE(crc32(b)); return Buffer.concat([l, b, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih.set([8, 2], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
