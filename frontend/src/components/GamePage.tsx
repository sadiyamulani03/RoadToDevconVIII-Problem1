import { useEffect, useState } from 'react'
import { useConnection } from 'wagmi'
import { Board } from './Board'
import { Countdown } from './Countdown'
import { TxToast } from './TxToast'
import { useGame } from '../hooks/useGame'
import { useGameActions } from '../hooks/useGameActions'
import { findWinningCells } from '../lib/board'
import { navigate } from '../hooks/useHashRoute'
import { CONTRACT_ADDRESS } from '../config/contract'
import { EXPLORER_URL } from '../config/chains'
import { shortAddress, shareUrl, statusLabel } from '../lib/format'

const WAITING = 0
const ACTIVE = 1
const WON = 2
const DRAW = 3
const FORFEITED = 4

const ZERO = '0x0000000000000000000000000000000000000000'

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

export function GamePage({ gameId }: { gameId: bigint }) {
  const { game, board, isLoading, readError, refetch, isRefreshing } = useGame(gameId)
  const { status, address } = useConnection()
  const actions = useGameActions()
  const now = useNow(5_000)

  useEffect(() => {
    if (actions.state.phase === 'success') void refetch()
  }, [actions.state.phase, refetch])

  if (!CONTRACT_ADDRESS) {
    return (
      <section className="panel">
        <h2>Contract not configured</h2>
        <p>
          This build has no Base Sepolia contract address. Deploy the contract, then run{' '}
          <code>npm run sync-deployment</code> inside <code>frontend/</code> (or set{' '}
          <code>VITE_CONTRACT_ADDRESS</code>) and rebuild.
        </p>
      </section>
    )
  }

  if (isLoading) {
    return (
      <section className="panel panel--skeleton" aria-busy="true">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--board" />
        <span className="sr-only">Loading game state from Base Sepolia…</span>
      </section>
    )
  }

  if (!game || !board) {
    return (
      <section className="panel">
        <h2>Game not found</h2>
        <p>
          {readError
            ? 'No game with this id exists on Base Sepolia — check the link, or pick a game from the lobby.'
            : 'No game with this id exists on Base Sepolia.'}
        </p>
        <button className="btn" onClick={() => navigate('/')}>
          Back to lobby
        </button>
      </section>
    )
  }

  const connected = status === 'connected' && address !== undefined
  const sameAddr = (a: string | undefined, b: string) => !!a && a.toLowerCase() === b.toLowerCase()
  const isCreator = connected && sameAddr(address, game.creator)
  const isOpponent = connected && game.opponent !== ZERO && sameAddr(address, game.opponent)
  const isParticipant = isCreator || isOpponent
  const yourPiece: 0 | 1 | 2 = isCreator ? 1 : isOpponent ? 2 : 0
  const yourTurn =
    game.status === ACTIVE && isParticipant && sameAddr(address, game.currentTurn)
  const finished = game.status === WON || game.status === DRAW || game.status === FORFEITED
  const creatorTurn = sameAddr(game.currentTurn, game.creator)
  const claimable =
    game.status === ACTIVE && isParticipant && !yourTurn && now > Number(game.timeoutDeadline)
  const winningCells = finished && game.status === WON ? findWinningCells(board) : []

  return (
    <section className="game">
      <header className="game__header">
        <div className="game__heading">
          <span className="game__id">Game #{gameId.toString()}</span>
          <span className={`status-badge status-badge--${game.status}`}>{statusLabel(game.status)}</span>
          {isRefreshing && <span className="refreshing">syncing…</span>}
        </div>
        <div className="game__links">
          <a href={`${EXPLORER_URL}/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
            Contract on Basescan
          </a>
          <button className="btn btn--ghost btn--small" onClick={() => navigate('/')}>
            Lobby
          </button>
        </div>
      </header>

      <div className="players">
        <PlayerSlot
          label="Creator · gold"
          address={game.creator}
          piece={1}
          isYou={isCreator}
          active={game.status !== WAITING && creatorTurn}
        />
        <PlayerSlot
          label="Opponent · red"
          address={game.opponent}
          piece={2}
          waiting={game.opponent === ZERO}
          isYou={isOpponent}
          active={game.status !== WAITING && !creatorTurn}
        />
      </div>

      {game.status === WAITING && (
        <div className="panel">
          <h2>Waiting for an opponent</h2>
          <p>
            Share this link with someone you want to play against. They can join from any phone or
            computer — the game lives on Base Sepolia, not in your browser.
          </p>
          <ShareLink url={shareUrl(gameId.toString())} />
          {!isCreator && (
            <div className="join-cta">
              {connected ? (
                <button
                  className="btn btn--primary btn--large"
                  disabled={actions.isBusy}
                  onClick={() => actions.joinGame(gameId)}
                >
                  Join this game as the opponent
                </button>
              ) : (
                <p className="hint">
                  Connect a wallet (top right) to join. Joining costs a little Base Sepolia test ETH,
                  or nothing at all with a sponsored Base Account.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {game.status === ACTIVE && (
        <div className="panel">
          <div className={`turn-banner ${yourTurn ? 'turn-banner--yours' : ''}`}>
            {yourTurn ? (
              <strong>Your turn — pick a column</strong>
            ) : connected ? (
              <span>
                Waiting for {creatorTurn ? 'the creator' : 'the opponent'} ({shortAddress(game.currentTurn)})
              </span>
            ) : (
              <span>
                {shortAddress(game.currentTurn)} to move — connect a wallet to follow along
              </span>
            )}
          </div>

          <Board
            board={board}
            disabled={!yourTurn || actions.isBusy}
            onColumn={(col) => actions.makeMove(gameId, col)}
            yourPiece={yourPiece}
          />

          {isParticipant && (
            <div className="timeout-panel">
              <h3>Inactivity rule</h3>
              <p>
                Games always wait for you. If the other player goes quiet, you may claim the win{' '}
                <strong>7 days</strong> after the last move.{' '}
                {claimable ? (
                  <span className="countdown countdown--ready">The window has passed — you can claim now.</span>
                ) : (
                  <>
                    Time left for the player on turn: <Countdown deadline={game.timeoutDeadline} />
                  </>
                )}
              </p>
              {claimable && (
                <button
                  className="btn btn--danger"
                  disabled={actions.isBusy}
                  onClick={() => actions.claimTimeout(gameId)}
                >
                  Claim win by timeout
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {finished && (
        <div className="panel">
          <div className={`result result--${game.status}`}>
            <h2>
              {game.status === DRAW
                ? 'Draw — the board filled up with no four in a row'
                : `${shortAddress(game.winner)} wins${game.status === FORFEITED ? ' by timeout' : ' — four in a row'}`}
            </h2>
            {isParticipant && (
              <p className="result__you">
                {sameAddr(address, game.winner) ? 'You won this game.' : 'You lost this game.'}
              </p>
            )}
          </div>
          <Board board={board} disabled onColumn={() => {}} winningCells={winningCells} />
          <div className="finished-actions">
            <button className="btn btn--primary" onClick={() => navigate('/')}>
              Create another game
            </button>
            <button className="btn btn--ghost" onClick={() => navigate(`/game/${gameId.toString()}`)}>
              Keep viewing this game
            </button>
          </div>
        </div>
      )}

      <TxToast state={actions.state} onDismiss={actions.reset} />
    </section>
  )
}

function PlayerSlot({
  label,
  address,
  piece,
  waiting,
  isYou,
  active,
}: {
  label: string
  address: string
  piece: 1 | 2
  waiting?: boolean
  isYou?: boolean
  active?: boolean
}) {
  return (
    <div className={`player-slot ${active ? 'player-slot--active' : ''}`}>
      <span className={`disc disc--p${piece}`} aria-hidden="true" />
      <div className="player-slot__body">
        <div className="player-slot__label">{label}</div>
        {waiting ? (
          <div className="player-slot__empty">open — share the invite link</div>
        ) : (
          <div className="player-slot__addr">
            {shortAddress(address)}
            {isYou && <span className="player-slot__you">you</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="share-link">
      <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
      <button
        className="btn btn--primary"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 2000)
          })
        }}
      >
        {copied ? 'Copied' : 'Copy invite link'}
      </button>
    </div>
  )
}
