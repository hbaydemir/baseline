import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, Box, Circle, Cog, Copy, Cylinder, Download, Eye, EyeOff, FilePlus2, FolderOpen, Grid3x3, Group, Heart, Magnet, Maximize, Move3d, Redo2, RefreshCw, Rotate3d, Save, Scale3d, Shapes, Sparkles, Torus, Trash2, Type, Undo2, Ungroup } from 'lucide-react';
import pkg from '../../package.json';
import { apply, find, newDoc, parseDoc, type Command, type Doc, type Node, type V3 } from '../core/doc';
import { num, resolveParams, type Num, type Vars } from '../core/expr';
import { SHAPES } from '../core/shapes';
import { builtBounds, Kernel, type Built } from '../core/kernel';
import { exportAll, PRINTERS } from '../core/export';
import { Viewport, type Moved, type Tool } from './viewport';
import * as os from './platform';

const ICONS: Record<string, ReactNode> = { box: <Box />, cylinder: <Cylinder />, sphere: <Circle />, tube: <Torus />, gear: <Cog />, text: <Type />, svg: <Shapes />, balloonText: <Sparkles />, balloonSvg: <Heart /> };
const PALETTE = ['#ffffff', '#222222', '#8e8c99', '#e5484d', '#f5a524', '#f7d94c', '#30a46c', '#4f8cff', '#9b5de5', '#f4a6c8', '#8b5e3c', '#00b8d4'];
const same = (a: Doc, b: Doc) => JSON.stringify(a) === JSON.stringify(b);
const r3 = (x: number) => Math.round(x * 1000) / 1000 + 0;

export function App({ kernel }: { kernel: Kernel }) {
  const [doc, setDocState] = useState<Doc>(newDoc);
  const docRef = useRef(doc), past = useRef<Doc[]>([]), future = useRef<Doc[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [path, setPathState] = useState<string | null>(null), pathRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [tool, setTool] = useState<Tool>('translate');
  const [magnet, setMagnet] = useState(true);
  const [dialog, setDialog] = useState<'export' | 'ai' | 'update' | 'params' | null>(null);
  const host = useRef<HTMLDivElement>(null), vp = useRef<Viewport | null>(null);
  const known = useRef<string | null>(null), chain = useRef(Promise.resolve());

  const say = useCallback((text: string, bad = false) => setToast({ text, bad }), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.bad ? 6000 : 2500); return () => clearTimeout(t); }, [toast]);

  const setDoc = useCallback((d: Doc) => { docRef.current = d; setDocState(d); }, []);
  const loadExternal = useCallback(async (p: string) => {
    const s = await os.stamp(p), d = parseDoc(await os.readText(p));
    known.current = s;
    if (!same(d, docRef.current)) { past.current.push(docRef.current); future.current = []; setDoc(d); setSel(x => x.filter(id => find(d.nodes, id))); say('Belge dışarıdan güncellendi'); }
    setDirty(false);
  }, [say, setDoc]);
  /** Yazmadan önce dosyanın başkası (ör. Claude) tarafından değişip değişmediğine bakar. */
  const persist = useCallback(() => {
    const p = pathRef.current; if (!p) return;
    chain.current = chain.current.then(async () => {
      if (pathRef.current !== p) return;
      const now = await os.stamp(p);
      if (known.current && now && now !== known.current) { await loadExternal(p); say('Dosya dışarıda değişmişti; o sürüm yüklendi. Seninki için Ctrl+Z', true); return; }
      const d = docRef.current;
      known.current = await os.writeText(p, JSON.stringify(d, null, 1));
      if (d === docRef.current) setDirty(false);
    }).catch(e => say(`Kaydedilemedi: ${e?.message ?? e}`, true));
  }, [loadExternal, say]);
  const commit = useCallback((d: Doc) => {
    past.current.push(docRef.current); if (past.current.length > 200) past.current.shift();
    future.current = []; setDoc(d); setDirty(true); persist();
  }, [persist, setDoc]);
  const run = useCallback((cmds: Command[], selectCreated = false) => {
    try { const r = apply(docRef.current, cmds, kernel.bounds); commit(r.doc); if (selectCreated && r.created.length) setSel(r.created); return true; }
    catch (e) { say((e as Error).message, true); return false; }
  }, [commit, kernel, say]);
  const step = useCallback((from: typeof past, to: typeof past) => {
    const d = from.current.pop(); if (!d) return;
    to.current.push(docRef.current); setDoc(d); setSel(s => s.filter(id => find(d.nodes, id))); setDirty(true); persist();
  }, [persist, setDoc]);

  const [built, vars] = useMemo<[Built[], Vars]>(() => [kernel.build(doc), resolveParams(doc.params)], [doc, kernel]);

  // --- dosya ---
  const attach = useCallback((p: string | null) => { pathRef.current = p; setPathState(p); known.current = null; os.setActive(p).catch(() => {}); }, []);
  const reset = (d: Doc, p: string | null) => { past.current = []; future.current = []; attach(p); setDoc(d); setSel([]); setDirty(false); };
  const okToLeave = () => !dirty || confirm('Kaydedilmemiş değişiklikler silinsin mi?');
  const saveAs = async () => {
    if (!os.desktop) { os.download('model.baseline', JSON.stringify(doc, null, 1)); setDirty(false); return; }
    const p = await os.pickSave('model.baseline'); if (!p) return;
    attach(p.endsWith('.baseline') ? p : p + '.baseline'); persist(); say('Kaydedildi; artık her değişiklik otomatik kaydedilir');
  };
  const saveDoc = async () => { if (path) { persist(); say('Kaydedildi'); } else await saveAs(); };
  const openDoc = async () => {
    if (!okToLeave()) return;
    try {
      if (!os.desktop) { const f = await os.pickText('.baseline'); if (f) reset(parseDoc(f.text), null); return; }
      const p = await os.pickOpen(); if (!p) return;
      const s = await os.stamp(p), d = parseDoc(await os.readText(p)); reset(d, p); known.current = s;
    } catch (e) { say(`Açılamadı: ${(e as Error)?.message ?? e}`, true); }
  };
  useEffect(() => {
    if (!os.desktop || !path) return;
    const t = setInterval(() => {
      chain.current = chain.current.then(async () => {
        if (pathRef.current !== path || !known.current) return;
        const s = await os.stamp(path);
        if (s && s !== known.current) await loadExternal(path);
      }).catch(e => { say(`Dosya okunamadı: ${e?.message ?? e}`, true); });
    }, 800);
    return () => clearInterval(t);
  }, [path, loadExternal, say]);
  useEffect(() => {
    void (async () => {
      const p = await os.startupFile();
      if (!p) { await os.setActive(null); return; }
      const s = await os.stamp(p), d = parseDoc(await os.readText(p)); reset(d, p); known.current = s;
    })().catch(e => say(`Açılamadı: ${e?.message ?? e}`, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- görünüm ---
  const onMoved = useCallback((ms: Moved[]) => {
    const keep = (old: V3, now: number[], v: Vars) => old.map((o, i) => Math.abs(num(o, v) - now[i]) < 1e-4 ? o : r3(now[i])) as V3;
    const d = docRef.current, v = resolveParams(d.params);
    const cmds = ms.flatMap(m => { const n = find(d.nodes, m.id)?.node; if (!n) return []; const c = { op: 'update' as const, id: m.id, pos: keep(n.pos, m.pos, v), rot: keep(n.rot, m.rot, v), scale: keep(n.scale, m.scale, v) }; return same(c as any, { op: 'update', id: n.id, pos: n.pos, rot: n.rot, scale: n.scale } as any) ? [] : [c]; });
    if (cmds.length) run(cmds);
  }, [run]);
  useEffect(() => {
    const v = new Viewport(host.current!, { select: (id, add) => setSel(s => !id ? (add ? s : []) : add ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id]), moved: onMoved });
    vp.current = v; return () => { v.dispose(); vp.current = null; };
  }, [onMoved]);
  useEffect(() => { vp.current?.update(built, sel); vp.current?.setTool(tool); }, [built, sel, tool]);
  useEffect(() => { if (vp.current) vp.current.magnet = magnet; }, [magnet]);

  const addShape = (type: string, extra: Partial<Extract<Command, { op: 'add' }>> = {}) => {
    const id = run([{ op: 'add', type, ...extra }], true);
    if (id && docRef.current.nodes.length > 1) { // boş yere koy
      const me = docRef.current.nodes[docRef.current.nodes.length - 1].id;
      try {
        const a = kernel.bounds(docRef.current, me); let x = -Infinity;
        for (const b of kernel.build(docRef.current)) if (b.id !== me && !b.error) { const q = builtBounds(b); if (q.min[1] < a.max[1] && q.max[1] > a.min[1]) x = Math.max(x, q.max[0]); }
        if (Number.isFinite(x) && x > a.min[0]) setDoc(apply(docRef.current, [{ op: 'update', id: me, pos: [r3(x - a.min[0] + 5), 0, 0] }]).doc);
        persist();
      } catch { /* hata listede görünür */ }
    }
  };
  const addSvg = async (type: 'svg' | 'balloonSvg', f?: { name: string; text: string } | null) => {
    f ??= await os.pickText('.svg'); if (f) addShape(type, { params: { svg: f.text }, name: f.name.replace(/\.svg$/i, '') });
  };
  const remove = () => { if (sel.length && run([{ op: 'remove', ids: sel.filter(id => !sel.some(o => o !== id && inside(doc, o, id))) }])) setSel([]); };
  const group = (mode: 'linked' | 'fused') => run([{ op: 'group', ids: sel, mode }], true);
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = e => {
    if ((e.target as HTMLElement).closest('input,textarea,select,dialog')) return;
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    const act = c && k === 'z' && !e.shiftKey ? () => step(past, future) : c && (k === 'y' || k === 'z') ? () => step(future, past) : c && k === 's' ? saveDoc : c && k === 'o' ? openDoc
      : c && k === 'd' ? () => sel.length && run(sel.map(id => ({ op: 'duplicate', id }) as Command), true) : c && k === 'g' ? () => sel.length > 1 && group('linked')
      : k === 'delete' || k === 'backspace' ? remove : !c && k === 'w' ? () => setTool('translate') : !c && k === 'e' ? () => setTool('rotate') : !c && k === 'r' ? () => setTool('scale') : !c && k === 'f' ? () => vp.current?.fit() : null;
    if (act) { e.preventDefault(); void act(); }
  };
  useEffect(() => { const f = (e: KeyboardEvent) => keys.current(e); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f); }, [dirty]);

  const node = sel.length === 1 ? find(doc.nodes, sel[0])?.node : undefined;
  const top = sel.every(id => doc.nodes.some(n => n.id === id));
  const B = (p: { t: string; on: () => void; off?: boolean; active?: boolean; children: ReactNode }) => <button className={p.active ? 'ib active' : 'ib'} title={p.t} aria-label={p.t} aria-pressed={p.active} disabled={p.off} onClick={p.on}>{p.children}</button>;

  return <div className="app" onDragOver={e => e.preventDefault()} onDrop={async e => { e.preventDefault(); for (const f of e.dataTransfer.files) if (/\.svg$/i.test(f.name)) await addSvg('svg', { name: f.name, text: await f.text() }); else say('Şimdilik yalnız SVG bırakılabilir', true); }}>
    <header>
      <b className="logo">Baseline</b>
      <B t="Yeni" on={() => { if (okToLeave()) reset(newDoc(), null); }}><FilePlus2 /></B>
      <B t="Aç (Ctrl+O)" on={openDoc}><FolderOpen /></B>
      <B t="Kaydet (Ctrl+S)" on={saveDoc}><Save /></B>
      <i />
      <B t="Geri al (Ctrl+Z)" off={!past.current.length} on={() => step(past, future)}><Undo2 /></B>
      <B t="Yinele (Ctrl+Y)" off={!future.current.length} on={() => step(future, past)}><Redo2 /></B>
      <i />
      <B t="Taşı (W)" active={tool === 'translate'} on={() => setTool('translate')}><Move3d /></B>
      <B t="Döndür (E)" active={tool === 'rotate'} on={() => setTool('rotate')}><Rotate3d /></B>
      <B t="Ölçekle (R)" active={tool === 'scale'} on={() => setTool('scale')}><Scale3d /></B>
      <B t="Mıknatıs: kenara ve ortaya yapış" active={magnet} on={() => setMagnet(!magnet)}><Magnet /></B>
      <i />
      <B t="Çoğalt (Ctrl+D)" off={!sel.length} on={() => run(sel.map(id => ({ op: 'duplicate', id })), true)}><Copy /></B>
      <B t="Sil (Delete)" off={!sel.length} on={remove}><Trash2 /></B>
      <span className="file">{path ? path.split(/[\\/]/).pop() : 'Kaydedilmemiş belge'}{dirty ? ' •' : ''}</span>
      <button className="tb" onClick={() => setDialog('params')}><Grid3x3 />Parametreler</button>
      <button className="tb" onClick={() => setDialog('ai')}><Bot />Yapay zekâ</button>
      <B t="Güncellemeler" on={() => setDialog('update')}><RefreshCw /></B>
      <button className="tb primary" disabled={!doc.nodes.length} onClick={() => setDialog('export')}><Download />Dışa aktar</button>
    </header>
    <aside className="left">
      <h2>Şekiller</h2>
      <div className="shapes">{Object.entries(SHAPES).map(([t, s]) => <button key={t} onClick={() => t === 'svg' || t === 'balloonSvg' ? addSvg(t) : addShape(t)}>{ICONS[t]}<span>{s.label}</span></button>)}</div>
      <h2>Nesneler</h2>
      <div className="tree">{doc.nodes.length ? <Tree nodes={doc.nodes} sel={sel} built={built} pick={(id, add) => setSel(s => add ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id])} hide={n => run([{ op: 'update', id: n.id, hidden: !n.hidden }])} /> : <p className="hint">Soldan bir şekle tıkla ya da pencereye bir SVG bırak.</p>}</div>
    </aside>
    <main ref={host}>
      <div className="views">
        {([['iso', 'Perspektif'], ['top', 'Üst'], ['front', 'Ön'], ['right', 'Sağ']] as const).map(([v, l]) => <button key={v} onClick={() => vp.current?.view(v)}>{l}</button>)}
        <button title="Sığdır (F)" aria-label="Sığdır" onClick={() => vp.current?.fit()}><Maximize /></button>
      </div>
    </main>
    <aside className="right">
      {sel.length > 1 ? <>
        <h2>{sel.length} nesne seçili</h2>
        <button className="wide" disabled={!top} onClick={() => group('linked')}><Group />Bağla <small>birlikte hareket eder, ayrı parça kalır</small></button>
        <button className="wide" disabled={!top} onClick={() => group('fused')}><Shapes />Kaynaştır <small>tek gövde olur, delikler kesilir</small></button>
        <h2>İlkinin üstüne/yanına yapıştır</h2>
        <div className="grid3">{([['top', 'Üst'], ['left', 'Sol'], ['right', 'Sağ'], ['front', 'Ön'], ['back', 'Arka'], ['center', 'Orta']] as const).map(([side, l]) => <button key={side} disabled={!top} onClick={() => run(sel.slice(1).map(id => ({ op: 'place', id, on: sel[0], side })))}>{l}</button>)}</div>
      </> : node ? <Inspector key={node.id} node={node} vars={vars} run={run} isTop={doc.nodes.includes(node)} error={built.find(b => b.id === node.id)?.error} bounds={(() => { const b = built.find(x => x.id === node.id); return b && !b.error ? builtBounds(b) : null; })()} onUngroup={() => { const kids = node.children!.map(c => c.id); if (run([{ op: 'ungroup', id: node.id }])) setSel(kids); }} /> : <p className="hint">Düzenlemek için bir nesne seç. Shift ile birden çok seçilir.</p>}
    </aside>
    {dialog && <Modal close={() => setDialog(null)} title={{ export: 'Dışa aktar', ai: 'Yapay zekâ bağlantısı', update: 'Güncellemeler', params: 'Parametreler' }[dialog]}>
      {dialog === 'export' && <ExportBox built={built} name={path?.split(/[\\/]/).pop()?.replace('.baseline', '') ?? 'model'} say={say} close={() => setDialog(null)} />}
      {dialog === 'ai' && <AiBox path={path} />}
      {dialog === 'update' && <UpdateBox />}
      {dialog === 'params' && <ParamsBox doc={doc} vars={vars} run={run} />}
    </Modal>}
    {toast && <div className={toast.bad ? 'toast bad' : 'toast'} role="status">{toast.text}</div>}
  </div>;
}
const inside = (doc: Doc, parent: string, id: string) => { const p = find(doc.nodes, parent)?.node; return !!p?.children && !!find(p.children, id); };

function Tree(p: { nodes: Node[]; sel: string[]; built: Built[]; pick(id: string, add: boolean): void; hide(n: Node): void }) {
  return <ul>{p.nodes.map(n => { const err = p.built.find(b => b.id === n.id)?.error; return <li key={n.id}>
    <div className={p.sel.includes(n.id) ? 'row on' : 'row'}>
      <button className="name" title={err} onClick={e => p.pick(n.id, e.shiftKey || e.ctrlKey)}><span className="dot" style={{ background: n.hole ? 'repeating-linear-gradient(45deg,#888 0 2px,#fff 2px 4px)' : n.color || '#bbb' }} />{n.name}{n.children ? <small>{n.mode === 'fused' ? 'kaynaşık' : 'bağlı'}</small> : null}{err ? <small className="err">hata</small> : null}</button>
      <button className="eye" aria-label={n.hidden ? 'Göster' : 'Gizle'} onClick={() => p.hide(n)}>{n.hidden ? <EyeOff /> : <Eye />}</button>
    </div>
    {n.children && <Tree {...p} nodes={n.children} />}
  </li>; })}</ul>;
}

/** Sayı ya da "=formül" alanı. */
function NumBox({ value, vars, onCommit, label }: { value: Num; vars: Vars; onCommit(v: Num): boolean; label: string }) {
  const show = String(value), [t, setT] = useState(show);
  useEffect(() => setT(show), [show]);
  const done = () => {
    const s = t.trim().replace(/(\d),(\d)/g, '$1.$2'); if (s === show) return setT(show);
    const v: Num = /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : s.startsWith('=') ? s : '=' + s;
    if (!onCommit(v)) setT(show);
  };
  let res = ''; if (typeof value === 'string') try { res = `= ${r3(num(value, vars))}`; } catch { res = 'hata'; }
  return <label className="field"><span>{label}{res && <em>{res}</em>}</span><input value={t} onChange={e => setT(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setT(show); }} /></label>;
}
function TextBox({ value, onCommit, label }: { value: string; onCommit(v: string): void; label: string }) {
  const [t, setT] = useState(value); useEffect(() => setT(value), [value]);
  return <label className="field"><span>{label}</span><input value={t} onChange={e => setT(e.target.value)} onBlur={() => t !== value && onCommit(t)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></label>;
}
function Inspector({ node, vars, run, isTop, error, bounds, onUngroup }: { node: Node; vars: Vars; run(c: Command[]): boolean; isTop: boolean; error?: string; bounds: { min: number[]; max: number[] } | null; onUngroup(): void }) {
  const up = (x: object) => run([{ op: 'update', id: node.id, ...x }]);
  const vec = (k: 'pos' | 'rot' | 'scale', label: string) => <><h3>{label}</h3><div className="grid3">{['X', 'Y', 'Z'].map((a, i) => <NumBox key={a} label={a} value={node[k][i]} vars={vars} onCommit={v => up({ [k]: node[k].map((o, j) => j === i ? v : o) })} />)}</div></>;
  const own = node.type === 'svg' || node.type === 'balloonSvg' || !!node.children;
  return <>
    <TextBox label="Ad" value={node.name} onCommit={name => up({ name })} />
    {error && <p className="error">{error}</p>}
    {bounds && <p className="dims">{[0, 1, 2].map(i => r3(Math.round((bounds.max[i] - bounds.min[i]) * 100) / 100)).join(' × ')} mm</p>}
    {node.children && <>
      <div className="seg">{(['linked', 'fused'] as const).map(m => <button key={m} aria-pressed={node.mode === m} className={node.mode === m ? 'on' : ''} onClick={() => run([{ op: 'setMode', id: node.id, mode: m }])}>{m === 'linked' ? 'Bağlı' : 'Kaynaşık'}</button>)}</div>
      <button className="wide" onClick={onUngroup}><Ungroup />Serbest bırak</button>
    </>}
    {SHAPES[node.type]?.fields.map(f => {
      const v = node.params[f.key] ?? f.def, set = (x: Num) => up({ params: { [f.key]: x } });
      if (f.kind === 'text') return <TextBox key={f.key} label={f.label} value={String(v)} onCommit={set} />;
      if (f.kind === 'select') return <label className="field" key={f.key}><span>{f.label}</span><select value={String(v)} onChange={e => set(e.target.value)}>{f.options!.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select></label>;
      if (f.kind === 'svg') return <button key={f.key} className="wide" onClick={async () => { const x = await os.pickText('.svg'); if (x) set(x.text); }}><Shapes />SVG değiştir</button>;
      return <NumBox key={f.key} label={f.label} value={v} vars={vars} onCommit={set} />;
    })}
    <h3>Renk</h3>
    <div className="pal">{PALETTE.map(c => <button key={c} aria-label={c} className={node.color === c ? 'on' : ''} style={{ background: c }} onClick={() => up({ color: c, hole: false })} />)}
      <input type="color" aria-label="Özel renk" value={node.color || '#cccccc'} onChange={e => up({ color: e.target.value })} /></div>
    {own && node.color && <button className="wide" onClick={() => up({ color: '' })}>Kendi renklerine dön</button>}
    <div className="seg"><button aria-pressed={!node.hole} className={node.hole ? '' : 'on'} onClick={() => up({ hole: false })}>Katı</button><button aria-pressed={node.hole} className={node.hole ? 'on' : ''} onClick={() => up({ hole: true })}>Delik</button></div>
    {node.hole && <p className="hint">Kesmesi için katı bir nesneyle birlikte seçip “Kaynaştır”a bas.</p>}
    {vec('pos', 'Konum (mm)')}{vec('rot', 'Dönüş (°)')}{vec('scale', 'Ölçek')}
    {isTop && <button className="wide" onClick={() => run([{ op: 'place', id: node.id, on: 'plate' }])}>Tablaya oturt</button>}
  </>;
}

function Modal({ title, close, children }: { title: string; close(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onClose={close} onClick={e => { if (e.target === ref.current) close(); }}><div className="box"><h1>{title}</h1>{children}<button className="x" aria-label="Kapat" onClick={close}>×</button></div></dialog>;
}
function ExportBox({ built, name, say, close }: { built: Built[]; name: string; say(t: string, bad?: boolean): void; close(): void }) {
  const [fmt, setFmt] = useState('3mf'), [pr, setPr] = useState(PRINTERS[0].id), [busy, setBusy] = useState(false);
  const colors = new Set(built.flatMap(b => b.parts.filter(p => !p.hole).map(p => p.color)));
  const go = async () => {
    setBusy(true);
    try { const p = await os.writeFiles(await exportAll(built, fmt, name, PRINTERS.find(x => x.id === pr), os.desktop ? os.readProfile : undefined)); if (p) { say(`Kaydedildi: ${p}`); close(); } }
    catch (e) { say((e as Error)?.message ?? String(e), true); close(); }
    setBusy(false);
  };
  return <>
    <div className="seg">{['3mf', 'stl', 'obj'].map(f => <button key={f} aria-pressed={fmt === f} className={fmt === f ? 'on' : ''} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}</div>
    {fmt === '3mf' && <label className="field"><span>Yazıcı</span><select value={pr} onChange={e => setPr(e.target.value)}>{PRINTERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
    <p className="hint">{fmt === '3mf' ? (pr === 'generic' ? 'Standart renk bilgisi içerir; renk eşlemesini dilimleyici yapar.' : `Kurulu Bambu Studio’nun standart profili ve ${colors.size} renk dosyaya gömülür.`) : fmt === 'stl' ? `STL renk taşımaz${colors.size > 1 ? `; ${colors.size} renk için ${colors.size} hizalı dosya yazılır.` : '.'}` : 'Renkler yanındaki MTL dosyasında.'}</p>
    <button className="tb primary" disabled={busy} onClick={go}>{busy ? 'Hazırlanıyor…' : 'Kaydet'}</button>
  </>;
}
function AiBox({ path }: { path: string | null }) {
  const [p, setP] = useState('');
  useEffect(() => { os.mcpPath().then(setP, () => setP('')); }, []);
  const line = (label: string, s: string) => <div className="cmd"><b>{label}</b><code>{s}</code><button onClick={() => navigator.clipboard.writeText(s)}>Kopyala</button></div>;
  return <>
    <p>Bir kez bağla; sonra Claude ya da Codex’e “Baseline’da şunu yap” de. Açık belgeyi değiştirir, sonucu burada canlı görürsün, Ctrl+Z ile geri alırsın. Node.js gerekir.</p>
    {p ? <>{line('Claude Code', `claude mcp add --scope user baseline -- node "${p}"`)}{line('Codex', `codex mcp add baseline -- node "${p}"`)}</> : <p className="error">Köprü dosyası bulunamadı.</p>}
    <p className="hint">{path ? `Bağlı belge: ${path}` : 'Canlı çalışmak için önce belgeyi kaydet.'}</p>
  </>;
}
function UpdateBox() {
  const [s, setS] = useState<'busy' | 'none' | string | os.Release>('busy');
  useEffect(() => { os.latestRelease().then(r => setS(r ?? 'none'), e => setS(`Kontrol edilemedi: ${(e as Error).message}`)); }, []);
  return <>
    <p>Kurulu sürüm: <b>{pkg.version}</b></p>
    {s === 'busy' ? <p>Kontrol ediliyor…</p> : s === 'none' ? <p>GitHub’da herkese açık bir yayın yok.</p> : typeof s === 'string' ? <p className="error">{s}</p>
      : os.newer(s.version, pkg.version) ? <><p>Yeni sürüm: <b>{s.version}</b></p><pre>{s.notes}</pre><button className="tb primary" onClick={() => os.openLink(s.url)}>İndirme sayfasını aç</button></> : <p>En güncel sürümü kullanıyorsun.</p>}
  </>;
}
function ParamsBox({ doc, vars, run }: { doc: Doc; vars: Vars; run(c: Command[]): boolean }) {
  const [n, setN] = useState('');
  return <>
    <p className="hint">Ölçü kutularına <code>=tolerans*2</code> gibi formüller yazabilirsin. Buradaki değer değişince model de değişir.</p>
    {Object.entries(doc.params).map(([k, v]) => <div className="prow" key={k}><NumBox label={k} value={v} vars={vars} onCommit={x => run([{ op: 'setParam', name: k, value: x }])} /><button aria-label={`${k} sil`} onClick={() => run([{ op: 'setParam', name: k, value: null }])}><Trash2 /></button></div>)}
    <form className="prow" onSubmit={e => { e.preventDefault(); if (n in doc.params) return; if (run([{ op: 'setParam', name: n.trim(), value: 10 }])) setN(''); }}><label className="field"><span>Yeni parametre</span><input placeholder="kalinlik" value={n} onChange={e => setN(e.target.value)} /></label><button disabled={!n.trim()}>Ekle</button></form>
  </>;
}
