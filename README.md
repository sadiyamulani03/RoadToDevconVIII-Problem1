# Turn by Turn — Asynchronous Connect Four on Base Sepolia

A two-player Connect Four game that **waits for you**. Every move is a
transaction on [Base Sepolia](https://docs.base.org/chain/network-faucets)
(chain id **84532**); the entire game — legal moves, turn order, win/draw
detection and the inactivity forfeit — is enforced by a single smart contract.
Play a piece, close the tab, and pick the game back up days later from any
phone or computer. There is no game server, no accounts, and no custody.

- **Contract:** `src/ConnectFour.sol` (Solidity 0.8.30, Foundry)
- **Frontend:** React 19 + Vite + wagmi v3 + viem, mobile-first
- **License:** MIT

---

## Table of contents

1. [Game rules](#1-game-rules)
2. [Architecture](#2-architecture)
3. [Repository structure](#3-repository-structure)
4. [Deployed contract](#4-deployed-contract)
5. [Prerequisites](#5-prerequisites)
6. [Local installation](#6-local-installation)
7. [Environment variables](#7-environment-variables)
8. [Build & test (contracts)](#8-build--test-contracts)
9. [Build & test (frontend)](#9-build--test-frontend)
10. [Deploying the contract to Base Sepolia](#10-deploying-the-contract-to-base-sepolia)
11. [Deploying the frontend](#11-deploying-the-frontend)
12. [Wallet setup & test ETH](#12-wallet-setup--test-eth)
13. [Playing: two players on two devices](#13-playing-two-players-on-two-devices)
14. [Sharing and reopening a game](#14-sharing-and-reopening-a-game)
15. [How the contract enforces the rules](#15-how-the-contract-enforces-the-rules)
16. [Timeout & forfeit mechanism](#16-timeout--forfeit-mechanism)
17. [Gas sponsorship](#17-gas-sponsorship)
18. [Known limitations](#18-known-limitations)

---

## 1. Game rules

- Board: **7 columns × 6 rows**. The creator plays **gold** and moves first;
  the opponent plays **red**.
- On your turn, drop one piece into a column. It falls to the **lowest empty
  cell** of that column. A full column cannot be played; columns are numbered
  **0–6** onchain and **1–7** in the UI.
- **Four in a row** — horizontally, vertically, or on either diagonal — wins
  instantly. A win on the final cell that also fills the board still wins
  (winner takes precedence over draw).
- If all 42 cells fill with no line of four, the game is a **draw**.
- Players may be in different cities, on different devices, and move at
  different times. Nothing about the game lives in your browser: the contract
  is the single source of truth.

## 2. Architecture

```
┌──────────────────────────┐        read: getGame / getBoard / events
│  React frontend (wagmi)  │ ──────────────────────────────────────┐
│  Base Sepolia only       │                                       ▼
│  injected + Base Account │        write: createGame, joinGame,   ╔══════════════╗
└──────────────────────────┘        makeMove, claimTimeout         ║ ConnectFour  ║
                                                                   ║  contract    ║
        No server. No indexer requirement. Recent games are        ║ Base Sepolia ║
        discovered from GameCreated logs; authoritative state      ╚══════════════╝
        always comes from getGame() on the contract itself.
```

- The contract stores, per game id: creator, opponent, current turn, winner,
  status (`WaitingForOpponent | Active | Won | Draw | Forfeited`), the two
  players' boards as packed 42-bit masks, and the last-activity timestamp.
- The frontend renders the board from the packed masks, watches contract
  events to refresh instantly when the opponent moves, and falls back to a
  15-second poll. Closing and reopening the browser recovers the game from
  the chain — `localStorage` is only ever a cosmetic cache of the public
  recent-games list, never game state.

## 3. Repository structure

```
.
├── src/ConnectFour.sol            # the game contract (all rules enforced here)
├── test/ConnectFour.t.sol         # 37 lifecycle / rules / timeout tests
├── test/WinDetection.t.sol        # 13 win-detection unit tests (crafted boards)
├── script/Deploy.s.sol            # Base Sepolia deployment (chain-id guarded)
├── deployments/<chainId>.json     # written by the deploy script
├── scripts/sync-deployment.mjs    # deployments/84532.json → frontend config
├── scripts/generate-full-board-games.mjs  # regenerates the draw/win test fixtures
└── frontend/
    ├── src/components/            # Landing, GamePage, Board, WalletBar, …
    ├── src/hooks/                 # useGame, useGameActions, useRecentGames, …
    ├── src/config/                # chain (84532 only), wagmi, ABI, deployment
    └── scripts/sync-abi.mjs       # forge artifact → src/config/ConnectFour.abi.ts
```

## 4. Deployed contract

| Item | Value |
| --- | --- |
| Network | Base Sepolia |
| Chain id | **84532** |
| Explorer | <https://sepolia.basescan.org> |
| Contract address | *Not yet deployed from this machine — see §10.* |
| Live frontend URL | *Not yet published — see §11.* |

This repository ships the complete, tested implementation and a reproducible
deployment pipeline, but **no contract address is claimed here because no
Base Sepolia deployment transaction has been made with an authorized key**.
After you run the deployment in §10, the address is recorded in
`deployments/84532.json`, synced into the frontend by
`npm run sync-deployment`, and should be filled into this table together with
the Basescan links.

## 5. Prerequisites

- [Foundry](https://getfoundry.sh) (`forge`, `cast`, `anvil`) — the contract
  toolchain. `foundryup` installs everything.
- **Node.js ≥ 22.12** and npm (the frontend pins this in `engines`).
- A browser wallet such as MetaMask (or a Base Account smart wallet) for
  real gameplay.

## 6. Local installation

```bash
git clone https://github.com/sadiyamulani03/RoadToDevconVIII-Problem1.git
cd RoadToDevconVIII-Problem1

# Contracts
forge build

# Frontend
cd frontend
npm ci          # or: npm install
cd ..
```

## 7. Environment variables

Secrets are read from environment variables and **never committed**. Both
`.env` files below are gitignored; only the `.env.example` placeholders are
tracked.

### Contract deployment — `.env` (repo root)

```bash
cp .env.example .env
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `PRIVATE_KEY` | yes | Throwaway key funded **only** with Base Sepolia test ETH. Never reuse a mainnet key. |
| `BASE_SEPOLIA_RPC_URL` | yes | Defaults to the public `https://sepolia.base.org` endpoint. |
| `TARGET_CHAIN_ID` | no | Must be `84532` (default). The script refuses to broadcast on any other chain. |

### Frontend — `frontend/.env` (optional)

```bash
cp frontend/.env.example frontend/.env
```

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_CONTRACT_ADDRESS` | no | Overrides the committed address in `src/config/deployment.generated.ts`. |
| `VITE_DEPLOY_BLOCK` | no | Block of the deployment transaction — makes the recent-games index fast. |
| `VITE_PAYMASTER_URL` | no | ERC-7702/7677 paymaster URL for gas-sponsored Base Account transactions (see §17). |
| `VITE_LOCAL_RPC` / `VITE_LOCAL_CHAIN_ID` | no | Development-only escape hatch to attach a local anvil chain. **Never set in production builds.** |

With no variables set, the app targets Base Sepolia and shows an explicit
"contract not configured" state until a deployment address is synced in.

## 8. Build & test (contracts)

```bash
forge build          # compile
forge test           # run the full suite (50 tests)
forge test -vvv      # verbose traces for a single failing case
forge fmt --check    # style check (config in foundry.toml)
forge lint src/      # static analysis
```

Current result on this machine: **50 passed, 0 failed** across two suites
(`ConnectFourTest`: 37, `WinDetectionTest`: 13), covering game creation,
joining rules, turn enforcement, illegal columns, full columns, piece
gravity, horizontal/vertical/both-diagonal wins, exactly-four and more-than-
four runs, near-miss boards, win-after-draw precedence, full-board draw,
no-moves-after-end, timeout boundary behaviour (strictly-greater-than),
multiple simultaneous games, and indexed move events.

## 9. Build & test (frontend)

```bash
cd frontend
npm run typecheck   # tsc --noEmit
npm run build       # typecheck + production bundle (vite) → frontend/dist
npm run dev         # dev server on http://localhost:5173
npm run sync-abi    # regenerate the ABI from the forge artifact after contract changes
npm run sync-deployment   # copy deployments/84532.json into the frontend config
```

## 10. Deploying the contract to Base Sepolia

1. Create a **throwaway** account and fund it with a few cents of Base Sepolia
   test ETH (§12). A single deployment costs well under 0.01 test ETH.
2. Fill in `.env` (§7) — the key never leaves your shell, is never printed,
   and is covered by `.gitignore`.
3. Deploy:

```bash
set -a && source .env && set +a
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  --verify
```

The script:

- **refuses to broadcast** unless the RPC reports chain id 84532
  (`TARGET_CHAIN_ID` is honoured for local dry-runs only);
- reads the key from `PRIVATE_KEY` and never logs it;
- writes `deployments/84532.json` with the address, chain id, deployer and
  timestamp;
- prints the address, which you paste into §4 of this README together with
  the transaction link `https://sepolia.basescan.org/tx/<hash>` and the
  contract link `https://sepolia.basescan.org/address/<address>`.

4. Sync the address into the frontend and rebuild:

```bash
cd frontend && npm run sync-deployment && npm run build
```

### Local dry-run (no real network)

```bash
anvil &   # local chain, chain id 31337
PRIVATE_KEY=<anvil-key-0> TARGET_CHAIN_ID=31337 \
  forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

This exact flow was verified during development: the deployment succeeded,
`deployments/31337.json` was written, and `cast` was used against the
deployed contract to create a game, join it, make a move, observe the indexed
`MoveMade` event, decode the `NotYourTurn` custom error for an out-of-turn
move, and read the game state back. The local artifact was then removed; only
Base Sepolia deployments belong in `deployments/`.

## 11. Deploying the frontend

The frontend is a static single-page app (`frontend/dist`) with hash routing,
so any static host works:

```bash
cd frontend
npm ci
npm run build          # produces dist/
```

Then publish `dist/` with your host of choice, for example:

- **Vercel / Netlify / Cloudflare Pages:** point at the `frontend/`
  directory, build command `npm run build`, output directory `dist`.
- **GitHub Pages:** upload `dist/` (hash routes need no server rewrites).

No deployment credentials for a hosting provider are present in this
environment, so no live URL is claimed in §4. After publishing, add the URL
there. Set `VITE_CONTRACT_ADDRESS` (or run `npm run sync-deployment` before
building) so the published build knows the contract.

## 12. Wallet setup & test ETH

**Nobody ever needs mainnet crypto to play.** Base Sepolia is a testnet:

1. Install [MetaMask](https://metamask.io/download/) (or use a Base Account
   smart wallet).
2. Add the Base Sepolia network — most wallets include it, or use chain id
   `84532`, RPC `https://sepolia.base.org`, symbol `ETH`.
3. Get free test ETH from any Base Sepolia faucet, e.g. the Coinbase,
   Alchemy or thirdweb faucets (search "Base Sepolia faucet"). Each move
   costs a tiny amount of test ETH — a few cents at most.
4. The app shows a "Wrong network" chip with a one-click switch if your
   wallet is on another chain.

## 13. Playing: two players on two devices

1. **Player A (creator):** open the app, connect a wallet on Base Sepolia,
   press **Create game**. Confirm the transaction. The app reads the
   `GameCreated` event from the transaction receipt and navigates to
   `#/game/<id>`, showing a shareable invite link.
2. **Player A** sends the invite link to Player B by any messenger.
3. **Player B:** opens the link on their own phone, connects a second wallet,
   and presses **Join this game as the opponent**. Confirm the transaction.
   The game becomes active; the creator (gold) moves first.
4. **Players alternate** at any pace — minutes or days. The board shows whose
   turn it is and highlights "Your turn" for the player on move. Columns are
   disabled in the UI when they are full or when it is not your turn; the
   contract re-checks everything regardless.
5. Each move is a wallet confirmation + one Base Sepolia transaction. The
   opponent's piece appears as soon as the move is mined (event-driven
   refresh, with a 15-second poll as backstop).
6. **Finished games** display the onchain winner (by four-in-a-row or by
   timeout) or the draw, freeze the board, and offer **Create another game**.

## 14. Sharing and reopening a game

- Every game has a stable URL: `<site-url>#/game/<gameId>`. Bookmark it, text
  it, reopen it on another device — the state comes from the contract, not
  the browser.
- The landing page's **Recent games** table is built purely from
  `GameCreated` contract events (no server, no database) and is clearly
  labelled as a cached index; opening any entry loads live state with
  `getGame()`.
- A game id can also be typed manually on the landing page.

## 15. How the contract enforces the rules

All authority lives in `src/ConnectFour.sol`; the UI is a convenience:

- **Authentication** — every state change authenticates with `msg.sender`.
  No caller-supplied winner, board, row or acting player is ever trusted.
- **Turn order** — `makeMove` reverts with `NotYourTurn` unless
  `msg.sender == currentTurn` (verified end-to-end over RPC during
  development).
- **Legal placement** — columns outside 0–6 revert (`InvalidColumn`); a full
  column reverts (`ColumnFull`); the piece is written at the lowest empty
  row computed from the contract's own occupancy bits.
- **Win detection** — after each move the contract walks four axes through
  the placed cell on the mover's packed board. Only the stored board decides.
  A winning final move is recorded as `Won` even if that move also filled the
  board (winner beats draw).
- **Draw** — when all 42 bits are set with no winner, status becomes `Draw`.
- **Finished states never reopen** — `Won`, `Draw` and `Forfeited` games
  reject every further move and timeout claim (`GameNotActive`).
- **Games are isolated** — all state hangs off `mapping(uint256 => Game)`; N
  simultaneous games cannot contaminate each other (covered by tests).
- **Events** — `GameCreated`, `GameJoined`, `MoveMade(gameId indexed, player
  indexed, column, row)`, `GameWon`, `GameDrawn`, `GameForfeited` let any
  frontend or explorer reconstruct the game without a backend.

## 16. Timeout & forfeit mechanism

- Every game stores `lastMoveTimestamp`, refreshed on **create**, **join**
  and every **successful move**.
- `TIMEOUT = 7 days` (fixed constant, documented in the contract header).
- When `block.timestamp > lastMoveTimestamp + TIMEOUT` — **strictly
  greater** — the player who is **not** on turn may call `claimTimeout(gameId)`.
- The game is recorded as `Forfeited` with the waiting player as winner and
  a `GameForfeited` event; no further moves are possible.
- The player whose move is pending **cannot** claim their own stall; third
  parties cannot claim (`NotAPlayer`); claims before the exact deadline
  revert (`TimeoutNotReached`) — all three boundary cases are tested.
- The frontend renders a live countdown to the forfeit deadline and only
  shows **Claim win by timeout** to the eligible player after the deadline
  has passed.

## 17. Gas sponsorship

The app never *requires* sponsorship and never requires purchased crypto:

- **Default path — ordinary wallets (MetaMask etc.):** a normal transaction
  that pays gas in **free** Base Sepolia test ETH from public faucets. This
  path always works.
- **Optional sponsored path — Base Account smart wallet:** when the connected
  wallet reports EIP-5792 `paymasterService` support **and**
  `VITE_PAYMASTER_URL` is configured (a paymaster endpoint from, e.g., the
  Coinbase Developer Platform), writes are sent via `wallet_sendCalls` with
  the paymaster capability and the player pays **no gas at all**.

**Requirements and limitations of the sponsored path:** it needs a paymaster
URL plus the associated CDP project credentials on your side — none are
committed to this repository, and the app degrades gracefully to the standard
test-ETH path when it is absent. Nothing in the UI falsely claims
"gasless mode" unless sponsorship was actually detected for the connected
wallet.

## 18. Known limitations

- **Deployment/publishing pending:** contract and frontend deployment need
  your funded testnet key and hosting credentials; the pipeline is verified
  locally (see §10) but no mainnet-of-testnet transaction has been broadcast
  from this environment, so §4 intentionally lists no address.
- **Abandoned open games:** a game still `WaitingForOpponent` whose creator
  leaves can never be forfeited (the only participant is on turn), so it
  simply stays joinable forever. This is harmless — a stranger joining it is
  a feature, not a bug — but such games can never be formally closed.
- **Event-indexed recent games** scan a bounded block range unless
  `VITE_DEPLOY_BLOCK` is set; very old games might drop off the recent list
  but remain fully playable by direct link or id.
- **No rematch in place:** finished games offer "create another game"
  rather than a rematch button — a new game id keeps history unambiguous.
- The frontend's **winning-line highlight** is presentational; the contract's
  `Won` status and `winner` address are always authoritative.

---

### Quick reference — judging criteria mapping

| # | Criterion | Where it lives |
| --- | --- | --- |
| 1 | Frontend targets Base Sepolia | `frontend/src/config/chains.ts` (id 84532 only), `wagmi.ts` |
| 2 | No credentials in tracked files | `.gitignore`, `.env.example` placeholders; secrets scan clean |
| 3 | Move rejects caller not on turn | `makeMove` → `NotYourTurn`; `test_MakeMove_RevertsWhenNotYourTurn` |
| 4 | Move rejects illegal placement | `InvalidColumn` / `ColumnFull`; `test_MakeMove_ColumnOutOfRangeReverts`, `test_MakeMove_FullColumnReverts` |
| 5 | Winner set by contract's own board check | `_hasWon` over stored masks; `WinDetection.t.sol` (13 tests) |
| 6 | No move after game end | `GameNotActive` in `makeMove`/`claimTimeout`; `test_NoMoveAfterWin`, draw & forfeit equivalents |
| 7 | Stall forfeit after deadline | `claimTimeout`; `test_Timeout_*` (7 tests incl. exact-boundary) |
| 8 | Multiple simultaneous games | `mapping(uint256 => Game)`; `test_MultipleGames_RunIndependently` |
| 9 | Move event identifies game | `MoveMade(uint256 indexed gameId, …)`; `test_MoveMade_EventIndexesGameId` |
| 10 | Game ends when board is full | `FULL_BOARD` check → `Draw`; `test_MakeMove_GameEndsInDrawOnFullBoard`, `test_WinningFinalMove_BeatsDraw` |
