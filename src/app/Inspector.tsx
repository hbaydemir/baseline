import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignStartHorizontal, AlignStartVertical, ArrowDown, ArrowUp, Brush, ChevronDown, Eye, EyeOff, Group, Layers, Lock, LockOpen, Move3d, Palette, PenTool, Ruler, Scissors, Shapes, Sparkles, SquareDashed, Trash2, Ungroup, Wand2 } from 'lucide-react';
import type { Command, Node, EffectUse, Doc } from '../core/doc';
import { num, type Num, type Vars } from '../core/expr';
import { EFFECTS, SHAPES, SPLIT, type Field } from '../core/shapes';
import { FontPicker } from './FontPicker';

export const PALETTE = ['#ffffff', '#222222', '#8e8c99', '#e5484d', '#f5a524', '#f7d94c', '#30a46c', '#4f8cff', '#9b5de5', '#f4a6c8', '#8b5e3c', '#00b8d4'];
const r3 = (x: number) => Math.round(x * 1000) / 1000 + 0;
const r2 = (x: number) => Math.round(x * 100) / 100 + 0;
type Run = (c: Command[]) => boolean;

/** Başlıklı, katlanabilir kart; açık/kapalı durumu hatırlanır. */
export function Card({ id, icon, title, hint, children, open: start = true, extra }: { id: string; icon: ReactNode; title: string; hint?: string; children: ReactNode; open?: boolean; extra?: ReactNode }) {
  const key = `card-${id}`, [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v === null ? start : v === '1'; } catch { return start; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1'); } catch { /* yok */ } };
  return <section className={open ? 'card' : 'card shut'}>
    <header><button className="card-h" aria-expanded={open} onClick={toggle}><span className="ci">{icon}</span><b>{title}</b>{hint && <small>{hint}</small>}<ChevronDown className="chev" /></button>{extra}</header>
    {open && <div className="card-b">{children}</div>}
  </section>;
}
/** Sayı ya da "=formül" alanı. */
/** Sayı ya da "=formül" alanı. Oklar / ↑↓: adım (Shift ×10, Alt ×0,1); formülde kapalı. */
export function NumBox({ value, vars, onCommit, label, unit, min, max, int }: { value: Num; vars: Vars; onCommit(v: Num): boolean; label: string; unit?: string; min?: number; max?: number; int?: boolean }) {
  const show = String(value), [t, setT] = useState(show), cur = useRef(value), rep = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setT(show); cur.current = value; }, [show]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = () => {
    const s = t.trim().replace(/(\d),(\d)/g, '$1.$2'); if (s === show) return setT(show);
    if (!s) return setT(show);
    const v: Num = /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : s.startsWith('=') ? s : '=' + s;
    if (!onCommit(v)) setT(show);
  };
  const formula = typeof value === 'string';
  const step = (dir: number, e: { shiftKey: boolean; altKey: boolean }) => {
    const v = typeof cur.current === 'number' ? cur.current : Number(t.replace(',', '.'));
    if (!Number.isFinite(v)) return;
    let st = int ? 1 : (!Number.isInteger(v) || Math.abs(v) < 5) ? 0.1 : 1; if (e.shiftKey) st *= 10; if (e.altKey && !int) st /= 10;
    let x = Math.round((v + dir * st) / st) * st; x = Math.round(x * 1e4) / 1e4; if (min !== undefined) x = Math.max(min, x); if (max !== undefined) x = Math.min(max, x);
    if (x === v) return; cur.current = x; setT(String(x)); onCommit(x);
  };
  const hold = (dir: number, e: React.PointerEvent) => { e.preventDefault(); const mods = { shiftKey: e.shiftKey, altKey: e.altKey }; step(dir, mods); const go = (d: number) => { rep.current = setTimeout(() => { step(dir, mods); go(70); }, d); }; go(380); };
  const stop = () => { if (rep.current) clearTimeout(rep.current); rep.current = null; };
  useEffect(() => stop, []);
  let res = ''; if (formula) try { res = `= ${r3(num(value, vars))}`; } catch { res = 'hata'; }
  return <label className="field"><span>{label}{res ? <em>{res}</em> : unit ? <i>{unit}</i> : null}</span>
    <span className="num"><input value={t} onChange={e => setT(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setT(show); if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !formula) { e.preventDefault(); step(e.key === 'ArrowUp' ? 1 : -1, e); } }} />
      {!formula && <span className="spin"><button tabIndex={-1} aria-label={`${label} artır`} onPointerDown={e => hold(1, e)} onPointerUp={stop} onPointerLeave={stop}>▲</button><button tabIndex={-1} aria-label={`${label} azalt`} onPointerDown={e => hold(-1, e)} onPointerUp={stop} onPointerLeave={stop}>▼</button></span>}</span></label>;
}
export function TextBox({ value, onCommit, label }: { value: string; onCommit(v: string): void; label: string }) {
  const [t, setT] = useState(value); useEffect(() => setT(value), [value]);
  return <label className="field"><span>{label}</span><input value={t} onChange={e => setT(e.target.value)} onBlur={() => t !== value && onCommit(t)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>;
}
function Fields({ fields, values, vars, set }: { fields: Field[]; values: Record<string, Num>; vars: Vars; set(k: string, v: Num): boolean }) {
  return <>{fields.map(f => {
    const v = values[f.key] ?? f.def;
    if (f.kind === 'svg' || f.kind === 'asset' || f.kind === 'data') return null;
    if (f.kind === 'font') return <FontPicker key={f.key} label={f.label} value={String(v)} onChange={x => set(f.key, x)} />;
    if (f.kind === 'text') return <TextBox key={f.key} label={f.label} value={String(v)} onCommit={x => set(f.key, x)} />;
    if (f.kind === 'select') return <label className="field" key={f.key}><span>{f.label}</span><select value={String(v)} onChange={e => set(f.key, e.target.value)}>{f.options!.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label>;
    return <NumBox key={f.key} label={f.label} value={v} vars={vars} min={f.min} max={f.max} int={f.kind === 'int'} onCommit={x => set(f.key, x)} />;
  })}</>;
}

export interface InspectorProps {
  node: Node; vars: Vars; run: Run; isTop: boolean; error?: string; dims: number[] | null; local: number[] | null;
  uniform: boolean; setUniform(v: boolean): void;
  onUngroup(): void; onVector(): void; onSplit(): void; onPins(): void; onTemplate(): void; onPaint(): void;
}
export function Inspector(p: InspectorProps) {
  const { node, vars, run } = p, up = (x: object) => run([{ op: 'update', id: node.id, ...x }]);
  const shape = SHAPES[node.type], fields = shape?.fields ?? [], main = fields.filter(f => !f.group), edge = fields.filter(f => f.group === 'edge');
  const fx = node.effects ?? [], setFx = (list: EffectUse[]) => up({ effects: list });
  const canFx = Object.entries(EFFECTS).filter(([, e]) => !e.hidden && (!e.profileOnly || shape?.profile));
  const vec = (k: 'pos' | 'rot', label: string, unit: string) => <div className="grid3">{['X', 'Y', 'Z'].map((a, i) => <NumBox key={a} label={`${label} ${a}`} unit={unit} value={node[k][i]} vars={vars} onCommit={v => up({ [k]: node[k].map((o, j) => j === i ? v : o) })} />)}</div>;
  const sc = node.scale.map(x => { try { return num(x, vars); } catch { return 1; } });
  const setSize = (i: number, mm: number) => {
    if (!p.local || !(mm > 0) || !(p.local[i] > 0)) return false;
    const f = mm / (p.local[i] * Math.abs(sc[i])), s = p.uniform ? sc.map(x => r3(x * f)) : sc.map((x, j) => j === i ? r3(x * f) : x);
    return up({ scale: s });
  };
  const own = node.type === 'svg' || node.type === 'mesh' || !!node.children;
  const vectorable = !!shape?.profile;
  return <>
    <div className="ins-head">
      <TextBox label={node.children ? 'Grup adı' : `${shape?.label ?? node.type} · ad`} value={node.name} onCommit={name => up({ name })} />
      {p.error && <p className="error">{p.error}</p>}
      {p.dims && <p className="dims"><Ruler />{p.dims.map(r2).join(' × ')} mm</p>}
    </div>
    {node.mode === 'split' && <SplitCard node={node} vars={vars} up={up} onPins={p.onPins} onUngroup={p.onUngroup} />}
    {node.children && node.mode !== 'split' && <Card id="group" icon={<Group />} title="Grup" hint="Parçaların nasıl birleşeceği">
      <div className="seg">{(['linked', 'fused'] as const).map(m => <button key={m} aria-pressed={node.mode === m} className={node.mode === m ? 'on' : ''} onClick={() => run([{ op: 'setMode', id: node.id, mode: m }])}>{m === 'linked' ? 'Grup' : 'Birleşik'}</button>)}</div>
      <p className="hint">{node.mode === 'fused' ? 'Tek gövde: delikler kesilir, renkler birbirini keser.' : 'Birlikte hareket eder, parçalar ayrı kalır.'}</p>
      <button className="wide" onClick={p.onUngroup}><Ungroup />Grubu çöz</button>
    </Card>}
    {main.some(f => f.kind !== 'svg' && f.kind !== 'asset') && <Card id="shape" icon={<Shapes />} title="Ölçüler" hint={shape?.cat === 'mech' ? 'mekanik parça' : 'şeklin kendi ayarları'}>
      <Fields fields={main} values={node.params} vars={vars} set={(k, v) => up({ params: { [k]: v } })} />
      {node.type === 'svg' && <p className="hint">Genişlik 0 ise çizimdeki gerçek ölçü kullanılır.</p>}
    </Card>}
    {(edge.length > 0 || vectorable) && <Card id="edge" icon={<SquareDashed />} title="Kenar ve köşeler" hint="pah ve yuvarlatma">
      <Fields fields={edge} values={node.params} vars={vars} set={(k, v) => up({ params: { [k]: v } })} />
      {vectorable && !fx.some(e => e.type === 'bevel') && <button className="wide" onClick={() => setFx([...fx, { type: 'bevel', params: { top: 1, bottom: 0, style: 'chamfer' } }])}><Wand2 />Üst / alt kenara pah ekle</button>}
      {vectorable && <button className="wide" onClick={p.onVector}><PenTool />Köşeleri tek tek seç <small>Vektör düzenleyicide köşeye ya da iki kenarın arasına pah</small></button>}
    </Card>}
    <Card id="fx" icon={<Sparkles />} title="Efektler" hint={fx.length ? `${fx.length} efekt` : 'balon, burgu, bükme…'}>
      {fx.map((e, i) => { const d = EFFECTS[e.type]; return <div className={e.off ? 'fx off' : 'fx'} key={i}>
        <div className="fx-h"><b>{d.label}</b>
          <button className="ib" title={e.off ? 'Aç' : 'Kapat'} aria-label={e.off ? 'Aç' : 'Kapat'} onClick={() => setFx(fx.map((x, j) => j === i ? { ...x, off: !x.off } : x))}>{e.off ? <EyeOff /> : <Eye />}</button>
          <button className="ib" title="Önce uygula" aria-label="Önce uygula" disabled={!i} onClick={() => { const a = [...fx]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setFx(a); }}><ArrowUp /></button>
          <button className="ib" title="Sonra uygula" aria-label="Sonra uygula" disabled={i === fx.length - 1} onClick={() => { const a = [...fx]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setFx(a); }}><ArrowDown /></button>
          <button className="ib" title="Kaldır" aria-label="Kaldır" onClick={() => setFx(fx.filter((_, j) => j !== i))}><Trash2 /></button></div>
        {!d.hidden && <Fields fields={d.fields} values={e.params} vars={vars} set={(k, v) => { const a = fx.map((x, j) => j === i ? { ...x, params: { ...x.params, [k]: v } } : x); return up({ effects: a }); }} />}
        {d.hidden && <p className="hint">{d.hint}</p>}
      </div>; })}
      <label className="field"><span>Efekt ekle</span><select value="" onChange={e => { const t = e.target.value; if (t) setFx([...fx, { type: t, params: {} }]); }}><option value="">Seç…</option>{canFx.map(([k, e]) => <option key={k} value={k}>{e.label} — {e.hint}</option>)}</select></label>
      {!shape?.profile && <p className="hint">Pah efekti yalnız yazı, SVG, poligon, yıldız, kalp ve dilimde.</p>}
    </Card>
    <Card id="color" icon={<Palette />} title="Renk ve tür">
      <div className="pal">{PALETTE.map(c => <button key={c} aria-label={c} className={node.color === c ? 'on' : ''} style={{ background: c }} onClick={() => up({ color: c, hole: false })} />)}
        <input type="color" aria-label="Özel renk" value={node.color || '#cccccc'} onChange={e => up({ color: e.target.value })} /></div>
      {own && node.color && <button className="wide" onClick={() => up({ color: '' })}>Kendi renklerine dön</button>}
      <div className="seg"><button aria-pressed={!node.hole} className={node.hole ? '' : 'on'} onClick={() => up({ hole: false })}>Katı</button><button aria-pressed={node.hole} className={node.hole ? 'on' : ''} onClick={() => up({ hole: true })}>Delik</button></div>
      {node.hole && <p className="hint">Kesmesi için katı bir nesneyle birlikte seçip “Birleştir”e bas.</p>}
      {!node.hole && <button className="wide" onClick={p.onPaint}><Brush />Yüzeyini boya{node.paint?.length ? ` (${node.paint.length} boya)` : ''}</button>}
      {!!node.paint?.length && <button className="wide" onClick={() => up({ paint: [] })}><Trash2 />Boyayı temizle</button>}
    </Card>
    <Card id="place" icon={<Move3d />} title="Konum, boyut, dönüş">
      {vec('pos', 'Konum', 'mm')}
      {p.local && <><div className="row-h"><b>Boyut</b><button className={p.uniform ? 'chip on' : 'chip'} onClick={() => p.setUniform(!p.uniform)}>{p.uniform ? <Lock /> : <LockOpen />}{p.uniform ? 'Oranlı' : 'Serbest'}</button></div>
        <div className="grid3">{['G', 'D', 'Y'].map((a, i) => <NumBox key={a} label={['Genişlik', 'Derinlik', 'Yükseklik'][i]} unit="mm" value={r2(p.local![i] * Math.abs(sc[i]))} vars={vars} onCommit={v => setSize(i, typeof v === 'number' ? v : num(v, vars))} />)}</div></>}
      {vec('rot', 'Dönüş', '°')}
      <div className="grid3">{['X', 'Y', 'Z'].map((a, i) => <NumBox key={a} label={`Ölçek ${a}`} unit="%" value={r2(sc[i] * 100)} vars={vars} onCommit={v => { const x = (typeof v === 'number' ? v : num(v, vars)) / 100; if (!x) return false; return up({ scale: p.uniform ? sc.map(s => r3(s * x / sc[i])) : sc.map((s, j) => j === i ? r3(x) : s) }); }} />)}</div>
      {p.isTop && <button className="wide" onClick={() => run([{ op: 'place', id: node.id, on: 'plate' }])}>Tablaya oturt</button>}
    </Card>
    <Card id="tools" icon={<Layers />} title="Düzenle" open={false}>
      {vectorable && <button className="wide" onClick={p.onVector}><PenTool />Vektörde düzenle <small>{node.type === 'svg' ? 'Noktaları, şekilleri ve köşeleri düzenle' : 'Vektöre çevirip noktalarını düzenle'}</small></button>}
      {p.isTop && !node.hole && node.mode !== 'split' && <button className="wide" onClick={p.onSplit}><Scissors />Böl <small>Kesim düzlemi ve kilitlerle parçalara ayır</small></button>}
      <button className="wide" onClick={p.onTemplate}><Shapes />Şablon olarak kaydet</button>
    </Card>
  </>;
}

function SplitCard({ node, vars, up, onPins, onUngroup }: { node: Node; vars: Vars; up(x: object): boolean; onPins(): void; onUngroup(): void }) {
  const v = (k: string) => node.params[k] ?? SPLIT.find(f => f.key === k)!.def, set = (k: string, x: Num) => up({ params: { [k]: x } });
  const preset = (tiltX: number, tiltY: number) => up({ params: { tiltX, tiltY, at: 0 } });
  const manual = !!String(v('pins') || '').replace(/[[\] ]/g, '');
  const at = (() => { try { return num(v('at'), vars); } catch { return 0; } })();
  return <Card id="split" icon={<Scissors />} title="Bölme" hint={String(v('layout')) === 'print' ? 'baskı yerleşimi' : 'önizleme'}>
    <div className="row-h"><b>Kesim yönü</b></div>
    <div className="grid2">{([['Yatay', 0, 0], ['Dikey (X)', 0, 90], ['Dikey (Y)', -90, 0], ['Çapraz 45°', -45, 0]] as const).map(([l, a, b]) => <button key={l} className={num(v('tiltX'), vars) === a && num(v('tiltY'), vars) === b ? 'on' : ''} onClick={() => preset(a, b)}>{l}</button>)}</div>
    <label className="field"><span>Konum <i>{at} mm</i></span><input type="range" min={-100} max={100} step={0.5} value={at} onChange={e => set('at', +e.target.value)} /></label>
    <Fields fields={SPLIT.filter(f => ['tiltX', 'tiltY', 'at', 'joint', 'layout'].includes(f.key))} values={node.params} vars={vars} set={set} />
    {String(v('joint')) !== 'flat' && <>
      <Fields fields={SPLIT.filter(f => ['count', 'dia', 'depth', 'margin', 'gap'].includes(f.key))} values={node.params} vars={vars} set={set} />
      <button className="wide" onClick={onPins}><PenTool />Kilitleri elle yerleştir <small>{manual ? 'Elle yerleştirildi' : 'Şu an otomatik'}</small></button>
      {manual && <button className="wide" onClick={() => up({ params: { pins: '' } })}>Otomatik yerleşime dön</button>}
      <p className="hint">{String(v('joint')) === 'snap' ? 'Geçmeli pim: ucu yarıklı, itince tık diye oturur ve çıkmaz.' : 'Dübel: pimi iki yarıdaki deliğe tak; istersen yapıştır.'} Pimler ayrı ve yatık basılır, iki yarı desteksiz.</p>
    </>}
    <button className="wide" onClick={onUngroup}><Ungroup />Bölmeyi kaldır</button>
  </Card>;
}

export function MultiPanel({ count, top, run, sel, bounds }: { count: number; top: boolean; run: Run; sel: string[]; bounds(id: string): { min: number[]; max: number[] } | null }) {
  const align = (ax: number, where: 0 | 0.5 | 1) => {
    const bs = sel.map(id => [id, bounds(id)] as const).filter((x): x is readonly [string, { min: number[]; max: number[] }] => !!x[1]); if (bs.length < 2) return;
    const lo = Math.min(...bs.map(b => b[1].min[ax])), hi = Math.max(...bs.map(b => b[1].max[ax])), target = lo + (hi - lo) * where;
    run(bs.map(([id, b]) => { const at = b.min[ax] + (b.max[ax] - b.min[ax]) * where, d = [0, 0, 0]; d[ax] = r3(target - at); return { op: 'move', id, d }; }) as unknown as Command[]);
  };
  const A = [[<AlignStartVertical key="a" />, <AlignCenterVertical key="b" />, <AlignEndVertical key="c" />], [<AlignEndHorizontal key="a" />, <AlignCenterHorizontal key="b" />, <AlignStartHorizontal key="c" />], [<AlignEndHorizontal key="a" />, <AlignCenterHorizontal key="b" />, <AlignStartHorizontal key="c" />]];
  return <>
    <div className="ins-head"><h2>{count} nesne seçili</h2></div>
    <Card id="m-group" icon={<Group />} title="Grupla / birleştir">
      <button className="wide" disabled={!top} onClick={() => run([{ op: 'group', ids: sel, mode: 'linked' }])}><Group />Grupla <small>Birlikte hareket eder, ayrı parça kalır</small></button>
      <button className="wide" disabled={!top} onClick={() => run([{ op: 'group', ids: sel, mode: 'fused' }])}><Shapes />Birleştir <small>Tek gövde olur, delikler kesilir</small></button>
    </Card>
    <Card id="m-align" icon={<AlignCenterVertical />} title="Hizala">
      {['X (sol–sağ)', 'Y (ön–arka)', 'Z (alt–üst)'].map((l, ax) => <div className="align" key={l}><span>{l}</span>{([0, 0.5, 1] as const).map((w, k) => <button key={k} className="ib" title={`${l}: ${['başa', 'ortaya', 'sona'][k]}`} aria-label={`${l} ${['başa', 'ortaya', 'sona'][k]}`} disabled={!top} onClick={() => align(ax, w)}>{A[ax][k]}</button>)}</div>)}
    </Card>
    <Card id="m-place" icon={<Move3d />} title="İlkinin üstüne / yanına koy">
      <div className="grid3">{([['top', 'Üst'], ['left', 'Sol'], ['right', 'Sağ'], ['front', 'Ön'], ['back', 'Arka'], ['center', 'Orta']] as const).map(([side, l]) => <button key={side} disabled={!top} onClick={() => run(sel.slice(1).map(id => ({ op: 'place', id, on: sel[0], side })))}>{l}</button>)}</div>
    </Card>
  </>;
}

export function DocPanel({ doc, vars, run }: { doc: Doc; vars: Vars; run: Run }) {
  const [n, setN] = useState('');
  return <>
    <div className="ins-head"><h2>Belge</h2><p className="hint">Düzenlemek için bir nesne seç. Shift ile birden çok seçilir.</p></div>
    <Card id="d-vars" icon={<Ruler />} title="Ortak ölçüler" hint="isteğe bağlı" open={false}>
      <p className="hint">Birden çok ölçüyü tek yerden yönetmek için. Örneğin <b>kalinlik</b> adında 3 tanımla, ölçü kutularına <code>=kalinlik</code> ya da <code>=kalinlik*2</code> yaz. Buradaki değeri değiştirince hepsi güncellenir. <b>tolerans</b>, geçme parçalardaki boşluktur; dişli ve sürgüler bunu kullanır.</p>
      {Object.entries(doc.params).map(([k, v]) => <div className="prow" key={k}><NumBox label={k} value={v} vars={vars} onCommit={x => run([{ op: 'setParam', name: k, value: x }])} /><button aria-label={`${k} sil`} onClick={() => run([{ op: 'setParam', name: k, value: null }])}><Trash2 /></button></div>)}
      <form className="prow" onSubmit={e => { e.preventDefault(); if (n in doc.params) return; if (run([{ op: 'setParam', name: n.trim(), value: 10 }])) setN(''); }}><label className="field"><span>Yeni ölçü adı</span><input placeholder="kalinlik" value={n} onChange={e => setN(e.target.value)} /></label><button disabled={!n.trim()}>Ekle</button></form>
    </Card>
    <Card id="d-keys" icon={<Move3d />} title="Kısayollar" open={false}>
      <p className="keys"><kbd>W</kbd> taşı <kbd>E</kbd> döndür <kbd>R</kbd> ölçekle <kbd>F</kbd> sığdır <kbd>Ctrl+A</kbd> hepsini seç <kbd>Ctrl+C</kbd> kopyala <kbd>Ctrl+X</kbd> kes <kbd>Ctrl+V</kbd> yapıştır (SVG de olur) <kbd>Ctrl+D</kbd> çoğalt <kbd>M</kbd> ölç <kbd>Ctrl+G</kbd> grupla <kbd>Del</kbd> sil <kbd>Shift</kbd> ince ayar (ızgarasız)</p>
      <p className="hint">Seçili nesneyi gövdesinden tutup sürüklersen yalnız X–Y’de kayar. Yukarı–aşağı için mavi oku kullan.</p>
    </Card>
  </>;
}
