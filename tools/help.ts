import { SHAPES } from '../src/core/shapes';
import { PRINTERS } from '../src/core/export';
export const schema = () => ({
  units: 'mm, derece. Z yukarı. Şekiller XY ortalı, altları z=0. Sayılar "=formül" olabilir: "=kalinlik*2". Dönüş sırası X, Y, Z.',
  shapes: Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, { label: s.label, params: Object.fromEntries(s.fields.map(f => [f.key, f.kind === 'svg' ? 'SVG metni' : f.options ? { options: f.options.map(o => o[0]), default: f.def } : { default: f.def, min: f.min, max: f.max, note: f.label }])) }])),
  commands: [
    '{op:"add",type,id?,name?,params?,pos?:[x,y,z],rot?,scale?,color?:"#rrggbb",hole?:bool}',
    '{op:"update",id,params?,pos?,rot?,scale?,color?,hole?,hidden?,name?}  svg renkleri için color:""',
    '{op:"remove",ids:[...]}',
    '{op:"group",ids:[...],mode:"linked"|"fused",id?}  linked: ayrı parça, birlikte hareket; fused: kaynaşır. hole:true çocuklar diğerlerinden çıkarılır',
    '{op:"ungroup",id} {op:"setMode",id,mode} {op:"duplicate",id,newId?,offset?}',
    '{op:"setParam",name,value|null}  belge parametresi',
    '{op:"place",id,on:"plate"|başkaId,side?:"top|bottom|left|right|front|back|center",gap?}',
  ],
  printers: PRINTERS.map(p => p.id),
});
