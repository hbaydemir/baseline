// Sonsuz renk seçici: doygunluk/parlaklık alanı, ton çubuğu, HEX ve RGB ya da CMYK girişleri.
import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import * as C from './color';

export function ColorPicker({ value, mode, onChange, onClose }: { value: string | null; mode: C.Mode; onChange(c: string): void; onClose(): void }) {
  const start = value ?? (mode === 'cmyk' ? 'cmyk(100,0,0,0)' : '#1677ff');
  const [hsv, setHsv] = useState(() => C.rgb2hsv(...C.rgbOf(start)));
  const [cmyk, setCmyk] = useState<C.CMYK>(() => C.parseCmyk(C.toCmyk(start)));
  const box = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null);
  useEffect(() => { const f = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node) && !(e.target as Element).closest?.('[data-cp]')) onClose(); }; setTimeout(() => addEventListener('pointerdown', f), 0); return () => removeEventListener('pointerdown', f); }, [onClose]);
  const emitHsv = (h: number, s: number, v: number) => { setHsv([h, s, v]); const hex = C.hexOf(...C.hsv2rgb(h, s, v)); if (mode === 'cmyk') { const k = C.parseCmyk(C.toCmyk(hex)); setCmyk(k); onChange(C.fmtCmyk(k)); } else onChange(hex); };
  const emitCmyk = (k: C.CMYK) => { setCmyk(k); const c = C.fmtCmyk(k); setHsv(C.rgb2hsv(...C.rgbOf(c))); onChange(c); };
  const drag = (f: (x: number, y: number) => void) => (e: PE<HTMLDivElement>) => {
    const el = e.currentTarget, go = (ev: { clientX: number; clientY: number }) => { const r = el.getBoundingClientRect(); f(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))); };
    el.setPointerCapture(e.pointerId); go(e); el.onpointermove = ev => go(ev); el.onpointerup = () => { el.onpointermove = null; };
  };
  const [h, s, v] = hsv, rgb = C.hsv2rgb(h, s, v), hex = C.hexOf(...rgb);
  return <div className="cpick" ref={root}>
    <div className="cp-sv" ref={box} style={{ background: `hsl(${h} 100% 50%)` }} onPointerDown={drag((x, y) => emitHsv(h, x, 1 - y))}>
      <i style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }} />
    </div>
    <div className="cp-hue" onPointerDown={drag(x => emitHsv(x * 360, s, v))}><i style={{ left: `${h / 360 * 100}%` }} /></div>
    <div className="cp-row"><span className="cp-sw" style={{ background: hex }} />
      <label>HEX<input value={hex.toUpperCase()} onChange={e => { const t = e.target.value.trim(); if (/^#?[0-9a-f]{6}$/i.test(t)) { const c = t.startsWith('#') ? t : '#' + t; const [hh, ss, vv] = C.rgb2hsv(...C.rgbOf(c)); emitHsv(hh, ss, vv); } }} /></label></div>
    {mode === 'rgb'
      ? <div className="cp-nums">{(['R', 'G', 'B'] as const).map((l, i) => <label key={l}>{l}<input type="number" min={0} max={255} value={Math.round(rgb[i])} onChange={e => { const n = [...rgb] as number[]; n[i] = Math.max(0, Math.min(255, +e.target.value || 0)); const [hh, ss, vv] = C.rgb2hsv(n[0], n[1], n[2]); emitHsv(hh, ss, vv); }} /></label>)}</div>
      : <div className="cp-nums">{(['C', 'M', 'Y', 'K'] as const).map((l, i) => <label key={l}>{l}<input type="number" min={0} max={100} value={Math.round(cmyk[i])} onChange={e => { const n = [...cmyk] as C.CMYK; n[i] = Math.max(0, Math.min(100, +e.target.value || 0)); emitCmyk(n); }} /></label>)}</div>}
  </div>;
}
