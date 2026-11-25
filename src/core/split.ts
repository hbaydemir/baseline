// Bölme: düzlemle iki yarı, kesitte otomatik ya da elle yerleşen kilitler (dübel / geçmeli pim), baskı yerleşimi.
import type { CrossSection, Manifold, ManifoldToplevel, Mat4, Vec2 } from 'manifold-3d';
import type { P2 } from './corners';

export interface SplitOpts { tiltX: number; tiltY: number; at: number; joint: string; count: number; dia: number; depth: number; margin: number; gap: number; layout: string; pins: string }
interface Solid { color: string; m: Manifold }
type V3 = [number, number, number];
const R = Math.PI / 180, dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** Düzlem: normal (Z ekseni X sonra Y eğimiyle döner) ve tabanı. */
export function plane(o: Pick<SplitOpts, 'tiltX' | 'tiltY'>) {
  const a = o.tiltX * R, b = o.tiltY * R;
  const n = norm([Math.sin(b), -Math.sin(a) * Math.cos(b), Math.cos(a) * Math.cos(b)]);
  const u = norm(Math.abs(n[2]) > 0.9 ? cross([0, 1, 0], n) : cross(n, [0, 0, 1])), v = cross(n, u);
  return { n, u, v };
}
/** Satırları (a,b,c) ve öteleme t olan dönüşüm: p -> (a·p, b·p, c·p) + t */
const rows = (a: number[], b: number[], c: number[], t: number[] = [0, 0, 0]): Mat4 => [a[0], b[0], c[0], 0, a[1], b[1], c[1], 0, a[2], b[2], c[2], 0, t[0], t[1], t[2], 1];
/** Sütunları (a,b,c): yerelden dünyaya. */
const cols = (a: number[], b: number[], c: number[], t: number[] = [0, 0, 0]): Mat4 => [a[0], a[1], a[2], 0, b[0], b[1], b[2], 0, c[0], c[1], c[2], 0, t[0], t[1], t[2], 1];

function inside(polys: P2[][], x: number, y: number) { let c = false; for (const p of polys) for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [ax, ay] = p[i], [bx, by] = p[j]; if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) c = !c; } return c; }
function edgeDist(polys: P2[][], x: number, y: number) { let m = Infinity; for (const p of polys) for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [ax, ay] = p[j], [bx, by] = p[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); m = Math.min(m, Math.hypot(ax + dx * t - x, ay + dy * t - y)); } return m; }

/** Kesit ve kilit yerleri (düzlem koordinatında). */
export function splitPlan(wasm: ManifoldToplevel, solids: Solid[], o: SplitOpts) {
  const { n, u, v } = plane(o), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of solids) { const b = s.m.boundingBox(); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.min[k]); hi[k] = Math.max(hi[k], b.max[k]); } }
  const c = lo.map((x, k) => (x + hi[k]) / 2), d = dot(c, n) + o.at;
  const all = solids.length === 1 ? solids[0].m : wasm.Manifold.union(solids.map(s => s.m));
  const flat = all.transform(rows(u, v, n, [0, 0, -d])), cs: CrossSection = flat.slice(0);
  flat.delete(); if (all !== solids[0].m) all.delete();
  const polys = cs.toPolygons() as P2[][], area = cs.area(); cs.delete();
  let pts: { x: number; y: number; d: number }[] = [];
  if (o.joint !== 'flat' && polys.length) {
    const manual = (() => { try { return JSON.parse(o.pins || 'null') as number[][] | null; } catch { return null; } })();
    if (manual?.length) pts = manual.map(([x, y, dd]) => ({ x, y, d: dd || o.dia || 5 }));
    else {
      // ızgara örneklemi: en kalın nokta, sonra birbirinden en uzak noktalar
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const step = Math.max(0.4, Math.max(x1 - x0, y1 - y0) / 60), cand: { x: number; y: number; e: number }[] = [];
      for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) if (inside(polys, x, y)) { const e = edgeDist(polys, x, y); if (e > o.margin + 1.2) cand.push({ x, y, e }); }
      const want = o.count || (area < 250 ? 1 : area < 1200 ? 2 : area < 4000 ? 3 : 4);
      if (cand.length) {
        cand.sort((a, b) => b.e - a.e); const chosen = [cand[0]];
        while (chosen.length < want) {
          let best = null as null | typeof cand[number], bs = -1;
          for (const q of cand) { const dm = Math.min(...chosen.map(p => Math.hypot(p.x - q.x, p.y - q.y))); const sc = dm * Math.min(1, q.e / (cand[0].e || 1) + 0.4); if (sc > bs) { bs = sc; best = q; } }
          if (!best || bs < 2.5 * (o.margin + 1.5)) break; chosen.push(best);
        }
        const room = Math.min(...chosen.map(p => p.e)) - o.margin, dia = o.dia || Math.max(2.4, Math.min(8, room * 2 * 0.75));
        pts = room * 2 >= 2.4 ? chosen.map(p => ({ x: p.x, y: p.y, d: Math.min(dia, (p.e - o.margin) * 2) })) : [];
      }
    }
  }
  const outline = polys.map(p => 'M' + p.map(([x, y]) => `${+x.toFixed(3)} ${+(-y).toFixed(3)}`).join('L') + 'Z').join('');
  return { n, u, v, d, c, polys, area, pts, outline, size: Math.max(...hi.map((x, k) => x - lo[k])) };
}

export function splitSolids(wasm: ManifoldToplevel, solids: Solid[], o: SplitOpts): Solid[] {
  const { Manifold, CrossSection } = wasm, plan = splitPlan(wasm, solids, o), { n, u, v, d } = plan, bag: (Manifold | CrossSection)[] = [], T = <X extends Manifold | CrossSection>(x: X) => { bag.push(x); return x; };
  try {
    const A: Solid[] = [], B: Solid[] = [];
    for (const s of solids) { const [a, b] = s.m.splitByPlane(n, d); if (!a.isEmpty()) A.push({ color: s.color, m: a }); else a.delete(); if (!b.isEmpty()) B.push({ color: s.color, m: b }); else b.delete(); }
    if (!A.length || !B.length) { [...A, ...B].forEach(s => s.m.delete()); throw new Error('Kesim düzlemi nesnenin dışında: konumu değiştir'); }
    const color = solids[0].color, g = o.gap, depth = o.depth, pins: { m: Manifold; at: number[] }[] = [];
    const lathe = (pts: Vec2[], seg = 48) => T(T(CrossSection.ofPolygons([pts], 'Positive')).revolve(seg)); // Z ekseni etrafında
    for (const p of plan.pts) {
      const r = p.d / 2, b = Math.min(0.45, r * 0.18), barbAt = depth * 0.6, L = depth - 0.25;
      // delik: düzlemin iki yanına derinlik + boşluk
      const H = depth + g, prof: Vec2[] = [[0, -H], [r + g, -H], [r + g, H], [0, H]];
      let hole = lathe(prof);
      if (o.joint === 'snap') for (const s of [-1, 1]) { const z = s * barbAt; hole = T(Manifold.union([hole, lathe([[0, z - 0.6 - g], [r + b + g, z - 0.6 - g], [r + b + g, z + 0.6 + g], [0, z + 0.6 + g]])])); }
      const at = u.map((x, k) => x * p.x + v[k] * p.y + n[k] * d), place = cols(u, v, n, at), wh = T(hole.transform(place));
      for (const S of [A, B]) for (const s of S) { const o2 = s.m; s.m = o2.subtract(wh); o2.delete(); }
      // pim (Z boyunca, ortası düzlemde): uçlar pahlı, yanları baskı için düz
      const ch = Math.min(0.5, r * 0.3);
      let pin = lathe(o.joint === 'snap'
        ? [[0, -L], [r - ch, -L], [r, -L + ch], [r, -barbAt - 0.6], [r + b, -barbAt - 0.1], [r + b, -barbAt + 0.1], [r, -barbAt + 0.6], [r, barbAt - 0.6], [r + b, barbAt - 0.1], [r + b, barbAt + 0.1], [r, barbAt + 0.6], [r, L - ch], [r - ch, L], [0, L]]
        : [[0, -L], [r - ch, -L], [r, -L + ch], [r, L - ch], [r - ch, L], [0, L]]);
      pin = T(pin.intersect(T(Manifold.cube([2 * r * 0.82, 3 * r, 3 * L], true)))); // yatınca alt ve üst düz
      if (o.joint === 'snap') { const sw = Math.max(0.7, r * 0.45), sl = depth * 0.85; for (const s of [-1, 1]) pin = T(pin.subtract(T(T(Manifold.cube([3 * r, sw, sl + 1], true)).translate([0, 0, s * (L - sl / 2 + 0.5)])))); }
      pins.push({ m: pin, at });
    }
    const out: Solid[] = [], gap = Math.max(3, plan.size * 0.08);
    if (o.layout === 'print') {
      // kesik yüzler tabla üstünde, yan yana; pimler yatık
      const lay = (S: Solid[], m: Mat4) => S.map(s => ({ color: s.color, m: s.m.transform(m) }));
      const a = lay(A, rows(u, v, n, [0, 0, -d])), b = lay(B, rows(u, v.map(x => -x), n.map(x => -x), [0, 0, d]));
      const box = (S: Solid[]) => { const l = [Infinity, Infinity, Infinity], h = [-Infinity, -Infinity, -Infinity]; for (const s of S) { const q = s.m.boundingBox(); for (let k = 0; k < 3; k++) { l[k] = Math.min(l[k], q.min[k]); h[k] = Math.max(h[k], q.max[k]); } } return { l, h }; };
      const ba = box(a), bb = box(b), w = ba.h[0] - ba.l[0];
      const ox = plan.c[0] - (w + 5 + bb.h[0] - bb.l[0]) / 2, oy = plan.c[1];
      for (const s of a) { out.push({ color: s.color, m: s.m.translate([ox - ba.l[0], oy - (ba.l[1] + ba.h[1]) / 2, -ba.l[2]]) }); s.m.delete(); }
      for (const s of b) { out.push({ color: s.color, m: s.m.translate([ox + w + 5 - bb.l[0], oy - (bb.l[1] + bb.h[1]) / 2, -bb.l[2]]) }); s.m.delete(); }
      [...A, ...B].forEach(s => s.m.delete());
      const yMin = Math.min(oy - (ba.h[1] - ba.l[1]) / 2, oy - (bb.h[1] - bb.l[1]) / 2);
      pins.forEach((p, i) => { const q = p.m.rotate([0, 90, 0]), bq = q.boundingBox(); out.push({ color, m: q.translate([ox + i * (bq.max[0] - bq.min[0] + 4) - bq.min[0], yMin - 4 - bq.max[1], -bq.min[2]]) }); q.delete(); });
    } else {
      const e = o.layout === 'explode' ? gap : 0;
      for (const s of A) { out.push({ color: s.color, m: e ? s.m.translate(n.map(x => x * e) as V3) : s.m.translate([0, 0, 0]) }); }
      for (const s of B) { out.push({ color: s.color, m: e ? s.m.translate(n.map(x => -x * e) as V3) : s.m.translate([0, 0, 0]) }); }
      for (const p of pins) out.push({ color, m: p.m.transform(cols(u, v, n, p.at)) });
      [...A, ...B].forEach(s => s.m.delete());
    }
    return out;
  } finally { bag.forEach(x => x.delete()); }
}
