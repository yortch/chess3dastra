import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { chooseMove } from './search.js';
import { knightFacesRight } from './piece-orientation.js';

test('knights face inward on every file and rank, reversing in the flipped 2D view', () => {
  for (const file of 'abcdefgh') for (let rank = 1; rank <= 8; rank++) {
    const square = file + rank;
    const facesRight = 'abcd'.includes(file);
    assert.equal(knightFacesRight(square), facesRight, square);
    assert.equal(knightFacesRight(square, 'w'), facesRight, square);
    assert.equal(knightFacesRight(square, 'b'), !facesRight, `${square} flipped`);
  }
});

test('computer returns legal moves at every level without mutating the game', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    const game = new Chess(); game.move('e4');
    const before = game.fen();
    const move = chooseMove(game, level, 350);
    assert.equal(game.fen(), before);
    assert.ok(game.move(move));
  }
});
test('computer finds mate in one', () => {
  const game = new Chess('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1');
  game.move(chooseMove(game, 'medium'));
  assert.ok(game.isCheckmate());
});
test('terminal positions do not produce moves', () => {
  const game = new Chess('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
  assert.ok(game.isStalemate());
  assert.equal(chooseMove(game), null);
});
test('rules support castling, en passant and all four promotion choices', () => {
  const castle = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  castle.move('O-O'); assert.equal(castle.get('f1').type, 'r');
  const ep = new Chess(); for (const m of ['e4', 'a6', 'e5', 'd5', 'exd6']) ep.move(m);
  assert.equal(ep.get('d5'), undefined); assert.equal(ep.get('d6').type, 'p');
  const promotion = new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1');
  assert.equal(promotion.moves({ verbose: true }).filter(m => m.from === 'a7').length, 4);
});
test('saved history preserves repetition draws', () => {
  const game = new Chess();
  for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) game.move(m);
  const restored = new Chess(); restored.loadPgn(game.pgn());
  assert.ok(restored.isThreefoldRepetition());
  assert.equal(chooseMove(restored), null);
});
