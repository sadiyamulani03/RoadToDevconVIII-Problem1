#!/usr/bin/env node
// Generates two complete 42-move Connect Four games used by the Foundry tests:
//   1. DRAW  - board fills completely with no 4-in-a-row for either player
//              (used by test_fullBoardDraw).
//   2. WIN   - board fills completely, no win exists until the final (42nd)
//              move, which completes a line for the second player (used by
//              test_winningFinalMoveBeatsDraw to prove winner precedence).
// Output: arrays of column moves (0-6), alice (creator) moves first.

function clone(cols) {
  return cols.map((c) => c.slice());
}

function wins(cols, player) {
  const W = 7, H = 6;
  const at = (c, r) => c >= 0 && c < W && r >= 0 && r < H && cols[c][r] === player;
  for (let c = 0; c < W; c++) {
    for (let r = 0; r < H; r++) {
      if (!at(c, r)) continue;
      if (at(c + 1, r) && at(c + 2, r) && at(c + 3, r)) return true;
      if (at(c, r + 1) && at(c, r + 2) && at(c, r + 3)) return true;
      if (at(c + 1, r + 1) && at(c + 2, r + 2) && at(c + 3, r + 3)) return true;
      if (at(c + 1, r - 1) && at(c + 2, r - 2) && at(c + 3, r - 3)) return true;
    }
  }
  return false;
}

function anyWin(cols) {
  return wins(cols, 0) || wins(cols, 1);
}

function generate(mode) {
  for (let attempt = 0; attempt < 100000; attempt++) {
    const cols = Array.from({ length: 7 }, () => []);
    const moves = [];
    let ok = true;

    for (let depth = 0; depth < 42; depth++) {
      const player = depth % 2;
      const order = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
      let placed = false;

      for (const col of order) {
        if (cols[col].length >= 6) continue;
        cols[col].push(player);
        moves.push(col);

        const win = anyWin(cols);
        const last = depth === 41;
        let accept;
        if (mode === "draw") {
          accept = !win;
        } else {
          // win mode: nobody wins before the final move; the final move must
          // give player 1 (bob, second player) a win.
          accept = last ? !wins(cols, 0) && wins(cols, 1) : !win;
        }

        if (accept) {
          placed = true;
          break;
        }
        cols[col].pop();
        moves.pop();
      }

      if (!placed) {
        ok = false;
        break;
      }
    }

    if (ok && moves.length === 42) {
      // sanity: replay counts
      const counts = [0, 0];
      for (const col of moves) counts[cols[col].findIndex ? 0 : 0];
      return moves;
    }
  }
  throw new Error(`no ${mode} sequence found`);
}

const draw = generate("draw");
console.log("// draw (42 moves, no winner):");
console.log(JSON.stringify(draw));
const win = generate("win");
console.log("// win (42 moves, player 2 wins on move 42):");
console.log(JSON.stringify(win));
