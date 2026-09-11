// Face across the board toward its center, including after moves and promotions.
export function knightFacesRight(square, bottom = 'w') {
  return (square[0] < 'e') === (bottom === 'w');
}
