import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const square = name => page.locator(`#flat-board [data-square="${name}"]`);
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('atelier-chess')));
async function loadPosition(game, human = 'w') {
  await page.waitForFunction(() => document.querySelector('#computer-turn').textContent !== 'THINKING');
  await page.evaluate(({ pgn, human }) => localStorage.setItem('atelier-chess', JSON.stringify({ pgn, human, level: 'easy', view: '2d' })), { pgn: game.pgn(), human });
  await page.reload();
  await page.locator('#flat-view').waitFor();
}
try {
  await page.goto(process.env.CHESS_URL || 'http://127.0.0.1:4178');
  await page.locator('#view-2d').click();
  assert.equal(await page.locator('#flat-board button').count(), 64);
  assert.equal(await page.locator('#flat-board svg').count(), 32);
  assert.equal(await page.locator('#stage canvas').isVisible(), false);
  await square('e2').focus();
  await page.keyboard.press('Enter');
  assert.match(await square('e4').getAttribute('class'), /legal/);
  await page.locator('#view-3d').click();
  assert.match(await page.locator('#selection').textContent(), /pawn on e2/);
  await page.locator('#view-2d').click();
  assert.equal(await square('e2').getAttribute('aria-pressed'), 'true');
  await square('e4').click();
  await page.locator('#view-3d').click();
  await page.waitForFunction(() => document.querySelector('#move-count').textContent === '2 plies');
  await page.locator('#view-2d').click();
  assert.match(await square('e4').getAttribute('aria-label'), /White pawn/);
  await page.locator('#rotate').click();
  assert.equal(await page.locator('#flat-board button').first().getAttribute('data-square'), 'h1');
  await page.reload();
  await page.locator('#flat-view').waitFor();
  assert.equal(await page.locator('#flat-board button').first().getAttribute('data-square'), 'h1');
  assert.equal((await saved()).view, '2d');
  assert.equal(await page.locator('#move-count').textContent(), '2 plies');
  await page.locator('#undo').click();
  assert.equal(await page.locator('#flat-board svg').count(), 32);
  await page.locator('#reset-view').click();
  assert.equal(await page.locator('#flat-board button').first().getAttribute('data-square'), 'a8');
  await page.screenshot({ path: 'chess-2d-desktop.png' });
  await page.locator('#theme').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await square('g1').click();
  assert.match(await square('f3').getAttribute('aria-label'), /legal destination/);
  const rect = await page.locator('#flat-board').boundingBox();
  assert.ok(rect.x >= 0 && rect.x + rect.width <= 390);
  assert.ok(Math.abs(rect.width - rect.height) < 1);
  await page.screenshot({ path: 'chess-2d-mobile.png' });
  await page.locator('#side').selectOption('b');
  await page.locator('#new').click();
  await page.waitForFunction(() => document.querySelector('#move-count').textContent === '1 ply');
  assert.equal(await page.locator('#flat-board button').first().getAttribute('data-square'), 'h1');
  await square('e7').click(); await square('e5').click();
  await page.waitForFunction(() => document.querySelector('#move-count').textContent === '3 plies');

  const enPassant = new Chess();
  for (const move of ['e4', 'a6', 'e5', 'd5']) enPassant.move(move);
  for (const [position, from, to, notation] of [
    [new Chess('7k/8/8/3p4/4P3/8/8/7K w - - 0 1'), 'e4', 'd5', 'exd5'],
    [new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 'e1', 'g1', 'O-O'],
    [enPassant, 'e5', 'd6', 'exd6']
  ]) {
    await loadPosition(position);
    await square(from).click();
    assert.match(await square(to).getAttribute('class'), /legal/, `${notation}: ${await page.locator('#selection').textContent()}; ${JSON.stringify(await saved())}`);
    await square(to).click();
    assert.ok((await saved()).pgn.includes(notation));
    if (notation === 'O-O') assert.match(await square('f1').getAttribute('aria-label'), /White rook/);
    if (notation === 'exd6') assert.match(await square('d5').getAttribute('aria-label'), /empty/);
  }
  for (const promotion of ['q', 'r', 'b', 'n']) {
    await loadPosition(new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1'));
    await square('a7').click(); await square('a8').click();
    await page.locator(`[data-piece="${promotion}"]`).click();
    assert.ok((await saved()).pgn.includes(`a8=${promotion.toUpperCase()}`));
    assert.match(await square('a8').getAttribute('class'), /occupied/);
  }
  await loadPosition(new Chess('4r2k/8/8/8/8/8/8/4K3 w - - 0 1'));
  assert.match(await square('e1').getAttribute('class'), /check/);
  assert.deepEqual(errors, []);
  console.log('2D passed: keyboard/click moves, view switching during analysis, persistence, flips, undo, mobile, play black, captures, castling, en passant, all promotions, check.');
} finally {
  await browser.close();
}
