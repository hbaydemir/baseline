// Sağ panel: kartlar sekmeye dönüşür; sekme ikonları panelin solunda dışa taşan bir şeritte durur.
import { Children, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface TabProps { id: string; icon: ReactNode; title: string; hint?: string; children: ReactNode; open?: boolean; extra?: ReactNode }
/** Panel genişliği ve daraltma (3D ve 2D aynı ayarı kullanır). */
const W_KEY = 'baseline-panel-w', C_KEY = 'baseline-panel-c';
export function usePanel(): { width: number; collapsed: boolean; setWidth(w: number): void; toggle(v?: boolean): void } {
  const [width, setW] = useState(() => { try { return Math.max(240, Math.min(560, +(localStorage.getItem(W_KEY) ?? 300) || 300)); } catch { return 300; } });
  const [collapsed, setC] = useState(() => { try { return localStorage.getItem(C_KEY) === '1'; } catch { return false; } });
  useEffect(() => { const f = (e: Event) => { const d = (e as CustomEvent).detail as { w?: number; c?: boolean }; if (d.w !== undefined) setW(d.w); if (d.c !== undefined) setC(d.c); }; addEventListener('baseline-panel', f); return () => removeEventListener('baseline-panel', f); }, []);
  const emit = (d: { w?: number; c?: boolean }) => dispatchEvent(new CustomEvent('baseline-panel', { detail: d }));
  return {
    width, collapsed,
    setWidth: w => { const v = Math.round(Math.max(240, Math.min(560, w))); try { localStorage.setItem(W_KEY, String(v)); } catch { /* yok */ } emit({ w: v }); },
    toggle: v => { const c = v ?? !collapsed; try { localStorage.setItem(C_KEY, c ? '1' : '0'); } catch { /* yok */ } emit({ c }); },
  };
}
/** Panelin sol kenarındaki sürükleme tutamacı. */
export function PanelGrip({ side = 'left' }: { side?: 'left' }) {
  const p = usePanel(), ref = useRef<HTMLDivElement>(null);
  return <div ref={ref} className={`panel-grip ${side}`} title="Sürükle: genişlet / daralt · Tab: paneli gizle / göster" onPointerDown={e => {
    e.preventDefault(); const right = ref.current!.parentElement!.getBoundingClientRect().right;
    const mv = (ev: PointerEvent) => { const w = right - ev.clientX; if (w < 160) p.toggle(true); else { if (p.collapsed) p.toggle(false); p.setWidth(w); } };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  }} onDoubleClick={() => p.toggle()} />;
}
/** Kart listesini sekmeli panele çevirir; son açılan sekme hatırlanır. */
export function Tabs({ id, children, head }: { id: string; children: ReactNode; head?: ReactNode }) {
  const tabs = Children.toArray(children).filter(isValidElement) as ReactElement<TabProps>[];
  const key = `baseline-tab-${id}`, [act, setAct] = useState(() => { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } });
  const panel = usePanel(), cur = tabs.find(t => t.props.id === act) ?? tabs[0];
  const pick = (t: string) => { setAct(t); try { localStorage.setItem(key, t); } catch { /* yok */ } if (panel.collapsed) panel.toggle(false); };
  return <div className="tabs">
    <nav className="tab-rail" aria-label="Panel sekmeleri">
      {tabs.map(t => <button key={t.props.id} className={t === cur && !panel.collapsed ? 'on' : ''} data-tip={t.props.title} aria-label={t.props.title} aria-pressed={t === cur} onClick={() => t === cur && !panel.collapsed ? panel.toggle(true) : pick(t.props.id)}>{t.props.icon}</button>)}
      <i />
      <button className="tab-fold" data-tip={panel.collapsed ? 'Paneli aç (Tab)' : 'Paneli gizle (Tab)'} aria-label={panel.collapsed ? 'Paneli aç' : 'Paneli gizle'} onClick={() => panel.toggle()}>{panel.collapsed ? <ChevronsLeft /> : <ChevronsRight />}</button>
    </nav>
    {!panel.collapsed && <div className="tab-body">
      {head}
      {cur && <>
        <header className="tab-h"><b>{cur.props.title}</b>{cur.props.hint && <small>{cur.props.hint}</small>}{cur.props.extra}</header>
        <div className="tab-c">{cur.props.children}</div>
      </>}
    </div>}
  </div>;
}
/** Açılır kapanır bölüm (efekt listesi için). */
export function Fold({ title, open, onToggle, tools, children, dim }: { title: ReactNode; open: boolean; onToggle(): void; tools?: ReactNode; children?: ReactNode; dim?: boolean }) {
  return <div className={`fold${open ? ' open' : ''}${dim ? ' dim' : ''}`}>
    <div className="fold-h"><button className="fold-t" aria-expanded={open} onClick={onToggle}>{open ? <ChevronDown /> : <ChevronRight />}<b>{title}</b></button>{tools}</div>
    {open && children && <div className="fold-c">{children}</div>}
  </div>;
}
