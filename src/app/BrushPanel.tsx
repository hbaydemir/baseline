// Fırça (sanatsal ortam) ayarları: kip, kalınlık, profil, uç açısı, püskürtme kaynağı — simgelerle.
import { MousePointerClick } from 'lucide-react';
import type { ReactNode } from 'react';
import * as V from './vector';
import * as Br from './vectorBrush';
import { IcoBrushPreset, IcoCalli, IcoPressure, IcoSpray } from './vecIcons';

const PROF: [Br.Profile, string][] = [['taper', 'İki uç sivri'], ['start', 'Kalından inceye'], ['end', 'İnceden kalına'], ['drop', 'Damla'], ['bulge', 'Ortası dolgun'], ['even', 'Eşit']];
/** Profil önizlemesi: kalınlığın yol boyunca değişimi. */
const ProfPrev = ({ p }: { p: Br.Profile }) => { const f = Br.PROFILES[p], n = 24, top = Array.from({ length: n + 1 }, (_, i) => [2 + i / n * 20, 12 - f(i / n) * 6.5]), bot = top.map(([x], i) => [x, 12 + f(i / n) * 6.5]).reverse(); return <svg viewBox="0 0 24 24" width="24" height="24"><path d={'M' + [...top, ...bot].map(q => q.map(v => v.toFixed(2)).join(' ')).join('L') + 'Z'} fill="currentColor" /></svg>; };
const NibPrev = ({ a }: { a: number }) => { const r = a * Math.PI / 180, dx = Math.cos(r) * 8, dy = Math.sin(r) * 8; return <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeLinecap="round"><circle cx="12" cy="12" r="10" strokeWidth="1" opacity={0.25} /><path d={`M${12 - dx} ${12 - dy}L${12 + dx} ${12 + dy}`} strokeWidth="3.2" /></svg>; };
const SubPrev = ({ subs }: { subs: V.Sub[] }) => { const b = V.bounds([{ id: 0, subs, fill: null, stroke: null, sw: 0, even: false }]); if (!b) return <svg viewBox="0 0 24 24" />; const k = 18 / Math.max(b.x1 - b.x0, b.y1 - b.y0); return <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d={V.itemD(V.mapItem({ id: 0, subs, fill: null, stroke: null, sw: 0, even: false }, (x, y) => [3 + (x - b.x0) * k + (18 - (b.x1 - b.x0) * k) / 2, 3 + (y - b.y0) * k + (18 - (b.y1 - b.y0) * k) / 2]))} /></svg>; };
const Slide = ({ label, v, on, min, max, step = 1, unit }: { label: string; v: number; on(x: number): void; min: number; max: number; step?: number; unit: string }) => <label className="islide"><span>{label}<em>{v}{unit}</em></span><input type="range" min={min} max={max} step={step} value={v} onChange={e => on(+e.target.value)} /></label>;

export function BrushPanel({ b, set, shapes, hasSel }: { b: Br.Brush; set(p: Partial<Omit<Br.Brush, 'spray'>> & { spray?: Partial<Br.Spray> }): void; shapes: { id: string; label: string; subs: V.Sub[] }[]; hasSel: boolean }) {
  const modes: [Br.BrushMode, string, () => ReactNode][] = [['preset', 'Hazır', IcoBrushPreset], ['calli', 'Kaligrafi', IcoCalli], ['pressure', 'Basınç', IcoPressure], ['spray', 'Püskürtme', IcoSpray]];
  return <>
    <div className="icon-seg" role="radiogroup" aria-label="Fırça kipi">{modes.map(([k, l, I]) => <button key={k} role="radio" aria-checked={b.mode === k} className={b.mode === k ? 'on' : ''} title={l} onClick={() => set({ mode: k })}><I /><span>{l}</span></button>)}</div>
    {b.mode !== 'spray' && <Slide label="Kalınlık" v={b.w} min={0.2} max={30} step={0.2} unit=" mm" on={w => set({ w })} />}
    {b.mode === 'preset' && <><div className="sec-t">Profil</div><div className="env-grid">{PROF.map(([k, l]) => <button key={k} title={l} className={b.profile === k ? 'on' : ''} onClick={() => set({ profile: k })}><ProfPrev p={k} /><span>{l}</span></button>)}</div></>}
    {b.mode === 'calli' && <div className="nib-row"><NibPrev a={b.angle} /><Slide label="Uç açısı" v={b.angle} min={0} max={180} unit="°" on={angle => set({ angle })} /></div>}
    {b.mode === 'pressure' && <small className="hint">Kalem tabletinde bastırdıkça kalınlaşır. Fareyle çizerken ↑ kalınlaştırır, ↓ inceltir.</small>}
    {b.mode === 'spray' && <>
      <div className="sec-t">Ne püskürtülsün</div>
      <div className="env-grid">{shapes.map(q => <button key={q.id} title={q.label} className={b.spray.src === q.id ? 'on' : ''} onClick={() => set({ spray: { src: q.id } })}><SubPrev subs={q.subs} /><span>{q.label}</span></button>)}
        <button title={hasSel ? 'Fırçayı seçerken seçili olan nesne' : 'Önce bir nesne seçip sonra fırçayı aç'} disabled={!hasSel} className={b.spray.src === 'sel' ? 'on' : ''} onClick={() => set({ spray: { src: 'sel' } })}><MousePointerClick /><span>Seçili nesne</span></button></div>
      <Slide label="Boy" v={b.spray.size} min={1} max={60} step={0.5} unit=" mm" on={size => set({ spray: { size } })} />
      <Slide label="Aralık" v={b.spray.gap} min={1} max={60} step={0.5} unit=" mm" on={gap => set({ spray: { gap } })} />
      <Slide label="Boy oynaması" v={b.spray.jitter} min={0} max={90} unit="%" on={jitter => set({ spray: { jitter } })} />
      <Slide label="Açı oynaması" v={b.spray.rot} min={0} max={180} unit="°" on={rot => set({ spray: { rot } })} />
      <label className="chk-line"><input type="checkbox" checked={b.spray.follow} onChange={e => set({ spray: { follow: e.target.checked } })} /> Yolun yönüne dönsün</label></>}
    {b.mode !== 'spray' && <Slide label="Yumuşatma" v={b.smooth} min={0} max={100} unit="%" on={smooth => set({ smooth })} />}
    <small className="hint">Renk: dolgu rengi. Sonuç kapalı vektör şekildir; düğümleri şekil aracıyla düzenlenebilir.</small>
  </>;
}
