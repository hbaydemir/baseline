// Hazır desenler (texture): karo çizimi nesnenin dolgu rengiyle üretilir. Kimlik "tx:ad", renkli anahtar "tx:ad|#rrggbb".
import * as V from './vector';
import type { Pattern } from './vectorIO';
import { css } from './color';

type P = [number, number];
const poly = (pts: P[]): V.Sub => ({ closed: true, pts: pts.map(([x, y]) => ({ x, y })) });
const tile = (name: string, w: number, h: number, subs: V.Sub[]) => (c: string): Pattern => ({ name, w, h, items: [{ id: 1, subs, fill: c, stroke: null, sw: 0, even: false }] });
const wave = (): V.Sub => { const top: P[] = [], bot: P[] = []; for (let i = 0; i <= 24; i++) { const x = i / 24 * 6, y = 1.2 + 0.6 * Math.sin(x / 6 * Math.PI * 2); top.push([x, y]); bot.push([x, y + 0.6]); } return poly([...top, ...bot.reverse()]); };

export const TEXTURES: { id: string; name: string; make(c: string): Pattern }[] = [
  { id: 'tx:dots', name: 'Noktalar', make: tile('Noktalar', 3, 3, [V.ellipseSub(1.5, 1.5, 0.6, 0.6)]) },
  { id: 'tx:stripes', name: 'Eğik çizgi', make: tile('Eğik çizgi', 3, 3, [poly([[0, 0], [0.75, 0], [3, 2.25], [3, 3], [2.25, 3], [0, 0.75]])]) },
  { id: 'tx:hlines', name: 'Yatay çizgi', make: tile('Yatay çizgi', 3, 2, [V.rectSub(0, 0, 3, 0.7)]) },
  { id: 'tx:grid', name: 'Kareli', make: tile('Kareli', 4, 4, [V.rectSub(0, 0, 4, 0.4), V.rectSub(0, 0.4, 0.4, 3.6)]) },
  { id: 'tx:checker', name: 'Dama', make: tile('Dama', 4, 4, [V.rectSub(0, 0, 2, 2), V.rectSub(2, 2, 2, 2)]) },
  { id: 'tx:cross', name: 'Çapraz tarama', make: tile('Çapraz tarama', 3, 3, [poly([[0, 0], [0.6, 0], [3, 2.4], [3, 3], [2.4, 3], [0, 0.6]]), poly([[3, 0], [3, 0.6], [0.6, 3], [0, 3], [0, 2.4], [2.4, 0]])]) },
  { id: 'tx:zigzag', name: 'Zikzak', make: tile('Zikzak', 4, 3, [poly([[0, 1], [2, 0], [4, 1], [4, 1.8], [2, 0.8], [0, 1.8]])]) },
  { id: 'tx:waves', name: 'Dalga', make: tile('Dalga', 6, 3, [wave()]) },
  { id: 'tx:bricks', name: 'Tuğla', make: tile('Tuğla', 6, 4, [V.rectSub(0, 0, 6, 0.35), V.rectSub(0, 2, 6, 0.35), V.rectSub(0, 0.35, 0.35, 1.65), V.rectSub(3, 2.35, 0.35, 1.65)]) },
  { id: 'tx:tri', name: 'Üçgen', make: tile('Üçgen', 4, 3.46, [poly([[0, 3.46], [2, 0], [4, 3.46]])]) },
];
/** Öğenin desen anahtarı: hazır desende dolgu rengi de anahtara girer. */
export const patKey = (it: { pat?: string; fill: string | null }) => it.pat?.startsWith('tx:') ? `${it.pat}|${css(it.fill ?? '#000000')}` : it.pat;
/** Anahtardan deseni bulur (önce kullanıcının desenleri). */
export function resolvePat(key: string | undefined, custom: Record<string, Pattern>): Pattern | undefined {
  if (!key) return undefined; if (custom[key]) return custom[key];
  const [id, c] = key.split('|'), t = TEXTURES.find(q => q.id === id); return t ? t.make(c ?? '#000000') : undefined;
}
/** SVG kimliğinde kullanılabilir hâli. */
export const patId = (key: string) => key.replace(/[^\w-]/g, '_');
