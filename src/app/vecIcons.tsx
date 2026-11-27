/** Lucide'de olmayan, Corel'den tanıdık simgeler (24×24, lucide çizgi kalınlığında). */
import type { ReactNode } from 'react';

const Ico = ({ children, title }: { children: ReactNode; title?: string }) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" aria-hidden={title ? undefined : true}>{title && <title>{title}</title>}{children}</svg>;
// arkadaki (A) ve öndeki (B) kare
const A = 'M3 8h11v11H3z', B = 'M10 4h11v11H10z', AmB = 'M3 8h7v7h4v4H3z', BmA = 'M10 4h11v11h-7V8h-4z', U = 'M3 8h7V4h11v11h-7v4H3z', X = 'M10 8h4v7h-4z';
const fill = (d: string, o = 0.45) => <path d={d} fill="currentColor" fillOpacity={o} stroke="none" />;
const ghost = (d: string) => <path d={d} strokeDasharray="2 2" strokeWidth="1.3" opacity={0.7} />;

export const IcoCombine = () => <Ico><path d={`${A}${B}`} fill="currentColor" fillOpacity={0.45} fillRule="evenodd" /></Ico>;
export const IcoWeld = () => <Ico>{fill(U)}<path d={U} /></Ico>;
export const IcoTrim = () => <Ico>{fill(AmB)}<path d={AmB} /><path d={B} /></Ico>;
export const IcoIntersect = () => <Ico>{ghost(A)}{ghost(B)}{fill(X, 0.7)}<path d={X} /></Ico>;
export const IcoSimplify = () => <Ico>{fill(AmB, 0.25)}<path d={AmB} />{fill(B, 0.6)}<path d={B} /></Ico>;
export const IcoFrontMinusBack = () => <Ico>{ghost(A)}{fill(BmA)}<path d={BmA} /></Ico>;
export const IcoBackMinusFront = () => <Ico>{fill(AmB)}<path d={AmB} />{ghost(B)}</Ico>;
export const IcoBoundary = () => <Ico>{ghost(A)}{ghost(B)}<path d={U} strokeWidth="2.2" /></Ico>;

// kontür
export const IcoContourOut = () => <Ico><rect x="8" y="8" width="8" height="8" rx="0.5" fill="currentColor" fillOpacity={0.45} /><rect x="4" y="4" width="16" height="16" rx="3" strokeDasharray="2.5 2" /></Ico>;
export const IcoContourIn = () => <Ico><rect x="3.5" y="3.5" width="17" height="17" rx="0.5" fill="currentColor" fillOpacity={0.45} /><rect x="8" y="8" width="8" height="8" rx="0.5" strokeDasharray="2.5 2" /></Ico>;
export const IcoJoinMiter = () => <Ico><path d="M4 20V4h16" strokeWidth="5" strokeLinejoin="miter" strokeLinecap="butt" opacity={0.35} /><path d="M4 20V4h16" strokeWidth="1.4" /></Ico>;
export const IcoJoinRound = () => <Ico><path d="M4 20V4h16" strokeWidth="5" strokeLinejoin="round" strokeLinecap="butt" opacity={0.35} /><path d="M4 20V4h16" strokeWidth="1.4" /></Ico>;
export const IcoJoinBevel = () => <Ico><path d="M4 20V4h16" strokeWidth="5" strokeLinejoin="bevel" strokeLinecap="butt" opacity={0.35} /><path d="M4 20V4h16" strokeWidth="1.4" /></Ico>;
export const IcoOffset = () => <Ico><path d="M4 12h16M4 8v8M20 8v8" /><path d="M7 12l-2-2M7 12l-2 2M17 12l2-2M17 12l2 2" /></Ico>;
export const IcoSteps = () => <Ico><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="10" height="10" rx="1.5" /><rect x="10.5" y="10.5" width="3" height="3" rx="0.5" /></Ico>;

// efekt araçları
export const IcoShadow = () => <Ico><rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" fillOpacity={0.3} stroke="none" /><rect x="4" y="4" width="12" height="12" rx="2" /></Ico>;
export const IcoShadowFlat = () => <Ico><rect x="7.5" y="9" width="12" height="11" rx="1.5" fill="currentColor" fillOpacity={0.3} stroke="none" /><rect x="4" y="5" width="12" height="11" rx="1.5" /></Ico>;
export const IcoShadowPersp = () => <Ico><path d="M6 20h10l6-5H12z" fill="currentColor" fillOpacity={0.3} stroke="none" /><rect x="6" y="5" width="10" height="15" rx="1.5" /></Ico>;
export const IcoInner = () => <Ico><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4.9 9V6a1.1 1.1 0 0 1 1.1-1.1h12" strokeWidth="4" opacity={0.3} /></Ico>;
export const IcoBlock = () => <Ico><path d="M4 4h11v11H4zM15 4l5 5v11H9l-5-5" fill="currentColor" fillOpacity={0.3} stroke="none" /><path d="M15 4l5 5v11H9l-5-5M15 15l5 5" /><rect x="4" y="4" width="11" height="11" /></Ico>;
export const IcoEnvelope = () => <Ico><path d="M4 6q8-4 16 0v12q-8-4-16 0z" /><path d="M7 10.5q5-2 10 0M7 14q5-2 10 0" opacity={0.6} /></Ico>;
export const IcoDistort = () => <Ico><path d="M12 3c1.5 4 4 3.5 8 5-3 2.5-2 5-1 9-3.5-1-5.5 0-7 4-1.5-4-3.5-5-7-4 1-4 2-6.5-1-9 4-1.5 6.5-1 8-5z" /></Ico>;
export const IcoTransp = () => <Ico><defs><linearGradient id="icoTg" x1="0" x2="1"><stop offset="0" stopColor="currentColor" stopOpacity={0.75} /><stop offset="1" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs><rect x="4" y="4" width="16" height="16" rx="2" fill="url(#icoTg)" /></Ico>;
export const IcoBlend = () => <Ico><circle cx="5.5" cy="12" r="3.2" fill="currentColor" fillOpacity={0.5} /><circle cx="10" cy="12" r="2.8" opacity={0.75} /><circle cx="14" cy="12" r="2.6" opacity={0.6} /><rect x="16.5" y="8.5" width="5" height="7" rx="1" fill="currentColor" fillOpacity={0.5} /></Ico>;
export const IcoPush = () => <Ico><path d="M12 3c2 5 4 7 9 9-5 2-7 4-9 9-2-5-4-7-9-9 5-2 7-4 9-9z" /></Ico>;
export const IcoZipper = () => <Ico><path d="M3 9l2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3M3 18l2-3 2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3" /></Ico>;
export const IcoTwist = () => <Ico><path d="M12 12m-1 0a1 1 0 1 0 2 0 3 3 0 1 0-6 0 5 5 0 1 0 10 0 7 7 0 1 0-14 0" /></Ico>;
// zarf kipleri
export const IcoEnvLine = () => <Ico><path d="M6 5l13 2-1 12-13-2z" /><circle cx="6" cy="5" r="1.4" fill="currentColor" /><circle cx="19" cy="7" r="1.4" fill="currentColor" /><circle cx="18" cy="19" r="1.4" fill="currentColor" /><circle cx="5" cy="17" r="1.4" fill="currentColor" /></Ico>;
export const IcoEnvArc = () => <Ico><path d="M4 8q8-6 16 0v10q-8-6-16 0z" /><circle cx="12" cy="5" r="1.4" fill="currentColor" /></Ico>;
export const IcoEnvDouble = () => <Ico><path d="M4 7q4-5 8 0t8 0v11q-4-5-8 0t-8 0z" /></Ico>;
export const IcoEnvFree = () => <Ico><path d="M4 7q6-6 16 1v10q-10 5-16 0z" /><path d="M4 7l4-4M20 8l1-5" strokeWidth="1.2" opacity={0.7} /><circle cx="8" cy="3" r="1.2" fill="currentColor" /><circle cx="21" cy="3" r="1.2" fill="currentColor" /></Ico>;

// fırça kipleri
export const IcoBrushPreset = () => <Ico><path d="M3 17c4-1 6-8 10-9s5 3 8 1c-2 4-5 5-8 6s-6 3-10 2z" fill="currentColor" fillOpacity={0.45} /></Ico>;
export const IcoCalli = () => <Ico><path d="M4 18c3-3 4-9 8-11 3-1 4 2 2 4-2 3-6 4-6 7 0 2 4 2 8-1" strokeWidth="1.3" /><path d="M15 4l5 5" strokeWidth="3" /></Ico>;
export const IcoPressure = () => <Ico><path d="M3 16c2 0 3-3 5-3s3 4 6 4 3-6 7-6" strokeWidth="1.2" /><path d="M3 16c2 0 3-3 5-3s3 4 6 4 3-6 7-6" strokeWidth="4" opacity={0.25} /><path d="M17 3l4 4-6 6-4-4z" /></Ico>;
export const IcoSpray = () => <Ico><circle cx="5" cy="17" r="2" fill="currentColor" /><path d="M10 11l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L7 13.3 9 13z" fill="currentColor" stroke="none" /><circle cx="16" cy="9" r="1.6" fill="currentColor" /><path d="M19 3l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z" fill="currentColor" stroke="none" /></Ico>;
