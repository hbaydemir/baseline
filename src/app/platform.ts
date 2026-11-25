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
