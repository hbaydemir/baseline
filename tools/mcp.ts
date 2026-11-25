import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { applyFile, docPath, exportFile, kernel, load, render, summary } from './node';
import { schema } from './help';
import type { Command } from '../src/core/doc';

const s = new McpServer({ name: 'baseline', version: '0.1.0' });
const file = z.string().optional().describe('.baseline dosya yolu. Boşsa uygulamada açık olan belge kullanılır');
const wrap = async (f: () => Promise<unknown>) => {
  try { return { content: [{ type: 'text' as const, text: JSON.stringify(await f(), null, 1) }] }; }
  catch (e) { return { isError: true, content: [{ type: 'text' as const, text: 'Hata: ' + (e as Error).message }] }; }
};
s.registerTool('schema', { description: 'Baseline 3B modelleyici: tüm şekiller, parametreler ve komut biçimleri. Önce bunu oku.' }, () => wrap(async () => schema()));
s.registerTool('get', { description: 'Belgenin tarifi ile ölçü ve hata özeti', inputSchema: { file } }, a => wrap(async () => { const p = docPath(a.file), d = load(p); return { path: p, doc: d, ...summary((await kernel()).build(d)) }; }));
s.registerTool('apply', { description: 'Komutları sırayla uygular ve kaydeder (hata olursa hiçbiri uygulanmaz). Açık uygulama sonucu canlı gösterir.', inputSchema: { file, commands: z.array(z.object({ op: z.string() }).passthrough()) } }, a => wrap(() => applyFile(docPath(a.file), a.commands as unknown as Command[])));
s.registerTool('export', { description: '3MF (çok renkli), STL ya da OBJ dışa aktarır; biçimi uzantı belirler', inputSchema: { file, out: z.string(), printer: z.string().optional() } }, a => wrap(() => exportFile(docPath(a.file), a.out, a.printer)));
s.registerTool('render', { description: 'Modelin resmini döndürür', inputSchema: { file, azimuth: z.number().optional(), elevation: z.number().optional() } }, async a => {
  try { return { content: [{ type: 'image' as const, mimeType: 'image/png', data: render((await kernel()).build(load(docPath(a.file))), 800, 600, a.azimuth, a.elevation).toString('base64') }] }; }
  catch (e) { return { isError: true, content: [{ type: 'text' as const, text: 'Hata: ' + (e as Error).message }] }; }
});
await s.connect(new StdioServerTransport());
