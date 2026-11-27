// Efekt araçları (Corel efekt araç menüsü gibi): araç çubuğu menüsü, ekrandaki tutamaçlar ve sağ paneldeki ayarlar.
import type { PointerEvent as PE, ReactNode } from 'react';
import { Droplet, Frame, Grid3x3, ScanLine, Spline, SquareRoundCorner, X } from 'lucide-react';
import * as V from './vector';
import * as Fx from './vectorFx';
import { IcoBlend, IcoBlock, IcoContourIn, IcoContourOut, IcoDistort, IcoEnvelope, IcoInner, IcoJoinBevel, IcoJoinMiter, IcoJoinRound, IcoOffset, IcoPush, IcoShadow, IcoShadowFlat, IcoShadowPersp, IcoSteps, IcoTransp, IcoTwist, IcoZipper, IcoEnvLine, IcoEnvArc, IcoEnvDouble, IcoEnvFree } from './vecIcons';

type P = V.V;
export type FxKey = 'shadow' | 'inner' | 'block' | 'contour' | 'env' | 'distort' | 'transp' | 'blend' | 'corners' | 'pattern' | 'clip' | 'path' | 'trace';
/** live: ekranda sürükleyerek uygulanan araç; diğerleri sağ panelde işlem düğmesi. free: yalnız serbest çizimde (baskı efekti). */
export const FX_TOOLS: { k: FxKey; label: string; tip: string; I: () => ReactNode; live?: boolean; free?: boolean }[] = [
  { k: 'shadow', label: 'Gölge', tip: 'Nesnenin ortasından sürükle: gölge; alt kenarından sürükle: perspektif gölge', I: IcoShadow, live: true, free: true },
  { k: 'inner', label: 'İç gölge', tip: 'Nesnenin içinde sürükle: iç gölgenin yönü ve uzaklığı', I: IcoInner, live: true, free: true },
  { k: 'block', label: 'Blok gölge', tip: 'Sürükle: düz vektör gölgenin yönü ve derinliği (lazer / UV için)', I: IcoBlock, live: true },
  { k: 'contour', label: 'Kontür', tip: 'Dışa sürükle: dış kontür, içe sürükle: iç kontür', I: IcoContourOut, live: true },
  { k: 'env', label: 'Zarf', tip: 'Nesneye tıkla, köşe ve kenar tutamaçlarını sürükle', I: IcoEnvelope, live: true },
  { k: 'distort', label: 'Bozma', tip: 'İtme / çekme, fermuar, girdap: nesne üstünde sürükle', I: IcoDistort, live: true },
  { k: 'transp', label: 'Şeffaflık', tip: 'Nesne üstünde sürükle: geçişli şeffaflık', I: IcoTransp, live: true, free: true },
  { k: 'blend', label: 'Geçiş', tip: 'Bir nesneden öbürüne sürükle: aradaki geçiş şekilleri', I: IcoBlend, live: true },
  { k: 'corners', label: 'Köşeler', tip: 'Köşelere pah ya da yuvarlatma', I: () => <SquareRoundCorner /> },
  { k: 'pattern', label: 'Desen', tip: 'Seçiliden desen dolgu oluştur', I: () => <Grid3x3 /> },
  { k: 'clip', label: 'PowerClip', tip: 'Nesneleri bir kabın içine yerleştir', I: () => <Frame /> },
  { k: 'path', label: 'Yola oturt', tip: 'Yazıyı bir yolun üstüne oturt', I: () => <Spline /> },
  { k: 'trace', label: 'Vektöre çevir', tip: 'Resmi vektöre çevir', I: () => <ScanLine /> },
];

const box = (it: V.Item) => V.bounds([it]) ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
const mid = (it: V.Item): P => { const b = box(it); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };
const r2 = (x: number) => Math.round(x * 100) / 100;
export const setFx = (it: V.Item, patch: Partial<V.Fx>): V.Item => { const fx: V.Fx = { ...it.fx, ...patch }; for (const k of Object.keys(fx) as (keyof V.Fx)[]) if (fx[k] === undefined) delete fx[k]; return Fx.regeo({ ...it, fx: Object.keys(fx).length ? fx : undefined }); };
/** Geometri efekti başlarken: yazı eğriye çevrilir, öbür geometri efekti kalıcı olur. */
const geoBase = (it: V.Item, keep: 'env' | 'distort'): V.Item => { const fx = { ...it.fx }; if (keep === 'env') delete fx.distort; else delete fx.env; return { ...it, text: undefined, fx }; };

export interface FxDefaults { color: string; stroke: string; contour: { dist: number; steps: number; dir: 'out' | 'in'; join: 'Miter' | 'Round' | 'Square'; filled: boolean }; distort: V.DistortFx['kind']; env: Fx.EnvPreset; envAmt: number }
/** Araçla nesne üstünde sürükleme: efekti oluşturur ve sürüklemeyle ayarlar. */
export function fxCreate(k: FxKey, it: V.Item, p0: P, d: FxDefaults): ((x: number, y: number) => V.Item) | null {
  const b = box(it), c = mid(it);
  if (k === 'shadow') { const persp = p0[1] > b.y1 - (b.y1 - b.y0) * 0.2, a: P = persp ? [c[0], b.y1] : c, s0 = it.shadow ?? { dx: 0, dy: 0, blur: 2, color: d.color, opacity: 0.5 }; return (x, y) => ({ ...it, shadow: { ...s0, persp, dx: r2(x - a[0]), dy: r2(y - (persp ? b.y0 : a[1])) } }); }
  if (k === 'inner') { const q0 = it.fx?.inner ?? { dx: 0, dy: 0, size: 2, color: d.color, opacity: 0.6 }; return (x, y) => setFx(it, { inner: { ...q0, dx: r2(x - p0[0]), dy: r2(y - p0[1]) } }); }
  if (k === 'block') { const q0 = it.fx?.block ?? { dx: 0, dy: 0, color: d.color }; return (x, y) => setFx(it, { block: { ...q0, dx: r2(x - p0[0]), dy: r2(y - p0[1]) } }); }
  if (k === 'contour') { const r0 = Math.hypot(p0[0] - c[0], p0[1] - c[1]), q0 = it.fx?.contour ?? { ...d.contour, color: d.stroke }; return (x, y) => { const r = Math.hypot(x - c[0], y - c[1]), t = r - r0; return Math.abs(t) < 0.3 ? it : setFx(it, { contour: { ...q0, dir: t > 0 ? 'out' : 'in', dist: r2(Math.max(0.1, Math.abs(t) / q0.steps)) } }); }; }
  if (k === 'env') { if (it.fx?.env) return null; const g = geoBase(it, 'env'), e = Fx.envNew(g.subs); if (!e) return null; const done = setFx(g, { env: e }); return () => done; }
  if (k === 'distort') {
    const g = geoBase(it, 'distort'), src = it.fx?.distort?.src ?? g.subs, q0: V.DistortFx = it.fx?.distort ?? { src, kind: d.distort, amt: 0, freq: 8, c }, w = Math.max(b.x1 - b.x0, b.y1 - b.y0) || 1;
    let ang = 0, last = Math.atan2(p0[1] - q0.c[1], p0[0] - q0.c[0]);
    return (x, y) => {
      if (q0.kind === 'push') return setFx(g, { distort: { ...q0, amt: r2(Math.max(-0.95, Math.min(1.5, (x - p0[0]) / w * 2))) } });
      if (q0.kind === 'zipper') return setFx(g, { distort: { ...q0, amt: r2(Math.min(w / 4, Math.hypot(x - p0[0], y - p0[1]) / 4)) } });
      const a = Math.atan2(y - q0.c[1], x - q0.c[0]); let da = a - last; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; last = a; ang += da;
      return setFx(g, { distort: { ...q0, amt: Math.round(q0.amt + ang * 180 / Math.PI) } });
    };
  }
  if (k === 'transp') return (x, y) => Math.hypot(x - p0[0], y - p0[1]) < 0.5 ? it : setFx(it, { transp: { a: p0, b: [r2(x), r2(y)], from: it.fx?.transp?.from ?? 0, to: it.fx?.transp?.to ?? 1 } });
  return null;
}

/** Ekrandaki tutamaçlar. drag(e, f): sürüklemede f(x, y) yeni nesneyi verir. */
export function FxHandles({ k, it, px, drag }: { k: FxKey; it: V.Item; px: number; drag(e: PE, f: (x: number, y: number) => V.Item): void }) {
  const r = 4.5 * px, b = box(it), c = mid(it), sq = (p: P, f: (x: number, y: number) => V.Item, cls = '', title?: string) => <rect className={'fxh ' + cls} x={p[0] - r} y={p[1] - r} width={2 * r} height={2 * r} strokeWidth={px} onPointerDown={e => drag(e, f)}>{title && <title>{title}</title>}</rect>;
  const dot = (p: P, f: (x: number, y: number) => V.Item, cls = '', title?: string) => <circle className={'fxh ' + cls} cx={p[0]} cy={p[1]} r={r * 0.9} strokeWidth={px} onPointerDown={e => drag(e, f)}>{title && <title>{title}</title>}</circle>;
  const ln = (a: P, q: P) => <line className="fxl" x1={a[0]} y1={a[1]} x2={q[0]} y2={q[1]} strokeWidth={px} strokeDasharray={`${3 * px} ${2 * px}`} />;
  const g = (els: ReactNode) => <g className="fx-handles">{els}</g>;
  if (k === 'shadow' && it.shadow) {
    const s = it.shadow, a: P = s.persp ? [c[0], b.y1] : c, e: P = s.persp ? [c[0] + s.dx, b.y0 + s.dy] : [c[0] + s.dx, c[1] + s.dy], len = Math.hypot(e[0] - a[0], e[1] - a[1]) || 1, t = 0.15 + 0.7 * s.opacity, m: P = [a[0] + (e[0] - a[0]) * t, a[1] + (e[1] - a[1]) * t];
    return g(<>{ln(a, e)}{sq(a, () => it, 'start', 'Gölgenin başladığı yer')}
      {sq(e, (x, y) => ({ ...it, shadow: { ...s, dx: r2(x - a[0]), dy: r2(y - (s.persp ? b.y0 : a[1])) } }), 'end', 'Sürükle: gölgenin yönü ve uzaklığı')}
      <rect className="fxh slider" x={m[0] - r * 0.8} y={m[1] - r * 0.8} width={1.6 * r} height={1.6 * r} strokeWidth={px} transform={`rotate(45 ${m[0]} ${m[1]})`} onPointerDown={ev => drag(ev, (x, y) => { const q = ((x - a[0]) * (e[0] - a[0]) + (y - a[1]) * (e[1] - a[1])) / (len * len); return { ...it, shadow: { ...s, opacity: r2(Math.max(0, Math.min(1, (q - 0.15) / 0.7))) } }; })}><title>Kaydır: gölgenin koyuluğu</title></rect></>);
  }
  if ((k === 'inner' && it.fx?.inner) || (k === 'block' && it.fx?.block)) {
    const q = (k === 'inner' ? it.fx!.inner! : it.fx!.block!), e: P = [c[0] + q.dx, c[1] + q.dy];
    return g(<>{ln(c, e)}{sq(c, () => it, 'start')}{sq(e, (x, y) => setFx(it, { [k]: { ...q, dx: r2(x - c[0]), dy: r2(y - c[1]) } }), 'end', 'Sürükle: yön ve uzaklık')}</>);
  }
  if (k === 'contour' && it.fx?.contour) {
    const q = it.fx.contour, tot = q.dist * q.steps * (q.dir === 'out' ? 1 : -1), h: P = [b.x1 + tot, c[1]];
    return g(<>{ln([b.x1, c[1]], h)}{sq([b.x1, c[1]], () => it, 'start')}{sq(h, x => { const t = x - b.x1; return Math.abs(t) < 0.2 ? it : setFx(it, { contour: { ...q, dir: t > 0 ? 'out' : 'in', dist: r2(Math.max(0.1, Math.abs(t) / q.steps)) } }); }, 'end', 'Sürükle: dışa ya da içe kontür aralığı')}</>);
  }
  if (k === 'env' && it.fx?.env) {
    const env = it.fx.env, hs = Fx.envHandles(env);
    return g(<><path className="fxl env" d={Fx.envOutline(env)} strokeWidth={px} fill="none" strokeDasharray={`${4 * px} ${3 * px}`} />
      {hs.map(h => { const f = (x: number, y: number, x0: number, y0: number) => setFx(it, { env: Fx.envDrag(env, env, h.id, [x - x0, y - y0]) }); const start = (e: PE) => { const x0 = h.p[0], y0 = h.p[1]; drag(e, (x, y) => f(x, y, x0, y0)); };
        return <g key={h.id}>{h.from && ln(h.from, h.p)}{h.kind === 'corner' ? <rect className="fxh" x={h.p[0] - r} y={h.p[1] - r} width={2 * r} height={2 * r} strokeWidth={px} onPointerDown={start} /> : <circle className={'fxh ' + h.kind} cx={h.p[0]} cy={h.p[1]} r={r * 0.85} strokeWidth={px} onPointerDown={start} />}</g>; })}</>);
  }
  if (k === 'distort' && it.fx?.distort) {
    const q = it.fx.distort, w = Math.max(b.x1 - b.x0, b.y1 - b.y0), R = w * 0.35;
    const hp: P = q.kind === 'push' ? [q.c[0] + q.amt * w * 0.5, q.c[1]] : q.kind === 'zipper' ? [q.c[0], q.c[1] - q.amt * 4] : [q.c[0] + R * Math.cos(q.amt * Math.PI / 180), q.c[1] + R * Math.sin(q.amt * Math.PI / 180)];
    let last = q.amt * Math.PI / 180, acc = q.amt;
    return g(<>{ln(q.c, hp)}
      <rect className="fxh center" x={q.c[0] - r} y={q.c[1] - r} width={2 * r} height={2 * r} strokeWidth={px} transform={`rotate(45 ${q.c[0]} ${q.c[1]})`} onPointerDown={e => drag(e, (x, y) => setFx(it, { distort: { ...q, c: [r2(x), r2(y)] } }))}><title>Bozmanın merkezi</title></rect>
      {sq(hp, (x, y) => { if (q.kind === 'push') return setFx(it, { distort: { ...q, amt: r2(Math.max(-0.95, Math.min(1.5, (x - q.c[0]) / (w * 0.5)))) } }); if (q.kind === 'zipper') return setFx(it, { distort: { ...q, amt: r2(Math.max(0, (q.c[1] - y) / 4)) } }); const a = Math.atan2(y - q.c[1], x - q.c[0]); let da = a - last; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; last = a; acc += da * 180 / Math.PI; return setFx(it, { distort: { ...q, amt: Math.round(acc) } }); }, 'end', 'Sürükle: bozma miktarı')}</>);
  }
  if (k === 'transp' && it.fx?.transp) {
    const t = it.fx.transp;
    return g(<>{ln(t.a, t.b)}{sq(t.a, (x, y) => setFx(it, { transp: { ...t, a: [r2(x), r2(y)] } }), 'tw', 'Başlangıç (opak)')}{sq(t.b, (x, y) => setFx(it, { transp: { ...t, b: [r2(x), r2(y)] } }), 'tb', 'Bitiş (saydam)')}</>);
  }
  return null;
}

/** Zarf biçimlerinin önizlemesi: yazı satırlarını temsil eden çizgiler gerçekten bükülür. */
export function EnvPreview({ kind }: { kind: Fx.EnvPreset }) {
  const src: V.Sub[] = [V.rectSub(3, 5, 18, 14)], e = Fx.envPreset(Fx.envNew(src)!, kind, kind === 'persp' ? 0.9 : 0.6), f = Fx.envMap(e);
  const path = (pts: P[]) => 'M' + pts.map(p => f(p[0], p[1]).map(v => Math.round(v * 100) / 100).join(' ')).join('L');
  const lines = [8.5, 12, 15.5].map(y => path(Array.from({ length: 13 }, (_, i) => [5.5 + i * 13 / 12, y] as P)));
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeLinecap="round"><path d={Fx.envOutline(e)} strokeWidth="1.5" fill="currentColor" fillOpacity={0.12} />{lines.map((d, i) => <path key={i} d={d} strokeWidth="1.2" opacity={0.7} />)}</svg>;
}
export const ENV_PRESETS: [Fx.EnvPreset, string][] = [['arc', 'Kavis'], ['arcTop', 'Üstten kavis'], ['arcBottom', 'Alttan kavis'], ['wave', 'Dalga'], ['flag', 'Bayrak'], ['bulge', 'Şişir'], ['pinch', 'Daralt'], ['persp', 'Perspektif']];

interface PanelProps { k: FxKey; it: V.Item; set(f: (x: V.Item) => V.Item, record?: boolean): void; commit(): void; color(label: string, value: string, onChange: (c: string) => void, id: string): ReactNode; defaults: FxDefaults; setDefaults(d: Partial<FxDefaults>): void; free: boolean }
const Num = ({ I, v, on, unit, step = 0.1, min, max, title }: { I: () => ReactNode; v: number; on(x: number): void; unit: string; step?: number; min?: number; max?: number; title: string }) => <label className="ifield" title={title}><I /><input type="number" step={step} min={min} max={max} value={v} onChange={e => on(Math.max(min ?? -1e9, Math.min(max ?? 1e9, +e.target.value || 0)))} /><i>{unit}</i></label>;
const Slide = ({ label, v, on, done, min = 0, max = 100, unit = '%' }: { label: string; v: number; on(x: number): void; done(): void; min?: number; max?: number; unit?: string }) => <label className="islide"><span>{label}<em>{Math.round(v)}{unit}</em></span><input type="range" min={min} max={max} value={v} onChange={e => on(+e.target.value)} onPointerUp={done} /></label>;
const Seg = <T extends string>({ v, opts, on, label }: { v: T; opts: [T, string, () => ReactNode][]; on(x: T): void; label: string }) => <div className="icon-seg" role="radiogroup" aria-label={label}>{opts.map(([q, l, I]) => <button key={q} role="radio" aria-checked={v === q} className={v === q ? 'on' : ''} title={l} onClick={() => on(q)}><I /><span>{l}</span></button>)}</div>;
const IcoX = () => <span className="ax">X</span>, IcoY = () => <span className="ax">Y</span>, IcoBlur = () => <Droplet />;

/** Sağ panel: seçili efekt aracının ayarları. */
export function FxPanel({ k, it, set, commit, color, defaults, setDefaults, free }: PanelProps) {
  const hint = (t: string) => <small className="hint">{t}</small>;
  if ((k === 'shadow' || k === 'inner' || k === 'transp') && !free) return hint('Bu efekt baskı (serbest çizim) içindir; yüzeye çizimde 3B’ye geçmez.');
  if (k === 'shadow') {
    const s = it.shadow; if (!s) return hint('Nesnenin ortasından sürükle: düz gölge. Alt kenarından sürükle: yere yatan perspektif gölge.');
    const up = (p: Partial<V.Shadow>, rec = true) => set(x => x.shadow ? { ...x, shadow: { ...x.shadow, ...p } } : x, rec);
    return <><Seg label="Gölge türü" v={s.persp ? 'p' : 'f'} on={q => up({ persp: q === 'p' })} opts={[['f', 'Düz', IcoShadowFlat], ['p', 'Perspektif', IcoShadowPersp]]} />
      <Slide label="Koyuluk" v={s.opacity * 100} on={v => up({ opacity: v / 100 }, false)} done={commit} />
      <Slide label="Yumuşaklık" v={s.blur} max={20} unit=" mm" on={v => up({ blur: v }, false)} done={commit} />
      <div className="grid2"><Num I={IcoX} title="Yatay kayma" v={s.dx} unit="mm" on={v => up({ dx: v })} /><Num I={IcoY} title="Dikey kayma" v={s.dy} unit="mm" on={v => up({ dy: v })} /></div>
      {color('Gölge rengi', s.color, c => up({ color: c }), 'shadow')}
      {hint('Çizginin ucunu sürükle: yön ve uzaklık. Ortadaki elması kaydır: koyuluk.')}</>;
  }
  if (k === 'inner') {
    const q = it.fx?.inner; if (!q) return hint('Nesnenin içinde sürükle: iç gölgenin düştüğü yön.');
    const up = (p: Partial<V.InnerFx>, rec = true) => set(x => x.fx?.inner ? setFx(x, { inner: { ...x.fx.inner, ...p } }) : x, rec);
    return <><Slide label="Koyuluk" v={q.opacity * 100} on={v => up({ opacity: v / 100 }, false)} done={commit} />
      <Slide label="Genişlik" v={q.size} max={20} unit=" mm" on={v => up({ size: Math.max(0.2, v) }, false)} done={commit} />
      <div className="grid2"><Num I={IcoX} title="Yatay kayma" v={q.dx} unit="mm" on={v => up({ dx: v })} /><Num I={IcoY} title="Dikey kayma" v={q.dy} unit="mm" on={v => up({ dy: v })} /></div>
      {color('İç gölge rengi', q.color, c => up({ color: c }), 'inner')}</>;
  }
  if (k === 'block') {
    const q = it.fx?.block; if (!q) return hint('Nesneyi sürükle: blok gölgenin yönü ve derinliği. Düz vektördür; lazer ve UV baskıya uygundur.');
    const up = (p: Partial<V.BlockFx>) => set(x => x.fx?.block ? setFx(x, { block: { ...x.fx.block, ...p } }) : x);
    return <><div className="grid2"><Num I={IcoX} title="Yatay derinlik" v={q.dx} unit="mm" on={v => up({ dx: v })} /><Num I={IcoY} title="Dikey derinlik" v={q.dy} unit="mm" on={v => up({ dy: v })} /></div>
      {color('Blok gölge rengi', q.color, c => up({ color: c }), 'block')}
      <label className="chk-line"><input type="checkbox" checked={!!q.noHoles} onChange={e => up({ noHoles: e.target.checked })} /> Delikleri kaldır</label></>;
  }
  if (k === 'contour') {
    const q = it.fx?.contour ?? { ...defaults.contour, color: defaults.stroke }, on = !!it.fx?.contour;
    const up = (p: Partial<V.ContourFx>) => { setDefaults({ contour: { ...defaults.contour, ...(p as object) } }); if (on) set(x => x.fx?.contour ? setFx(x, { contour: { ...x.fx.contour, ...p } }) : x); };
    return <><Seg label="Kontür yönü" v={q.dir} on={d => up({ dir: d })} opts={[['out', 'Dışa', IcoContourOut], ['in', 'İçe', IcoContourIn]]} />
      <Seg label="Köşe biçimi" v={q.join} on={j => up({ join: j })} opts={[['Miter', 'Sivri', IcoJoinMiter], ['Round', 'Yuvarlak', IcoJoinRound], ['Square', 'Kesik', IcoJoinBevel]]} />
      <div className="grid2"><Num I={IcoOffset} title="Kontür aralığı" v={q.dist} min={0.05} unit="mm" on={v => up({ dist: v })} /><Num I={IcoSteps} title="Adım sayısı" v={q.steps} step={1} min={1} max={50} unit="adım" on={v => up({ steps: Math.round(v) })} /></div>
      <label className="chk-line"><input type="checkbox" checked={q.filled} onChange={e => up({ filled: e.target.checked })} /> Dolgulu (renk geçişli)</label>
      {on && color('Kontür rengi', q.color, c => up({ color: c }), 'contour')}
      {!on && <button className="tb wide" onClick={() => set(x => setFx(x, { contour: { ...q } }))}>Kontür ekle</button>}
      {hint(on ? 'Sağdaki tutamacı sürükle: aralık; dışa ya da içe çek.' : 'Ya da nesneyi dışa / içe sürükle.')}</>;
  }
  if (k === 'env') {
    const e = it.fx?.env;
    const apply = (kind: Fx.EnvPreset, amt = defaults.envAmt, rec = true) => { setDefaults({ env: kind, envAmt: amt }); set(x => { const g = geoBase(x, 'env'), base = x.fx?.env ?? Fx.envNew(g.subs); return base ? setFx(g, { env: Fx.envPreset(base, kind, amt) }) : x; }, rec); };
    return <><div className="sec-t">Hazır biçimler</div>
      <div className="env-grid">{ENV_PRESETS.map(([q, l]) => <button key={q} title={l} className={defaults.env === q && e ? 'on' : ''} onClick={() => apply(q)}><EnvPreview kind={q} /><span>{l}</span></button>)}</div>
      {e && <Slide label="Biçim gücü" v={defaults.envAmt * 100} min={-100} max={100} on={v => apply(defaults.env, v / 100, false)} done={commit} />}
      {e && <><div className="sec-t">Düzenleme kipi</div><Seg label="Zarf kipi" v={e.mode} on={m => set(x => x.fx?.env ? setFx(x, { env: { ...x.fx.env, mode: m } }) : x)} opts={[['line', 'Düz', IcoEnvLine], ['arc', 'Tek kavis', IcoEnvArc], ['double', 'Çift kavis', IcoEnvDouble], ['free', 'Serbest', IcoEnvFree]]} />
        <button className="tb wide" onClick={() => set(x => { const g = Fx.dropFx(x, 'env'), n = Fx.envNew(g.subs); return n ? setFx(g, { env: n }) : g; })}>Zarfı sıfırla</button></>}
      {hint(e ? 'Köşe ve kenar tutamaçlarını sürükle. Yazı eğriye çevrilir.' : 'Bir biçim seç ya da nesneye tıklayıp tutamaçları sürükle.')}</>;
  }
  if (k === 'distort') {
    const q = it.fx?.distort, kind = q?.kind ?? defaults.distort;
    const pick = (kd: V.DistortFx['kind']) => { setDefaults({ distort: kd }); if (q) set(x => x.fx?.distort ? setFx(x, { distort: { ...x.fx.distort, kind: kd, amt: kd === 'push' ? 0.3 : kd === 'zipper' ? 1 : 90 } }) : x); };
    return <><Seg label="Bozma türü" v={kind} on={pick} opts={[['push', 'İtme / çekme', IcoPush], ['zipper', 'Fermuar', IcoZipper], ['twist', 'Girdap', IcoTwist]]} />
      {q && (q.kind === 'push' ? <Slide label="Miktar" v={q.amt * 100} min={-95} max={150} on={v => set(x => x.fx?.distort ? setFx(x, { distort: { ...x.fx.distort, amt: v / 100 } }) : x, false)} done={commit} />
        : q.kind === 'zipper' ? <><Slide label="Genlik" v={q.amt} max={20} unit=" mm" on={v => set(x => x.fx?.distort ? setFx(x, { distort: { ...x.fx.distort, amt: v } }) : x, false)} done={commit} /><Slide label="Diş sayısı" v={q.freq} min={1} max={60} unit="" on={v => set(x => x.fx?.distort ? setFx(x, { distort: { ...x.fx.distort, freq: v } }) : x, false)} done={commit} /></>
        : <Slide label="Açı" v={q.amt} min={-720} max={720} unit="°" on={v => set(x => x.fx?.distort ? setFx(x, { distort: { ...x.fx.distort, amt: v } }) : x, false)} done={commit} />)}
      {hint(kind === 'push' ? 'Sağa sürükle: it (şişir), sola sürükle: çek (yıldızlaştır).' : kind === 'zipper' ? 'Sürükle: diş yüksekliği. Diş sayısı kaydırıcıda.' : 'Merkezin çevresinde daire çizerek sürükle.')}</>;
  }
  if (k === 'transp') {
    const t = it.fx?.transp;
    return <><Slide label="Genel şeffaflık" v={(1 - (it.opacity ?? 1)) * 100} on={v => set(x => ({ ...x, opacity: v ? 1 - v / 100 : undefined }), false)} done={commit} />
      {t ? <><Slide label="Başta" v={t.from * 100} on={v => set(x => x.fx?.transp ? setFx(x, { transp: { ...x.fx.transp, from: v / 100 } }) : x, false)} done={commit} /><Slide label="Sonda" v={t.to * 100} on={v => set(x => x.fx?.transp ? setFx(x, { transp: { ...x.fx.transp, to: v / 100 } }) : x, false)} done={commit} /></>
        : hint('Nesne üstünde sürükle: bir uçtan öbürüne giderek saydamlaşır.')}</>;
  }
  return null;
}

/** Nesnedeki canlı efektlerin listesi (simge, ad, kaldır). */
export function FxList({ it, pick, drop }: { it: V.Item; pick(k: FxKey): void; drop(k: FxKey): void }) {
  const on: FxKey[] = [...(it.shadow ? ['shadow' as const] : []), ...(['inner', 'block', 'contour', 'env', 'distort', 'transp'] as const).filter(k => it.fx?.[k])];
  if (!on.length) return null;
  return <div className="fx-list">{on.map(k => { const t = FX_TOOLS.find(q => q.k === k)!; return <div key={k} className="fx-chip"><button title={`${t.label}: ayarla`} onClick={() => pick(k)}><t.I /><span>{t.label}</span></button><button className="x" title={`${t.label} efektini kaldır`} aria-label={`${t.label} efektini kaldır`} onClick={() => drop(k)}><X /></button></div>; })}</div>;
}
