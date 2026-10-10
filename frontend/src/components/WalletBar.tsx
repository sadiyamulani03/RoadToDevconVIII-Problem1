import { useConnect, useConnectors, useConnection, useDisconnect, useSwitchChain } from 'wagmi'
import { targetChainId } from '../config/wagmi'
import { shortAddress } from '../lib/format'
import { describeError } from '../lib/errors'
import { useState } from 'react'

export function WalletBar() {
  const { status, address, chainId, connector } = useConnection()
  const connectors = useConnectors()
  const { connect, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [connectError, setConnectError] = useState<string | undefined>(undefined)

  const expected = targetChainId()
  const wrongChain = status === 'connected' && chainId !== expected
  const hasInjected =
    typeof window !== 'undefined' &&
    (window as unknown as { ethereum?: unknown }).ethereum !== undefined

  if (status === 'connected' && address) {
    return (
      <div className="wallet-bar">
        <span className={`chain-chip ${wrongChain ? 'chain-chip--wrong' : ''}`}>
          {wrongChain ? `Wrong network (chain ${chainId ?? '?'})` : 'Base Sepolia'}
        </span>
        <span className="address-chip" title={address}>
          <span className="dot dot--live" />
          {shortAddress(address)}
          <span className="connector-name">{connector?.name}</span>
        </span>
        {wrongChain && (
          <button
            className="btn btn--small"
            onClick={() => switchChain({ chainId: expected })}
            disabled={isSwitching}
          >
            {isSwitching ? 'Switching…' : 'Switch to Base Sepolia'}
          </button>
        )}
        <button className="btn btn--ghost btn--small" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    )
  }

  const injected = connectors.find((c) => c.id === 'injected' || c.type === 'injected')
  const baseAccount = connectors.find((c) => c.id.includes('base') || c.name === 'Base Account')

  return (
    <div className="wallet-bar">
      <span className="wallet-bar__hint">Connect a wallet on Base Sepolia to play</span>
      {injected && (
        <button
          className="btn btn--small"
          disabled={isPending || !hasInjected}
          onClick={() => {
            setConnectError(undefined)
            connect(
              { connector: injected },
              { onError: (e) => setConnectError(describeError(e)) },
            )
          }}
        >
          {isPending ? 'Connecting…' : hasInjected ? 'Browser wallet' : 'Install a wallet'}
        </button>
      )}
      {baseAccount && (
        <button
          className="btn btn--small"
          disabled={isPending}
          onClick={() => {
            setConnectError(undefined)
            connect(
              { connector: baseAccount },
              { onError: (e) => setConnectError(describeError(e)) },
            )
          }}
        >
          Base Account
        </button>
      )}
      {!hasInjected && !baseAccount && (
        <a className="btn btn--small" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          Get MetaMask
        </a>
      )}
      {(connectError || error) && (
        <span className="wallet-bar__error">{connectError ?? describeError(error)}</span>
      )}
    </div>
  )
}
