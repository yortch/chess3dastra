import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const worker = await build({ entryPoints: ['engine.js'], bundle: true, write: false, format: 'iife', minify: true });
const app = await build({
  entryPoints: ['app.js'], bundle: true, write: false, format: 'iife', minify: true,
  define: { ENGINE_SOURCE: JSON.stringify(worker.outputFiles[0].text) }
});
const template = await readFile('index.html', 'utf8');
const html = template.replace('<!-- APP -->', () => `<script>${app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
await mkdir('../dist', { recursive: true });
await Promise.all([
  writeFile('chess.html', html),
  writeFile('../index.html', html),
  writeFile('../dist/index.html', html)
]);
console.log('Built src/chess.html, root index.html, and dist/index.html');
