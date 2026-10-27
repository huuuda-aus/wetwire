/** Direction index (N E S W) for a tile offset of exactly one step, otherwise null. */
export function dirFromOffset(dx: number, dy: number): 0 | 1 | 2 | 3 | null {
  if (dx === 0 && dy === -1) return 0;
  if (dx === 1 && dy === 0) return 1;
  if (dx === 0 && dy === 1) return 2;
  if (dx === -1 && dy === 0) return 3;
  return null;
}
