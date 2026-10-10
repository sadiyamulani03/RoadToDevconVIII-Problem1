import { useState } from 'react'
import { useConnection } from 'wagmi'
import { TxToast } from './TxToast'
import { useGameActions } from '../hooks/useGameActions'
import { useRecentGames } from '../hooks/useRecentGames'
import { navigate } from '../hooks/useHashRoute'
import { CONTRACT_ADDRESS } from '../config/contract'
import { EXPLORER_URL } from '../config/chains'
import { shortAddress, statusLabel } from '../lib/format'

export function Landing() {
  const { status } = useConnection()
  const actions = useGameActions()
  const { games, cached, loading, error } = useRecentGames()
  const [joinId, setJoinId] = useState('')

  const openGame = () => {
    const trimmed = joinId.trim()
    if (!/^\d+$/.test(trimmed) || BigInt(trimmed) <= 0n) return
    navigate(`/game/${trimmed}`)
  }

  return (
    <div className="landing">
      <header className="hero">
        <h1>
          Turn by Turn<span className="hero__accent"> · Connect Four</span>
        </h1>
        <p className="hero__tagline">
          A two-player game that waits for you. Every move is a transaction on{' '}
          <strong>Base Sepolia</strong> — play a piece, close the tab, and pick the game back up
          days later from any device.
        </p>
        <div className="hero__meta">
          <span className="pill">Chain id 84532</span>
          <span className="pill">No game server</span>
          <span className="pill">7-day move timeout</span>
        </div>
      </header>

      {!CONTRACT_ADDRESS && (
        <section className="panel panel--warn">
          <h2>Contract not configured</h2>
          <p>
            This build was produced without a deployed contract address. Deploy{' '}
            <code>ConnectFour</code> to Base Sepolia and run <code>npm run sync-deployment</code> in{' '}
            <code>frontend/</code> to enable gameplay.
          </p>
        </section>
      )}

      <section className="how">
        <div className="how__step">
          <span className="how__num">1</span>
          <h3>Create</h3>
          <p>Open a game with your wallet. You play gold and move first.</p>
        </div>
        <div className="how__step">
          <span className="how__num">2</span>
          <h3>Share</h3>
          <p>Send the invite link to a friend. They join with their own wallet, from anywhere.</p>
        </div>
        <div className="how__step">
          <span className="how__num">3</span>
          <h3>Take your time</h3>
          <p>
            Moves happen one at a time. The contract enforces turns, wins, draws — and if someone
            disappears for 7 days, the other player wins by timeout.
          </p>
        </div>
      </section>

      <section className="actions">
        <div className="panel action-card">
          <h2>Start a game</h2>
          <p>You become the creator (gold pieces) and receive a shareable invite link.</p>
          <button
            className="btn btn--primary btn--large"
            disabled={!CONTRACT_ADDRESS || actions.isBusy || status !== 'connected'}
            onClick={() => actions.createGame((id) => navigate(`/game/${id.toString()}`))}
          >
            {status === 'connected' ? 'Create game' : 'Connect a wallet to create'}
          </button>
        </div>

        <div className="panel action-card">
          <h2>Join a game</h2>
          <p>Received an invite link? Open it directly — or type the game id here.</p>
          <div className="join-row">
            <input
              inputMode="numeric"
              pattern="\d*"
              placeholder="Game id, e.g. 3"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && openGame()}
              aria-label="Game id"
            />
            <button className="btn" disabled={!joinId} onClick={openGame}>
              Open game
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>
          Recent games
          {cached && <span className="cached-badge">cached copy — contract is authoritative</span>}
        </h2>
        {!CONTRACT_ADDRESS ? (
          <p className="hint">Unavailable until a contract address is configured.</p>
        ) : loading ? (
          <p className="hint">Reading GameCreated events from Base Sepolia…</p>
        ) : (
          <>
            <p className="hint">
              Indexed directly from contract events — a discovery aid, not the source of truth.
              Opening any game loads its real state from the chain.
            </p>
            {error && <p className="inline-error">{error}</p>}
            {games.length === 0 && !error ? (
              <p className="hint">No games yet — be the first to create one.</p>
            ) : (
              <table className="recent-table">
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Creator</th>
                    <th>Opponent</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.gameId.toString()}>
                      <td>#{g.gameId.toString()}</td>
                      <td>{shortAddress(g.creator)}</td>
                      <td>{g.opponent === '0x0000000000000000000000000000000000000000' ? '—' : shortAddress(g.opponent)}</td>
                      <td>{statusLabel(g.status)}</td>
                      <td>
                        <button className="btn btn--ghost btn--small" onClick={() => navigate(`/game/${g.gameId.toString()}`)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>

      <section className="panel panel--quiet">
        <h2>How it stays fair</h2>
        <ul className="rules-list">
          <li>7 columns × 6 rows. Pieces fall to the lowest empty cell of the column you pick.</li>
          <li>The contract rejects moves out of your turn, moves into full columns, and moves outside columns 1–7.</li>
          <li>Four in a row — horizontally, vertically, or either diagonal — wins instantly; a full board with no line is a draw.</li>
          <li>
            Seven days without a move (measured onchain from the last action) lets the waiting player claim the win.
          </li>
          <li>
            There is no server: winners, turns and boards come from the{' '}
            <a href={EXPLORER_URL} target="_blank" rel="noreferrer">
              deployed contract
            </a>
            , verifiable by anyone.
          </li>
        </ul>
      </section>

      <TxToast state={actions.state} onDismiss={actions.reset} />
    </div>
  )
}
