import { strToU8, zipSync } from 'fflate';
import { bambuProject, type ReadProfile } from './bambu';
import { partColors, triColor, world, type Built, type Part } from './kernel';
import { paintCode } from './mesh';

export interface OutFile { name: string; data: Uint8Array }
export interface Printer { id: string; label: string; bed: [number, number]; machine?: string }
export const PRINTERS: Printer[] = [
  { id: 'generic', label: 'Genel 3MF (ayarsız)', bed: [220, 220] },
  { id: 'a1', label: 'Bambu Lab A1', bed: [256, 256], machine: 'Bambu Lab A1 0.4 nozzle' },
  { id: 'a1mini', label: 'Bambu Lab A1 mini', bed: [180, 180], machine: 'Bambu Lab A1 mini 0.4 nozzle' },
  { id: 'p1s', label: 'Bambu Lab P1S', bed: [256, 256], machine: 'Bambu Lab P1S 0.4 nozzle' },
];
const xml = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`).replace(/[\u0000-\u001f]/g, ' ');
const f = (x: number) => String(Math.round(x * 1e5) / 1e5 + 0);

/** Delik olmayan, hatasız nesneler. Hata varsa dışa aktarma durur: eksik parça sessizce verilmez. */
export function solids(built: Built[]): { b: Built; parts: Part[] }[] {
  const bad = built.filter(b => b.error);
  if (bad.length) throw new Error(`Hatalı nesne: ${bad.map(b => `${b.name} (${b.error})`).join(', ')}`);
  const out = built.map(b => ({ b, parts: world(b).filter(p => !p.hole) })).filter(x => x.parts.length);
  if (!out.length) throw new Error('Dışa aktarılacak katı nesne yok');
  return out;
}

export async function to3mf(built: Built[], printer = PRINTERS[0], read?: ReadProfile): Promise<Uint8Array> {
  const objs = solids(built), colors = [...new Set(objs.flatMap(o => o.parts.flatMap(partColors)))];
  if (printer.machine && !read) throw new Error('Yazıcı profili için Bambu Studio kurulu olmalı');
  const project = printer.machine ? await bambuProject(read!, printer.machine, colors) : null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity];
  for (const o of objs) for (const p of o.parts) for (let i = 0; i < p.positions.length; i++) { const k = i % 3; min[k] = Math.min(min[k], p.positions[i]); if (k < 2) max[k] = Math.max(max[k], p.positions[i]); }
  const T = [printer.bed[0] / 2 - (min[0] + max[0]) / 2, printer.bed[1] / 2 - (min[1] + max[1]) / 2, -min[2]];
  let id = 2, res = '', items = '', cfg = '';
  for (const { b, parts } of objs) {
    const ids: number[] = [];
    for (const p of parts) {
      const me = id++, c = colors.indexOf(p.color); ids.push(me);
      const v: string[] = [], t: string[] = [];
      for (let i = 0; i < p.positions.length; i += 3) v.push(`<vertex x="${f(p.positions[i])}" y="${f(p.positions[i + 1])}" z="${f(p.positions[i + 2])}"/>`);
      for (let i = 0; i < p.indices.length; i += 3) { const k = p.paint?.ix[i / 3] ? colors.indexOf(triColor(p, i / 3)) : -1; t.push(`<triangle v1="${p.indices[i]}" v2="${p.indices[i + 1]}" v3="${p.indices[i + 2]}"${k >= 0 ? ` pid="1" p1="${k}" p2="${k}" p3="${k}" paint_color="${paintCode(k + 1)}"` : ''}/>`); }
      res += `<object id="${me}" type="model" pid="1" pindex="${c}" name="${xml(b.name)}"><mesh><vertices>${v.join('')}</vertices><triangles>${t.join('')}</triangles></mesh></object>\n`;
    }
    const parent = id++;
    res += `<object id="${parent}" type="model" name="${xml(b.name)}"><components>${ids.map(i => `<component objectid="${i}"/>`).join('')}</components></object>\n`;
    items += `<item objectid="${parent}" transform="1 0 0 0 1 0 0 0 1 ${T.map(f).join(' ')}" printable="1"/>`;
    cfg += `<object id="${parent}"><metadata key="name" value="${xml(b.name)}"/><metadata key="extruder" value="${colors.indexOf(parts[0].color) + 1}"/>\n` +
      parts.map((p, i) => `<part id="${ids[i]}" subtype="normal_part"><metadata key="name" value="${xml(b.name)} ${p.color}"/><metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/><metadata key="extruder" value="${colors.indexOf(p.color) + 1}"/></part>\n`).join('') + '</object>\n';
  }
  const head = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const model = head + `<model unit="millimeter" xml:lang="tr" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
<metadata name="Application">${project ? 'BambuStudio-02.00.00.00' : 'Baseline'}</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Description">Baseline</metadata>
<resources><basematerials id="1">${colors.map(c => `<base name="${c}" displaycolor="${c.toUpperCase()}FF"/>`).join('')}</basematerials>
${res}</resources><build>${items}</build></model>`;
  const enc = (s: string) => strToU8(s);
  return zipSync({
    '[Content_Types].xml': enc(head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': enc(head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': enc(model),
    'Metadata/model_settings.config': enc(head + `<config>\n${cfg}</config>`),
    ...(project ? { 'Metadata/project_settings.config': enc(JSON.stringify(project)) } : {}),
  }, { level: 6 });
}

export function stl(parts: Part[]): Uint8Array {
  const n = parts.reduce((s, p) => s + p.indices.length / 3, 0), u = new Uint8Array(84 + n * 50), dv = new DataView(u.buffer);
  dv.setUint32(80, n, true); let o = 84;
  for (const p of parts) for (let i = 0; i < p.indices.length; i += 3) {
    const v = [0, 1, 2].map(k => p.positions.subarray(p.indices[i + k] * 3, p.indices[i + k] * 3 + 3)), a = [0, 1, 2].map(k => v[1][k] - v[0][k]), b = [0, 1, 2].map(k => v[2][k] - v[0][k]);
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...c) || 1;
    for (const x of c) { dv.setFloat32(o, x / l, true); o += 4; }
    for (const q of v) for (const x of q) { dv.setFloat32(o, x, true); o += 4; }
    o += 2;
  }
  return u;
}
/** STL renk taşımaz: tek renkte bir dosya, çok renkte renk başına hizalı dosyalar. */
export function toStl(built: Built[], name: string): OutFile[] {
  const parts = solids(built).flatMap(o => o.parts), colors = [...new Set(parts.map(p => p.color))];
  if (colors.length === 1) return [{ name: `${name}.stl`, data: stl(parts) }];
  return colors.map(c => ({ name: `${name}_${c.slice(1)}.stl`, data: stl(parts.filter(p => p.color === c)) }));
}
export function toObj(built: Built[], name: string): OutFile[] {
  const out = [`mtllib ${name.replace(/\s/g, '_')}.mtl`], colors = new Set<string>(); let base = 1;
  for (const { b, parts } of solids(built)) parts.forEach((p, i) => {
    partColors(p).forEach(c => colors.add(c)); out.push(`o ${b.id}_${i}`); let cur = '';
    for (let k = 0; k < p.positions.length; k += 3) out.push(`v ${f(p.positions[k])} ${f(p.positions[k + 1])} ${f(p.positions[k + 2])}`);
    for (let k = 0; k < p.indices.length; k += 3) { const c = triColor(p, k / 3); if (c !== cur) { cur = c; out.push(`usemtl c${c.slice(1)}`); } out.push(`f ${p.indices[k] + base} ${p.indices[k + 1] + base} ${p.indices[k + 2] + base}`); }
    base += p.positions.length / 3;
  });
  const mtl = [...colors].map(c => `newmtl c${c.slice(1)}\nKd ${[1, 3, 5].map(i => (parseInt(c.slice(i, i + 2), 16) / 255).toFixed(4)).join(' ')}`).join('\n');
  const n = name.replace(/\s/g, '_');
  return [{ name: `${n}.obj`, data: strToU8(out.join('\n')) }, { name: `${n}.mtl`, data: strToU8(mtl) }];
}
export async function exportAll(built: Built[], format: string, name: string, printer?: Printer, read?: ReadProfile): Promise<OutFile[]> {
  if (format === '3mf') return [{ name: `${name}.3mf`, data: await to3mf(built, printer, read) }];
  if (format === 'stl') return toStl(built, name);
  if (format === 'obj') return toObj(built, name);
  throw new Error(`Bilinmeyen biçim: ${format}`);
}
