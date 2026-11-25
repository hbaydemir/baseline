// Temel ve mekanik parçaların geometrisi. Ara nesneler "bag" içinde toplanır ve sonunda silinir.
import type { CrossSection, Manifold, ManifoldToplevel, Vec2, Vec3 } from 'manifold-3d';
import { METRIC } from './shapes';
import { cornerPolys, type P2 } from './corners';

export interface Args { g(k: string): number; t(k: string): string; label(text: string, size: number): CrossSection }
type Del = { delete(): void };
const R = Math.PI / 180;

export function buildSolids(wasm: ManifoldToplevel, type: string, a: Args): Manifold[] | null {
  const all: Del[] = [], T = <X extends Del>(x: X): X => { all.push(x); return x; };
  const { Manifold, CrossSection } = wasm, { g, t } = a;
  const poly = (p: Vec2[]) => T(CrossSection.ofPolygons([p], 'Positive'));
  const ext = (c: CrossSection, h: number) => T(c.extrude(h));
  const at = (m: Manifold, x: number, y: number, z: number) => T(m.translate([x, y, z]));
  const rot = (m: Manifold, x: number, y: number, z: number) => T(m.rotate([x, y, z]));
  const cyl = (d: number, h: number, seg = 64, d2 = d) => { if (d > 0 || d2 <= 0) return T(Manifold.cylinder(h, d / 2, d2 / 2, seg)); return at(rot(T(Manifold.cylinder(h, d2 / 2, 0, seg)), 180, 0, 0), 0, 0, h); };
  const cube = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => at(T(Manifold.cube([x1 - x0, y1 - y0, z1 - z0])), x0, y0, z0);
  const add = (...m: Manifold[]) => m.length === 1 ? m[0] : T(Manifold.union(m));
  const sub = (m: Manifold, ...o: Manifold[]) => o.length ? T(m.subtract(add(...o))) : m;
  const ngon = (r: number, n: number, off = 0): Vec2[] => Array.from({ length: n }, (_, i) => [r * Math.cos(off + i * 2 * Math.PI / n), r * Math.sin(off + i * 2 * Math.PI / n)]);
  /** (yarıçap, z) kesitini Z etrafında döndürür; dış köşelere pah verir. */
  const lathe = (pts: P2[], seg: number, edge = 0, style = 'chamfer', pick: (p: P2) => boolean = p => p[0] > 1e-6) => T(T(CrossSection.ofPolygons(cornerPolys([pts], edge, style, pick), 'Positive')).revolve(seg));
  const rrect = (w: number, d: number, r: number) => { r = Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01)); if (r <= 0) return T(CrossSection.square([w, d], true)); return T(T(CrossSection.square([w - 2 * r, d - 2 * r], true)).offset(r, 'Round', 2, 64)); };
  const hex = (af: number, h: number) => ext(poly(ngon(af / 2 / Math.cos(Math.PI / 6), 6)), h);
  /** Tek ağızlı sağ vida dişi: dişli kesit burularak yükseltilir. */
  const thread = (d: number, pitch: number, len: number) => {
    const depth = pitch * 0.6, n = 60, pts: Vec2[] = Array.from({ length: n }, (_, i) => { const u = i / n, tri = Math.abs(2 * u - 1), r = d / 2 - depth * Math.min(1, Math.max(0, (tri - 0.12) / 0.76)); return [r * Math.cos(u * 2 * Math.PI), r * Math.sin(u * 2 * Math.PI)]; });
    return T(poly(pts).extrude(len, Math.max(2, Math.ceil(len / pitch * 24)), 360 * len / pitch));
  };
  const M = () => { const m = METRIC[t('size')]; if (!m) throw new Error('Bilinmeyen vida ölçüsü'); return m; };

  const make = (): Manifold[] | null => {
    switch (type) {
      case 'cylinder': case 'cone': {
        const lo = g('dia') / 2, hi = g('top') / 2, h = g('h');
        if (lo <= 0 && hi <= 0) throw new Error('İki çap birden sıfır olamaz');
        const p: P2[] = [[0, 0], ...(lo > 0 ? [[lo, 0] as P2] : []), ...(hi > 0 ? [[hi, h] as P2] : []), [0, h]];
        return [lathe(p, g('seg'), g('edge'), t('edgeStyle'))];
      }
      case 'sphere': return [at(T(Manifold.sphere(g('dia') / 2, g('seg'))), 0, 0, g('dia') / 2)];
      case 'hemisphere': { const r = g('dia') / 2, N = Math.max(6, Math.round(g('seg') / 4)); return [lathe([[0, 0], ...Array.from({ length: N }, (_, i) => [r * Math.cos(i / N * Math.PI / 2), r * Math.sin(i / N * Math.PI / 2)] as P2), [0, r]], g('seg'))]; }
      case 'paraboloid': { const r = g('dia') / 2, h = g('h'), N = Math.max(8, Math.round(g('seg') / 3)); return [lathe([[0, 0], ...Array.from({ length: N }, (_, i) => { const x = r * (1 - i / N); return [x, h * (1 - (x / r) ** 2)] as P2; }), [0, h]], g('seg'))]; }
      case 'tube': {
        const o = g('dia') / 2, i = g('inner') / 2, h = g('h');
        if (i >= o) throw new Error('İç çap dış çaptan küçük olmalı');
        return [lathe([[i, 0], [o, 0], [o, h], [i, h]], g('seg'), g('edge'), t('edgeStyle'))];
      }
      case 'torus': {
        const r = g('tube') / 2, c = g('dia') / 2 - r; if (c <= r) throw new Error('Halka kalınlığı dış çapın yarısından küçük olmalı');
        return [lathe(ngon(r, g('tubeSeg')).map(([x, y]) => [x + c, y + r]), g('seg'))];
      }
      case 'ringFlat': {
        const i = g('inner') / 2, th = g('t'), h = g('h'), w = Math.min(g('wall'), th), N = 24;
        const arc = Array.from({ length: N + 1 }, (_, k) => { const a = -Math.PI / 2 + Math.PI * k / N; return [i + w + (th - w) * Math.cos(a), h / 2 + h / 2 * Math.sin(a)] as P2; });
        return [lathe(w > 0 ? [[i, 0], ...arc, [i, h]] : arc, g('seg'))];
      }
      case 'pyramid': {
        const n = g('sides'), k = 1 / Math.cos(Math.PI / n) / 2, b = g('w') * k, tp = g('top') * k, h = g('h'), off = Math.PI / n - Math.PI / 2;
        const p: Vec3[] = [...ngon(b, n, off).map(([x, y]) => [x, y, 0] as Vec3), ...(tp > 0 ? ngon(tp, n, off).map(([x, y]) => [x, y, h] as Vec3) : [[0, 0, h] as Vec3])];
        return [T(Manifold.hull(p))];
      }
      case 'roof': case 'roundRoof': {
        const w = g('w') / 2, h = g('h'), d = g('d'), r = type === 'roof' ? Math.min(g('ridge') / 2, w) : 0, N = Math.max(6, Math.round((type === 'roof' ? 6 : g('seg')) / 2));
        const p: Vec2[] = type === 'roof' ? [[-w, 0], [w, 0], ...(r > 0 ? [[r, h], [-r, h]] as Vec2[] : [[0, h]] as Vec2[])] : Array.from({ length: N + 1 }, (_, i) => [w * Math.cos(i / N * Math.PI), h * Math.sin(i / N * Math.PI)] as Vec2);
        return [at(rot(ext(poly(p), d), 90, 0, 0), 0, d / 2, 0)];
      }
      case 'wedge': { const w = g('w') / 2, d = g('d') / 2, h = g('h'); return [T(Manifold.hull([[-w, -d, 0], [w, -d, 0], [w, d, 0], [-w, d, 0], [-w, d, h], [w, d, h]]))]; }
      case 'icosa': {
        const f = (1 + Math.sqrt(5)) / 2, v: Vec3[] = [];
        for (const s of [-1, 1]) for (const q of [-f, f]) v.push([0, s, q], [s, q, 0], [q, 0, s]);
        const k = g('dia') / 2 / Math.hypot(1, f), m = rot(T(Manifold.hull(v.map(p => p.map(x => x * k) as Vec3))), 0, -Math.atan(f / (1 + 2 * f)) / R, 0);
        return [at(m, 0, 0, -m.boundingBox().min[2])];
      }
      case 'star3d': {
        const n = g('points'), ro = g('dia') / 2, ri = g('inner') / 2, h = g('h'), b = g('base'), both = t('both') === 'both';
        if (ri >= ro) throw new Error('İç çap dış çaptan küçük olmalı');
        if (!both && b <= 0 && h <= 0) throw new Error('Yükseklik gerekli');
        const p = Array.from({ length: 2 * n }, (_, i) => { const r = i % 2 ? ri : ro, x = Math.PI / 2 + i * Math.PI / n; return [r * Math.cos(x), r * Math.sin(x)]; }), N = 2 * n, v: number[] = [], tri: number[] = [];
        const z0 = both ? h : 0; // iki yüzlüde alt tepe z=0
        const thin = b <= 1e-6;
        p.forEach(([x, y]) => v.push(x, y, z0)); if (!thin) p.forEach(([x, y]) => v.push(x, y, z0 + b));
        const up = thin ? 0 : N, A = v.length / 3; v.push(0, 0, z0 + b + h, 0, 0, 0);
        for (let i = 0; i < N; i++) { const j = (i + 1) % N; tri.push(up + i, up + j, A, j, i, A + 1); if (!thin) tri.push(i, j, N + j, i, N + j, N + i); }
        return [T(new Manifold(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(v), triVerts: new Uint32Array(tri) })))];
      }
      case 'diamond': {
        const n = g('sides'), r = g('dia') / 2, tb = Math.min(g('table') / 2, r), c = g('crown'), p = g('pav'), gd = Math.min(0.4, c / 8);
        const lv = (rad: number, z: number, o: number, m = n): Vec3[] => ngon(rad, m, o).map(([x, y]) => [x, y, z] as Vec3);
        return [T(Manifold.hull([[0, 0, 0], ...lv(r, p, 0, 2 * n), ...lv(r, p + gd, 0, 2 * n), ...lv(tb + (r - tb) * 0.55, p + gd + (c - gd) * 0.6, Math.PI / n), ...(tb > 0 ? lv(tb, p + c, 0) : [[0, 0, p + c] as Vec3])]))];
      }
      case 'dice': {
        const s = g('size'), r = Math.min(g('r'), s / 2 - 0.01), k = s / 2 - r;
        let m: Manifold;
        if (r <= 0) m = T(Manifold.cube([s, s, s], true));
        else { const b = T(Manifold.sphere(r, g('seg'))), bs: Manifold[] = []; for (const x of [-k, k]) for (const y of [-k, k]) for (const z of [-k, k]) bs.push(at(b, x, y, z)); m = T(Manifold.hull(bs)); }
        if (t('pips') === 'yes') {
          const d = g('pip'), dep = g('depth'), q = s * 0.25, rad = ((d / 2) ** 2 + dep ** 2) / (2 * dep), ball = at(T(Manifold.sphere(rad, 32)), 0, 0, s / 2 - dep + rad);
          const L: Record<number, P2[]> = { 1: [[0, 0]], 2: [[-q, -q], [q, q]], 3: [[-q, -q], [0, 0], [q, q]], 4: [[-q, -q], [q, q], [-q, q], [q, -q]], 5: [[-q, -q], [q, q], [-q, q], [q, -q], [0, 0]], 6: [[-q, -q], [-q, 0], [-q, q], [q, -q], [q, 0], [q, q]] };
          const F: [number, Vec3][] = [[1, [0, 0, 0]], [6, [180, 0, 0]], [2, [90, 0, 0]], [5, [-90, 0, 0]], [3, [0, 90, 0]], [4, [0, -90, 0]]];
          m = sub(m, ...F.flatMap(([n, e]) => L[n].map(([x, y]) => rot(at(ball, x, y, 0), ...e))));
        }
        return [at(m, 0, 0, s / 2)];
      }
      case 'gear': return [gear(g('module'), g('teeth'), g('h'), g('bore'), g('angle'), g('backlash'))];
      case 'gearPair': {
        const m = g('module'), z1 = g('t1'), z2 = g('t2'), d = m * (z1 + z2) / 2, p = [g('h'), g('angle'), g('backlash')] as const;
        const A = gear(m, z1, p[0], g('b1'), p[1], p[2]), B = rot(gear(m, z2, p[0], g('b2'), p[1], p[2]), 0, 0, 180 + 180 / z2);
        return [A, at(B, d, 0, 0)];
      }
      case 'hinge': return hinge();
      case 'rail': return rail();
      case 'boxLid': return boxLid();
      case 'bolt': {
        const m = M(), gp = g('gap'), len = g('len'), d = m.d - gp, cut = m.pitch * 0.6;
        let body = thread(d, m.pitch, len);
        body = T(body.intersect(lathe([[0, 0], [d / 2, 0], [d / 2, len - cut], [d / 2 - cut, len], [0, len]], 64)));
        const hh = t('head');
        if (hh === 'none') return [body];
        const H = hh === 'hex' ? m.af * 0.64 : m.headH, head = hh === 'hex' ? hex(m.af, H) : sub(lathe([[0, 0], [m.head / 2, 0], [m.head / 2, H], [0, H]], 64, 0.4, 'chamfer', p => p[0] > 1 && p[1] < 0.1), hex(m.d * 0.82, H * 0.55));
        return [add(head, at(body, 0, 0, H - 0.01))];
      }
      case 'nut': {
        const m = M(), h = m.nut * g('scaleH'), gp = g('gap'), d = m.d + gp;
        const th = thread(d, m.pitch, h + 2), lead = (z: number, d1: number, d2: number) => at(cyl(d1, m.pitch, 64, d2), 0, 0, z), k = d + 0.3, kk = d - 1.2 * m.pitch;
        const outer = T(hex(m.af, h).intersect(lathe([[0, 0], [m.af / 2 * 1.02, 0], [m.af / 2 * 1.16, m.af * 0.08], [m.af / 2 * 1.16, h - m.af * 0.08], [m.af / 2 * 1.02, h], [0, h]], 96)));
        return [sub(outer, at(th, 0, 0, -1), lead(-0.01, k, kk), lead(h - m.pitch + 0.01, kk, k))];
      }
      case 'screwHole': {
        const m = M(), gp = g('gap'), dep = g('depth'), d = m.d + 2 * gp, hd = m.head + 2 * gp, kind = t('head');
        const shank = at(cyl(d, dep), 0, 0, -dep);
        if (kind === 'none') return [at(shank, 0, 0, dep)];
        const head = kind === 'round' ? cyl(hd, m.headH + gp) : cyl(d, (hd - d) / 2, 64, hd);
        return [at(add(shank, at(head, 0, 0, -0.001)), 0, 0, dep)];
      }
      case 'nutPocket': {
        const m = M(), gp = g('gap'), h = m.nut + g('extra'), af = m.af + 2 * gp, pk: Manifold[] = [hex(af, h)], s = g('slot');
        if (s > 0) pk.push(cube(0, -af / 2, 0, s, af / 2, h));
        if (g('through') > 0) pk.push(at(cyl(m.d + 2 * gp, g('through') + h), 0, 0, -g('through')));
        return [add(...pk)];
      }
      case 'insertHole': { const d = g('dia'), h = g('depth'), c = Math.min(g('lead'), h / 2); return [lathe([[0, 0], [d / 2, 0], [d / 2, h - c], [d / 2 + c, h], [0, h]], 64)]; }
      case 'tolTest': return tolTest();
    }
    return null;
  };
  function gear(mod: number, z: number, h: number, bore: number, angle: number, backlash: number): Manifold {
    const rp = mod * z / 2, ro = rp + mod, rr = Math.max(rp - 1.25 * mod, mod * 0.5), rb = rp * Math.cos(angle * R);
    if (bore / 2 > rr - 0.8) throw new Error(`Mil deliği çok büyük (en fazla ${(2 * (rr - 0.8)).toFixed(1)} mm)`);
    const inv = (r: number) => { const q = Math.acos(Math.min(1, rb / r)); return Math.tan(q) - q; };
    const half = Math.PI / (2 * z) - backlash / (4 * rp), wide = (r: number) => Math.max(0.002, half + inv(rp) - inv(Math.max(r, rb)));
    const start = Math.max(rb, rr), pts: Vec2[] = [], P = (r: number, q: number) => pts.push([r * Math.cos(q), r * Math.sin(q)]);
    for (let i = 0; i < z; i++) {
      const c = i * 2 * Math.PI / z, foot = Math.min(wide(start), Math.PI / z * 0.95);
      P(rr, c - foot);
      for (let k = 0; k <= 10; k++) { const r = start + (ro - start) * k / 10; P(r, c - Math.min(wide(r), foot)); }
      for (let k = 10; k >= 0; k--) { const r = start + (ro - start) * k / 10; P(r, c + Math.min(wide(r), foot)); }
      P(rr, c + foot);
    }
    let cs = T(CrossSection.ofPolygons([pts], 'NonZero'));
    if (bore > 0) cs = T(cs.subtract(T(CrossSection.circle(bore / 2, 64))));
    return ext(cs, h);
  }
  /** Yerinde basılan menteşe: koni uçlar karşı boğumdaki yuvada döner. */
  function hinge(): Manifold[] {
    const w = g('w'), leaf = g('leaf'), th = g('t'), rr = g('dia') / 2, gp = g('gap'); let n = g('knuckles'); if (n % 2 === 0) n++;
    if (th > rr) throw new Error('Kanat kalınlığı boğum yarıçapından büyük olamaz');
    const L = (w - (n - 1) * gp) / n, rc = rr - 1, hc = Math.min(rc - 0.2, L / 2 - 0.4);
    if (L < 3 || hc < 0.6) throw new Error('Boğumlar çok kısa: genişliği artır ya da boğum sayısını azalt');
    const X = (m: Manifold) => rot(m, 0, 90, 0); // Z ekseni -> X
    const sides: [Manifold[], Manifold[]] = [[], []], cuts: Manifold[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = -w / 2 + i * (L + gp), x1 = x0 + L, s = i % 2, y = s ? 1 : -1, far = y * (rr + gp + 0.01);
      sides[s].push(at(X(cyl(2 * rr, L, 64)), x0, 0, rr), cube(x0, Math.min(0, far), 0, x1, Math.max(0, far), th));
      if (s) continue;
      // çıkıntı: kök gövdeye biraz gömülü
      const cone = (out: number) => cyl(2 * (rc + out), hc + out, 48, 2 * (rc - hc));
      if (i < n - 1) { sides[0].push(at(X(cyl(2 * rc, hc, 48, 2 * (rc - hc))), x1 - 0.001, 0, rr)); cuts.push(at(X(cone(gp * 1.414)), x1, 0, rr)); }
      if (i > 0) { const back = (m: Manifold) => rot(m, 0, -90, 0); sides[0].push(at(back(cyl(2 * rc, hc, 48, 2 * (rc - hc))), x0 + 0.001, 0, rr)); cuts.push(at(back(cone(gp * 1.414)), x0, 0, rr)); }
    }
    const plate = (y: number) => { const a0 = rr + gp, a1 = a0 + leaf, p = cube(-w / 2, Math.min(y * a0, y * a1), 0, w / 2, Math.max(y * a0, y * a1), th), k = g('holes'), hd = g('hole'); if (!k) return p; return sub(p, ...Array.from({ length: k }, (_, i) => { const x = -w / 2 + w * (i + 0.5) / k, yy = y * (a0 + a1) / 2, sink = Math.min(hd / 2, th * 0.6); return at(add(at(cyl(hd, th + 2), 0, 0, -1), at(cyl(hd, sink + 0.01, 64, hd + 2 * sink), 0, 0, th - sink)), x, yy, 0); })); };
    return [add(...sides[0], plate(-1)), sub(add(...sides[1], plate(1)), ...cuts)];
  }
  /** Kırlangıç kuyruğu ray ve sürgü; hareket X boyunca. */
  function rail(): Manifold[] {
    const w = g('w') / 2, h = g('h'), b = g('base'), wall = g('wall'), gp = g('gap'), s = h * Math.tan(g('angle') * R), show = t('show'), neck = w - s;
    if (neck < 1) throw new Error('Ray dar: genişliği artır ya da eğimi azalt');
    const along = (p: Vec2[], len: number) => at(rot(rot(ext(poly(p), len), 90, 0, 0), 0, 0, 90), -len / 2, 0, 0); // kesit (y,z) -> X boyunca
    const bw = w + wall;
    const railM = () => { const tail: Vec2[] = [[-neck, b], [neck, b], [w, b + h], [-w, b + h]]; const body = along(tail, g('len')); return b > 0 ? add(body, cube(-g('len') / 2, -bw, 0, g('len') / 2, bw, b + 0.001)) : body; };
    const slideM = () => {
      const z0 = b + gp, z1 = b + h + gp + wall, k = gp / Math.cos(g('angle') * R), dz = 0.01;
      const at_ = (z: number) => neck + (z - b) * Math.tan(g('angle') * R) + k;
      const slot: Vec2[] = [[-at_(z0 - dz), z0 - dz], [at_(z0 - dz), z0 - dz], [at_(b + h + gp), b + h + gp], [-at_(b + h + gp), b + h + gp]];
      return sub(cube(-g('slide') / 2, -bw - k, z0, g('slide') / 2, bw + k, z1), along(slot, g('slide') + 2));
    };
    const out: Manifold[] = [];
    if (show !== 'slide') out.push(railM());
    if (show !== 'rail') {
      let m = slideM();
      if (t('layout') === 'side' || show === 'slide') { m = rot(m, 180, 0, 0); const bb = m.boundingBox(); m = at(m, 0, show === 'slide' ? 0 : bw + 4 - bb.min[1], -bb.min[2]); } // sırtı tablada: desteksiz
      out.push(m);
    }
    return out;
  }
  function boxLid(): Manifold[] {
    const w = g('w'), d = g('d'), h = g('h'), wall = g('wall'), r = g('r'), gp = g('gap'), lip = Math.min(g('lip'), h - wall), lt = g('lid'), show = t('show'), side = t('layout') === 'side';
    if (2 * wall + 2 > Math.min(w, d)) throw new Error('Duvar çok kalın');
    if (wall >= h) throw new Error('Yükseklik duvardan büyük olmalı');
    const out: Manifold[] = [], ri = Math.max(0, r - wall);
    if (show !== 'lid') out.push(sub(ext(rrect(w, d, r), h), at(ext(rrect(w - 2 * wall, d - 2 * wall, ri), h), 0, 0, wall)));
    if (show !== 'box') {
      const iw = w - 2 * wall - 2 * gp, id = d - 2 * wall - 2 * gp, rim = Math.min(wall, iw / 4, id / 4);
      const tongue = sub(ext(rrect(iw, id, Math.max(0, ri - gp)), lip + 0.001), at(ext(rrect(iw - 2 * rim, id - 2 * rim, Math.max(0, ri - gp - rim)), lip + 2), 0, 0, -0.5));
      const lid = add(ext(rrect(w, d, r), lt), at(tongue, 0, 0, lt - 0.001));
      out.push(side || show === 'lid' ? at(lid, show === 'lid' ? 0 : w + 5, 0, 0) : at(rot(lid, 180, 0, 0), 0, 0, h + lt));
    }
    return out;
  }
  /** Her yuvada kum saati biçimli, düşmeyen bir pim: hangisi dönüyorsa yazıcının boşluğu odur. */
  function tolTest(): Manifold[] {
    const n = g('count'), d = g('dia'), h = g('h'), cell = d + 6, W = n * cell, D = d + 14, waist = Math.min(d * 0.2, h * 0.4);
    const prof = (o: number, z0: number, z1: number): P2[] => [[0, z0], [d / 2 + o, z0], [d / 2 - waist + o, h / 2], [d / 2 + o, z1], [0, z1]];
    const holes: Manifold[] = [], pins: Manifold[] = [], y = 3;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + cell * (i + 0.5), gp = g('from') + g('step') * i;
      pins.push(at(sub(lathe(prof(0, 0, h), 64), cube(-d * 0.3, -0.8, h - 2, d * 0.3, 0.8, h + 1)), x, y, 0));
      holes.push(at(lathe([[0, -0.01], ...prof(gp, 0, h).slice(1, 4), [d / 2 + gp, h + 0.01], [0, h + 0.01]], 64), x, y, 0));
      const lb = T(a.label(gp.toFixed(2).replace(/0$/, ''), 4)); holes.push(at(ext(lb, 2), x, -D / 2 + 4.5, h - 0.6));
    }
    return [sub(ext(rrect(W + 2, D, 3), h), ...holes), ...pins];
  }

  let res: Manifold[] | null = null;
  try { res = make(); return res; } finally { const keep = new Set<Del>(res ?? []); for (const x of all) if (!keep.has(x)) x.delete(); }
}

/** 2B kesitli şekiller. */
export function profileOf(type: string, { g }: Args): P2[][] | null {
  const polar = (r: number, a: number): P2 => [r * Math.cos(a), r * Math.sin(a)];
  switch (type) {
    case 'polygon': { const n = g('sides'), o = n % 2 ? Math.PI / 2 : Math.PI / n; return [Array.from({ length: n }, (_, i) => polar(g('dia') / 2, o + i * 2 * Math.PI / n))]; }
    case 'star': { const n = g('points'); if (g('inner') >= g('dia')) throw new Error('İç çap dış çaptan küçük olmalı'); return [Array.from({ length: 2 * n }, (_, i) => polar((i % 2 ? g('inner') : g('dia')) / 2, Math.PI / 2 + i * Math.PI / n))]; }
    case 'heart': { const N = 160, k = g('w') / 32, p = Array.from({ length: N }, (_, i) => { const a = -i / N * 2 * Math.PI; return [16 * Math.sin(a) ** 3 * k, (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * k] as P2; }), ys = p.map(q => q[1]), c = (Math.min(...ys) + Math.max(...ys)) / 2; return [p.map(([x, y]) => [x, y - c])]; }
    case 'slice': {
      const ro = g('dia') / 2, ri = g('inner') / 2, an = g('angle') * R, N = Math.max(2, Math.ceil(g('seg') * g('angle') / 360));
      if (ri >= ro) throw new Error('İç çap dış çaptan küçük olmalı');
      const outer = Array.from({ length: N + 1 }, (_, i) => polar(ro, -an / 2 + an * i / N)), inner = ri > 0 ? Array.from({ length: N + 1 }, (_, i) => polar(ri, an / 2 - an * i / N)) : [[0, 0] as P2];
      return [[...outer, ...inner]];
    }
  }
  return null;
}
