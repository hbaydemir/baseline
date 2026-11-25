import { expect, test } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { existsSync } from 'node:fs';
import { apply, newDoc, parseDoc, type Command } from '../src/core/doc';
import { evalExpr, resolveParams } from '../src/core/expr';
import { builtBounds, world } from '../src/core/kernel';
import { to3mf, toObj, toStl } from '../src/core/export';
import { kernel } from '../tools/node';

const k = await kernel();
const make = (cmds: Command[]) => { const { doc } = apply(newDoc(), cmds, k.bounds); return { doc, built: k.build(doc) }; };
/** Her yönlü kenarın tersi tam bir kez var mı? */
function watertight(ix: Uint32Array) {
  const m = new Map<string, number>();
  for (let i = 0; i < ix.length; i += 3) for (let q = 0; q < 3; q++) { const e = `${ix[i + q]},${ix[i + (q + 1) % 3]}`; m.set(e, (m.get(e) ?? 0) + 1); }
  return [...m].every(([e, n]) => n === 1 && m.get(e.split(',').reverse().join(',')) === 1);
}
test('formüller', () => {
  expect(evalExpr('2+3*4^2/8-1', {})).toBe(7);
  expect(resolveParams({ a: '=b*2', b: 3 }).a).toBe(6);
  expect(() => resolveParams({ a: '=b', b: '=a' })).toThrow('döngü');
  expect(() => evalExpr('constructor', {})).toThrow();
});
test('parametre değişince model değişir, geçersizi reddedilir', () => {
  const a = make([{ op: 'setParam', name: 'en', value: 10 }, { op: 'add', type: 'box', id: 'b', params: { w: '=en*2', d: 5, h: 5 } }]);
  expect(a.built[0].volume).toBeCloseTo(500);
  const b = apply(a.doc, [{ op: 'setParam', name: 'en', value: 20 }]).doc;
  expect(k.build(b)[0].volume).toBeCloseTo(1000);
  expect(() => apply(a.doc, [{ op: 'setParam', name: 'en', value: null }])).toThrow();
  expect(() => apply(a.doc, [{ op: 'update', id: 'b', params: { yok: 1 } }])).toThrow('bilinmeyen parametre');
});
test('her şekil su geçirmez ve pozitif hacimli', () => {
  const { built } = make(['box', 'cylinder', 'sphere', 'tube', 'gear', 'text', 'svg', 'balloonText', 'balloonSvg'].map(type => ({ op: 'add', type }) as Command));
  for (const b of built) { expect(b.error, b.id).toBeUndefined(); expect(b.volume).toBeGreaterThan(0); for (const p of b.parts) expect(watertight(p.indices), b.id).toBe(true); }
}, 30000);
test('dairesel balon yarım küredir', () => {
  const svg = '<svg><circle cx="5" cy="5" r="5" fill="red"/></svg>';
  const { built } = make([{ op: 'add', type: 'balloonSvg', params: { svg, width: 20, height: 10, base: 0.2, detail: 120 } }]);
  const want = 2 / 3 * Math.PI * 1000 + Math.PI * 100 * 0.2;
  expect(Math.abs(built[0].volume / want - 1)).toBeLessThan(0.01);
});
test('delik, kaynaştırma, renkler çakışmaz', () => {
  const { built } = make([
    { op: 'add', type: 'box', id: 'a', params: { w: 10, d: 10, h: 10 }, color: '#ff0000' },
    { op: 'add', type: 'box', id: 'b', params: { w: 10, d: 10, h: 10 }, pos: [5, 0, 0], color: '#00ff00' },
    { op: 'add', type: 'box', id: 'c', params: { w: 2, d: 2, h: 30 }, hole: true },
    { op: 'group', ids: ['a', 'b', 'c'], mode: 'fused' }]);
  expect(built[0].parts.map(p => p.color)).toEqual(['#ff0000', '#00ff00']);
  expect(built[0].volume).toBeCloseTo(1500 - 40, 1);
});
test('SVG renkleri: üstteki alttakini keser, stil ve dönüşüm okunur', () => {
  const svg = '<svg><style>.x{fill:#00f}</style><rect width="10" height="10" fill="#f00"/><g transform="translate(2 2)"><rect class="x" width="4" height="4"/></g></svg>';
  const { built } = make([{ op: 'add', type: 'svg', params: { svg, width: 10, h: 1 } }]);
  expect(built[0].parts.map(p => p.color)).toEqual(['#ff0000', '#0000ff']);
  expect(built[0].volume).toBeCloseTo(100, 2);
});
test('yerleştirme ve grubu çözünce konum korunur', () => {
  let { doc } = make([{ op: 'add', type: 'box', id: 'a' }, { op: 'add', type: 'sphere', id: 's', rot: [30, 20, 10] }, { op: 'place', id: 's', on: 'a', side: 'top' }]);
  expect(k.bounds(doc, 's').min[2]).toBeCloseTo(20, 3);
  doc = apply(doc, [{ op: 'group', ids: ['a', 's'], mode: 'linked', id: 'g' }, { op: 'update', id: 'g', pos: [3, 4, 5], rot: [10, 50, 70], scale: [2, 2, 2] }]).doc;
  const before = builtBounds(k.build(doc)[0]);
  const un = k.build(apply(doc, [{ op: 'ungroup', id: 'g' }]).doc).map(builtBounds);
  for (let i = 0; i < 3; i++) { expect(Math.min(...un.map(b => b.min[i]))).toBeCloseTo(before.min[i], 2); expect(Math.max(...un.map(b => b.max[i]))).toBeCloseTo(before.max[i], 2); }
});
test('tek hata tüm komutları geri alır; bozuk dosya reddedilir', () => {
  const d = newDoc();
  expect(() => apply(d, [{ op: 'add', type: 'box' }, { op: 'remove', ids: ['yok'] }])).toThrow('Komut 2');
  expect(d.nodes).toHaveLength(0);
  expect(() => parseDoc('{"format":"x"}')).toThrow();
});
test('dışa aktarma', async () => {
  const { built } = make([{ op: 'add', type: 'balloonSvg', name: 'Ş<&"' }, { op: 'add', type: 'box', hole: true }]);
  const z = unzipSync(await to3mf(built)), m = strFromU8(z['3D/3dmodel.model']);
  expect(m.match(/<mesh>/g)).toHaveLength(2); expect(m).not.toContain('NaN'); expect(m).toContain('displaycolor="#E5484DFF"');
  expect(toStl(built, 'x').map(f => f.name)).toEqual(['x_e5484d.stl', 'x_ffffff.stl']);
  expect(toObj(built, 'x')).toHaveLength(2);
  const bad = make([{ op: 'add', type: 'tube', params: { inner: 50 } }]).built;
  await expect(to3mf(bad)).rejects.toThrow('Hatalı nesne');
});
test('aynalanan nesne dışa dönük kalır', () => {
  const { built } = make([{ op: 'add', type: 'box', scale: [-1, 1, 1] }]);
  const p = world(built[0])[0]; let v = 0;
  for (let i = 0; i < p.indices.length; i += 3) { const [a, b, c] = [0, 1, 2].map(q => p.positions.subarray(p.indices[i + q] * 3, p.indices[i + q] * 3 + 3)); v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); }
  expect(v / 6).toBeCloseTo(8000, 0);
});
