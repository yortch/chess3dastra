import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const worker = await build({ entryPoints: ['engine.js'], bundle: true, write: false, format: 'iife', minify: true });
const app = await build({
  entryPoints: ['app.js'], bundle: true, write: false, format: 'iife', minify: true,
  define: { EXTERNAL_ENGINE: 'false', ENGINE_SOURCE: JSON.stringify(worker.outputFiles[0].text) }
});
const managedApp = await build({
  entryPoints: ['app.js'], bundle: true, write: false, format: 'iife', minify: true,
  define: { EXTERNAL_ENGINE: 'true', ENGINE_SOURCE: '""' }
});
const template = await readFile('index.html', 'utf8');
const styles = template.match(/<style>([\s\S]*?)<\/style>/);
if (!styles) throw new Error('Expected a stylesheet in the chess template.');
const html = template.replace('<!-- APP -->', () => `<script>${app.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>`);
const managedHtml = template
  .replace(styles[0], '<link rel="stylesheet" href="./chess.css">')
  .replace('<!-- APP -->', '<script src="./app.js" defer></script>');
await mkdir('../dist', { recursive: true });
await Promise.all([
  writeFile('chess.html', html),
  writeFile('../index.html', html),
  writeFile('../dist/index.html', managedHtml),
  writeFile('../dist/chess.css', styles[1]),
  writeFile('../dist/app.js', managedApp.outputFiles[0].text),
  writeFile('../dist/engine.js', worker.outputFiles[0].text)
]);
console.log('Built standalone chess.html/index.html and CSP-compatible dist assets');
