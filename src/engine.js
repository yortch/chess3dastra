import { Chess } from 'chess.js';
import { chooseMove } from './search.js';
self.onmessage = ({ data }) => {
  try {
    const game = new Chess();
    if (data.pgn) game.loadPgn(data.pgn);
    self.postMessage({ move: chooseMove(game, data.level) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
