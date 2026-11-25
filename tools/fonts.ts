// Komut satırı ve MCP için sistem fontları: yalnız ad tablosu okunur (uygulamadaki Rust okuyucuyla aynı mantık).
import { closeSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';

export interface FontInfo { family: string; style: string; path: string }
const dirs = () => [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), ...(process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts')] : [])];
function names(path: string): [string, string] | null {
  let fd = -1;
  try {
    fd = openSync(path, 'r');
    const read = (pos: number, len: number) => { const b = Buffer.alloc(len); readSync(fd, b, 0, len, pos); return b; };
    const head = read(0, 12), n = head.readUInt16BE(4); if (!n || n > 200) return null;
    const dir = read(12, n * 16); let off = -1, len = 0;
    for (let i = 0; i < n; i++) if (dir.toString('latin1', i * 16, i * 16 + 4) === 'name') { off = dir.readUInt32BE(i * 16 + 8); len = dir.readUInt32BE(i * 16 + 12); }
    if (off < 0 || len > 4e6) return null;
    const t = read(off, len), count = t.readUInt16BE(2), store = t.readUInt16BE(4);
    const get = (want: number) => {
      let best: [number, string] | null = null;
      for (let i = 0; i < count; i++) {
        const r = 6 + i * 12, pl = t.readUInt16BE(r), lang = t.readUInt16BE(r + 4), id = t.readUInt16BE(r + 6), l = t.readUInt16BE(r + 8), o = t.readUInt16BE(r + 10);
        if (id !== want || store + o + l > t.length) continue;
        const b = t.subarray(store + o, store + o + l);
        const cand: [number, string] | null = pl === 3 ? [lang === 0x409 ? 3 : 2, l % 2 ? '' : Buffer.from(b).swap16().toString('utf16le')] : pl === 1 ? [1, b.toString('latin1')] : null;
        if (cand && cand[1].trim() && (!best || cand[0] > best[0])) best = cand;
      }
      return best?.[1];
    };
    const fam = get(16) ?? get(1); return fam ? [fam, get(17) ?? get(2) ?? 'Regular'] : null;
  } catch { return null; } finally { if (fd >= 0) closeSync(fd); }
}
let cache: FontInfo[] | null = null;
export function fontList(): FontInfo[] {
  if (cache) return cache;
  const out: FontInfo[] = [];
  for (const d of dirs()) { let fs: string[] = []; try { fs = readdirSync(d); } catch { continue; } for (const f of fs) if (/\.(ttf|otf)$/i.test(f)) { const p = join(d, f), nm = names(p); if (nm) out.push({ family: nm[0], style: nm[1], path: p }); } }
  return cache = out;
}
/** "Aile|Stil" anahtarından font dosyası; yoksa null. */
export function loadFont(key: string): ArrayBuffer | null {
  const [family, style] = key.split('|'), f = fontList().find(x => x.family === family && x.style === (style || 'Regular')) ?? fontList().find(x => x.family === family);
  if (!f) return null;
  const b = readFileSync(f.path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}
