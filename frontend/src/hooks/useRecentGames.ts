import { useCallback, useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { connectFourAbi } from '../config/ConnectFour.abi'
import { gameCreatedEvent } from '../config/events'
import { CONTRACT_ADDRESS, START_BLOCK } from '../config/contract'

export interface RecentGame {
  gameId: bigint
  creator: Address
  opponent: Address
  status: number
}

const CACHE_KEY = 'turn-by-turn:recent-games:v1'
const MAX_RECENT = 10

/**
 * Public game discovery built purely from contract events — no server, no
 * database. The result is a convenience INDEX; the authoritative state of any
 * game still comes from getGame() on the contract itself.
 */
export function useRecentGames() {
  const publicClient = usePublicClient()
  const [games, setGames] = useState<RecentGame[]>([])
  const [cached, setCached] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const load = useCallback(async () => {
    const address = CONTRACT_ADDRESS
    if (!publicClient || !address) return
    setLoading(true)
    setError(undefined)
    try {
      const latest = await publicClient.getBlockNumber()
      const fromBlock = START_BLOCK !== undefined ? START_BLOCK : latest - 50_000n
      const logs = await publicClient.getLogs({
        address,
        event: gameCreatedEvent,
        fromBlock: fromBlock > 0n ? fromBlock : 0n,
        toBlock: 'latest',
      })
      const recent = logs.slice(-MAX_RECENT).reverse()
      const ids = recent
        .map((log) => log.args.gameId)
        .filter((id): id is bigint => id !== undefined)
      const reads = await publicClient.multicall({
        contracts: ids.map((gameId) => ({
          address,
          abi: connectFourAbi,
          functionName: 'getGame' as const,
          args: [gameId] as const,
        })),
        allowFailure: true,
      })
      const next: RecentGame[] = []
      reads.forEach((r, i) => {
        const id = ids[i]
        if (!id || r.status !== 'success' || !r.result) return
        const g = r.result
        next.push({ gameId: id, creator: g.creator, opponent: g.opponent, status: Number(g.status) })
      })
      setGames(next)
      setCached(false)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), games: next.map((g) => ({ ...g, gameId: g.gameId.toString() })) }))
      } catch {
        // cache is best-effort only
      }
    } catch (err) {
      setError(
        'Could not load recent games from the chain right now — the list below may be stale. You can still open any game by id.',
      )
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as { games: { gameId: string; creator: Address; opponent: Address; status: number }[] }
          setGames(parsed.games.map((g) => ({ ...g, gameId: BigInt(g.gameId) })))
          setCached(true)
        }
      } catch {
        // ignore cache errors
      }
    } finally {
      setLoading(false)
    }
  }, [publicClient])

  useEffect(() => {
    void load()
  }, [load])

  return { games, cached, loading, error, reload: load }
}
