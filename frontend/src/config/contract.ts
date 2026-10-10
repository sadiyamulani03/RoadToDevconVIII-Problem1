/**
 * Deployment wiring for the Connect Four contract.
 *
 * Priority:
 *  1. VITE_CONTRACT_ADDRESS environment variable (local dev / CI overrides).
 *  2. The committed deployment constant below, written by
 *     `scripts/sync-deployment.mjs` after a Base Sepolia deployment.
 *
 * When neither is present the UI enters an explicit "not configured" state
 * instead of guessing an address. VITE_DEPLOY_BLOCK (optional) enables the
 * recent-games index without scanning from genesis.
 */
import { zeroAddress, type Address } from 'viem'
import { GENERATED_ADDRESS, GENERATED_DEPLOY_BLOCK } from './deployment.generated'

/** Committed deployment constant, refreshed by ../scripts/sync-deployment.mjs. */
export const DEPLOYED_CONTRACT_ADDRESS = GENERATED_ADDRESS

export const DEPLOYMENT_BLOCK = GENERATED_DEPLOY_BLOCK

const envAddress = import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined
const raw = envAddress && envAddress.length > 0 ? envAddress : DEPLOYED_CONTRACT_ADDRESS

export const CONTRACT_ADDRESS: Address | undefined =
  raw && raw.startsWith('0x') && raw.length === 42 && raw !== zeroAddress
    ? (raw as Address)
    : undefined

const envBlock = import.meta.env.VITE_DEPLOY_BLOCK as string | undefined
export const START_BLOCK: bigint | undefined = envBlock
  ? BigInt(envBlock)
  : DEPLOYMENT_BLOCK > 0n
    ? DEPLOYMENT_BLOCK
    : undefined

export const PAYMASTER_URL = (import.meta.env.VITE_PAYMASTER_URL as string | undefined) || ''
