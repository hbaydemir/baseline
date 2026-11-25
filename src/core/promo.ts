// Promosyon şablonları: marka setinden (ad, logo, renkler, iletişim) üretilir.
import type { Command } from './doc';

export interface Brand { name: string; slogan: string; web: string; phone: string; logo: string; c1: string; c2: string; c3: string }
export const DEFAULT_BRAND: Brand = { name: 'Baseline', slogan: '3B baskı atölyesi', web: 'baseline.example', phone: '0555 000 00 00', logo: '', c1: '#222222', c2: '#ff8a00', c3: '#ffffff' };
type Num = number | string;
/** Logo: SVG varsa SVG, yoksa marka adı yazısı. */
function logo(b: Brand, id: string, w: number, h: number, pos: Num[], extra: Partial<Record<string, unknown>> = {}): Command {
  return (b.logo
    ? { op: 'add', type: 'svg', id, name: 'Logo', params: { svg: b.logo, width: w, h }, pos, color: '', ...extra }
    : { op: 'add', type: 'text', id, name: 'Logo', params: { text: b.name || 'Logo', size: w / Math.max(3, (b.name || 'Logo').length) * 1.5, h }, pos, color: b.c2, ...extra }) as unknown as Command;
}
const text = (id: string, t: string, size: number, h: number, pos: Num[], color: string, name = 'Yazı'): Command => ({ op: 'add', type: 'text', id, name, params: { text: t || ' ', size, h }, pos: pos as never, color });
const hole = (id: string, type: string, params: Record<string, Num>, pos: Num[], rot?: Num[]): Command => ({ op: 'add', type, id, params, pos: pos as never, ...(rot ? { rot: rot as never } : {}), hole: true });
const fuse = (ids: string[], name: string): Command => ({ op: 'group', ids, mode: 'fused', name });

export interface PromoTemplate { id: string; name: string; hint: string; make(b: Brand): Command[] }
export const PROMO: PromoTemplate[] = [
  { id: 'card', name: 'Kartvizit', hint: 'Ad, slogan, web ve QR; isteğe bağlı NFC yuvası', make: b => [
    { op: 'add', type: 'box', id: 'kart', name: 'Kart', params: { w: 90, d: 50, h: 1.6, r: 3, edge: 0.3 }, color: b.c3 },
    logo(b, 'logo', 34, 0.8, [-22, 10, 1.6]),
    text('ad', b.name, 6, 0.8, [-22, -6, 1.6], b.c1, 'Ad'), text('slogan', b.slogan, 3.2, 0.6, [-22, -13, 1.6], b.c1, 'Slogan'), text('web', b.web, 3.2, 0.6, [-22, -19, 1.6], b.c2, 'Web'),
    { op: 'add', type: 'qr', id: 'qr', name: 'QR', params: { text: b.web.startsWith('http') ? b.web : `https://${b.web}`, size: 34, h: 0.8, base: 0, margin: 0 }, pos: [24, 0, 1.6], color: b.c1 },
    fuse(['kart', 'logo', 'ad', 'slogan', 'web', 'qr'], 'Kartvizit')] },
  { id: 'logoKey', name: 'Logolu anahtarlık', hint: 'Halka delikli, iki renkli logo', make: b => [
    { op: 'add', type: 'box', id: 'plaka', name: 'Plaka', params: { w: 56, d: 26, h: 3.2, r: 8, edge: 0.6, edgeStyle: 'round' }, color: b.c1 },
    hole('delik', 'cylinder', { dia: 5, top: 5, h: 10 }, [-21, 0, -2]),
    logo(b, 'logo', 34, 1, [5, 0, 3.2]),
    fuse(['plaka', 'delik', 'logo'], 'Anahtarlık')] },
  { id: 'nfcKey', name: 'NFC anahtarlık', hint: 'İçinde 25 mm NFC etiketi yuvası (baskıda duraklat)', make: b => [
    { op: 'add', type: 'cylinder', id: 'disk', name: 'Disk', params: { dia: 36, top: 36, h: 4, edge: 0.6, edgeStyle: 'round' }, color: b.c1 },
    { op: 'add', type: 'cylinder', id: 'kulak', name: 'Kulak', params: { dia: 12, top: 12, h: 4, edge: 0.6 }, pos: [0, 19, 0], color: b.c1 },
    hole('delik', 'cylinder', { dia: 5, top: 5, h: 10 }, [0, 21, -2]),
    hole('nfc', 'cylinder', { dia: 26, top: 26, h: 0.8 }, [0, 0, 1.6]),
    logo(b, 'logo', 24, 0.8, [0, 0, 4]),
    fuse(['disk', 'kulak', 'delik', 'nfc', 'logo'], 'NFC anahtarlık')] },
  { id: 'coasterLogo', name: 'Logolu bardak altlığı', hint: 'Kenarı pahlı, logolu altlık', make: b => [
    { op: 'add', type: 'cylinder', id: 'taban', name: 'Taban', params: { dia: 95, top: 95, h: 4, edge: 0.8, edgeStyle: 'round', seg: 128 }, color: b.c1 },
    logo(b, 'logo', 60, 0.8, [0, 0, 3.4]),
    fuse(['taban', 'logo'], 'Altlık')] },
  { id: 'phoneStand', name: 'Telefon standı', hint: 'Logolu, 65° eğimli masa standı', make: b => [
    { op: 'add', type: 'box', id: 'taban', name: 'Taban', params: { w: 70, d: 80, h: 6, r: 4, edge: 0.8 }, color: b.c1 },
    { op: 'add', type: 'box', id: 'sirt', name: 'Sırt', params: { w: 70, d: 6, h: 95, r: 0, edge: 0.8 }, pos: [0, 18, 2], rot: [-25, 0, 0], color: b.c1 },
    { op: 'add', type: 'box', id: 'dudak', name: 'Dudak', params: { w: 70, d: 5, h: 16, edge: 0.8 }, pos: [0, -31, 0], color: b.c1 },
    logo(b, 'logo', 40, 1, [0, 38.6, 53.2], { rot: [65, 0, 0] }),
    fuse(['taban', 'sirt', 'dudak', 'logo'], 'Telefon standı')] },
  { id: 'penLogo', name: 'Logolu kalemlik', hint: 'Altıgen kalemlik, ön yüzde logo', make: b => [
    { op: 'add', type: 'polygon', id: 'dis', name: 'Gövde', params: { sides: 6, dia: 80, h: 100, corner: 3, cornerStyle: 'round' }, rot: [0, 0, 30], color: b.c1 },
    hole('ic', 'polygon', { sides: 6, dia: 72, h: 100, corner: 2, cornerStyle: 'round' }, [0, 0, 2.5], [0, 0, 30]),
    logo(b, 'logo', 44, 1, [0, -34.5, 55], { rot: [90, 0, 0] }),
    fuse(['dis', 'ic', 'logo'], 'Kalemlik')] },
  { id: 'magnet', name: 'Buzdolabı magneti', hint: 'Arkasında iki 10×3 mm mıknatıs yuvası', make: b => [
    { op: 'add', type: 'box', id: 'plaka', name: 'Plaka', params: { w: 70, d: 45, h: 5, r: 6, edge: 0.6, edgeStyle: 'round' }, color: b.c3 },
    hole('m1', 'magnetHole', { dia: 10, h: 3 }, [-18, 0, -0.01]), hole('m2', 'magnetHole', { dia: 10, h: 3 }, [18, 0, -0.01]),
    logo(b, 'logo', 50, 1, [0, 0, 5]),
    fuse(['plaka', 'm1', 'm2', 'logo'], 'Magnet')] },
  { id: 'luggage', name: 'Bavul etiketi', hint: 'Kayış yuvalı, ad ve telefonlu', make: b => [
    { op: 'add', type: 'box', id: 'plaka', name: 'Plaka', params: { w: 90, d: 55, h: 3, r: 6, edge: 0.6, edgeStyle: 'round' }, color: b.c2 },
    hole('kayis', 'box', { w: 4, d: 26, h: 10, r: 1.9 }, [-38, 0, -2]),
    logo(b, 'logo', 34, 0.8, [6, 14, 3]),
    text('ad', b.name, 5.5, 0.8, [6, -4, 3], b.c3, 'Ad'), text('tel', b.phone, 4.5, 0.8, [6, -15, 3], b.c3, 'Telefon'),
    fuse(['plaka', 'kayis', 'logo', 'ad', 'tel'], 'Bavul etiketi')] },
  { id: 'deskName', name: 'Masa isimliği (marka)', hint: 'Eğik ön yüzde ad ve logo', make: b => [
    { op: 'add', type: 'wedge', id: 'govde', name: 'Gövde', params: { w: 130, d: 32, h: 32 }, color: b.c3 },
    text('ad', b.name, 11, 1.2, [10, 0.2, 15.8], b.c1, 'Ad'),
    logo(b, 'logo', 22, 1.2, [-46, 0.2, 15.8]),
    { op: 'update', id: 'ad', rot: [45, 0, 0] }, { op: 'update', id: 'logo', rot: [45, 0, 0] },
    fuse(['govde', 'ad', 'logo'], 'Masa isimliği')] },
  { id: 'sign', name: 'Ayaklı logo tabela', hint: 'Dik duran tabela, ayaklı taban', make: b => [
    { op: 'add', type: 'box', id: 'pano', name: 'Pano', params: { w: 120, d: 5, h: 70, r: 0, edge: 0.8 }, pos: [0, 0, 8], color: b.c3 },
    { op: 'add', type: 'box', id: 'ayak', name: 'Ayak', params: { w: 130, d: 40, h: 8, r: 6, edge: 1, edgeStyle: 'round' }, color: b.c1 },
    logo(b, 'logo', 70, 1.2, [0, -2.5, 50], { rot: [90, 0, 0] }),
    text('web', b.web, 6, 1.2, [0, -2.5, 20], b.c1, 'Web'), { op: 'update', id: 'web', rot: [90, 0, 0] },
    fuse(['pano', 'ayak', 'logo', 'web'], 'Tabela')] },
  { id: 'medal', name: 'Madalya', hint: 'Kurdele yuvalı, logolu madalya', make: b => [
    { op: 'add', type: 'badge', id: 'disk', name: 'Madalya', params: { dia: 60, points: 24, depth: 1.5, h: 4 }, color: b.c2 },
    { op: 'add', type: 'box', id: 'kulak', name: 'Kulak', params: { w: 26, d: 14, h: 4, r: 5 }, pos: [0, 32, 0], color: b.c2 },
    hole('kurdele', 'box', { w: 18, d: 4, h: 10, r: 1.9 }, [0, 33, -2]),
    logo(b, 'logo', 38, 1, [0, 0, 4]),
    fuse(['disk', 'kulak', 'kurdele', 'logo'], 'Madalya')] },
  { id: 'opener', name: 'Şişe açacağı', hint: '25 mm bozuk para yuvalı (baskıda duraklatıp parayı koy)', make: b => [
    { op: 'add', type: 'box', id: 'govde', name: 'Gövde', params: { w: 90, d: 38, h: 8, r: 15, edge: 1, edgeStyle: 'round' }, color: b.c1 },
    hole('delik', 'cylinder', { dia: 26, top: 26, h: 20 }, [-26, 0, -5]),
    hole('para', 'cylinder', { dia: 26.2, top: 26.2, h: 2.2 }, [-36, 0, 2.9]),
    logo(b, 'logo', 40, 1, [14, 0, 8]),
    fuse(['govde', 'delik', 'para', 'logo'], 'Şişe açacağı')] },
];
