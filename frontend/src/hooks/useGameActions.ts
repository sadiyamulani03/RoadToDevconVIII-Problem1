import { useCallback, useState } from 'react'
import { useConnection, useConnectorClient, usePublicClient } from 'wagmi'
import { encodeFunctionData, parseEventLogs, walletActions, type Account, type Address, type Hex } from 'viem'
import { connectFourAbi } from '../config/ConnectFour.abi'
import { gameCreatedEvent } from '../config/events'
import { CONTRACT_ADDRESS, PAYMASTER_URL, START_BLOCK } from '../config/contract'
import { targetChainId } from '../config/wagmi'
import { describeError } from '../lib/errors'

export type TxPhase = 'idle' | 'signing' | 'pending' | 'success' | 'error'

export interface TxState {
  phase: TxPhase
  description: string
  ref: string | undefined
  error: string | undefined
}

const IDLE: TxState = { phase: 'idle', description: '', ref: undefined, error: undefined }

type Fn = (typeof connectFourAbi)[number] & { type: 'function' }

/** Structural probe so sponsorship detection works on any wallet client shape. */
interface SponsorshipProbe {
  account?: Account | undefined
  getCapabilities: (args: { account: Account }) => Promise<unknown>
}

async function sponsorshipAvailable(wallet: SponsorshipProbe | null | undefined): Promise<boolean> {
  if (!PAYMASTER_URL || !wallet?.account) return false
  try {
    const caps = await wallet.getCapabilities({ account: wallet.account })
    const chainCaps = (caps as Record<string, Record<string, { supported?: boolean }>>)[
      targetChainId()
    ]
    return chainCaps?.paymasterService?.supported === true
  } catch {
    return false
  }
}

/**
 * Contract write orchestration for all four game actions.
 *
 * Two transaction paths:
 *  1. Sponsored smart-wallet path (EIP-5792 wallet_sendCalls + paymaster):
 *     used when the connected wallet reports paymasterService support AND a
 *     paymaster URL is configured. The user pays no gas at all.
 *  2. Standard EOA path (MetaMask etc.): a regular transaction that pays gas
 *     in Base Sepolia test ETH (free from public faucets — never purchased).
 *
 * The contract enforces all game rules regardless of the path used.
 */
export function useGameActions() {
  const [state, setState] = useState<TxState>(IDLE)
  const { status, chainId, address } = useConnection()
  const { data: walletClient } = useConnectorClient()
  const publicClient = usePublicClient()

  const wrongChain = status === 'connected' && chainId !== targetChainId()

  const reset = useCallback(() => setState(IDLE), [])

  const run = useCallback(
    async (
      label: string,
      fn: () => Promise<string>,
      onSuccess?: (ref: string) => Promise<void>,
    ) => {
      if (state.phase === 'signing' || state.phase === 'pending') return // duplicate-submit guard
      if (status !== 'connected' || !walletClient || !publicClient || !CONTRACT_ADDRESS) {
        setState({
          phase: 'error',
          description: label,
          ref: undefined,
          error:
            status !== 'connected'
              ? 'Connect a wallet first.'
              : 'The contract address is not configured for this build.',
        })
        return
      }
      if (wrongChain) {
        setState({
          phase: 'error',
          description: label,
          ref: undefined,
          error: 'Your wallet is on the wrong network. Switch to Base Sepolia (84532) and retry.',
        })
        return
      }
      setState({ phase: 'signing', description: label, ref: undefined, error: undefined })
      try {
        const ref = await fn()
        setState({ phase: 'pending', description: label, ref, error: undefined })
        if (onSuccess) await onSuccess(ref)
        setState({ phase: 'success', description: label, ref, error: undefined })
      } catch (err) {
        setState({ phase: 'error', description: label, ref: undefined, error: describeError(err) })
      }
    },
    [status, walletClient, publicClient, wrongChain, state.phase],
  )

  /** Sends one contract call via the best available path; returns a tx hash or bundle id. */
  const send = useCallback(
    async (functionName: Fn['name'], args: readonly unknown[]): Promise<string> => {
      if (!walletClient || !publicClient || !CONTRACT_ADDRESS || !walletClient.account) {
        throw new Error('Wallet not ready')
      }
      const wallet = walletClient.extend(walletActions)
      const data = encodeFunctionData({
        abi: connectFourAbi,
        functionName,
        args: args as never,
      })

      if (await sponsorshipAvailable(wallet)) {
        const result = await wallet.sendCalls({
          account: walletClient.account,
          chain: walletClient.chain,
          calls: [{ to: CONTRACT_ADDRESS, data }],
          capabilities: { paymasterService: { url: PAYMASTER_URL } },
        })
        await wallet.waitForCallsStatus({ id: result.id })
        return result.id
      }

      const hash = await wallet.sendTransaction({
        account: walletClient.account,
        chainId: targetChainId(),
        to: CONTRACT_ADDRESS,
        data,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      return hash
    },
    [walletClient, publicClient],
  )

  /** Locates the id of the newest game created by `creator` from chain events (authoritative, no server). */
  const findLatestGameId = useCallback(
    async (creator: Address): Promise<bigint | undefined> => {
      if (!publicClient || !CONTRACT_ADDRESS) return undefined
      try {
        const latest = await publicClient.getBlockNumber()
        const fromBlock = START_BLOCK !== undefined ? START_BLOCK : latest - 50_000n
        const logs = await publicClient.getLogs({
          address: CONTRACT_ADDRESS,
          event: gameCreatedEvent,
          args: { creator },
          fromBlock: fromBlock > 0n ? fromBlock : 0n,
          toBlock: 'latest',
        })
        if (logs.length > 0) {
          const last = logs[logs.length - 1]!
          if (last.args.gameId !== undefined) return last.args.gameId
        }
      } catch {
        // fall through to gameCount
      }
      try {
        return await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: connectFourAbi,
          functionName: 'getGameCount',
        })
      } catch {
        return undefined
      }
    },
    [publicClient],
  )

  const createGame = useCallback(
    (onDone: (gameId: bigint, ref: string) => void) => {
      void run(
        'Creating game',
        () => send('createGame', []),
        async (ref) => {
          // Preferred: read GameCreated straight out of this transaction's
          // receipt — exact and race-free even if others create games at
          // the same time.
          if (publicClient && address && /^0x[0-9a-fA-F]{64}$/.test(ref)) {
            try {
              const receipt = await publicClient.getTransactionReceipt({ hash: ref as Hex })
              const logs = parseEventLogs({
                abi: connectFourAbi,
                logs: receipt.logs,
                eventName: 'GameCreated',
              })
              const mine = logs.find(
                (log) => log.args.creator?.toLowerCase() === address.toLowerCase(),
              )
              if (mine?.args.gameId !== undefined) {
                onDone(mine.args.gameId, ref)
                return
              }
            } catch {
              // fall through to the event-scan fallback
            }
          }
          const id = address ? await findLatestGameId(address) : undefined
          if (id !== undefined) onDone(id, ref)
        },
      )
    },
    [run, send, findLatestGameId, address, publicClient],
  )

  const joinGame = useCallback(
    (gameId: bigint) => {
      void run('Joining game', () => send('joinGame', [gameId]))
    },
    [run, send],
  )

  const makeMove = useCallback(
    (gameId: bigint, column: number) => {
      void run(`Placing piece in column ${column + 1}`, () => send('makeMove', [gameId, column]))
    },
    [run, send],
  )

  const claimTimeout = useCallback(
    (gameId: bigint) => {
      void run('Claiming win by timeout', () => send('claimTimeout', [gameId]))
    },
    [run, send],
  )

  return { state, reset, createGame, joinGame, makeMove, claimTimeout, wrongChain, isBusy: state.phase === 'signing' || state.phase === 'pending' }
}

export type { Hex }
