import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const worker = await build({ entryPoints: ['engine.js'], bundle: true, write: false, format: 'iife', minify: true });
const app = await build({
  entryPoints: ['app.js'], bundle: true, write: false, format: 'iife', minify: true,
  define: { ENGINE_SOURCE: JSON.stringify(worker.outputFiles[0].text) }
});
const template = await readFile('index.html', 'utf8');
await writeFile('chess.html', template.replace('<!-- APP -->', () => `<script>${app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`));
console.log('Built self-contained chess.html');
