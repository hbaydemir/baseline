import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { applyFile, docPath, exportFile, kernel, load, render, summary } from './node';
import { schema } from './help';
import type { Command } from '../src/core/doc';

const [cmd, ...a] = process.argv.slice(2);
const print = (x: unknown) => console.log(JSON.stringify(x, null, 2));
try {
  if (cmd === 'schema') print(schema());
  else if (cmd === 'info') print(summary((await kernel()).build(load(docPath(a[0])))));
  else if (cmd === 'apply') print(await applyFile(docPath(a[0]), JSON.parse(readFileSync(a[1] && a[1] !== '-' ? a[1] : 0, 'utf8')) as Command[]));
  else if (cmd === 'export') print(await exportFile(docPath(a[0]), a[1], a[2]));
  else if (cmd === 'render') { writeFileSync(a[1], render((await kernel()).build(load(docPath(a[0]))), 800, 600, a[2] ? +a[2] : undefined, a[3] ? +a[3] : undefined)); print(a[1]); }
  else if (cmd === 'run') { // betik: export default (args) => Command[]
    const m = await import(pathToFileURL(resolve(a[1])).href);
    print(await applyFile(docPath(a[0]), await m.default(a.slice(2))));
  } else console.log(`baseline <komut>
  schema                              şekiller ve komutlar
  info   <dosya>                      ölçü, hacim, hata
  apply  <dosya> <komutlar.json | ->  komut uygula (dosya yoksa oluşturur)
  run    <dosya> <betik.mjs> [...]    komut üreten JavaScript çalıştır
  export <dosya> <cikti.3mf|stl|obj> [yazıcı]
  render <dosya> <cikti.png> [yatay°] [dikey°]`);
} catch (e) { console.error('Hata: ' + (e as Error).message); process.exitCode = 1; }
