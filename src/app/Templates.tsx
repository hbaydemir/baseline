// Şablon yöneticisi: Masaüstü/Baseline Templates klasöründeki .baseline şablonları, içe aktarma, kendi şablonunu kaydetme ve tasarım havuzu.
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, FolderOpen, Lock, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { parseDoc, serialize, type Doc } from '../core/doc';
import { applyFields, catOf, catParts, fieldValue, GENERAL, tplPath, verifyOfficial, type TemplateMeta, type Values } from '../core/template';
import * as os from './platform';

interface Tpl { path: string; doc: Doc; meta: TemplateMeta; official: boolean; cat: string }
interface PoolFile { path: string; name: string; group: string; ext: string; thumb?: string }
export interface NewMeta { name: string; category: string; description: string }
const dec = new TextDecoder();

/** Ad, kategori, açıklama formu: yeni şablon ve düzenleme için. */
function MetaForm({ init, cats, submit, cancel, ok }: { init: NewMeta; cats: string[]; submit(m: NewMeta): Promise<void> | void; cancel(): void; ok: string }) {
  const [m, setM] = useState(init), [busy, setBusy] = useState(false);
  return <form className="tm-form" onSubmit={async e => { e.preventDefault(); if (!m.name.trim()) return; setBusy(true); try { await submit({ ...m, name: m.name.trim(), category: catOf(m.category) }); } finally { setBusy(false); } }}>
    <label className="field"><span>Şablon adı *</span><input autoFocus required value={m.name} placeholder="ör. Çiçekli saksı" onChange={e => setM({ ...m, name: e.target.value })} /></label>
    <label className="field"><span>Kategori</span><input list="tm-cats" value={m.category} placeholder={GENERAL} onChange={e => setM({ ...m, category: e.target.value })} /><datalist id="tm-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></label>
    <label className="field tm-desc"><span>Açıklama</span><textarea rows={3} value={m.description} placeholder="İsteğe bağlı" onChange={e => setM({ ...m, description: e.target.value })} /></label>
    <p className="hint">Kategori boş kalırsa “{GENERAL}” olur. Alt kategori için eğik çizgi kullan: Ev &amp; Yaşam/Mutfak</p>
    <div className="row2"><button className="tb primary" disabled={busy || !m.name.trim()}>{ok}</button><button type="button" className="tb" onClick={cancel}>Vazgeç</button></div>
  </form>;
}

export function Library({ insert, importFile, say, saveCurrent, createName, hasScene }: {
  insert(d: Doc, name: string): void; importFile(name: string, data: Uint8Array): void; say(t: string, bad?: boolean): void;
  saveCurrent(m: NewMeta): Promise<string | null>; createName?: string | null; hasScene: boolean;
}) {
  const [tab, setTab] = useState<'tpl' | 'pool'>('tpl'), [tpls, setTpls] = useState<Tpl[] | null>(null), [pool, setPool] = useState<PoolFile[]>([]);
  const [q, setQ] = useState(''), [who, setWho] = useState<'all' | 'official' | 'mine'>('all'), [cat, setCat] = useState(''), [open, setOpen] = useState<Tpl | null>(null);
  const [form, setForm] = useState<{ mode: 'new' | 'edit'; init: NewMeta } | null>(createName != null ? { mode: 'new', init: { name: createName, category: '', description: '' } } : null);
  const [vals, setVals] = useState<Values>({});

  const load = async () => {
    try {
      const files = await os.libList();
      await migrate(files);
      const out: Tpl[] = [];
      for (const f of files.filter(f => f.path.startsWith('tpl:') && f.path.toLowerCase().endsWith('.baseline'))) {
        try {
          const text = dec.decode(await os.libRead(f.path)), raw = JSON.parse(text) as Doc, official = await verifyOfficial(raw), doc = parseDoc(text);
          const file = f.path.split('/').pop()!.replace(/\.baseline$/i, ''), dir = f.path.slice(4).split('/').slice(0, -1).join('/');
          const meta: TemplateMeta = { ...doc.template, name: doc.template?.name || file };
          out.push({ path: f.path, doc, meta, official, cat: catOf(meta.category ?? dir) });
        } catch { /* bozuk dosya: atla */ }
      }
      setTpls(out.sort((a, b) => a.meta.name.localeCompare(b.meta.name, 'tr')));
      const pf = files.filter(f => f.path.startsWith('user:Tasarımlar/') && !f.path.endsWith('.png'));
      setPool(pf.map(f => { const rel = f.path.slice('user:Tasarımlar/'.length).split('/'), file = rel.pop()!; return { path: f.path, name: file.replace(/\.[^.]+$/, ''), group: rel.join(' / ') || GENERAL, ext: file.split('.').pop()!.toLowerCase() }; }));
      for (const f of files.filter(f => f.path.startsWith('user:Tasarımlar/') && f.path.endsWith('.png'))) os.libRead(f.path).then(b => { const u = URL.createObjectURL(new Blob([b as BlobPart], { type: 'image/png' })); setPool(p => p.map(x => x.path.replace(/\.[^.]+$/, '.png') === f.path ? { ...x, thumb: u } : x)); }, () => {});
    } catch (e) { say(String((e as Error)?.message ?? e), true); setTpls([]); }
  };
  /** Eski sürümün "Şablonlarım" klasörü: bir kez Genel kategorisine taşınır. */
  const migrate = async (files: os.LibFile[]) => {
    const old = files.filter(f => f.path.startsWith('user:Şablonlarım/') && f.path.endsWith('.baseline')); if (!old.length) return;
    for (const f of old) {
      try {
        const doc = parseDoc(dec.decode(await os.libRead(f.path))), name = f.path.split('/').pop()!.replace(/\.baseline$/, ''), png = f.path.replace(/\.baseline$/, '.png');
        let thumb: string | undefined; if (files.some(x => x.path === png)) { const b = await os.libRead(png); thumb = 'data:image/png;base64,' + btoa(Array.from(b, c => String.fromCharCode(c)).join('')); await os.libDelete(png); }
        doc.template = { name, category: GENERAL, thumb }; await os.libWrite(tplPath(doc.template), serialize(doc)); await os.libDelete(f.path);
      } catch { /* bırak */ }
    }
    files.splice(0, files.length, ...await os.libList());
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cats = useMemo(() => [...new Set((tpls ?? []).map(t => t.cat))].sort((a, b) => a.localeCompare(b, 'tr')), [tpls]);
  const tree = useMemo(() => { const m = new Map<string, Set<string>>(); for (const c of cats) { const [a, ...r] = c.split('/'); if (!m.has(a)) m.set(a, new Set()); if (r.length) m.get(a)!.add(`${a}/${r[0]}`); } return [...m.entries()]; }, [cats]);
  const lc = (s?: string) => (s ?? '').toLocaleLowerCase('tr');
  const shown = (tpls ?? []).filter(t => (who === 'all' || (who === 'official') === t.official) && (!cat || t.cat === cat || t.cat.startsWith(cat + '/')) && (!q || [t.meta.name, t.meta.description, t.cat, ...(t.meta.tags ?? [])].some(x => lc(x).includes(lc(q)))));
  const count = (c: string) => (tpls ?? []).filter(t => t.cat === c || t.cat.startsWith(c + '/')).length;

  const pick = (t: Tpl) => { setOpen(t); setVals(Object.fromEntries((t.meta.fields ?? []).map(f => [f.key, fieldValue(t.doc, f)]))); };
  const use = (t: Tpl) => { try { insert(applyFields(t.doc, vals), t.meta.name); } catch (e) { say(`Eklenemedi: ${(e as Error).message}`, true); } };
  const remove = async (t: Tpl) => { if (!confirm(`“${t.meta.name}” şablonu silinsin mi? Dosya kalıcı olarak silinir.`)) return; await os.libDelete(t.path); setOpen(null); void load(); };
  const unique = (path: string, except?: string) => { const taken = new Set((tpls ?? []).map(t => t.path).filter(p => p !== except)); if (!taken.has(path)) return path; for (let i = 2; ; i++) { const p = path.replace(/\.baseline$/, ` (${i}).baseline`); if (!taken.has(p)) return p; } };

  const importTpl = async () => {
    const fs = await os.pickBytes('.baseline'); let n = 0;
    for (const f of fs) {
      try {
        const text = dec.decode(f.data), raw = JSON.parse(text) as Doc, doc = parseDoc(text), file = f.name.replace(/\.baseline$/i, '');
        if (await verifyOfficial(raw)) {
          const path = tplPath(raw.template!), old = (tpls ?? []).find(t => t.official && t.meta.id && t.meta.id === raw.template!.id);
          await os.libWrite(path, f.data); if (old && old.path !== path) await os.libDelete(old.path);
        } else {
          const { official: _o, sig: _s, ...rest } = doc.template ?? ({} as TemplateMeta);
          doc.template = { ...rest, name: rest.name?.trim() || file, category: catOf(rest.category) };
          await os.libWrite(unique(tplPath(doc.template)), serialize(doc));
        }
        n++;
      } catch (e) { say(`${f.name}: ${(e as Error).message}`, true); }
    }
    if (n) { say(`${n} şablon içe aktarıldı`); void load(); }
  };
  const saveEdit = async (t: Tpl, m: NewMeta) => {
    const doc: Doc = { ...t.doc, template: { ...t.meta, name: m.name, category: m.category, description: m.description || undefined } };
    const path = unique(tplPath(doc.template!), t.path);
    await os.libWrite(path, serialize(doc)); if (path !== t.path) await os.libDelete(t.path);
    setForm(null); setOpen(null); say('Şablon güncellendi'); void load();
  };

  const thumb = (t: Tpl) => t.meta.thumb ? <img src={t.meta.thumb} alt="" /> : <span className="ext">{t.meta.name.slice(0, 2).toUpperCase()}</span>;
  const crumbs = (c: string) => catParts(c).join(' › ');

  return <div className="tm">
    <div className="seg">{([['tpl', 'Şablonlar'], ['pool', 'Tasarım havuzu']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'tpl' && <>
      <div className="tm-bar">
        <label className="search"><Search /><input placeholder="Şablon ara" value={q} onChange={e => setQ(e.target.value)} /></label>
        <div className="seg mini-seg">{([['all', 'Tümü'], ['official', 'Resmî'], ['mine', 'Benim']] as const).map(([k, l]) => <button key={k} className={who === k ? 'on' : ''} onClick={() => setWho(k)}>{l}</button>)}</div>
        <button className="tb" onClick={importTpl}><Upload />İçe aktar</button>
        <button className="tb" disabled={!hasScene} title={hasScene ? 'Açık belgeyi ya da seçili nesneleri şablon olarak kaydet' : 'Önce sahneye bir model ekle'} onClick={() => { setOpen(null); setForm({ mode: 'new', init: { name: '', category: cat, description: '' } }); }}><Plus />Yeni şablon</button>
        {os.desktop && <button className="ib" title="Şablon klasörünü aç" aria-label="Şablon klasörünü aç" onClick={() => os.libOpen('tpl')}><FolderOpen /></button>}
      </div>
      {form?.mode === 'new' && <MetaForm init={form.init} cats={cats} ok="Şablon olarak kaydet" cancel={() => setForm(null)} submit={async m => { const p = await saveCurrent(m); if (p) { setForm(null); void load(); } }} />}
      <div className="tm-body">
        <nav className="tm-cats" aria-label="Kategoriler">
          <button className={!cat ? 'on' : ''} onClick={() => { setCat(''); setOpen(null); }}>Tümü<small>{tpls?.length ?? 0}</small></button>
          {tree.map(([a, subs]) => <div key={a}>
            <button className={cat === a ? 'on' : ''} onClick={() => { setCat(a); setOpen(null); }}>{a}<small>{count(a)}</small></button>
            {(cat === a || cat.startsWith(a + '/')) && [...subs].sort((x, y) => x.localeCompare(y, 'tr')).map(s => <button key={s} className={'sub' + (cat === s ? ' on' : '')} onClick={() => { setCat(s); setOpen(null); }}>{s.split('/')[1]}<small>{count(s)}</small></button>)}
          </div>)}
        </nav>
        <div className="tm-main">
          {open ? <div className="tm-detail">
            <button className="tb ghost" onClick={() => { setOpen(null); setForm(null); }}><ArrowLeft />Geri</button>
            <div className="tm-dgrid">
              <div className="tm-big">{thumb(open)}</div>
              <div className="tm-info">
                <small className="tm-crumb">{crumbs(open.cat)}</small>
                <h2>{open.meta.name}{open.official && <span className="tm-badge" title="Baseline resmî şablonu: imzası doğrulandı"><BadgeCheck />Resmî</span>}</h2>
                {open.meta.description && <p className="tm-dtext">{open.meta.description}</p>}
                {open.official && <p className="hint tm-lock"><Lock />Resmî şablon: adı, kategorisi ve açıklaması değiştirilemez.{open.meta.pack ? ` Paket: ${open.meta.pack}.` : ''}{open.meta.version ? ` Sürüm ${open.meta.version}.` : ''}</p>}
                {form?.mode === 'edit' ? <MetaForm init={form.init} cats={cats} ok="Kaydet" cancel={() => setForm(null)} submit={m => saveEdit(open, m)} /> : <>
                  {!!open.meta.fields?.length && <div className="tm-fields"><h3>Özelleştir</h3>{open.meta.fields.map(f => {
                    const v = vals[f.key], set = (x: number | string | boolean) => setVals({ ...vals, [f.key]: x });
                    return <div key={f.key} className={`tm-f tm-${f.type}`}>
                      {f.type === 'number' && <label className="field"><span>{f.label}{f.unit ? ` (${f.unit})` : ''}</span><div className="tm-num"><input type="range" min={f.min} max={f.max} step={f.step ?? 1} value={Number(v)} onChange={e => set(+e.target.value)} /><input type="number" min={f.min} max={f.max} step={f.step ?? 1} value={Number(v)} onChange={e => set(Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, +e.target.value || 0)))} /></div></label>}
                      {f.type === 'text' && <label className="field"><span>{f.label}</span><input value={String(v)} onChange={e => set(e.target.value)} /></label>}
                      {f.type === 'color' && <label className="field tm-color"><span>{f.label}</span><input type="color" value={String(v)} onChange={e => set(e.target.value)} /></label>}
                      {f.type === 'logo' && <div className="field"><span>{f.label}</span><div className="row2"><button className="tb" onClick={async () => { const x = await os.pickText('.svg'); if (x) set(x.text); }}>{v ? 'Logo seçildi · değiştir' : 'SVG logo seç'}</button>{!!v && <button className="tb" onClick={() => set('')}>Kaldır</button>}</div></div>}
                      {f.type === 'choice' && <div className="field"><span>{f.label}</span><div className="seg">{(f.options ?? []).map((o, i) => <button key={i} className={Number(v) === i ? 'on' : ''} onClick={() => set(i)}>{o.label}</button>)}</div></div>}
                      {f.type === 'toggle' && <label className="check"><input type="checkbox" checked={!!v} onChange={e => set(e.target.checked)} /> {f.label}</label>}
                      {f.hint && <small className="hint">{f.hint}</small>}
                    </div>;
                  })}</div>}
                  <div className="row2 tm-acts">
                    <button className="tb primary" onClick={() => use(open)}>Sahneye ekle</button>
                    {!open.official && <button className="tb" onClick={() => setForm({ mode: 'edit', init: { name: open.meta.name, category: open.cat, description: open.meta.description ?? '' } })}><Pencil />Bilgileri düzenle</button>}
                    <button className="tb danger" onClick={() => remove(open)}><Trash2 />Sil</button>
                  </div>
                </>}
              </div>
            </div>
          </div> : tpls === null ? <p className="hint">Şablonlar yükleniyor…</p> : !shown.length ? <div className="tm-empty">
            <b>{tpls.length ? 'Bu filtrede şablon yok' : 'Henüz şablon yok'}</b>
            <p className="hint">{tpls.length ? 'Aramayı ya da kategoriyi değiştir.' : 'Satın aldığın ya da indirdiğin .baseline şablonlarını “İçe aktar” ile ekle, ya da açık belgeni “Yeni şablon” ile kaydet. Şablonlar Masaüstündeki “Baseline Templates” klasöründe durur.'}</p>
          </div> : <div className="tm-grid">{shown.map(t => <button key={t.path} className="tm-card" onClick={() => pick(t)}>
            <span className="tm-thumb">{thumb(t)}{t.official && <span className="tm-ok" title="Resmî şablon"><BadgeCheck /></span>}</span>
            <b>{t.meta.name}</b><small className="tm-crumb">{crumbs(t.cat)}</small>
            {t.meta.description && <small className="tm-desc2">{t.meta.description}</small>}
          </button>)}</div>}
        </div>
      </div>
    </>}
    {tab === 'pool' && <>
      <div className="prow"><button onClick={async () => { const fs = await os.pickBytes('.baseline,.stl,.obj,.3mf,.svg'); for (const f of fs) await os.libWrite(`user:Tasarımlar/${f.name}`, f.data); if (fs.length) { say(`${fs.length} dosya havuza eklendi`); void load(); } }}>Havuza dosya ekle</button>{os.desktop && <button onClick={() => os.libOpen('user')}><FolderOpen />Klasörü aç</button>}</div>
      <p className="hint">Havuz: kendi dosyaların (~/.baseline/library/Tasarımlar). Alt klasörler kategori olur; .baseline, STL, OBJ, 3MF ve SVG desteklenir. Aynı adlı .png küçük resim olarak görünür.</p>
      {!pool.length && <p className="hint">Havuz boş.</p>}
      {[...new Set(pool.map(e => e.group))].map(g => <div key={g}><h3>{g}</h3><div className="tiles">{pool.filter(e => e.group === g).map(e => <div className="tile" key={e.path}>
        <button className="tile-b" onClick={async () => { try { const data = await os.libRead(e.path); if (e.ext === 'baseline') insert(parseDoc(dec.decode(data)), e.name); else importFile(`${e.name}.${e.ext}`, data); } catch (er) { say(`Eklenemedi: ${(er as Error)?.message ?? er}`, true); } }}>{e.thumb ? <img src={e.thumb} alt="" /> : <span className="ext">{e.ext.toUpperCase()}</span>}<b>{e.name}</b></button>
        <button className="ib del" aria-label={`${e.name} sil`} onClick={async () => { if (!confirm(`“${e.name}” silinsin mi? Geri alınamaz.`)) return; await os.libDelete(e.path); await os.libDelete(e.path.replace(/\.[^.]+$/, '.png')).catch(() => {}); void load(); }}><Trash2 /></button>
      </div>)}</div></div>)}
    </>}
  </div>;
}
