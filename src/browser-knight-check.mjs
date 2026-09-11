import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
// Observe the actual bundled scene without exposing test globals in the app.
await page.addInitScript(() => {
  window.__THREE_DEVTOOLS__ = new EventTarget();
  window.__THREE_DEVTOOLS__.addEventListener('observe', ({ detail }) => {
    if (detail.isScene) window.knightTestScene = detail;
  });
});
const square = name => page.locator(`#flat-board [data-square="${name}"]`);
async function checkKnights(expected, bottom = 'w', three = true) {
  for (const [name, direction] of Object.entries(expected)) {
    const mirror = (direction === -1) !== (bottom === 'b');
    assert.match(await square(name).getAttribute('aria-label'), /knight/);
    assert.equal(await square(name).locator('svg g').getAttribute('transform'),
      mirror ? 'translate(48 0) scale(-1 1)' : null, `${name} SVG, bottom ${bottom}`);
    if (!three) continue;
    const head = await page.evaluate(name => {
      let head;
      window.knightTestScene.traverse(object => {
        if (object.userData.square === name) {
          head = object.children.find(child => child.geometry?.type === 'ExtrudeGeometry');
        }
      });
      if (!head) return null;
      const direction = head.position.clone().set(1, 0, 0).transformDirection(head.matrixWorld);
      head.geometry.computeBoundingBox();
      const center = head.geometry.boundingBox.getCenter(head.position.clone());
      center.applyMatrix4(head.matrix);
      return { direction: direction.toArray(), center: center.toArray() };
    }, name);
    assert.ok(head, `${name} has a 3D knight head`);
    assert.ok(Math.abs(head.direction[0] - direction) < 1e-6, `${name} faces inward along the files`);
    assert.ok(Math.abs(head.direction[2]) < 1e-6, `${name} is side-on, not facing along the ranks`);
    assert.ok(Math.abs(head.center[2]) < 1e-6, `${name} extrusion is centered on its base`);
  }
  assert.equal(await page.locator('#flat-board button:not([aria-label*="knight"]) g[transform]').count(), 0);
}
async function loadPosition(game, human = game.turn()) {
  await page.evaluate(saved => localStorage.setItem('atelier-chess', JSON.stringify(saved)),
    { pgn: game.pgn(), human, level: 'easy', view: '3d', flatBottom: 'w' });
  await page.reload();
  await page.waitForFunction(() => window.knightTestScene?.children.some(group => group.children.some(piece => piece.userData.square)));
  // Allow the first rendered frame to update world matrices.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
try {
  await page.goto(process.env.CHESS_URL || 'http://127.0.0.1:4178');
  await loadPosition(new Chess());
  const initial = { b1: 1, g1: -1, b8: 1, g8: -1 };
  await checkKnights(initial);
  await page.screenshot({ path: 'chess-knights-3d.png' });
  await page.locator('#rotate').click();
  await checkKnights(initial);
  await page.screenshot({ path: 'chess-knights-3d-rotated.png' });
  await page.locator('#view-2d').click();
  await checkKnights(initial);
  await page.screenshot({ path: 'chess-knights-2d.png' });
  await square('g1').focus();
  await page.evaluate(() => document.querySelector('#rotate').click());
  assert.equal(await page.evaluate(() => document.activeElement.dataset.square), 'g1');
  assert.equal(await page.locator('#flat-board button').first().getAttribute('data-square'), 'h1');
  await checkKnights(initial, 'b');
  await page.screenshot({ path: 'chess-knights-2d-flipped.png' });
  await page.reload();
  await checkKnights(initial, 'b', false);
  await page.locator('#reset-view').click();
  await checkKnights(initial, 'w', false);

  // Cross the d/e boundary with both colors, then restore and undo the same history.
  const moved = new Chess('7k/8/2n5/8/8/2N5/8/7K w - - 0 1');
  await loadPosition(moved);
  await checkKnights({ c3: 1, c6: 1 });
  moved.move('Ne4'); moved.move('Ne5');
  await loadPosition(moved);
  await checkKnights({ e4: -1, e5: -1 });
  await page.locator('#undo').click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await checkKnights({ c3: 1, c6: 1 });

  // Promotion uses only the destination file, not original piece identity or color.
  for (const [fen, from, to, direction] of [
    ['7k/P7/8/8/8/8/8/7K w - - 0 1', 'a7', 'a8', 1],
    ['k7/7P/8/8/8/8/8/K7 w - - 0 1', 'h7', 'h8', -1],
    ['7k/8/8/8/8/8/p7/7K b - - 0 1', 'a2', 'a1', 1],
    ['k7/8/8/8/8/8/7p/K7 b - - 0 1', 'h2', 'h1', -1]
  ]) {
    await loadPosition(new Chess(fen));
    await page.locator('#view-2d').click();
    await square(from).click(); await square(to).click();
    await page.getByRole('dialog', { name: 'Promote your pawn', exact: true })
      .getByRole('button', { name: 'Knight', exact: true }).click();
    await page.locator('#view-3d').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await checkKnights({ [to]: direction });
    await page.locator('#view-2d').click();
    await page.locator('#rotate').click();
    await checkKnights({ [to]: direction }, 'b');
  }
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return /webgl/i.test(type) ? null : getContext.call(this, type, ...args);
    };
  });
  await page.evaluate(() => localStorage.removeItem('atelier-chess'));
  await page.reload();
  await page.locator('#flat-view').waitFor();
  assert.ok(await page.locator('#view-3d').isDisabled());
  await checkKnights(initial, 'w', false);
  await page.locator('#rotate').click();
  await checkKnights(initial, 'b', false);
  assert.deepEqual(errors, []);
  console.log('Knights passed: side-on centered 3D geometry, inward pairs, board flips, focus, restore, moved knights, undo, both colors promoting on both halves, and no-WebGL fallback.');
} finally {
  await browser.close();
}
