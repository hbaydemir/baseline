import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bot, Box, Brush, Circle, Cog, Copy, Cone, Cylinder, Diamond, Dices, Download, Eye, EyeOff, FilePlus2, FileUp, FolderOpen, Hexagon, Heart, LayoutTemplate, Magnet, Maximize, Move3d, Pentagon, PieChart, Pyramid, Redo2, RefreshCw, Rotate3d, Save, Scale3d, Shapes, Star, Torus, Trash2, Triangle, Type, Undo2, Wrench, Hammer, Nut, Ruler, DoorOpen, Package, TestTube2, Drill, Settings2, MousePointerClick, X, LifeBuoy, Gem, Sparkle, CircleDot, Lock, Columns2, Home, Egg, Earth, LoaderPinwheel } from 'lucide-react';
import pkg from '../../package.json';
import { apply, eulerOf, find, newDoc, parseDoc, serialize, type Command, type Doc, type Node, type V3 } from '../core/doc';
import { num, resolveParams, type Vars } from '../core/expr';
import { SHAPES } from '../core/shapes';
import { builtBounds, Kernel, partColors, type Built } from '../core/kernel';
import { exportAll, PRINTERS } from '../core/export';
import { importModel } from '../core/mesh';
import type { Stroke } from '../core/paint';
import { Viewport, type Moved, type Surface, type Tool } from './viewport';
import { Inspector, MultiPanel, DocPanel, PALETTE } from './Inspector';
import { VectorEditor, loadItems } from './VectorEditor';
import { Assistant, Library } from './Panels';
import * as V from './vector';
import * as os from './platform';

const ICONS: Record<string, ReactNode> = {
  box: <Box />, cylinder: <Cylinder />, sphere: <Circle />, hemisphere: <Earth />, cone: <Cone />, pyramid: <Pyramid />, roof: <Home />, roundRoof: <Egg />, torus: <Torus />, ringFlat: <CircleDot />, tube: <LifeBuoy />, wedge: <Triangle />,
  slice: <PieChart />, polygon: <Hexagon />, icosa: <Pentagon />, star: <Star />, star3d: <Sparkle />, heart: <Heart />, dice: <Dices />, diamond: <Gem />, paraboloid: <Diamond />, text: <Type />,
  gear: <Cog />, gearPair: <LoaderPinwheel />, hinge: <DoorOpen />, rail: <Columns2 />, boxLid: <Package />, bolt: <Wrench />, nut: <Nut />, screwHole: <Drill />, nutPocket: <Hexagon />, insertHole: <Hammer />, tolTest: <TestTube2 />,
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const r3 = (x: number) => Math.round(x * 1000) / 1000 + 0;
const MODEL = /\.(stl|obj|3mf)$/i;
type Dialog = 'export' | 'ai' | 'update' | 'assist' | 'library';
type Decal = { kind: 'raise' | 'cut'; depth: number };
type VecJob = { title: string; items: V.Item[]; guide?: string; save(svg: string, items: V.Item[]): void };

export function App({ kernel }: { kernel: Kernel }) {
  const [doc, setDocState] = useState<Doc>(newDoc);
  const docRef = useRef(doc), past = useRef<Doc[]>([]), future = useRef<Doc[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [path, setPathState] = useState<string | null>(null), pathRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [tool, setTool] = useState<Tool>('translate');
  const [magnet, setMagnet] = useState(true), [symmetric, setSymmetric] = useState(false), [uniform, setUniform] = useState(false);
  const [mode, setMode] = useState<'edit' | 'surface' | 'paint'>('edit');
  const [decal, setDecal] = useState<Decal>({ kind: 'raise', depth: 1 });
  const [brush, setBrush] = useState(0), [paintColor, setPaintColor] = useState('#e5484d');
  const [overhang, setOverhang] = useState(false);
  const [cat, setCat] = useState<'basic' | 'mech'>('basic');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [vec, setVec] = useState<VecJob | null>(null);
  const host = useRef<HTMLDivElement>(null), vp = useRef<Viewport | null>(null);
  const known = useRef<string | null>(null), chain = useRef(Promise.resolve());

  const say = useCallback((text: string, bad = false) => setToast({ text, bad }), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.bad ? 6000 : 3000); return () => clearTimeout(t); }, [toast]);

  const setDoc = useCallback((d: Doc) => { docRef.current = d; setDocState(d); }, []);
  const loadExternal = useCallback(async (p: string) => {
    const s = await os.stamp(p), d = parseDoc(await os.readText(p));
    known.current = s;
    if (serialize(d) !== serialize(docRef.current)) { past.current.push(docRef.current); future.current = []; setDoc(d); setSel(x => x.filter(id => find(d.nodes, id))); say('Belge dışarıdan güncellendi'); }
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
      known.current = await os.writeText(p, serialize(d));
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

  if (import.meta.env.DEV) (window as unknown as { __baseline: object }).__baseline = { doc: () => docRef.current, kernel };
  const [built, vars] = useMemo<[Built[], Vars]>(() => [kernel.build(doc), resolveParams(doc.params)], [doc, kernel]);
  const bounds = useCallback((id: string) => { const b = built.find(x => x.id === id); return b && !b.error && b.parts.length ? builtBounds(b) : null; }, [built]);

  // --- dosya ---
  const attach = useCallback((p: string | null) => { pathRef.current = p; setPathState(p); known.current = null; os.setActive(p).catch(() => {}); }, []);
  const reset = (d: Doc, p: string | null) => { past.current = []; future.current = []; attach(p); setDoc(d); setSel([]); setDirty(false); };
  const okToLeave = () => !dirty || confirm('Kaydedilmemiş değişiklikler silinsin mi?');
  const saveAs = async () => {
    if (!os.desktop) { os.download('model.baseline', serialize(doc)); setDirty(false); return; }
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

  /** Yeni nesneler için mevcutların sağında boş yer. */
  const freeX = (w: number) => { let x = -Infinity; for (const b of built) if (!b.error && b.parts.length) x = Math.max(x, builtBounds(b).max[0]); return Number.isFinite(x) ? r3(x + 5 + w / 2) : 0; };
  const placeNew = (ids: string[]) => { // eklenenleri boş yere taşı
    const d = docRef.current; if (d.nodes.length <= ids.length) return;
    try {
      const others = kernel.build({ ...d, nodes: d.nodes.filter(n => !ids.includes(n.id)) }).filter(b => !b.error && b.parts.length).map(builtBounds);
      const mine = ids.map(id => kernel.bounds(d, id)), lo = Math.min(...mine.map(b => b.min[0])), y0 = Math.min(...mine.map(b => b.min[1])), y1 = Math.max(...mine.map(b => b.max[1]));
      let x = -Infinity; for (const q of others) if (q.min[1] < y1 && q.max[1] > y0) x = Math.max(x, q.max[0]);
      if (Number.isFinite(x) && x > lo) setDoc(apply(d, ids.map(id => ({ op: 'move', id, d: [r3(x - lo + 5), 0, 0] }) as Command)).doc);
      persist();
    } catch { /* hata listede görünür */ }
  };
  const addShape = (type: string, extra: Partial<Extract<Command, { op: 'add' }>> = {}) => {
    try { const r = apply(docRef.current, [{ op: 'add', type, ...extra }], kernel.bounds); commit(r.doc); setSel(r.created); placeNew(r.created); }
    catch (e) { say((e as Error).message, true); }
  };
  /** STL / OBJ / 3MF / SVG içe aktarma: dosya seçiciden ya da sürükle-bırak. */
  const importFiles = useCallback((files: { name: string; data: Uint8Array }[]) => {
    for (const f of files) {
      try {
        if (/\.svg$/i.test(f.name)) { addShape('svg', { params: { svg: new TextDecoder().decode(f.data) }, name: f.name.replace(/\.svg$/i, '') }); continue; }
        if (/\.baseline$/i.test(f.name)) { const d = parseDoc(new TextDecoder().decode(f.data)); insertDoc(d, f.name.replace(/\.baseline$/i, '')); continue; }
        if (!MODEL.test(f.name)) { say(`Desteklenmeyen dosya: ${f.name}`, true); continue; }
        const r = importModel(kernel.wasm, f.name, f.data);
        const res = apply(docRef.current, [...r.cmds.assets.map(a => ({ op: 'asset', ...a }) as Command), ...r.cmds.nodes.map(n => ({ op: 'add', type: 'mesh', name: n.name, pos: n.pos, params: { asset: n.asset } }) as Command)], kernel.bounds);
        commit(res.doc); setSel(res.created); placeNew(res.created);
        const err = kernel.build(docRef.current).filter(b => res.created.includes(b.id) && b.error);
        say(err.length ? `${f.name}: ${err[0].error}` : `${f.name} eklendi (onarım: ${r.note})`, !!err.length);
      } catch (e) { say(`${f.name}: ${(e as Error).message}`, true); }
    }
  }, [kernel, say]); // eslint-disable-line react-hooks/exhaustive-deps
  const insertDoc = (d: Doc, name: string) => {
    try { const r = apply(docRef.current, [{ op: 'insert', doc: d, name }], kernel.bounds); commit(r.doc); setSel(r.created); placeNew(r.created); setDialog(null); }
    catch (e) { say((e as Error).message, true); }
  };
  const saveTemplate = async (name: string) => {
    const d = docRef.current, ids = sel.filter(id => d.nodes.some(n => n.id === id)), part: Doc = ids.length ? { ...d, nodes: d.nodes.filter(n => ids.includes(n.id)) } : d;
    if (!part.nodes.length) { say('Kaydedilecek nesne yok', true); return; }
    const safe = name.replace(/[\\/:*?"<>|]/g, '_');
    await os.libWrite(`user:Şablonlarım/${safe}.baseline`, serialize(part));
    const png = vp.current?.snapshot(); if (png) await os.libWrite(`user:Şablonlarım/${safe}.png`, Uint8Array.from(atob(png.split(',')[1]), c => c.charCodeAt(0)));
    say(`“${name}” şablonlarına kaydedildi`);
  };

  // --- görünüm ---
  const onMoved = useCallback((ms: Moved[]) => {
    const keep = (old: V3, now: number[], v: Vars) => old.map((o, i) => Math.abs(num(o, v) - now[i]) < 1e-4 ? o : r3(now[i])) as V3;
    const d = docRef.current, v = resolveParams(d.params);
    const cmds = ms.flatMap(m => { const n = find(d.nodes, m.id)?.node; if (!n) return []; const c = { op: 'update' as const, id: m.id, pos: keep(n.pos, m.pos, v), rot: keep(n.rot, m.rot, v), scale: keep(n.scale, m.scale, v) }; return same([c.pos, c.rot, c.scale], [n.pos, n.rot, n.scale]) ? [] : [c]; });
    if (cmds.length) run(cmds); else setDoc({ ...docRef.current }); // görünümü geri al
  }, [run, setDoc]);
  const handlers = useRef({ surface: (_: Surface) => {}, paint: (_: { id: string; pts: number[][]; n: number[]; r: number }) => {} });
  useEffect(() => {
    const v = new Viewport(host.current!, {
      select: (id, add) => setSel(s => !id ? (add ? s : []) : add ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id]),
      moved: onMoved, surface: s => handlers.current.surface(s), paint: p => handlers.current.paint(p),
    });
    vp.current = v; return () => { v.dispose(); vp.current = null; };
  }, [onMoved]);
  useEffect(() => { const v = vp.current; if (!v) return; v.tool = tool; v.magnet = magnet; v.symmetric = symmetric; v.uniform = uniform; v.brush = brush; v.setMode(mode); if (v.overhang !== overhang) v.setOverhang(overhang); v.update(built, mode === 'edit' ? sel : []); }, [built, sel, tool, magnet, symmetric, uniform, mode, brush, overhang]);

  /** Yüzeye çizim: seçilen yüzün düzleminde 2B düzenleyici açılır, kaydedince yüzeye 3B olarak oturur. */
  handlers.current.surface = (s: Surface) => {
    setMode('edit');
    const host = find(docRef.current.nodes, s.id)?.node; if (!host) return;
    setVec({
      title: `Yüzeye çiz: ${host.name}`, items: [], guide: s.outline,
      save: (svg, items) => {
        const b = V.bounds(items); if (!b) return;
        const N = s.n, X = s.x, Y = s.y, M = [[X[0], Y[0], N[0]], [X[1], Y[1], N[1]], [X[2], Y[2], N[2]]], rot = eulerOf(M).map(r3) as V3;
        const depth = decal.depth, cut = decal.kind === 'cut', embed = cut ? depth : 0.2, h = cut ? depth + 0.6 : depth + embed;
        const pos = s.origin.map((o, i) => r3(o - N[i] * embed)) as V3;
        const effects = [];
        if (!s.flat) { // eğri yüzey: çizimin altındaki yüzey yüksekliği
          const nx = 24, ny = 24, x0 = b.x0, x1 = b.x1, y0 = -b.y1, y1 = -b.y0, dx = (x1 - x0) / (nx - 1) || 1, dy = (y1 - y0) / (ny - 1) || 1, pts: [number, number][] = [];
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push([x0 + i * dx, y0 + j * dy]);
          const hs = vp.current!.heights(s.id, s, pts), ok = hs.filter(Number.isFinite), lo = ok.length ? Math.min(...ok) : 0;
          effects.push({ type: 'conform', params: { grid: JSON.stringify({ x: r3(x0), y: r3(y0), dx: r3(dx), dy: r3(dy), nx, ny, h: hs.map(v => r3(Number.isFinite(v) ? v : lo)) }) } });
        }
        const top = docRef.current.nodes.some(n => n.id === s.id), hostColor = host.color || '#cccccc', color = cut ? '' : items[0]?.fill && items[0].fill !== hostColor ? '' : PALETTE.find(c => c !== hostColor && c !== '#ffffff') ?? '#e5484d';
        const cmds: Command[] = [{ op: 'add', type: 'svg', id: undefined, name: cut ? 'Oyma' : 'Kabartma', params: { svg, width: 0, h: r3(h) }, pos, rot, hole: cut, color, effects, guide: s.outline }];
        try {
          const r = apply(docRef.current, cmds, kernel.bounds), id = r.created[0];
          const g = top ? apply(r.doc, [{ op: 'group', ids: [s.id, id], mode: 'fused', name: host.name }]) : r;
          commit(g.doc); setSel([top ? g.created[0] : id]); setVec(null);
          say(top ? 'Yüzeye eklendi; grubun içinden seçip düzenleyebilirsin' : 'Eklendi. Grup içindeki nesneye eklendiği için ayrı duruyor');
        } catch (e) { say((e as Error).message, true); }
      },
    });
  };
  handlers.current.paint = p => {
    const n = docRef.current.nodes.find(x => x.id === p.id); if (!n) return;
    const st: Stroke = { pts: p.pts, n: p.n, r: r3(p.r), color: paintColor };
    run([{ op: 'update', id: n.id, paint: [...(n.paint ?? []), st] }]);
  };
  /** Seçili nesneyi vektör düzenleyicide aç. */
  const editVector = (node: Node) => {
    let items: V.Item[] = [];
    try {
      const g = (k: string) => num(node.params[k] ?? SHAPES[node.type].fields.find(f => f.key === k)!.def, vars);
      if (node.type === 'svg') items = loadItems(String(node.params.svg), g('width'));
      else if (node.type === 'text') items = [{ id: V.newId(), subs: V.parseD(kernel.textPath(String(node.params.text ?? 'Merhaba'), g('size'))), fill: node.color || '#9b5de5', stroke: null, sw: 1, even: true }];
      else { const pr = kernel.profile({ ...node, params: { ...node.params, corner: 0 } }, vars)!; items = pr.map(r => { const polys = r.cs.toPolygons() as [number, number][][]; r.cs.delete(); return { id: V.newId(), subs: polys.map(p => ({ closed: true, pts: p.map(([x, y]) => ({ x, y: -y })) })), fill: r.color, stroke: null, sw: 1, even: true }; }); }
    } catch (e) { say((e as Error).message, true); return; }
    setVec({
      title: `Vektörde düzenle: ${node.name}`, items, guide: node.guide,
      save: svg => {
        const keep = ['h', 'corner', 'cornerStyle'].filter(k => node.params[k] !== undefined), params = { svg, width: 0, ...Object.fromEntries(keep.map(k => [k, node.params[k]])) };
        if (run([{ op: 'replace', id: node.id, type: 'svg', params, effects: node.effects }])) { setVec(null); say('Vektör çizim 3B’ye alındı'); }
      },
    });
  };
  const split = (node: Node) => {
    const b = bounds(node.id); if (!b) return;
    const w = b.max[0] - b.min[0], fx = node.effects ?? [], copy = `${node.id}_b`.replace(/[^\w-]/g, '');
    run([{ op: 'update', id: node.id, effects: [...fx, { type: 'cut', params: { axis: 'z', at: 50, keep: 'low' } }] }, { op: 'duplicate', id: node.id, newId: find(docRef.current.nodes, copy) ? undefined : copy, offset: [r3(w + 5), 0, 0] }]);
    const d = docRef.current, last = d.nodes[d.nodes.indexOf(find(d.nodes, node.id)!.node) + 1];
    if (last) run([{ op: 'update', id: last.id, effects: [...fx, { type: 'cut', params: { axis: 'z', at: 50, keep: 'high' } }] }, { op: 'place', id: last.id, on: 'plate' }]);
    say('İkiye bölündü. Kesim yönünü ve yerini “Efektler”den değiştirebilirsin');
  };

  const remove = () => { if (sel.length && run([{ op: 'remove', ids: sel.filter(id => !sel.some(o => o !== id && inside(doc, o, id))) }])) setSel([]); };
  const group = (mode: 'linked' | 'fused') => run([{ op: 'group', ids: sel, mode }], true);
  const importPick = async () => importFiles(await os.pickBytes('.stl,.obj,.3mf,.svg,.baseline'));
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = e => {
    if (vec || (e.target as HTMLElement).closest('input,textarea,select,dialog')) return;
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    const act = c && k === 'z' && !e.shiftKey ? () => step(past, future) : c && (k === 'y' || k === 'z') ? () => step(future, past) : c && k === 's' ? saveDoc : c && k === 'o' ? openDoc : c && k === 'i' ? importPick
      : c && k === 'd' ? () => sel.length && run(sel.map(id => ({ op: 'duplicate', id }) as Command), true) : c && k === 'g' ? () => sel.length > 1 && group('linked')
      : k === 'escape' ? () => setMode('edit')
      : k === 'delete' || k === 'backspace' ? remove : !c && k === 'w' ? () => setTool('translate') : !c && k === 'e' ? () => setTool('rotate') : !c && k === 'r' ? () => setTool('scale') : !c && k === 'f' ? () => vp.current?.fit() : null;
    if (act) { e.preventDefault(); void act(); }
  };
  useEffect(() => { const f = (e: KeyboardEvent) => keys.current(e); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f); }, [dirty]);

  const node = sel.length === 1 ? find(doc.nodes, sel[0])?.node : undefined;
  const top = sel.every(id => doc.nodes.some(n => n.id === id));
  const localDims = (id: string) => { const b = built.find(x => x.id === id); if (!b || b.error || !b.parts.length) return null; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of b.parts) for (let i = 0; i < p.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], p.positions[i]); hi[k] = Math.max(hi[k], p.positions[i]); } return hi.map((h, k) => h - lo[k]); };
  const B = (p: { t: string; on: () => void; off?: boolean; active?: boolean; children: ReactNode }) => <button className={p.active ? 'ib active' : 'ib'} title={p.t} aria-label={p.t} aria-pressed={p.active} disabled={p.off} onClick={p.on}>{p.children}</button>;
  const paintTarget = mode === 'paint';

  return <div className="app" onDragOver={e => e.preventDefault()} onDrop={async e => { e.preventDefault(); importFiles(await Promise.all([...e.dataTransfer.files].map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })))); }}>
    <header>
      <b className="logo">Baseline</b>
      <B t="Yeni" on={() => { if (okToLeave()) reset(newDoc(), null); }}><FilePlus2 /></B>
      <B t="Aç (Ctrl+O)" on={openDoc}><FolderOpen /></B>
      <B t="Kaydet (Ctrl+S)" on={saveDoc}><Save /></B>
      <button className="tb" title="STL, OBJ, 3MF ya da SVG ekle (Ctrl+I). Pencereye sürükleyip bırakabilirsin." onClick={importPick}><FileUp />İçe aktar</button>
      <i />
      <B t="Geri al (Ctrl+Z)" off={!past.current.length} on={() => step(past, future)}><Undo2 /></B>
      <B t="Yinele (Ctrl+Y)" off={!future.current.length} on={() => step(future, past)}><Redo2 /></B>
      <i />
      <B t="Taşı (W) — gövdeden tutunca yalnız X–Y" active={mode === 'edit' && tool === 'translate'} on={() => { setMode('edit'); setTool('translate'); }}><Move3d /></B>
      <B t="Döndür (E)" active={mode === 'edit' && tool === 'rotate'} on={() => { setMode('edit'); setTool('rotate'); }}><Rotate3d /></B>
      <B t="Ölçekle (R)" active={mode === 'edit' && tool === 'scale'} on={() => { setMode('edit'); setTool('scale'); }}><Scale3d /></B>
      {tool === 'scale' && mode === 'edit' && <>
        <button className={symmetric ? 'chip on' : 'chip'} title="Açık: iki yöne eşit büyür (Y+ ve Y−). Kapalı: yalnız tuttuğun yöne büyür." aria-pressed={symmetric} onClick={() => setSymmetric(!symmetric)}><Columns2 />Simetrik</button>
        <button className={uniform ? 'chip on' : 'chip'} title="Açık: X, Y, Z aynı oranda büyür. Kapalı: serbest." aria-pressed={uniform} onClick={() => setUniform(!uniform)}><Lock />Oranlı</button>
      </>}
      <B t="Mıknatıs: kenara ve ortaya yapış" active={magnet} on={() => setMagnet(!magnet)}><Magnet /></B>
      <i />
      <button className={mode === 'surface' ? 'tb active' : 'tb'} title="Bir yüzeye tıkla, üstüne yazı, şekil ya da SVG çiz" onClick={() => setMode(mode === 'surface' ? 'edit' : 'surface')}><MousePointerClick />Yüzeye çiz</button>
      <button className={mode === 'paint' ? 'tb active' : 'tb'} title="Yüzeyleri boya" onClick={() => setMode(mode === 'paint' ? 'edit' : 'paint')}><Brush />Boya</button>
      <i />
      <B t="Çoğalt (Ctrl+D)" off={!sel.length} on={() => run(sel.map(id => ({ op: 'duplicate', id })), true)}><Copy /></B>
      <B t="Sil (Delete)" off={!sel.length} on={remove}><Trash2 /></B>
      <span className="file">{path ? path.split(/[\\/]/).pop() : 'Kaydedilmemiş belge'}{dirty ? ' •' : ''}</span>
      <button className="tb" onClick={() => setDialog('library')}><LayoutTemplate />Şablonlar</button>
      <button className="tb" onClick={() => setDialog('assist')}><Settings2 />Baskı asistanı</button>
      <B t="Yapay zekâ bağlantısı" on={() => setDialog('ai')}><Bot /></B>
      <B t="Güncellemeler" on={() => setDialog('update')}><RefreshCw /></B>
      <button className="tb primary" disabled={!doc.nodes.length} onClick={() => setDialog('export')}><Download />Dışa aktar</button>
    </header>
    <aside className="left">
      <div className="seg tabs"><button className={cat === 'basic' ? 'on' : ''} onClick={() => setCat('basic')}><Shapes />Şekiller</button><button className={cat === 'mech' ? 'on' : ''} onClick={() => setCat('mech')}><Ruler />Mekanik</button></div>
      <div className="shapes">{Object.entries(SHAPES).filter(([, s]) => s.cat === cat).map(([t, s]) => <button key={t} title={s.label} onClick={() => addShape(t)}>{ICONS[t] ?? <Box />}<span>{s.label}</span></button>)}</div>
      <h2>Nesneler</h2>
      <div className="tree">{doc.nodes.length ? <Tree nodes={doc.nodes} sel={sel} built={built} pick={(id, add) => setSel(s => add ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id])} hide={n => run([{ op: 'update', id: n.id, hidden: !n.hidden }])} /> : <p className="hint">Soldan bir şekle tıkla, “İçe aktar” ile STL/3MF/OBJ/SVG ekle ya da dosyayı pencereye bırak.</p>}</div>
    </aside>
    <main ref={host}>
      <div className="views">
        {([['iso', 'Perspektif'], ['top', 'Üst'], ['front', 'Ön'], ['right', 'Sağ']] as const).map(([v, l]) => <button key={v} onClick={() => vp.current?.view(v)}>{l}</button>)}
        <button title="Sığdır (F)" aria-label="Sığdır" onClick={() => vp.current?.fit()}><Maximize /></button>
        <button className={overhang ? 'on' : ''} title="Destek gereken yerleri göster" aria-pressed={overhang} onClick={() => setOverhang(!overhang)}>Destek</button>
      </div>
      {mode === 'surface' && <div className="banner">
        <b>Bir yüzeye tıkla</b><span>Açılan çizim alanında yazı, şekil ya da SVG ekle; kaydedince yüzeye oturur.</span>
        <div className="seg"><button className={decal.kind === 'raise' ? 'on' : ''} onClick={() => setDecal({ ...decal, kind: 'raise' })}>Kabartma</button><button className={decal.kind === 'cut' ? 'on' : ''} onClick={() => setDecal({ ...decal, kind: 'cut' })}>Oyma</button></div>
        <label className="mini">{decal.kind === 'cut' ? 'Derinlik' : 'Yükseklik'} <input type="number" min={0.2} step={0.2} value={decal.depth} onChange={e => setDecal({ ...decal, depth: Math.max(0.1, +e.target.value || 0.1) })} /> mm</label>
        <button className="ib" aria-label="Kapat" onClick={() => setMode('edit')}><X /></button>
      </div>}
      {paintTarget && <div className="banner">
        <b>Boya</b>
        <div className="pal">{PALETTE.map(c => <button key={c} aria-label={c} className={paintColor === c ? 'on' : ''} style={{ background: c }} onClick={() => setPaintColor(c)} />)}</div>
        <label className="mini">Fırça <input type="range" min={0} max={10} step={0.5} value={brush} onChange={e => setBrush(+e.target.value)} /> {brush ? `${brush} mm` : 'yüzün tamamı'}</label>
        <span>{brush ? 'Basılı tutup boya.' : 'Tıkladığın yüzün tamamı boyanır.'} Renkler çok renkli 3MF’e aktarılır.</span>
        <button className="ib" aria-label="Kapat" onClick={() => setMode('edit')}><X /></button>
      </div>}
    </main>
    <aside className="right">
      {sel.length > 1 ? <MultiPanel count={sel.length} top={top} run={c => run(c, true)} sel={sel} bounds={bounds} />
        : node ? <Inspector key={node.id} node={node} vars={vars} run={run} isTop={doc.nodes.includes(node)} error={built.find(b => b.id === node.id)?.error}
          dims={(() => { const b = bounds(node.id); return b ? [0, 1, 2].map(i => b.max[i] - b.min[i]) : null; })()} local={doc.nodes.includes(node) ? localDims(node.id) : null}
          uniform={uniform} setUniform={setUniform}
          onUngroup={() => { const kids = node.children!.map(c => c.id); if (run([{ op: 'ungroup', id: node.id }])) setSel(kids); }}
          onVector={() => editVector(node)} onSplit={() => split(node)} onTemplate={() => { const n = prompt('Şablon adı', node.name); if (n) void saveTemplate(n); }} onPaint={() => setMode('paint')} />
          : <DocPanel doc={doc} vars={vars} run={run} />}
    </aside>
    {dialog && <Modal wide={dialog === 'assist' || dialog === 'library'} close={() => setDialog(null)} title={{ export: 'Dışa aktar', ai: 'Yapay zekâ bağlantısı', update: 'Güncellemeler', assist: 'Baskı asistanı', library: 'Şablonlar ve tasarım havuzu' }[dialog]}>
      {dialog === 'export' && <ExportBox built={built} name={path?.split(/[\\/]/).pop()?.replace('.baseline', '') ?? 'model'} say={say} close={() => setDialog(null)} />}
      {dialog === 'ai' && <AiBox path={path} />}
      {dialog === 'update' && <UpdateBox />}
      {dialog === 'assist' && <Assistant built={built} overhang={overhang} setOverhang={setOverhang} />}
      {dialog === 'library' && <Library insert={insertDoc} importFile={(n, d) => { importFiles([{ name: n, data: d }]); setDialog(null); }} say={say} saveCurrent={saveTemplate} />}
    </Modal>}
    {vec && <VectorEditor kernel={kernel} title={vec.title} initial={vec.items} guide={vec.guide} onSave={vec.save} onClose={() => setVec(null)} />}
    {toast && <div className={toast.bad ? 'toast bad' : 'toast'} role="status">{toast.text}</div>}
    <span hidden>{freeX(0)}</span>
  </div>;
}
const inside = (doc: Doc, parent: string, id: string) => { const p = find(doc.nodes, parent)?.node; return !!p?.children && !!find(p.children, id); };

function Tree(p: { nodes: Node[]; sel: string[]; built: Built[]; pick(id: string, add: boolean): void; hide(n: Node): void }) {
  return <ul>{p.nodes.map(n => { const err = p.built.find(b => b.id === n.id)?.error; return <li key={n.id}>
    <div className={p.sel.includes(n.id) ? 'row on' : 'row'}>
      <button className="name" title={err} onClick={e => p.pick(n.id, e.shiftKey || e.ctrlKey)}><span className="dot" style={{ background: n.hole ? 'repeating-linear-gradient(45deg,#888 0 2px,#fff 2px 4px)' : n.color || '#bbb' }} />{n.name}{n.children ? <small>{n.mode === 'fused' ? 'kaynaşık' : 'bağlı'}</small> : null}{n.effects?.length ? <small>✦</small> : null}{err ? <small className="err">hata</small> : null}</button>
      <button className="eye" aria-label={n.hidden ? 'Göster' : 'Gizle'} onClick={() => p.hide(n)}>{n.hidden ? <EyeOff /> : <Eye />}</button>
    </div>
    {n.children && <Tree {...p} nodes={n.children} />}
  </li>; })}</ul>;
}

function Modal({ title, close, children, wide }: { title: string; close(): void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={wide ? 'big' : ''} onClose={close} onClick={e => { if (e.target === ref.current) close(); }}><div className="box"><h1>{title}</h1>{children}<button className="x" aria-label="Kapat" onClick={close}>×</button></div></dialog>;
}
function ExportBox({ built, name, say, close }: { built: Built[]; name: string; say(t: string, bad?: boolean): void; close(): void }) {
  const [fmt, setFmt] = useState('3mf'), [pr, setPr] = useState(PRINTERS[0].id), [busy, setBusy] = useState(false);
  const colors = new Set(built.flatMap(b => b.parts.filter(p => !p.hole).flatMap(partColors)));
  const go = async () => {
    setBusy(true);
    try { const p = await os.writeFiles(await exportAll(built, fmt, name, PRINTERS.find(x => x.id === pr), os.desktop ? os.readProfile : undefined)); if (p) { say(`Kaydedildi: ${p}`); close(); } }
    catch (e) { say((e as Error)?.message ?? String(e), true); close(); }
    setBusy(false);
  };
  return <>
    <div className="seg">{['3mf', 'stl', 'obj'].map(f => <button key={f} aria-pressed={fmt === f} className={fmt === f ? 'on' : ''} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}</div>
    {fmt === '3mf' && <label className="field"><span>Yazıcı</span><select value={pr} onChange={e => setPr(e.target.value)}>{PRINTERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
    <p className="hint">{fmt === '3mf' ? (pr === 'generic' ? 'Renkler ve boyalı yüzeyler dosyada; renk eşlemesini dilimleyici yapar.' : `Kurulu Bambu Studio’nun standart profili ve ${colors.size} renk dosyaya gömülür.`) : fmt === 'stl' ? `STL renk taşımaz${colors.size > 1 ? `; ${colors.size} renk için ${colors.size} hizalı dosya yazılır (boyalı yüzeyler gövdenin rengini alır).` : '.'}` : 'Renkler ve boyalı yüzeyler yanındaki MTL dosyasında.'}</p>
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
