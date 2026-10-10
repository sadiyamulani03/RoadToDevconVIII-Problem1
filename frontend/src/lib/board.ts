export const WIDTH = 7
export const HEIGHT = 6

/** 0 = empty, 1 = creator piece, 2 = opponent piece. Display order: index = row * 7 + column with row 0 at the TOP. */
export type Cell = 0 | 1 | 2
export type Board = readonly Cell[]

/** Decodes the two packed bitmasks from getGame() into display-ordered cells. Bit i = storage cell (row * 7 + column), row 0 = bottom. */
export function masksToBoard(p1: bigint, p2: bigint): Cell[] {
  const board: Cell[] = new Array(42).fill(0)
  for (let col = 0; col < WIDTH; col++) {
    for (let storageRow = 0; storageRow < HEIGHT; storageRow++) {
      const bit = storageRow * WIDTH + col
      const on1 = (p1 >> BigInt(bit)) & 1n
      const on2 = (p2 >> BigInt(bit)) & 1n
      if (on1 === 1n) board[(HEIGHT - 1 - storageRow) * WIDTH + col] = 1
      else if (on2 === 1n) board[(HEIGHT - 1 - storageRow) * WIDTH + col] = 2
    }
  }
  return board
}

/** Presentation-only scan for the winning line of a finished game. The contract's own decision (status/winner) remains authoritative. */
export function findWinningCells(board: Board): number[] {
  const lines: number[][] = []
  for (let r = 0; r < HEIGHT; r++) {
    for (let c = 0; c < WIDTH; c++) {
      const i = r * WIDTH + c
      if (c + 3 < WIDTH) lines.push([i, i + 1, i + 2, i + 3])
      if (r + 3 < HEIGHT)
        lines.push([i, i + WIDTH, i + 2 * WIDTH, i + 3 * WIDTH])
      if (c + 3 < WIDTH && r + 3 < HEIGHT)
        lines.push([i, i + WIDTH + 1, i + 2 * WIDTH + 2, i + 3 * WIDTH + 3])
      if (c >= 3 && r + 3 < HEIGHT)
        lines.push([i, i + WIDTH - 1, i + 2 * WIDTH - 2, i + 3 * WIDTH - 3])
    }
  }
  for (const line of lines) {
    const v = board[line[0]!]
    if (v !== 0 && line.every((idx) => board[idx] === v)) return line
  }
  return []
}

/** Display index of the lowest empty cell in a column, or -1 when full. Uses display-ordered board; returns the cell index to render a hover piece at. */
export function dropPreviewIndex(board: Board, col: number): number {
  for (let r = HEIGHT - 1; r >= 0; r--) {
    const i = r * WIDTH + col
    if (board[i] === 0) return i
  }
  return -1
}
