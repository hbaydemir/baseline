import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, Upload, Minus, Square, ArrowDownToLine, ChevronUp, Scissors, Sun, Moon, Bot, Box, Brush, Circle, Cog, Copy, Cone, Cylinder, Diamond, Dices, Download, Eye, EyeOff, FilePlus2, FileUp, FolderOpen, Hexagon, Heart, LayoutTemplate, Magnet, Maximize, Move3d, Pentagon, PieChart, Pyramid, Redo2, RefreshCw, Rotate3d, Save, Scale3d, Shapes, Star, Torus, Trash2, Triangle, Type, Undo2, Wrench, Hammer, Nut, Ruler, DoorOpen, Package, TestTube2, Drill, Settings2, MousePointerClick, X, LifeBuoy, Gem, Sparkle, CircleDot, Lock, Columns2, Home, Egg, Earth, LoaderPinwheel } from 'lucide-react';
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
import type { Sketch } from './vectorIO';
import { Wordmark, LogoIcon } from './Logo';
import { PanelGrip, usePanel } from './Tabs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { VectorApi } from './VectorEditor';
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
type Dialog = 'export' | 'ai' | 'update' | 'assist' | 'library' | 'which' | 'save';
type Decal = { kind: 'raise' | 'cut'; depth: number };
type VecJob = { title: string; items: V.Item[]; guide?: string; hint?: string; save(svg: string, items: V.Item[]): void; to2d?(items: V.Item[]): void };

export function App({ kernel }: { kernel: Kernel }) {
  const [doc, setDocState] = useState<Doc>(newDoc);
  const docRef = useRef(doc), past = useRef<Doc[]>([]), future = useRef<Doc[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [path, setPathState] = useState<string | null>(null), pathRef = useRef<string | null>(null);
  const [dirty, setDirty] = useState(false);
  type Kind = 'ok' | 'info' | 'warn' | 'err';
  const [toast, setToast] = useState<{ text: string; kind: Kind; n: number } | null>(null);
  const panel = usePanel();
  const [cm3, setCm3] = useState<null | { x: number; y: number; id: string | null }>(null);
  const [hideIntro, setHideIntro] = useState(false), [renaming, setRenaming] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('translate');
  const [magnet, setMagnet] = useState(true), [symmetric, setSymmetric] = useState(false), [uniform, setUniform] = useState(false);
  const [mode, setMode] = useState<'edit' | 'surface' | 'paint' | 'measure'>('edit');
  const [decal, setDecalState] = useState<Decal>({ kind: 'raise', depth: 1 }), decalRef = useRef(decal);
  const setDecal = (d: Decal) => { decalRef.current = d; setDecalState(d); };
  const [brush, setBrush] = useState(0), [paintColor, setPaintColor] = useState('#e5484d');
  const [overhang, setOverhang] = useState(false);
  // açılışta ve 6 saatte bir yeni sürüm var mı bak
  const [upd, setUpd] = useState<os.Release | null>(null);
  useEffect(() => {
    const check = () => os.latestRelease().then(r => setUpd(r && os.newer(r.version, pkg.version) ? r : null), () => { /* çevrimdışı */ });
    const t0 = setTimeout(check, 1500), t = setInterval(check, 6 * 3600e3); return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => { try { return (localStorage.getItem('baseline-theme') as 'light' | 'dark') || 'system'; } catch { return 'system'; } });
  const [sysDark, setSysDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => { const m = matchMedia('(prefers-color-scheme: dark)'), f = () => setSysDark(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  const dark = theme === 'dark' || (theme === 'system' && sysDark);
  const setTheme = (t: 'light' | 'dark') => { setThemeState(t); try { localStorage.setItem('baseline-theme', t); } catch { /* yok */ } };
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; vp.current?.setTheme(dark); }, [dark]);
  const [pop, setPop] = useState<'basic' | 'mech' | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [vec, setVec] = useState<VecJob | null>(null);
  const [is2d, setIs2dState] = useState(false), [ever2d, setEver2d] = useState(false), [sketchGen, setSketchGen] = useState(0), [exp2d, setExp2d] = useState(false);
  const vapi = useRef<VectorApi | null>(null);
  const setIs2d = (v: boolean) => { if (!v) flushSketch(); setIs2dState(v); if (v) { setEver2d(true); setMode('edit'); } };
  const sketchTimer = useRef(0), pendingSketch = useRef<Sketch | null>(null);
  /** Vektör çizimi belgeye yazar (geri alma geçmişine girmez; 2B'nin kendi geçmişi var). */
  const writeSketch = (sk: Sketch) => { const empty = !sk.items.length && sk.boards.length <= 1 && !sk.guides.length; if (empty && !docRef.current.sketch) return; if (JSON.stringify(sk) === JSON.stringify(docRef.current.sketch ?? null)) return; setDoc({ ...docRef.current, sketch: sk }); setDirty(true); persist(); };
  const onSketch = (sk: Sketch) => { pendingSketch.current = sk; clearTimeout(sketchTimer.current); sketchTimer.current = window.setTimeout(flushSketch, 600); };
  const flushSketch = () => { clearTimeout(sketchTimer.current); const sk = pendingSketch.current; pendingSketch.current = null; if (sk) writeSketch(sk); };
  const host = useRef<HTMLDivElement>(null), vp = useRef<Viewport | null>(null);
  const known = useRef<string | null>(null), chain = useRef(Promise.resolve());

  /** Bildirim: true = hata; tür verilmezse metinden çıkarılır (kaydedildi, eklendi… başarı). */
  const say = useCallback((text: string, kind: boolean | Kind = false) => setToast(t => ({ text, n: (t?.n ?? 0) + 1, kind: kind === true ? 'err' : kind === false ? (/kaydedildi|kopyalandı|kesildi|alındı|eklendi|yerleştirildi|güncellendi/i.test(text) ? 'ok' : 'info') : kind })), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.kind === 'err' ? 6000 : toast.kind === 'warn' ? 5000 : 3000); return () => clearTimeout(t); }, [toast]);

  const setDoc = useCallback((d: Doc) => { docRef.current = d; setDocState(d); }, []);
  const loadExternal = useCallback(async (p: string) => {
    const s = await os.stamp(p), d = parseDoc(await os.readText(p));
    known.current = s;
    if (serialize(d) !== serialize(docRef.current)) { const skChanged = JSON.stringify(d.sketch ?? null) !== JSON.stringify(docRef.current.sketch ?? null); past.current.push(docRef.current); future.current = []; setDoc(d); setSel(x => x.filter(id => find(d.nodes, id))); if (skChanged) setSketchGen(g => g + 1); say('Belge dışarıdan güncellendi'); }
    setDirty(false);
  }, [say, setDoc]);
  /** Yazmadan önce dosyanın başkası (ör. Claude) tarafından değişip değişmediğine bakar. */
  const persist = useCallback(() => {
    const p = pathRef.current; if (!p) return;
    chain.current = chain.current.then(async () => {
      if (pathRef.current !== p) return;
      const now = await os.stamp(p);
      if (known.current && now && now !== known.current) { await loadExternal(p); say('Dosya dışarıda değişmişti; o sürüm yüklendi. Seninki için Ctrl+Z', 'warn'); return; }
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
  // belgedeki sistem fontlarını yükle; yüklenince yeniden üret
  const [fontTick, setFontTick] = useState(0), tried = useRef(new Set<string>());
  useEffect(() => {
    const need = new Set<string>(); const walk = (ns: Node[]) => ns.forEach(n => { if (n.type === 'text' && n.params.font) need.add(String(n.params.font)); if (n.children) walk(n.children); }); walk(doc.nodes);
    for (const k of need) if (!kernel.hasFont(k) && !tried.current.has(k)) {
      tried.current.add(k);
      os.readFont(k).then(d => { if (d) { kernel.addFont(k, d); setFontTick(t => t + 1); } else say(`“${k.replace('|', ' ')}” yazı tipi bu bilgisayarda yok; Baloo kullanılıyor`, 'warn'); }, e => say(`Yazı tipi okunamadı: ${e?.message ?? e}`, true));
    }
  }, [doc, kernel, say]);
  const [built, vars] = useMemo<[Built[], Vars]>(() => [kernel.build(doc), resolveParams(doc.params)], [doc, kernel, fontTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useCallback((id: string) => { const b = built.find(x => x.id === id); return b && !b.error && b.parts.length ? builtBounds(b) : null; }, [built]);

  // --- dosya ---
  const attach = useCallback((p: string | null) => { pathRef.current = p; setPathState(p); known.current = null; os.setActive(p).catch(() => {}); }, []);
  const reset = (d: Doc, p: string | null) => { pendingSketch.current = null; clearTimeout(sketchTimer.current); past.current = []; future.current = []; attach(p); setDoc(d); setSel([]); setDirty(false); setSketchGen(g => g + 1); };
  /** Açılan belgeye göre 2D ya da 3D; ikisi de varsa sor. */
  const pickView = (d: Doc) => { const s = (d.sketch as Sketch | undefined)?.items?.length ?? 0, n = d.nodes.length; if (s && n) setDialog('which'); else setIs2d(!!s && !n); };
  const okToLeave = () => !dirty || confirm('Kaydedilmemiş değişiklikler silinsin mi?');
  const saveAs = async () => {
    flushSketch();
    if (!os.desktop) { os.download('model.baseline', serialize(docRef.current)); setDirty(false); return; }
    const p = await os.pickSave(path ? path.split(/[\/]/).pop()! : 'model.baseline'); if (!p) return;
    attach(p.endsWith('.baseline') ? p : p + '.baseline'); persist(); say('Kaydedildi; artık her değişiklik otomatik kaydedilir');
  };
  const saveDoc = async () => { flushSketch(); if (path) { persist(); say('Kaydedildi'); } else await saveAs(); };
  const openDoc = async () => {
    if (!okToLeave()) return;
    try {
      if (!os.desktop) { const f = await os.pickText('.baseline'); if (f) { const d = parseDoc(f.text); reset(d, null); pickView(d); } return; }
      const p = await os.pickOpen(); if (!p) return;
      const s = await os.stamp(p), d = parseDoc(await os.readText(p)); reset(d, p); known.current = s; pickView(d);
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
    if (!part.nodes.length) { say('Kaydedilecek nesne yok', 'warn'); return; }
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
      moved: onMoved, surface: s => handlers.current.surface(s), paint: p => handlers.current.paint(p), menu: m => setCm3(m),
    });
    vp.current = v; v.setTheme(document.documentElement.dataset.theme === 'dark'); return () => { v.dispose(); vp.current = null; };
  }, [onMoved]);
  useEffect(() => { const v = vp.current; if (!v) return; v.tool = tool; v.magnet = magnet; v.symmetric = symmetric; v.uniform = uniform; v.brush = brush; v.setMode(mode); if (v.overhang !== overhang) v.setOverhang(overhang); v.update(built, mode === 'edit' ? sel : []); }, [built, sel, tool, magnet, symmetric, uniform, mode, brush, overhang]);

  /** Yüzeye çizim: seçilen yüzün düzleminde 2B düzenleyici açılır, kaydedince yüzeye 3B olarak oturur. */
  const pendingSurface = useRef<V.Item[] | null>(null);
  /** Öğeleri yüzey sınırının ortasına taşır. */
  const centerOn = (its: V.Item[], outline: string) => { pendingSurface.current = null; const g = V.bounds([{ id: 0, subs: V.parseD(V.joinOutline(outline)), fill: null, stroke: null, sw: 0, even: false }]), b = V.bounds(its); if (!g || !b) return its; const k = Math.min(1, 0.9 * (g.x1 - g.x0) / ((b.x1 - b.x0) || 1), 0.9 * (g.y1 - g.y0) / ((b.y1 - b.y0) || 1)), bx = (b.x0 + b.x1) / 2, by = (b.y0 + b.y1) / 2, gx = (g.x0 + g.x1) / 2, gy = (g.y0 + g.y1) / 2; return its.map(it => V.mapItem(it, (x, y) => [gx + (x - bx) * k, gy + (y - by) * k], k)); };
  /** Yüzeye çizden 2D sayfasına: yüzeyin şekli kilitli, yazdırılmayan katmanda; tasarım yeni artboardda. */
  const sendTo2d = (its: V.Item[], outline: string, name: string) => {
    flushSketch();
    const sk: Sketch = structuredClone((docRef.current.sketch as Sketch | undefined) ?? { items: [], boards: [{ id: 1, name: 'A4', x: 0, y: 0, w: 210, h: 297 }], guides: [], mode: 'rgb' });
    V.bumpId([...sk.items, ...sk.boards, ...(sk.layers ?? [])]);
    const subs = V.parseD(V.joinOutline(outline)), g = V.bounds([{ id: 0, subs, fill: null, stroke: null, sw: 0, even: false }]); if (!g) return;
    const m = 5, bx = sk.boards.length ? Math.max(...sk.boards.map(b => b.x + b.w)) + 20 : 0, board = { id: V.newId(), name: `Yüzey: ${name}`.slice(0, 40), x: bx, y: sk.boards[0]?.y ?? 0, w: Math.round((g.x1 - g.x0 + 2 * m) * 10) / 10, h: Math.round((g.y1 - g.y0 + 2 * m) * 10) / 10 };
    const dx = board.x + m - g.x0, dy = board.y + m - g.y0, mv = (it: V.Item) => V.mapItem(it, (x, y) => [x + dx, y + dy]);
    const layers = sk.layers?.length ? [...sk.layers] : [{ id: V.newId(), name: 'Katman 1' }];
    let lim = layers.find(l => l.name === 'Yüzey sınırları'); if (!lim) { lim = { id: V.newId(), name: 'Yüzey sınırları', locked: true, noPrint: true }; layers.push(lim); }
    const draw = layers.find(l => l !== lim)!.id;
    const outlineItem: V.Item = mv({ id: V.newId(), subs, fill: null, stroke: '#ff0000', sw: 0.1, even: false, fixedStroke: true, name: `Yüzey sınırı: ${name}`, layer: lim.id });
    writeSketch({ ...sk, layers, boards: [...sk.boards, board], items: [...sk.items, outlineItem, ...its.map(it => ({ ...mv(it), id: V.newId(), layer: draw }))] });
    setSketchGen(n => n + 1); setVec(null); setIs2d(true); say('Yüzey ve tasarım 2D sayfasına yeni artboard olarak eklendi');
  };
  handlers.current.surface = (s: Surface) => {
    setMode('edit');
    const host = find(docRef.current.nodes, s.id)?.node; if (!host) return;
    setVec({
      title: `Yüzeye çiz: ${host.name}`, items: pendingSurface.current ? centerOn(pendingSurface.current, s.outline) : [], guide: s.outline,
      to2d: its => sendTo2d(its, s.outline, host.name),
      save: (svg, items) => {
        const b = V.bounds(items); if (!b) return;
        const N = s.n, X = s.x, Y = s.y, M = [[X[0], Y[0], N[0]], [X[1], Y[1], N[1]], [X[2], Y[2], N[2]]], rot = eulerOf(M).map(r3) as V3;
        const depth = decalRef.current.depth, cut = decalRef.current.kind === 'cut', embed = cut ? depth : 0.2, h = cut ? depth + 0.6 : depth + embed;
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
  /** Bölme: nesne bir bölme grubuna sarılır; ayarlar sağ panelde. */
  const startSplit = (node: Node) => { if (run([{ op: 'split', id: node.id }], true)) say('Kesim düzlemini ve kilitleri sağ panelden ayarla. Bitince görünümü “Baskı yerleşimi” yap'); };
  /** Kilitleri kesit üzerinde elle yerleştir. */
  const editPins = (node: Node) => {
    let info; try { info = kernel.splitInfo(docRef.current, node.id); } catch (e) { say((e as Error).message, true); return; }
    const items: V.Item[] = info.pts.map(p => ({ id: V.newId(), subs: [V.ellipseSub(p.x, -p.y, p.d / 2, p.d / 2)], fill: '#ff8a00', stroke: null, sw: 1, even: false }));
    setVec({
      title: `Kilit yerleri: ${node.name}`, items, guide: info.outline, hint: 'Turuncu daireler kilit yerleri: taşı, çoğalt (Ctrl+D), sil ya da boyutunu değiştir. Kesik çizgi kesitin sınırı.',
      save: (_svg, its) => {
        const pins = its.map(it => V.bounds([it])!).map(b => [r3((b.x0 + b.x1) / 2), r3(-(b.y0 + b.y1) / 2), r3(Math.min(b.x1 - b.x0, b.y1 - b.y0))]);
        if (run([{ op: 'update', id: node.id, params: { pins: JSON.stringify(pins), count: 0 } }])) { setVec(null); say(`${pins.length} kilit elle yerleştirildi`); }
      },
    });
  };

  // --- seç, kopyala, yapıştır ---
  const clip = useRef<Doc | null>(null), pasteN = useRef(0);
  const selectAll = () => { setSel(docRef.current.nodes.filter(n => !n.hidden).map(n => n.id)); setMode('edit'); };
  const copySel = (cutToo: boolean) => {
    const d = docRef.current, ids = sel.filter(id => d.nodes.some(n => n.id === id)); if (!ids.length) return;
    const part: Doc = { ...d, nodes: d.nodes.filter(n => ids.includes(n.id)) }; clip.current = structuredClone(part); pasteN.current = 0;
    navigator.clipboard?.writeText(serialize(part)).catch(() => {});
    if (cutToo) { if (run([{ op: 'remove', ids }])) setSel([]); say(`${ids.length} nesne kesildi`); } else say(`${ids.length} nesne kopyalandı`);
  };
  const paste = async () => {
    let d = clip.current;
    try {
      const t = (await navigator.clipboard?.readText())?.trim();
      if (t && /^<svg[\s>]/i.test(t.replace(/^<\?xml[^>]*>\s*/i, ''))) { addShape('svg', { params: { svg: t }, name: 'Yapıştırılan SVG' }); return; }
      if (t && /"format"\s*:\s*"baseline"/.test(t)) d = parseDoc(t);
    } catch { /* panoya erişim yoksa iç pano */ }
    if (!d) return;
    pasteN.current++; const off = 10 * pasteN.current;
    try { const r = apply(docRef.current, [{ op: 'insert', doc: d }], kernel.bounds); const moved = apply(r.doc, r.created.map(id => ({ op: 'move', id, d: [off, off, 0] }) as Command)); commit(moved.doc); setSel(r.created); }
    catch (e) { say((e as Error).message, true); }
  };
  const remove = () => { if (sel.length && run([{ op: 'remove', ids: sel.filter(id => !sel.some(o => o !== id && inside(doc, o, id))) }])) setSel([]); };
  const group = (mode: 'linked' | 'fused') => run([{ op: 'group', ids: sel, mode }], true);
  const importPick = async () => importFiles(await os.pickBytes('.stl,.obj,.3mf,.svg,.baseline'));
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = e => {
    if (vec || (e.target as HTMLElement).closest('input,textarea,select,dialog')) return;
    const k = e.key.toLowerCase(), c = e.ctrlKey || e.metaKey;
    if (is2d) { const f = c && k === 's' && e.shiftKey ? saveAs : c && k === 's' ? saveDoc : c && k === 'o' ? openDoc : null; if (f) { e.preventDefault(); void f(); } return; }
    if (k === 'tab' && !c && !e.altKey) { e.preventDefault(); panel.toggle(); return; }
    const act = c && k === 'a' ? selectAll : c && k === 'c' ? () => copySel(false) : c && k === 'x' ? () => copySel(true) : c && k === 'v' ? paste
      : c && k === 'z' && !e.shiftKey ? () => step(past, future) : c && (k === 'y' || k === 'z') ? () => step(future, past) : c && k === 's' && e.shiftKey ? saveAs : c && k === 's' ? saveDoc : c && k === 'o' ? openDoc : c && k === 'i' ? importPick
      : c && k === 'd' ? () => sel.length && run(sel.map(id => ({ op: 'duplicate', id }) as Command), true) : c && k === 'g' ? () => sel.length > 1 && group('linked')
      : k === 'escape' ? () => { setMode('edit'); setPop(null); } : !c && k === 'm' ? () => setMode(mode === 'measure' ? 'edit' : 'measure')
      : k === 'delete' || k === 'backspace' ? remove : !c && k === 'w' ? () => setTool('translate') : !c && k === 'e' ? () => setTool('rotate') : !c && k === 'r' ? () => setTool('scale') : !c && k === 'f' ? () => vp.current?.fit() : null;
    if (act) { e.preventDefault(); void act(); }
  };
  useEffect(() => { const f = (e: KeyboardEvent) => keys.current(e); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, []);
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); }; addEventListener('beforeunload', f); return () => removeEventListener('beforeunload', f); }, [dirty]);

  const node = sel.length === 1 ? find(doc.nodes, sel[0])?.node : undefined;
  const top = sel.every(id => doc.nodes.some(n => n.id === id));
  const localDims = (id: string) => { const b = built.find(x => x.id === id); if (!b || b.error || !b.parts.length) return null; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of b.parts) for (let i = 0; i < p.positions.length; i++) { const k = i % 3; lo[k] = Math.min(lo[k], p.positions[i]); hi[k] = Math.max(hi[k], p.positions[i]); } return hi.map((h, k) => h - lo[k]); };
  const D = (p: { t: string; on: () => void; off?: boolean; active?: boolean; children: ReactNode }) => <button className={p.active ? 'db active' : 'db'} data-tip={p.t} aria-label={p.t} aria-pressed={p.active} disabled={p.off} onClick={p.on}>{p.children}</button>;
  const canSplit = !!node && top && !node.hole && node.mode !== 'split';
  const B = (p: { t: string; on: () => void; off?: boolean; active?: boolean; children: ReactNode }) => <button className={p.active ? 'ib active' : 'ib'} title={p.t} aria-label={p.t} aria-pressed={p.active} disabled={p.off} onClick={p.on}>{p.children}</button>;
  const paintTarget = mode === 'paint';
  /** Sol panelin altındaki kart: yapay zekâ, tema, sürüm ve güncelleme. */
  const sideCard = <div className="sidecard">
    <button className="sc-row" onClick={() => setDialog('ai')}><Bot /><span>Yapay zekâ</span></button>
    <button className="sc-row" onClick={() => setTheme(dark ? 'light' : 'dark')} title="Temayı değiştir">{dark ? <Moon /> : <Sun />}<span>{dark ? 'Dark' : 'Light'}</span><i className={dark ? 'sc-sw on' : 'sc-sw'} /></button>
    <div className="sc-row sc-ver"><RefreshCw /><span>v{pkg.version}{upd && <small>Yeni: v{upd.version}</small>}</span><button className={upd ? 'tb primary sc-up' : 'tb sc-up'} onClick={() => setDialog('update')}>{upd ? 'Güncelle' : 'Denetle'}</button></div>
  </div>;

  useEffect(() => { if (!cm3) return; const f = () => setCm3(null); setTimeout(() => addEventListener('pointerdown', f), 0); addEventListener('keydown', f); return () => { removeEventListener('pointerdown', f); removeEventListener('keydown', f); }; }, [cm3]);
  useEffect(() => { if (!pop) return; const f = () => setPop(null); addEventListener('click', f); return () => removeEventListener('click', f); }, [pop]);
  return <div style={{ '--rw': panel.collapsed ? '0px' : `${panel.width}px` } as React.CSSProperties} className={is2d ? 'app is2d' : 'app'} onDragOver={e => e.preventDefault()} onDrop={async e => { e.preventDefault(); const fs = await Promise.all([...e.dataTransfer.files].map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))); if (is2d) vapi.current?.drop(fs); else importFiles(fs); }}>
    <header data-tauri-drag-region>
      <div className="h-left" data-tauri-drag-region>
        <span className="logo"><Wordmark height={19} /></span>
        <div className="mode-sw" role="tablist" aria-label="Çalışma alanı">
          <button role="tab" aria-selected={is2d} className={is2d ? 'on' : ''} title="2D: vektör çizim sayfası" onClick={() => setIs2d(true)}>2D</button>
          <button role="tab" aria-selected={!is2d} className={!is2d ? 'on' : ''} title="3D: model" onClick={() => setIs2d(false)}>3D</button>
        </div>
      </div>
      <div className="h-mid" data-tauri-drag-region>
        <button className="tb" title="Yeni belge" onClick={() => { if (okToLeave()) reset(newDoc(), null); }}><FilePlus2 />Yeni</button>
        <button className="tb" title="Aç (Ctrl+O)" onClick={openDoc}><FolderOpen />Aç</button>
        <button className="tb save-b" title={`${path ? path.split(/[\\/]/).pop() : 'Kaydedilmemiş belge'}${dirty ? ' · kaydedilmemiş değişiklik var' : ''} (Ctrl+S)`} onClick={() => { flushSketch(); setDialog('save'); }}><Save />Kaydet{dirty && <span className="dirty-dot" aria-label="Kaydedilmemiş değişiklik var" />}</button>
        <button className="tb" title={is2d ? 'Resim (JPG, PNG, TIFF…), PDF, AI, SVG, DXF ekle. Sürükleyip bırakabilirsin.' : 'STL, OBJ, 3MF ya da SVG ekle (Ctrl+I). Pencereye sürükleyip bırakabilirsin.'} onClick={() => is2d ? vapi.current?.importPick() : importPick()}><Upload />İçe aktar</button>
        <div className="hmenu"><button className="tb primary" disabled={!is2d && !doc.nodes.length} onClick={() => is2d ? setExp2d(!exp2d) : setDialog('export')}><Download />Dışa aktar</button>
          {is2d && exp2d && <div className="hpop" onClick={() => setExp2d(false)}>
            {([['pdf-pages', 'PDF — her artboard ayrı sayfa', ''], ['pdf-one', 'PDF — tek sayfa', 'Tüm artboardlar tek sayfada'], ['ai', 'AI (Illustrator)', 'PDF uyumlu; Illustrator ve Corel açar'], ['svg-free', 'SVG', ''], ['png', 'PNG', 'Her artboard ayrı resim'], ['jpg', 'JPG', 'Her artboard ayrı resim'], ['dxf', 'DXF', 'Lazer için; katmanlar renge göre']] as const).map(([k, l, d]) => <button key={k} onClick={() => vapi.current?.exportAs(k)}>{l}{d && <small>{d}</small>}</button>)}
          </div>}</div>
      </div>
      <div className="h-right" data-tauri-drag-region>
        {os.desktop && <WindowButtons close={() => { if (okToLeave()) void getCurrentWindow().close(); }} />}
      </div>
    </header>
    <aside className="left">
      <h2>Nesneler</h2>
      <div className="tree">{doc.nodes.length ? <Tree nodes={doc.nodes} sel={sel} built={built} pick={(id, add) => setSel(s => add ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id])} hide={n => run([{ op: 'update', id: n.id, hidden: !n.hidden }])} rename={(n, name) => run([{ op: 'update', id: n.id, name }])} editing={renaming} setEditing={setRenaming} /> : <p className="hint">Henüz nesne yok.</p>}</div>
      {sideCard}
    </aside>
    <main ref={host} onPointerDown={() => { if (!hideIntro) setHideIntro(true); }}>
      {!doc.nodes.length && !is2d && !hideIntro && <div className="empty3d" onPointerDown={e => e.stopPropagation()}><button className="ib x" aria-label="Kapat" title="Kapat" onClick={() => setHideIntro(true)}><X /></button><LogoIcon size={56} /><b>Modele başla</b><p>Alttaki araç kutusundan bir şekil ekle, bir STL / 3MF / OBJ / SVG dosyasını pencereye bırak ya da şablonlardan başla.</p><div className="row2"><button className="tb" onClick={() => setDialog('library')}>Şablonlar</button><button className="tb" onClick={() => setIs2d(true)}>2D çizime geç</button></div></div>}
      <div className="views">
        {([['iso', 'Perspektif'], ['top', 'Üst'], ['front', 'Ön'], ['right', 'Sağ']] as const).map(([v, l]) => <button key={v} onClick={() => vp.current?.view(v)}>{l}</button>)}
        <button title="Sığdır (F)" aria-label="Sığdır" onClick={() => vp.current?.fit()}><Maximize /></button>
        <button className={overhang ? 'on' : ''} title="Destek gereken yerleri göster" aria-pressed={overhang} onClick={() => setOverhang(!overhang)}>Destek</button>
      </div>
      {(() => { if (!sel.length) return null; const bs = sel.map(bounds).filter((b): b is NonNullable<typeof b> => !!b); if (!bs.length) return null;
        const lo = [0, 1, 2].map(i => Math.min(...bs.map(b => b.min[i]))), hi = [0, 1, 2].map(i => Math.max(...bs.map(b => b.max[i]))), f = (v: number) => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
        return <div className="dimstrip">{sel.length > 1 && <span className="ds-n">{sel.length} nesne · toplam</span>}<span><em>En</em> {f(hi[0] - lo[0])}</span><span><em>Boy</em> {f(hi[1] - lo[1])}</span><span><em>Yükseklik</em> {f(hi[2] - lo[2])} mm</span><span className="ds-pos">X {f((lo[0] + hi[0]) / 2)} · Y {f((lo[1] + hi[1]) / 2)}</span></div>; })()}
      <div className="dock" onClick={e => e.stopPropagation()}>
        {pop && <div className="pop" role="dialog">
          {pop === 'basic' || pop === 'mech' ? <><b>{pop === 'basic' ? 'Şekiller' : 'Mekanik parçalar'}</b><div className="shapes">{Object.entries(SHAPES).filter(([, s]) => s.cat === pop).map(([t, s]) => <button key={t} title={s.label} onClick={() => { addShape(t); setPop(null); }}>{ICONS[t] ?? <Box />}<span>{s.label}</span></button>)}</div></> : null}
        </div>}
        <D t="Geri al (Ctrl+Z)" off={!past.current.length} on={() => step(past, future)}><Undo2 /></D>
        <D t="Yinele (Ctrl+Y)" off={!future.current.length} on={() => step(future, past)}><Redo2 /></D>
        <i />
        <D t="Taşı (W) — gövdeden tutunca yalnız X–Y" active={mode === 'edit' && tool === 'translate'} on={() => { setMode('edit'); setTool('translate'); }}><Move3d /></D>
        <D t="Döndür (E)" active={mode === 'edit' && tool === 'rotate'} on={() => { setMode('edit'); setTool('rotate'); }}><Rotate3d /></D>
        <D t="Ölçekle (R)" active={mode === 'edit' && tool === 'scale'} on={() => { setMode('edit'); setTool('scale'); }}><Scale3d /></D>
        {tool === 'scale' && mode === 'edit' && <>
          <button className={symmetric ? 'dchip on' : 'dchip'} data-tip="Açık: iki yöne eşit büyür. Kapalı: yalnız tuttuğun yöne." aria-pressed={symmetric} onClick={() => setSymmetric(!symmetric)}><Columns2 />Simetrik</button>
          <button className={uniform ? 'dchip on' : 'dchip'} data-tip="Açık: X, Y, Z aynı oranda büyür" aria-pressed={uniform} onClick={() => setUniform(!uniform)}><Lock />Oranlı</button>
        </>}
        <D t="Mıknatıs: kenara ve ortaya yapış" active={magnet} on={() => setMagnet(!magnet)}><Magnet /></D>
        <i />
        <D t="Böl (kesim düzlemi ve kilitler)" off={!canSplit} on={() => node && startSplit(node)}><Scissors /></D>
        <D t="Tablaya oturt" off={!sel.length || !top} on={() => run(sel.map(id => ({ op: 'place', id, on: 'plate' }) as Command))}><ArrowDownToLine /></D>
        <D t="Çoğalt (Ctrl+D)" off={!sel.length} on={() => run(sel.map(id => ({ op: 'duplicate', id })), true)}><Copy /></D>
        <D t="Sil (Delete)" off={!sel.length} on={remove}><Trash2 /></D>
        <i />
        <D t="Şekiller" active={pop === 'basic'} on={() => setPop(pop === 'basic' ? null : 'basic')}><Shapes /><ChevronUp className="up" /></D>
        <D t="Mekanik parçalar" active={pop === 'mech'} on={() => setPop(pop === 'mech' ? null : 'mech')}><Cog /><ChevronUp className="up" /></D>
        <i />
        <D t="Boya" active={mode === 'paint'} on={() => setMode(mode === 'paint' ? 'edit' : 'paint')}><Brush /></D>
        <D t="Ölç (M)" active={mode === 'measure'} on={() => setMode(mode === 'measure' ? 'edit' : 'measure')}><Ruler /></D>
        <i />
        <D t="Şablonlar ve tasarım havuzu" on={() => setDialog('library')}><LayoutTemplate /></D>
        <D t="Baskı asistanı" on={() => setDialog('assist')}><Settings2 /></D>
      </div>
      {mode === 'measure' && <div className="banner"><b>Ölç</b><span>İki noktaya tıkla; köşeye ve kenar ortasına yapışır (Shift: serbest). Yeni ölçü için tekrar tıkla.</span><button onClick={() => { setMode('edit'); setTimeout(() => setMode('measure'), 0); }}>Temizle</button><button className="ib" aria-label="Kapat" onClick={() => setMode('edit')}><X /></button></div>}
      {mode === 'surface' && <div className="banner">
        <b>Bir yüze tıkla</b><span>Çizim, tıkladığın yüze oturtulmak üzere açılır.</span>
        <button className="ib" aria-label="Vazgeç" onClick={() => { pendingSurface.current = null; setMode('edit'); }}><X /></button>
      </div>}
      {paintTarget && <div className="banner">
        <b>Boya</b>
        <div className="pal">{PALETTE.map(c => <button key={c} aria-label={c} className={paintColor === c ? 'on' : ''} style={{ background: c }} onClick={() => setPaintColor(c)} />)}</div>
        <label className="mini">Fırça <input type="range" min={0} max={10} step={0.5} value={brush} onChange={e => setBrush(+e.target.value)} /> {brush ? `${brush} mm` : 'yüzün tamamı'}</label>
        <span>{brush ? 'Basılı tutup boya.' : 'Tıkladığın yüzün tamamı boyanır.'} Renkler çok renkli 3MF’e aktarılır.</span>
        <button className="ib" aria-label="Kapat" onClick={() => setMode('edit')}><X /></button>
      </div>}
    </main>
    <aside className={panel.collapsed ? 'right folded' : 'right'}>
      <PanelGrip />
      {sel.length > 1 ? <MultiPanel count={sel.length} top={top} run={c => run(c, true)} sel={sel} bounds={bounds} />
        : node ? <Inspector key={node.id} node={node} vars={vars} run={run} isTop={doc.nodes.includes(node)} error={built.find(b => b.id === node.id)?.error}
          dims={(() => { const b = bounds(node.id); return b ? [0, 1, 2].map(i => b.max[i] - b.min[i]) : null; })()} local={doc.nodes.includes(node) ? localDims(node.id) : null}
          uniform={uniform} setUniform={setUniform}
          onUngroup={() => { const kids = node.children!.map(c => c.id); if (run([{ op: 'ungroup', id: node.id }])) setSel(kids); }}
          onVector={() => editVector(node)} onSplit={() => startSplit(node)} onPins={() => editPins(node)} onTemplate={() => { const n = prompt('Şablon adı', node.name); if (n) void saveTemplate(n); }} onPaint={() => setMode('paint')} />
          : <DocPanel doc={doc} vars={vars} run={run} />}
    </aside>
    {dialog && <Modal wide={dialog === 'assist' || dialog === 'library'} close={() => setDialog(null)} title={{ export: 'Dışa aktar', ai: 'Yapay zekâ bağlantısı', update: 'Güncellemeler', assist: 'Baskı asistanı', library: 'Şablonlar ve tasarım havuzu', which: 'Belgeyi aç', save: 'Kaydet' }[dialog]}>
      {dialog === 'export' && <ExportBox built={built} name={path?.split(/[\\/]/).pop()?.replace('.baseline', '') ?? 'model'} say={say} close={() => setDialog(null)} />}
      {dialog === 'ai' && <AiBox path={path} />}
      {dialog === 'update' && <UpdateBox known={upd} />}
      {dialog === 'save' && <div className="savebox">
        <p className="sv-name"><Save /><span><b>{path ? path.split(/[\\/]/).pop() : 'Kaydedilmemiş belge'}</b><small>{path ? (dirty ? 'Kaydedilmemiş değişiklikler var' : 'Tüm değişiklikler kaydedildi') : 'Henüz bir dosyaya kaydedilmedi'}</small></span></p>
        <div className="row2">
          {path && <button className="tb primary" onClick={() => { setDialog(null); void saveDoc(); }}>Üzerine kaydet</button>}
          <button className={path ? 'tb' : 'tb primary'} onClick={() => { setDialog(null); void saveAs(); }}>{path ? 'Farklı kaydet…' : 'Kaydet…'}</button>
          <button className="tb" onClick={() => setDialog(null)}>Vazgeç</button>
        </div>
        <p className="hint">Kayıtlı bir belgede her değişiklik otomatik kaydedilir. Ctrl+S üzerine kaydeder, Ctrl+Shift+S farklı kaydeder.</p>
      </div>}
      {dialog === 'which' && <><p>Bu belgede hem 3D model hem vektör çizim var. Hangisini açayım?</p><div className="row2"><button className="tb primary" onClick={() => { setDialog(null); setIs2d(false); }}>3D model</button><button className="tb" onClick={() => { setDialog(null); setIs2d(true); }}>Vektör çizim</button></div><p className="hint">Sonra soldaki 2D / 3D anahtarıyla geçebilirsin.</p></>}
      {dialog === 'assist' && <Assistant built={built} overhang={overhang} setOverhang={setOverhang} />}
      {dialog === 'library' && <Library insert={insertDoc} importFile={(n, d) => { importFiles([{ name: n, data: d }]); setDialog(null); }} say={say} saveCurrent={saveTemplate} />}
    </Modal>}
    {vec && <VectorEditor kernel={kernel} title={vec.title} initial={vec.items} guide={vec.guide} note={vec.hint} onSave={vec.save} onSendTo2d={vec.to2d} onClose={() => setVec(null)} decal={vec.to2d ? decal : undefined} onDecal={setDecal} />}
    {ever2d && <VectorEditor key={sketchGen} kernel={kernel} title="" initial={[]} onClose={() => setIs2d(false)} free={{
      sketch: (docRef.current.sketch as Sketch | undefined) ?? null, hidden: !is2d, api: vapi, onChange: onSketch, footer: sideCard,
      onToSurface: its => { if (!its.length) return; pendingSurface.current = its; setIs2d(false); setMode('surface'); say('Çizimi oturtmak için 3D modelde bir yüze tıkla'); },
      onInsert: (svgText, its, sk) => {
        const b = V.bounds(its); if (!b) return;
        try {
          const r = apply({ ...docRef.current, sketch: sk }, [{ op: 'add', type: 'svg', name: 'Vektör çizim', params: { svg: svgText, width: r3(b.x1 - b.x0), h: 2 } }], kernel.bounds);
          pendingSketch.current = null; commit(r.doc); setSel(r.created); setIs2dState(false); setMode('edit'); say('Vektör çizim 3B’ye alındı');
        } catch (e) { say((e as Error).message, true); }
      },
    }} />}
    {cm3 && <div className="vcm" style={{ left: Math.min(cm3.x, innerWidth - 230), top: Math.min(cm3.y, innerHeight - 300) }} onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}>
      {cm3.id ? <>
        <button onClick={() => { setCm3(null); vp.current?.surfaceAtMenu(); }} disabled={!vp.current?.hasMenuFace()}>Yüzeye çiz<small>bu yüze yazı / şekil</small></button><i />
        <button onClick={() => { setCm3(null); run(sel.map(id => ({ op: 'duplicate', id }) as Command), true); }}>Çoğalt<small>Ctrl+D</small></button>
        <button onClick={() => { setCm3(null); copySel(false); }}>Kopyala<small>Ctrl+C</small></button>
        <button onClick={() => { setCm3(null); run(sel.map(id => ({ op: 'place', id, on: 'plate' }) as Command)); }} disabled={!top}>Tablaya oturt</button>
        <button onClick={() => { setCm3(null); const n = find(doc.nodes, cm3.id!)?.node; if (n) run([{ op: 'update', id: n.id, hidden: true }]); }}>Gizle</button>
        <button onClick={() => { setCm3(null); remove(); }}>Sil<small>Delete</small></button>
      </> : <>
        <button onClick={() => { setCm3(null); void paste(); }}>Yapıştır<small>Ctrl+V</small></button>
        <button onClick={() => { setCm3(null); selectAll(); }}>Tümünü seç<small>Ctrl+A</small></button>
      </>}
    </div>}
    {toast && <div key={toast.n} className={`toast t-${toast.kind}`} role={toast.kind === 'err' ? 'alert' : 'status'}>{{ ok: <CheckCircle2 />, info: <Info />, warn: <AlertTriangle />, err: <XCircle /> }[toast.kind]}<span>{toast.text}</span></div>}
    <span hidden>{freeX(0)}</span>
  </div>;
}
const inside = (doc: Doc, parent: string, id: string) => { const p = find(doc.nodes, parent)?.node; return !!p?.children && !!find(p.children, id); };

function WindowButtons({ close }: { close(): void }) {
  const [max, setMax] = useState(false);
  useEffect(() => { const w = getCurrentWindow(); let off: (() => void) | undefined; void w.isMaximized().then(setMax); void w.onResized(() => { void w.isMaximized().then(setMax); }).then(u => { off = u; }); return () => off?.(); }, []);
  return <div className="winbtns">
    <button aria-label="Simge durumuna küçült" title="Küçült" onClick={() => void getCurrentWindow().minimize()}><Minus /></button>
    <button aria-label={max ? 'Önceki boyut' : 'Tam ekran'} title={max ? 'Önceki boyut' : 'Tam ekran'} onClick={() => void getCurrentWindow().toggleMaximize()}>{max ? <Copy className="wb-rest" /> : <Square />}</button>
    <button className="wb-close" aria-label="Kapat" title="Kapat" onClick={close}><X /></button>
  </div>;
}
function Tree(p: { nodes: Node[]; sel: string[]; built: Built[]; pick(id: string, add: boolean): void; hide(n: Node): void; rename(n: Node, name: string): void; editing: string | null; setEditing(id: string | null): void }) {
  return <ul>{p.nodes.map(n => { const err = p.built.find(b => b.id === n.id)?.error; return <li key={n.id}>
    <div className={p.sel.includes(n.id) ? 'row on' : 'row'}>
      {p.editing === n.id ? <input className="rename" autoFocus defaultValue={n.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== n.name) p.rename(n, v); p.setEditing(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') p.setEditing(null); }} /> :
      <button className="name" title={err ?? 'Çift tıkla: yeniden adlandır'} onDoubleClick={() => p.setEditing(n.id)} onClick={e => p.pick(n.id, e.shiftKey || e.ctrlKey)}><span className="dot" style={{ background: n.hole ? 'repeating-linear-gradient(45deg,#888 0 2px,#fff 2px 4px)' : n.color || '#bbb' }} />{n.name}{n.children ? <small>{n.mode === 'fused' ? 'birleşik' : n.mode === 'split' ? 'bölme' : 'grup'}</small> : null}{n.effects?.length ? <small>✦</small> : null}{err ? <small className="err">hata</small> : null}</button>}
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
function UpdateBox({ known }: { known: os.Release | null }) {
  const [s, setS] = useState<'busy' | 'none' | string | os.Release>(known ?? 'busy');
  useEffect(() => { if (known) return; os.latestRelease().then(r => setS(r ?? 'none'), e => setS(`Kontrol edilemedi: ${(e as Error).message}`)); }, []);
  return <>
    <p>Kurulu sürüm: <b>{pkg.version}</b></p>
    {s === 'busy' ? <p>Kontrol ediliyor…</p> : s === 'none' ? <p>GitHub’da herkese açık bir yayın yok.</p> : typeof s === 'string' ? <p className="error">{s}</p>
      : os.newer(s.version, pkg.version) ? <><p>Yeni sürüm: <b>{s.version}</b></p><pre>{s.notes}</pre><button className="tb primary" onClick={() => os.openLink(s.url)}>İndirme sayfasını aç</button></> : <p>En güncel sürümü kullanıyorsun.</p>}
  </>;
}
