import type { Num } from './expr';
export interface Field { key: string; label: string; kind: 'num' | 'int' | 'text' | 'svg' | 'select' | 'asset' | 'data'; def: Num; min?: number; max?: number; options?: [string, string][]; group?: 'edge' }
const n = (key: string, label: string, def: Num, min = 0.1, max = 2000): Field => ({ key, label, kind: 'num', def, min, max });
const i = (key: string, label: string, def: number, min: number, max: number): Field => ({ key, label, kind: 'int', def, min, max });
const sel = (key: string, label: string, options: [string, string][]): Field => ({ key, label, kind: 'select', def: options[0][0], options });
const text = (d: string): Field => ({ key: 'text', label: 'Yazı', kind: 'text', def: d });
const E = (f: Field): Field => ({ ...f, group: 'edge' });
const BEVEL: [string, string][] = [['chamfer', 'Düz pah'], ['round', 'Yuvarlak']];
const corner = [E(n('corner', 'Tüm köşelere pah (mm)', 0, 0, 200)), E(sel('cornerStyle', 'Köşe biçimi', BEVEL))];
const edge = [E(n('edge', 'Kenar pahı (mm)', 0, 0, 200)), E(sel('edgeStyle', 'Kenar biçimi', BEVEL))];
const seg = i('seg', 'Pürüzsüzlük', 64, 3, 256), h = (d = 20) => n('h', 'Yükseklik', d);
const gap = n('gap', 'Boşluk (tolerans)', '=tolerans', 0, 3);
export const METRIC: Record<string, { d: number; pitch: number; af: number; nut: number; head: number; headH: number }> = {
  m2: { d: 2, pitch: 0.4, af: 4, nut: 1.6, head: 3.8, headH: 2 }, 'm2.5': { d: 2.5, pitch: 0.45, af: 5, nut: 2, head: 4.5, headH: 2.5 }, m3: { d: 3, pitch: 0.5, af: 5.5, nut: 2.4, head: 5.5, headH: 3 }, m4: { d: 4, pitch: 0.7, af: 7, nut: 3.2, head: 7, headH: 4 },
  m5: { d: 5, pitch: 0.8, af: 8, nut: 4.7, head: 8.5, headH: 5 }, m6: { d: 6, pitch: 1, af: 10, nut: 5.2, head: 10, headH: 6 }, m8: { d: 8, pitch: 1.25, af: 13, nut: 6.8, head: 13, headH: 8 }, m10: { d: 10, pitch: 1.5, af: 16, nut: 8.4, head: 16, headH: 10 }, m12: { d: 12, pitch: 1.75, af: 18, nut: 10.8, head: 18, headH: 12 },
};
const metric = (d: string): Field => ({ ...sel('size', 'Vida ölçüsü', Object.keys(METRIC).map(k => [k, k.toUpperCase()])), def: d });
const layout = sel('layout', 'Yerleşim', [['side', 'Yan yana (baskı için)'], ['together', 'Takılı hâli']]);

export interface Shape { label: string; cat: 'basic' | 'mech' | 'hidden'; fields: Field[]; color: string; hole?: boolean; profile?: boolean }
const P = true;
export const SHAPES: Record<string, Shape> = {
  box: { label: 'Kutu', cat: 'basic', color: '#4f8cff', fields: [n('w', 'Genişlik (X)', 20), n('d', 'Derinlik (Y)', 20), h(), E(n('r', 'Dikey köşe yarıçapı', 0, 0)), ...edge] },
  cylinder: { label: 'Silindir', cat: 'basic', color: '#f5a524', fields: [n('dia', 'Alt çap', 20, 0), n('top', 'Üst çap', 20, 0), h(), seg, ...edge] },
  sphere: { label: 'Küre', cat: 'basic', color: '#e5484d', fields: [n('dia', 'Çap', 20), i('seg', 'Pürüzsüzlük', 64, 8, 256)] },
  hemisphere: { label: 'Yarım küre', cat: 'basic', color: '#e5484d', fields: [n('dia', 'Çap', 20), seg] },
  cone: { label: 'Koni', cat: 'basic', color: '#9b5de5', fields: [n('dia', 'Taban çapı', 20), n('top', 'Tepe çapı', 0, 0), h(), seg, ...edge] },
  pyramid: { label: 'Piramit', cat: 'basic', color: '#f7d94c', fields: [i('sides', 'Kenar sayısı', 4, 3, 32), n('w', 'Taban genişliği', 20), n('top', 'Tepe genişliği', 0, 0), h()] },
  roof: { label: 'Çatı', cat: 'basic', color: '#30a46c', fields: [n('w', 'Genişlik (X)', 20), n('d', 'Uzunluk (Y)', 20), h(14), n('ridge', 'Sırt genişliği', 0, 0)] },
  roundRoof: { label: 'Yuvarlak çatı', cat: 'basic', color: '#00b8d4', fields: [n('w', 'Genişlik (X)', 20), n('d', 'Uzunluk (Y)', 20), h(12), seg] },
  torus: { label: 'Halka', cat: 'basic', color: '#00b8d4', fields: [n('dia', 'Dış çap', 24), n('tube', 'Halka kalınlığı', 5), seg, i('tubeSeg', 'Kesit pürüzsüzlüğü', 32, 3, 128)] },
  ringFlat: { label: 'Yüzük halka', cat: 'basic', color: '#f5a524', fields: [n('inner', 'İç çap', 18), n('t', 'Et kalınlığı', 2.5), n('h', 'Genişlik (Z)', 6), n('wall', 'Kenarda et', 0.8, 0), seg] },
  tube: { label: 'Tüp', cat: 'basic', color: '#30a46c', fields: [n('dia', 'Dış çap', 20), n('inner', 'İç çap', 14), h(), seg, ...edge] },
  wedge: { label: 'Kama', cat: 'basic', color: '#8b5e3c', fields: [n('w', 'Genişlik (X)', 20), n('d', 'Derinlik (Y)', 20), h()] },
  slice: { label: 'Dilim', cat: 'basic', color: '#f4a6c8', profile: P, fields: [n('dia', 'Çap', 30), n('inner', 'İç çap', 0, 0), n('angle', 'Açı (°)', 60, 1, 359), h(8), seg, ...corner] },
  polygon: { label: 'Poligon', cat: 'basic', color: '#4f8cff', profile: P, fields: [i('sides', 'Kenar sayısı', 6, 3, 64), n('dia', 'Çap', 20), h(), ...corner] },
  icosa: { label: 'Yirmiyüzlü', cat: 'basic', color: '#e5484d', fields: [n('dia', 'Çap', 20)] },
  star: { label: 'Yıldız', cat: 'basic', color: '#f7d94c', profile: P, fields: [i('points', 'Uç sayısı', 5, 3, 40), n('dia', 'Dış çap', 30), n('inner', 'İç çap', 13), h(5), ...corner] },
  star3d: { label: 'Boyutlu yıldız', cat: 'basic', color: '#f5a524', fields: [i('points', 'Uç sayısı', 5, 3, 40), n('dia', 'Dış çap', 30), n('inner', 'İç çap', 12), n('h', 'Tepe yüksekliği', 6), n('base', 'Kenar kalınlığı', 0.6, 0), sel('both', 'Yüzler', [['one', 'Altı düz'], ['both', 'İki yüzü sivri']])] },
  heart: { label: 'Kalp', cat: 'basic', color: '#e5484d', profile: P, fields: [n('w', 'Genişlik', 25), h(5), ...corner] },
  dice: { label: 'Zar', cat: 'basic', color: '#ffffff', fields: [n('size', 'Kenar', 16), n('r', 'Köşe yuvarlama', 2.5, 0), sel('pips', 'Noktalar', [['yes', 'Var'], ['no', 'Yok']]), n('pip', 'Nokta çapı', 2.8), n('depth', 'Nokta derinliği', 0.8, 0.1, 10), i('seg', 'Pürüzsüzlük', 32, 8, 96)] },
  diamond: { label: 'Elmas', cat: 'basic', color: '#00b8d4', fields: [i('sides', 'Kenar sayısı', 8, 4, 32), n('dia', 'Çap', 24), n('table', 'Üst tabla çapı', 14, 0), n('crown', 'Üst yükseklik', 5), n('pav', 'Alt yükseklik', 13)] },
  paraboloid: { label: 'Paraboloit', cat: 'basic', color: '#9b5de5', fields: [n('dia', 'Taban çapı', 20), h(), seg] },
  text: { label: 'Yazı', cat: 'basic', color: '#9b5de5', profile: P, fields: [text('Merhaba'), n('size', 'Harf boyu', 20), n('h', 'Yükseklik', 4), ...corner] },
  svg: { label: 'SVG', cat: 'hidden', color: '', profile: P, fields: [{ key: 'svg', label: 'SVG', kind: 'svg', def: '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#4f8cff"/></svg>' }, n('width', 'Genişlik (0 = çizimdeki ölçü)', 50, 0), n('h', 'Yükseklik', 3), n('step', 'Renk başına yükselme', 0, 0, 50), ...corner] },
  mesh: { label: 'Model', cat: 'hidden', color: '', fields: [{ key: 'asset', label: 'Veri', kind: 'asset', def: '' }] },

  gear: { label: 'Dişli', cat: 'mech', color: '#8e8c99', fields: [n('module', 'Modül', 1.5, 0.3, 20), i('teeth', 'Diş sayısı', 24, 6, 200), n('h', 'Kalınlık', 8), n('bore', 'Mil deliği', 5, 0), n('angle', 'Basınç açısı', 20, 14, 30), n('backlash', 'Boşluk', '=tolerans', 0, 2)] },
  gearPair: { label: 'Eş dişli', cat: 'mech', color: '#8e8c99', fields: [n('module', 'Modül', 1.5, 0.3, 20), i('t1', '1. diş sayısı', 16, 6, 200), i('t2', '2. diş sayısı', 32, 6, 200), n('h', 'Kalınlık', 8), n('b1', '1. mil deliği', 5, 0), n('b2', '2. mil deliği', 5, 0), n('angle', 'Basınç açısı', 20, 14, 30), n('backlash', 'Boşluk', '=tolerans', 0, 2)] },
  hinge: { label: 'Menteşe', cat: 'mech', color: '#30a46c', fields: [n('w', 'Genişlik (X)', 50, 8), n('leaf', 'Kanat uzunluğu', 20, 2), n('t', 'Kanat kalınlığı', 3), n('dia', 'Boğum çapı', 8, 4), i('knuckles', 'Boğum sayısı (tek)', 5, 3, 31), n('gap', 'Boşluk', 0.35, 0.1, 2), i('holes', 'Kanat başına vida deliği', 2, 0, 10), n('hole', 'Vida deliği çapı', 4, 0.5)] },
  rail: { label: 'Ray / sürgü', cat: 'mech', color: '#4f8cff', fields: [n('len', 'Ray uzunluğu', 80), n('slide', 'Sürgü uzunluğu', 30), n('w', 'Ray genişliği', 14, 3), n('h', 'Ray yüksekliği', 6, 1), n('angle', 'Yan eğim (°)', 25, 5, 45), n('wall', 'Sürgü et kalınlığı', 3), n('base', 'Ray tabanı', 2, 0), gap, sel('show', 'Parçalar', [['both', 'İkisi'], ['rail', 'Yalnız ray'], ['slide', 'Yalnız sürgü']]), layout] },
  boxLid: { label: 'Kapaklı kutu', cat: 'mech', color: '#f5a524', fields: [n('w', 'Dış genişlik (X)', 60, 5), n('d', 'Dış derinlik (Y)', 40, 5), n('h', 'Gövde yüksekliği', 30, 3), n('wall', 'Duvar', 2, 0.4), n('r', 'Köşe yarıçapı', 5, 0), n('lid', 'Kapak kalınlığı', 2, 0.4), n('lip', 'Kapak dili', 5, 0.5), gap, sel('show', 'Parçalar', [['both', 'İkisi'], ['box', 'Yalnız kutu'], ['lid', 'Yalnız kapak']]), layout] },
  bolt: { label: 'Vida', cat: 'mech', color: '#8e8c99', fields: [metric('m8'), n('len', 'Diş boyu', 20, 1, 300), sel('head', 'Baş', [['hex', 'Altıgen'], ['round', 'Silindir (alyan)'], ['none', 'Başsız']]), gap] },
  nut: { label: 'Somun', cat: 'mech', color: '#8e8c99', fields: [metric('m8'), n('scaleH', 'Kalınlık çarpanı', 1, 0.3, 5), gap] },
  screwHole: { label: 'Vida yuvası', cat: 'mech', color: '#7c8794', hole: true, fields: [metric('m3'), n('depth', 'Delik derinliği', 20, 0.5), sel('head', 'Baş yuvası', [['round', 'Silindir baş'], ['sink', 'Havşa'], ['none', 'Yok']]), gap] },
  nutPocket: { label: 'Somun yuvası', cat: 'mech', color: '#7c8794', hole: true, fields: [metric('m3'), n('extra', 'Ek derinlik', 0.3, 0, 100), n('slot', 'Yandan kanal boyu', 0, 0, 200), n('through', 'Vida deliği boyu', 10, 0), gap] },
  insertHole: { label: 'Isıtmalı insert', cat: 'mech', color: '#7c8794', hole: true, fields: [n('dia', 'Delik çapı', 4), n('depth', 'Derinlik', 6), n('lead', 'Giriş pahı', 0.5, 0)] },
  tolTest: { label: 'Tolerans testi', cat: 'mech', color: '#9b5de5', fields: [i('count', 'Adet', 5, 1, 10), n('from', 'İlk boşluk', 0.1, 0.02, 2), n('step', 'Artış', 0.1, 0.01, 1), n('dia', 'Pim çapı', 10, 4), n('h', 'Kalınlık', 8, 4)] },
};

export interface Effect { label: string; hint: string; fields: Field[]; profileOnly?: boolean; hidden?: boolean }
export const EFFECTS: Record<string, Effect> = {
  balloon: { label: 'Balon', hint: 'Şekli folyo balon gibi şişirir', fields: [n('height', 'Şişkinlik (mm)', 8, 0.2, 300), n('base', 'Kenar kalınlığı (mm)', 1, 0.2, 100), i('detail', 'Detay', 90, 20, 250), sel('style', 'Biçim', [['flat', 'Altı düz (desteksiz)'], ['both', 'İki yüzü şişkin']])] },
  bevel: { label: 'Üst / alt kenar pahı', hint: 'Yükseltilmiş şeklin üst ve alt kenarını kırar', profileOnly: true, fields: [n('top', 'Üst kenar (mm)', 1, 0, 100), n('bottom', 'Alt kenar (mm)', 0, 0, 100), sel('style', 'Biçim', BEVEL)] },
  twist: { label: 'Burgu', hint: 'Yukarı çıktıkça döndürür', fields: [n('angle', 'Toplam açı (°)', 90, -3600, 3600)] },
  taper: { label: 'Daralt', hint: 'Üstü altından küçük ya da büyük yapar', fields: [n('top', 'Üst ölçek (%)', 50, 1, 400)] },
  bend: { label: 'Bük', hint: 'X boyunca yay gibi kıvırır', fields: [n('angle', 'Açı (°)', 90, 1, 340)] },
  wave: { label: 'Dalga', hint: 'Yüzeyi X boyunca dalgalandırır', fields: [n('amp', 'Dalga yüksekliği', 2, 0.1, 100), n('len', 'Dalga boyu', 20, 1, 500)] },
  cut: { label: 'Düzlemle kes', hint: 'Modelin bir yanını atar', fields: [sel('axis', 'Yön', [['z', 'Z (yatay kesim)'], ['x', 'X'], ['y', 'Y']]), n('at', 'Kesim yeri (%)', 50, 0, 100), sel('keep', 'Kalan', [['low', 'Alt / sol / ön'], ['high', 'Üst / sağ / arka']])] },
  simplify: { label: 'Sadeleştir', hint: 'Üçgen sayısını azaltır', fields: [n('tol', 'İzin verilen sapma (mm)', 0.05, 0.001, 20)] },
  conform: { label: 'Yüzeye oturt', hint: 'Seçilen eğri yüzeye uydurur', hidden: true, fields: [{ key: 'grid', label: 'Yüzey', kind: 'data', def: '' }] },
};
