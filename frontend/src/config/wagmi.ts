import { baseAccount, injected } from 'wagmi/connectors'
import { createConfig, fallback, http } from 'wagmi'
import { baseSepolia } from './chains'

/**
 * Wagmi configuration.
 *
 * Chains: Base Sepolia ONLY. The app never silently talks to Base mainnet
 * or a localhost chain; a development chain can be attached explicitly via
 * VITE_LOCAL_RPC for contract-level end-to-end testing.
 *
 * Connectors:
 *  - injected(): browser-extension wallets such as MetaMask (EOA path).
 *  - baseAccount(): the Base Account smart-wallet SDK. When the connected
 *    Base Account wallet reports `paymasterService` support and a paymaster
 *    URL is configured (VITE_PAYMASTER_URL), moves can be gas-sponsored.
 */
const transports = {
  [baseSepolia.id]: fallback([
    http(baseSepolia.rpcUrls.default.http[0]),
    http(baseSepolia.rpcUrls.default.http[1]),
    http(baseSepolia.rpcUrls.default.http[2]),
  ]),
}

const localRpc = import.meta.env.VITE_LOCAL_RPC as string | undefined

export const wagmiConfig = createConfig({
  chains: localRpc
    ? [
        baseSepolia,
        {
          ...baseSepolia,
          id: Number(import.meta.env.VITE_LOCAL_CHAIN_ID ?? 31337),
          name: 'Local Devnet',
          rpcUrls: { default: { http: [localRpc] } },
        },
      ]
    : [baseSepolia],
  connectors: [injected(), baseAccount({ appName: 'Turn by Turn' })],
  transports: {
    ...transports,
    ...(localRpc
      ? { [Number(import.meta.env.VITE_LOCAL_CHAIN_ID ?? 31337)]: http(localRpc) }
      : {}),
  },
})

export function targetChainId(): number {
  if (localRpc) return Number(import.meta.env.VITE_LOCAL_CHAIN_ID ?? 31337)
  return baseSepolia.id
}
