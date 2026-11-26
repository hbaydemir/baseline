// Şablon bilgisi: .baseline dosyasının "template" bloğu. Resmî şablonlar imzalıdır; adı, kategorisi ve açıklaması değiştirilemez.
import { find, type Doc, type Node } from './doc';

/** Seçenek: seçilince parametreleri yazar; seçilmeyen seçeneklerin parçaları çıkarılır. */
export interface FieldOption { label: string; nodes?: string[]; params?: Record<string, number> }
export interface TemplateField {
  key: string; label: string;
  /** number: belge ölçüsü (params[key]); text / color / logo: nesneye (node) bağlı; choice: seçenekler; toggle: aç-kapa parça (nodes). */
  type: 'number' | 'text' | 'color' | 'logo' | 'choice' | 'toggle';
  min?: number; max?: number; step?: number; unit?: string; hint?: string;
  node?: string; nodes?: string[]; options?: FieldOption[]; default?: number | boolean;
}
export interface TemplateMeta {
  name: string; category?: string; description?: string;
  id?: string; version?: number; official?: boolean; publisher?: string; pack?: string;
  tags?: string[]; kind?: 'ready' | 'customizable'; fields?: TemplateField[];
  /** Küçük resim (data:image/png;base64). */ thumb?: string;
  /** Resmî şablon imzası (Ed25519, base64). */ sig?: string;
}
export type Values = Record<string, number | string | boolean>;

export const GENERAL = 'Genel';
/** Resmî şablonları imzalayan anahtarın açık kısmı. */
export const OFFICIAL_KEY = 'CGd4O36FFJX96eoDUySY7K+u42QjNCzgRrtRgRp9P7w=';

/** Anahtar sırası sabit JSON: imza bunun üzerinden atılır ve doğrulanır. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') { const o = v as Record<string, unknown>; return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`; }
  return JSON.stringify(v);
}
/** İmzalanan içerik: imzanın kendisi hariç belgenin tamamı. */
export function signedBytes(d: Doc): Uint8Array {
  const { sig: _s, ...t } = d.template ?? ({} as TemplateMeta);
  return new TextEncoder().encode(canonical({ ...d, template: t }));
}
const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
let keyP: Promise<CryptoKey | null> | undefined;
/** Ham (parseDoc'tan önceki) belge resmî ve imzası geçerli mi? */
export async function verifyOfficial(raw: Doc): Promise<boolean> {
  const t = raw.template; if (!t?.official || !t.sig) return false;
  try {
    const key = await (keyP ??= crypto.subtle.importKey('raw', b64(OFFICIAL_KEY) as BufferSource, { name: 'Ed25519' }, false, ['verify']).catch(() => null));
    return !!key && await crypto.subtle.verify({ name: 'Ed25519' }, key, b64(t.sig) as BufferSource, signedBytes(raw) as BufferSource);
  } catch { return false; }
}

const seg = (s: string) => s.trim().replace(/[\\:*?"<>|]/g, '_').replace(/^\.+$/, '').slice(0, 60);
/** "Ev & Yaşam / Mutfak" → ["Ev & Yaşam", "Mutfak"]; boşsa Genel. */
export function catParts(c?: string): string[] { const p = (c ?? '').split('/').map(seg).filter(Boolean); return p.length ? p : [GENERAL]; }
export const catOf = (c?: string) => catParts(c).join('/');
export const safeName = (n: string) => seg(n).replace(/\//g, '_') || 'Şablon';
/** Şablonun klasördeki yolu: tpl:Kategori/Alt/Ad.baseline */
export const tplPath = (m: TemplateMeta) => `tpl:${catParts(m.category).join('/')}/${safeName(m.name)}.baseline`;

/** Alanın belgedeki şimdiki değeri (form başlangıcı). */
export function fieldValue(d: Doc, f: TemplateField): number | string | boolean {
  const node = f.node ? find(d.nodes, f.node)?.node : undefined;
  switch (f.type) {
    case 'number': { const v = d.params[f.key]; return typeof v === 'number' ? v : (typeof f.default === 'number' ? f.default : f.min ?? 0); }
    case 'text': return String(node?.params.text ?? '');
    case 'color': return node?.color || '#222222';
    case 'logo': return '';
    case 'choice': return typeof f.default === 'number' ? f.default : 0;
    case 'toggle': return f.default ?? true;
  }
}
/** Form değerlerini şablona uygular; seçilmeyen parçaları çıkarır. Sonuç sahneye eklenmeye hazır belgedir. */
export function applyFields(d: Doc, values: Values): Doc {
  const out: Doc = structuredClone(d), drop = new Set<string>();
  const nodeOf = (id?: string) => (id ? find(out.nodes, id)?.node : undefined);
  for (const f of out.template?.fields ?? []) {
    const v = values[f.key] ?? fieldValue(d, f);
    if (f.type === 'number') out.params[f.key] = Number(v);
    else if (f.type === 'text') { const n = nodeOf(f.node); if (n) n.params.text = String(v) || ' '; }
    else if (f.type === 'color') for (const id of [f.node, ...(f.nodes ?? [])]) { const n = nodeOf(id); if (n) n.color = String(v); }
    else if (f.type === 'logo') { const n = nodeOf(f.node); if (n && typeof v === 'string' && v.trim().startsWith('<')) n.params.svg = v; }
    else if (f.type === 'choice') (f.options ?? []).forEach((o, i) => { if (i === Number(v)) Object.assign(out.params, o.params ?? {}); else for (const id of o.nodes ?? []) drop.add(id); });
    else if (f.type === 'toggle' && !v) for (const id of f.nodes ?? []) drop.add(id);
  }
  // Seçilen seçenekte de geçen parça çıkarılmaz.
  for (const f of out.template?.fields ?? []) if (f.type === 'choice') for (const id of f.options?.[Number(values[f.key] ?? fieldValue(d, f))]?.nodes ?? []) drop.delete(id);
  const prune = (ns: Node[]): Node[] => ns.filter(n => !drop.has(n.id)).map(n => n.children ? { ...n, children: prune(n.children) } : n).filter(n => !n.children || n.children.length > 0);
  out.nodes = prune(out.nodes);
  delete out.template;
  return out;
}
