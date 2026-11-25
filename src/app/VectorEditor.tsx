import { useEffect, useMemo, useRef, useState, type PointerEvent as PE, type ReactNode } from 'react';
import { Circle, Combine, Copy, FlipHorizontal2, FlipVertical2, Hand, Heart, Hexagon, ImagePlus, Maximize, MousePointer2, PenTool, Pencil, Redo2, Spline, Square, Star, Trash2, Type, Undo2, ArrowUpToLine, ArrowDownToLine, SquaresSubtract, SquaresIntersect } from 'lucide-react';
import type { Kernel } from '../core/kernel';
import { plainPaths } from '../core/svg';
import * as V from './vector';
import * as os from './platform';

type Tool = 'select' | 'node' | 'pen' | 'draw' | 'rect' | 'ellipse' | 'polygon' | 'star' | 'heart' | 'text' | 'pan';
type Sel = { item: number; sub: number; i: number };
const PAL = ['#222222', '#ffffff', '#e5484d', '#f5a524', '#f7d94c', '#30a46c', '#4f8cff', '#9b5de5', '#f4a6c8', '#8b5e3c', '#8e8c99', '#00b8d4'];
const clone = (a: V.Item[]) => structuredClone(a);

/** SVG metnini düzenleyici öğelerine çevirir; width > 0 ise o genişliğe ölçekleyip ortalar (SVG şekliyle aynı). */
export function loadItems(svg: string, width: number): V.Item[] {
  let items: V.Item[] = plainPaths(svg).map(p => ({ id: V.newId(), subs: V.parseD(p.d), fill: p.fill, stroke: p.stroke, sw: p.sw || 1, even: p.even }));
  const b = V.bounds(items);
  if (width > 0 && b) { const k = width / (b.x1 - b.x0), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2; items = items.map(it => V.mapItem(it, (x, y) => [(x - cx) * k, (y - cy) * k], k)); }
  return items;
}

export function VectorEditor({ kernel, title, initial, guide, onSave, onClose }: { kernel: Kernel; title: string; initial: V.Item[]; guide?: string; onSave(svg: string, items: V.Item[]): void; onClose(): void }) {
  const [items, setItemsState] = useState<V.Item[]>(initial);
  const itemsRef = useRef(items), past = useRef<V.Item[][]>([]), future = useRef<V.Item[][]>([]);
  const [sel, setSel] = useState<number[]>([]);
  const [nodes, setNodes] = useState<Sel[]>([]);
  const [segs, setSegs] = useState<Sel[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [view, setView] = useState({ x: 0, y: 0, s: 6 }); // s: px / mm
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [fill, setFill] = useState<string | null>('#4f8cff');
  const [corner, setCorner] = useState(1);
  const [text, setText] = useState('Baseline'), [textSize, setTextSize] = useState(12);
  const [sides, setSides] = useState(6);
  const [pen, setPen] = useState<V.Sub | null>(null);
  const [draft, setDraft] = useState<{ a: [number, number]; b: [number, number] } | null>(null);
  const [ink, setInk] = useState<[number, number][] | null>(null);
  const svg = useRef<SVGSVGElement>(null), box = useRef<HTMLDivElement>(null), drag = useRef<null | ((x: number, y: number, e: PE) => void)>(null), space = useRef(false);

  const setItems = (f: V.Item[] | ((a: V.Item[]) => V.Item[]), record = true) => {
    const next = typeof f === 'function' ? f(itemsRef.current) : f;
    if (record) { past.current.push(itemsRef.current); if (past.current.length > 200) past.current.shift(); future.current = []; }
    itemsRef.current = next; setItemsState(next);
  };
  const undo = (from: typeof past, to: typeof past) => { const p = from.current.pop(); if (!p) return; to.current.push(itemsRef.current); itemsRef.current = p; setItemsState(p); setNodes([]); setSegs([]); };
  const fit = () => {
    const g = guide?.match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number), gb = g && g.length > 3 ? { x0: Math.min(...g.filter((_, i) => i % 2 === 0)), x1: Math.max(...g.filter((_, i) => i % 2 === 0)), y0: Math.min(...g.filter((_, i) => i % 2)), y1: Math.max(...g.filter((_, i) => i % 2)) } : null;
    const b = V.bounds(itemsRef.current) ?? gb ?? { x0: -30, y0: -30, x1: 30, y1: 30 }, w = Math.max(10, b.x1 - b.x0), h = Math.max(10, b.y1 - b.y0);
    const s = Math.min(size.w / (w * 1.3), size.h / (h * 1.3)); setView({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, s });
  };
  useEffect(() => { const ro = new ResizeObserver(() => { const r = box.current!.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); }); ro.observe(box.current!); return () => ro.disconnect(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fit, [size.w > 0]);
  const vb = `${view.x - size.w / 2 / view.s} ${view.y - size.h / 2 / view.s} ${size.w / view.s} ${size.h / view.s}`;
  const px = 1 / view.s; // 1 piksel kaç mm
  const at = (e: { clientX: number; clientY: number }): [number, number] => { const m = svg.current!.getScreenCTM()!.inverse(), p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return [p.x, p.y]; };
  const snap = (v: number, e: { shiftKey: boolean }) => e.shiftKey ? v : Math.round(v / 0.5) * 0.5;

  const selItems = items.filter(it => sel.includes(it.id));
  const sb = V.bounds(selItems);
  const style = (it: Partial<V.Item>) => setItems(a => a.map(x => sel.includes(x.id) ? { ...x, ...it } : x));
  const add = (it: Omit<V.Item, 'id'>) => { const n = { ...it, id: V.newId() }; setItems(a => [...a, n]); setSel([n.id]); return n; };
  const shape = (subs: V.Sub[]) => add({ subs, fill: fill ?? '#4f8cff', stroke: fill ? null : '#222222', sw: 1, even: false });
  const remove = () => {
    if (tool === 'node' && nodes.length) {
      setItems(a => { const b = clone(a); for (const n of [...nodes].sort((p, q) => q.i - p.i)) { const s = b.find(x => x.id === n.item)?.subs[n.sub]; if (s) s.pts.splice(n.i, 1); } return b.map(it => ({ ...it, subs: it.subs.filter(s => s.pts.length > 1) })).filter(it => it.subs.length); }); setNodes([]); return;
    }
    if (sel.length) { setItems(a => a.filter(x => !sel.includes(x.id))); setSel([]); }
  };
  const transform = (f: (x: number, y: number) => [number, number], k = 1) => setItems(a => a.map(x => sel.includes(x.id) ? V.mapItem(x, f, k) : x));
  /** Köşe işlemi: düğüm modunda seçili düğümler ya da seçili iki kenarın ortak düğümü; seçim modunda tüm keskin köşeler. */
  const doCorner = (st: 'chamfer' | 'round') => {
    const targets: Sel[] = [...nodes];
    for (const a of segs) for (const b of segs) if (a !== b && a.item === b.item && a.sub === b.sub) { const s = items.find(x => x.id === a.item)!.subs[a.sub], n = s.pts.length; if ((a.i + 1) % n === b.i) targets.push({ ...a, i: b.i }); }
    const all = !targets.length;
    setItems(arr => {
      const b = clone(arr);
      if (all) { for (const it of b) if (sel.includes(it.id) || !sel.length) for (const s of it.subs) for (let i = s.pts.length - 1; i >= 0; i--) if (V.isCorner(s, i)) V.cornerAt(s, i, corner, st); }
      else for (const t of [...targets].sort((p, q) => q.i - p.i)) { const s = b.find(x => x.id === t.item)?.subs[t.sub]; if (s) V.cornerAt(s, t.i, corner, st); }
      return b;
    });
    setNodes([]); setSegs([]);
  };
  const order = (up: boolean) => setItems(a => { const keep = a.filter(x => !sel.includes(x.id)), mine = a.filter(x => sel.includes(x.id)); return up ? [...keep, ...mine] : [...mine, ...keep]; });
  const bool = (op: 'union' | 'subtract' | 'intersect') => {
    const list = items.filter(x => sel.includes(x.id)); if (list.length < 2) return;
    try { const r = V.boolean(kernel.wasm, list, op); setItems(a => [...a.filter(x => !sel.includes(x.id)), r]); setSel([r.id]); } catch (e) { alert((e as Error).message); }
  };
  const importSvg = async () => {
    const f = await os.pickText('.svg'); if (!f) return;
    try { const its = loadItems(f.text, 40); setItems(a => [...a, ...its.map(it => V.mapItem(it, (x, y) => [x + view.x, y + view.y]))]); setSel(its.map(i => i.id)); } catch (e) { alert((e as Error).message); }
  };
  const finishPen = () => { if (pen && pen.pts.length > 1) add({ subs: [pen], fill: pen.closed ? fill ?? '#4f8cff' : null, stroke: pen.closed && fill ? null : '#222222', sw: 1, even: false }); setPen(null); };

  // --- fare ---
  const down = (e: PE<SVGSVGElement>) => {
    const [x, y] = at(e); (e.target as Element).setPointerCapture?.(e.pointerId);
    if (e.button === 1 || e.button === 2 || tool === 'pan' || space.current) { const v0 = view, c0 = [e.clientX, e.clientY]; drag.current = (_x, _y, ev) => setView({ ...v0, x: v0.x - (ev.clientX - c0[0]) / v0.s, y: v0.y - (ev.clientY - c0[1]) / v0.s }); return; }
    if (tool === 'select' || tool === 'node') { if (!e.shiftKey) { setSel([]); setNodes([]); setSegs([]); } return; }
    if (tool === 'pen') {
      const p = { x: snap(x, e), y: snap(y, e) };
      if (pen && pen.pts.length > 2 && Math.hypot(p.x - pen.pts[0].x, p.y - pen.pts[0].y) < 8 * px) { setPen(null); add({ subs: [{ ...pen, closed: true }], fill: fill ?? '#4f8cff', stroke: fill ? null : '#222222', sw: 1, even: false }); return; }
      const s: V.Sub = pen ? { ...pen, pts: [...pen.pts, p] } : { pts: [p], closed: false }; setPen(s);
      drag.current = (mx, my) => { const q = s.pts[s.pts.length - 1], dx = mx - q.x, dy = my - q.y; if (Math.hypot(dx, dy) < 2 * px) return; setPen({ ...s, pts: [...s.pts.slice(0, -1), { ...q, ox: q.x + dx, oy: q.y + dy, ix: q.x - dx, iy: q.y - dy }] }); };
      return;
    }
    if (tool === 'draw') { setInk([[x, y]]); drag.current = (mx, my) => setInk(k => k && [...k, [mx, my]]); return; }
    if (tool === 'text') {
      try { const it = V.mapItem({ id: 0, subs: V.parseD(kernel.textPath(text || ' ', textSize)), fill: fill ?? '#222222', stroke: null, sw: 1, even: false }, (a, b) => [a + x, b + y]); add(it); setTool('select'); } catch (er) { alert((er as Error).message); }
      return;
    }
    const a: [number, number] = [snap(x, e), snap(y, e)]; setDraft({ a, b: a });
    drag.current = (mx, my, ev) => setDraft({ a, b: [snap(mx, ev), snap(my, ev)] });
  };
  const moveEv = (e: PE<SVGSVGElement>) => { if (drag.current) { const [x, y] = at(e); drag.current(x, y, e); } };
  const up = () => {
    drag.current = null;
    if (draft) {
      const [x0, y0] = draft.a, [x1, y1] = draft.b, w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.max(w, h) / 2;
      setDraft(null);
      if (Math.max(w, h) > 0.4) shape([tool === 'rect' ? V.rectSub(Math.min(x0, x1), Math.min(y0, y1), w, h) : tool === 'ellipse' ? V.ellipseSub(cx, cy, w / 2, h / 2) : tool === 'polygon' ? V.polySub(cx, cy, r, sides) : tool === 'star' ? V.polySub(cx, cy, r, sides, r * 0.45) : V.heartSub(cx, cy, r * 2)]);
    }
    if (ink) { if (ink.length > 2) { const closed = Math.hypot(ink[0][0] - ink[ink.length - 1][0], ink[0][1] - ink[ink.length - 1][1]) < 12 * px; add({ subs: [V.smooth(ink, 1.2 * px, closed)], fill: closed ? fill ?? '#4f8cff' : null, stroke: closed && fill ? null : '#222222', sw: 1, even: false }); } setInk(null); }
  };
  const itemDown = (it: V.Item, e: PE) => {
    if (tool !== 'select' && tool !== 'node') return;
    e.stopPropagation();
    const ids = e.shiftKey ? (sel.includes(it.id) ? sel.filter(x => x !== it.id) : [...sel, it.id]) : sel.includes(it.id) ? sel : [it.id];
    setSel(ids); if (tool === 'node') return;
    const [x0, y0] = at(e), base = itemsRef.current; let first = true;
    drag.current = (x, y, ev) => { const dx = snap(x - x0, ev), dy = snap(y - y0, ev); setItems(base.map(q => ids.includes(q.id) ? V.mapItem(q, (a, b) => [a + dx, b + dy]) : q), first); first = false; };
  };
  /** Seçim kutusu: köşeden ölçek, üstten döndür. */
  const handleDown = (kind: 'scale' | 'rot', cx: number, cy: number, e: PE) => {
    e.stopPropagation(); if (!sb) return;
    const base = itemsRef.current, [x0, y0] = at(e), mx = (sb.x0 + sb.x1) / 2, my = (sb.y0 + sb.y1) / 2; let first = true;
    const ax = cx === sb.x0 ? sb.x1 : sb.x0, ay = cy === sb.y0 ? sb.y1 : sb.y0;
    drag.current = (x, y, ev) => {
      let f: (a: number, b: number) => [number, number], k = 1;
      if (kind === 'rot') { let r = Math.atan2(y - my, x - mx) - Math.atan2(y0 - my, x0 - mx); if (!ev.shiftKey) r = Math.round(r / (Math.PI / 12)) * Math.PI / 12; const c = Math.cos(r), s = Math.sin(r); f = (a, b) => [mx + (a - mx) * c - (b - my) * s, my + (a - mx) * s + (b - my) * c]; }
      else { let sx = (x - ax) / ((x0 - ax) || 1), sy = (y - ay) / ((y0 - ay) || 1); if (!ev.shiftKey) sx = sy = Math.abs(sx) > Math.abs(sy) ? sx : sy; k = Math.sqrt(Math.abs(sx * sy)); f = (a, b) => [ax + (a - ax) * sx, ay + (b - ay) * sy]; }
      setItems(base.map(q => sel.includes(q.id) ? V.mapItem(q, f, k) : q), first); first = false;
    };
  };
  const nodeDown = (n: Sel, part: 'p' | 'i' | 'o', e: PE) => {
    e.stopPropagation();
    if (part === 'p') setNodes(s => e.shiftKey ? (s.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? s.filter(q => !(q.item === n.item && q.sub === n.sub && q.i === n.i)) : [...s, n]) : s.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? s : [n]);
    const base = itemsRef.current, [x0, y0] = at(e); let first = true;
    drag.current = (x, y, ev) => {
      const dx = snap(x - x0, ev), dy = snap(y - y0, ev), b = clone(base), s = b.find(q => q.id === n.item)!.subs[n.sub], p = s.pts[n.i];
      if (part === 'p') { const move = (q: V.Pt) => { q.x += dx; q.y += dy; if (q.ix !== undefined) { q.ix += dx; q.iy! += dy; } if (q.ox !== undefined) { q.ox += dx; q.oy! += dy; } }; const list = nodes.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? nodes : [n]; for (const m of list) move(b.find(q => q.id === m.item)!.subs[m.sub].pts[m.i]); }
      else {
        const k = part === 'i' ? ['ix', 'iy'] as const : ['ox', 'oy'] as const, o = part === 'i' ? ['ox', 'oy'] as const : ['ix', 'iy'] as const, op = base.find(q => q.id === n.item)!.subs[n.sub].pts[n.i];
        p[k[0]] = op[k[0]]! + dx; p[k[1]] = op[k[1]]! + dy;
        if (!ev.altKey && p[o[0]] !== undefined) { const l = Math.hypot(p[o[0]]! - p.x, p[o[1]]! - p.y), vx = p.x - p[k[0]]!, vy = p.y - p[k[1]]!, m = Math.hypot(vx, vy) || 1; p[o[0]] = p.x + vx / m * l; p[o[1]] = p.y + vy / m * l; }
      }
      setItems(b, first); first = false;
    };
  };
  const nodeDouble = (n: Sel) => setItems(a => { const b = clone(a), s = b.find(q => q.id === n.item)!.subs[n.sub], p = s.pts[n.i], m = s.pts.length; if (p.ix !== undefined || p.ox !== undefined) { delete p.ix; delete p.iy; delete p.ox; delete p.oy; } else { const pa = s.pts[(n.i + m - 1) % m], pb = s.pts[(n.i + 1) % m], tx = (pb.x - pa.x) / 6, ty = (pb.y - pa.y) / 6; p.ix = p.x - tx; p.iy = p.y - ty; p.ox = p.x + tx; p.oy = p.y + ty; } return b; });
  const segDown = (n: Sel, e: PE) => { e.stopPropagation(); setSegs(s => e.shiftKey || s.length === 1 ? (s.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i) ? s.filter(q => !(q.item === n.item && q.sub === n.sub && q.i === n.i)) : [...s.slice(-1), n]) : [n]); setNodes([]); };
  const segDouble = (n: Sel, e: React.MouseEvent) => { const [x, y] = at(e); setItems(a => { const b = clone(a), s = b.find(q => q.id === n.item)!.subs[n.sub]; V.insertAt(s, n.i, V.nearestT(s.pts[n.i], s.pts[(n.i + 1) % s.pts.length], x, y)); return b; }); setSegs([]); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return;
      if (e.key === ' ') { space.current = e.type === 'keydown'; return; }
      if (e.type !== 'keydown') return;
      const c = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (c && key === 'z') { e.preventDefault(); if (e.shiftKey) undo(future, past); else undo(past, future); }
      else if (c && key === 'y') { e.preventDefault(); undo(future, past); }
      else if (c && key === 'd') { e.preventDefault(); dup(); }
      else if (key === 'delete' || key === 'backspace') remove();
      else if (key === 'enter') finishPen();
      else if (key === 'escape') { if (pen) finishPen(); else { setSel([]); setNodes([]); setSegs([]); } }
      else if (!c && ({ v: 'select', a: 'node', p: 'pen', b: 'draw', r: 'rect', e: 'ellipse', t: 'text', h: 'pan' } as Record<string, Tool>)[key]) setTool(({ v: 'select', a: 'node', p: 'pen', b: 'draw', r: 'rect', e: 'ellipse', t: 'text', h: 'pan' } as Record<string, Tool>)[key]);
      else if (key.startsWith('arrow') && sel.length) { e.preventDefault(); const s = e.shiftKey ? 5 : 0.5, d = { arrowleft: [-s, 0], arrowright: [s, 0], arrowup: [0, -s], arrowdown: [0, s] }[key]!; transform((x, y) => [x + d[0], y + d[1]]); }
    };
    addEventListener('keydown', k); addEventListener('keyup', k); return () => { removeEventListener('keydown', k); removeEventListener('keyup', k); };
  });
  const dup = () => { if (!sel.length) return; const copies = items.filter(x => sel.includes(x.id)).map(x => ({ ...V.mapItem(x, (a, b) => [a + 5, b + 5]), id: V.newId() })); setItems(a => [...a, ...copies]); setSel(copies.map(c => c.id)); };
  const wheel = (e: React.WheelEvent) => { const [x, y] = at(e), f = Math.exp(-e.deltaY * 0.0015), s = Math.min(400, Math.max(0.2, view.s * f)), k = view.s / s; setView({ s, x: x + (view.x - x) * k, y: y + (view.y - y) * k }); };
  const grid = useMemo(() => { const step = view.s > 12 ? 1 : view.s > 3 ? 5 : 10, x0 = view.x - size.w / 2 / view.s, y0 = view.y - size.h / 2 / view.s, x1 = x0 + size.w / view.s, y1 = y0 + size.h / view.s, l: ReactNode[] = []; for (let x = Math.ceil(x0 / step) * step; x < x1; x += step) l.push(<line key={'x' + x} x1={x} x2={x} y1={y0} y2={y1} className={x % (step * 10) === 0 ? 'g2' : 'g1'} />); for (let y = Math.ceil(y0 / step) * step; y < y1; y += step) l.push(<line key={'y' + y} y1={y} y2={y} x1={x0} x2={x1} className={y % (step * 10) === 0 ? 'g2' : 'g1'} />); return l; }, [view, size]);
  const T = (p: { t: Tool; k?: string; label: string; children: ReactNode }) => <button className={tool === p.t ? 'ib active' : 'ib'} title={`${p.label}${p.k ? ` (${p.k})` : ''}`} aria-label={p.label} aria-pressed={tool === p.t} onClick={() => { finishPen(); setTool(p.t); }}>{p.children}</button>;
  const A = (p: { t: string; on(): void; off?: boolean; children: ReactNode }) => <button className="ib" title={p.t} aria-label={p.t} disabled={p.off} onClick={p.on}>{p.children}</button>;
  const isN = (n: Sel) => nodes.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i), isS = (n: Sel) => segs.some(q => q.item === n.item && q.sub === n.sub && q.i === n.i);
  const r = 4.5 * px, hint = { select: 'Tıkla seç, sürükle taşı. Köşe tutamacı ölçekler (Shift: serbest), üstteki daire döndürür.', node: 'Noktayı sürükle; Shift ile çoklu seç. Kenara tıkla, Shift ile ikinci kenarı seç: aradaki köşeye pah verilir. Kenara çift tıkla: nokta ekle. Noktaya çift tıkla: köşe ↔ eğri.', pen: 'Tıkla: köşe noktası, sürükle: eğri. İlk noktaya tıkla: kapat. Enter: bitir.', draw: 'Basılı tutup çiz. Başladığın yere dönersen şekil kapanır.', rect: 'Sürükleyerek çiz.', ellipse: 'Sürükleyerek çiz.', polygon: 'Sürükleyerek çiz.', star: 'Sürükleyerek çiz.', heart: 'Sürükleyerek çiz.', text: 'Yazıyı ve boyunu sağdan seç, yerleştirmek için tıkla.', pan: 'Sürükleyerek kaydır. Her araçta boşluk tuşu ya da sağ tık da kaydırır.' }[tool];

  return <div className="vec">
    <div className="vec-top">
      <b>{title}</b><i />
      <A t="Geri al (Ctrl+Z)" off={!past.current.length} on={() => undo(past, future)}><Undo2 /></A>
      <A t="Yinele (Ctrl+Y)" off={!future.current.length} on={() => undo(future, past)}><Redo2 /></A><i />
      <A t="Çoğalt (Ctrl+D)" off={!sel.length} on={dup}><Copy /></A>
      <A t="Sil (Delete)" off={!sel.length && !nodes.length} on={remove}><Trash2 /></A>
      <A t="Öne getir" off={!sel.length} on={() => order(true)}><ArrowUpToLine /></A>
      <A t="Arkaya gönder" off={!sel.length} on={() => order(false)}><ArrowDownToLine /></A><i />
      <A t="Birleştir" off={sel.length < 2} on={() => bool('union')}><Combine /></A>
      <A t="Alttakinden çıkar" off={sel.length < 2} on={() => bool('subtract')}><SquaresSubtract /></A>
      <A t="Kesişim" off={sel.length < 2} on={() => bool('intersect')}><SquaresIntersect /></A>
      <A t="Yatay aynala" off={!sb} on={() => sb && transform((x, y) => [sb.x0 + sb.x1 - x, y])}><FlipHorizontal2 /></A>
      <A t="Dikey aynala" off={!sb} on={() => sb && transform((x, y) => [x, sb.y0 + sb.y1 - y])}><FlipVertical2 /></A><i />
      <label className="mini">Köşe <input type="number" min={0.1} step={0.1} value={corner} onChange={e => setCorner(Math.max(0.05, +e.target.value || 0.05))} /> mm</label>
      <button title={nodes.length || segs.length ? 'Seçili köşelere pah' : 'Seçili şekillerin (seçim yoksa hepsinin) tüm köşelerine pah'} onClick={() => doCorner('chamfer')}>Pah</button>
      <button title={nodes.length || segs.length ? 'Seçili köşeleri yuvarla' : 'Tüm köşeleri yuvarla'} onClick={() => doCorner('round')}>Yuvarla</button>
      <span className="grow" />
      <A t="Sığdır" on={fit}><Maximize /></A>
      <button onClick={onClose}>Vazgeç</button>
      <button className="primary" disabled={!items.length} onClick={() => { finishPen(); onSave(V.toSvg(itemsRef.current), itemsRef.current); }}>Kaydet ve 3B'ye al</button>
    </div>
    <div className="vec-tools">
      <T t="select" k="V" label="Seç ve taşı"><MousePointer2 /></T>
      <T t="node" k="A" label="Noktaları düzenle"><Spline /></T>
      <T t="pen" k="P" label="Kalem"><PenTool /></T>
      <T t="draw" k="B" label="Serbest çizim"><Pencil /></T>
      <T t="rect" k="R" label="Dikdörtgen"><Square /></T>
      <T t="ellipse" k="E" label="Elips"><Circle /></T>
      <T t="polygon" label="Poligon"><Hexagon /></T>
      <T t="star" label="Yıldız"><Star /></T>
      <T t="heart" label="Kalp"><Heart /></T>
      <T t="text" k="T" label="Yazı"><Type /></T>
      <T t="pan" k="H" label="Kaydır"><Hand /></T>
      <button className="ib" title="SVG dosyası ekle" aria-label="SVG dosyası ekle" onClick={importSvg}><ImagePlus /></button>
    </div>
    <div className="vec-canvas" ref={box} onContextMenu={e => e.preventDefault()}>
      <svg ref={svg} viewBox={vb} width={size.w} height={size.h} onPointerDown={down} onPointerMove={moveEv} onPointerUp={up} onWheel={wheel} style={{ cursor: tool === 'pan' ? 'grab' : tool === 'select' || tool === 'node' ? 'default' : 'crosshair' }}>
        <g strokeWidth={px} fill="none">{grid}<line className="g3" x1={-1e4} x2={1e4} y1={0} y2={0} /><line className="g3" y1={-1e4} y2={1e4} x1={0} x2={0} /></g>
        {guide && <path d={guide} className="guide" strokeWidth={2} />}
        {items.map(it => <path key={it.id} d={V.itemD(it)} fill={it.fill ?? 'none'} fillRule={it.even ? 'evenodd' : 'nonzero'} stroke={it.stroke ?? (sel.includes(it.id) ? '#1677ff' : 'none')} strokeWidth={it.stroke ? it.sw : px * 1.5} strokeLinejoin="round" strokeLinecap="round" onPointerDown={e => itemDown(it, e)} style={{ cursor: tool === 'select' ? 'move' : undefined }} />)}
        {tool === 'select' && sb && <g className="selbox">
          <rect x={sb.x0} y={sb.y0} width={sb.x1 - sb.x0} height={sb.y1 - sb.y0} strokeWidth={px} />
          {[[sb.x0, sb.y0], [sb.x1, sb.y0], [sb.x0, sb.y1], [sb.x1, sb.y1]].map(([x, y]) => <rect key={`${x},${y}`} x={x - r} y={y - r} width={2 * r} height={2 * r} strokeWidth={px} onPointerDown={e => handleDown('scale', x, y, e)} style={{ cursor: 'nwse-resize' }} />)}
          <line x1={(sb.x0 + sb.x1) / 2} x2={(sb.x0 + sb.x1) / 2} y1={sb.y0} y2={sb.y0 - 24 * px} strokeWidth={px} />
          <circle cx={(sb.x0 + sb.x1) / 2} cy={sb.y0 - 24 * px} r={r * 1.2} strokeWidth={px} onPointerDown={e => handleDown('rot', 0, 0, e)} style={{ cursor: 'grab' }} />
        </g>}
        {tool === 'node' && items.filter(it => sel.includes(it.id)).map(it => it.subs.map((s, si) => <g key={`${it.id}-${si}`}>
          {s.pts.map((p, i) => i < s.pts.length - 1 || s.closed ? <path key={'s' + i} d={`M${p.x} ${p.y}` + V.subD({ pts: [p, s.pts[(i + 1) % s.pts.length]], closed: false }).replace(/^M[^LC]*/, '')} className={isS({ item: it.id, sub: si, i }) ? 'seg on' : 'seg'} strokeWidth={isS({ item: it.id, sub: si, i }) ? 3 * px : 10 * px} onPointerDown={e => segDown({ item: it.id, sub: si, i }, e)} onDoubleClick={e => segDouble({ item: it.id, sub: si, i }, e)} /> : null)}
          {s.pts.map((p, i) => { const n = { item: it.id, sub: si, i }, on = isN(n); return <g key={i}>
            {on && p.ix !== undefined && <><line x1={p.x} y1={p.y} x2={p.ix} y2={p.iy} className="hl" strokeWidth={px} /><circle cx={p.ix} cy={p.iy} r={r * 0.8} className="hd" strokeWidth={px} onPointerDown={e => nodeDown(n, 'i', e)} /></>}
            {on && p.ox !== undefined && <><line x1={p.x} y1={p.y} x2={p.ox} y2={p.oy} className="hl" strokeWidth={px} /><circle cx={p.ox} cy={p.oy} r={r * 0.8} className="hd" strokeWidth={px} onPointerDown={e => nodeDown(n, 'o', e)} /></>}
            <rect x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} className={on ? 'nd on' : 'nd'} strokeWidth={px} onPointerDown={e => nodeDown(n, 'p', e)} onDoubleClick={() => nodeDouble(n)} />
          </g>; })}
        </g>))}
        {pen && <path d={V.subD(pen)} fill="none" stroke="#1677ff" strokeWidth={1.5 * px} />}
        {pen?.pts.map((p, i) => <rect key={i} x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} className="nd" strokeWidth={px} />)}
        {ink && <polyline points={ink.map(p => p.join(',')).join(' ')} fill="none" stroke="#1677ff" strokeWidth={1.5 * px} />}
        {draft && <rect x={Math.min(draft.a[0], draft.b[0])} y={Math.min(draft.a[1], draft.b[1])} width={Math.abs(draft.b[0] - draft.a[0])} height={Math.abs(draft.b[1] - draft.a[1])} fill="none" stroke="#1677ff" strokeDasharray={`${4 * px}`} strokeWidth={px} />}
      </svg>
      <p className="vec-hint">{hint}</p>
    </div>
    <div className="vec-side">
      <section className="card"><header><b>Dolgu</b></header>
        <div className="pal">{PAL.map(c => <button key={c} aria-label={c} className={(sel.length ? selItems[0]?.fill : fill) === c ? 'on' : ''} style={{ background: c }} onClick={() => { setFill(c); if (sel.length) style({ fill: c }); }} />)}
          <button className={(sel.length ? selItems[0]?.fill : fill) === null ? 'on none' : 'none'} title="Dolgusuz (yalnız çizgi)" aria-label="Dolgusuz" onClick={() => { setFill(null); if (sel.length) style({ fill: null, stroke: selItems[0]?.stroke ?? '#222222' }); }}>∅</button></div>
      </section>
      {selItems.length > 0 && <section className="card"><header><b>Çizgi</b></header>
        <label className="check"><input type="checkbox" checked={!!selItems[0].stroke} onChange={e => style({ stroke: e.target.checked ? '#222222' : null })} /> Çizgi kalınlığı da katı olsun</label>
        {selItems[0].stroke && <><label className="field"><span>Kalınlık (mm)</span><input type="number" min={0.2} step={0.1} value={selItems[0].sw} onChange={e => style({ sw: Math.max(0.1, +e.target.value || 0.1) })} /></label>
          <div className="pal">{PAL.map(c => <button key={c} aria-label={c} className={selItems[0].stroke === c ? 'on' : ''} style={{ background: c }} onClick={() => style({ stroke: c })} />)}</div></>}
        <label className="check"><input type="checkbox" checked={selItems[0].even} onChange={e => style({ even: e.target.checked })} /> İç içe yollar delik açsın (çift-tek kuralı)</label>
      </section>}
      {sb && <section className="card"><header><b>Konum ve boyut (mm)</b></header>
        <div className="grid2">{([['X', sb.x0], ['Y', sb.y0], ['G', sb.x1 - sb.x0], ['Y.', sb.y1 - sb.y0]] as const).map(([l, v], k) => <label className="field" key={l}><span>{['Sol', 'Üst', 'Genişlik', 'Yükseklik'][k]}</span><input type="number" step={0.5} value={Math.round(v * 100) / 100} onChange={e => { const x = +e.target.value; if (!Number.isFinite(x)) return; const w = sb.x1 - sb.x0, h = sb.y1 - sb.y0; if (k === 0) transform((a, b) => [a + x - sb.x0, b]); if (k === 1) transform((a, b) => [a, b + x - sb.y0]); if (k === 2 && x > 0) transform((a, b) => [sb.x0 + (a - sb.x0) * x / w, sb.y0 + (b - sb.y0) * x / w], x / w); if (k === 3 && x > 0) transform((a, b) => [sb.x0 + (a - sb.x0) * x / h, sb.y0 + (b - sb.y0) * x / h], x / h); }} /></label>)}</div>
        <button className="wide" onClick={() => transform((a, b) => [a - (sb.x0 + sb.x1) / 2, b - (sb.y0 + sb.y1) / 2])}>Ortaya al</button>
      </section>}
      {tool === 'text' && <section className="card"><header><b>Yazı</b></header><label className="field"><span>Metin</span><input value={text} onChange={e => setText(e.target.value)} /></label><label className="field"><span>Harf boyu (mm)</span><input type="number" min={1} value={textSize} onChange={e => setTextSize(Math.max(1, +e.target.value || 1))} /></label></section>}
      {(tool === 'polygon' || tool === 'star') && <section className="card"><header><b>{tool === 'star' ? 'Uç sayısı' : 'Kenar sayısı'}</b></header><input type="number" min={3} max={40} value={sides} onChange={e => setSides(Math.max(3, Math.min(40, +e.target.value || 3)))} /></section>}
      <p className="hint">Izgara 1 mm. Shift: ızgaraya yapışmadan. Tekerlek: yakınlaştır. Kapalı şekiller katı olur; açık çizgiler yalnız çizgi kalınlığıyla katı olur.</p>
    </div>
  </div>;
}
