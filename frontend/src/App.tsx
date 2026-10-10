import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from './config/wagmi'
import { WalletBar } from './components/WalletBar'
import { Landing } from './components/Landing'
import { GamePage } from './components/GamePage'
import { parseGameRoute, useHashRoute } from './hooks/useHashRoute'

const queryClient = new QueryClient()

function Routes() {
  const path = useHashRoute()
  const gameId = parseGameRoute(path)
  if (gameId !== undefined) return <GamePage gameId={gameId} />
  return <Landing />
}

export function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="app">
          <header className="topbar">
            <a className="brand" href="#/">
              <img src="/favicon.svg" alt="" width="28" height="28" />
              <span>Turn by Turn</span>
            </a>
            <WalletBar />
          </header>
          <main>
            <Routes />
          </main>
          <footer className="footer">
            <span>Turn by Turn — asynchronous Connect Four, recorded on Base Sepolia (chain 84532).</span>
            <span>Every rule is enforced by the contract. No game server, no accounts, no custody.</span>
          </footer>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
