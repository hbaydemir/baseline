import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const r = createRequire(import.meta.url);
mkdirSync('dist-tools', { recursive: true });
await build({ entryPoints: { mcp: 'tools/mcp.ts', cli: 'tools/cli.ts' }, bundle: true, platform: 'node', format: 'esm', target: 'node20', outdir: 'dist-tools', outExtension: { '.js': '.mjs' }, banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
copyFileSync(r.resolve('manifold-3d/manifold.wasm'), 'dist-tools/manifold.wasm');
copyFileSync(r.resolve('@expo-google-fonts/baloo-2/800ExtraBold/Baloo2_800ExtraBold.ttf'), 'dist-tools/font.ttf');
