const values = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 0 };
function evaluate(game) {
  let score = 0;
  for (const row of game.board()) for (const p of row) {
    if (!p) continue;
    const file = p.square.charCodeAt(0) - 97;
    const rank = Number(p.square[1]) - 1;
    const progress = p.color === 'w' ? rank : 7 - rank;
    const center = 3.5 - Math.abs(file - 3.5) + 3.5 - Math.abs(rank - 3.5);
    const positional = p.type === 'p' ? progress * 9 + center * 3
      : p.type === 'n' || p.type === 'b' ? center * 12 : p.type === 'k' ? -center * 3 : center * 2;
    score += (values[p.type] + positional) * (p.color === 'w' ? 1 : -1);
  }
  return score * (game.turn() === 'w' ? 1 : -1);
}
function ordered(game) {
  return game.moves({ verbose: true }).sort((a, b) =>
    ((values[b.captured] || 0) * 10 - (b.captured ? values[b.piece] : 0) + (values[b.promotion] || 0)) -
    ((values[a.captured] || 0) * 10 - (a.captured ? values[a.piece] : 0) + (values[a.promotion] || 0)));
}
export function chooseMove(game, level = 'medium', timeBudget) {
  const maxDepth = { easy: 1, medium: 2, hard: 4 }[level] || 2;
  const deadline = performance.now() + (timeBudget ?? (level === 'hard' ? 2400 : 1000));
  let nodes = 0;
  let timedOut = false;
  function search(depth, alpha, beta, ply) {
    nodes++;
    if ((nodes & 63) === 0 && performance.now() > deadline) { timedOut = true; return 0; }
    if (game.isCheckmate()) return -100000 + ply;
    if (game.isDraw()) return 0;
    if (depth === 0) return evaluate(game);
    let best = -Infinity;
    for (const move of ordered(game)) {
      game.move(move);
      const score = -search(depth - 1, -beta, -alpha, ply + 1);
      game.undo();
      if (timedOut) return 0;
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  const moves = ordered(game);
  if (!moves.length || game.isGameOver()) return null;
  let bestMove = moves[0];
  for (let depth = 1; depth <= maxDepth; depth++) {
    let best = -Infinity, candidate = bestMove;
    let alpha = -Infinity;
    for (const move of moves) {
      game.move(move);
      const score = -search(depth - 1, -Infinity, -alpha, 1);
      game.undo();
      if (timedOut) break;
      if (score > best) { best = score; candidate = move; }
      alpha = Math.max(alpha, score);
    }
    if (timedOut) break;
    bestMove = candidate;
    moves.sort((a, b) => Number(b === bestMove) - Number(a === bestMove));
  }
  return { from: bestMove.from, to: bestMove.to, ...(bestMove.promotion ? { promotion: bestMove.promotion } : {}) };
}
