import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FolderOpen, Search, Trash2, XCircle } from 'lucide-react';
import { analyze, PROBLEMS, SETTINGS, SUPPORT_GUIDE } from '../core/guide';
import { TEMPLATES, templateDoc, type Template } from '../core/templates';
import type { Built } from '../core/kernel';
import type { Doc } from '../core/doc';
import { PRINTERS } from '../core/export';
import * as os from './platform';
import { DEFAULT_BRAND, type Brand } from '../core/promo';

export function loadBrand(): Brand { try { return { ...DEFAULT_BRAND, ...JSON.parse(localStorage.getItem('baseline-brand') ?? '{}') }; } catch { return DEFAULT_BRAND; } }
function saveBrand(b: Brand) { try { localStorage.setItem('baseline-brand', JSON.stringify(b)); } catch { /* yok */ } }

const THUMBS = Object.fromEntries(Object.entries(import.meta.glob('./thumbs/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>).map(([k, v]) => [k.replace(/^.*\/|\.png$/g, ''), v]));

export function Assistant({ built, overhang, setOverhang }: { built: Built[]; overhang: boolean; setOverhang(v: boolean): void }) {
  const [tab, setTab] = useState<'model' | 'fix' | 'settings' | 'support'>('model'), [q, setQ] = useState(''), [open, setOpen] = useState<string | null>(null), [bed, setBed] = useState(PRINTERS[1].id);
  const a = useMemo(() => analyze(built, PRINTERS.find(p => p.id === bed)?.bed), [built, bed]);
  const S = useMemo(() => Object.fromEntries(SETTINGS.map(s => [s.id, s])), []);
  const groups = [...new Set(SETTINGS.map(s => s.group))], match = (t: string) => t.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr'));
  const icon = (l: string) => l === 'ok' ? <CheckCircle2 className="ok" /> : l === 'warn' ? <AlertTriangle className="warn" /> : <XCircle className="bad" />;
  return <div className="assist">
    <div className="seg">{([['model', 'Bu model'], ['fix', 'Sorun çöz'], ['settings', 'Ayarlar ne yapar'], ['support', 'Destek']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'model' && (a ? <>
      <label className="field"><span>Yazıcı tablası</span><select value={bed} onChange={e => setBed(e.target.value)}>{PRINTERS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.bed.join(' × ')} mm</option>)}</select></label>
      <div className="stats"><div><b>{a.size.map(x => x.toFixed(0)).join(' × ')}</b><span>mm</span></div><div><b>≈ {a.grams.toFixed(0)} g</b><span>PLA, %15 dolgu</span></div><div><b>≈ {a.minutes < 90 ? `${Math.round(a.minutes)} dk` : `${(a.minutes / 60).toFixed(1)} sa`}</b><span>kaba tahmin</span></div></div>
      <ul className="finds">{a.findings.map((f, i) => <li key={i}>{icon(f.level)}{f.text}</li>)}</ul>
      <label className="check"><input type="checkbox" checked={overhang} onChange={e => setOverhang(e.target.checked)} /> Destek gereken yerleri kırmızı göster (45°’den yatık alt yüzeyler)</label>
      <h3>Önerilen ayarlar</h3><ul className="tips">{a.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
      <p className="hint">Gram ve süre tahmini kabadır; kesin değeri dilimleyici verir.</p>
    </> : <p className="hint">Analiz için sahneye bir model ekle.</p>)}
    {tab === 'fix' && <div className="list">{PROBLEMS.map(p => <details key={p.id} open={open === p.id} onToggle={e => (e.target as HTMLDetailsElement).open && setOpen(p.id)}><summary>{p.name}</summary><p className="hint">{p.looks}</p><ol>{p.fixes.map((f, i) => <li key={i}>{f}</li>)}</ol><p className="rel">İlgili ayarlar: {p.settings.map(s => <button key={s} className="chip" onClick={() => { setTab('settings'); setQ(S[s].name); }}>{S[s].name}</button>)}</p></details>)}</div>}
    {tab === 'settings' && <>
      <label className="search"><Search /><input placeholder="Ayar ara (ör. fan, destek, retraction)" value={q} onChange={e => setQ(e.target.value)} /></label>
      <div className="list">{groups.map(g => { const list = SETTINGS.filter(s => s.group === g && (!q || match(s.name) || match(s.aka) || match(s.what))); return list.length ? <div key={g}><h3>{g}</h3>{list.map(s => <details key={s.id} open={!!q && list.length < 4}><summary>{s.name} <small>{s.aka}</small></summary><p>{s.what}</p><dl><dt>Artırınca</dt><dd>{s.up}</dd><dt>Azaltınca</dt><dd>{s.down}</dd><dt>Tipik değer</dt><dd>{s.typical}</dd></dl>{s.tip && <p className="tip">{s.tip}</p>}</details>)}</div> : null; })}</div>
    </>}
    {tab === 'support' && <div className="list">{SUPPORT_GUIDE.map(([t, d]) => <div className="sup" key={t}><b>{t}</b><p>{d}</p></div>)}
      <label className="check"><input type="checkbox" checked={overhang} onChange={e => setOverhang(e.target.checked)} /> Destek gereken yerleri göster</label></div>}
  </div>;
}

interface Entry { key: string; name: string; hint?: string; group: string; thumb?: string; kind: 'template' | 'file'; path?: string; user: boolean; ext: string }
/** Hazır şablonlar, kullanıcının şablonları ve tasarım havuzu. */
export function Library({ insert, importFile, say, saveCurrent }: { insert(d: Doc, name: string): void; importFile(name: string, data: Uint8Array): void; say(t: string, bad?: boolean): void; saveCurrent(name: string): Promise<void> }) {
  const [brand, setBrandState] = useState<Brand>(loadBrand), setBrand = (b: Brand) => { setBrandState(b); saveBrand(b); };
  const [tab, setTab] = useState<'ready' | 'mine' | 'pool' | 'brand'>('ready'), [files, setFiles] = useState<os.LibFile[]>([]), [thumbs, setThumbs] = useState<Record<string, string>>({}), [name, setName] = useState('');
  const load = () => os.libList().then(setFiles, e => say(String(e?.message ?? e), true));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    for (const f of files.filter(f => f.path.endsWith('.png') && !thumbs[f.path])) os.libRead(f.path).then(b => setThumbs(t => ({ ...t, [f.path]: URL.createObjectURL(new Blob([b as BlobPart], { type: 'image/png' })) })), () => {});
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const entries = (pred: (p: string) => boolean): Entry[] => files.filter(f => pred(f.path) && !f.path.endsWith('.png')).map(f => {
    const [, rel] = f.path.split(/:(.*)/s), parts = rel.split('/'), file = parts.pop()!, ext = file.split('.').pop()!.toLowerCase();
    return { key: f.path, name: file.replace(/\.[^.]+$/, ''), group: parts.join(' / ') || 'Genel', thumb: thumbs[f.path.replace(/\.[^.]+$/, '.png')], kind: 'file', path: f.path, user: f.path.startsWith('user:'), ext };
  });
  const ready: Entry[] = TEMPLATES.map(t => ({ key: t.id, name: t.name, hint: t.hint, group: t.cat, kind: 'template', user: false, ext: 'baseline', thumb: THUMBS[t.id] }));
  const mine = entries(p => p.startsWith('user:Şablonlarım/'));
  const pool = entries(p => p.startsWith('app:') || p.startsWith('user:Tasarımlar/'));
  const use = async (e: Entry) => {
    try {
      if (e.kind === 'template') { const t = TEMPLATES.find(x => x.id === e.key) as Template; insert(templateDoc(t, brand), t.name); return; }
      const data = await os.libRead(e.path!);
      if (e.ext === 'baseline') { const { parseDoc } = await import('../core/doc'); insert(parseDoc(new TextDecoder().decode(data)), e.name); }
      else importFile(`${e.name}.${e.ext}`, data);
    } catch (er) { say(`Eklenemedi: ${(er as Error)?.message ?? er}`, true); }
  };
  const del = async (e: Entry) => { if (!confirm(`“${e.name}” silinsin mi? Geri alınamaz.`)) return; await os.libDelete(e.path!); if (e.path!.endsWith('.baseline')) await os.libDelete(e.path!.replace(/\.baseline$/, '.png')).catch(() => {}); void load(); };
  const addToPool = async () => { const fs = await os.pickBytes('.baseline,.stl,.obj,.3mf,.svg'); for (const f of fs) await os.libWrite(`user:Tasarımlar/${f.name}`, f.data); if (fs.length) { say(`${fs.length} dosya havuza eklendi`); void load(); } };
  const list = tab === 'ready' ? ready : tab === 'mine' ? mine : tab === 'pool' ? pool : [], groups = [...new Set(list.map(e => e.group))];
  return <div className="lib">
    <div className="seg">{([['ready', 'Hazır şablonlar'], ['brand', 'Marka seti'], ['mine', 'Şablonlarım'], ['pool', 'Tasarım havuzu']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'brand' && <div className="brand">
      <p className="hint">Bir kez gir; “Promosyon” şablonları (kartvizit, anahtarlık, magnet, tabela…) bu bilgilerle hazır gelir.</p>
      <div className="grid2">{([['name', 'Firma / ad'], ['slogan', 'Slogan'], ['web', 'Web adresi'], ['phone', 'Telefon']] as const).map(([k, l]) => <label className="field" key={k}><span>{l}</span><input value={brand[k]} onChange={e => setBrand({ ...brand, [k]: e.target.value })} /></label>)}</div>
      <div className="grid3">{([['c1', 'Ana renk'], ['c2', 'Vurgu rengi'], ['c3', 'Zemin rengi']] as const).map(([k, l]) => <label className="field" key={k}><span>{l}</span><input type="color" value={brand[k]} onChange={e => setBrand({ ...brand, [k]: e.target.value })} /></label>)}</div>
      <div className="prow"><button onClick={async () => { const f = await os.pickText('.svg'); if (f) setBrand({ ...brand, logo: f.text }); }}>Logo seç (SVG)</button>{brand.logo && <><span className="hint">Logo yüklü</span><button onClick={() => setBrand({ ...brand, logo: '' })}>Logoyu kaldır</button></>}<button onClick={() => setBrand(DEFAULT_BRAND)}>Sıfırla</button></div>
      {brand.logo && <img className="logo-prev" alt="Logo önizleme" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(brand.logo)}`} />}
      <button className="tb primary" onClick={() => setTab('ready')}>Promosyon şablonlarına git</button>
    </div>}
    {tab === 'mine' && <form className="prow" onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; await saveCurrent(name.trim()); setName(''); void load(); }}><label className="field"><span>Açık belgeyi şablon olarak kaydet</span><input placeholder="Şablon adı" value={name} onChange={e => setName(e.target.value)} /></label><button disabled={!name.trim()}>Kaydet</button></form>}
    {tab === 'pool' && <div className="prow"><button onClick={addToPool}>Havuza dosya ekle</button>{os.desktop && <button onClick={() => os.libOpen()}><FolderOpen />Klasörü aç</button>}</div>}
    {tab === 'pool' && <p className="hint">Havuz: uygulamayla gelen tasarımlar ve kendi klasörün (~/.baseline/library/Tasarımlar). Alt klasörler kategori olur; .baseline, STL, OBJ, 3MF ve SVG desteklenir. Aynı adlı .png küçük resim olarak görünür.</p>}
    {!list.length && tab !== 'brand' && <p className="hint">{tab === 'mine' ? 'Henüz şablonun yok. Bir tasarımı yukarıdan ya da nesne panelindeki “Şablon olarak kaydet” ile ekle.' : 'Havuz boş.'}</p>}
    {groups.map(g => <div key={g}><h3>{g}</h3><div className="tiles">{list.filter(e => e.group === g).map(e => <div className="tile" key={e.key}>
      <button className="tile-b" onClick={() => use(e)}>{e.thumb ? <img src={e.thumb} alt="" /> : <span className="ext">{e.ext.toUpperCase()}</span>}<b>{e.name}</b>{e.hint && <small>{e.hint}</small>}</button>
      {e.user && <button className="ib del" aria-label={`${e.name} sil`} onClick={() => del(e)}><Trash2 /></button>}
    </div>)}</div></div>)}
  </div>;
}
