import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from 'viem'

/** Human-readable messages for the contract's custom errors. */
const CONTRACT_ERRORS: Record<string, string> = {
  GameNotFound: 'That game does not exist on Base Sepolia.',
  NotJoinable: 'This game already has two players.',
  CannotJoinOwnGame: 'You created this game — share the link so someone else can join.',
  GameNotActive: 'This game has finished; no more moves are accepted.',
  NotYourTurn: 'It is not your turn right now.',
  NotAPlayer: 'Only the two players in this game can claim a timeout.',
  InvalidColumn: 'Choose a column between 0 and 6.',
  ColumnFull: 'That column is full — pick another one.',
  TimeoutNotReached: 'The inactivity window has not elapsed yet.',
}

function shorten(message: string): string {
  const first = message.split('\n')[0] ?? message
  return first.length > 180 ? first.slice(0, 177) + '…' : first
}

/** Maps any thrown wallet/RPC/contract error to a short, user-facing explanation. */
export function describeError(err: unknown): string {
  if (err instanceof UserRejectedRequestError) {
    return 'You rejected the request in your wallet.'
  }
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && CONTRACT_ERRORS[name]) return CONTRACT_ERRORS[name]!
      if (reverted.data?.errorName === undefined && reverted.reason) {
        return `The contract rejected the transaction: ${reverted.reason}`
      }
    }
    if (err.name === 'InsufficientFundsError') {
      return 'Your wallet does not have enough Base Sepolia ETH to pay for gas. See the wallet setup guide in the README.'
    }
    if (/fetch|network|http|timeout|Failed to fetch|URL/i.test(err.message)) {
      return 'Could not reach the Base Sepolia RPC endpoint. Your game is safe onchain — please retry in a moment.'
    }
    return shorten(err.shortMessage || err.message)
  }
  const anyErr = err as { code?: number; message?: string }
  if (anyErr?.code === 4001) return 'You rejected the request in your wallet.'
  if (anyErr?.message) return shorten(anyErr.message)
  return 'Something went wrong. Please try again.'
}
