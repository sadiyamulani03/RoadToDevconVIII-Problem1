import { useEffect, useRef, useState } from 'react'
import type { Board as BoardType } from '../lib/board'
import { dropPreviewIndex, HEIGHT, WIDTH } from '../lib/board'

interface BoardProps {
  board: BoardType
  disabled: boolean
  onColumn: (col: number) => void
  winningCells?: number[]
  /** 1 or 2 when it is the connected player's turn — used for the hover ghost. */
  yourPiece?: 0 | 1 | 2
}

export function Board({ board, disabled, onColumn, winningCells = [], yourPiece }: BoardProps) {
  const [hoverCol, setHoverCol] = useState<number | null>(null)
  const [dropping, setDropping] = useState<Set<number>>(new Set())
  const prevRef = useRef<BoardType>(board)

  useEffect(() => {
    const prev = prevRef.current
    const changed = new Set<number>()
    for (let i = 0; i < board.length; i++) {
      if (prev[i] === 0 && board[i] !== 0) changed.add(i)
    }
    prevRef.current = board
    if (changed.size > 0) {
      setDropping(changed)
      const t = window.setTimeout(() => setDropping(new Set()), 450)
      return () => window.clearTimeout(t)
    }
  }, [board])

  const win = new Set(winningCells)

  return (
    <div className="board-wrap" role="group" aria-label="Connect Four board, 7 columns by 6 rows">
      <div className="board">
        {Array.from({ length: WIDTH }, (_, col) => {
          const previewIndex = hoverCol === col ? dropPreviewIndex(board, col) : -1
          const columnFull = dropPreviewIndex(board, col) === -1
          return (
            <button
              key={col}
              type="button"
              className={`board__column ${disabled || columnFull ? 'board__column--disabled' : ''}`}
              aria-label={`Play column ${col + 1}${columnFull ? ' (full)' : ''}`}
              disabled={disabled || columnFull}
              onClick={() => onColumn(col)}
              onMouseEnter={() => setHoverCol(col)}
              onMouseLeave={() => setHoverCol((c) => (c === col ? null : c))}
              onFocus={() => setHoverCol(col)}
              onBlur={() => setHoverCol((c) => (c === col ? null : c))}
            >
              {Array.from({ length: HEIGHT }, (_, displayRow) => {
                const i = displayRow * WIDTH + col
                const value = board[i]
                const classes = ['cell']
                if (value === 1) classes.push('cell--p1')
                if (value === 2) classes.push('cell--p2')
                if (dropping.has(i)) classes.push('cell--drop')
                if (win.has(i)) classes.push('cell--win')
                if (i === previewIndex && yourPiece) {
                  classes.push(yourPiece === 1 ? 'cell--ghost-p1' : 'cell--ghost-p2')
                }
                return <div key={i} className={classes.join(' ')} />
              })}
            </button>
          )
        })}
      </div>
      <div className="board__labels" aria-hidden="true">
        {Array.from({ length: WIDTH }, (_, col) => (
          <span key={col}>{col + 1}</span>
        ))}
      </div>
    </div>
  )
}
