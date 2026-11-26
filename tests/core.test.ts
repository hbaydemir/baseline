import { expect, test } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { apply, newDoc, parseDoc, type Command } from '../src/core/doc';
import { evalExpr, resolveParams } from '../src/core/expr';
import { builtBounds, triColor, world } from '../src/core/kernel';
import { to3mf, toObj, toStl } from '../src/core/export';
import { SHAPES } from '../src/core/shapes';
import { importModel, repair } from '../src/core/mesh';
import { analyze } from '../src/core/guide';
import { kernel } from '../tools/node';
const TWO = '<svg viewBox="0 0 100 100"><path fill="#e5484d" d="M50 90 C-20 45 15 0 50 30 C85 0 120 45 50 90Z"/><circle cx="33" cy="38" r="9" fill="#ffffff"/></svg>';

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
  const { built } = make(Object.keys(SHAPES).filter(t => t !== 'mesh').map(type => ({ op: 'add', type }) as Command));
  for (const b of built) { expect(b.error, b.id).toBeUndefined(); expect(b.volume).toBeGreaterThan(0); for (const p of b.parts) expect(watertight(p.indices), b.id).toBe(true); }
}, 30000);
test('dairesel balon yarım küredir', () => {
  const svg = '<svg><circle cx="5" cy="5" r="5" fill="red"/></svg>';
  const { built } = make([{ op: 'add', type: 'svg', params: { svg, width: 20 }, effects: [{ type: 'balloon', params: { height: 10, base: 0.2, detail: 120 } }] }]);
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
  const { built } = make([{ op: 'add', type: 'svg', name: 'Ş<&"', params: { svg: TWO }, effects: [{ type: 'balloon', params: {} }] }, { op: 'add', type: 'box', hole: true }]);
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

const vol = (cmds: Command[]) => { const b = make(cmds).built[0]; expect(b.error).toBeUndefined(); for (const p of b.parts) expect(watertight(p.indices)).toBe(true); return b.volume; };
test('efektler', () => {
  const sq = { op: 'add', type: 'polygon', params: { sides: 4, dia: 20 * Math.SQRT2, h: 10 } } as const;
  expect(vol([sq])).toBeCloseTo(4000, 0);
  // kare prizma üst pahı: kesik piramit hacmi
  expect(vol([{ ...sq, effects: [{ type: 'bevel', params: { top: 2, bottom: 0 } }] }])).toBeCloseTo(3200 + 2 / 3 * (400 + 256 + Math.sqrt(400 * 256)), 0);
  expect(vol([{ ...sq, params: { ...sq.params, corner: 2 } }])).toBeCloseTo(4000 - 4 * 2 * 10, 0);
  expect(vol([{ ...sq, params: { ...sq.params, corner: 2, cornerStyle: 'round' } }])).toBeCloseTo(4000 - (4 - Math.PI) * 4 * 10, 0);
  for (const [type, params] of [['twist', { angle: 90 }], ['taper', { top: 50 }], ['bend', { angle: 60 }], ['wave', {}], ['simplify', {}], ['balloon', {}], ['bevel', { top: 3, bottom: 2, style: 'round' }]] as const) expect(vol([{ ...sq, effects: [{ type, params: params as any }] }]), type).toBeGreaterThan(500);
  expect(vol([{ ...sq, effects: [{ type: 'cut', params: { at: 25 } }] }])).toBeCloseTo(1000, 0);
  expect(vol([{ op: 'add', type: 'text', effects: [{ type: 'bevel', params: { top: 0.6, bottom: 0.4 } }] }])).toBeGreaterThan(100);
  expect(vol([{ op: 'add', type: 'box', params: { edge: 2 } }])).toBeLessThan(8000);
  expect(() => make([{ op: 'add', type: 'box', effects: [{ type: 'bevel', params: {} }] }])).toThrow();
});
test('menteşe ve tolerans testi parçaları birbirine değmez', () => {
  for (const type of ['hinge', 'tolTest', 'rail', 'gearPair', 'boxLid']) {
    const b = make([{ op: 'add', type, ...(type === 'rail' || type === 'boxLid' ? { params: { layout: 'together' } } : {}) }]).built[0];
    const ms = b.parts.map(p => new k.wasm.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices })));
    for (let i = 0; i < ms.length; i++) for (let j = 0; j < i; j++) expect(ms[i].intersect(ms[j]).volume(), type).toBeLessThan(0.01);
    if (type === 'hinge' || type === 'tolTest') expect(ms.map(m => m.decompose().length), type).toEqual(ms.map(() => 1));
  }
});
test('eski balon belgesi açılır', () => {
  const d = parseDoc(JSON.stringify({ format: 'baseline', version: 1, params: {}, nodes: [{ id: 'a', name: 'a', type: 'balloonText', params: { text: 'A', size: 20, height: 5, base: 1, detail: 60, style: 'flat' }, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#ff0000', hole: false, hidden: false }] }));
  expect(d.nodes[0].type).toBe('text'); expect(k.build(d)[0].volume).toBeGreaterThan(0);
});
test('STL/OBJ/3MF içe aktarma, renk ve boyama gidiş dönüş', async () => {
  const { built } = make([{ op: 'add', type: 'box', color: '#ff0000', paint: [{ pts: [[0, 0, 20]], n: [0, 0, 1], r: 0, color: '#00ff00' }, { pts: [[10, 0, 10]], n: [1, 0, 0], r: 3, color: '#0000ff' }] }]);
  const p = built[0].parts[0]; expect(watertight(p.indices)).toBe(true);
  const area = (q: typeof p, c: string) => { let s = 0; for (let t = 0; t < q.indices.length; t += 3) if (triColor(q, t / 3) === c) { const v = [0, 1, 2].map(i => [0, 1, 2].map(x => q.positions[q.indices[t + i] * 3 + x])), a = [0, 1, 2].map(i => v[1][i] - v[0][i]), b = [0, 1, 2].map(i => v[2][i] - v[0][i]); s += Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2; } return s; };
  expect(area(p, '#00ff00')).toBeCloseTo(400, 1); expect(Math.abs(area(p, '#0000ff') - Math.PI * 9)).toBeLessThan(5);
  const files: [string, Uint8Array][] = [['a.3mf', await to3mf(built)], ['a.stl', toStl(built, 'a')[0].data], ['a.obj', toObj(built, 'a')[0].data]];
  for (const [name, data] of files) {
    const r = importModel(k.wasm, name, data), b = make([...r.cmds.assets.map(a => ({ op: 'asset', ...a }) as Command), ...r.cmds.nodes.map(n => ({ op: 'add', type: 'mesh', pos: n.pos, params: { asset: n.asset } }) as Command), { op: 'add', type: 'box', id: 'h', hole: true, params: { w: 4, d: 4, h: 50 } }, { op: 'group', ids: ['mesh1', 'h'], mode: 'fused' }]).built[0];
    expect(b.error).toBeUndefined(); expect(b.volume, name).toBeCloseTo(8000 - 320, 0);
    if (name !== 'a.stl') { expect(area(b.parts[0], '#00ff00'), name).toBeCloseTo(400 - 16, 0); expect(b.parts[0].color).toBe('#ff0000'); }
  }
});
test('onarma: açık, ters ve bozuk ağ', () => {
  const b = make([{ op: 'add', type: 'sphere' }]).built[0].parts[0], ix = [...b.indices];
  ix.splice(30, 12); for (let i = 0; i < 60; i += 3) [ix[i], ix[i + 1]] = [ix[i + 1], ix[i]]; ix.push(ix[0], ix[1], ix[2], 5, 5, 6);
  const r = repair(k.wasm, { colors: ['#ffffff'], positions: b.positions, indices: new Uint32Array(ix) });
  expect(r.report.ok).toBe(true); expect(r.report.filled).toBeGreaterThan(0); expect(r.report.flipped).toBeGreaterThan(0); expect(watertight(r.part.indices)).toBe(true);
  expect(() => importModel(k.wasm, 'x.stl', new Uint8Array(10))).toThrow();
});
test('belge ekleme parametre çakışmasını ayırır', () => {
  const a = make([{ op: 'setParam', name: 'en', value: 10 }, { op: 'add', type: 'box', id: 'b', params: { w: '=en' } }]).doc;
  const b = make([{ op: 'setParam', name: 'en', value: 30 }, { op: 'add', type: 'box', id: 'b', params: { w: '=en' } }]).doc;
  const m = apply(a, [{ op: 'insert', doc: b, pos: [50, 0, 0] }]).doc, r = k.build(m).map(builtBounds);
  expect(r.map(x => Math.round(x.max[0] - x.min[0]))).toEqual([10, 30]);
});
test('asistan analizi', () => {
  const a = analyze(make([{ op: 'add', type: 'sphere', params: { dia: 30 } }, { op: 'add', type: 'box', pos: [40, 0, 10] }]).built)!;
  expect(a.floating).toBe(1); expect(a.overhang).toBeGreaterThan(100); expect(a.findings.some(f => f.text.includes('destek'))).toBe(true);
});
test('yazı yolu yalnız M L C Z içerir', () => {
  const d = k.textPath('Ağış 8', 10); expect(d).not.toMatch(/[QqHhVvAaSsTt]|NaN/); expect(d).toMatch(/C/);
  for (const s of [4, 7, 12.5]) expect(k.textPath('BASE Ağ', s)).not.toMatch(/NaN/);
  expect(k.build(apply(newDoc(), [{ op: 'add', type: 'text', params: { text: 'BASE', size: 4 } }]).doc)[0].volume).toBeGreaterThan(30);
});
test('dizi, aynala, içini boşalt; bölme', () => {
  const cube = { op: 'add', type: 'box', params: { w: 10, d: 10, h: 10 } } as const;
  expect(vol([{ ...cube, effects: [{ type: 'array', params: { count: 3, dx: 15 } }] }])).toBeCloseTo(3000, 0);
  expect(vol([{ ...cube, effects: [{ type: 'array', params: { mode: 'grid', count: 2, rows: 3, dx: 12, dy: 12 } }] }])).toBeCloseTo(6000, 0);
  expect(vol([{ ...cube, effects: [{ type: 'array', params: { mode: 'circle', count: 6, radius: 30 } }] }])).toBeCloseTo(6000, 0);
  expect(vol([{ ...cube, effects: [{ type: 'mirror', params: { axis: 'x' } }] }])).toBeCloseTo(2000, 0);
  expect(vol([{ ...cube, effects: [{ type: 'hollow', params: { t: 1 } }] }])).toBeCloseTo(1000 - 512, 0);
  expect(vol([{ ...cube, effects: [{ type: 'hollow', params: { t: 1, open: 'open' } }] }])).toBeCloseTo(1000 - 8 * 8 * 9, 0);
  const d = apply(newDoc(), [{ op: 'add', type: 'box', id: 'b', params: { w: 60, d: 30, h: 40 } }, { op: 'split', id: 'b', params: { joint: 'snap', layout: 'print', tiltX: 30 } }]).doc;
  const b = k.build(d)[0]; expect(b.error).toBeUndefined();
  const ms = b.parts.flatMap(p => new k.wasm.Manifold(new k.wasm.Mesh({ numProp: 3, vertProperties: p.positions, triVerts: p.indices })).decompose());
  expect(ms.length).toBeGreaterThanOrEqual(4); for (let i = 0; i < ms.length; i++) for (let j = 0; j < i; j++) expect(ms[i].intersect(ms[j]).volume()).toBeLessThan(0.01);
  expect(builtBounds(b).min[2]).toBeCloseTo(0, 3);
  expect(k.splitInfo(d, d.nodes[0].id).pts.length).toBeGreaterThan(0);
  const un = apply(d, [{ op: 'ungroup', id: d.nodes[0].id }]).doc; expect(un.nodes[0].type).toBe('box');
  expect(() => apply(d, [{ op: 'update', id: d.nodes[0].id, params: { joint: 'yok' } }])).toThrow();
});
test('şablon alanları: seçenek, aç-kapa, ölçü; imzasız şablon resmî sayılmaz', async () => {
  const { applyFields, verifyOfficial, catOf, tplPath } = await import('../src/core/template');
  const { doc } = apply({ ...newDoc(), params: { en: 40 } }, [
    { op: 'add', type: 'box', id: 'a', params: { w: '=en' } }, { op: 'add', type: 'cylinder', id: 'b' }, { op: 'add', type: 'sphere', id: 'c' }, { op: 'add', type: 'text', id: 't', params: { text: 'x' } },
  ]);
  doc.template = { name: 'Deneme', fields: [
    { key: 'sekil', label: 'Şekil', type: 'choice', options: [{ label: 'A', nodes: ['a'] }, { label: 'B', nodes: ['b'] }] },
    { key: 'kure', label: 'Küre', type: 'toggle', nodes: ['c'] }, { key: 'en', label: 'En', type: 'number' }, { key: 'yazi', label: 'Yazı', type: 'text', node: 't' }] };
  const out = applyFields(doc, { sekil: 1, kure: false, en: 55, yazi: 'Merhaba' });
  expect(out.nodes.map(n => n.id)).toEqual(['b', 't']); expect(out.params.en).toBe(55); expect(out.nodes[1].params.text).toBe('Merhaba'); expect(out.template).toBeUndefined();
  expect(applyFields(doc, {}).nodes.map(n => n.id)).toEqual(['a', 'c', 't']);
  expect(await verifyOfficial({ ...doc, template: { ...doc.template, official: true, sig: 'AAAA' } })).toBe(false);
  expect(catOf('')).toBe('Genel'); expect(tplPath({ name: 'a/b', category: ' Ev & Yaşam / Mutfak ' })).toBe('tpl:Ev & Yaşam/Mutfak/a_b.baseline');
});
