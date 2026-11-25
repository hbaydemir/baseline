import { EFFECTS, SHAPES, type Field } from '../src/core/shapes';
import { PRINTERS } from '../src/core/export';
const fields = (fs: Field[]) => Object.fromEntries(fs.map(f => [f.key, f.kind === 'svg' ? 'SVG metni' : f.kind === 'asset' ? 'import aracı doldurur' : f.kind === 'font' ? 'sistem fontu: "Aile|Stil" (ör. "Arial|Bold"), boş = Baloo 2' : f.options ? { options: f.options.map(o => o[0]), default: f.def, note: f.label } : { default: f.def, min: f.min, max: f.max, note: f.label }]));
export const schema = () => ({
  units: 'mm, derece. Z yukarı. Şekiller XY ortalı, altları z=0. Sayılar "=formül" olabilir: "=kalinlik*2". Dönüş sırası X, Y, Z.',
  shapes: Object.fromEntries(Object.entries(SHAPES).map(([k, x]) => [k, { label: x.label, params: fields(x.fields) }])),
  effects: Object.fromEntries(Object.entries(EFFECTS).filter(([, e]) => !e.hidden).map(([k, e]) => [k, { label: e.label, hint: e.hint, ...(e.profileOnly ? { only: 'text, svg, polygon, star, heart, slice' } : {}), params: fields(e.fields) }])),
  commands: [
    '{op:"add",type,id?,name?,params?,pos?:[x,y,z],rot?,scale?,color?:"#rrggbb",hole?:bool}',
    '{op:"update",id,params?,pos?,rot?,scale?,color?,hole?,hidden?,name?}  svg renkleri için color:""',
    'add/update ayrıca: effects:[{type,params}] (sırayla uygulanır, listenin tamamını verir) ve paint:[{pts:[[x,y,z]],n:[x,y,z],r,color}] (r=0 tıklanan yüz, r>0 fırça; nesne koordinatında)',
    '{op:"replace",id,type,params?,effects?}  konumu koruyup şekli değiştirir',
    '{op:"move",id,d:[dx,dy,dz]}  göreli taşı',
    '{op:"split",id,params?}  nesneyi bölme grubuna sarar; params: tiltX, tiltY (°), at (mm, ortadan), joint: pin|snap|flat, count, dia, depth, margin, gap, layout: explode|print|closed, pins: "[[u,v,çap],...]" elle kilit yeri. Ayarı değiştirmek için update params',
    '{op:"remove",ids:[...]}',
    '{op:"group",ids:[...],mode:"linked"|"fused",id?}  linked: ayrı parça, birlikte hareket; fused: kaynaşır. hole:true çocuklar diğerlerinden çıkarılır',
    '{op:"ungroup",id} {op:"setMode",id,mode} {op:"duplicate",id,newId?,offset?}',
    '{op:"setParam",name,value|null}  belge parametresi',
    '{op:"place",id,on:"plate"|başkaId,side?:"top|bottom|left|right|front|back|center",gap?}',
  ],
  printers: PRINTERS.map(p => p.id),
  fonts: 'text.params.font: "Aile|Stil" (bilgisayarda kurulu font). Boş: Baloo 2',
});
