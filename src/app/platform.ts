// Masaüstü (Tauri) ve tarayıcı (geliştirme) arasındaki tek ayrım noktası.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { ReadProfile } from '../core/bambu';
import type { OutFile } from '../core/export';

export const desktop = isTauri();
export const REPO = 'hbaydemir/baseline';

export const readText = (path: string) => invoke<string>('read_text', { path });
export const writeText = (path: string, text: string) => invoke<string>('write_file', { path, data: Array.from(new TextEncoder().encode(text)) });
export const stamp = (path: string) => invoke<string | null>('file_stamp', { path });
export const setActive = (path: string | null) => desktop ? invoke<void>('set_active', { path }) : Promise.resolve();
export const startupFile = () => desktop ? invoke<string | null>('startup_file') : Promise.resolve(null);
export const mcpPath = () => desktop ? invoke<string>('mcp_path') : Promise.resolve('dist-tools/mcp.mjs');
export const readProfile: ReadProfile = (kind, name) => invoke<string>('read_profile', { kind, name });

const BL = [{ name: 'Baseline', extensions: ['baseline'] }];
export async function pickOpen(): Promise<string | null> { return await open({ filters: BL, multiple: false }) as string | null; }
export async function pickSave(name: string): Promise<string | null> { return await save({ filters: BL, defaultPath: name }); }

export function pickText(accept: string): Promise<{ name: string; text: string } | null> {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = async () => { const f = i.files?.[0]; res(f ? { name: f.name, text: await f.text() } : null); };
    i.oncancel = () => res(null);
    i.click();
  });
}
export function download(name: string, data: BlobPart) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data])); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
/** Dışa aktarılan dosyaları yazar; kullanıcı vazgeçerse null. */
export async function writeFiles(files: OutFile[]): Promise<string | null> {
  if (!desktop) { for (const f of files) download(f.name, f.data as BlobPart); return files[0].name; }
  const ext = files[0].name.split('.').pop()!;
  const p = await save({ defaultPath: files[0].name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (!p) return null;
  const dir = p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')) + 1);
  // Çok dosyalı çıktıda adlar birbirine başvurur (OBJ → MTL); yalnız klasör seçimi kullanılır.
  for (const f of files) await invoke('write_file', { path: files.length === 1 ? p : dir + f.name, data: Array.from(f.data) });
  return files.length === 1 ? p : dir;
}
export async function openLink(url: string) { if (desktop) await openUrl(url); else window.open(url, '_blank', 'noopener'); }

export interface Release { version: string; url: string; notes: string }
export async function latestRelease(): Promise<Release | null> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub yanıtı: ${r.status}`);
  const j = await r.json() as { tag_name: string; html_url: string; body?: string };
  return { version: j.tag_name.replace(/^v/, ''), url: j.html_url, notes: j.body ?? '' };
}
export function newer(a: string, b: string) {
  const p = (s: string) => s.split(/[.-]/).map(x => parseInt(x) || 0), x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0);
  return false;
}

// --- sistem fontları ---
export interface FontInfo { family: string; style: string; path: string }
let fontsP: Promise<FontInfo[]> | null = null;
export const fontList = () => fontsP ??= desktop ? invoke<FontInfo[]>('font_list') : Promise.resolve([]);
export async function readFont(key: string): Promise<ArrayBuffer | null> {
  const [family, style] = key.split('|'), list = await fontList(), f = list.find(x => x.family === family && x.style === style) ?? list.find(x => x.family === family);
  return f ? invoke<ArrayBuffer>('read_font', { path: f.path }) : null;
}

/** Fontu motora yükler (zaten yüklüyse bir şey yapmaz). Yoksa false. */
export async function ensureFont(k: { hasFont(key: string): boolean; addFont(key: string, d: ArrayBuffer): void }, key: string): Promise<boolean> {
  if (!key || k.hasFont(key)) return true;
  const d = await readFont(key); if (!d) return false;
  k.addFont(key, d); return true;
}

// --- şablonlar ve tasarım havuzu ---
export interface LibFile { path: string; size: number; modified: number }
const LS = 'baseline-library';
const local = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } };
export async function libList(): Promise<LibFile[]> {
  if (desktop) return invoke<LibFile[]>('lib_list');
  return Object.keys(local()).map(path => ({ path, size: local()[path].length, modified: 0 }));
}
export async function libRead(path: string): Promise<Uint8Array> {
  if (desktop) return new Uint8Array(await invoke<ArrayBuffer>('lib_read', { path }));
  const v = local()[path]; if (v === undefined) throw new Error('Dosya yok');
  return v.startsWith('data:') ? Uint8Array.from(atob(v.split(',')[1]), c => c.charCodeAt(0)) : new TextEncoder().encode(v);
}
export async function libWrite(path: string, data: string | Uint8Array) {
  if (desktop) return invoke<void>('lib_write', { path, data: Array.from(typeof data === 'string' ? new TextEncoder().encode(data) : data) });
  const all = local(); all[path] = typeof data === 'string' ? data : 'data:;base64,' + btoa(String.fromCharCode(...data)); localStorage.setItem(LS, JSON.stringify(all));
}
export async function libDelete(path: string) {
  if (desktop) return invoke<void>('lib_delete', { path });
  const all = local(); delete all[path]; localStorage.setItem(LS, JSON.stringify(all));
}
export const libOpen = (which: 'tpl' | 'user' = 'user') => desktop ? invoke<void>('lib_open', { which }) : Promise.resolve();
/** Dosya seçtirip ham baytlarını verir. */
export function pickBytes(accept: string): Promise<{ name: string; data: Uint8Array }[]> {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = true;
    i.onchange = async () => res(await Promise.all([...i.files ?? []].map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) }))));
    i.oncancel = () => res([]);
    i.click();
  });
}
