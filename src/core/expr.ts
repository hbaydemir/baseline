// Güvenli formül: sadece sayı, + - * / ^, parantez, parametre adı ve birkaç fonksiyon. eval yok.
export type Num = number | string;
export type Vars = Record<string, number>;
const FN: Record<string, (...a: number[]) => number> = {
  min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: d => Math.sin(d * Math.PI / 180), cos: d => Math.cos(d * Math.PI / 180), tan: d => Math.tan(d * Math.PI / 180),
};
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export function evalExpr(src: string, vars: Vars): number {
  const t = src.match(/\d+(?:\.\d+)?|\.\d+|[\p{L}_][\p{L}\p{N}_]*|[-+*/^(),]|\S/gu) ?? [];
  let i = 0;
  const need = (c: string) => { if (t[i++] !== c) throw new Error(`Formülde "${c}" bekleniyordu: ${src}`); };
  const sum = (): number => { let v = mul(); while (t[i] === '+' || t[i] === '-') v = t[i++] === '+' ? v + mul() : v - mul(); return v; };
  const mul = (): number => { let v = un(); while (t[i] === '*' || t[i] === '/') v = t[i++] === '*' ? v * un() : v / un(); return v; };
  const un = (): number => t[i] === '-' ? (i++, -un()) : t[i] === '+' ? (i++, un()) : pow();
  const pow = (): number => { const v = atom(); return t[i] === '^' ? (i++, v ** un()) : v; };
  const atom = (): number => {
    const k = t[i++];
    if (k === undefined) throw new Error(`Formül eksik: ${src}`);
    if (k === '(') { const v = sum(); need(')'); return v; }
    if (/^[\d.]/.test(k)) return Number(k);
    if (t[i] === '(' && own(FN, k)) {
      i++; const a = [sum()]; while (t[i] === ',') { i++; a.push(sum()); } need(')'); return FN[k](...a);
    }
    if (k === 'pi') return Math.PI;
    if (own(vars, k)) return vars[k];
    throw new Error(`Formülde bilinmeyen ad: ${k}`);
  };
  const v = sum();
  if (i < t.length) throw new Error(`Formülde beklenmeyen "${t[i]}": ${src}`);
  if (!Number.isFinite(v)) throw new Error(`Formül sonucu geçersiz: ${src}`);
  return v;
}
export function num(v: Num, vars: Vars): number {
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('Geçersiz sayı'); return v; }
  return evalExpr(v.replace(/^\s*=/, ''), vars);
}
/** Belge parametreleri birbirine başvurabilir; döngü varsa hata verir. */
export function resolveParams(params: Record<string, Num>): Vars {
  const out: Vars = {}, busy = new Set<string>();
  const get = (k: string): number => {
    if (own(out, k)) return out[k];
    if (busy.has(k)) throw new Error(`Parametre döngüsü: ${k}`);
    busy.add(k);
    const raw = params[k];
    const deps: Vars = {};
    if (typeof raw === 'string') for (const m of raw.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []) if (own(params, m)) deps[m] = get(m);
    busy.delete(k);
    return out[k] = num(raw, deps);
  };
  Object.keys(params).forEach(get);
  return out;
}
