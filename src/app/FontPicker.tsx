import { useEffect, useState } from 'react';
import * as os from './platform';

/** "Aile|Stil" değeri; boş = uygulamanın kendi yazı tipi (Baloo). */
export function FontPicker({ value, onChange, label = 'Yazı tipi' }: { value: string; onChange(v: string): void; label?: string }) {
  const [list, setList] = useState<os.FontInfo[] | null>(null), [q, setQ] = useState('');
  useEffect(() => { os.fontList().then(setList, () => setList([])); }, []);
  const [family, style] = value ? value.split('|') : ['', ''];
  const families = [...new Set((list ?? []).map(f => f.family))].filter(f => !q || f.toLocaleLowerCase('tr').includes(q.toLocaleLowerCase('tr')));
  const styles = (list ?? []).filter(f => f.family === family).map(f => f.style);
  const pick = (fam: string) => { if (!fam) return onChange(''); const st = (list ?? []).filter(f => f.family === fam).map(f => f.style); onChange(`${fam}|${st.find(s => /^(regular|normal|book|roman)$/i.test(s)) ?? st[0] ?? 'Regular'}`); };
  return <div className="fontpick">
    <label className="field"><span>{label}{list ? <i>{new Set(list.map(f => f.family)).size} aile</i> : <i>yükleniyor…</i>}</span>
      {list && list.length > 30 && <input className="fsearch" placeholder="Ara…" value={q} onChange={e => setQ(e.target.value)} />}
      <select value={family} onChange={e => pick(e.target.value)} style={{ fontFamily: family || undefined }}>
        <option value="">Baloo 2 (uygulamanın)</option>
        {family && !families.includes(family) && <option value={family}>{family}</option>}
        {families.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
      </select></label>
    {family && styles.length > 1 && <label className="field"><span>Kalınlık / stil</span><select value={style} onChange={e => onChange(`${family}|${e.target.value}`)}>{styles.map(s => <option key={s} value={s}>{s}</option>)}</select></label>}
    {family && list && !styles.length && <p className="error">Bu yazı tipi bu bilgisayarda yok; Baloo kullanılıyor.</p>}
  </div>;
}
