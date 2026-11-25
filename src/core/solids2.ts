// 0.3 ile gelen şekiller ve mekanik parçalar.
import type { CrossSection, Manifold, ManifoldToplevel, Vec2, Vec3 } from 'manifold-3d';
import qrcode from 'qrcode-generator';
import { METRIC } from './shapes';
import type { P2 } from './corners';
import type { Args } from './solids';

const R = Math.PI / 180;
export const BEARINGS: Record<string, [number, number, number]> = { '608': [22, 8, 7], '625': [16, 5, 5], '623': [10, 3, 4], '688': [16, 8, 5], '6001': [28, 12, 8], '6202': [35, 15, 11], 'MR105': [10, 5, 4] };

/** 2B kesitli yeni şekiller (yükseltilir; pah ve efektler çalışır). */
export function profile2(type: string, { g, t }: Args): P2[][] | null {
  const ring = (rx: number, ry: number, n = 96, a0 = 0, a1 = 2 * Math.PI): P2[] => Array.from({ length: n }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [rx * Math.cos(a), ry * Math.sin(a)]; });
  switch (type) {
    case 'oval': return [ring(g('w') / 2, g('d') / 2, 128)];
    case 'arrow': { const L = g('len'), w = g('w') / 2, hl = Math.min(g('head'), L * 0.9), hw = Math.max(g('headW') / 2, w); return [[[-L / 2, -w], [L / 2 - hl, -w], [L / 2 - hl, -hw], [L / 2, 0], [L / 2 - hl, hw], [L / 2 - hl, w], [-L / 2, w]]]; }
    case 'cross': { const s = g('size') / 2, a = Math.min(g('arm'), g('size')) / 2; return [[[-a, -s], [a, -s], [a, -a], [s, -a], [s, a], [a, a], [a, s], [-a, s], [-a, a], [-s, a], [-s, -a], [-a, -a]]]; }
    case 'drop': { const r = g('w') / 2, h = Math.max(g('len'), r * 2.05), cy = -h / 2 + r, D = h - r, be = Math.acos(r / D), N = 72, pts: P2[] = []; for (let i = 0; i <= N; i++) { const q = be + (2 * Math.PI - 2 * be) * i / N; pts.push([r * Math.sin(q), cy + r * Math.cos(q)]); } pts.push([0, h / 2]); return [pts]; }
    case 'crescent': { const r = g('dia') / 2, o = Math.min(g('cut'), r * 1.9); const N = 160, outer = ring(r, r, N), inner = ring(r * 0.92, r * 0.92, N).map(([x, y]) => [x + o, y] as P2); return [outer, inner.reverse()]; }
    case 'bubble': { const w = g('w') / 2, h = g('dh') / 2, r = Math.min(g('r'), w, h), tl = g('tail'), pts: P2[] = []; const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 8; i++) { const a = a0 + Math.PI / 2 * i / 8; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
      arc(w - r, -h + r, -Math.PI / 2); arc(w - r, h - r, 0); arc(-w + r, h - r, Math.PI / 2); arc(-w + r, -h + r, Math.PI);
      const i0 = pts.findIndex(([x, y]) => y <= -h + 1e-6 && x < 0); pts.splice(i0 < 0 ? 0 : i0, 0, [-w * 0.1, -h], [-w * 0.45, -h - tl], [-w * 0.45, -h]); return [pts]; }
    case 'badge': { const n = g('points'), ro = g('dia') / 2, d = Math.min(g('depth'), ro * 0.4), N = n * 12; return [Array.from({ length: N }, (_, i) => { const a = i / N * 2 * Math.PI, r = ro - d * (0.5 - 0.5 * Math.cos(a * n)); return [r * Math.cos(a), r * Math.sin(a)] as P2; })]; }
    case 'spiral': { const turns = g('turns'), sp = g('pitch'), w = Math.min(g('w'), sp * 0.9) / 2, r0 = g('inner') / 2, N = Math.ceil(turns * 72), c: P2[] = [];
      for (let i = 0; i <= N; i++) { const a = i / 72 * 2 * Math.PI, r = r0 + sp * a / (2 * Math.PI); c.push([r * Math.cos(a), r * Math.sin(a)]); }
      const side = (s: number) => c.map(([x, y], i) => { const [px, py] = c[Math.max(0, i - 1)], [nx, ny] = c[Math.min(N, i + 1)], dx = nx - px, dy = ny - py, l = Math.hypot(dx, dy) || 1; return [x - dy / l * w * s, y + dx / l * w * s] as P2; });
      return [[...side(1), ...side(-1).reverse()]]; }
    case 'qr': return null;
  }
  return null;
}

export function buildSolids2(wasm: ManifoldToplevel, type: string, a: Args): { color?: string; m: Manifold }[] | null {
  const all: { delete(): void }[] = [], T = <X extends { delete(): void }>(x: X): X => { all.push(x); return x; };
  const { Manifold, CrossSection } = wasm, { g, t } = a;
  const poly = (p: Vec2[] | P2[], rule: 'Positive' | 'EvenOdd' = 'Positive') => T(CrossSection.ofPolygons([p as Vec2[]], rule));
  const ext = (c: CrossSection, h: number) => T(c.extrude(h));
  const at = (m: Manifold, x: number, y: number, z: number) => T(m.translate([x, y, z]));
  const rot = (m: Manifold, x: number, y: number, z: number) => T(m.rotate([x, y, z]));
  const cyl = (d: number, h: number, seg = 64, d2 = d) => T(Manifold.cylinder(h, d / 2, d2 / 2, seg));
  const cube = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => at(T(Manifold.cube([x1 - x0, y1 - y0, z1 - z0])), x0, y0, z0);
  const add = (...m: Manifold[]) => m.length === 1 ? m[0] : T(Manifold.union(m));
  const sub = (m: Manifold, ...o: Manifold[]) => o.length ? T(m.subtract(add(...o))) : m;
  const lathe = (pts: P2[], seg = 64) => T(poly(pts).revolve(seg));
  const ngon = (r: number, n: number, off = 0): Vec2[] => Array.from({ length: n }, (_, i) => [r * Math.cos(off + i * 2 * Math.PI / n), r * Math.sin(off + i * 2 * Math.PI / n)]);
  const hex = (af: number, h: number) => ext(poly(ngon(af / 2 / Math.cos(Math.PI / 6), 6)), h);
  const thread = (d: number, pitch: number, len: number, inner = false) => {
    const depth = pitch * 0.6, n = 60, pts: Vec2[] = Array.from({ length: n }, (_, i) => { const u = i / n, tri = Math.abs(2 * u - 1), k = Math.min(1, Math.max(0, (tri - 0.12) / 0.76)), r = inner ? d / 2 - depth + depth * (1 - k) : d / 2 - depth * k; return [r * Math.cos(u * 2 * Math.PI), r * Math.sin(u * 2 * Math.PI)]; });
    return T(poly(pts).extrude(len, Math.max(2, Math.ceil(len / pitch * 24)), 360 * len / pitch));
  };
  const one = (m: Manifold) => [{ m }];
  const make = (): { color?: string; m: Manifold }[] | null => {
    switch (type) {
      case 'capsule': { const r = g('dia') / 2, h = Math.max(g('h'), 2 * r + 0.02), N = 16, pts: P2[] = [[0, 0]]; for (let i = 1; i <= N; i++) { const q = -Math.PI / 2 + Math.PI / 2 * i / N; pts.push([r * Math.cos(q), r + r * Math.sin(q)]); } for (let i = 0; i < N; i++) { const q = Math.PI / 2 * i / N; pts.push([r * Math.cos(q), h - r + r * Math.sin(q)]); } pts.push([0, h]); return one(lathe(pts, g('seg'))); }
      case 'arch': { const w = g('w') / 2, h = g('h'), th = Math.min(g('t'), w * 0.9), dp = g('d'), N = 48; const o: P2[] = [[w, 0], ...Array.from({ length: N + 1 }, (_, i) => { const q = Math.PI * i / N; return [w * Math.cos(q), (h - w) + w * Math.sin(q)] as P2; }), [-w, 0]]; const wi = w - th, hi = h - th; const inn: P2[] = [[-wi, 0], ...Array.from({ length: N + 1 }, (_, i) => { const q = Math.PI * (1 - i / N); return [wi * Math.cos(q), Math.max(0, hi - wi) + wi * Math.sin(q)] as P2; }), [wi, 0]]; const shape = T(T(CrossSection.ofPolygons([o as Vec2[]], 'Positive')).subtract(poly(inn))); return one(at(rot(ext(shape, dp), 90, 0, 0), 0, dp / 2, 0)); }
      case 'spring': {
        const R0 = g('coil') / 2, r = g('wire') / 2, p = Math.max(g('pitch'), 2 * r + 0.2), n = g('turns'), steps = Math.ceil(n * 48), seg = 12, v: number[] = [], tri: number[] = [];
        if (r >= R0) throw new Error('Tel kalınlığı yay çapından küçük olmalı');
        for (let i = 0; i <= steps; i++) {
          const a = i / 48 * 2 * Math.PI, c: Vec3 = [R0 * Math.cos(a), R0 * Math.sin(a), r + p * a / (2 * Math.PI)], tg = [-R0 * Math.sin(a), R0 * Math.cos(a), p / (2 * Math.PI)], tl = Math.hypot(...tg), T0 = tg.map(x => x / tl), N0 = [Math.cos(a), Math.sin(a), 0], B = [T0[1] * N0[2] - T0[2] * N0[1], T0[2] * N0[0] - T0[0] * N0[2], T0[0] * N0[1] - T0[1] * N0[0]];
          for (let k = 0; k < seg; k++) { const q = k / seg * 2 * Math.PI; for (let j = 0; j < 3; j++) v.push(c[j] + r * (Math.cos(q) * N0[j] + Math.sin(q) * B[j])); }
        }
        for (let i = 0; i < steps; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + (k + 1) % seg, c = a + seg, d = b + seg; tri.push(a, c, b, b, c, d); }
        const end = (i: number, flip: boolean) => { const ci = v.length / 3; let cx = 0, cy = 0, cz = 0; for (let k = 0; k < seg; k++) { cx += v[(i * seg + k) * 3] / seg; cy += v[(i * seg + k) * 3 + 1] / seg; cz += v[(i * seg + k) * 3 + 2] / seg; } v.push(cx, cy, cz); for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + (k + 1) % seg; if (flip) tri.push(ci, b, a); else tri.push(ci, a, b); } };
        end(0, false); end(steps, true);
        for (let i = 0; i < tri.length; i += 3) [tri[i + 1], tri[i + 2]] = [tri[i + 2], tri[i + 1]]; // dışa dönük
        let m = T(new Manifold(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(v), triVerts: new Uint32Array(tri) })));
        if (t('ends') === 'flat') { const top = r + p * n; m = T(m.intersect(cube(-R0 - r - 1, -R0 - r - 1, r * 0.6, R0 + r + 1, R0 + r + 1, top + r - r * 0.6))); m = at(m, 0, 0, -r * 0.6); }
        return one(m);
      }
      case 'hexGrid': {
        const w = g('w'), d = g('d'), h = g('h'), c = g('cell'), wall = g('wall'), bd = g('border'), af = c - wall;
        if (af <= 0.4) throw new Error('Hücre duvardan büyük olmalı');
        const holes: Manifold[] = [], dx = c * Math.sqrt(3) / 2 * 2 / Math.sqrt(3), cols = Math.ceil(w / dx) + 2, rows = Math.ceil(d / c) + 2;
        const inner = T(CrossSection.square([w - 2 * bd, d - 2 * bd], true)), hx = T(CrossSection.ofPolygons([ngon(af / Math.sqrt(3), 6, 0)], 'Positive'));
        const cells: CrossSection[] = [];
        for (let i = -cols; i <= cols; i++) for (let j = -rows; j <= rows; j++) { const x = i * c * Math.sqrt(3) / 2, y = j * c + (i % 2 ? c / 2 : 0); if (Math.abs(x) < w / 2 + c && Math.abs(y) < d / 2 + c) cells.push(T(hx.translate([x, y]))); }
        const pat = T(T(CrossSection.union(cells)).intersect(inner)); void holes;
        return one(sub(at(T(Manifold.cube([w, d, h], true)), 0, 0, h / 2), at(ext(pat, h + 2), 0, 0, -1)));
      }
      case 'qr': {
        const q = qrcode(0, (t('ecc') || 'M') as 'L' | 'M' | 'Q' | 'H'); q.addData(t('text') || ' ', 'Byte'); q.make();
        const nMod = q.getModuleCount(), quiet = g('margin'), size = g('size'), k = size / (nMod + 2 * quiet), hb = g('base'), hm = g('h'), sq: Vec2[][] = [];
        for (let r = 0; r < nMod; r++) for (let c = 0; c < nMod; c++) if (q.isDark(r, c)) { const x = (c + quiet) * k - size / 2, y = size / 2 - (r + quiet) * k; sq.push([[x, y - k], [x + k, y - k], [x + k, y], [x, y]]); }
        const dark = T(T(CrossSection.ofPolygons(sq, 'NonZero')).simplify(1e-4)), out: { color?: string; m: Manifold }[] = [];
        if (hb > 0) out.push({ color: '#ffffff', m: at(T(Manifold.cube([size, size, hb], true)), 0, 0, hb / 2) });
        out.push({ color: '#222222', m: at(ext(dark, hm + (hb > 0 ? 0.01 : 0)), 0, 0, hb > 0 ? hb - 0.01 : 0) });
        return out;
      }
      // --- mekanik ---
      case 'magnetHole': { const d = g('dia') + 2 * g('gap'), h = g('h') + g('gap'), c = Math.min(g('lead'), h / 2); return one(lathe([[0, -0.01], [d / 2 + c, -0.01], [d / 2, c], [d / 2, h], [0, h]], 96)); }
      case 'bearingSeat': { const b = BEARINGS[t('bearing')]; if (!b) throw new Error('Bilinmeyen rulman'); const [od, , w] = b, gp = g('gap'), lip = g('lip'), sh = g('shaft'); const pr: P2[] = [[0, -0.01], [od / 2 + gp, -0.01], [od / 2 + gp, w + gp], ...(lip > 0 ? [[od / 2 - lip, w + gp], [od / 2 - lip, w + gp + 0.6]] as P2[] : []), [sh > 0 ? sh / 2 : 0, lip > 0 ? w + gp + 0.6 : w + gp]]; if (sh > 0) pr.push([sh / 2, w + gp + 20], [0, w + gp + 20]); else pr.push([0, w + gp]); return one(lathe(pr, 96)); }
      case 'knob': {
        const d = g('dia'), h = g('h'), n = g('knurls'), dep = Math.min(d * 0.08, 1.2), m = METRIC[t('size')], N = n * 8;
        const prof = Array.from({ length: N }, (_, i) => { const a = i / N * 2 * Math.PI, r = d / 2 - dep * (0.5 - 0.5 * Math.cos(a * n)); return [r * Math.cos(a), r * Math.sin(a)] as Vec2; });
        let body = ext(poly(prof), h);
        body = T(body.intersect(lathe([[0, 0], [d / 2 + 1, 0], [d / 2 + 1, h - 1], [d / 2 - 0.2, h], [0, h]], 96)));
        if (m) { const af = m.af + 2 * g('gap'); body = sub(body, at(hex(af, m.nut + 0.4), 0, 0, -0.01), at(cyl(m.d + 2 * g('gap'), h + 2), 0, 0, -1)); }
        return one(body);
      }
      case 'snapClip': {
        const L = g('len'), th = g('t'), w = g('w'), b = g('barb'), base = g('base'), x1 = base + L;
        const beam = ext(poly([[0, 0], [x1, 0], [x1, th + 0.2], [x1 - b * 2, th + b], [x1 - b * 2, th], [0, th]]), w);
        return one(add(at(rot(beam, 90, 0, 0), 0, w / 2, 0), cube(0, -w / 2, 0, base, w / 2, th * 2.5)));
      }
      case 'cableClip': {
        const cd = g('cable') + 2 * g('gap'), n = g('count'), wall = g('wall'), bh = g('base'), w = g('w'), op = cd * 0.78, pitch = cd + wall;
        const parts: Manifold[] = [], width = n * pitch + wall;
        parts.push(cube(-width / 2, -w / 2, 0, width / 2, w / 2, bh));
        const holes: Manifold[] = [];
        for (let i = 0; i < n; i++) { const x = -width / 2 + wall + cd / 2 + i * pitch, cz = bh + cd / 2; parts.push(at(rot(cyl(cd + 2 * wall, w, 64), 90, 0, 0), x, w / 2, cz)); holes.push(at(rot(cyl(cd, w + 2, 64), 90, 0, 0), x, w / 2 + 1, cz), cube(x - op / 2, -w, cz, x + op / 2, w, cz + cd)); }
        if (g('screw') > 0) holes.push(at(cyl(g('screw'), bh + 2, 32), width / 2 - 4, 0, -1));
        let m = sub(add(...parts), ...holes);
        if (g('screw') > 0) m = add(m, cube(width / 2 - 0.01, -w / 2, 0, width / 2 + 8, w / 2, bh)); m = g('screw') > 0 ? sub(m, at(cyl(g('screw'), bh + 2, 32), width / 2 + 4, 0, -1)) : m;
        return one(m);
      }
      case 'livingHinge': { const w = g('w'), L = g('leaf'), th = g('t'), web = g('web'), gapL = g('span'); return one(add(cube(-gapL / 2 - L, -w / 2, 0, -gapL / 2, w / 2, th), cube(gapL / 2, -w / 2, 0, gapL / 2 + L, w / 2, th), cube(-gapL / 2 - 0.5, -w / 2, 0, gapL / 2 + 0.5, w / 2, web))); }
      case 'jar': {
        const D = g('dia'), H = g('h'), wall = g('wall'), p = g('pitch'), gp = g('gap'), show = t('show'), Hn = Math.min(12, H * 0.3), dm = D - 2 * wall, ri = dm / 2 - p * 0.6 - wall, out: { m: Manifold }[] = [];
        if (ri < 2) throw new Error('Kavanoz çok dar ya da duvar çok kalın');
        if (show !== 'lid') { const body = add(cyl(D, H - Hn, 96), at(thread(dm, p, Hn), 0, 0, H - Hn - 0.01)); out.push({ m: sub(body, at(cyl(2 * ri, H, 96), 0, 0, wall)) }); }
        if (show !== 'jar') { const lid = sub(cyl(D + 2 * wall, Hn + wall, 96), at(thread(dm + 2 * gp, p, Hn + 1), 0, 0, wall)); out.push({ m: show === 'lid' ? lid : at(lid, D + wall * 2 + 6, 0, 0) }); }
        return out;
      }
      case 'rack': {
        const m = g('module'), n = g('teeth'), w = g('h'), base = g('base'), p = Math.PI * m, a = g('angle') * R, ad = m, de = 1.25 * m, tp: Vec2[] = [[0, 0]];
        for (let i = 0; i < n; i++) { const x0 = i * p, hw = p / 4; const tanA = Math.tan(a); tp.push([x0 + p / 2 - hw - de * tanA, base], [x0 + p / 2 - hw + ad * tanA, base + de + ad], [x0 + p / 2 + hw - ad * tanA, base + de + ad], [x0 + p / 2 + hw + de * tanA, base]); }
        tp.push([n * p, base], [n * p, 0]);
        return one(at(rot(ext(poly(tp.map(([x, y]) => [x, y] as Vec2), 'EvenOdd'), w), 90, 0, 0), -n * p / 2, w / 2, 0));
      }
      case 'pulley': {
        const n = g('teeth'), bw = g('belt'), bore = g('bore'), fl = g('flange'), pd = n * 2 / Math.PI, od = pd - 0.508, toothW = 1.1, toothD = 0.75;
        let core = cyl(od, bw, 2 * n * 4);
        const grooves: Manifold[] = []; for (let i = 0; i < n; i++) grooves.push(rot(at(T(Manifold.cube([toothD * 2, toothW, bw + 2], true)), od / 2, 0, bw / 2), 0, 0, i * 360 / n));
        core = sub(core, ...grooves);
        const parts = [at(core, 0, 0, fl > 0 ? 1 : 0)]; if (fl > 0) { parts.push(cyl(od + 2 * fl, 1, 96), at(cyl(od + 2 * fl, 1, 96), 0, 0, bw + 1)); }
        const hub = g('hub'); if (hub > 0) parts.push(at(cyl(Math.max(bore + 6, od * 0.7), hub, 64), 0, 0, bw + (fl > 0 ? 2 : 0)));
        const total = bw + (fl > 0 ? 2 : 0) + hub;
        return one(sub(add(...parts), at(cyl(bore, total + 2, 48), 0, 0, -1)));
      }
      case 'ballJoint': {
        const rb = g('ball') / 2, gp = g('gap'), L = g('stem'), wall = Math.max(1.6, rb * 0.36), od = 2 * (rb + gp + wall), c = od * 0.36 + 1;
        let sock = sub(at(T(Manifold.sphere(od / 2, 64)), 0, 0, c), at(T(Manifold.sphere(rb + gp, 64)), 0, 0, c));
        sock = T(sock.intersect(cube(-od, -od, 1, od, od, c + rb * 0.6)));
        sock = add(sock, cyl(od * 0.8, 1.01, 64));
        const ball = add(at(T(Manifold.sphere(rb, 64)), 0, 0, c), at(cyl(rb * 0.5, L + rb, 48), 0, 0, c));
        return [{ m: sock }, { m: ball }];
      }
      case 'lBracket': {
        const w = g('w'), L = g('leg'), th = g('t'), hd = g('hole'), gus = t('gusset') === 'yes';
        let m = add(cube(0, -w / 2, 0, L, w / 2, th), cube(0, -w / 2, 0, th, w / 2, L));
        if (gus) m = add(m, at(rot(ext(poly([[th, th], [L * 0.6, th], [th, L * 0.6]]), Math.min(3, w / 4)), 90, 0, 0), 0, Math.min(3, w / 4) / 2, 0));
        if (hd > 0) { const hs: Manifold[] = []; for (const s of w > 30 ? [-w / 4, w / 4] : [0]) { hs.push(at(cyl(hd, th + 2, 32), L * 0.65 + th * 0.35, s, -1)); hs.push(at(rot(cyl(hd, th + 2, 32), 0, 90, 0), -1, s, L * 0.65 + th * 0.35)); } m = sub(m, ...hs); }
        return one(m);
      }
      case 'tNut': {
        const m = METRIC[t('size')] ?? METRIC.m5, s = g('slot'), gp = g('gap'), L = g('len'), wTop = s - 2 * gp, wBot = s * 1.9, h1 = 1.8, h2 = 2.6;
        const pr: Vec2[] = [[-wTop / 2, 0], [wTop / 2, 0], [wTop / 2, h1], [wBot / 2 - h2 * 0.6, h1], [wBot / 2, h1 + h2 * 0.5], [0, h1 + h2 * 1.2], [-wBot / 2, h1 + h2 * 0.5], [-wBot / 2 + h2 * 0.6, h1]];
        const body = at(rot(ext(poly(pr), L), 90, 0, 0), 0, L / 2, 0);
        return one(sub(body, at(cyl(m.d * 0.85, 20, 32), 0, 0, -5)));
      }
    }
    return null;
  };
  let res: { color?: string; m: Manifold }[] | null = null;
  try { res = make(); return res; } finally { const keep = new Set(res?.map(r => r.m) ?? []); for (const x of all) if (!keep.has(x as Manifold)) x.delete(); }
}
