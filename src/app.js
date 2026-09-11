import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Chess } from 'chess.js';
import { createFlatBoard } from './flat-board.js';

const $ = id => document.getElementById(id);
const game = new Chess();
const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
let human = 'w', selected = null, legal = [], worker = null, thinking = false, pending = null;
let view = '3d', flatBottom = 'w';
let restoreNotationFocus = false;
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem('atelier-chess') || 'null');
  if (saved) {
    if (saved.pgn) game.loadPgn(saved.pgn);
    human = saved.human === 'b' ? 'b' : 'w';
    view = saved.view === '2d' ? '2d' : '3d';
    flatBottom = ['w', 'b'].includes(saved.flatBottom) ? saved.flatBottom : human;
    $('side').value = human;
    if (['easy', 'medium', 'hard'].includes(saved.level)) $('difficulty').value = saved.level;
  }
} catch (error) {
  $('notice').textContent = `Could not restore the saved game: ${error.message}`;
  game.reset();
}
function save() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem('atelier-chess', JSON.stringify({ pgn: game.pgn(), human, level: $('difficulty').value, view, flatBottom }));
  } catch {
    storageAvailable = false;
    $('notice').textContent = 'Browser storage is unavailable. This game will not survive a reload.';
  }
}

const flatBoard = createFlatBoard($('flat-board'), selectSquare, names);
function renderFlatBoard() {
  flatBoard.render(game, { selected, legal, bottom: flatBottom });
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
} catch (error) {
  $('render-notice').textContent = `3D is unavailable (${error.message}). You can keep playing in 2D.`;
  $('render-notice').hidden = false;
  $('view-3d').disabled = true;
  $('view-3d').setAttribute('aria-describedby', 'render-notice');
}
const controls = renderer ? new OrbitControls(camera, renderer.domElement) : null;
if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearAlpha(0);
  $('stage').appendChild(renderer.domElement);
  controls.target.set(0, .25, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 10;
  controls.maxDistance = 28;
  controls.minPolarAngle = .05;
  controls.maxPolarAngle = Math.PI / 2.25;
}
function resetView() {
  camera.position.set(human === 'w' ? 9 : -9, 12, human === 'w' ? 12 : -12);
  if (controls) {
    controls.target.set(0, .25, 0);
    controls.update();
  }
}
resetView();
const ambient = new THREE.HemisphereLight();
ambient.intensity = 2.1;
scene.add(ambient);
const light = new THREE.DirectionalLight();
light.intensity = 3;
light.position.set(-4, 12, 7);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
light.shadow.camera.left = -7; light.shadow.camera.right = 7;
light.shadow.camera.top = 7; light.shadow.camera.bottom = -7;
light.shadow.normalBias = .03;
scene.add(light);

const materials = {
  white: new THREE.MeshStandardMaterial({ roughness: .28, metalness: .12 }),
  black: new THREE.MeshStandardMaterial({ roughness: .32, metalness: .18 }),
  base: new THREE.MeshStandardMaterial({ roughness: .75 }),
  accent: new THREE.MeshStandardMaterial({ roughness: .4 }),
};
const board = new THREE.Group(), pieces = new THREE.Group(), markers = new THREE.Group();
scene.add(board, pieces, markers);
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, material);
  item.position.set(x, y, z);
  item.castShadow = true;
  item.receiveShadow = true;
  parent.add(item);
  return item;
}
mesh(new THREE.BoxGeometry(8.65, .38, 8.65), materials.base, board, 0, -.25);
mesh(new THREE.BoxGeometry(8.7, .055, 8.7), materials.accent, board, 0, -.39);
const tiles = new Map(), labelSprites = [];
function position(square) {
  return new THREE.Vector3(square.charCodeAt(0) - 100.5, .06, 4.5 - Number(square[1]));
}
for (let rank = 1; rank <= 8; rank++) for (let file = 0; file < 8; file++) {
  const square = String.fromCharCode(97 + file) + rank;
  const p = position(square);
  const mat = new THREE.MeshStandardMaterial({ roughness: .86 });
  const tile = mesh(new THREE.BoxGeometry(.995, .1, .995), mat, board, p.x, -.025, p.z);
  tile.userData = { square, light: (file + rank) % 2 === 0 };
  tiles.set(square, tile);
}
function clearGroup(group) {
  group.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
  group.clear();
}
function lathe(parent, material, profile) {
  return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32), material, parent);
}
function sphere(parent, material, radius, y, x = 0, z = 0) {
  return mesh(new THREE.SphereGeometry(radius, 24, 16), material, parent, x, y, z);
}
function makePiece(piece) {
  const group = new THREE.Group();
  group.userData.square = piece.square;
  const mat = piece.color === 'w' ? materials.white : materials.black;
  lathe(group, mat, [[0, 0], [.30, 0], [.33, .055], [.33, .10], [.28, .15], [.28, .19], [.23, .22], [.20, .27]]);
  const heights = { p: .5, n: .58, b: .7, r: .62, q: .85, k: .9 };
  const h = heights[piece.type];
  lathe(group, mat, [[.20, .24], [.20, .29], [.14, .38], [.115, h - .04], [.21, h], [.21, h + .055], [.16, h + .09]]);
  if (piece.type === 'p') sphere(group, mat, .18, h + .23);
  if (piece.type === 'b') {
    const head = sphere(group, mat, .19, h + .26);
    head.scale.set(.8, 1.45, .8);
    sphere(group, mat, .065, h + .55);
    const slash = mesh(new THREE.BoxGeometry(.035, .20, .32), materials.base, group, .035, h + .31);
    slash.rotation.z = -.42;
  }
  if (piece.type === 'r') {
    mesh(new THREE.CylinderGeometry(.255, .20, .25, 24), mat, group, 0, h + .18);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const tooth = mesh(new THREE.BoxGeometry(.13, .16, .13), mat, group, Math.sin(a) * .19, h + .36, Math.cos(a) * .19);
      tooth.rotation.y = a;
    }
  }
  if (piece.type === 'q') {
    lathe(group, mat, [[.14, h + .08], [.18, h + .18], [.245, h + .36], [.22, h + .40], [.14, h + .28]]);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      sphere(group, mat, .053, h + .42, Math.sin(a) * .21, Math.cos(a) * .21);
    }
    sphere(group, mat, .09, h + .40);
  }
  if (piece.type === 'k') {
    lathe(group, mat, [[.14, h + .08], [.21, h + .16], [.19, h + .24], [.11, h + .29]]);
    mesh(new THREE.BoxGeometry(.095, .37, .095), mat, group, 0, h + .44);
    mesh(new THREE.BoxGeometry(.29, .085, .095), mat, group, 0, h + .50);
  }
  if (piece.type === 'n') {
    const shape = new THREE.Shape();
    shape.moveTo(-.18, 0); shape.lineTo(.22, 0); shape.lineTo(.16, .24);
    shape.lineTo(.31, .27); shape.lineTo(.32, .43); shape.lineTo(.12, .59);
    shape.lineTo(.03, .77); shape.lineTo(-.045, .61); shape.lineTo(-.15, .69);
    shape.lineTo(-.24, .40); shape.closePath();
    const horse = mesh(new THREE.ExtrudeGeometry(shape, { depth: .22, bevelEnabled: true, bevelThickness: .035, bevelSize: .035, bevelSegments: 2, steps: 1 }), mat, group, 0, h + .02, -.11);
    horse.rotation.y = piece.color === 'w' ? Math.PI / 2 : -Math.PI / 2;
    horse.position.x = piece.color === 'w' ? -.11 : .11;
    horse.position.z = 0;
  }
  group.position.copy(position(piece.square));
  pieces.add(group);
}
function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function palette() {
  const dark = document.documentElement.dataset.theme === 'dark';
  return {
    white: css(dark ? '--cp-text' : '--cp-bg-elevated'),
    black: css(dark ? '--cp-surface' : '--cp-text'),
    light: css(dark ? '--cp-text-soft' : '--cp-border'),
    dark: css(dark ? '--cp-border' : '--cp-text-muted'),
    base: css(dark ? '--cp-surface' : '--cp-text'),
    accent: css('--cp-accent')
  };
}
function applyTheme() {
  if (!renderer) { renderFlatBoard(); return; }
  const p = palette();
  for (const name of Object.keys(materials)) materials[name].color.set(p[name]);
  ambient.color.set(css('--cp-surface-soft'));
  ambient.groundColor.set(css('--cp-text-muted'));
  light.color.set(css('--cp-bg-elevated'));
  // Illumination stays neutral in dark mode so both armies remain distinguishable.
  if (document.documentElement.dataset.theme === 'dark') light.color.set(css('--cp-text'));
  for (const sprite of labelSprites) {
    sprite.material.map.dispose(); sprite.material.dispose(); board.remove(sprite);
  }
  labelSprites.length = 0;
  for (let i = 0; i < 8; i++) {
    addLabel(String.fromCharCode(97 + i), i - 3.5, 4.17);
    addLabel(String(8 - i), -4.17, i - 3.5);
  }
  highlight();
}
function addLabel(text, x, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = palette().white; ctx.font = '36px Consolas'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.position.set(x, .045, z); sprite.scale.set(.25, .25, .25);
  labelSprites.push(sprite); board.add(sprite);
}
function highlight() {
  renderFlatBoard();
  if (!renderer) return;
  const p = palette();
  const last = game.history({ verbose: true }).at(-1);
  for (const [square, tile] of tiles) {
    tile.material.color.set(tile.userData.light ? p.light : p.dark);
    if (last && [last.from, last.to].includes(square)) tile.material.color.lerp(new THREE.Color(p.accent), .40);
    if (selected === square) tile.material.color.set(p.accent);
    const piece = game.get(square);
    if (piece?.type === 'k' && piece.color === game.turn() && game.isCheck()) tile.material.color.set(css('--cp-danger'));
  }
  clearGroup(markers);
  for (const square of new Set(legal.map(m => m.to))) {
    const p = position(square);
    const geo = game.get(square) ? new THREE.TorusGeometry(.39, .025, 8, 40) : new THREE.CylinderGeometry(.105, .105, .018, 24);
    const mark = mesh(geo, materials.accent, markers, p.x, .047, p.z);
    if (game.get(square)) mark.rotation.x = Math.PI / 2;
    mark.userData.square = square;
  }
}
function draw() {
  if (renderer) {
    clearGroup(pieces);
    for (const row of game.board()) for (const piece of row) if (piece) makePiece(piece);
  }
  highlight();
  updateUI();
}
function updateUI() {
  const mine = game.turn() === human;
  let title = mine ? 'Your move.' : 'Thinking...';
  let detail = mine ? `You play ${human === 'w' ? 'white' : 'black'}. Choose your next move.` : 'The computer is considering its reply.';
  if (game.isCheckmate()) {
    title = mine ? 'Checkmate.' : 'You win.';
    detail = mine ? 'The computer wins by checkmate.' : 'Checkmate. A well-played finish.';
  } else if (game.isDraw()) {
    title = 'Draw.';
    detail = game.isStalemate() ? 'Stalemate: no legal moves.' : game.isThreefoldRepetition() ? 'The position has repeated three times.' : game.isInsufficientMaterial() ? 'Neither side has enough material to checkmate.' : 'Draw by the fifty-move rule.';
  } else if (game.isCheck()) {
    title = mine ? 'You are in check.' : 'Computer in check.';
    detail = mine ? 'Protect your king with a legal move.' : 'The computer must protect its king.';
  }
  $('status').textContent = title; $('status-detail').textContent = detail;
  $('human-turn').textContent = mine && !game.isGameOver() ? 'YOUR TURN' : '';
  $('computer-turn').textContent = !mine && !game.isGameOver() ? 'THINKING' : '';
  $('human-color').textContent = `/ ${human === 'w' ? 'White' : 'Black'}`;
  $('human-stone').classList.toggle('white', human === 'w');
  $('computer-stone').classList.toggle('white', human === 'b');
  $('opponent-level').textContent = { easy: 'Casual opponent', medium: 'Balanced opponent', hard: 'Challenging opponent' }[$('difficulty').value];
  $('selection').textContent = selected ? `${names[game.get(selected).type]} on ${selected} / ${new Set(legal.map(m => m.to)).size} legal squares` : game.isGameOver() ? 'Game complete' : mine ? 'Select a piece to move' : 'Waiting for the computer';
  const history = game.history();
  $('undo').disabled = history.length === 0 || (human === 'b' && history.length === 1);
  $('move-input').disabled = !mine || thinking || game.isGameOver();
  $('move-form').querySelector('button').disabled = $('move-input').disabled;
  if (restoreNotationFocus && (!$('move-input').disabled || game.isGameOver())) {
    const canRestore = !$('move-input').disabled && document.hasFocus() &&
      [document.body, $('move-input')].includes(document.activeElement) &&
      !document.querySelector('dialog[open]');
    restoreNotationFocus = false;
    if (canRestore) $('move-input').focus({ preventScroll: true });
  }
  $('move-count').textContent = `${history.length} ${history.length === 1 ? 'ply' : 'plies'}`;
  $('history').replaceChildren();
  if (!history.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'The board is set. Your first move starts the story.'; $('history').append(empty);
  }
  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div'); row.className = 'move-row';
    for (const text of [`${i / 2 + 1}.`, history[i], history[i + 1] || '']) {
      const cell = document.createElement('span'); cell.textContent = text; row.append(cell);
    }
    $('history').append(row);
  }
  $('history').scrollTop = $('history').scrollHeight;
  const captures = { w: [], b: [] };
  for (const m of game.history({ verbose: true })) if (m.captured) captures[m.color].push(names[m.captured]);
  $('captured').textContent = captures.w.length + captures.b.length ? `White took: ${captures.w.join(', ') || 'none'}. Black took: ${captures.b.join(', ') || 'none'}.` : 'No captures yet.';
}
function cancelComputer() { worker?.terminate(); worker = null; thinking = false; }
function computerMove() {
  if (game.turn() === human || game.isGameOver()) return;
  cancelComputer();
  thinking = true; updateUI();
  const url = URL.createObjectURL(new Blob([ENGINE_SOURCE], { type: 'text/javascript' }));
  try { worker = new Worker(url); }
  catch (error) { URL.revokeObjectURL(url); engineError(error.message); return; }
  URL.revokeObjectURL(url);
  worker.onmessage = ({ data }) => {
    cancelComputer();
    if (data.error) { engineError(data.error); return; }
    try {
      if (!data.move) throw new Error('No move was returned for this position.');
      game.move(data.move);
      selected = null; legal = []; save(); draw();
    } catch (error) { engineError(error.message); }
  };
  worker.onerror = event => engineError(event.message || 'Computer worker failed.');
  worker.postMessage({ pgn: game.pgn(), level: $('difficulty').value });
}
function engineError(message) {
  restoreNotationFocus = false;
  cancelComputer(); updateUI();
  $('status').textContent = 'Computer paused.';
  $('status-detail').textContent = 'Change the difficulty to retry, or undo your last move.';
  $('computer-turn').textContent = 'PAUSED';
  $('notice').textContent = `Computer error: ${message}`;
}
function commitMove(move, restoreInputFocus = false) {
  try { game.move(move); }
  catch { $('notice').textContent = 'That move is not legal. Try a highlighted square or notation such as e4.'; return; }
  restoreNotationFocus = restoreInputFocus;
  selected = null; legal = []; $('notice').textContent = ''; $('move-input').value = '';
  save(); draw(); computerMove();
}
function selectSquare(square) {
  if (thinking || game.turn() !== human || game.isGameOver() || pending) return;
  const choices = legal.filter(m => m.to === square);
  if (selected && choices.length) {
    if (choices.some(m => m.promotion)) {
      pending = { from: selected, to: square }; $('promotion').showModal();
    } else commitMove({ from: selected, to: square });
    return;
  }
  const piece = game.get(square);
  selected = piece?.color === human && square !== selected ? square : null;
  legal = selected ? game.moves({ square: selected, verbose: true }) : [];
  highlight(); updateUI();
}
const raycaster = new THREE.Raycaster();
let pointerDown = null;
renderer?.domElement.addEventListener('pointerdown', e => { pointerDown = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
renderer?.domElement.addEventListener('pointercancel', () => { pointerDown = null; });
renderer?.domElement.addEventListener('pointerup', e => {
  if (!pointerDown || pointerDown.id !== e.pointerId || e.button !== 0 || Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 6) { pointerDown = null; return; }
  pointerDown = null;
  const rect = renderer.domElement.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), camera);
  const hits = raycaster.intersectObjects([pieces, board, markers], true);
  for (const hit of hits) {
    let object = hit.object;
    while (object && !object.userData.square) object = object.parent;
    if (object?.userData.square) { selectSquare(object.userData.square); break; }
  }
});
$('promotion').addEventListener('click', e => {
  if (!e.target.dataset.piece || !pending) return;
  const { restoreInputFocus = false, ...coordinates } = pending;
  const move = { ...coordinates, promotion: e.target.dataset.piece };
  pending = null; $('promotion').close(); commitMove(move, restoreInputFocus);
});
$('promotion').addEventListener('cancel', () => { pending = null; });
// Any navigation away from notation cancels focus restoration after the reply.
document.addEventListener('focusin', e => {
  if (e.target !== $('move-input')) restoreNotationFocus = false;
});
document.addEventListener('pointerdown', () => { restoreNotationFocus = false; });
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') restoreNotationFocus = false;
});
window.addEventListener('blur', () => { restoreNotationFocus = false; });
$('move-form').addEventListener('submit', e => {
  e.preventDefault();
  if (thinking || game.turn() !== human || game.isGameOver()) return;
  const text = $('move-input').value.trim();
  const restoreInputFocus = document.activeElement === $('move-input');
  if (!text) { $('notice').textContent = 'Enter a move such as e4, Nf3, O-O, or e2e4.'; return; }
  const coordinates = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(text);
  if (coordinates) {
    const [, from, to, promotion] = coordinates.map(s => s?.toLowerCase());
    const candidate = game.moves({ verbose: true }).find(m => m.from === from && m.to === to);
    if (candidate?.promotion && !promotion) { pending = { from, to, restoreInputFocus }; $('promotion').showModal(); return; }
    commitMove({ from, to, ...(promotion ? { promotion } : {}) }, restoreInputFocus);
  } else commitMove(text, restoreInputFocus);
});
function newGame() {
  restoreNotationFocus = false;
  cancelComputer(); game.reset(); human = $('side').value; selected = null; legal = []; pending = null;
  flatBottom = human;
  $('notice').textContent = ''; $('move-input').value = '';
  save(); resetView(); draw(); computerMove();
}
$('new').onclick = () => { if (game.history().length) $('new-dialog').showModal(); else newGame(); };
$('cancel-new').onclick = () => $('new-dialog').close();
$('confirm-new').onclick = () => { $('new-dialog').close(); newGame(); };
$('undo').onclick = () => {
  restoreNotationFocus = false;
  cancelComputer();
  game.undo();
  if (game.turn() !== human && game.history().length) game.undo();
  selected = null; legal = []; $('notice').textContent = '';
  save(); draw(); computerMove();
};
$('difficulty').onchange = () => { $('notice').textContent = ''; save(); updateUI(); if (game.turn() !== human) computerMove(); };
$('rotate').onclick = () => {
  if (view === '2d') {
    flatBottom = flatBottom === 'w' ? 'b' : 'w';
    renderFlatBoard(); save();
    return;
  }
  const offset = camera.position.clone().sub(controls.target);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  camera.position.copy(controls.target).add(offset); controls.update();
};
$('top').onclick = () => { camera.position.set(0, 16, human === 'w' ? .1 : -.1); controls.update(); };
$('reset-view').onclick = () => {
  resetView(); flatBottom = human; renderFlatBoard(); save();
};
function setView(nextView, persist = true) {
  view = renderer ? nextView : '2d';
  const flat = view === '2d';
  $('flat-view').hidden = !flat;
  if (renderer) {
    renderer.domElement.hidden = flat;
    controls.enabled = !flat;
  }
  $('view-2d').setAttribute('aria-pressed', String(flat));
  $('view-3d').setAttribute('aria-pressed', String(!flat));
  $('top').hidden = flat;
  $('rotate').textContent = flat ? 'Flip board' : 'Rotate board';
  $('board-hint').textContent = flat
    ? 'Click a piece, then a highlighted square. Tab and Enter work too.'
    : 'Click a piece, then a square. Drag to orbit. Scroll to zoom.';
  renderFlatBoard();
  renderer?.setAnimationLoop(flat ? null : () => { controls.update(); renderer.render(scene, camera); });
  if (persist) save();
}
$('view-2d').onclick = () => setView('2d');
$('view-3d').onclick = () => setView('3d');
$('theme').onclick = () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
};
const sizeObserver = new ResizeObserver(() => {
  const { width, height } = $('stage').getBoundingClientRect();
  flatBoard.resize(width, height);
  camera.aspect = width / height;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(18)) * Math.max(1, 1.25 / camera.aspect)));
  camera.updateProjectionMatrix();
  renderer?.setSize(width, height);
});
sizeObserver.observe($('stage'));
applyTheme(); draw(); computerMove();
setView(view, false);
