import { expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('paketlenmiş MCP sunucusu uçtan uca', async () => {
  const c = new Client({ name: 't', version: '1' }), file = join(mkdtempSync(join(tmpdir(), 'bl-')), 'a.baseline');
  await c.connect(new StdioClientTransport({ command: process.execPath, args: ['dist-tools/mcp.mjs'] }));
  const call = async (name: string, args: object = {}) => (await c.callTool({ name, arguments: args as any })) as any;
  expect((await c.listTools()).tools.map(t => t.name).sort()).toEqual(['apply', 'export', 'get', 'import', 'render', 'schema']);
  const r = await call('apply', { file, commands: [{ op: 'add', type: 'gear', id: 'd' }] });
  expect(r.isError, r.content[0].text).toBeFalsy(); expect(JSON.parse(r.content[0].text).created).toEqual(['d']);
  expect((await call('apply', { file, commands: [{ op: 'x' }] })).isError).toBe(true);
  expect((await call('render', { file })).content[0].type).toBe('image');
  const out = file.replace('.baseline', '.3mf'); await call('export', { file, out }); expect(existsSync(out)).toBe(true);
  await c.close();
}, 30000);
