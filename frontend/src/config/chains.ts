import { defineChain } from 'viem'

/**
 * The only chain this app targets: Base Sepolia (chain id 84532).
 * Public RPC endpoints are layered behind a fallback transport so a single
 * flaky endpoint never blocks gameplay.
 */
export const baseSepolia = defineChain({
  id: 84532,
  name: 'Base Sepolia',
  nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        'https://sepolia.base.org',
        'https://base-sepolia-rpc.publicnode.com',
        'https://base-sepolia.gateway.tenderly.co',
      ],
    },
  },
  blockExplorers: {
    default: { name: 'Basescan', url: 'https://sepolia.basescan.org' },
  },
  testnet: true,
})

export const CHAIN_ID = baseSepolia.id
export const EXPLORER_URL = baseSepolia.blockExplorers.default.url
