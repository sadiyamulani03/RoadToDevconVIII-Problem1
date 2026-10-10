import { useReadContract, useWatchContractEvent } from 'wagmi'
import type { Address } from 'viem'
import { connectFourAbi } from '../config/ConnectFour.abi'
import { CONTRACT_ADDRESS } from '../config/contract'
import { masksToBoard } from '../lib/board'
import type { Cell } from '../lib/board'

export type GameData = {
  creator: Address
  opponent: Address
  currentTurn: Address
  winner: Address
  status: number
  lastMoveTimestamp: bigint
  timeoutDeadline: bigint
  playerOnePieces: bigint
  playerTwoPieces: bigint
}

/**
 * Authoritative game state, read directly from the contract.
 * - Periodic refetch keeps state fresh even if events are missed.
 * - Game events for this id trigger an immediate refetch, so the opponent's
 *   move appears as soon as it is mined — from any device, at any time.
 */
export function useGame(gameId: bigint | undefined) {
  const enabled = Boolean(CONTRACT_ADDRESS) && gameId !== undefined && gameId > 0n

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: connectFourAbi,
    functionName: 'getGame',
    args: gameId !== undefined ? [gameId] : undefined,
    query: { enabled, refetchInterval: 15_000 },
  })

  const refresh = () => void refetch()

  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: connectFourAbi,
    eventName: 'MoveMade',
    onLogs: refresh,
    enabled,
  })
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: connectFourAbi,
    eventName: 'GameJoined',
    onLogs: refresh,
    enabled,
  })
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: connectFourAbi,
    eventName: 'GameWon',
    onLogs: refresh,
    enabled,
  })
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: connectFourAbi,
    eventName: 'GameDrawn',
    onLogs: refresh,
    enabled,
  })
  useWatchContractEvent({
    address: CONTRACT_ADDRESS,
    abi: connectFourAbi,
    eventName: 'GameForfeited',
    onLogs: refresh,
    enabled,
  })

  const game = data as GameData | undefined
  const board: Cell[] | undefined = game
    ? masksToBoard(game.playerOnePieces, game.playerTwoPieces)
    : undefined

  return {
    game,
    board,
    isLoading: isLoading && enabled,
    isRefreshing: isFetching,
    readError: error instanceof Error ? error.message : error ? String(error) : undefined,
    refetch,
    updatedAt: dataUpdatedAt,
  }
}
