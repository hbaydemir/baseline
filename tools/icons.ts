/** Şekil / parça menüsü ikonları: her şeklin varsayılan hâli perspektiften, saydam arka planlı PNG.
 *  npx tsx tools/icons.ts [tür] → src/app/shapeIcons/<tür>.png */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { apply, newDoc } from '../src/core/doc';
import { SHAPES } from '../src/core/shapes';
import { kernel, render } from './node';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/app/shapeIcons'), SIZE = 112, only = process.argv[2];
/** Bazı şekiller farklı açıdan daha iyi okunur: [yatay, dikey]. */
const VIEW: Record<string, [number, number]> = { text: [-20, 35], qr: [-25, 50], hexGrid: [-30, 50], spiral: [-30, 50], wedge: [55, 30] };
const kr = await kernel();
mkdirSync(OUT, { recursive: true });
for (const [t, s] of Object.entries(SHAPES)) {
  if (s.cat === 'hidden' || (only && t !== only)) continue;
  let r = apply(newDoc(), [{ op: 'add', type: t }], kr.bounds);
  if (s.hole) { // delikler tek başına görünmez: küçük bir bloğa oyulmuş hâli
    const id = r.created[0], b = kr.bounds(r.doc, id), m = 3, w = b.max[0] - b.min[0] + 2 * m * 2, d = b.max[1] - b.min[1] + 2 * m * 2, hh = Math.min(b.max[2] - b.min[2] + m, Math.max(w, d) * 0.45);
    r = apply(r.doc, [{ op: 'add', type: 'box', id: 'blok', color: '#7c8794', params: { w: Math.round(w), d: Math.round(d), h: Math.round(hh) }, pos: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, b.max[2] - hh - 0.3] }], kr.bounds);
    r = apply(r.doc, [{ op: 'group', ids: ['blok', id], mode: 'fused' }], kr.bounds);
  }
  const [az, el] = VIEW[t] ?? (s.hole ? [-35, 52] : [-35, 30]);
  writeFileSync(join(OUT, `${t}.png`), render(kr.build(r.doc), SIZE, SIZE, az, el, true));
  console.log(t);
}
