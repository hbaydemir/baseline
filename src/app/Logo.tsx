// Marka logosu (geometri tools/brand.ts'ten gelir: src/app/brandData.ts).
import { BRAND, ICON, WORD } from './brandData';

/** Yazı logosu: yazı currentColor, tabla çizgisi turuncu. */
export function Wordmark({ height = 20, title = 'Baseline' }: { height?: number; title?: string }) {
  return <svg className="wordmark" viewBox={`0 0 ${WORD.w} ${WORD.h}`} height={height} width={height * WORD.w / WORD.h} role="img" aria-label={title}>
    <path d={WORD.text} fill="currentColor" /><path d={WORD.bar} fill={BRAND.orange} />
  </svg>;
}
/** Simge: mavi karo, beyaz b (ters: beyaz karo, mavi b). */
export function LogoIcon({ size = 32, inverse = false }: { size?: number; inverse?: boolean }) {
  return <svg className="logoicon" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Baseline">
    <path d={ICON.tile} fill={inverse ? '#fff' : BRAND.blue} /><path d={ICON.b} fill={inverse ? BRAND.blue : '#fff'} /><path d={ICON.bar} fill={BRAND.orange} />
  </svg>;
}
