// Renkler: '#rrggbb' (RGB) ya da 'cmyk(c,m,y,k)' (0–100). Ekranda her zaman hex'e çevrilir.
export type Mode = 'rgb' | 'cmyk';
export type CMYK = [number, number, number, number];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const h2 = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');

export const isCmyk = (c: string | null | undefined) => !!c && c.startsWith('cmyk(');
export function parseCmyk(c: string): CMYK { const m = c.match(/-?[\d.]+/g)?.map(Number) ?? []; return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 0].map(v => clamp(v, 0, 100)) as CMYK; }
export const fmtCmyk = (v: CMYK) => `cmyk(${v.map(x => Math.round(x)).join(',')})`;

export function rgbOf(c: string): [number, number, number] {
  if (isCmyk(c)) { const [C, M, Y, K] = parseCmyk(c).map(v => v / 100); return [255 * (1 - C) * (1 - K), 255 * (1 - M) * (1 - K), 255 * (1 - Y) * (1 - K)]; }
  let h = c.replace('#', ''); if (h.length === 3) h = [...h].map(x => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16); return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}
export const hexOf = (r: number, g: number, b: number) => `#${h2(r)}${h2(g)}${h2(b)}`;
/** Ekran rengi (hex). */
export const css = (c: string | null | undefined): string => !c ? 'none' : isCmyk(c) ? hexOf(...rgbOf(c)) : c;
export function toCmyk(c: string): string {
  if (isCmyk(c)) return c;
  const [r, g, b] = rgbOf(c).map(v => v / 255), k = 1 - Math.max(r, g, b);
  if (k >= 1) return fmtCmyk([0, 0, 0, 100]);
  return fmtCmyk([(1 - r - k) / (1 - k) * 100, (1 - g - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100]);
}
export const toRgb = (c: string) => isCmyk(c) ? css(c) : c;
export const convert = (c: string | null, m: Mode) => c === null ? null : m === 'cmyk' ? toCmyk(c) : toRgb(c);

// HSV ↔ RGB (renk seçici için)
export function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5) * 255, f(3) * 255, f(1) * 255];
}
export function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
}
export const mix = (a: string, b: string, t: number) => { const p = rgbOf(a), q = rgbOf(b); return hexOf(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t); };

export const PAL_RGB = ['#000000', '#ffffff', '#7f7f7f', '#c8c8c8', '#e5484d', '#ff7a00', '#f7d94c', '#30a46c', '#00b8d4', '#1677ff', '#2c2c9c', '#9b5de5', '#f4a6c8', '#8b5e3c', '#00ff00', '#ff00ff'];
export const PAL_CMYK = ['cmyk(0,0,0,100)', 'cmyk(0,0,0,0)', 'cmyk(0,0,0,50)', 'cmyk(0,0,0,20)', 'cmyk(0,100,100,0)', 'cmyk(0,60,100,0)', 'cmyk(0,0,100,0)', 'cmyk(100,0,100,0)', 'cmyk(100,0,0,0)', 'cmyk(100,50,0,0)', 'cmyk(100,100,0,0)', 'cmyk(40,80,0,0)', 'cmyk(0,40,0,0)', 'cmyk(0,50,80,40)', 'cmyk(0,100,0,0)', 'cmyk(60,0,60,20)'];
export const palette = (m: Mode) => m === 'cmyk' ? PAL_CMYK : PAL_RGB;
export const label = (c: string) => { if (!isCmyk(c)) return c.toUpperCase(); const [C, M, Y, K] = parseCmyk(c).map(Math.round); return `C${C} M${M} Y${Y} K${K}`; };
