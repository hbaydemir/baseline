import type { Num } from './expr';
export interface Field { key: string; label: string; kind: 'num' | 'int' | 'text' | 'svg' | 'select'; def: Num; min?: number; max?: number; options?: [string, string][] }
const n = (key: string, label: string, def: Num, min = 0.1, max = 2000): Field => ({ key, label, kind: 'num', def, min, max });
const i = (key: string, label: string, def: number, min: number, max: number): Field => ({ key, label, kind: 'int', def, min, max });
const DEMO_SVG = '<svg viewBox="0 0 100 100"><path fill="#e5484d" d="M50 90 C-20 45 15 0 50 30 C85 0 120 45 50 90Z"/><circle cx="33" cy="38" r="9" fill="#ffffff"/></svg>';
const svg: Field = { key: 'svg', label: 'SVG', kind: 'svg', def: DEMO_SVG };
const text = (d: string): Field => ({ key: 'text', label: 'Yazı', kind: 'text', def: d });
const style: Field = { key: 'style', label: 'Balon biçimi', kind: 'select', def: 'flat', options: [['flat', 'Altı düz (desteksiz)'], ['both', 'İki yüzü şişkin']] };
const balloon = [n('height', 'Şişkinlik (mm)', 8, 0.2, 300), n('base', 'Kenar kalınlığı (mm)', 1, 0.2, 100), i('detail', 'Detay', 90, 20, 250), style];

export const SHAPES: Record<string, { label: string; fields: Field[]; color: string }> = {
  box: { label: 'Kutu', color: '#4f8cff', fields: [n('w', 'Genişlik', 20), n('d', 'Derinlik', 20), n('h', 'Yükseklik', 20), n('r', 'Köşe yarıçapı', 0, 0)] },
  cylinder: { label: 'Silindir', color: '#f5a524', fields: [n('dia', 'Alt çap', 20, 0), n('top', 'Üst çap', 20, 0), n('h', 'Yükseklik', 20), i('seg', 'Pürüzsüzlük', 64, 3, 256)] },
  sphere: { label: 'Küre', color: '#e5484d', fields: [n('dia', 'Çap', 20), i('seg', 'Pürüzsüzlük', 64, 8, 256)] },
  tube: { label: 'Boru', color: '#30a46c', fields: [n('dia', 'Dış çap', 20), n('inner', 'İç çap', 14), n('h', 'Yükseklik', 20), i('seg', 'Pürüzsüzlük', 64, 3, 256)] },
  gear: { label: 'Dişli', color: '#8e8c99', fields: [n('module', 'Modül', 1.5, 0.3, 20), i('teeth', 'Diş sayısı', 24, 6, 200), n('h', 'Kalınlık', 8), n('bore', 'Mil deliği', 5, 0), n('angle', 'Basınç açısı', 20, 14, 30), n('backlash', 'Boşluk', '=tolerans', 0, 2)] },
  text: { label: 'Yazı', color: '#9b5de5', fields: [text('Merhaba'), n('size', 'Harf boyu', 20), n('h', 'Yükseklik', 4)] },
  svg: { label: 'SVG', color: '', fields: [svg, n('width', 'Genişlik', 50), n('h', 'Yükseklik', 3), n('step', 'Renk başına yükselme', 0, 0, 50)] },
  balloonText: { label: 'Balon yazı', color: '#f4a6c8', fields: [text('Baloş'), n('size', 'Harf boyu', 30), ...balloon] },
  balloonSvg: { label: 'Balon SVG', color: '', fields: [svg, n('width', 'Genişlik', 60), ...balloon] },
};
