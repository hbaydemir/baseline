// Hazır şablonların küçük resimlerini ve tasarım havuzundaki örnek kaideleri üretir: npx tsx tools/thumbs.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { kernel, render } from './node';
import { TEMPLATES, templateDoc } from '../src/core/templates';
import { apply, newDoc, serialize, type Command } from '../src/core/doc';

const k = await kernel();
mkdirSync('src/app/thumbs', { recursive: true });
for (const t of TEMPLATES) {
  const b = k.build(templateDoc(t)), bad = b.find(x => x.error);
  if (bad) throw new Error(`${t.id}: ${bad.error}`);
  writeFileSync(`src/app/thumbs/${t.id}.png`, render(b, 256, 256, -35, 32));
}
const bases: Record<string, Command[]> = {
  'Yuvarlak kaide 50': [{ op: 'add', type: 'cylinder', params: { dia: 50, top: 46, h: 5, edge: 1, edgeStyle: 'round' }, color: '#222222' }],
  'Yuvarlak kaide 32': [{ op: 'add', type: 'cylinder', params: { dia: 32, top: 29, h: 4, edge: 0.8, edgeStyle: 'round' }, color: '#222222' }],
  'Basamaklı kaide': TEMPLATES.find(t => t.id === 'pedestal')!.cmds,
  'Altıgen kaide': TEMPLATES.find(t => t.id === 'hexbase')!.cmds,
  'Kare kaide': [{ op: 'add', type: 'box', params: { w: 40, d: 40, h: 5, r: 3, edge: 0.8, edgeStyle: 'round' }, color: '#8e8c99' }],
  'Oval kaide': [{ op: 'add', type: 'cylinder', params: { dia: 40, top: 37, h: 4, edge: 0.8, edgeStyle: 'round' }, scale: [1.5, 1, 1], color: '#8b5e3c' }],
};
mkdirSync('library/Kaideler', { recursive: true });
for (const [name, cmds] of Object.entries(bases)) {
  const d = apply(newDoc(), cmds).doc;
  writeFileSync(`library/Kaideler/${name}.baseline`, serialize(d));
  writeFileSync(`library/Kaideler/${name}.png`, render(k.build(d), 256, 256, -35, 32));
}
console.log('tamam');
