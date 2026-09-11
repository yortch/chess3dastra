import { knightFacesRight } from './piece-orientation.js';

const silhouettes = {
  p: '<circle cx="24" cy="13" r="6"/><path d="M20 19h8l-1 7 5 9H16l5-9z"/>',
  n: '<path d="M14 35c0-8 1-14 7-19l-2-7 7 3 4-4 1 9 7 7-3 6-9-3-2 8z"/><path d="M25 18l2 1m3 8-5-4" fill="none"/>',
  b: '<path d="M24 6c-2 5-9 8-9 15 0 5 4 7 7 8l-6 6h16l-6-6c3-1 7-3 7-8 0-7-7-10-9-15z"/><path d="m26 13-5 9" fill="none"/>',
  r: '<path d="M13 8h6v6h3V8h4v6h3V8h6v13l-5 4 1 10H17l1-10-5-4z"/><path d="M15 21h18M18 26h12" fill="none"/>',
  q: '<path d="m13 15 4 17h14l4-17-8 8-3-12-3 12z"/><circle cx="12" cy="12" r="3"/><circle cx="24" cy="8" r="3"/><circle cx="36" cy="12" r="3"/><path d="M17 31h14l2 4H15z"/>',
  k: '<path d="M21 4h6v5h5v5h-5v5h-6v-5h-5V9h5z"/><path d="M24 21c-7-9-17-2-10 7l5 4-3 3h16l-3-3 5-4c7-9-3-16-10-7z"/><path d="M24 22v9" fill="none"/>'
};
export function createFlatBoard(container, onSelect, names) {
  const squares = new Map();
  for (let rank = 8; rank >= 1; rank--) for (let file = 0; file < 8; file++) {
    const square = String.fromCharCode(97 + file) + rank;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.square = square;
    button.addEventListener('click', () => onSelect(square));
    container.append(button);
    squares.set(square, button);
  }
  return {
    render(game, { selected, legal, bottom }) {
      const last = game.history({ verbose: true }).at(-1);
      const destinations = new Set(legal.map(move => move.to));
      const check = game.isCheck();
      const buttons = [];
      for (const [square, button] of squares) {
        const file = square.charCodeAt(0) - 97;
        const rank = Number(square[1]);
        const piece = game.get(square);
        const isCheck = check && piece?.type === 'k' && piece.color === game.turn();
        const isLegal = destinations.has(square);
        button.className = [
          'flat-square', (file + rank) % 2 ? 'dark' : '',
          piece ? 'occupied' : '', last && [last.from, last.to].includes(square) ? 'last' : '',
          selected === square ? 'selected' : '', isLegal ? 'legal' : '', isCheck ? 'check' : ''
        ].filter(Boolean).join(' ');
        button.setAttribute('aria-pressed', String(selected === square));
        button.setAttribute('aria-label', `${square}: ${piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}` : 'empty'}${isLegal ? ', legal destination' : ''}${isCheck ? ', in check' : ''}`);
        const mirror = piece?.type === 'n' && !knightFacesRight(square, bottom);
        const svg = piece ? `<svg class="flat-piece ${piece.color === 'b' ? 'black' : ''}" viewBox="0 0 48 48" aria-hidden="true"><g${mirror ? ' transform="translate(48 0) scale(-1 1)"' : ''}>${silhouettes[piece.type]}<path d="M15 35h18l3 7H12z"/><path d="M14 38h20" fill="none"/></g></svg>` : '';
        const fileLabel = rank === (bottom === 'w' ? 1 : 8) ? `<span class="square-coordinate square-file" aria-hidden="true">${square[0]}</span>` : '';
        const rankLabel = file === (bottom === 'w' ? 0 : 7) ? `<span class="square-coordinate square-rank" aria-hidden="true">${rank}</span>` : '';
        const content = svg + fileLabel + rankLabel;
        if (button.innerHTML !== content) button.innerHTML = content;
        buttons.push(button);
      }
      if (bottom === 'b') buttons.reverse();
      // Match DOM order to the displayed orientation for keyboard navigation.
      if (container.firstElementChild !== buttons[0]) {
        const focused = document.activeElement;
        container.append(...buttons);
        if (buttons.includes(focused)) focused.focus({ preventScroll: true });
      }
    },
    resize(width, height) {
      const size = Math.max(0, Math.min(width - 32, height - 24, 680));
      container.style.width = `${size}px`;
      container.style.height = `${size}px`;
    }
  };
}
