import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const waitForPlies = (page, count) => page.waitForFunction(count => document.querySelector('#move-count').textContent === `${count} plies`, count);
async function pageWithState({ noWebGL = false, saved } = {}) {
  const context = await browser.newContext();
  if (noWebGL) await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : getContext.call(this, type, ...args);
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4178');
  if (saved) {
    await page.evaluate(saved => localStorage.setItem('atelier-chess', JSON.stringify(saved)), saved);
    await page.reload();
  }
  return page;
}
async function checkNotationFocus(page) {
  const input = page.locator('#move-input');
  await input.fill('e4');
  await input.press('Enter');
  await waitForPlies(page, 2);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'move-input', 'Focus returns after the first reply');
  await page.keyboard.type('Nf3');
  await page.keyboard.press('Enter');
  await waitForPlies(page, 4);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'move-input', 'Consecutive notation entry works without refocusing');
  await page.keyboard.type('not-a-move');
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#notice').textContent(), /not legal/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'move-input');
  await page.locator('#undo').click();
  await page.locator('#undo').click();
  await input.fill('e4');
  await page.evaluate(() => {
    document.querySelector('#move-form').requestSubmit();
    document.querySelector('#theme').focus();
  });
  await waitForPlies(page, 2);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'theme', 'Do not steal focus from another control');
  await page.locator('#undo').click();
  await input.fill('e4');
  await page.evaluate(() => {
    document.querySelector('#move-form').requestSubmit();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  });
  await waitForPlies(page, 2);
  assert.notEqual(await page.evaluate(() => document.activeElement.id), 'move-input', 'Do not restore after the user clicks away');

  await page.locator('#undo').click();
  await input.fill('e4');
  await page.evaluate(() => {
    document.querySelector('#move-form').requestSubmit();
    document.querySelector('#new').click();
  });
  const newDialog = page.getByRole('dialog', { name: 'Start a new game?', exact: true });
  await newDialog.waitFor();
  await waitForPlies(page, 2);
  assert.ok(await page.evaluate(() => document.querySelector('#new-dialog').contains(document.activeElement)), 'Focus remains inside the open dialog');
  await page.locator('#cancel-new').click();

  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  await page.evaluate(pgn => localStorage.setItem('atelier-chess', JSON.stringify({ pgn, human: 'w', level: 'easy', view: '2d' })), promotion.pgn());
  await page.reload();
  await input.fill('a7a8');
  await input.press('Enter');
  const promotionDialog = page.getByRole('dialog', { name: 'Promote your pawn', exact: true });
  await promotionDialog.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'move-input', 'Cancelled promotion returns to notation');
  await input.press('Enter');
  await promotionDialog.getByRole('button', { name: 'Queen', exact: true }).click();
  await waitForPlies(page, 2);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'move-input', 'Notation promotion restores focus after the reply');
}
try {
  const restored = new Chess();
  restored.move('e4'); restored.move('e5');
  for (const view of [undefined, '2d', '3d']) {
    const page = await pageWithState({
      noWebGL: true,
      saved: view ? { pgn: restored.pgn(), human: 'w', level: 'easy', view } : undefined
    });
    await page.locator('#flat-view').waitFor();
    assert.equal(await page.locator('#flat-board button').count(), 64);
    assert.equal(await page.locator('#flat-board svg').count(), 32);
    assert.ok(await page.locator('#view-3d').isDisabled());
    assert.equal(await page.locator('#view-2d').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#stage canvas').count(), 0);
    assert.match(await page.locator('#render-notice').textContent(), /keep playing in 2D/);
    await page.locator('[data-square="g1"]').click();
    await page.locator('[data-square="f3"]').click();
    await waitForPlies(page, view ? 4 : 2);
    await page.locator('#undo').click();
    await page.locator('#rotate').click();
    await page.locator('#reset-view').click();
    await page.locator('#theme').click();
    assert.ok(await page.locator('#render-notice').isVisible(), 'Fallback explanation persists after interaction');
    await page.context().close();
  }
  for (const options of [{}, { saved: { view: '2d', human: 'w', level: 'easy' } }, { noWebGL: true }]) {
    const page = await pageWithState(options);
    await checkNotationFocus(page);
    await page.context().close();
  }
  assert.deepEqual(errors, []);
  console.log('Resilience/accessibility passed: no-WebGL fresh and restored games, persistent fallback, consecutive notation focus, no focus stealing, dialog names, promotion focus.');
} finally {
  await browser.close();
}
