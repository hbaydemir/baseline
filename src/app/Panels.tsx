import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Search, XCircle } from 'lucide-react';
import { analyze, PROBLEMS, SETTINGS, SUPPORT_GUIDE } from '../core/guide';
import type { Built } from '../core/kernel';
import { PRINTERS } from '../core/export';


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

