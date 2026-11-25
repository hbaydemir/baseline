// Hazır şablonlar: komut listesinden üretilen belgeler. Ölçüler belge değişkenleriyle değiştirilebilir.
import { apply, newDoc, type Command, type Doc } from './doc';

export interface Template { id: string; name: string; hint: string; cat: string; cmds: Command[] }
export const TEMPLATES: Template[] = [
  { id: 'keychain', cat: 'Hediye', name: 'İsimli anahtarlık', hint: 'Yuvarlak köşeli plaka, halka deliği, iki renkli yazı', cmds: [
    { op: 'setParam', name: 'kalinlik', value: 3 },
    { op: 'add', type: 'box', id: 'plaka', name: 'Plaka', params: { w: 60, d: 22, h: '=kalinlik', r: 6, edge: 0.6, edgeStyle: 'round' }, color: '#222222' },
    { op: 'add', type: 'cylinder', id: 'delik', name: 'Halka deliği', params: { dia: 5, top: 5, h: 20 }, pos: [-23, 0, -5], hole: true },
    { op: 'add', type: 'text', id: 'yazi', name: 'Yazı', params: { text: 'Baseline', size: 10, h: 1 }, pos: [5, 0, '=kalinlik'], color: '#ffffff' },
    { op: 'group', ids: ['plaka', 'delik', 'yazi'], mode: 'fused', name: 'Anahtarlık' }] },
  { id: 'balloon', cat: 'Hediye', name: 'Balon yazı', hint: 'Desteksiz basılan şişkin harfler', cmds: [
    { op: 'add', type: 'text', name: 'Balon yazı', params: { text: 'Baloş', size: 30 }, effects: [{ type: 'balloon', params: { height: 8 } }], color: '#f4a6c8' }] },
  { id: 'nameplate', cat: 'Ev', name: 'Masa isimliği', hint: 'Eğik ön yüzlü isimlik', cmds: [
    { op: 'add', type: 'wedge', id: 'govde', name: 'Gövde', params: { w: 120, d: 30, h: 30 }, color: '#ffffff' },
    { op: 'add', type: 'text', id: 'isim', name: 'İsim', params: { text: 'Ad Soyad', size: 12, h: 1.2 }, rot: [45, 0, 0], pos: [0, 0.2, 14.8], color: '#222222' },
    { op: 'group', ids: ['govde', 'isim'], mode: 'fused', name: 'İsimlik' }] },
  { id: 'box', cat: 'Ev', name: 'Kapaklı kutu', hint: 'Geçmeli kapaklı saklama kutusu', cmds: [{ op: 'add', type: 'boxLid', name: 'Kutu', params: { w: 80, d: 60, h: 35 } }] },
  { id: 'coaster', cat: 'Ev', name: 'Bardak altlığı', hint: 'Desenli, iki renkli altlık', cmds: [
    { op: 'add', type: 'cylinder', id: 'taban', name: 'Taban', params: { dia: 95, top: 95, h: 4, edge: 0.8, edgeStyle: 'round' }, color: '#8b5e3c' },
    { op: 'add', type: 'star', id: 'desen', name: 'Desen', params: { points: 8, dia: 70, inner: 40, h: 0.8, corner: 2, cornerStyle: 'round' }, pos: [0, 0, 3.4], color: '#f7d94c' },
    { op: 'group', ids: ['taban', 'desen'], mode: 'fused', name: 'Altlık' }] },
  { id: 'pencil', cat: 'Ev', name: 'Kalemlik', hint: 'Burgulu altıgen kalemlik', cmds: [
    { op: 'add', type: 'polygon', id: 'dis', name: 'Gövde', params: { sides: 6, dia: 80, h: 100, corner: 4, cornerStyle: 'round' }, effects: [{ type: 'twist', params: { angle: 60 } }], color: '#4f8cff' },
    { op: 'add', type: 'polygon', id: 'ic', name: 'İç', params: { sides: 6, dia: 72, h: 100, corner: 3, cornerStyle: 'round' }, effects: [{ type: 'twist', params: { angle: 60 } }], pos: [0, 0, 2.5], hole: true },
    { op: 'group', ids: ['dis', 'ic'], mode: 'fused', name: 'Kalemlik' }] },
  { id: 'pedestal', cat: 'Kaide', name: 'Yuvarlak kaide', hint: 'Figürler için basamaklı kaide', cmds: [
    { op: 'add', type: 'cylinder', id: 'k1', name: 'Alt', params: { dia: 70, top: 64, h: 6, edge: 1, edgeStyle: 'round' }, color: '#222222' },
    { op: 'add', type: 'cylinder', id: 'k2', name: 'Üst', params: { dia: 56, top: 54, h: 4, edge: 0.8, edgeStyle: 'round' }, pos: [0, 0, 6], color: '#222222' },
    { op: 'group', ids: ['k1', 'k2'], mode: 'fused', name: 'Kaide' }] },
  { id: 'hexbase', cat: 'Kaide', name: 'Altıgen kaide', hint: 'Pahlı altıgen taban', cmds: [
    { op: 'add', type: 'polygon', name: 'Kaide', params: { sides: 6, dia: 60, h: 8 }, effects: [{ type: 'bevel', params: { top: 1.5, bottom: 0.4 } }], color: '#8e8c99' }] },
  { id: 'hook', cat: 'Ev', name: 'Duvar askısı', hint: 'Vida delikli askı', cmds: [
    { op: 'add', type: 'box', id: 'arka', name: 'Arka plaka', params: { w: 24, d: 4, h: 50, r: 0, edge: 0.8 }, color: '#30a46c' },
    { op: 'add', type: 'slice', id: 'kanca', name: 'Kanca', params: { dia: 34, inner: 22, angle: 180, h: 12 }, rot: [0, 90, 0], pos: [6, -16, 18], color: '#30a46c' },
    { op: 'add', type: 'screwHole', id: 'v1', params: { size: 'm4', depth: 4, head: 'sink' }, rot: [90, 0, 0], pos: [0, 2, 42] },
    { op: 'group', ids: ['arka', 'kanca', 'v1'], mode: 'fused', name: 'Askı' }] },
  { id: 'gears', cat: 'Mekanik', name: 'Dişli seti', hint: 'Doğru aralıkla yerleşmiş eş dişliler', cmds: [{ op: 'add', type: 'gearPair', name: 'Dişliler' }] },
  { id: 'hinge', cat: 'Mekanik', name: 'Yerinde basılan menteşe', hint: 'Montajsız dönen menteşe', cmds: [{ op: 'add', type: 'hinge', name: 'Menteşe' }] },
  { id: 'tol', cat: 'Mekanik', name: 'Tolerans testi', hint: 'Yazıcının geçme boşluğunu bul', cmds: [{ op: 'add', type: 'tolTest', name: 'Tolerans testi' }] },
];
export function templateDoc(t: Template): Doc { return apply(newDoc(), t.cmds).doc; }
