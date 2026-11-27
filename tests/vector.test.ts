import { expect, test } from 'vitest';
import * as V from '../src/app/vector';
import * as O from '../src/app/vectorOps';
import { kernel } from '../tools/node';

const W = (await kernel()).wasm;
const sq = (x: number, y: number, s = 10): V.Item => ({ id: V.newId(), subs: [V.rectSub(x, y, s, s)], fill: '#ff0000', stroke: null, sw: 0, even: false });
const area = (it: V.Item) => { const c = O.toCS(W, it), a = c.area(); c.delete(); return a; };

test('Corel şekillendirme işlemleri', () => {
  const a = sq(0, 0), b = sq(5, 5); // b önde; ortak alan 25 mm²
  const weld = O.shapeOp(W, [a, b], b.id, 'weld');
  expect(area(weld.add[0])).toBeCloseTo(175, 1); expect(weld.remove.sort()).toEqual([a.id, b.id].sort());
  const trim = O.shapeOp(W, [a, b], a.id, 'trim'); // hedef a: a'dan b oyulur, b kalır
  expect(area(trim.add[0])).toBeCloseTo(75, 1); expect(trim.remove).toEqual([a.id]);
  const x = O.shapeOp(W, [a, b], b.id, 'intersect');
  expect(area(x.add[0])).toBeCloseTo(25, 1); expect(x.remove).toEqual([]);
  const fmb = O.shapeOp(W, [a, b], a.id, 'frontMinusBack'); // öndeki b kalır
  expect(area(fmb.add[0])).toBeCloseTo(75, 1); expect(fmb.add[0].fill).toBe(b.fill); expect(fmb.remove.length).toBe(2);
  const bmf = O.shapeOp(W, [a, b], b.id, 'backMinusFront');
  expect(area(bmf.add[0])).toBeCloseTo(75, 1);
  const bd = O.shapeOp(W, [a, b], b.id, 'boundary');
  expect(bd.add[0].fill).toBeNull(); expect(bd.add[0].stroke).toBeTruthy(); expect(bd.remove).toEqual([]);
});

test('Zarf bükme düz kenarları da büker, köşeler sivri kalır', () => {
  const s = V.warpSub(V.rectSub(0, 0, 100, 20), (x, y) => [x, y + 5 * Math.sin(x / 100 * 2 * Math.PI)], 100 / 48);
  expect(s.pts.length).toBeGreaterThan(40);
  const c = s.pts[0]; expect(c.ix).not.toBeUndefined(); // köşe: tutamaçlar komşuya doğru (düz çıkış)
  expect(Math.abs(c.ix! - c.x) + Math.abs(c.iy! - c.y)).toBeGreaterThan(0);
});

import * as Fx from '../src/app/vectorFx';
test('Canlı efektler: zarf kaldırılınca şekil geri gelir, taşınınca birlikte taşınır', () => {
  const it = sq(0, 0, 20), e = Fx.envPreset(Fx.envNew(it.subs)!, 'arc', 0.6), bent = Fx.regeo({ ...it, fx: { env: e } });
  expect(V.bounds([bent])!.y0).toBeLessThan(-1); // kavis yukarı kabarır
  const back = Fx.dropFx(bent, 'env'); expect(back.fx).toBeUndefined(); expect(back.subs).toEqual(it.subs);
  const moved = V.mapItem(bent, (x, y) => [x + 100, y]);
  expect(Fx.regeo(moved).subs[0].pts[0].x).toBeCloseTo(bent.subs[0].pts[0].x + 100, 6);
});
test('Blok gölge ve kontür dışa aktarmada ayrı nesne olur', () => {
  const it: V.Item = { ...sq(0, 0), fx: { block: { dx: 5, dy: 5, color: '#000000' }, contour: { dist: 1, steps: 2, dir: 'out', join: 'Miter', color: '#ff0000', filled: false } } };
  const out = Fx.withFx(W, [it]);
  expect(out.length).toBe(4); // blok gölge + nesne + 2 kontür
  expect(area(out[0])).toBeCloseTo(100, 0); // süpürülen altıgen 200 mm² − kare 100 mm²
});
test('Bozma: girdap ve itme şekli değiştirir, kaynak saklı', () => {
  const it = sq(0, 0, 20), tw = Fx.regeo({ ...it, fx: { distort: { src: it.subs, kind: 'twist', amt: 90, freq: 8, c: [10, 10] } } });
  expect(tw.subs[0].pts.length).toBeGreaterThan(4); expect(Fx.dropFx(tw, 'distort').subs).toEqual(it.subs);
});

import * as IO from '../src/app/vectorIO';
test('SVG dışa aktarma: gölge, iç gölge ve geçişli şeffaflık yazılır', () => {
  const it: V.Item = { ...sq(0, 0), shadow: { dx: 2, dy: 2, blur: 1, color: '#000000', opacity: 0.5, persp: true }, fx: { inner: { dx: 1, dy: 1, size: 1, color: '#000000', opacity: 0.5 }, transp: { a: [0, 0], b: [10, 0], from: 0, to: 1 }, block: { dx: 3, dy: 3, color: '#333333' } } };
  const svg = IO.exportSvg(Fx.withFx(W, [it]), { free: true });
  expect(svg).toContain('feGaussianBlur'); expect(svg).toContain('mask="url(#tm'); expect(svg).toContain('clip-path="url(#ic'); expect(svg).toContain('#333333');
});

import * as Br from '../src/app/vectorBrush';
test('Fırça: hazır profil, kaligrafi ve basınç kapalı şekil verir; püskürtme kopyalar dizer', () => {
  const pts: V.V[] = Array.from({ length: 30 }, (_, i) => [i * 2, Math.sin(i / 5) * 10]);
  for (const mode of ['preset', 'calli', 'pressure'] as const) {
    const subs = Br.brushStroke(W, pts, pts.map(() => 0.5), { ...Br.BRUSH0, mode, w: 4 });
    expect(subs.length).toBeGreaterThan(0); expect(subs.every(s => s.closed)).toBe(true);
    const b = V.bounds([{ id: 0, subs, fill: '#000', stroke: null, sw: 0, even: false }])!; expect(b.x1 - b.x0).toBeGreaterThan(55);
  }
  const sp = Br.sprayItems(pts, { ...Br.BRUSH0, mode: 'spray', spray: { ...Br.BRUSH0.spray, gap: 10 } }, [V.rectSub(0, 0, 1, 1)], { fill: '#f00', stroke: null, sw: 0, even: false });
  expect(sp.length).toBeGreaterThan(4); expect(new Set(sp.map(q => q.group)).size).toBe(1);
});
