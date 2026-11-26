// 2B vektör düzenleyici (CorelDRAW alışkanlıklarıyla): yüzeye çiz, vektörde düzenle, kilit yerleri ve serbest vektör çizimi.
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as PE, type ReactNode } from 'react';
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter,
  ArrowDownToLine, ArrowUpToLine, Box, ChevronUp, Combine, Copy, Crosshair, Eraser, Eye, EyeOff, FileDown, FileUp, FlipHorizontal2, FlipVertical2, Group, Hand, ImageUp, Lock, LockOpen,
  Magnet, Maximize, Printer, PrinterX, Merge, MousePointer2, PenTool, Pencil, Pipette, Plus, Redo2, RotateCcw, RotateCw, Ruler, Scissors, Shapes, Spline, SquaresExclude, SquaresIntersect, SquaresSubtract, Trash2, Type, Undo2, Ungroup, X, ZoomIn,
} from 'lucide-react';
import type { Kernel } from '../core/kernel';
import { plainPaths } from '../core/svg';
import * as V from './vector';
import * as O from './vectorOps';
import * as IO from './vectorIO';
import * as C from './color';
import * as os from './platform';
import { FontPicker } from './FontPicker';
import { ColorPicker } from './ColorPicker';

type Tool = 'select' | 'node' | 'knife' | 'eraser' | 'draw' | 'pen' | 'shape' | 'text' | 'dim' | 'pick' | 'zoom' | 'pan';
type Sel = { item: number; sub: number; i: number };
type P = V.V;
type BoxT = IO.Box;
const clone = (a: V.Item[]) => structuredClone(a);
/** Noktaları elle değişen yazı artık yol olur. */
const unText = (b: V.Item[], id: number) => { const it = b.find(x => x.id === id)!; it.text = undefined; return it; };
const PRESETS: [string, number, number][] = [['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['Kartvizit', 85, 55], ['Kare 100', 100, 100]];
const DASHES: [string, number[]][] = [['Düz', []], ['Kesikli', [2, 1]], ['Uzun kesik', [4, 1.5]], ['Noktalı', [0.3, 0.8]], ['Kesik-nokta', [3, 1, 0.3, 1]]];
const SHAPE_KEYS: Record<string, string> = { F6: 'rect', F7: 'ellipse', y: 'polygon' };

/** SVG metnini düzenleyici öğelerine çevirir; width > 0 ise o genişliğe ölçekleyip ortalar (SVG şekliyle aynı). */
export function loadItems(svg: string, width: number): V.Item[] {
  let items: V.Item[] = plainPaths(svg).map(p => ({ id: V.newId(), subs: V.parseD(p.d), fill: p.fill, stroke: p.stroke, sw: p.sw || 1, even: p.even }));
  const b = V.bounds(items);
  if (width > 0 && b) { const k = width / (b.x1 - b.x0), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; items = items.map(it => V.mapItem(it, (x, y) => [(x - cx) * k, (y - cy) * k], k)); }
  return items;
}

export interface VectorApi { importPick(): void; exportAs(kind: string): void; drop(files: { name: string; data: Uint8Array }[]): void }
export interface FreeMode {
  sketch: IO.Sketch | null; hidden?: boolean; api?: MutableRefObject<VectorApi | null>;
  onChange?(sketch: IO.Sketch): void; onInsert(svg: string, items: V.Item[], sketch: IO.Sketch): void; onToSurface?(items: V.Item[]): void;
}
const IMG_EXT = /\.(png|jpe?g|webp|bmp|gif|tiff?)$/i;
/** Resim dosyasını PNG/JPG veri adresine çevirir (TIFF dahil); piksel ölçüsüyle. */
async function imageData(name: string, data: Uint8Array): Promise<{ src: string; w: number; h: number }> {
  let blob: Blob;
  if (/\.tiff?$/i.test(name)) {
    const UTIF = (await import('utif')).default ?? (await import('utif'));
    const ifds = UTIF.decode(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)); UTIF.decodeImage(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]), cv = document.createElement('canvas'); cv.width = ifds[0].width; cv.height = ifds[0].height;
    cv.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), cv.width, cv.height), 0, 0);
    blob = await new Promise<Blob>((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('TIFF okunamadı')), 'image/png'));
  } else blob = new Blob([data.slice()], { type: /\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : '' });
  const bmp = await createImageBitmap(blob), src = await new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(blob); });
  const out = { src, w: bmp.width, h: bmp.height }; bmp.close(); return out;
}
interface Props { kernel: Kernel; title: string; initial: V.Item[]; guide?: string; note?: string; onSave?(svg: string, items: V.Item[]): void; onClose(): void; free?: FreeMode; onSendTo2d?(items: V.Item[]): void }

export function VectorEditor({ kernel, title, initial, guide, note, onSave, onClose, free, onSendTo2d }: Props) {
  const isFree = !!free, hidden = !!free?.hidden;
  const [assets, setAssets] = useState<Record<string, string>>(free?.sketch?.assets ?? {});
  const [layers, setLayers] = useState<IO.Layer[]>(() => free?.sketch?.layers?.length ? free.sketch.layers : [{ id: 1, name: 'Katman 1' }]);
  const [activeLayer, setActiveLayer] = useState<number>(() => (free?.sketch?.layers?.[0]?.id) ?? 1);
  const [patterns, setPatterns] = useState<Record<string, IO.Pattern>>(free?.sketch?.patterns ?? {});
  const [items, setItemsState] = useState<V.Item[]>(() => { const its = free?.sketch?.items ?? initial; V.bumpId(its); return its; });
  const itemsRef = useRef(items), past = useRef<V.Item[][]>([]), future = useRef<V.Item[][]>([]);
  const [sel, setSelRaw] = useState<number[]>([]);
  const lastPick = useRef<number | null>(null);
  const [nodes, setNodes] = useState<Sel[]>([]);
  const [segs, setSegs] = useState<Sel[]>([]);
  const [tool, setToolRaw] = useState<Tool>('select');
  const [shapeId, setShapeId] = useState('rect');
  const [sides, setSides] = useState(6);
  const [view, setView] = useState({ x: 0, y: 0, s: 6 }); // s: px / mm
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [mode, setModeState] = useState<C.Mode>(free?.sketch?.mode ?? 'rgb');
  const [fill, setFill] = useState<string | null>('#4f8cff');
  const [stroke, setStroke] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [picker, setPicker] = useState<null | 'fill' | 'stroke' | 'shadow' | 'stop'>(null);
  const [corner, setCorner] = useState(1);
  const [textDef, setTextDef] = useState({ size: 10, font: '' });
  const [pen, setPen] = useState<V.Sub | null>(null);
  const [draft, setDraft] = useState<{ a: P; b: P } | null>(null);
  const [ink, setInk] = useState<P[] | null>(null);
  const [line, setLine] = useState<{ a: P; b: P } | null>(null); // bıçak / ölçü
  const [marq, setMarq] = useState<{ a: P; b: P } | null>(null);
  const [xform, setXform] = useState<'scale' | 'rotate'>('scale');
  const [rc, setRc] = useState<P | null>(null);
  const [magnet, setMagnet] = useState(true);
  const [snapL, setSnapL] = useState<{ x?: number; y?: number }>({});
  const [boards, setBoards] = useState<IO.Board[]>(() => free ? free.sketch?.boards?.length ? free.sketch.boards : [{ id: 1, name: 'A4', x: 0, y: 0, w: 210, h: 297 }] : []);
  const [selBoard, setSelBoard] = useState<number | null>(null);
  const [guides, setGuides] = useState<IO.Guide[]>(free?.sketch?.guides ?? []);
  const [edit, setEdit] = useState<{ id: number; caret: number; a: number; b: number } | null>(null);
  const [picked, setPicked] = useState<Partial<V.Item> | null>(null);
  const [eraser, setEraser] = useState(1.5);
  const [menu, setMenu] = useState<null | 'shapes' | 'export' | 'import' | 'board'>(null);
  const [trace, setTrace] = useState<null | { src: string; bmp: ImageBitmap; from: number }>(null);
  const [tracePrev, setTracePrev] = useState<V.Item[] | null>(null), [traceDel, setTraceDel] = useState(false), [traceBusy, setTraceBusy] = useState(false);
  const [gStop, setGStop] = useState(0), [patGap, setPatGap] = useState(2);
  const [env, setEnv] = useState({ kind: 'arc', amt: 40 }); const envBase = useRef<{ items: V.Item[]; b: BoxT } | null>(null);
  const [pals, setPals] = useState<{ name: string; colors: string[] }[]>(() => { try { return JSON.parse(localStorage.getItem('baseline-palettes') ?? '[]'); } catch { return []; } });
  const [palName, setPalName] = useState('');
  const [lscroll, setLscroll] = useState(0), [lh, setLh] = useState(400), [renameL, setRenameL] = useState<number | null>(null);
  const [traceOpt, setTraceOpt] = useState<O.TraceOpts>({ colors: 4, width: 60, detail: 0.5, removeBg: true, smooth: true });
  const [rename, setRename] = useState<number | null>(null);
  const [tab, setTab] = useState<'rot' | 'scale' | 'skew'>('rot');
  const [tf, setTf] = useState({ rot: 90, sx: 100, sy: 100, kx: 0, ky: 0, copies: 0, lockS: true });
  const [step, setStep] = useState({ n: 3, dx: 10, dy: 0 });
  const [ct, setCt] = useState({ dist: 2, steps: 1, dir: 'out' as 'out' | 'in', filled: false });
  const [blendN, setBlendN] = useState(5);
  const [cm, setCm] = useState<null | { x: number; y: number; id?: number; guide?: number }>(null);
  const [selGuide, setSelGuide] = useState<number | null>(null);
  const [snapP, setSnapP] = useState<P | null>(null);
  const rightPan = useRef(false);
  const svg = useRef<SVGSVGElement>(null), box = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<null | ((x: number, y: number, e: PE) => void)>(null), space = useRef<{ down: boolean; used: boolean }>({ down: false, used: false });
  const toggle = useRef(false), moved = useRef(false), last = useRef<null | [string, unknown[]]>(null), clipb = useRef<V.Item[]>([]);
  const W = kernel.wasm;
  const placePop = (el: HTMLDivElement | null) => {
    if (!el || el.parentElement!.classList.contains('up')) return; const host = el.parentElement!, b = host.getBoundingClientRect(), up = host.classList.contains('up'), w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, up ? b.left + b.width / 2 - w / 2 : host.classList.contains('left') ? b.left : b.right - w))}px`;
    el.style.top = `${Math.max(8, up ? b.top - h - 10 : b.bottom + 4)}px`;
  };
  useEffect(() => { if (!cm) return; const f = (e: PointerEvent) => { if (!(e.target as Element).closest('.vcm')) setCm(null); }; addEventListener('pointerdown', f); return () => removeEventListener('pointerdown', f); }, [cm]);
  useEffect(() => { if (!menu) return; const f = (e: PointerEvent) => { if (!(e.target as Element).closest('.vmenu')) setMenu(null); }; addEventListener('pointerdown', f); return () => removeEventListener('pointerdown', f); }, [menu]);

  const setItems = (f: V.Item[] | ((a: V.Item[]) => V.Item[]), record = true) => {
    const next = typeof f === 'function' ? f(itemsRef.current) : f;
    if (record) { past.current.push(itemsRef.current); if (past.current.length > 200) past.current.shift(); future.current = []; }
    itemsRef.current = next; setItemsState(next);
  };
  const undo = (from: typeof past, to: typeof past) => { const p = from.current.pop(); if (!p) return; to.current.push(itemsRef.current); itemsRef.current = p; setItemsState(p); setNodes([]); setSegs([]); setSel(s => s.filter(id => p.some(x => x.id === id))); };
  const setTool = (t: Tool) => { finishPen(); endEdit(); setPicked(null); setMenu(null); setToolRaw(t); };

  // --- seçim: grup üyeleri ve PowerClip içerikleri birlikte ---
  const expand = (ids: number[], list = itemsRef.current) => {
    const s = new Set(ids); let grew = true;
    while (grew) { grew = false; const groups = new Set(list.filter(i => s.has(i.id) && i.group !== undefined).map(i => i.group)); for (const it of list) if (!s.has(it.id) && ((it.group !== undefined && groups.has(it.group)) || (it.clip !== undefined && s.has(it.clip)))) { s.add(it.id); grew = true; } }
    return list.filter(i => s.has(i.id)).map(i => i.id);
  };
  const setSel = (f: number[] | ((s: number[]) => number[])) => { setSelRaw(f); setRc(null); };
  const selItems = items.filter(it => sel.includes(it.id));
  const sb = V.bounds(selItems);
  const layerOf = (it: V.Item) => layers.find(l => l.id === it.layer) ?? layers[0];
  const isHid = (it: V.Item) => !!it.hidden || !!layerOf(it)?.hidden, isLock = (it: V.Item) => !!it.locked || !!layerOf(it)?.locked;
  const live = items.filter(i => !isHid(i));
  /** Dışa aktarılacaklar: görünür ve “yazdırılmasın” olmayan katmanlardakiler. */
  const ordered = layers.length > 1 ? layers.flatMap(l => items.filter(i => layerOf(i)?.id === l.id)) : items;
  const printable = (list: V.Item[]) => (layers.length > 1 ? layers.flatMap(l => list.filter(i => layerOf(i)?.id === l.id)) : list).filter(i => !isHid(i) && !layerOf(i)?.noPrint).map(i => i.hidden ? i : { ...i, hidden: undefined });
  const res = (): IO.Res => ({ assets, patterns });
  /** Grup / kap birimleri (hizalama, dağıtma için). */
  const units = (ids: number[]) => { const m = new Map<string, number[]>(); for (const it of items.filter(i => ids.includes(i.id))) { const k = it.group !== undefined ? 'g' + it.group : it.clip !== undefined ? 'i' + it.clip : 'i' + it.id; m.set(k, [...(m.get(k) ?? []), it.id]); } return [...m.values()]; };

  /** Çizim alanı: yüzeyin sınırı ya da seçimin altındaki artboard. */
  const area = useMemo<BoxT | null>(() => { const g = guide?.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number); return g && g.length > 3 ? { x0: Math.min(...g.filter((_, i) => i % 2 === 0)), x1: Math.max(...g.filter((_, i) => i % 2 === 0)), y0: Math.min(...g.filter((_, i) => i % 2)), y1: Math.max(...g.filter((_, i) => i % 2)) } : null; }, [guide]);
  const pageOf = (b: BoxT | null): BoxT | null => {
    if (area) return area;
    if (!boards.length) return null;
    const cx = b ? (b.x0 + b.x1) / 2 : 0, cy = b ? (b.y0 + b.y1) / 2 : 0, bd = boards.find(q => cx >= q.x && cx <= q.x + q.w && cy >= q.y && cy <= q.y + q.h) ?? boards[0];
    return { x0: bd.x, y0: bd.y, x1: bd.x + bd.w, y1: bd.y + bd.h };
  };
  const fitTo = (b: BoxT | null) => { if (!b) return; const w = Math.max(10, b.x1 - b.x0), h = Math.max(10, b.y1 - b.y0); setView({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, s: Math.min(400, Math.max(0.2, Math.min(size.w / (w * 1.25), size.h / (h * 1.3)))) }); };
  const fitAll = () => fitTo(IO.boardsBox(boards) ? (V.bounds(live) ? { ...IO.boardsBox(boards)!, ...unionBox(IO.boardsBox(boards)!, V.bounds(live)!) } : IO.boardsBox(boards)) : V.bounds(live) ?? area ?? { x0: -30, y0: -30, x1: 30, y1: 30 });
  const unionBox = (a: BoxT, b: BoxT): BoxT => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });
  useEffect(() => { const ro = new ResizeObserver(() => { const r = box.current!.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); }); ro.observe(box.current!); return () => ro.disconnect(); }, []);
  const fitted = useRef(false);
  useEffect(() => { if (fitted.current || size.w === 800) return; fitted.current = true; fitAll(); }, [size]); // eslint-disable-line react-hooks/exhaustive-deps
  // kayıtlı yazıların fontlarını yükle ve yeniden diz
  useEffect(() => { const ts = itemsRef.current.filter(i => i.text); if (!ts.length) return; void (async () => { for (const t of ts) await os.ensureFont(kernel, t.text!.font); setItems(a => a.map(x => x.text ? { ...x, subs: O.layoutText(kernel, x.text).subs } : x), false); })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vb = `${view.x - size.w / 2 / view.s} ${view.y - size.h / 2 / view.s} ${size.w / view.s} ${size.h / view.s}`;
  const px = 1 / view.s;
  const at = (e: { clientX: number; clientY: number }): P => { const m = svg.current!.getScreenCTM()!.inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return [p.x, p.y]; };
  const toScreen = (x: number, y: number): P => [(x - view.x) * view.s + size.w / 2, (y - view.y) * view.s + size.h / 2];

  // --- mıknatıs: diğer nesnelerin kenar ve ortalarına, artboarda, kılavuzlara yapış ---
  type Targets = { xs: number[]; ys: number[]; pts: P[]; lines: P[][] };
  const snapTargets = (exclude: number[]): Targets => {
    const xs: number[] = [], ys: number[] = [], pts: P[] = [], lines: P[][] = [];
    for (const it of live) {
      if (exclude.includes(it.id)) continue; const b = V.bounds([it]); if (!b) continue;
      xs.push(b.x0, (b.x0 + b.x1) / 2, b.x1); ys.push(b.y0, (b.y0 + b.y1) / 2, b.y1); pts.push([(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]);
      if (pts.length < 4000 && !it.text) for (const sub of it.subs) { for (const q of sub.pts) pts.push([q.x, q.y]); if (lines.length < 800) lines.push(V.flattenSub(sub, 12)); }
    }
    for (const b of boards) { xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h); pts.push([b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h], [b.x + b.w / 2, b.y + b.h / 2]); }
    if (area) { xs.push(area.x0, (area.x0 + area.x1) / 2, area.x1); ys.push(area.y0, (area.y0 + area.y1) / 2, area.y1); pts.push([(area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2]); }
    for (const g of guides) (g.axis === 'x' ? xs : ys).push(g.pos);
    return { xs, ys, pts, lines };
  };
  const best = (vals: number[], cands: number[], thr: number) => { let d = Infinity, at: number | undefined; for (const v of vals) for (const c of cands) if (Math.abs(c - v) < Math.abs(d) && Math.abs(c - v) < thr) { d = c - v; at = c; } return at === undefined ? null : { d, at }; };
  /** Noktayı yapıştırır: önce düğüm / köşe / orta noktalar, sonra yolun üstü, sonra hizalama çizgileri. */
  const snapPt = (x: number, y: number, T: Targets, ev: { altKey: boolean }): P => {
    if (!magnet || ev.altKey) { setSnapL({}); setSnapP(null); return [x, y]; }
    const thr = 7 * px; let bp: P | null = null, bd = thr;
    for (const q of T.pts) { const d = Math.hypot(q[0] - x, q[1] - y); if (d < bd) { bd = d; bp = q; } }
    if (bp) { setSnapP(bp); setSnapL({}); return [bp[0], bp[1]]; }
    for (const ln of T.lines) for (let k = 1; k < ln.length; k++) { const [ax, ay] = ln[k - 1], [bx, by] = ln[k], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)), qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(qx - x, qy - y); if (d < bd) { bd = d; bp = [qx, qy]; } }
    if (bp) { setSnapP(bp); setSnapL({}); return bp; }
    setSnapP(null);
    const bx = best([x], T.xs, thr), by = best([y], T.ys, thr); setSnapL({ x: bx?.at, y: by?.at });
    return [x + (bx?.d ?? 0), y + (by?.d ?? 0)];
  };

  const laid = (t: V.TextMeta) => { const L = O.layoutText(kernel, t); return { subs: L.subs, subFill: L.subFill.some(f => f) ? L.subFill : undefined }; };
  const makeText = (t: V.TextMeta, fillC: string | null): Omit<V.Item, 'id'> => ({ ...laid(t), fill: fillC, stroke: null, sw: 0.25, even: false, text: t, name: t.box ? 'Paragraf' : 'Yazı' });
  const relayout = (it: V.Item, patch: Partial<V.TextMeta>): V.Item => { const t = { ...it.text!, ...patch }; return { ...it, text: t, ...laid(t) }; };
  /** Düzenlenen yazıda seçili harflere stil (renk / yazı tipi / boy). */
  const charStyle = async (patch: V.CharStyle) => {
    if (!edit || edit.a === edit.b) return false;
    if (patch.font && !(await os.ensureFont(kernel, patch.font))) alert('Bu yazı tipi okunamadı');
    const lo = Math.min(edit.a, edit.b), hi = Math.max(edit.a, edit.b);
    setItems(a => a.map(x => { if (x.id !== edit.id || !x.text) return x; const n = [...x.text.value].length, cs = Array.from({ length: n }, (_, i) => x.text!.cs?.[i] ?? null); for (let i = lo; i < hi && i < n; i++) cs[i] = { ...(cs[i] ?? {}), ...patch }; return relayout(x, { cs }); }));
    setTimeout(() => ta.current?.focus(), 0); return true;
  };
  const editText = async (it: V.Item, patch: Partial<V.TextMeta>) => { if (patch.font !== undefined && !(await os.ensureFont(kernel, patch.font))) alert('Bu yazı tipi okunamadı; Baloo kullanılıyor'); try { setItems(a => a.map(x => x.id === it.id ? relayout(x, patch) : x)); } catch (e) { alert((e as Error).message); } };
  const textItem = selItems.length === 1 && selItems[0].text ? selItems[0] : null;
  const add = (...its: Omit<V.Item, 'id'>[]) => { const n = its.map(it => ({ ...it, id: V.newId(), layer: it.layer ?? (isFree ? activeLayer : undefined) })); setItems(a => [...a, ...n]); setSel(n.map(x => x.id)); lastPick.current = n[n.length - 1]?.id ?? null; return n; };
  const styled = (subs: V.Sub[], even = false): Omit<V.Item, 'id'> => ({ subs, fill, stroke: fill || stroke ? stroke : '#222222', sw: 0.5, even });
  const applyTo = (ids: number[], f: (it: V.Item) => V.Item, record = true) => setItems(a => a.map(x => ids.includes(x.id) ? f(x) : x), record);

  // --- dönüşümler (Ctrl+R ile tekrarlanabilir) ---
  const ops: Record<string, (...a: never[]) => void> = {};
  const rotate = (deg: number) => { if (!sb) return; const c = rc ?? [(sb.x0 + sb.x1) / 2, (sb.y0 + sb.y1) / 2]; applyTo(sel, x => V.rotateItem(x, deg, c[0], c[1])); };
  const mirror = (h: boolean) => { if (!sb) return; applyTo(sel, x => ({ ...V.mapItem(x, (a, b) => h ? [sb.x0 + sb.x1 - a, b] : [a, sb.y0 + sb.y1 - b]), text: undefined })); };
  const nudge = (dx: number, dy: number) => applyTo(sel, x => V.mapItem(x, (a, b) => [a + dx, b + dy]));
  const scaleSel = (sx: number, sy: number) => { if (!sb) return; const cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2, uni = Math.abs(sx - sy) < 1e-9; applyTo(sel, x => { const m = V.mapItem(x, (a, b) => [cx + (a - cx) * sx, cy + (b - cy) * sy], Math.sqrt(Math.abs(sx * sy))); return uni ? m : { ...m, text: undefined }; }); };
  const skewSel = (kx: number, ky: number) => { if (!sb) return; const cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2, tx = Math.tan(kx * Math.PI / 180), ty = Math.tan(ky * Math.PI / 180); applyTo(sel, x => ({ ...V.mapItem(x, (a, b) => [a + (b - cy) * tx, b + (a - cx) * ty]), text: undefined })); };
  Object.assign(ops, { rotate, mirror, nudge, scaleSel, skewSel, stepRepeat: (n: number, dx: number, dy: number) => stepRepeat(n, dx, dy), transformCopies: (k: string) => transformApply(k) });
  const act = (name: string, ...args: unknown[]) => { last.current = [name, args]; (ops[name] as (...a: unknown[]) => void)(...args); };
  /** Kopyalar: kimlikler, grup ve kap bağları yeniden kurulur. */
  const cloneItems = (list: V.Item[], f: (x: number, y: number) => P = (x, y) => [x, y]) => {
    const ids = new Map(list.map(i => [i.id, V.newId()])), gs = new Map<number, number>();
    return list.map(i => ({ ...V.mapItem(i, f), id: ids.get(i.id)!, group: i.group === undefined ? undefined : gs.get(i.group) ?? (gs.set(i.group, V.newId()), gs.get(i.group)!), clip: i.clip === undefined ? undefined : ids.get(i.clip) ?? i.clip }));
  };
  const copyItems = () => { clipb.current = itemsRef.current.filter(i => sel.includes(i.id)); };
  const pasteItems = () => { if (!clipb.current.length) return; const n = cloneItems(clipb.current).map(i => ({ ...i, layer: isFree ? activeLayer : i.layer })); setItems(a => [...a, ...n]); setSel(n.map(i => i.id)); };
  const dup = (inPlace = false) => { if (!sel.length) return; const copies = cloneItems(itemsRef.current.filter(x => sel.includes(x.id)), (a, b) => inPlace ? [a, b] : [a + 5, b + 5]); setItems(a => [...a, ...copies]); setSel(copies.map(c => c.id)); };
  const stepRepeat = (n: number, dx: number, dy: number) => { const base = itemsRef.current.filter(x => sel.includes(x.id)); if (!base.length) return; const all: V.Item[] = []; for (let k = 1; k <= n; k++) all.push(...cloneItems(base, (a, b) => [a + dx * k, b + dy * k])); setItems(a => [...a, ...all]); };
  const transformApply = (kind: string) => {
    const base = itemsRef.current.filter(x => sel.includes(x.id)), b0 = V.bounds(base); if (!b0) return;
    const one = (list: V.Item[]): V.Item[] => {
      const b = V.bounds(list)!, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (kind === 'rot') return list.map(x => V.rotateItem(x, tf.rot, cx, cy));
      if (kind === 'scale') { const sx = tf.sx / 100, sy = (tf.lockS ? tf.sx : tf.sy) / 100; return list.map(x => { const m = V.mapItem(x, (a, q) => [cx + (a - cx) * sx, cy + (q - cy) * sy], Math.sqrt(Math.abs(sx * sy))); return sx === sy ? m : { ...m, text: undefined }; }); }
      const tx = Math.tan(tf.kx * Math.PI / 180), ty = Math.tan(tf.ky * Math.PI / 180); return list.map(x => ({ ...V.mapItem(x, (a, q) => [a + (q - cy) * tx, q + (a - cx) * ty]), text: undefined }));
    };
    if (!tf.copies) { const r = one(base), m = new Map(r.map(x => [x.id, x])); setItems(a => a.map(x => m.get(x.id) ?? x)); return; }
    const all: V.Item[] = []; let cur = base; for (let k = 0; k < tf.copies; k++) { cur = one(cloneItems(cur)); all.push(...cur); }
    setItems(a => [...a, ...all]);
  };
  const remove = () => {
    if (tool === 'node' && nodes.length) {
      setItems(a => { const b = clone(a); for (const n of [...nodes].sort((p, q) => q.i - p.i)) { const s = b.find(x => x.id === n.item)?.subs[n.sub]; if (s) { s.pts.splice(n.i, 1); unText(b, n.item); } } return b.map(it => ({ ...it, subs: it.subs.filter(s => s.pts.length > 1) })).filter(it => it.subs.length || it.text); }); setNodes([]); return;
    }
    if (selBoard !== null && !sel.length) { if (boards.length > 1) { setBoards(b => b.filter(x => x.id !== selBoard)); setSelBoard(null); } return; }
    if (sel.length) { setItems(a => a.filter(x => !sel.includes(x.id)).map(x => x.clip !== undefined && sel.includes(x.clip) ? { ...x, clip: undefined } : x)); setSel([]); }
  };
  /** Köşe işlemi: düğüm modunda seçili düğümler ya da seçili iki kenarın ortak düğümü; seçim modunda tüm keskin köşeler. */
  const doCorner = (st: 'chamfer' | 'round') => {
    const targets: Sel[] = [...nodes];
    for (const a of segs) for (const b of segs) if (a !== b && a.item === b.item && a.sub === b.sub) { const s = items.find(x => x.id === a.item)!.subs[a.sub], n = s.pts.length; if ((a.i + 1) % n === b.i) targets.push({ ...a, i: b.i }); }
    const all = !targets.length;
    setItems(arr => {
      const b = clone(arr);
      if (all) { for (const it of b) if ((sel.includes(it.id) || !sel.length) && !it.img) for (const s of (it.text = undefined, it.subs)) for (let i = s.pts.length - 1; i >= 0; i--) if (V.isCorner(s, i)) V.cornerAt(s, i, corner, st); }
      else for (const t of [...targets].sort((p, q) => q.i - p.i)) { const s = unText(b, t.item).subs[t.sub]; if (s) V.cornerAt(s, t.i, corner, st); }
      return b;
    });
    setNodes([]); setSegs([]);
  };
  const order = (how: 'front' | 'back' | 'up' | 'down') => setItems(a => {
    const keep = a.filter(x => !sel.includes(x.id)), mine = a.filter(x => sel.includes(x.id));
    if (how === 'front') return [...keep, ...mine]; if (how === 'back') return [...mine, ...keep];
    const b = [...a];
    if (how === 'up') { for (let i = b.length - 2; i >= 0; i--) if (sel.includes(b[i].id) && !sel.includes(b[i + 1].id)) [b[i], b[i + 1]] = [b[i + 1], b[i]]; }
    else for (let i = 1; i < b.length; i++) if (sel.includes(b[i].id) && !sel.includes(b[i - 1].id)) [b[i], b[i - 1]] = [b[i - 1], b[i]];
    return b;
  });
  const bool = (op: 'union' | 'subtract' | 'intersect') => {
    const list = items.filter(x => sel.includes(x.id) && !x.img); if (list.length < 2) return;
    try { const r = V.boolean(W, list, op); r.name = { union: 'Kaynaşık', subtract: 'Kırpılmış', intersect: 'Kesişim' }[op]; setItems(a => [...a.filter(x => !sel.includes(x.id)), r]); setSel([r.id]); } catch (e) { alert((e as Error).message); }
  };
  /** Hizalama (Corel): birden çok birim varsa son seçilene, tek birimse sayfaya / yüzeye. */
  const align = (k: 'l' | 'r' | 't' | 'b' | 'c' | 'e' | 'p') => {
    const us = units(sel); if (!us.length) return;
    const ref = k === 'p' || us.length === 1 ? pageOf(sb) ?? { x0: 0, y0: 0, x1: 0, y1: 0 } : V.bounds(items.filter(i => (us.find(u => u.includes(lastPick.current ?? -1)) ?? us[us.length - 1]).includes(i.id)))!;
    const mv = new Map<number, P>();
    for (const u of us) {
      const b = V.bounds(items.filter(i => u.includes(i.id))); if (!b) continue;
      const dx = k === 'l' ? ref.x0 - b.x0 : k === 'r' ? ref.x1 - b.x1 : k === 'c' || k === 'p' ? (ref.x0 + ref.x1 - b.x0 - b.x1) / 2 : 0;
      const dy = k === 't' ? ref.y0 - b.y0 : k === 'b' ? ref.y1 - b.y1 : k === 'e' || k === 'p' ? (ref.y0 + ref.y1 - b.y0 - b.y1) / 2 : 0;
      for (const id of u) mv.set(id, [dx, dy]);
    }
    setItems(a => a.map(x => { const d = mv.get(x.id); return d ? V.mapItem(x, (p, q) => [p + d[0], q + d[1]]) : x; }));
  };
  const distribute = (h: boolean) => {
    const us = units(sel).map(u => ({ u, b: V.bounds(items.filter(i => u.includes(i.id)))! })).filter(x => x.b); if (us.length < 3) return;
    us.sort((p, q) => h ? p.b.x0 - q.b.x0 : p.b.y0 - q.b.y0);
    const lo = h ? us[0].b.x0 : us[0].b.y0, hi = Math.max(...us.map(x => h ? x.b.x1 : x.b.y1)), tot = us.reduce((s, x) => s + (h ? x.b.x1 - x.b.x0 : x.b.y1 - x.b.y0), 0), gap = (hi - lo - tot) / (us.length - 1);
    let pos = lo; const mv = new Map<number, number>();
    for (const x of us) { const d = pos - (h ? x.b.x0 : x.b.y0); for (const id of x.u) mv.set(id, d); pos += (h ? x.b.x1 - x.b.x0 : x.b.y1 - x.b.y0) + gap; }
    setItems(a => a.map(x => mv.has(x.id) ? V.mapItem(x, (p, q) => h ? [p + mv.get(x.id)!, q] : [p, q + mv.get(x.id)!]) : x));
  };
  const group = () => { if (sel.length < 2) return; const g = V.newId(); applyTo(sel, x => ({ ...x, group: g })); };
  const ungroup = () => applyTo(sel, x => ({ ...x, group: undefined }));
  const combineSel = () => { const list = items.filter(x => sel.includes(x.id) && x.clip === undefined && !x.img); if (list.length < 2) return; const c = O.combine(list); setItems(a => { const i = a.findIndex(x => x.id === list[0].id); const b = a.filter(x => !list.includes(x)); b.splice(Math.min(i, b.length), 0, c); return b; }); setSel([c.id]); };
  const breakSel = () => { const list = items.filter(x => sel.includes(x.id) && x.subs.length > 1 && !x.img); if (!list.length) return; const ids: number[] = []; setItems(a => a.flatMap(x => { if (!list.includes(x)) return [x]; const p = O.breakApart(x); ids.push(...p.map(q => q.id)); return p; })); setSel(ids); };
  const toCurves = () => applyTo(sel, x => ({ ...x, text: undefined }));
  const replaceEach = (f: (it: V.Item) => V.Item[]) => { const ids: number[] = []; setItems(a => a.flatMap(x => { if (!sel.includes(x.id)) return [x]; const r = f(x); ids.push(...r.map(q => q.id)); return r; })); setSel(ids); };
  const outlineObj = () => { try { replaceEach(x => O.outlineToObject(W, x)); } catch (e) { alert((e as Error).message); } };
  const contourSel = () => {
    const color = stroke ?? (mode === 'cmyk' ? 'cmyk(0,100,0,0)' : '#e5484d');
    try { setItems(a => a.flatMap(x => { if (!sel.includes(x.id) || x.clip !== undefined || x.img) return [x]; const r = O.contour(W, x, { ...ct, color, join: 'Round' }); return ct.dir === 'out' && ct.filled ? [...r, x] : [x, ...r]; })); } catch (e) { alert((e as Error).message); }
  };
  const blendSel = () => { const us = units(sel); if (us.length !== 2) return alert('Geçiş için iki nesne seç'); const a = items.find(i => i.id === us[0][0])!, b = items.find(i => i.id === us[1][0])!; const r = O.blend(a, b, blendN), g = V.newId(); setItems(l => { const i = l.findIndex(x => x.id === a.id); const c = [...l]; c.splice(i + 1, 0, ...r.map(x => ({ ...x, group: g }))); return c; }); };
  const clipIn = () => { const box_ = lastPick.current; const kids = sel.filter(id => id !== box_); if (box_ === null || !kids.length || !items.find(i => i.id === box_)?.subs.some(s => s.closed)) return alert('Önce içine konacakları, en son kabı (kapalı şekil) seç'); applyTo(kids, x => ({ ...x, clip: box_, group: undefined })); setSel(expand([box_])); };
  const clipOut = () => applyTo(items.filter(i => i.clip !== undefined && (sel.includes(i.clip) || sel.includes(i.id))).map(i => i.id), x => ({ ...x, clip: undefined }));
  const simplifySel = () => { const list = items.filter(x => sel.includes(x.id) && !x.img); if (list.length < 2) return; try { const r = O.simplifyOverlaps(W, list), m = new Map(r.map(x => [x.id, x])); setItems(a => a.filter(x => !sel.includes(x.id) || m.has(x.id)).map(x => m.get(x.id) ?? x)); } catch (e) { alert((e as Error).message); } };
  /** Zarf / bükme: seçimi kavise, dalgaya büker (eğriye çevirir). */
  const envelope = (kind: string, amt: number) => {
    const base = envBase.current; if (!base) return; const { b } = base, w = b.x1 - b.x0 || 1, h = b.y1 - b.y0 || 1, A = amt / 100, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const f = (x: number, y: number): P => { const u = (x - b.x0) / w, v = (y - b.y0) / h, k = 1 - (2 * u - 1) ** 2;
      switch (kind) {
        case 'arc': return [x, y - A * h * 0.5 * k];
        case 'arcTop': return [x, y - A * h * 0.6 * k * (1 - v)];
        case 'arcBottom': return [x, y + A * h * 0.6 * k * v];
        case 'wave': return [x, y + A * h * 0.25 * Math.sin(2 * Math.PI * u)];
        case 'flag': return [x, y + A * h * 0.3 * Math.sin(2 * Math.PI * u) * u];
        case 'bulge': return [x + (x - cx) * A * 0.6 * Math.sin(Math.PI * v), y + (y - cy) * A * 0.6 * Math.sin(Math.PI * u)];
        default: return [x, y];
      } };
    const m = new Map(base.items.map(it => [it.id, it.img ? it : { ...it, text: undefined, subs: it.subs.map(sub => { const raw = V.flattenSub(sub, 16).map(([x, y]) => f(x, y)); return sub.closed ? V.smooth(raw, Math.max(0.01, w / 4000), true) : V.smooth(raw, Math.max(0.01, w / 4000), false); }) }]));
    setItems(a => a.map(x => m.get(x.id) ?? x), false);
  };
  const envStart = () => { const its = itemsRef.current.filter(i => sel.includes(i.id)), b = V.bounds(its); if (!b) return; envBase.current = { items: its, b }; past.current.push(itemsRef.current); future.current = []; };
  const envEnd = () => { envBase.current = null; };
  const fitTextToPath = () => {
    const t = selItems.find(i => i.text), p = selItems.find(i => !i.text && i.subs.length); if (!t || !p) return alert('Bir yazı ve bir yol / şekil seç');
    const s = p.subs[0], pts = V.flattenSub(s, 32); if (s.closed) pts.push(pts[0]);
    setItems(a => a.map(x => x.id === t.id ? relayout(x, { path: { pts, offset: 0 } }) : x));
  };

  // --- renk ---
  const remember = (c: string | null) => c && setRecent(r => [c, ...r.filter(x => x !== c)].slice(0, 12));
  const paint = (c: string | null, target: 'fill' | 'stroke') => {
    remember(c);
    if (target === 'fill' && c && edit && edit.a !== edit.b) { void charStyle({ fill: c }); return; }
    if (target === 'fill' && c && one?.grad && sel.length) { applyTo(sel, x => x.grad ? { ...x, grad: { ...x.grad, stops: x.grad.stops.map((q, k) => k === gStop ? { ...q, c } : q) } } : x); return; }
    if (sel.length) applyTo(sel, x => x.img ? x : target === 'fill' ? { ...x, fill: c, subFill: c ? x.subFill : undefined, grad: c ? x.grad : undefined, pat: c ? x.pat : undefined, ...(x.text?.cs && !c ? { text: { ...x.text, cs: x.text.cs.map(q => q && { ...q, fill: undefined }) } } : {}) } : { ...x, stroke: c, sw: x.stroke ? x.sw : 0.5 });
    if (target === 'fill') setFill(c); else setStroke(c);
  };
  const savePals = (p: { name: string; colors: string[] }[]) => { setPals(p); try { localStorage.setItem('baseline-palettes', JSON.stringify(p)); } catch { /* yok */ } };
  const curPal = pals.find(q => q.name === palName);
  const addToPal = (c: string | null) => { if (!c) return; if (curPal) savePals(pals.map(q => q === curPal ? { ...q, colors: [...q.colors.filter(x => x !== c), c] } : q)); else { const name = pals.some(q => q.name === 'Paletim') ? `Paletim ${pals.length + 1}` : 'Paletim'; savePals([...pals, { name, colors: [c] }]); setPalName(name); } };
  const setGrad = (type: 'none' | 'linear' | 'radial') => applyTo(sel, x => { if (x.img) return x; if (type === 'none') return { ...x, grad: undefined }; const base = x.fill ?? (mode === 'cmyk' ? 'cmyk(100,0,0,0)' : '#1677ff'), g: V.Grad = x.grad ? { ...x.grad, type } : { type, angle: 0, stops: [{ o: 0, c: base }, { o: 1, c: mode === 'cmyk' ? 'cmyk(0,0,0,0)' : '#ffffff' }] }; return { ...x, fill: x.fill ?? base, grad: g, pat: undefined }; });
  const editGrad = (f: (g: V.Grad) => V.Grad, record = true) => applyTo(sel, x => x.grad ? { ...x, grad: f(x.grad) } : x, record);
  const makePattern = () => {
    const src = itemsRef.current.filter(i => sel.includes(i.id) && !i.pat), b = V.bounds(src); if (!b) return;
    const id = `pt${Date.now().toString(36)}`, its = src.map(i => ({ ...V.mapItem(i, (x, y) => [x - b.x0 + patGap / 2, y - b.y0 + patGap / 2]), id: V.newId(), clip: undefined, group: undefined, layer: undefined, hidden: undefined, locked: undefined }));
    setPatterns(p => ({ ...p, [id]: { name: `Desen ${Object.keys(p).length + 1}`, items: its, w: b.x1 - b.x0 + patGap, h: b.y1 - b.y0 + patGap } })); alert('Desen oluşturuldu. Şimdi doldurulacak şekli seç ve Dolgu tipinden “Desen”i seç.');
  };
  const docColors = useMemo(() => [...new Set(items.flatMap(i => [i.fill, i.stroke]).filter((c): c is string => !!c))].slice(0, 16), [items]);
  const switchMode = (m: C.Mode) => {
    if (m === mode) return;
    const other = items.some(i => [i.fill, i.stroke].some(c => c && C.isCmyk(c) !== (m === 'cmyk')));
    if (other && confirm(`Tasarımdaki renkler ${m.toUpperCase()}'ye dönüştürülsün mü?`)) setItems(a => a.map(x => ({ ...x, fill: C.convert(x.fill, m), stroke: C.convert(x.stroke, m), ...(x.shadow ? { shadow: { ...x.shadow, color: C.convert(x.shadow.color, m)! } } : {}) })));
    setFill(f => C.convert(f, m)); setStroke(s => C.convert(s, m)); setModeState(m);
  };
  const lineStyle = (patch: Partial<V.Item>) => sel.length && applyTo(sel, x => ({ ...x, ...patch }));

  // --- dosya ---
  const fileBase = isFree ? 'vektor-cizim' : (title.split(':').pop() || 'cizim').trim().replace(/[\\/:*?"<>|]+/g, '');
  const sketch = (): IO.Sketch => {
    const its = itemsRef.current, used = new Set([...its, ...Object.values(patterns).flatMap(q => q.items)].filter(i => i.img).map(i => i.img!.key)), usedPat = new Set(its.map(i => i.pat).filter(Boolean));
    const a = Object.fromEntries(Object.entries(assets).filter(([k]) => used.has(k))), pt = Object.fromEntries(Object.entries(patterns).filter(([k]) => usedPat.has(k) || true));
    return { items: its, boards, guides, mode, ...(Object.keys(a).length ? { assets: a } : {}), layers, ...(Object.keys(pt).length ? { patterns: pt } : {}) };
  };
  const firstRun = useRef(true);
  useEffect(() => { if (firstRun.current) { firstRun.current = false; return; } free?.onChange?.(sketch()); }, [items, boards, guides, mode, assets, layers, patterns]); // eslint-disable-line react-hooks/exhaustive-deps
  const writeOut = async (name: string, data: Uint8Array | string) => { await os.writeFiles([{ name, data: typeof data === 'string' ? new TextEncoder().encode(data) : data }]); };
  const guideItem = (): V.Item[] => guide ? [{ id: -1, subs: V.parseD(V.joinOutline(guide)), fill: null, stroke: mode === 'cmyk' ? 'cmyk(0,100,100,0)' : '#ff0000', sw: 0.1, even: false }] : [];
  const exportAs = async (kind: string) => {
    setMenu(null); const its = printable(itemsRef.current), R = res();
    try {
      if (kind === 'svg-both' || kind === 'svg-surface' || kind === 'svg-design') return await writeOut(`${fileBase}${kind === 'svg-design' ? '-tasarim' : '-yuzey'}.svg`, IO.exportSvg(its, { guide, what: kind.slice(4) as 'both', free: isFree, res: R }));
      if (kind === 'svg-free') return await writeOut(`${fileBase}.svg`, IO.exportSvg(its, { box: IO.boardsBox(boards), free: true, res: R }));
      const pages = boards.map(b => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }));
      if (kind === 'pdf-pages' || kind === 'ai') return await writeOut(`${fileBase}.${kind === 'ai' ? 'ai' : 'pdf'}`, await IO.exportPdf(its, pages, R));
      if (kind === 'pdf-one') return await writeOut(`${fileBase}.pdf`, await IO.exportPdf(its, [IO.boardsBox(boards)!], R));
      if (kind === 'pdf-surface' || kind === 'pdf-design') { const list = kind === 'pdf-surface' ? [...guideItem(), ...its] : its, b = V.bounds(list); if (!b) return; return await writeOut(`${fileBase}.pdf`, await IO.exportPdf(list, [b], R)); }
      if (kind === 'png' || kind === 'jpg') {
        const dpi = Math.max(36, Math.min(1200, +(prompt('Çözünürlük (DPI)', '300') ?? '') || 0)); if (!dpi) return;
        const files: { name: string; data: Uint8Array }[] = [];
        for (const [k, b] of boards.entries()) { const w = b.w / 25.4 * dpi, h = b.h / 25.4 * dpi; if (w * h > 16384 * 16384 / 2) throw new Error(`${b.name} bu DPI'de çok büyük; DPI'yi düşür`); files.push({ name: `${fileBase}${boards.length > 1 ? '-' + (k + 1) : ''}.${kind}`, data: await IO.rasterize(IO.exportSvg(its, { box: { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }, free: true, res: R }), w, h, kind) }); }
        await os.writeFiles(files); return;
      }
      if (kind === 'dxf') return await writeOut(`${fileBase}.dxf`, IO.exportDxf(O.flattenClips(W, its.filter(i => !i.img)), guide));
    } catch (e) { alert((e as Error).message); }
  };
  /** Dosyaları sayfaya ekler: resim, SVG, PDF / AI, DXF (seçiciyle ya da sürükle-bırak). */
  const dropFiles = async (files: { name: string; data: Uint8Array }[], at?: P) => {
    const pg = pageOf(null), cx = at?.[0] ?? (pg ? (pg.x0 + pg.x1) / 2 : view.x), cy = at?.[1] ?? (pg ? (pg.y0 + pg.y1) / 2 : view.y), added: V.Item[] = [], newAssets: Record<string, string> = {};
    let ox = 0;
    for (const f of files) {
      try {
        if (IMG_EXT.test(f.name)) {
          const im = await imageData(f.name, f.data), key = `im${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
          let w = im.w * 25.4 / 96, h = im.h * 25.4 / 96; const lim = pg ? Math.min(pg.x1 - pg.x0, pg.y1 - pg.y0) * 0.8 : 150; if (Math.max(w, h) > lim) { const k = lim / Math.max(w, h); w *= k; h *= k; }
          newAssets[key] = im.src;
          added.push({ id: V.newId(), subs: [V.rectSub(cx - w / 2 + ox, cy - h / 2 + ox, w, h)], fill: null, stroke: null, sw: 0, even: false, img: { key, w: im.w, h: im.h }, name: f.name, layer: isFree ? activeLayer : undefined });
          ox += 5; continue;
        }
        const ext = f.name.toLowerCase().split('.').pop();
        let its: V.Item[];
        if (ext === 'svg') its = loadItems(new TextDecoder().decode(f.data), 0);
        else if (ext === 'dxf') its = IO.importDxf(new TextDecoder().decode(f.data));
        else if (ext === 'pdf' || ext === 'ai') { const buf = f.data.slice().buffer, n = await IO.pdfPages(buf); const pg2 = n > 1 ? Math.round(+(prompt(`${f.name}: ${n} sayfa var. Hangi sayfa?`, '1') ?? '') || 0) : 1; if (!pg2) continue; its = await IO.importPdf(buf, pg2); }
        else { alert(`${f.name}: bu dosya türü 2D sayfaya eklenemez`); continue; }
        const b = V.bounds(its); if (!b) throw new Error('Dosyada çizim yok');
        const g = its.length > 1 ? V.newId() : undefined;
        added.push(...its.map(it => ({ ...V.mapItem(it, (x, y) => [x - (b.x0 + b.x1) / 2 + cx + ox, y - (b.y0 + b.y1) / 2 + cy + ox]), group: g, fill: C.convert(it.fill, mode), stroke: C.convert(it.stroke, mode), layer: isFree ? activeLayer : undefined, name: it.name ?? f.name })));
        ox += 5;
      } catch (e) { alert(`${f.name}: ${(e as Error).message}`); }
    }
    if (Object.keys(newAssets).length) setAssets(a => ({ ...a, ...newAssets }));
    if (added.length) { setItems(a => [...a, ...added]); setSel(added.map(i => i.id)); setToolRaw('select'); }
    return added;
  };
  const importPick = async () => { setMenu(null); const fs = await os.pickBytes('.svg,.pdf,.ai,.dxf,.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff'); if (fs.length) await dropFiles(fs); };
  if (free?.api) free.api.current = { importPick: () => void importPick(), exportAs: k => void exportAs(k), drop: fs => void dropFiles(fs) };
  /** Seçili resmi (yoksa dosyadan gelen resmi) vektöre çevirme penceresini açar. */
  const traceItem = async (it: V.Item) => { const src = it.img && assets[it.img.key]; if (!src) return; try { const bmp = await createImageBitmap(await (await fetch(src)).blob()); setTracePrev(null); setTrace({ src, bmp, from: it.id }); } catch { alert('Resim açılamadı'); } };
  const pickImage = async () => {
    const img = selItems.find(i => i.img); if (img) return traceItem(img);
    const fs = await os.pickBytes('.png,.jpg,.jpeg,.webp,.bmp,.gif,.tif,.tiff'); if (!fs.length) return;
    const added = await dropFiles(fs.slice(0, 1)); const it = added?.[0]; if (!it?.img) return;
    try { const im = await imageData(fs[0].name, fs[0].data), bmp = await createImageBitmap(await (await fetch(im.src)).blob()); setTracePrev(null); setTrace({ src: im.src, bmp, from: it.id }); } catch { alert('Resim açılamadı'); }
  };
  useEffect(() => {
    if (!trace) return; setTraceBusy(true);
    const t = setTimeout(() => { try { setTracePrev(O.traceImage(W, trace.bmp, { ...traceOpt, width: 100 })); } catch { setTracePrev([]); } setTraceBusy(false); }, 200);
    return () => clearTimeout(t);
  }, [trace, traceOpt, W]);
  const runTrace = () => {
    if (!trace || !tracePrev?.length) return;
    const src = itemsRef.current.find(i => i.id === trace.from), fb = src ? V.bounds([src]) : null, b = V.bounds(tracePrev)!;
    const k = fb ? Math.min((fb.x1 - fb.x0) / (b.x1 - b.x0), (fb.y1 - fb.y0) / (b.y1 - b.y0)) : 1, cx = fb ? (fb.x0 + fb.x1) / 2 : view.x, cy = fb ? (fb.y0 + fb.y1) / 2 : view.y, g = V.newId();
    const placed = tracePrev.map(it => ({ ...V.mapItem(it, (x, y) => [(x - (b.x0 + b.x1) / 2) * k + cx, (y - (b.y0 + b.y1) / 2) * k + cy]), id: V.newId(), group: g, fill: C.convert(it.fill, mode), layer: src?.layer }));
    setItems(a => { const i = a.findIndex(x => x.id === trace.from), rest = traceDel ? a.filter(x => x.id !== trace.from) : [...a]; rest.splice(traceDel ? i : i + 1, 0, ...placed); return i < 0 ? [...a, ...placed] : rest; });
    setSel(placed.map(i => i.id)); trace.bmp.close(); setTrace(null); setTracePrev(null); setToolRaw('select');
  };
  const insert3d = () => {
    const src = sel.length ? itemsRef.current.filter(i => sel.includes(i.id)) : itemsRef.current;
    try { const flat = O.flattenClips(W, src); if (!flat.length) return alert('3B’ye alınacak çizim yok'); free!.onInsert(V.toSvg(flat), flat, sketch()); } catch (e) { alert((e as Error).message); }
  };
  const saveSurface = () => { finishPen(); endEdit(); try { const flat = O.flattenClips(W, itemsRef.current); onSave?.(V.toSvg(flat), flat); } catch (e) { alert((e as Error).message); } };
  const addBoard = (name: string, w: number, h: number) => { const r = boards.length ? Math.max(...boards.map(b => b.x + b.w)) + 20 : 0, y = boards[0]?.y ?? 0, b = { id: V.newId(), name, x: r, y, w, h }; setBoards(bs => [...bs, b]); setSelBoard(b.id); setMenu(null); fitTo({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }); };

  // --- yazı düzenleme (ekranda) ---
  const startEdit = (id: number, caret?: number) => { const it = itemsRef.current.find(i => i.id === id); if (!it?.text) return; setToolRaw('text'); setSel([id]); const c = caret ?? [...it.text.value].length; setEdit({ id, caret: c, a: c, b: c }); setTimeout(() => { const t = ta.current; if (t) { t.value = it.text!.value; t.focus(); t.setSelectionRange(c, c); } }, 0); };
  const endEdit = () => { if (!edit) return; const it = itemsRef.current.find(i => i.id === edit.id); if (it && !it.text?.value.trim()) setItems(a => a.filter(x => x.id !== edit.id), false); setEdit(null); };
  const onType = () => {
    const t = ta.current; if (!t || !edit) return; const v = t.value, cur = itemsRef.current.find(x => x.id === edit.id);
    if (cur?.text && cur.text.value !== v) setItems(a => a.map(x => x.id === edit.id ? relayout(x, { value: v, cs: O.shiftStyles(x.text!.cs, x.text!.value, v) }) : x), false);
    const a0 = t.selectionStart ?? v.length, b0 = t.selectionEnd ?? a0; setEdit({ id: edit.id, caret: t.selectionDirection === 'backward' ? a0 : b0, a: a0, b: b0 });
  };
  /** Noktaya en yakın imleç sırası. */
  const caretAt = (it: V.Item, x: number, y: number) => { const L = O.layoutText(kernel, it.text!); let bi = 0, bd = Infinity; L.carets.forEach((c, i) => { const d = Math.hypot(c.x + Math.sin(c.a) * L.h * 0.4 - x, c.y - Math.cos(c.a) * L.h * 0.4 - y); if (d < bd) { bd = d; bi = i; } }); return bi; };
  const textDown = (it: V.Item, e: PE) => {
    e.stopPropagation(); e.preventDefault(); const [x, y] = at(e), a = caretAt(it, x, y), t = ta.current; if (!t) return;
    if (!edit || edit.id !== it.id) { startEdit(it.id, a); return; }
    const anchor = e.shiftKey ? (t.selectionDirection === 'backward' ? t.selectionEnd : t.selectionStart) ?? a : a;
    t.setSelectionRange(Math.min(anchor, a), Math.max(anchor, a), a < anchor ? 'backward' : 'forward'); t.focus(); onType();
    drag.current = (mx, my) => { const b = caretAt(it, mx, my); t.setSelectionRange(Math.min(anchor, b), Math.max(anchor, b), b < anchor ? 'backward' : 'forward'); onType(); };
  };
  const editItem = edit ? items.find(i => i.id === edit.id) : undefined;
  const carets = editItem?.text ? O.layoutText(kernel, editItem.text) : null;

  const finishPen = () => { if (pen && pen.pts.length > 1) add({ ...styled([pen]), fill: pen.closed ? fill : null, stroke: pen.closed && fill ? stroke : stroke ?? '#222222', name: 'Eğri' }); setPen(null); };

  // --- fare ---
  const down = (e: PE<SVGSVGElement>) => {
    const [x, y] = at(e); (e.target as Element).setPointerCapture?.(e.pointerId); moved.current = false;
    if (ink) setInk(null);
    if (e.button === 1 || e.button === 2 && tool !== 'zoom' || tool === 'pan' || space.current.down) { space.current.used = true; rightPan.current = false; const v0 = view, c0 = [e.clientX, e.clientY]; drag.current = (_x, _y, ev) => { if (Math.hypot(ev.clientX - c0[0], ev.clientY - c0[1]) > 3) rightPan.current = true; setView({ ...v0, x: v0.x - (ev.clientX - c0[0]) / v0.s, y: v0.y - (ev.clientY - c0[1]) / v0.s }); }; return; }
    if (edit) { endEdit(); if (tool === 'text') return; }
    setSelBoard(null);
    const T = snapTargets([]);
    if (tool === 'select' || tool === 'node' || tool === 'pick') {
      if (tool === 'pick') return;
      if (!e.shiftKey) { setSel([]); setNodes([]); setSegs([]); }
      const a: P = [x, y]; drag.current = (mx, my) => setMarq({ a, b: [mx, my] }); return;
    }
    if (tool === 'zoom') { const a: P = [x, y]; drag.current = (mx, my) => setMarq({ a, b: [mx, my] }); return; }
    if (tool === 'pen') {
      const [sx, sy] = snapPt(x, y, T, e), p = { x: sx, y: sy };
      if (pen && pen.pts.length > 2 && Math.hypot(p.x - pen.pts[0].x, p.y - pen.pts[0].y) < 8 * px) { setPen(null); add({ ...styled([{ ...pen, closed: true }]), name: 'Eğri' }); return; }
      const s: V.Sub = pen ? { ...pen, pts: [...pen.pts, p] } : { pts: [p], closed: false }; setPen(s);
      drag.current = (mx, my) => { const q = s.pts[s.pts.length - 1], dx = mx - q.x, dy = my - q.y; if (Math.hypot(dx, dy) < 2 * px) return; setPen({ ...s, pts: [...s.pts.slice(0, -1), { ...q, ox: q.x + dx, oy: q.y + dy, ix: q.x - dx, iy: q.y - dy }] }); };
      return;
    }
    if (tool === 'draw' || tool === 'eraser') { setInk([[x, y]]); drag.current = (mx, my) => setInk(k => k && [...k, [mx, my]]); return; }
    if (tool === 'text') { const a: P = [x, y]; setDraft({ a, b: a }); drag.current = (mx, my) => setDraft({ a, b: [mx, my] }); return; }
    const a = snapPt(x, y, T, e);
    if (tool === 'knife' || tool === 'dim') { setLine({ a, b: a }); drag.current = (mx, my, ev) => { let b = snapPt(mx, my, T, ev); if (ev.shiftKey) { const ang = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / (Math.PI / 12)) * Math.PI / 12, L = Math.hypot(b[0] - a[0], b[1] - a[1]); b = [a[0] + Math.cos(ang) * L, a[1] + Math.sin(ang) * L]; } setLine({ a, b }); }; return; }
    setDraft({ a, b: a });
    drag.current = (mx, my, ev) => { let b = snapPt(mx, my, T, ev); if (ev.ctrlKey) { const d = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); b = [a[0] + Math.sign(b[0] - a[0] || 1) * d, a[1] + Math.sign(b[1] - a[1] || 1) * d]; } setDraft({ a: ev.shiftKey ? [2 * a[0] - b[0], 2 * a[1] - b[1]] : a, b }); };
  };
  const moveEv = (e: PE<SVGSVGElement>) => { if (drag.current) { moved.current = true; const [x, y] = at(e); drag.current(x, y, e); } };
  const up = (e: PE<SVGSVGElement>) => {
    drag.current = null; setSnapL({}); setSnapP(null);
    if (toggle.current && !moved.current) setXform(x => x === 'scale' ? 'rotate' : 'scale');
    toggle.current = false;
    if (marq) {
      const x0 = Math.min(marq.a[0], marq.b[0]), x1 = Math.max(marq.a[0], marq.b[0]), y0 = Math.min(marq.a[1], marq.b[1]), y1 = Math.max(marq.a[1], marq.b[1]);
      setMarq(null);
      if (tool === 'zoom') { if (x1 - x0 > 4 * px) fitTo({ x0, y0, x1, y1 }); else zoomAt(at(e), e.altKey ? 1 / 1.6 : 1.6); return; }
      if (x1 - x0 > 2 * px || y1 - y0 > 2 * px) {
        const hit = live.filter(it => !isLock(it) && it.clip === undefined).filter(it => { const b = V.bounds([it]); return b && (e.altKey ? b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1 : b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1); }).map(i => i.id);
        setSel(s => expand([...(e.shiftKey ? s : []), ...hit])); lastPick.current = hit[hit.length - 1] ?? null; setXform('scale');
      }
      return;
    }
    if (tool === 'zoom' && !moved.current) { zoomAt(at(e), e.altKey || e.button === 2 ? 1 / 1.6 : 1.6); return; }
    if (draft && tool === 'text') {
      const [x0, y0] = draft.a, [x1, y1] = draft.b, w = Math.abs(x1 - x0); setDraft(null);
      const t: V.TextMeta = w > 3 ? { value: '', size: textDef.size, font: textDef.font, x: Math.min(x0, x1), y: Math.min(y0, y1), box: { w }, align: 'left' } : { value: '', size: textDef.size, font: textDef.font, x: x0, y: y0 };
      void (async () => { await os.ensureFont(kernel, textDef.font); const n = add({ ...makeText(t, fill ?? (mode === 'cmyk' ? 'cmyk(0,0,0,100)' : '#222222')) })[0]; startEdit(n.id, 0); })();
      return;
    }
    if (draft) {
      const [x0, y0] = draft.a, [x1, y1] = draft.b, w = Math.abs(x1 - x0), h = Math.abs(y1 - y0); setDraft(null);
      if (Math.max(w, h) > 0.4) {
        const X0 = Math.min(x0, x1), Y0 = Math.min(y0, y1), def = O.SHAPES.find(s => s.id === shapeId);
        const subs = shapeId === 'polygon' ? O.shapeIn(W, { id: 'p', label: '', make: () => [V.polySub(0, 0, 1, sides)] }, X0, Y0, X0 + w, Y0 + h) : shapeId === 'star' ? O.shapeIn(W, { id: 's', label: '', make: () => [V.polySub(0, 0, 1, sides, 0.45)] }, X0, Y0, X0 + w, Y0 + h) : def ? O.shapeIn(W, def, X0, Y0, X0 + w, Y0 + h) : [];
        if (subs.length) add({ ...styled(subs, def?.even), name: def?.label ?? (shapeId === 'star' ? 'Yıldız' : 'Çokgen') });
        setToolRaw('select');
      }
    }
    if (line) {
      const { a, b } = line; setLine(null);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5) {
        if (tool === 'knife') { const targets = itemsRef.current.filter(i => !isHid(i) && !isLock(i) && !i.img && (!sel.length || sel.includes(i.id))); try { const r = O.knife(W, targets, a, b); if (r.size) { const ids: number[] = []; setItems(l => l.flatMap(x => { const p = r.get(x.id); if (!p) return [x]; ids.push(...p.map(q => q.id)); return p; })); setSel(ids); } } catch (er) { alert((er as Error).message); } }
        else addDim(a, b);
      }
    }
    if (ink) {
      if (tool === 'eraser') { const targets = itemsRef.current.filter(i => !isHid(i) && !isLock(i) && !i.img && (!sel.length || sel.includes(i.id))); try { const r = O.erase(W, targets, ink, eraser); if (r.size) setItems(l => l.flatMap(x => r.has(x.id) ? (r.get(x.id) ? [r.get(x.id)!] : []) : [x])); } catch (er) { alert((er as Error).message); } }
      else if (ink.length > 2) { const closed = Math.hypot(ink[0][0] - ink[ink.length - 1][0], ink[0][1] - ink[ink.length - 1][1]) < 12 * px; add({ ...styled([V.smooth(ink, 1.2 * px, closed)]), fill: closed ? fill : null, stroke: closed && fill ? stroke : stroke ?? '#222222', name: 'Serbest çizim' }); }
      setInk(null);
    }
  };
  const zoomAt = (p: P, f: number) => setView(v => { const s = Math.min(400, Math.max(0.2, v.s * f)), k = v.s / s; return { s, x: p[0] + (v.x - p[0]) * k, y: p[1] + (v.y - p[1]) * k }; });
  const addDim = (a: P, b: P) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(ang), ny = Math.cos(ang), t = 1.5, g = V.newId(), col = mode === 'cmyk' ? 'cmyk(0,100,100,0)' : '#e5484d';
    const tick = (p: P): V.Sub => ({ closed: false, pts: [{ x: p[0] - nx * t, y: p[1] - ny * t }, { x: p[0] + nx * t, y: p[1] + ny * t }] });
    let deg = ang * 180 / Math.PI; if (deg > 90 || deg < -90) deg += 180;
    const mx = (a[0] + b[0]) / 2 - nx * 1.2 * Math.sign(Math.cos(ang) || 1), my = (a[1] + b[1]) / 2 - ny * 1.2 * Math.sign(Math.cos(ang) || 1);
    add({ subs: [{ closed: false, pts: [{ x: a[0], y: a[1] }, { x: b[0], y: b[1] }] }, tick(a), tick(b)], fill: null, stroke: col, sw: 0.2, even: false, fixedStroke: true, group: g, name: 'Ölçü çizgisi' },
      { ...makeText({ value: `${L.toFixed(1)} mm`, size: 2.6, font: textDef.font, x: mx, y: my, rot: deg, align: 'center' }, col), group: g, name: 'Ölçü' });
    setToolRaw('select');
  };
  const itemDown = (it: V.Item, e: PE) => {
    if (e.button === 1 || e.button === 2 || space.current.down) return;
    if (isLock(it) && tool !== 'text') return;
    if (tool === 'pick') { e.stopPropagation(); if (!picked) { const s = { fill: it.fill, stroke: it.stroke, sw: it.sw, dash: it.dash, join: it.join, cap: it.cap, opacity: it.opacity, shadow: it.shadow }; setPicked(s); setFill(it.fill); setStroke(it.stroke); } else applyTo(expand([it.id]), x => ({ ...x, ...picked })); return; }
    if (tool === 'text' && it.text) { textDown(it, e); return; }
    if (tool !== 'select' && tool !== 'node') return;
    if (isLock(it)) return;
    e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); moved.current = false;
    if (edit) endEdit();
    const unit = e.ctrlKey ? [it.id] : expand([it.id]), was = sel.includes(it.id);
    const ids = e.shiftKey ? (was ? sel.filter(x => !unit.includes(x)) : [...sel, ...unit]) : was ? sel : unit;
    setSel(ids); lastPick.current = it.id;
    if (tool === 'node') return;
    if (was && !e.shiftKey) toggle.current = true; else setXform('scale');
    const [x0, y0] = at(e), base = itemsRef.current, b0 = V.bounds(base.filter(q => ids.includes(q.id))), T = snapTargets(ids); let first = true;
    let grabPt: P | null = null, gd = 9 * px; for (const q of base.filter(q2 => ids.includes(q2.id))) for (const sub of q.subs) for (const pt of sub.pts) { const d = Math.hypot(pt.x - x0, pt.y - y0); if (d < gd) { gd = d; grabPt = [pt.x, pt.y]; } }
    if (!grabPt) grabPt = [x0, y0];
    drag.current = (x, y, ev) => {
      let dx = x - x0, dy = y - y0;
      if (ev.shiftKey && !ev.ctrlKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      if (magnet && !ev.altKey && b0) {
        let hit: P | null = null, bd = 7 * px; for (const q of T.pts) { const d = Math.hypot(q[0] - (x0 + dx), q[1] - (y0 + dy)); if (d < bd) { bd = d; hit = q; } }
        if (hit && grabPt) { dx = hit[0] - grabPt[0]; dy = hit[1] - grabPt[1]; setSnapP(hit); setSnapL({}); }
        else { setSnapP(null); const bx = best([b0.x0 + dx, (b0.x0 + b0.x1) / 2 + dx, b0.x1 + dx], T.xs, 7 * px), by = best([b0.y0 + dy, (b0.y0 + b0.y1) / 2 + dy, b0.y1 + dy], T.ys, 7 * px); if (bx) dx += bx.d; if (by) dy += by.d; setSnapL({ x: bx?.at, y: by?.at }); }
      }
      setItems(base.map(q => ids.includes(q.id) ? V.mapItem(q, (a, b) => [a + dx, b + dy]) : q), first); first = false;
    };
  };
  const itemDouble = (it: V.Item) => { if (tool !== 'select') return; if (it.text) startEdit(it.id); else { setSel([it.id]); setToolRaw('node'); } };
  /** Seçim kutusu tutamaçları: ölçekle (8), döndür (köşe), eğ (kenar ortası), döndürme merkezi. */
  const handleDown = (kind: 'scale' | 'rot' | 'skew' | 'center', ix: number, iy: number, e: PE) => {
    e.stopPropagation(); if (!sb) return; (e.target as Element).setPointerCapture?.(e.pointerId); toggle.current = false;
    const base = itemsRef.current, [x0, y0] = at(e), cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2, c = rc ?? [cx, cy]; let first = true;
    const hx = ix < 0 ? sb.x0 : ix > 0 ? sb.x1 : cx, hy = iy < 0 ? sb.y0 : iy > 0 ? sb.y1 : cy, Ts = kind === 'scale' ? snapTargets(sel) : null;
    if (kind === 'center') { drag.current = (x, y) => setRc([x, y]); return; }
    const para = kind === 'scale' && ix && !iy && sel.length === 1 ? base.find(q => q.id === sel[0] && q.text?.box && !q.text.rot) : undefined;
    if (para) { const t0 = para.text!; drag.current = x => { const w = ix > 0 ? Math.max(2, x - t0.x) : Math.max(2, t0.x + t0.box!.w - x), nx = ix > 0 ? t0.x : t0.x + t0.box!.w - w; setItems(base.map(q => q.id === para.id ? relayout(q, { box: { w }, x: nx }) : q), first); first = false; }; return; }
    drag.current = (x0p, y0p, ev) => {
      const [x, y] = Ts ? snapPt(x0p + (hx - x0), y0p + (hy - y0), Ts, ev).map((v, q) => v - (q ? hy - y0 : hx - x0)) as P : [x0p, y0p];
      let f: (a: number, b: number) => P, k = 1, keep = true;
      if (kind === 'rot') {
        let r = Math.atan2(y - c[1], x - c[0]) - Math.atan2(y0 - c[1], x0 - c[0]); if (ev.ctrlKey) r = Math.round(r / (Math.PI / 12)) * Math.PI / 12;
        const deg = r * 180 / Math.PI; setItems(base.map(q => sel.includes(q.id) ? V.rotateItem(q, deg, c[0], c[1]) : q), first); first = false; return;
      } else if (kind === 'skew') {
        keep = false;
        if (iy) { const ay = iy < 0 ? sb.y1 : sb.y0, t = (x - x0) / ((hy - ay) || 1); f = (a, b) => [a + (b - ay) * t, b]; }
        else { const ax = ix < 0 ? sb.x1 : sb.x0, t = (y - y0) / ((hx - ax) || 1); f = (a, b) => [a, b + (a - ax) * t]; }
      } else {
        const ax = ev.shiftKey ? cx : ix < 0 ? sb.x1 : ix > 0 ? sb.x0 : cx, ay = ev.shiftKey ? cy : iy < 0 ? sb.y1 : iy > 0 ? sb.y0 : cy;
        let sx = ix ? (x - ax) / ((hx - ax) || 1) : 1, sy = iy ? (y - ay) / ((hy - ay) || 1) : 1;
        if (ix && iy && !ev.ctrlKey) { const d = ((x - ax) * (hx - ax) + (y - ay) * (hy - ay)) / (((hx - ax) ** 2 + (hy - ay) ** 2) || 1); sx = sy = d; }
        keep = Math.abs(sx - sy) < 1e-9 && sx > 0; k = Math.sqrt(Math.abs(sx * sy)); f = (a, b) => [ax + (a - ax) * sx, ay + (b - ay) * sy];
      }
      setItems(base.map(q => { if (!sel.includes(q.id)) return q; const m = V.mapItem(q, f, k); return keep ? m : { ...m, text: undefined }; }), first); first = false;
    };
  };
  const nodeDown = (n: Sel, part: 'p' | 'i' | 'o', e: PE) => {
    e.stopPropagation();
    if (part === 'p') setNodes(s => e.shiftKey ? (s.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? s.filter(q => !(q.item === n.item && q.sub === n.sub && q.i === n.i)) : [...s, n]) : s.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? s : [n]);
    const base = itemsRef.current, [x0, y0] = at(e), T = snapTargets([n.item]); let first = true;
    drag.current = (x, y, ev) => {
      const op0 = base.find(q => q.id === n.item)!.subs[n.sub].pts[n.i], [sx, sy] = part === 'p' ? snapPt(op0.x + x - x0, op0.y + y - y0, T, ev) : [op0.x + x - x0, op0.y + y - y0];
      const dx = sx - op0.x, dy = sy - op0.y, b = clone(base), s = unText(b, n.item).subs[n.sub], p = s.pts[n.i];
      if (part === 'p') { const mv = (q: V.Pt) => { q.x += dx; q.y += dy; if (q.ix !== undefined) { q.ix += dx; q.iy! += dy; } if (q.ox !== undefined) { q.ox += dx; q.oy! += dy; } }; const list = nodes.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? nodes : [n]; for (const m of list) mv(unText(b, m.item).subs[m.sub].pts[m.i]); }
      else {
        const k = part === 'i' ? ['ix', 'iy'] as const : ['ox', 'oy'] as const, o = part === 'i' ? ['ox', 'oy'] as const : ['ix', 'iy'] as const, op = base.find(q => q.id === n.item)!.subs[n.sub].pts[n.i];
        p[k[0]] = op[k[0]]! + (x - x0); p[k[1]] = op[k[1]]! + (y - y0);
        if (!ev.altKey && p[o[0]] !== undefined) { const l = Math.hypot(p[o[0]]! - p.x, p[o[1]]! - p.y), vx = p.x - p[k[0]]!, vy = p.y - p[k[1]]!, m = Math.hypot(vx, vy) || 1; p[o[0]] = p.x + vx / m * l; p[o[1]] = p.y + vy / m * l; }
      }
      setItems(b, first); first = false;
    };
  };
  const nodeDouble = (n: Sel) => setItems(a => { const b = clone(a), s = unText(b, n.item).subs[n.sub], p = s.pts[n.i], m = s.pts.length; if (p.ix !== undefined || p.ox !== undefined) { delete p.ix; delete p.iy; delete p.ox; delete p.oy; } else { const pa = s.pts[(n.i + m - 1) % m], pb = s.pts[(n.i + 1) % m], tx = (pb.x - pa.x) / 6, ty = (pb.y - pa.y) / 6; p.ix = p.x - tx; p.iy = p.y - ty; p.ox = p.x + tx; p.oy = p.y + ty; } return b; });
  const segDown = (n: Sel, e: PE) => { e.stopPropagation(); setSegs(s => e.shiftKey || s.length === 1 ? (s.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? s.filter(q => !(q.item === n.item && q.sub === n.sub && q.i === n.i)) : [...s.slice(-1), n]) : [n]); setNodes([]); };
  const segDouble = (n: Sel, e: React.MouseEvent) => { const [x, y] = at(e); setItems(a => { const b = clone(a), s = unText(b, n.item).subs[n.sub]; V.insertAt(s, n.i, V.nearestT(s.pts[n.i], s.pts[(n.i + 1) % s.pts.length], x, y)); return b; }); setSegs([]); };
  /** Şekil aracı düğmeleri. */
  const nodeOp = (k: 'add' | 'line' | 'curve' | 'close' | 'break') => setItems(a => {
    const b = clone(a), pick = nodes.length ? nodes : segs;
    if (k === 'add') { for (const s of [...segs].sort((p, q) => q.i - p.i)) V.insertAt(unText(b, s.item).subs[s.sub], s.i, 0.5); return b; }
    if (k === 'close') { for (const id of new Set(pick.map(p => p.item).concat(pick.length ? [] : sel))) { const it = unText(b, id); for (const s of it.subs) s.closed = !s.closed; } return b; }
    if (k === 'break') { for (const n of [...nodes].sort((p, q) => q.i - p.i)) { const it = unText(b, n.item), s = it.subs[n.sub]; if (s.closed) { s.pts = [...s.pts.slice(n.i), ...s.pts.slice(0, n.i), { ...s.pts[n.i] }]; s.closed = false; } else if (n.i > 0 && n.i < s.pts.length - 1) { const tail = { closed: false, pts: [{ ...s.pts[n.i] }, ...s.pts.slice(n.i + 1)] }; s.pts = s.pts.slice(0, n.i + 1); it.subs.splice(n.sub + 1, 0, tail); } } return b; }
    for (const n of pick) { const s = unText(b, n.item).subs[n.sub], m = s.pts.length, list = nodes.length ? [n.i] : [n.i, (n.i + 1) % m]; for (const i of list) { const p = s.pts[i]; if (k === 'line') { delete p.ix; delete p.iy; delete p.ox; delete p.oy; } else if (p.ix === undefined && p.ox === undefined) { const pa = s.pts[(i + m - 1) % m], pb = s.pts[(i + 1) % m], tx = (pb.x - pa.x) / 6, ty = (pb.y - pa.y) / 6; p.ix = p.x - tx; p.iy = p.y - ty; p.ox = p.x + tx; p.oy = p.y + ty; } } }
    return b;
  });

  // --- cetvel ve kılavuzlar ---
  const rulerDown = (axis: 'x' | 'y', e: PE) => {
    e.preventDefault(); const r = box.current!.getBoundingClientRect(); let g: IO.Guide | null = null;
    const mv = (ev: PointerEvent) => { const [x, y] = at(ev); g = { axis, pos: Math.round((axis === 'x' ? x : y) * 10) / 10 }; setGuides(gs => [...gs.filter(q => q !== gTmp.current), (gTmp.current = g!)]); };
    const upF = (ev: PointerEvent) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upF); const onRuler = axis === 'x' ? ev.clientX - r.left < 22 : ev.clientY - r.top < 22; if (onRuler && gTmp.current) setGuides(gs => gs.filter(q => q !== gTmp.current)); gTmp.current = null; };
    addEventListener('pointermove', mv); addEventListener('pointerup', upF);
  };
  const gTmp = useRef<IO.Guide | null>(null);
  const guideDown = (i: number, e: PE) => {
    if (tool !== 'select' || e.button !== 0) return; e.stopPropagation(); setSelGuide(i); setSel([]);
    const r = box.current!.getBoundingClientRect(), axis = guides[i].axis;
    const mv = (ev: PointerEvent) => { const [x, y] = at(ev); setGuides(gs => gs.map((q, k) => k === i ? { ...q, pos: Math.round((axis === 'x' ? x : y) * 10) / 10 } : q)); };
    const upF = (ev: PointerEvent) => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upF); if (axis === 'x' ? ev.clientX - r.left < 22 : ev.clientY - r.top < 22) { setGuides(gs => gs.filter((_, k) => k !== i)); setSelGuide(null); } };
    addEventListener('pointermove', mv); addEventListener('pointerup', upF);
  };
  const ruler = (axis: 'x' | 'y') => {
    const len = axis === 'x' ? size.w : size.h, s = view.s, o = axis === 'x' ? view.x - size.w / 2 / s : view.y - size.h / 2 / s;
    const stepMm = [1, 2, 5, 10, 20, 50, 100, 200, 500].find(q => q * s >= 50) ?? 1000, minor = stepMm / 5, out: ReactNode[] = [];
    for (let v = Math.floor(o / minor) * minor; v <= o + len / s; v += minor) {
      const p = (v - o) * s, major = Math.abs(v / stepMm - Math.round(v / stepMm)) < 1e-6, L = major ? 10 : 4;
      out.push(axis === 'x' ? <line key={v} x1={p} x2={p} y1={22 - L} y2={22} /> : <line key={v} y1={p} y2={p} x1={22 - L} x2={22} />);
      if (major) out.push(axis === 'x' ? <text key={'t' + v} x={p + 2} y={10}>{Math.round(v)}</text> : <text key={'t' + v} x={10} y={p - 2} transform={`rotate(-90 10 ${p - 2})`}>{Math.round(v)}</text>);
    }
    return <svg className={`vruler ${axis}`} onPointerDown={e => rulerDown(axis === 'x' ? 'y' : 'x', e)}>{out}</svg>;
  };

  // --- klavye (Corel kısayolları) ---
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (hidden) return;
    if ((e.target as HTMLElement).closest('input,textarea,select')) { if (e.key === 'Escape' && edit) { endEdit(); setToolRaw('select'); } return; }
    if (e.key === ' ') { if (e.type === 'keydown') { if (!space.current.down) space.current = { down: true, used: false }; e.preventDefault(); } else { const wasUsed = space.current.used; space.current = { down: false, used: false }; if (!wasUsed) setTool(tool === 'select' ? 'node' : 'select'); } return; }
    if (e.type !== 'keydown') return;
    const c = e.ctrlKey || e.metaKey, key = e.key.toLowerCase(), has = sel.length > 0;
    const run = (f: () => void) => { e.preventDefault(); f(); };
    if (c && key === 'z') run(() => e.shiftKey ? undo(future, past) : undo(past, future));
    else if (c && key === 'y') run(() => undo(future, past));
    else if (c && e.shiftKey && key === 'd') run(() => act('stepRepeat', step.n, step.dx, step.dy));
    else if (c && key === 'd') run(() => dup());
    else if (c && key === 'a') run(() => { setSel(expand(live.filter(i => !isLock(i) && i.clip === undefined).map(i => i.id))); setXform('scale'); });
    else if (c && key === 'c') run(copyItems);
    else if (c && key === 'x') run(() => { copyItems(); remove(); });
    else if (c && key === 'v') run(pasteItems);
    else if (c && key === 'g') run(group);
    else if (c && key === 'u') run(ungroup);
    else if (c && key === 'l') run(combineSel);
    else if (c && key === 'k') run(breakSel);
    else if (c && e.shiftKey && key === 'q') run(outlineObj);
    else if (c && key === 'q') run(toCurves);
    else if (c && key === 'r') run(() => { if (last.current) (ops[last.current[0]] as (...a: unknown[]) => void)(...last.current[1]); });
    else if (key === 'pageup') run(() => order(c ? 'up' : 'front'));
    else if (key === 'pagedown') run(() => order(c ? 'down' : 'back'));
    else if (e.key === '+' && has) run(() => dup(true));
    else if ((key === 'delete' || key === 'backspace') && selGuide !== null && !sel.length) run(() => { setGuides(g => g.filter((_, k) => k !== selGuide)); setSelGuide(null); });
    else if (key === 'delete' || key === 'backspace') run(remove);
    else if (key === 'enter') run(finishPen);
    else if (key === 'escape') { if (cm) setCm(null); else if (pen) finishPen(); else if (menu) setMenu(null); else { setSel([]); setNodes([]); setSegs([]); setPicked(null); } }
    else if (e.key === 'F4') run(fitAll);
    else if (e.key === 'F2' && e.shiftKey) run(() => fitTo(sb));
    else if (e.key === 'F3') run(() => zoomAt([view.x, view.y], 1 / 1.6));
    else if (e.key === 'F5') run(() => setTool('draw'));
    else if (e.key === 'F8') run(() => setTool('text'));
    else if (e.key === 'F10') run(() => setTool('node'));
    else if (e.key === 'F12') run(() => document.querySelector('.vcard-stroke')?.scrollIntoView({ behavior: 'smooth' }));
    else if (SHAPE_KEYS[e.key] && !(has && 'lrtbcep'.includes(key))) run(() => { setShapeId(SHAPE_KEYS[e.key]); setTool('shape'); });
    else if (has && !c && 'lrtbcep'.includes(key) && key.length === 1) run(() => align(key as 'l'));
    else if (!c && key === 'x') run(() => setTool('eraser'));
    else if (!c && key === 'z') run(() => setTool('zoom'));
    else if (!c && key === 'h') run(() => setTool('pan'));
    else if (!c && key === 'i') run(() => setTool('pick'));
    else if (key.startsWith('arrow') && has) run(() => { const s = e.shiftKey ? 5 : 0.5, d = { arrowleft: [-s, 0], arrowright: [s, 0], arrowup: [0, -s], arrowdown: [0, s] }[key]!; act('nudge', d[0], d[1]); });
  };
  useEffect(() => { const f = (e: KeyboardEvent) => keyRef.current(e); addEventListener('keydown', f); addEventListener('keyup', f); return () => { removeEventListener('keydown', f); removeEventListener('keyup', f); }; }, []);
  const wheel = (e: React.WheelEvent) => zoomAt(at(e), Math.exp(-e.deltaY * 0.0015));

  const grid = useMemo(() => { if (isFree) return null; const st = [0.1, 0.5, 1, 5, 10, 50, 100].find(q => q * view.s >= 8) ?? 100, x0 = view.x - size.w / 2 / view.s, y0 = view.y - size.h / 2 / view.s, x1 = x0 + size.w / view.s, y1 = y0 + size.h / view.s, l: ReactNode[] = []; for (let x = Math.ceil(x0 / st) * st; x < x1; x += st) l.push(<line key={'x' + x} x1={x} x2={x} y1={y0} y2={y1} className={x % (st * 10) === 0 ? 'g2' : 'g1'} strokeWidth={1} vectorEffect="non-scaling-stroke" />); for (let y = Math.ceil(y0 / st) * st; y < y1; y += st) l.push(<line key={'y' + y} y1={y} y2={y} x1={x0} x2={x1} className={y % (st * 10) === 0 ? 'g2' : 'g1'} strokeWidth={1} vectorEffect="non-scaling-stroke" />); return l; }, [view, size, isFree]);
  const D = (p: { t: Tool; k?: string; label: string; children: ReactNode; on?: () => void }) => <button className={tool === p.t ? 'db active' : 'db'} data-tip={`${p.label}${p.k ? ` (${p.k})` : ''}`} aria-label={p.label} aria-pressed={tool === p.t} onClick={p.on ?? (() => setTool(p.t))}>{p.children}</button>;
  const A = (p: { t: string; on(): void; off?: boolean; children: ReactNode }) => <button className="ib" title={p.t} aria-label={p.t} disabled={p.off} onClick={p.on}>{p.children}</button>;
  const isN = (n: Sel) => nodes.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i), isS = (n: Sel) => segs.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i);
  const r = 4.5 * px;
  const hint = note ?? {
    select: xform === 'rotate' ? 'Köşeleri sürükle: döndür (Ctrl: 15°). Kenar ortaları: eğ. Ortadaki daire döndürme merkezi. Tekrar tıkla: ölçekleme.' : 'Tıkla seç, sürükle taşı (mıknatıs açıkken hizalama çizgileri). Seçiliyken bir daha tıkla: döndürme. Çift tık: yazıyı düzenle / düğümler. Boş alanda sürükle: çerçeveyle seç.',
    node: 'Noktayı sürükle; Shift ile çoklu seç. Kenara tıkla; Shift ile ikinci kenar: aradaki köşeye pah. Kenara çift tık: nokta ekle. Noktaya çift tık: köşe ↔ eğri.',
    pen: 'Tıkla: köşe noktası, sürükle: eğri. İlk noktaya tıkla: kapat. Enter: bitir.', draw: 'Basılı tutup çiz. Başladığın yere dönersen şekil kapanır.',
    shape: 'Sürükleyerek çiz. Ctrl: eşit en-boy, Shift: merkezden.', text: 'Tıkla ve yaz. Var olan yazıya tıkla: düzenle. Esc: bitir.',
    knife: 'Şeklin üstünden çizgi çek: o çizgiden ikiye böler (seçim varsa yalnız seçili). Shift: 15° adım.', eraser: 'Silinecek yerin üstünden sürükle (seçim varsa yalnız seçili nesneden siler).',
    dim: 'İki nokta arasında sürükle: ölçü çizgisi ve mm yazısı eklenir. Shift: 15° adım.', pick: picked ? 'Renk alındı: uygulanacak nesnelere tıkla. Esc: bırak.' : 'Rengini almak istediğin nesneye tıkla.',
    zoom: 'Tıkla: yakınlaş, Alt+tık: uzaklaş, sürükle: alanı yakınlaştır.', pan: 'Sürükleyerek kaydır. Boşluk basılıyken her araçta kaydırır.',
  }[tool];

  const byId = new Map(items.map(i => [i.id, i])), clipIds = new Set(items.filter(i => i.clip !== undefined).map(i => i.clip!));
  const defsShadow = isFree ? items.filter(i => i.shadow && !i.hidden).map(i => <filter key={'f' + i.id} id={`vsh${i.id}`} x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx={i.shadow!.dx} dy={i.shadow!.dy} stdDeviation={i.shadow!.blur / 2} floodColor={C.css(i.shadow!.color)} floodOpacity={i.shadow!.opacity} /></filter>) : null;
  const defsFill = <>
    {items.filter(i => i.fill && i.grad && !isHid(i)).map(i => { const st = i.grad!.stops.map((q, k) => <stop key={k} offset={q.o} stopColor={C.css(q.c)} />); return i.grad!.type === 'radial' ? <radialGradient key={'g' + i.id} id={`vgr${i.id}`} cx=".5" cy=".5" r=".5">{st}</radialGradient> : <linearGradient key={'g' + i.id} id={`vgr${i.id}`} x1="0" y1=".5" x2="1" y2=".5" gradientTransform={`rotate(${i.grad!.angle} .5 .5)`}>{st}</linearGradient>; })}
    {Object.entries(patterns).filter(([k]) => items.some(i => i.pat === k)).map(([k, P2]) => <pattern key={'p' + k} id={`vpt${k}`} patternUnits="userSpaceOnUse" width={P2.w} height={P2.h}>{P2.items.map(q => q.img ? <image key={q.id} href={assets[q.img.key]} width={1} height={1} preserveAspectRatio="none" transform={`matrix(${IO.imgMatrix(q).join(' ')})`} /> : V.fillGroups(q).map((g, n) => <path key={q.id + '-' + n} d={g.subs.map(V.subD).join('')} fill={C.css(g.fill)} fillRule={q.even ? 'evenodd' : 'nonzero'} stroke={q.stroke && n === 0 ? C.css(q.stroke) : 'none'} strokeWidth={q.sw} />))}</pattern>)}
  </>;
  const itemMenu = (it: V.Item, e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (rightPan.current) { rightPan.current = false; return; } if (!isLock(it) && !sel.includes(it.id)) { setSel(expand([it.id])); lastPick.current = it.id; } setCm({ x: e.clientX, y: e.clientY, id: it.id }); };
  const itemEl = (it: V.Item) => {
    if (isHid(it)) return null;
    const d = V.itemDc(it), pe = it.clip !== undefined ? 'none' as const : undefined, cur = tool === 'select' && !isLock(it) ? 'move' : undefined;
    const ev = { onPointerDown: (e: PE) => itemDown(it, e), onDoubleClick: () => itemDouble(it), onContextMenu: (e: React.MouseEvent) => itemMenu(it, e) };
    const st = it.stroke ? { stroke: C.css(it.stroke), strokeWidth: it.sw, strokeDasharray: it.dash?.length ? it.dash.join(' ') : undefined, strokeLinejoin: it.join ?? 'round', strokeLinecap: it.cap ?? 'round' } as const : { stroke: 'none' };
    let body: ReactNode;
    if (it.img) body = <><image href={assets[it.img.key]} x={0} y={0} width={1} height={1} preserveAspectRatio="none" transform={`matrix(${IO.imgMatrix(it).join(' ')})`} style={{ pointerEvents: 'none' }} /><path d={d} fill="transparent" {...ev} style={{ pointerEvents: pe, cursor: cur }} /></>;
    else {
      const ref = it.fill && it.grad ? `url(#vgr${it.id})` : it.fill && it.pat && patterns[it.pat] ? `url(#vpt${it.pat})` : null, groups = ref ? [{ fill: it.fill, subs: it.subs }] : V.fillGroups(it);
      body = groups.length === 1 ? <path d={d} fill={ref ?? C.css(groups[0].fill)} fillRule={it.even ? 'evenodd' : 'nonzero'} {...st} {...ev} style={{ pointerEvents: pe, cursor: cur }} />
        : <>{groups.map((g, k) => <path key={k} d={g.subs.map(V.subD).join('')} fill={C.css(g.fill)} fillRule={it.even ? 'evenodd' : 'nonzero'} {...ev} style={{ pointerEvents: pe, cursor: cur }} />)}{it.stroke && <path d={d} fill="none" {...st} style={{ pointerEvents: 'none' }} />}</>;
      if (!it.fill && it.clip === undefined) body = <>{body}<path d={d} fill="none" stroke="transparent" strokeWidth={8 * px} pointerEvents="stroke" {...ev} /></>;
    }
    return <g key={it.id} clipPath={it.clip !== undefined ? `url(#vcl${it.clip})` : undefined} opacity={isFree || it.img ? it.opacity : undefined} filter={isFree && it.shadow ? `url(#vsh${it.id})` : undefined}>{body}</g>;
  };
  /** Corel tarzı döndürme oku: köşede dışa bakan kavisli çift ok. */
  const rotIcon = (X: number, Y: number, ix: number, iy: number) => {
    const R = 3.4 * r, cx = X + ix * 0.6 * r, cy = Y + iy * 0.6 * r, phi = Math.atan2(iy, ix), a0 = phi - 0.62, a1 = phi + 0.62, P0: P = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], P1: P = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
    const head = (p: P, t: P) => { const n: P = [-t[1], t[0]], L = 1.5 * r, Wd = 1.05 * r; return `M${p[0] + t[0] * L} ${p[1] + t[1] * L}L${p[0] + n[0] * Wd} ${p[1] + n[1] * Wd}L${p[0] - n[0] * Wd} ${p[1] - n[1] * Wd}Z`; };
    return <><circle className="vhit" cx={cx + Math.cos(phi) * R * 0.85} cy={cy + Math.sin(phi) * R * 0.85} r={2.6 * r} />
      <path className="vrot" d={`M${P0[0]} ${P0[1]}A${R} ${R} 0 0 1 ${P1[0]} ${P1[1]}`} strokeWidth={2 * px} />
      <path className="vroth" d={head(P1, [-Math.sin(a1), Math.cos(a1)]) + head(P0, [Math.sin(a0), -Math.cos(a0)])} /></>;
  };
  /** Eğme oku: kenar boyunca çift yönlü ok. */
  const skewIcon = (X: number, Y: number, horiz: boolean) => {
    const L = 2.6 * r, t: P = horiz ? [1, 0] : [0, 1], n: P = [-t[1], t[0]], a: P = [X - t[0] * L, Y - t[1] * L], b: P = [X + t[0] * L, Y + t[1] * L], H = 1.2 * r, Wd = 0.9 * r;
    const head = (p: P, dir: number) => `M${p[0] + t[0] * H * dir} ${p[1] + t[1] * H * dir}L${p[0] + n[0] * Wd} ${p[1] + n[1] * Wd}L${p[0] - n[0] * Wd} ${p[1] - n[1] * Wd}Z`;
    return <><rect x={horiz ? X - L - r : X - 1.6 * r} y={horiz ? Y - 1.6 * r : Y - L - r} width={horiz ? 2 * L + 2 * r : 3.2 * r} height={horiz ? 3.2 * r : 2 * L + 2 * r} className="vhit" />
      <path className="vrot" d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} strokeWidth={2 * px} /><path className="vroth" d={head(b, 1) + head(a, -1)} /></>;
  };
  const one = selItems[0];
  const shapeSubs = useMemo(() => Object.fromEntries(O.SHAPES.map(q => { try { return [q.id, q.make(W)]; } catch { return [q.id, []]; } })) as Record<string, V.Sub[]>, [W]);
  const shapePrev = (subs: V.Sub[], even?: boolean) => { const it = { id: 0, subs, fill: null, stroke: null, sw: 0, even: !!even }, b = V.bounds([it]); if (!b) return <svg viewBox="0 0 24 24" />; const k = 20 / Math.max(b.x1 - b.x0, b.y1 - b.y0); return <svg viewBox="-2 -2 24 24"><path d={V.itemD(V.mapItem(it, (x, y) => [(x - b.x0) * k + (20 - (b.x1 - b.x0) * k) / 2, (y - b.y0) * k + (20 - (b.y1 - b.y0) * k) / 2]))} fillRule={even ? 'evenodd' : 'nonzero'} /></svg>; };
  const sw = (c: string | null, on: () => void, onR: () => void, key?: string, cls = '') => <button key={key ?? c ?? 'none'} className={`sw ${cls}`} onMouseDown={e => e.preventDefault()} title={c ? `${C.label(c)} — sol tık: dolgu, sağ tık: kenar` : 'Sol tık: dolguyu kaldır, sağ tık: kenarı kaldır'} style={{ background: c ? C.css(c) : undefined }} onClick={on} onContextMenu={e => { e.preventDefault(); onR(); }}>{c ? '' : '∅'}</button>;
  const curFill = sel.length ? one?.fill ?? null : fill, curStroke = sel.length ? one?.stroke ?? null : stroke, curSw = sel.length ? one?.sw ?? 0.5 : 0.5;

  return <div className={isFree ? (hidden ? 'vec free off' : 'vec free') : 'vec'} onDragOver={e => { if (!isFree) { e.preventDefault(); e.stopPropagation(); } }} onDrop={async e => { if (isFree) return; e.preventDefault(); e.stopPropagation(); void dropFiles(await Promise.all([...e.dataTransfer.files].map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))), at(e)); }}>
    <div className="vec-top">
      {!isFree && <><b>{title}</b><i /></>}
      <div className="vt-mid">
      <A t="Geri al (Ctrl+Z)" off={!past.current.length} on={() => undo(past, future)}><Undo2 /></A>
      <A t="Yinele (Ctrl+Y)" off={!future.current.length} on={() => undo(future, past)}><Redo2 /></A><i />
      {tool === 'node' ? <>
        <button className="tb" disabled={!segs.length} onClick={() => nodeOp('add')}>Düğüm ekle</button>
        <button className="tb" disabled={!nodes.length} onClick={remove}>Düğüm sil</button>
        <button className="tb" disabled={!nodes.length && !segs.length} onClick={() => nodeOp('line')}>Düze çevir</button>
        <button className="tb" disabled={!nodes.length && !segs.length} onClick={() => nodeOp('curve')}>Eğriye çevir</button>
        <button className="tb" disabled={!nodes.length} onClick={() => nodeOp('break')}>Düğümde kır</button>
        <button className="tb" disabled={!nodes.length && !segs.length && !sel.length} onClick={() => nodeOp('close')}>Aç / kapat</button><i />
        <label className="mini">Köşe <input type="number" min={0.1} step={0.1} value={corner} onChange={e => setCorner(Math.max(0.05, +e.target.value || 0.05))} /> mm</label>
        <button className="tb" disabled={!nodes.length && segs.length < 2} title="Seçili köşelere pah" onClick={() => doCorner('chamfer')}>Pah</button>
        <button className="tb" disabled={!nodes.length && segs.length < 2} title="Seçili köşeleri yuvarla" onClick={() => doCorner('round')}>Yuvarla</button>
      </> : <>
        <A t="Sola hizala (L)" off={!sel.length} on={() => align('l')}><AlignStartVertical /></A>
        <A t="Yatay ortala (C)" off={!sel.length} on={() => align('c')}><AlignCenterVertical /></A>
        <A t="Sağa hizala (R)" off={!sel.length} on={() => align('r')}><AlignEndVertical /></A>
        <A t="Üste hizala (T)" off={!sel.length} on={() => align('t')}><AlignStartHorizontal /></A>
        <A t="Dikey ortala (E)" off={!sel.length} on={() => align('e')}><AlignCenterHorizontal /></A>
        <A t="Alta hizala (B)" off={!sel.length} on={() => align('b')}><AlignEndHorizontal /></A>
        <A t={area ? 'Yüzeyin ortasına al (P)' : 'Sayfanın ortasına al (P)'} off={!sel.length} on={() => align('p')}><Crosshair /></A>
        <A t="Yatay eşit dağıt (3+ nesne)" off={units(sel).length < 3} on={() => distribute(true)}><AlignHorizontalDistributeCenter /></A>
        <A t="Dikey eşit dağıt (3+ nesne)" off={units(sel).length < 3} on={() => distribute(false)}><AlignVerticalDistributeCenter /></A><i />
        <A t="Kaynaştır (weld)" off={sel.length < 2} on={() => bool('union')}><Merge /></A>
        <A t="Kırp: alttakinden üsttekileri çıkar (trim)" off={sel.length < 2} on={() => bool('subtract')}><SquaresSubtract /></A>
        <A t="Kesişim" off={sel.length < 2} on={() => bool('intersect')}><SquaresIntersect /></A>
        <A t="Sadeleştir: üst üste binenleri temizle" off={sel.length < 2} on={simplifySel}><SquaresExclude /></A><i />
        <A t="Birleştir (Ctrl+L): tek nesne, iç içe yollar delik" off={sel.length < 2} on={combineSel}><Combine /></A>
        <A t="Parçala (Ctrl+K)" off={!selItems.some(i => i.subs.length > 1)} on={breakSel}><Box /></A>
        <A t="Grupla (Ctrl+G)" off={sel.length < 2} on={group}><Group /></A>
        <A t="Grubu çöz (Ctrl+U)" off={!selItems.some(i => i.group !== undefined)} on={ungroup}><Ungroup /></A><i />
        <A t="En öne (Shift+PgUp)" off={!sel.length} on={() => order('front')}><ArrowUpToLine /></A>
        <A t="En arkaya (Shift+PgDn)" off={!sel.length} on={() => order('back')}><ArrowDownToLine /></A><i />
        <A t="90° sola döndür" off={!sb} on={() => act('rotate', -90)}><RotateCcw /></A>
        <A t="90° sağa döndür" off={!sb} on={() => act('rotate', 90)}><RotateCw /></A>
        <A t="Yatay aynala" off={!sb} on={() => act('mirror', true)}><FlipHorizontal2 /></A>
        <A t="Dikey aynala" off={!sb} on={() => act('mirror', false)}><FlipVertical2 /></A><i />
      </>}
      </div>
      <div className="vt-end">
      <button className={magnet ? 'ib active' : 'ib'} title="Mıknatıs: sürüklerken diğer nesnelere, sayfaya ve kılavuzlara hizalanır (Alt basılıyken kapalı)" aria-pressed={magnet} onClick={() => setMagnet(!magnet)}><Magnet /></button>
      {!isFree && <>
      <div className="vmenu"><button className="tb" onClick={() => setMenu(menu === 'import' ? null : 'import')}><FileUp />İçe aktar</button>
        {menu === 'import' && <div className="vpop" ref={placePop}><button onClick={() => void importPick()}>Dosya seç…<small>Resim, SVG, PDF / AI, DXF; sürükleyip de bırakabilirsin</small></button></div>}</div>
      <div className="vmenu"><button className="tb" onClick={() => setMenu(menu === 'export' ? null : 'export')} title="Birebir mm ölçüyle: Corel, Illustrator, lazer ya da UV baskı için"><FileDown />Dışa aktar</button>
        {menu === 'export' && <div className="vpop" ref={placePop}>
          {isFree ? <>
            <button onClick={() => exportAs('pdf-pages')}>PDF — her artboard ayrı sayfa</button>
            <button onClick={() => exportAs('pdf-one')}>PDF — tek sayfa<small>Tüm artboardlar tek sayfada</small></button>
            <button onClick={() => exportAs('svg-free')}>SVG</button>
          </> : <>
            {guide && <button onClick={() => exportAs('svg-both')}>SVG — yüzey + tasarım<small>Yüzey sınırı kırmızı kıl çizgi</small></button>}
            {guide && <button onClick={() => exportAs('svg-surface')}>SVG — yalnız yüzey<small>Tasarımı başka programda yapmak için</small></button>}
            <button disabled={!items.length} onClick={() => exportAs('svg-design')}>SVG — yalnız tasarım</button>
            {guide && <button onClick={() => exportAs('pdf-surface')}>PDF — yüzey + tasarım</button>}
            <button disabled={!items.length} onClick={() => exportAs('pdf-design')}>PDF — yalnız tasarım</button>
          </>}
          <button onClick={() => exportAs('dxf')}>DXF<small>Lazer için; katmanlar renge göre</small></button>
        </div>}</div>
      </>}
      <A t="Tümünü göster (F4)" on={fitAll}><Maximize /></A>
      {isFree ? <>
        {free?.onToSurface && <button className="tb" disabled={!sel.length} title="Seçili çizimi 3D'de bir yüze oturt" onClick={() => free.onToSurface!(printable(itemsRef.current.filter(i => sel.includes(i.id))))}>Yüzeye gönder</button>}
        <button className="tb primary" disabled={!items.length} title="Seçili çizimi (seçim yoksa hepsini) 3B sahneye kabartma olarak ekler" onClick={insert3d}>{sel.length ? 'Seçileni 3B’ye al' : '3B’ye al'}</button>
      </> : <>
        {onSendTo2d && <button className="tb" title="Yüzeyin şeklini ve tasarımı 2D vektör sayfasına yeni artboard olarak taşır" onClick={() => { endEdit(); onSendTo2d(itemsRef.current); }}>Vektör sayfasına gönder</button>}
        <button className="tb" onClick={onClose}>Vazgeç</button>
        <button className="tb primary" disabled={!items.length} onClick={saveSurface}>Kaydet ve 3B'ye al</button>
      </>}
      </div>
    </div>

    <aside className="vec-layers">
      {isFree && <section><header><b>Artboardlar</b><div className="vmenu left"><button className="ib" title="Artboard ekle" aria-label="Artboard ekle" onClick={() => setMenu(menu === 'board' ? null : 'board')}><Plus /></button>
        {menu === 'board' && <div className="vpop" ref={placePop}>{PRESETS.flatMap(([n, w, h]) => [<button key={n} onClick={() => addBoard(n, w, h)}>{n}<small>{w} × {h} mm</small></button>, ...(w !== h && n.startsWith('A') ? [<button key={n + 'y'} onClick={() => addBoard(n + ' yatay', h, w)}>{n} yatay<small>{h} × {w} mm</small></button>] : [])])}<button onClick={() => { const s = prompt('Genişlik × yükseklik (mm)', '200x100'); const m = s?.match(/([\d.]+)\D+([\d.]+)/); if (m) addBoard('Özel', +m[1], +m[2]); }}>Özel ölçü…</button></div>}</div></header>
        {boards.map(b => <div key={b.id} className={selBoard === b.id ? 'lrow on' : 'lrow'} onClick={() => { setSelBoard(b.id); setSel([]); fitTo({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }); }}><span className="lname">{b.name}</span><small>{b.w}×{b.h}</small></div>)}
      </section>}
      <section className="grow"><header><b>Katmanlar</b>{isFree && <button className="ib" title="Katman ekle" aria-label="Katman ekle" onClick={() => { const id = V.newId(); setLayers(ls => [...ls, { id, name: `Katman ${ls.length + 1}` }]); setActiveLayer(id); }}><Plus /></button>}</header>
        <div className="lscroll" onScroll={e => setLscroll((e.target as HTMLDivElement).scrollTop)} ref={el => { if (el && Math.abs(el.clientHeight - lh) > 2) setLh(el.clientHeight); }}>{(() => {
          const rows: ({ kind: 'layer'; l: IO.Layer } | { kind: 'item'; it: V.Item })[] = [];
          for (const l of [...layers].reverse()) { if (isFree) rows.push({ kind: 'layer', l }); for (const it of [...items].reverse()) if (layerOf(it)?.id === l.id) rows.push({ kind: 'item', it }); }
          const RH = 27, from = Math.max(0, Math.floor(lscroll / RH) - 10), to = Math.min(rows.length, Math.ceil((lscroll + lh) / RH) + 10);
          return <div style={{ height: rows.length * RH, position: 'relative' }}>{rows.slice(from, to).map((row, k) => { const top = (from + k) * RH;
            if (row.kind === 'layer') { const l = row.l; return <div key={'L' + l.id} className={activeLayer === l.id ? 'lrow layer on' : 'lrow layer'} style={{ position: 'absolute', top, left: 0, right: 0 }} onClick={() => setActiveLayer(l.id)} onDoubleClick={() => setRenameL(l.id)}>
              {renameL === l.id ? <input autoFocus defaultValue={l.name} onBlur={e => { const v = e.target.value.trim(); if (v) setLayers(ls => ls.map(q => q.id === l.id ? { ...q, name: v } : q)); setRenameL(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /> : <span className="lname"><b>{l.name}</b></span>}
              <button className="ib" title={l.noPrint ? 'Yazdırılmaz (dışa aktarılmaz)' : 'Yazdırılır'} aria-label="Yazdırma" onClick={e => { e.stopPropagation(); setLayers(ls => ls.map(q => q.id === l.id ? { ...q, noPrint: !q.noPrint } : q)); }}>{l.noPrint ? <PrinterX /> : <Printer />}</button>
              <button className="ib" title={l.hidden ? 'Göster' : 'Gizle'} aria-label="Görünürlük" onClick={e => { e.stopPropagation(); setLayers(ls => ls.map(q => q.id === l.id ? { ...q, hidden: !q.hidden } : q)); }}>{l.hidden ? <EyeOff /> : <Eye />}</button>
              <button className="ib" title={l.locked ? 'Kilidi aç' : 'Kilitle'} aria-label="Kilit" onClick={e => { e.stopPropagation(); setLayers(ls => ls.map(q => q.id === l.id ? { ...q, locked: !q.locked } : q)); setSel([]); }}>{l.locked ? <Lock /> : <LockOpen />}</button>
              {layers.length > 1 && <button className="ib ldel" title="Katmanı sil (nesneleri alttaki katmana geçer)" aria-label="Katmanı sil" onClick={e => { e.stopPropagation(); const i = layers.findIndex(q => q.id === l.id), to2 = layers[i - 1] ?? layers[i + 1]; setItems(a => a.map(x => layerOf(x)?.id === l.id ? { ...x, layer: to2.id } : x)); setLayers(ls => ls.filter(q => q.id !== l.id)); if (activeLayer === l.id) setActiveLayer(to2.id); }}><Trash2 /></button>}
            </div>; }
            const it = row.it; return <div key={it.id} className={(sel.includes(it.id) ? 'lrow on' : 'lrow') + (it.clip !== undefined ? ' kid' : '') + (isFree ? ' in' : '')} style={{ position: 'absolute', top, left: 0, right: 0 }} onClick={e => { if (isLock(it)) return; const u = e.ctrlKey ? [it.id] : expand([it.id]); setSel(s2 => e.shiftKey ? [...new Set([...s2, ...u])] : u); lastPick.current = it.id; setSelBoard(null); }} onDoubleClick={() => setRename(it.id)} onContextMenu={e => itemMenu(it, e)}>
              <span className="lsw" style={{ background: it.img ? `center/cover url(${assets[it.img.key]})` : C.css(it.fill ?? it.stroke) }} />
              {rename === it.id ? <input autoFocus defaultValue={it.name ?? ''} onBlur={e => { const v = e.target.value.trim(); applyTo([it.id], x => ({ ...x, name: v || undefined })); setRename(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                : <span className="lname">{it.name ?? (it.text ? `“${it.text.value.slice(0, 18)}”` : 'Eğri')}{it.group !== undefined ? ' ⧉' : ''}{clipIds.has(it.id) ? ' ▣' : ''}</span>}
              <button className="ib" title={it.hidden ? 'Göster' : 'Gizle'} aria-label={it.hidden ? 'Göster' : 'Gizle'} onClick={e => { e.stopPropagation(); applyTo([it.id], x => ({ ...x, hidden: !x.hidden })); }}>{it.hidden ? <EyeOff /> : <Eye />}</button>
              <button className="ib" title={it.locked ? 'Kilidi aç' : 'Kilitle'} aria-label={it.locked ? 'Kilidi aç' : 'Kilitle'} onClick={e => { e.stopPropagation(); applyTo([it.id], x => ({ ...x, locked: !x.locked })); setSel(s2 => s2.filter(q => q !== it.id)); }}>{it.locked ? <Lock /> : <LockOpen />}</button>
            </div>; })}</div>; })()}
          {!items.length && <p className="hint">Henüz nesne yok. Alttaki araçlardan çiz, resim ya da dosya sürükleyip bırak.</p>}</div>
      </section>
    </aside>

    <div className="vec-canvas" ref={box} onContextMenu={e => { e.preventDefault(); if (rightPan.current) { rightPan.current = false; return; } setCm({ x: e.clientX, y: e.clientY }); }}>
      <svg ref={svg} viewBox={vb} width={size.w} height={size.h} onPointerDown={down} onPointerMove={moveEv} onPointerUp={up} onWheel={wheel} style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' || tool === 'node' ? 'default' : tool === 'zoom' ? 'zoom-in' : tool === 'text' ? 'text' : 'crosshair' }}>
        <defs>
          {[...clipIds].map(id => byId.get(id) && <clipPath key={id} id={`vcl${id}`}><path d={V.itemDc(byId.get(id)!)} clipRule={byId.get(id)!.even ? 'evenodd' : 'nonzero'} /></clipPath>)}
          {defsShadow}
          {defsFill}
          <filter id="vboard" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx="0" dy={0.6 * px * 3} stdDeviation={px * 4} floodOpacity="0.18" /></filter>
        </defs>
        {grid}
        {boards.map(b => <g key={b.id}><rect className={selBoard === b.id ? 'vboard on' : 'vboard'} x={b.x} y={b.y} width={b.w} height={b.h} filter="url(#vboard)" strokeWidth={px * (selBoard === b.id ? 2 : 1)} />
          <text className="vblabel" x={b.x} y={b.y - 5 * px} fontSize={12 * px} onPointerDown={e => { if (tool !== 'select') return; e.stopPropagation(); setSelBoard(b.id); setSel([]); const [x0, y0] = at(e), b0 = b; const bs = boards; drag.current = (x, y) => setBoards(bs.map(q => q.id === b0.id ? { ...q, x: Math.round((b0.x + x - x0) * 10) / 10, y: Math.round((b0.y + y - y0) * 10) / 10 } : q)); }}>{b.name} · {b.w}×{b.h} mm</text></g>)}
        {guide && <path d={guide} className="guide" strokeWidth={2} />}
        {ordered.map(itemEl)}
        {selItems.map(it => <path key={'o' + it.id} d={V.itemDc(it)} className="vselo" strokeWidth={px} />)}
        {guides.map((g, i) => { const props = { className: selGuide === i ? 'vguide on' : 'vguide', onPointerDown: (e: PE) => guideDown(i, e), onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setSelGuide(i); setCm({ x: e.clientX, y: e.clientY, guide: i }); } };
          return g.axis === 'x' ? <g key={i} {...props}><line x1={g.pos} x2={g.pos} y1={view.y - size.h * px} y2={view.y + size.h * px} stroke="transparent" strokeWidth={8 * px} /><line className="vgl" x1={g.pos} x2={g.pos} y1={view.y - size.h * px} y2={view.y + size.h * px} strokeWidth={px} /></g>
            : <g key={i} {...props}><line y1={g.pos} y2={g.pos} x1={view.x - size.w * px} x2={view.x + size.w * px} stroke="transparent" strokeWidth={8 * px} /><line className="vgl" y1={g.pos} y2={g.pos} x1={view.x - size.w * px} x2={view.x + size.w * px} strokeWidth={px} /></g>; })}
        {snapP && <g className="vsnapp"><rect x={snapP[0] - 4 * px} y={snapP[1] - 4 * px} width={8 * px} height={8 * px} strokeWidth={1.5 * px} /></g>}
        {snapL.x !== undefined && <line className="vsnap" x1={snapL.x} x2={snapL.x} y1={view.y - size.h * px} y2={view.y + size.h * px} strokeWidth={px} />}
        {snapL.y !== undefined && <line className="vsnap" y1={snapL.y} y2={snapL.y} x1={view.x - size.w * px} x2={view.x + size.w * px} strokeWidth={px} />}
        {tool === 'select' && sb && !edit && <g className="selbox">
          <rect x={sb.x0} y={sb.y0} width={sb.x1 - sb.x0} height={sb.y1 - sb.y0} strokeWidth={px} strokeDasharray={`${3 * px}`} />
          {xform === 'scale' ? [-1, 0, 1].flatMap(ix => [-1, 0, 1].map(iy => (ix || iy) ? <rect key={`${ix},${iy}`} x={(ix < 0 ? sb.x0 : ix > 0 ? sb.x1 : (sb.x0 + sb.x1) / 2) - r} y={(iy < 0 ? sb.y0 : iy > 0 ? sb.y1 : (sb.y0 + sb.y1) / 2) - r} width={2 * r} height={2 * r} strokeWidth={px} onPointerDown={e => handleDown('scale', ix, iy, e)} style={{ cursor: ix && iy ? (ix === iy ? 'nwse-resize' : 'nesw-resize') : ix ? 'ew-resize' : 'ns-resize' }} /> : null))
            : <>
              {[-1, 1].flatMap(ix => [-1, 1].map(iy => <g key={`r${ix},${iy}`} className="vrotg" onPointerDown={e => handleDown('rot', ix, iy, e)}>{rotIcon(ix < 0 ? sb.x0 : sb.x1, iy < 0 ? sb.y0 : sb.y1, ix, iy)}</g>))}
              {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([ix, iy]) => <g key={`k${ix},${iy}`} className="vskewg" onPointerDown={e => handleDown('skew', ix, iy, e)} style={{ cursor: iy ? 'ew-resize' : 'ns-resize' }}>{skewIcon(ix ? (ix < 0 ? sb.x0 : sb.x1) : (sb.x0 + sb.x1) / 2, iy ? (iy < 0 ? sb.y0 : sb.y1) : (sb.y0 + sb.y1) / 2, !!iy)}</g>)}
              <g className="vcenter" onPointerDown={e => handleDown('center', 0, 0, e)}><circle cx={(rc ?? [(sb.x0 + sb.x1) / 2, 0])[0]} cy={(rc ?? [0, (sb.y0 + sb.y1) / 2])[1]} r={r * 1.3} strokeWidth={px} /><circle cx={(rc ?? [(sb.x0 + sb.x1) / 2, 0])[0]} cy={(rc ?? [0, (sb.y0 + sb.y1) / 2])[1]} r={r * 0.3} /></g>
            </>}
        </g>}
        {tool === 'node' && items.filter(it => sel.includes(it.id) && !it.img).map(it => it.subs.map((s, si) => <g key={`${it.id}-${si}`}>
          {s.pts.map((p, i) => i < s.pts.length - 1 || s.closed ? <path key={'s' + i} d={`M${p.x} ${p.y}` + V.subD({ pts: [p, s.pts[(i + 1) % s.pts.length]], closed: false }).replace(/^M[^LC]*/, '')} className={isS({ item: it.id, sub: si, i }) ? 'seg on' : 'seg'} strokeWidth={isS({ item: it.id, sub: si, i }) ? 3 * px : 10 * px} onPointerDown={e => segDown({ item: it.id, sub: si, i }, e)} onDoubleClick={e => segDouble({ item: it.id, sub: si, i }, e)} /> : null)}
          {s.pts.map((p, i) => { const n = { item: it.id, sub: si, i }, on = isN(n); return <g key={i}>
            {on && p.ix !== undefined && <><line x1={p.x} y1={p.y} x2={p.ix} y2={p.iy} className="hl" strokeWidth={px} /><circle cx={p.ix} cy={p.iy} r={r * 0.8} className="hd" strokeWidth={px} onPointerDown={e => nodeDown(n, 'i', e)} /></>}
            {on && p.ox !== undefined && <><line x1={p.x} y1={p.y} x2={p.ox} y2={p.oy} className="hl" strokeWidth={px} /><circle cx={p.ox} cy={p.oy} r={r * 0.8} className="hd" strokeWidth={px} onPointerDown={e => nodeDown(n, 'o', e)} /></>}
            <rect x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} className={on ? 'nd on' : 'nd'} strokeWidth={px} onPointerDown={e => nodeDown(n, 'p', e)} onDoubleClick={() => nodeDouble(n)} />
          </g>; })}
        </g>))}
        {carets && edit && edit.a !== edit.b && (() => { const lo = Math.min(edit.a, edit.b), hi = Math.max(edit.a, edit.b), h = carets.h, out: ReactNode[] = [];
          for (let i = lo; i < hi; i++) { const c0 = carets.carets[i], c1 = carets.carets[i + 1]; if (!c0 || !c1) continue; const dx = c1.x - c0.x, dy = c1.y - c0.y, ux = Math.cos(c0.a), uy = Math.sin(c0.a); if (Math.abs(dx * uy - dy * ux) > 0.01 || dx * ux + dy * uy < 0) continue; const nx = Math.sin(c0.a), ny = -Math.cos(c0.a); out.push(<path key={i} className="vtsel" d={`M${c0.x - nx * 0.25 * h} ${c0.y - ny * 0.25 * h}L${c1.x - nx * 0.25 * h} ${c1.y - ny * 0.25 * h}L${c1.x + nx * h} ${c1.y + ny * h}L${c0.x + nx * h} ${c0.y + ny * h}Z`} />); }
          return <g>{out}</g>; })()}
        {(edit ? editItem : textItem)?.text?.box && (() => { const it = (edit ? editItem : textItem)!, L = O.layoutText(kernel, it.text!), h = Math.max(L.lineH.reduce((q, v) => q + v, 0), it.text!.size / 0.62) + it.text!.size * 0.4, pts = O.textBox(it.text!, h); return <path className="vtbox" d={`M${pts.map(q => q.join(' ')).join('L')}Z`} strokeWidth={px} strokeDasharray={`${4 * px}`} onPointerDown={e => { if (tool === 'text' || edit) textDown(it, e); }} />; })()}
        {carets && edit && (() => { const cr = carets.carets[Math.min(edit.caret, carets.carets.length - 1)] ?? { x: editItem!.text!.x, y: editItem!.text!.y, a: 0 }, h = carets.h; return <line className="vcaret" x1={cr.x} y1={cr.y + 0.15 * h * Math.cos(cr.a)} x2={cr.x + Math.sin(cr.a) * h} y2={cr.y - Math.cos(cr.a) * h} strokeWidth={1.5 * px} />; })()}
        {pen && <path d={V.subD(pen)} fill="none" stroke="#1677ff" strokeWidth={1.5 * px} />}
        {pen?.pts.map((p, i) => <rect key={i} x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} className="nd" strokeWidth={px} />)}
        {ink && <polyline points={ink.map(p => p.join(',')).join(' ')} fill="none" stroke={tool === 'eraser' ? '#ff4d4f66' : '#1677ff'} strokeWidth={tool === 'eraser' ? eraser * 2 : 1.5 * px} strokeLinecap="round" strokeLinejoin="round" />}
        {draft && <rect x={Math.min(draft.a[0], draft.b[0])} y={Math.min(draft.a[1], draft.b[1])} width={Math.abs(draft.b[0] - draft.a[0])} height={Math.abs(draft.b[1] - draft.a[1])} fill="none" stroke="#1677ff" strokeDasharray={`${4 * px}`} strokeWidth={px} />}
        {line && <><line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} stroke={tool === 'knife' ? '#ff4d4f' : '#1677ff'} strokeWidth={1.5 * px} strokeDasharray={tool === 'knife' ? `${4 * px}` : undefined} />{tool === 'dim' && <text x={(line.a[0] + line.b[0]) / 2} y={(line.a[1] + line.b[1]) / 2 - 4 * px} fontSize={12 * px} className="vdimt">{Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]).toFixed(1)} mm</text>}</>}
        {marq && <rect x={Math.min(marq.a[0], marq.b[0])} y={Math.min(marq.a[1], marq.b[1])} width={Math.abs(marq.b[0] - marq.a[0])} height={Math.abs(marq.b[1] - marq.a[1])} className="vmarq" strokeWidth={px} strokeDasharray={`${3 * px}`} />}
      </svg>
      {ruler('x')}{ruler('y')}<div className="vruler-c" />
      <textarea ref={ta} className="vta" onInput={onType} onSelect={onType} onKeyUp={onType} onBlur={() => setTimeout(() => { const ae = document.activeElement; if (ae !== ta.current && !ae?.closest('.vec-side')) endEdit(); }, 120)}
        style={carets && edit ? (() => { const cr = carets.carets[Math.min(edit.caret, carets.carets.length - 1)]; const [sx, sy] = cr ? toScreen(cr.x, cr.y) : [0, 0]; return { left: sx, top: sy }; })() : undefined} />
      <p className="vec-hint">{hint}</p>
      <div className="vdock">
        <D t="select" k="Boşluk" label="Seç"><MousePointer2 /></D>
        <D t="node" k="F10" label="Şekil aracı: düğümler"><Spline /></D>
        <D t="knife" label="Bıçak"><Scissors /></D>
        <D t="eraser" k="X" label="Silgi"><Eraser /></D><i />
        <D t="draw" k="F5" label="Serbest el"><Pencil /></D>
        <D t="pen" label="Kalem (Bezier)"><PenTool /></D>
        <div className="vmenu up"><button className={tool === 'shape' ? 'db active' : 'db'} data-tip="Şekiller (F6 dikdörtgen, F7 elips, Y çokgen)" aria-label="Şekiller" onClick={() => setMenu(menu === 'shapes' ? null : 'shapes')}>{tool === 'shape' ? shapePrev(shapeId === 'polygon' ? [V.polySub(0, 0, 1, sides)] : shapeId === 'star' ? [V.polySub(0, 0, 1, sides, 0.45)] : shapeSubs[shapeId] ?? []) : <Shapes />}<ChevronUp className="up" /></button>
          {menu === 'shapes' && <div className="vpop shapes-pop" ref={placePop}>
            <div className="vshapes">{O.SHAPES.map(s => <button key={s.id} className={shapeId === s.id && tool === 'shape' ? 'on' : ''} title={s.label} onClick={() => { setShapeId(s.id); setToolRaw('shape'); setMenu(null); }}>{shapePrev(shapeSubs[s.id] ?? [], s.even)}<span>{s.label}</span></button>)}
              <button className={shapeId === 'polygon' ? 'on' : ''} onClick={() => { setShapeId('polygon'); setToolRaw('shape'); setMenu(null); }}>{shapePrev([V.polySub(0, 0, 1, sides)])}<span>Çokgen</span></button>
              <button className={shapeId === 'star' ? 'on' : ''} onClick={() => { setShapeId('star'); setToolRaw('shape'); setMenu(null); }}>{shapePrev([V.polySub(0, 0, 1, sides, 0.45)])}<span>Yıldız ({sides})</span></button></div>
            <label className="mini">Çokgen / yıldız köşe sayısı <input type="number" min={3} max={40} value={sides} onChange={e => setSides(Math.max(3, Math.min(40, +e.target.value || 3)))} /></label>
          </div>}</div>
        <D t="text" k="F8" label="Yazı"><Type /></D>
        <D t="dim" label="Ölçü çizgisi"><Ruler /></D>
        <D t="pick" k="I" label="Damlalık: rengi al, başkasına uygula"><Pipette /></D><i />
        <D t="zoom" k="Z" label="Yakınlaştır"><ZoomIn /></D>
        <D t="pan" k="H" label="Kaydır"><Hand /></D><i />
        <button className="db" data-tip="Fotoğrafı vektöre çevir (PNG / JPG logo)" aria-label="Fotoğrafı vektöre çevir" onClick={pickImage}><ImageUp /></button>
      </div>
    </div>

    <div className="vec-side">
      <section className="card"><header><b>Renk</b><div className="seg mini-seg"><button className={mode === 'rgb' ? 'on' : ''} onClick={() => switchMode('rgb')}>RGB</button><button className={mode === 'cmyk' ? 'on' : ''} onClick={() => switchMode('cmyk')}>CMYK</button></div></header>
        <div className="vcur">
          <button className="vchip" onClick={() => setPicker(picker === 'fill' ? null : 'fill')}><span className="sw" style={{ background: curFill ? C.css(curFill) : undefined }}>{curFill ? '' : '∅'}</span>Dolgu<small>{curFill ? C.label(curFill) : 'yok'}</small></button>
          <button className="vchip" onClick={() => setPicker(picker === 'stroke' ? null : 'stroke')}><span className="sw ring" style={{ borderColor: curStroke ? C.css(curStroke) : undefined }}>{curStroke ? '' : '∅'}</span>Kenar<small>{curStroke ? C.label(curStroke) : 'yok'}</small></button>
        </div>
        {(picker === 'fill' || picker === 'stroke') && <ColorPicker key={picker + sel.join()} value={picker === 'fill' ? curFill : curStroke} mode={mode} onChange={c => paint(c, picker)} onClose={() => setPicker(null)} />}
        {sel.length > 0 && !selItems.every(i => i.img) && <div className="seg">{([['none', 'Düz'], ['linear', 'Doğrusal'], ['radial', 'Dairesel'], ['pat', 'Desen']] as const).map(([k, l]) => <button key={k} className={(k === 'none' ? !one?.grad && !one?.pat : k === 'pat' ? !!one?.pat && !one?.grad : one?.grad?.type === k) ? 'on' : ''} onClick={() => k === 'pat' ? applyTo(sel, x => x.img ? x : { ...x, grad: undefined, pat: x.pat ?? Object.keys(patterns)[0], fill: x.fill ?? '#000000' }) : (setGrad(k), k === 'none' && applyTo(sel, x => ({ ...x, pat: undefined })))}>{l}</button>)}</div>}
        {one?.grad && <div className="vgrad">
          <div className="vgbar" style={{ background: `linear-gradient(90deg, ${[...one.grad.stops].sort((a, b) => a.o - b.o).map(q => `${C.css(q.c)} ${q.o * 100}%`).join(',')})` }} onDoubleClick={e => { const r0 = e.currentTarget.getBoundingClientRect(), o = Math.max(0, Math.min(1, (e.clientX - r0.left) / r0.width)); editGrad(g => ({ ...g, stops: [...g.stops, { o, c: g.stops[gStop]?.c ?? '#888888' }] })); setGStop(one.grad!.stops.length); }}>
            {one.grad.stops.map((q, k) => <i key={k} className={k === gStop ? 'on' : ''} style={{ left: `${q.o * 100}%`, background: C.css(q.c) }} onPointerDown={e => { e.stopPropagation(); setGStop(k); const bar = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); past.current.push(itemsRef.current); const mv = (ev: PointerEvent) => editGrad(g => ({ ...g, stops: g.stops.map((s2, n) => n === k ? { ...s2, o: Math.max(0, Math.min(1, (ev.clientX - bar.left) / bar.width)) } : s2) }), false); const u2 = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', u2); }; addEventListener('pointermove', mv); addEventListener('pointerup', u2); }} />)}
          </div>
          <div className="grid2">{one.grad.type === 'linear' ? <label className="field"><span>Açı (°)</span><input type="number" step={15} value={one.grad.angle} onChange={e => editGrad(g => ({ ...g, angle: +e.target.value || 0 }))} /></label> : <span />}
            <button className="vchip" onClick={() => setPicker(picker === 'stop' ? null : 'stop')}><span className="sw" style={{ background: C.css(one.grad.stops[gStop]?.c ?? '#000') }} />Durak rengi</button></div>
          <div className="chips"><button className="chip" onClick={() => editGrad(g => ({ ...g, stops: g.stops.map(q => ({ ...q, o: 1 - q.o })) }))}>Ters çevir</button><button className="chip" disabled={one.grad.stops.length < 3} onClick={() => { editGrad(g => ({ ...g, stops: g.stops.filter((_, k) => k !== gStop) })); setGStop(0); }}>Durağı sil</button></div>
          {picker === 'stop' && <ColorPicker value={one.grad.stops[gStop]?.c ?? null} mode={mode} onChange={c => editGrad(g => ({ ...g, stops: g.stops.map((q, k) => k === gStop ? { ...q, c } : q) }))} onClose={() => setPicker(null)} />}
          <small className="hint">Çubuğa çift tıkla: durak ekle. Durağı sürükle: yerini değiştir. Palette tıkla: seçili durağın rengi.</small>
        </div>}
        {one?.pat && !one.grad && <div className="vgrad"><label className="field"><span>Desen</span><select value={one.pat} onChange={e => applyTo(sel, x => ({ ...x, pat: e.target.value }))}>{Object.entries(patterns).map(([k, q]) => <option key={k} value={k}>{q.name}</option>)}</select></label>{!Object.keys(patterns).length && <small className="hint">Henüz desen yok: desen olacak çizimi seçip Efektler'den “Seçiliden desen oluştur”.</small>}</div>}
        <div className="vpalbar"><select value={palName} onChange={e => setPalName(e.target.value)}><option value="">{mode === 'cmyk' ? 'CMYK paleti' : 'RGB paleti'}</option>{pals.map(q => <option key={q.name} value={q.name}>{q.name}</option>)}</select>
          <button className="ib" title="Dolgu rengini paletime ekle" aria-label="Paletime ekle" onClick={() => addToPal(curFill)}><Plus /></button>
          {curPal && <button className="ib" title="Bu paleti sil" aria-label="Paleti sil" onClick={() => { if (confirm(`“${curPal.name}” silinsin mi?`)) { savePals(pals.filter(q => q !== curPal)); setPalName(''); } }}><Trash2 /></button>}</div>
        <div className="pal16">{(curPal ? curPal.colors : C.palette(mode)).map(c => <span key={c} onClickCapture={e => { if (curPal && e.shiftKey) { e.stopPropagation(); savePals(pals.map(q => q === curPal ? { ...q, colors: q.colors.filter(x => x !== c) } : q)); } }}>{sw(c, () => paint(c, 'fill'), () => paint(c, 'stroke'))}</span>)}{sw(null, () => paint(null, 'fill'), () => paint(null, 'stroke'))}</div>
        {recent.length > 0 && <><small className="vlab">Son kullanılan</small><div className="pal16 small">{recent.map(c => sw(c, () => paint(c, 'fill'), () => paint(c, 'stroke'), 'r' + c))}</div></>}
        {docColors.length > 0 && <><small className="vlab">Belgedeki renkler</small><div className="pal16 small">{docColors.map(c => sw(c, () => paint(c, 'fill'), () => paint(c, 'stroke'), 'd' + c))}</div></>}
        <p className="hint">Sol tık dolgu, sağ tık kenar rengi, ∅ kaldırır.{edit && edit.a !== edit.b ? ' Yazıda seçili harflere uygulanır.' : ''}{curPal ? ' Shift+tık: paletten çıkar.' : ''}</p>
        {mode === 'cmyk' && <p className="hint warn">CMYK değerleri yaklaşık: renk profili (ICC) kullanılmıyor. Kritik renklerde değerleri elle gir.</p>}
      </section>

      <section className="card vcard-stroke"><header><b>Kenar çizgisi (F12)</b></header>
        <label className="field"><span>Kalınlık (mm)</span><input type="number" min={0.05} step={0.05} value={Math.round(curSw * 1000) / 1000} onChange={e => lineStyle({ sw: Math.max(0.05, +e.target.value || 0.05) })} /></label>
        <div className="chips">{[['Kıl', 0.1], ['0.25', 0.25], ['0.5', 0.5], ['1', 1], ['2', 2]].map(([l, v]) => <button key={l} className={Math.abs(curSw - (v as number)) < 1e-6 ? 'chip on' : 'chip'} onClick={() => lineStyle({ sw: v as number, stroke: one?.stroke ?? stroke ?? (mode === 'cmyk' ? 'cmyk(0,0,0,100)' : '#222222') })}>{l}</button>)}</div>
        <label className="field"><span>Çizgi tipi</span><select value={DASHES.findIndex(d => JSON.stringify(d[1]) === JSON.stringify(one?.dash ?? []))} onChange={e => lineStyle({ dash: DASHES[+e.target.value][1].map(v => v * Math.max(1, curSw * 2)) })}>{DASHES.map(([l], i) => <option key={l} value={i}>{l}</option>)}</select></label>
        <div className="grid2"><label className="field"><span>Köşe</span><select value={one?.join ?? 'round'} onChange={e => lineStyle({ join: e.target.value as V.Item['join'] })}><option value="miter">Sivri</option><option value="round">Yuvarlak</option><option value="bevel">Pahlı</option></select></label>
          <label className="field"><span>Uç</span><select value={one?.cap ?? 'round'} onChange={e => lineStyle({ cap: e.target.value as V.Item['cap'] })}><option value="butt">Düz</option><option value="round">Yuvarlak</option><option value="square">Kare</option></select></label></div>
        <label className="check"><input type="checkbox" checked={!one?.fixedStroke} onChange={e => lineStyle({ fixedStroke: !e.target.checked })} /> Nesneyle ölçeklensin</label>
        {!isFree && <p className="hint">Yüzeyde ve 3B'de çizgi kalınlığı da katı olur.</p>}
      </section>

      {sb && <section className="card"><header><b>Dönüştür</b></header>
        <div className="grid2">{([['X (orta)', (sb.x0 + sb.x1) / 2], ['Y (orta)', (sb.y0 + sb.y1) / 2], ['Genişlik', sb.x1 - sb.x0], ['Yükseklik', sb.y1 - sb.y0]] as const).map(([l, v], k) => <label className="field" key={l}><span>{l}</span><input type="number" step={0.5} value={Math.round(v * 100) / 100} onChange={e => { const x = +e.target.value; if (!Number.isFinite(x)) return; const w = sb.x1 - sb.x0, h = sb.y1 - sb.y0, cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2; if (k === 0) nudge(x - cx, 0); if (k === 1) nudge(0, x - cy); if (k === 2 && x > 0) applyTo(sel, it => V.mapItem(it, (a, b) => [cx + (a - cx) * x / w, cy + (b - cy) * x / w], x / w)); if (k === 3 && x > 0) applyTo(sel, it => V.mapItem(it, (a, b) => [cx + (a - cx) * x / h, cy + (b - cy) * x / h], x / h)); }} /></label>)}</div>
        <div className="seg">{([['rot', 'Döndür'], ['scale', 'Ölçek'], ['skew', 'Eğ']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        {tab === 'rot' && <label className="field"><span>Açı (°)</span><input type="number" step={1} value={tf.rot} onChange={e => setTf({ ...tf, rot: +e.target.value || 0 })} /></label>}
        {tab === 'scale' && <div className="grid2"><label className="field"><span>Yatay %</span><input type="number" value={tf.sx} onChange={e => setTf({ ...tf, sx: +e.target.value || 100 })} /></label><label className="field"><span>Dikey %</span><input type="number" disabled={tf.lockS} value={tf.lockS ? tf.sx : tf.sy} onChange={e => setTf({ ...tf, sy: +e.target.value || 100 })} /></label><label className="check"><input type="checkbox" checked={tf.lockS} onChange={e => setTf({ ...tf, lockS: e.target.checked })} /> Orantılı</label></div>}
        {tab === 'skew' && <div className="grid2"><label className="field"><span>Yatay (°)</span><input type="number" value={tf.kx} onChange={e => setTf({ ...tf, kx: +e.target.value || 0 })} /></label><label className="field"><span>Dikey (°)</span><input type="number" value={tf.ky} onChange={e => setTf({ ...tf, ky: +e.target.value || 0 })} /></label></div>}
        <div className="grid2"><label className="field"><span>Kopya sayısı</span><input type="number" min={0} max={200} value={tf.copies} onChange={e => setTf({ ...tf, copies: Math.max(0, Math.min(200, Math.round(+e.target.value || 0))) })} /></label><button className="tb primary" style={{ alignSelf: 'end' }} onClick={() => act('transformCopies', tab)}>Uygula</button></div>
        <p className="hint">Ctrl+R son işlemi tekrarlar.</p>
      </section>}

      {(textItem || tool === 'text') && <section className="card"><header><b>Yazı</b></header>
        {edit && edit.a !== edit.b && <p className="hint">Seçili harflere uygulanır: yazı tipi, boy ve paletten renk.</p>}
        <FontPicker value={textItem ? (edit && edit.a !== edit.b ? textItem.text!.cs?.[Math.min(edit.a, edit.b)]?.font ?? textItem.text!.font : textItem.text!.font) : textDef.font} onChange={v => { if (textItem && edit && edit.a !== edit.b) { void charStyle({ font: v }); return; } if (textItem) editText(textItem, { font: v }); else { setTextDef({ ...textDef, font: v }); void os.ensureFont(kernel, v); } }} />
        <div className="grid2"><label className="field"><span>Boy (mm)</span><input type="number" min={0.5} step={0.5} value={Math.round((textItem ? textItem.text!.size : textDef.size) * 100) / 100} onChange={e => { const v = Math.max(0.5, +e.target.value || 0.5); if (textItem && edit && edit.a !== edit.b) { void charStyle({ size: v }); return; } if (textItem) editText(textItem, { size: v }); else setTextDef({ ...textDef, size: v }); }} /></label>
          {textItem && <label className="field"><span>Harf aralığı (mm)</span><input type="number" step={0.1} value={Math.round((textItem.text!.ls ?? 0) * 100) / 100} onChange={e => editText(textItem, { ls: +e.target.value || 0 })} /></label>}</div>
        {textItem && <>
          <div className="grid2"><label className="field"><span>Satır aralığı</span><input type="number" step={0.05} min={0.5} value={textItem.text!.lh ?? 1} onChange={e => editText(textItem, { lh: Math.max(0.5, +e.target.value || 1) })} /></label>
            <label className="field"><span>Hiza</span><select value={textItem.text!.align ?? 'left'} onChange={e => editText(textItem, { align: e.target.value as 'left' })}><option value="left">Sol</option><option value="center">Orta</option><option value="right">Sağ</option>{textItem.text!.box && <option value="justify">İki yana</option>}</select></label></div>
          {textItem.text!.box && <label className="field"><span>Kutu genişliği (mm)</span><input type="number" min={2} step={1} value={Math.round(textItem.text!.box.w * 10) / 10} onChange={e => editText(textItem, { box: { w: Math.max(2, +e.target.value || 2) } })} /></label>}
          {textItem.text!.path && <><label className="field"><span>Yolda kaydır (mm)</span><input type="range" min={0} max={Math.max(1, O.pathLength(textItem.text!.path.pts))} step={0.1} value={textItem.text!.path.offset} onChange={e => editText(textItem, { path: { ...textItem.text!.path!, offset: +e.target.value } })} /></label>
            <div className="grid2"><button className="tb" onClick={() => editText(textItem, { path: { ...textItem.text!.path!, flip: !textItem.text!.path!.flip } })}>Öbür tarafa al</button><button className="tb" onClick={() => editText(textItem, { path: undefined })}>Yoldan ayır</button></div></>}
          <div className="grid2"><button className="tb" onClick={() => startEdit(textItem.id)}>Metni düzenle</button><button className="tb" onClick={toCurves}>Eğriye çevir (Ctrl+Q)</button></div>
        </>}
        {!textItem && <p className="hint">Tıkla ve yaz: tek satır yazı. Sürükle: paragraf kutusu (satır kaydırır). Var olan yazıya çift tıkla: düzenle.</p>}
      </section>}

      {sel.length > 0 && <section className="card"><header><b>Efektler</b></header>
        <div className="vfx"><b>Kontür</b>
          <div className="grid2"><label className="field"><span>Yön</span><select value={ct.dir} onChange={e => setCt({ ...ct, dir: e.target.value as 'out' })}><option value="out">Dışa</option><option value="in">İçe</option></select></label><label className="field"><span>Aralık (mm)</span><input type="number" min={0.05} step={0.1} value={ct.dist} onChange={e => setCt({ ...ct, dist: Math.max(0.05, +e.target.value || 0.05) })} /></label>
            <label className="field"><span>Adım</span><input type="number" min={1} max={50} value={ct.steps} onChange={e => setCt({ ...ct, steps: Math.max(1, Math.min(50, Math.round(+e.target.value || 1))) })} /></label><label className="check"><input type="checkbox" checked={ct.filled} onChange={e => setCt({ ...ct, filled: e.target.checked })} /> Dolgulu</label></div>
          <button className="tb" onClick={contourSel}>Kontür uygula</button><small className="hint">Çizgi rengi kenar renginden; sticker kesim payı, lazer ofseti, çerçeve için.</small></div>
        <div className="vfx"><b>Köşeler</b><div className="grid2"><label className="field"><span>Ölçü (mm)</span><input type="number" min={0.1} step={0.1} value={corner} onChange={e => setCorner(Math.max(0.05, +e.target.value || 0.05))} /></label><span /><button className="tb" onClick={() => doCorner('chamfer')}>Tüm köşelere pah</button><button className="tb" onClick={() => doCorner('round')}>Köşeleri yuvarla</button></div></div>
        <div className="grid2"><button className="tb" disabled={!selItems.some(i => i.stroke)} onClick={outlineObj} title="Ctrl+Shift+Q">Çizgiyi nesneye çevir</button><button className="tb" onClick={toCurves} title="Ctrl+Q">Eğriye çevir</button></div>
        {units(sel).length === 2 && <div className="vfx"><b>Geçiş (blend)</b><div className="grid2"><label className="field"><span>Ara adım</span><input type="number" min={1} max={100} value={blendN} onChange={e => setBlendN(Math.max(1, Math.min(100, Math.round(+e.target.value || 1))))} /></label><button className="tb" style={{ alignSelf: 'end' }} onClick={blendSel}>Geçiş yap</button></div></div>}
        {!selItems.every(i => i.img) && <div className="vfx"><b>Zarf / bükme</b>
          <div className="grid2"><label className="field"><span>Biçim</span><select value={env.kind} onChange={e => setEnv({ ...env, kind: e.target.value })}><option value="arc">Kavis</option><option value="arcTop">Üstten kavis</option><option value="arcBottom">Alttan kavis</option><option value="wave">Dalga</option><option value="flag">Bayrak</option><option value="bulge">Şişir / daralt</option></select></label>
            <label className="field"><span>Miktar %{env.amt}</span><input type="range" min={-100} max={100} value={env.amt} onPointerDown={envStart} onChange={e => { const a = +e.target.value; setEnv({ ...env, amt: a }); if (!envBase.current) envStart(); envelope(env.kind, a); }} onPointerUp={envEnd} /></label></div>
          <small className="hint">Kaydırıcıyı sürükle: canlı büker. Yazı eğriye çevrilir; Ctrl+Z geri alır.</small></div>}
        <div className="vfx"><b>Desen</b><div className="grid2"><label className="field"><span>Desen aralığı (mm)</span><input type="number" min={0} step={0.5} value={patGap} onChange={e => setPatGap(Math.max(0, +e.target.value || 0))} /></label><button className="tb" style={{ alignSelf: 'end' }} onClick={makePattern}>Seçiliden desen oluştur</button></div></div>
        {selItems.some(i => i.img) && <button className="tb wide" onClick={() => void traceItem(selItems.find(i => i.img)!)}>Resmi vektöre çevir…</button>}
        <div className="vfx"><b>PowerClip</b><div className="grid2"><button className="tb" disabled={sel.length < 2} onClick={clipIn} title="En son seçilen kap olur">İçine yerleştir</button><button className="tb" disabled={!items.some(i => i.clip !== undefined && (sel.includes(i.clip) || sel.includes(i.id)))} onClick={clipOut}>İçinden çıkar</button></div></div>
        {selItems.some(i => i.text) && selItems.some(i => !i.text) && <button className="tb wide" onClick={fitTextToPath}>Yazıyı yola oturt</button>}
        {(isFree || one?.img) && one && <div className="vfx"><b>Şeffaflık</b><input type="range" min={0} max={100} value={Math.round((one.opacity ?? 1) * 100)} onChange={e => applyTo(sel, x => ({ ...x, opacity: +e.target.value / 100 }), false)} onPointerUp={() => setItems(a => a)} /><small>%{Math.round((one.opacity ?? 1) * 100)}</small></div>}
        {isFree && one && <div className="vfx"><b>Gölge</b>
          <label className="check"><input type="checkbox" checked={!!one.shadow} onChange={e => applyTo(sel, x => ({ ...x, shadow: e.target.checked ? { dx: 1.5, dy: 1.5, blur: 2, color: mode === 'cmyk' ? 'cmyk(0,0,0,100)' : '#000000', opacity: 0.35 } : undefined }))} /> Gölge ekle</label>
          {one.shadow && <div className="grid2">{([['dx', 'X kayma'], ['dy', 'Y kayma'], ['blur', 'Yumuşaklık'], ['opacity', 'Koyuluk (0–1)']] as const).map(([k, l]) => <label className="field" key={k}><span>{l}</span><input type="number" step={k === 'opacity' ? 0.05 : 0.25} value={one.shadow![k]} onChange={e => applyTo(sel, x => x.shadow ? { ...x, shadow: { ...x.shadow, [k]: +e.target.value || 0 } } : x)} /></label>)}
            <button className="vchip" onClick={() => setPicker(picker === 'shadow' ? null : 'shadow')}><span className="sw" style={{ background: C.css(one.shadow.color) }} />Gölge rengi</button></div>}
          {picker === 'shadow' && one.shadow && <ColorPicker value={one.shadow.color} mode={mode} onChange={c => applyTo(sel, x => x.shadow ? { ...x, shadow: { ...x.shadow, color: c } } : x)} onClose={() => setPicker(null)} />}
          <small className="hint">PDF'te gölge bulanıksız yazılır.</small></div>}
      </section>}

      {sel.length > 0 && <section className="card"><header><b>Adımla çoğalt (Ctrl+Shift+D)</b></header>
        <div className="grid2"><label className="field"><span>Kopya</span><input type="number" min={1} max={500} value={step.n} onChange={e => setStep({ ...step, n: Math.max(1, Math.min(500, Math.round(+e.target.value || 1))) })} /></label><span />
          <label className="field"><span>Yatay aralık (mm)</span><input type="number" step={0.5} value={step.dx} onChange={e => setStep({ ...step, dx: +e.target.value || 0 })} /></label><label className="field"><span>Dikey aralık (mm)</span><input type="number" step={0.5} value={step.dy} onChange={e => setStep({ ...step, dy: +e.target.value || 0 })} /></label></div>
        <button className="tb wide" onClick={() => act('stepRepeat', step.n, step.dx, step.dy)}>Çoğalt</button>
      </section>}

      {tool === 'eraser' && <section className="card"><header><b>Silgi</b></header><label className="field"><span>Kalınlık (mm)</span><input type="number" min={0.1} step={0.5} value={eraser * 2} onChange={e => setEraser(Math.max(0.05, (+e.target.value || 0.1) / 2))} /></label></section>}

      {isFree && selBoard !== null && (() => { const b = boards.find(q => q.id === selBoard); if (!b) return null; const upd = (p: Partial<IO.Board>) => setBoards(bs => bs.map(q => q.id === b.id ? { ...q, ...p } : q)); return <section className="card"><header><b>Artboard</b></header>
        <label className="field"><span>Ad</span><input value={b.name} onChange={e => upd({ name: e.target.value })} /></label>
        <div className="grid2"><label className="field"><span>Genişlik (mm)</span><input type="number" min={1} value={b.w} onChange={e => upd({ w: Math.max(1, +e.target.value || 1) })} /></label><label className="field"><span>Yükseklik (mm)</span><input type="number" min={1} value={b.h} onChange={e => upd({ h: Math.max(1, +e.target.value || 1) })} /></label></div>
        <div className="chips">{PRESETS.map(([n, w, h]) => <button key={n} className="chip" onClick={() => upd({ w, h, name: b.name.startsWith('A') || b.name === 'Özel' ? n : b.name })}>{n}</button>)}<button className="chip" onClick={() => upd({ w: b.h, h: b.w })}>Yan çevir</button></div>
        <button className="tb wide" disabled={boards.length < 2} onClick={remove}>Artboardu sil</button>
      </section>; })()}
      <p className="hint">Kılavuz: cetvelden sürükle; geri cetvele bırakınca silinir. Tekerlek: yakınlaştır. Ok tuşları: 0,5 mm (Shift 5 mm).</p>
    </div>

    {cm && (() => { const it = cm.id !== undefined ? items.find(i => i.id === cm.id) : undefined, B = (p: { on(): void; children: ReactNode; off?: boolean; k?: string }) => <button disabled={p.off} onClick={() => { setCm(null); p.on(); }}>{p.children}{p.k && <small>{p.k}</small>}</button>;
      return <div className="vcm" style={{ left: Math.min(cm.x, innerWidth - 230), top: Math.min(cm.y, innerHeight - 440) }} onContextMenu={e => e.preventDefault()}>
        {cm.guide !== undefined ? <><B on={() => { setGuides(g => g.filter((_, k) => k !== cm.guide)); setSelGuide(null); }}>Kılavuzu sil</B><B on={() => { setGuides([]); setSelGuide(null); }}>Tüm kılavuzları sil</B></>
          : it && isLock(it) ? <><B on={() => { applyTo([it.id], x => ({ ...x, locked: false })); if (layerOf(it)?.locked) setLayers(ls => ls.map(l => l.id === layerOf(it)!.id ? { ...l, locked: false } : l)); setSel(expand([it.id])); }}>Kilidi aç</B><B on={() => applyTo([it.id], x => ({ ...x, hidden: true }))}>Gizle</B></>
          : it ? <>
            <B on={() => { copyItems(); remove(); }} k="Ctrl+X">Kes</B><B on={copyItems} k="Ctrl+C">Kopyala</B><B on={pasteItems} off={!clipb.current.length} k="Ctrl+V">Yapıştır</B><B on={() => dup()} k="Ctrl+D">Çoğalt</B><B on={remove} k="Delete">Sil</B><i />
            {it.img && <><B on={() => void traceItem(it)}>Vektöre çevir…</B><i /></>}
            {sel.length > 1 ? <B on={group} k="Ctrl+G">Grupla</B> : null}{selItems.some(i => i.group !== undefined) && <B on={ungroup} k="Ctrl+U">Grubu çöz</B>}
            {sel.length > 1 && <B on={combineSel} k="Ctrl+L">Birleştir</B>}{selItems.some(i => i.subs.length > 1 && !i.img) && <B on={breakSel} k="Ctrl+K">Parçala</B>}
            {selItems.some(i => i.text) && <B on={toCurves} k="Ctrl+Q">Eğriye çevir</B>}
            {items.some(i => i.clip !== undefined && (sel.includes(i.clip) || sel.includes(i.id))) && <B on={clipOut}>PowerClip içinden çıkar</B>}<i />
            <B on={() => order('front')} k="Shift+PgUp">En öne</B><B on={() => order('up')} k="Ctrl+PgUp">Bir öne</B><B on={() => order('down')} k="Ctrl+PgDn">Bir arkaya</B><B on={() => order('back')} k="Shift+PgDn">En arkaya</B><i />
            <B on={() => { applyTo(sel, x => ({ ...x, locked: true })); setSel([]); }}>Kilitle</B><B on={() => { applyTo(sel, x => ({ ...x, hidden: true })); setSel([]); }}>Gizle</B>
            {isFree && layers.length > 1 && <><i /><small className="vcm-h">Katmana taşı</small>{[...layers].reverse().map(l => <B key={l.id} on={() => applyTo(sel, x => ({ ...x, layer: l.id }))} off={sel.every(id => layerOf(items.find(q => q.id === id)!)?.id === l.id)}><span className="sub">{l.name}</span></B>)}</>}
          </> : <>
            <B on={pasteItems} off={!clipb.current.length} k="Ctrl+V">Yapıştır</B><B on={() => setSel(expand(live.filter(i => !isLock(i) && i.clip === undefined).map(i => i.id)))} k="Ctrl+A">Tümünü seç</B>
            <B on={() => { setItems(a => a.map(x => x.locked ? { ...x, locked: false } : x)); setLayers(ls => ls.map(l => ({ ...l, locked: false }))); }} off={!items.some(i => isLock(i))}>Tüm kilitleri aç</B>
            <B on={() => setItems(a => a.map(x => x.hidden ? { ...x, hidden: false } : x))} off={!items.some(i => i.hidden)}>Gizlileri göster</B>
            <B on={() => setGuides([])} off={!guides.length}>Kılavuzları temizle</B>
          </>}
      </div>; })()}
    {trace && <div className="vmodal" onPointerDown={e => { if (e.target === e.currentTarget) setTrace(null); }}><div className="vmodal-box wide">
      <header><b>Vektöre çevir</b><button className="ib" aria-label="Kapat" onClick={() => setTrace(null)}><X /></button></header>
      <div className="vtrace"><figure><img src={trace.src} alt="" /><figcaption>Resim</figcaption></figure>
        <figure>{tracePrev?.length ? (() => { const b = V.bounds(tracePrev)!; return <svg viewBox={`${b.x0} ${b.y0} ${b.x1 - b.x0} ${b.y1 - b.y0}`}>{tracePrev.map(q => <path key={q.id} d={V.itemDc(q)} fill={q.fill ?? 'none'} />)}</svg>; })() : <div className="hint">{traceBusy ? 'Hesaplanıyor…' : 'Bölge bulunamadı'}</div>}<figcaption>Önizleme{traceBusy ? ' (hesaplanıyor…)' : tracePrev ? ` · ${tracePrev.length} renk, ${tracePrev.reduce((q, i) => q + i.subs.length, 0)} parça` : ''}</figcaption></figure></div>
      <div className="grid2">
        <label className="field"><span>Renk sayısı</span><input type="number" min={1} max={32} value={traceOpt.colors} onChange={e => setTraceOpt({ ...traceOpt, colors: Math.max(1, Math.min(32, Math.round(+e.target.value || 1))) })} /></label>
        <label className="field"><span>Ayrıntı</span><input type="range" min={0} max={1} step={0.05} value={traceOpt.detail} onChange={e => setTraceOpt({ ...traceOpt, detail: +e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={traceOpt.removeBg} onChange={e => setTraceOpt({ ...traceOpt, removeBg: e.target.checked })} /> Arka planı kaldır</label>
        <label className="check"><input type="checkbox" checked={traceOpt.smooth} onChange={e => setTraceOpt({ ...traceOpt, smooth: e.target.checked })} /> Yumuşak eğriler</label>
        <label className="check"><input type="checkbox" checked={traceDel} onChange={e => setTraceDel(e.target.checked)} /> Resmi sil</label>
      </div>
      <button className="tb primary wide" disabled={!tracePrev?.length || traceBusy} onClick={runTrace}>Vektöre çevir</button>
    </div></div>}
  </div>;
}
