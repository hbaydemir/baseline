import { num, resolveParams, type Num, type Vars } from './expr';
import { SHAPES } from './shapes';

export type V3 = [Num, Num, Num];
export type Mode = 'linked' | 'fused';
export interface Node {
  id: string; name: string; type: string; params: Record<string, Num>;
  pos: V3; rot: V3; scale: V3; color: string; hole: boolean; hidden: boolean;
  children?: Node[]; mode?: Mode;
}
export interface Doc { format: 'baseline'; version: 1; params: Record<string, Num>; nodes: Node[] }
export const newDoc = (): Doc => ({ format: 'baseline', version: 1, params: { tolerans: 0.2 }, nodes: [] });

interface Place { pos?: V3; rot?: V3; scale?: V3; color?: string; hole?: boolean; hidden?: boolean; name?: string; params?: Record<string, Num> }
export type Command =
  | ({ op: 'add'; type: string; id?: string } & Place)
  | ({ op: 'update'; id: string } & Place)
  | { op: 'remove'; ids: string[] }
  | { op: 'group'; ids: string[]; mode: Mode; id?: string; name?: string }
  | { op: 'ungroup'; id: string }
  | { op: 'setMode'; id: string; mode: Mode }
  | { op: 'duplicate'; id: string; newId?: string; offset?: V3 }
  | { op: 'setParam'; name: string; value: Num | null }
  | { op: 'place'; id: string; on: string; side?: Side; gap?: Num };
export type Side = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back' | 'center';
export type Bounds = { min: number[]; max: number[] };
export type BoundsOf = (doc: Doc, id: string) => Bounds;

export function find(nodes: Node[], id: string): { node: Node; list: Node[] } | null {
  for (const node of nodes) {
    if (node.id === id) return { node, list: nodes };
    const sub = node.children && find(node.children, id);
    if (sub) return sub;
  }
  return null;
}
function must(doc: Doc, id: string) { const f = find(doc.nodes, id); if (!f) throw new Error(`Nesne bulunamadı: ${id}`); return f; }

function freshId(doc: Doc, base: string) { let k = 1; while (find(doc.nodes, `${base}${k}`)) k++; return `${base}${k}`; }
function useId(doc: Doc, want: string | undefined, base: string) {
  if (!want) return freshId(doc, base);
  if (!/^[\w-]{1,64}$/.test(want)) throw new Error(`Geçersiz kimlik: ${want}`);
  if (find(doc.nodes, want)) throw new Error(`Kimlik zaten var: ${want}`);
  return want;
}
function checkNum(v: unknown, vars: Vars, what: string): number {
  if (typeof v !== 'number' && typeof v !== 'string') throw new Error(`${what}: sayı ya da "=formül" olmalı`);
  try { return num(v, vars); } catch (e) { throw new Error(`${what}: ${(e as Error).message}`); }
}
function checkV3(v: unknown, vars: Vars, what: string) {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`${what}: 3 elemanlı dizi olmalı`);
  return v.map(x => checkNum(x, vars, what));
}
/** Şekil parametrelerini şemaya göre doğrular. */
function checkParams(type: string, params: Record<string, Num>, vars: Vars) {
  if (type === 'group') { if (Object.keys(params).length) throw new Error('Grubun şekil parametresi olmaz'); return; }
  const fields = SHAPES[type].fields;
  for (const [k, v] of Object.entries(params)) {
    const f = fields.find(x => x.key === k);
    if (!f) throw new Error(`"${type}" için bilinmeyen parametre: ${k}. Geçerli: ${fields.map(x => x.key).join(', ')}`);
    if (f.kind === 'num' || f.kind === 'int') {
      const x = checkNum(v, vars, `${type}.${k}`);
      if (x < f.min! || x > f.max!) throw new Error(`${type}.${k} ${f.min} ile ${f.max} arasında olmalı (şu an ${x})`);
    } else if (typeof v !== 'string') throw new Error(`${type}.${k} metin olmalı`);
    else if (f.options && !f.options.some(o => o[0] === v)) throw new Error(`${type}.${k}: ${f.options.map(o => o[0]).join(' | ')}`);
  }
}
function applyPlace(node: Node, c: Place, vars: Vars) {
  if (c.params) { checkParams(node.type, c.params, vars); Object.assign(node.params, c.params); }
  if (c.pos) { checkV3(c.pos, vars, 'pos'); node.pos = c.pos; }
  if (c.rot) { checkV3(c.rot, vars, 'rot'); node.rot = c.rot; }
  if (c.scale) { if (checkV3(c.scale, vars, 'scale').some(x => Math.abs(x) < 1e-4)) throw new Error('scale sıfır olamaz'); node.scale = c.scale; }
  if (c.color !== undefined) { if (!/^(#[0-9a-f]{6})?$/i.test(c.color)) throw new Error('Renk #rrggbb olmalı'); node.color = c.color.toLowerCase(); }
  if (c.name !== undefined) node.name = String(c.name);
  if (c.hole !== undefined) node.hole = !!c.hole;
  if (c.hidden !== undefined) node.hidden = !!c.hidden;
}
const each = (nodes: Node[], f: (n: Node) => void) => nodes.forEach(n => { f(n); if (n.children) each(n.children, f); });

// --- 4x4 yerine 3x3 dönüş yeterli: R = Rz·Ry·Rx (derece) ---
type M3 = number[][];
export function rotM([x, y, z]: number[]): M3 {
  const [a, b, c] = [x, y, z].map(d => d * Math.PI / 180), [sa, ca, sb, cb, sc, cc] = [Math.sin(a), Math.cos(a), Math.sin(b), Math.cos(b), Math.sin(c), Math.cos(c)];
  return [[cc * cb, cc * sb * sa - sc * ca, cc * sb * ca + sc * sa], [sc * cb, sc * sb * sa + cc * ca, sc * sb * ca - cc * sa], [-sb, cb * sa, cb * ca]];
}
const mulM = (p: M3, q: M3): M3 => p.map(r => [0, 1, 2].map(j => r[0] * q[0][j] + r[1] * q[1][j] + r[2] * q[2][j]));
export const mulV = (m: M3, v: number[]) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
function eulerOf(m: M3): [number, number, number] {
  const sb = -m[2][0], d = 180 / Math.PI;
  if (Math.abs(sb) > 0.999999) return [Math.atan2(-m[1][2], m[1][1]) * d, Math.asin(Math.sign(sb)) * d, 0];
  return [Math.atan2(m[2][1], m[2][2]) * d, Math.asin(sb) * d, Math.atan2(m[1][0], m[0][0]) * d];
}
const r6 = (x: number) => Math.round(x * 1e6) / 1e6 + 0;

/** Komutları sırayla uygular; biri hatalıysa hiçbiri uygulanmaz (belge değişmeden kalır). */
export function apply(doc: Doc, cmds: Command[], boundsOf?: BoundsOf): { doc: Doc; created: string[] } {
  const d = structuredClone(doc), created: string[] = [];
  cmds.forEach((c, idx) => {
    try { one(d, c, created, boundsOf); } catch (e) { throw new Error(`Komut ${idx + 1} (${c?.op}): ${(e as Error).message}`); }
  });
  return { doc: d, created };
}
function one(d: Doc, c: Command, created: string[], boundsOf?: BoundsOf) {
  const vars = resolveParams(d.params);
  switch (c.op) {
    case 'add': {
      if (!Object.hasOwn(SHAPES, c.type)) throw new Error(`Bilinmeyen şekil: ${c.type}. Geçerli: ${Object.keys(SHAPES).join(', ')}`);
      const s = SHAPES[c.type], id = useId(d, c.id, c.type);
      const node: Node = { id, name: s.label, type: c.type, params: Object.fromEntries(s.fields.map(f => [f.key, f.def])), pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: s.color, hole: false, hidden: false };
      applyPlace(node, c, vars); d.nodes.push(node); created.push(id); return;
    }
    case 'update': return applyPlace(must(d, c.id).node, c, vars);
    case 'remove': for (const id of c.ids) { const f = must(d, id); f.list.splice(f.list.indexOf(f.node), 1); } return;
    case 'group': {
      if (c.mode !== 'linked' && c.mode !== 'fused') throw new Error('mode: linked | fused');
      const fs = [...new Set(c.ids)].map(id => must(d, id));
      if (fs.length < 2) throw new Error('En az iki nesne gerekli');
      const list = fs[0].list;
      if (fs.some(f => f.list !== list)) throw new Error('Nesneler aynı grupta olmalı');
      const id = useId(d, c.id, 'group'), kids = list.filter(n => fs.some(f => f.node === n)), at = list.indexOf(kids[0]);
      const g: Node = { id, name: c.name ?? 'Grup', type: 'group', params: {}, pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '', hole: false, hidden: false, children: kids, mode: c.mode };
      for (const k of kids) list.splice(list.indexOf(k), 1);
      list.splice(at, 0, g); created.push(id); return;
    }
    case 'ungroup': {
      const { node: g, list } = must(d, c.id);
      if (!g.children) throw new Error('Bu bir grup değil');
      const N = (v: V3) => v.map(x => num(x, vars)), gp = N(g.pos), gr = rotM(N(g.rot)), gs = N(g.scale);
      const uniform = gs.every(s => Math.abs(s - gs[0]) < 1e-9 && s > 0), still = !g.pos.some(Boolean) && !g.rot.some(Boolean) && gs.every(s => s === 1);
      if (!uniform) throw new Error('Orantısız ölçeklenmiş grup çözülemez; önce ölçeği eşitle');
      if (!still) for (const k of g.children) {
        const p = N(k.pos).map((x, i) => x * gs[i]), w = mulV(gr, p);
        k.pos = w.map((x, i) => r6(x + gp[i])) as V3;
        k.rot = eulerOf(mulM(gr, rotM(N(k.rot)))).map(r6) as V3;
        k.scale = N(k.scale).map((x, i) => r6(x * gs[i])) as V3;
      }
      list.splice(list.indexOf(g), 1, ...g.children); return;
    }
    case 'setMode': {
      const { node } = must(d, c.id);
      if (!node.children) throw new Error('Bu bir grup değil');
      if (c.mode !== 'linked' && c.mode !== 'fused') throw new Error('mode: linked | fused');
      node.mode = c.mode; return;
    }
    case 'duplicate': {
      const { node, list } = must(d, c.id), copy = structuredClone(node), o = checkV3(c.offset ?? [10, 10, 0], vars, 'offset');
      copy.id = useId(d, c.newId, node.type);
      copy.pos = copy.pos.map((p, i) => r6(num(p, vars) + o[i])) as V3;
      const taken = new Set<string>(); each(d.nodes, n => taken.add(n.id)); taken.add(copy.id);
      if (copy.children) each(copy.children, n => { let k = 1; while (taken.has(n.type + k)) k++; n.id = n.type + k; taken.add(n.id); });
      list.splice(list.indexOf(node) + 1, 0, copy); created.push(copy.id); return;
    }
    case 'setParam': {
      if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(c.name) || ['__proto__', 'constructor', 'prototype', 'pi'].includes(c.name)) throw new Error('Geçersiz parametre adı');
      if (c.value === null) delete d.params[c.name]; else d.params[c.name] = c.value;
      const v2 = resolveParams(d.params);
      each(d.nodes, n => { checkParams(n.type, n.params, v2); checkV3(n.pos, v2, n.id); checkV3(n.rot, v2, n.id); checkV3(n.scale, v2, n.id); });
      return;
    }
    case 'place': {
      if (!boundsOf) throw new Error('place için geometri gerekli');
      const { node, list } = must(d, c.id);
      if (list !== d.nodes) throw new Error('Yalnız en üst düzey nesneler yerleştirilebilir');
      const a = boundsOf(d, c.id), p = node.pos.map(x => num(x, vars)), gap = checkNum(c.gap ?? 0, vars, 'gap');
      if (c.on === 'plate') { node.pos = [node.pos[0], node.pos[1], r6(p[2] - a.min[2] + gap)]; return; }
      if (c.on === c.id) throw new Error('Nesne kendi üstüne konamaz');
      const b = boundsOf(d, c.on), side = c.side ?? 'top';
      const move = [0, 1, 2].map(k => (b.min[k] + b.max[k] - a.min[k] - a.max[k]) / 2);
      const ax = ({ left: 0, right: 0, front: 1, back: 1, top: 2, bottom: 2 } as Record<string, number>)[side];
      if (ax === undefined && side !== 'center') throw new Error(`Bilinmeyen yön: ${side}`);
      if (ax !== undefined) {
        move[ax] = ['right', 'back', 'top'].includes(side) ? b.max[ax] - a.min[ax] + gap : b.min[ax] - a.max[ax] - gap;
        if (ax !== 2) move[2] = b.min[2] - a.min[2];
      }
      node.pos = p.map((x, i) => r6(x + move[i])) as V3; return;
    }
    default: throw new Error(`Bilinmeyen komut: ${(c as { op: string }).op}`);
  }
}

/** Dosyadan gelen belgeyi doğrular. */
export function parseDoc(text: string): Doc {
  const d = JSON.parse(text) as Doc;
  if (d?.format !== 'baseline') throw new Error('Baseline dosyası değil');
  if (d.version !== 1) throw new Error(`Desteklenmeyen dosya sürümü: ${d.version}`);
  if (!Array.isArray(d.nodes) || typeof d.params !== 'object' || !d.params) throw new Error('Bozuk dosya');
  const vars = resolveParams(d.params), ids = new Set<string>();
  each(d.nodes, n => {
    if (typeof n.id !== 'string' || ids.has(n.id)) throw new Error(`Yinelenen ya da geçersiz kimlik: ${n.id}`);
    ids.add(n.id);
    if (n.type === 'group' ? !Array.isArray(n.children) : !Object.hasOwn(SHAPES, n.type)) throw new Error(`Bilinmeyen nesne: ${n.type}`);
    checkParams(n.type, n.params, vars); checkV3(n.pos, vars, n.id); checkV3(n.rot, vars, n.id); checkV3(n.scale, vars, n.id);
    if (!/^(#[0-9a-f]{6})?$/i.test(n.color)) throw new Error(`Geçersiz renk: ${n.id}`);
  });
  return d;
}
