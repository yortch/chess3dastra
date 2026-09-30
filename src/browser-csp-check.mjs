import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const policy = "default-src 'none'; script-src 'self'; style-src 'self'; worker-src 'self'; img-src 'self' data:; base-uri 'self'; form-action 'none'";
const prefix = '/apps/field64/client/';
const files = {
  'index.html': 'text/html',
  'app.js': 'text/javascript',
  'engine.js': 'text/javascript',
  'chess.css': 'text/css'
};
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /<style\b|<script(?![^>]*\bsrc=)|\s(?:style|on\w+)=/i);
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const file = path.startsWith(prefix) ? path.slice(prefix.length) || 'index.html' : '';
  if (!files[file]) { res.writeHead(404); res.end(); return; }
  try {
    const content = await readFile(new URL(`../dist/${file}`, import.meta.url));
    res.writeHead(200, {
      'Content-Type': `${files[file]}; charset=utf-8`,
      'Content-Security-Policy': policy
    });
    res.end(content);
  } catch (error) {
    console.error(error);
    res.writeHead(500); res.end('Unable to serve managed assets');
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const url = `http://127.0.0.1:${server.address().port}${prefix}`;
let browser;
try {
  browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], workers = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('worker', worker => workers.push(worker.url()));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
    });
  });
  await page.goto(`${url}?scoutTheme=light`);
  await page.locator('#stage canvas').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.equal(await page.locator('#view-3d').isDisabled(), false);
  for (const level of ['easy', 'medium', 'hard']) {
    await page.locator('#difficulty').selectOption(level);
    await page.locator('#move-input').fill('e4');
    await page.locator('#move-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('#move-count').textContent === '2 plies');
    assert.equal(await page.locator('#notice').textContent(), '');
    await page.locator('#undo').click();
  }
  await page.locator('#view-2d').click();
  await page.locator('[data-square="e2"]').click();
  assert.match(await page.locator('[data-square="e4"]').getAttribute('class'), /legal/);
  await page.locator('#theme').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const board = document.querySelector('#flat-board').getBoundingClientRect();
    return board.width > 300 && board.left >= 0 && board.right <= innerWidth;
  });
  const board = await page.locator('#flat-board').boundingBox();
  assert.ok(board.width > 300 && board.x >= 0 && board.x + board.width <= 390);
  assert.equal(await page.locator('#flat-board').evaluate(el => getComputedStyle(el).display), 'grid');
  assert.equal(workers.length, 3);
  assert.ok(workers.every(worker => worker === `${url}engine.js`), 'All workers use the same-origin asset');
  assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
  assert.deepEqual(errors, []);
  await browser.close();
  browser = null;
  const run = promisify(execFile);
  for (const suite of [
    'browser-check.mjs', 'browser-2d-check.mjs',
    'browser-resilience-check.mjs', 'browser-knight-check.mjs'
  ]) {
    const result = await run(process.execPath, [fileURLToPath(new URL(suite, import.meta.url))], {
      env: { ...process.env, CHESS_URL: url }, timeout: 120000
    });
    console.log(result.stdout.trim());
  }
  console.log('CSP passed: external scripts/styles, same-origin workers at nested paths, all AI levels, 3D/2D, mobile, theme, zero CSP violations, and all four browser suites.');
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
