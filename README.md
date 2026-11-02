# HostelChain: Hostel Room Allocation & Waitlist System

A blockchain project where hostel rooms are allocated by a smart contract and the waitlist cannot be reordered by anyone, including the warden.

**Stack:** Solidity 0.8.24 · Hardhat · OpenZeppelin · React 18 + Vite · ethers.js v6 · MetaMask

## How it works

1. The **warden** (the account that deploys the contract) adds rooms: number, type (Non-AC / AC) and beds.
2. A **student** registers with their roll number and year of study. The registration is *pending*.
3. The warden checks the roll number against college records and **approves** it.
4. The student **applies** for a room type.
   - A free bed exists: the room is allocated instantly.
   - No free bed: the student joins the **waitlist**.
5. When a bed frees up (student vacates, warden removes a student, a new room is added, a room leaves maintenance), the contract **automatically** gives it to the next student:
   - higher year first (final-year students have priority),
   - first come, first served inside the same year.

Every step emits an event, which the app shows in the **Activity** tab, so the full history is verifiable.

## Quick start

Requirements: Node.js 18 or newer, the MetaMask browser extension.

```bash
# 1. install everything (root + frontend)
npm run setup

# 2. run the contract tests
npm test

# 3. terminal A: start a local blockchain (keep it running)
npm run node

# 4. terminal B: deploy the contract and load demo data
npm run deploy:local
npm run seed:local

# 5. terminal B: start the web app
npm run frontend        # opens on http://localhost:5173
```

### Set up MetaMask (one time)

1. Add a network: **RPC** `http://127.0.0.1:8545`, **Chain ID** `31337`, currency `ETH`. (The app's "Switch network" button can add it for you.)
2. `npm run node` prints 20 test accounts with private keys. In MetaMask choose *Import account* and paste:
   - **Account #0** to act as the **warden**.
   - **Accounts #1 to #8** to act as **students**. After seeding, they are registered like this:

| Account | Roll no | Year | State after seeding |
|---|---|---|---|
| #1 | 2329383 | 3 | has an AC room |
| #2 | 2329101 | 1 | has an AC room |
| #3 | 2329207 | 2 | has a Non-AC room |
| #4 | 2329455 | 4 | has an AC room |
| #5 | 2329512 | 1 | AC waitlist, position 2 |
| #6 | 2329660 | 2 | AC waitlist, position 1 (year 2 beats year 1) |
| #7 | 2329718 | 3 | registered, waiting for warden approval |
| #8 | 2329801 | 5 | registered, waiting for warden approval |

> These keys are public Hardhat test keys. Never use them on a real network.

### Demo script for your presentation

1. Open the app **without** a wallet: rooms, waitlist and activity are public.
2. Connect as **#6** or **#5** to show the waitlist position.
3. Connect as the **warden (#0)**: approve #7 and #8, add a new AC room. The waitlisted students are given the room automatically and the Activity tab shows `got room … from the waitlist`.
4. Connect as **#1** and click *Vacate room*: the next student in line is promoted instantly.
5. Switch accounts in MetaMask; the page updates by itself.

If you restart `npm run node`, the chain resets. Run `npm run deploy:local` and `npm run seed:local` again.

## Project structure

```
contracts/HostelAllocation.sol   smart contract (all business rules)
test/HostelAllocation.test.js    34 automated tests
scripts/deploy.js                deploys and writes address + ABI to the frontend
scripts/seed.js                  demo rooms, students and a waitlist
frontend/src/
  lib/chain.js                   contract config, error messages, read-only provider
  hooks/                         useWallet, useHostel (data), useTx (transactions), useToasts
  components/                    RoomMap, RoomDetail, StudentPanel, WardenPanel, WaitlistView, Ledger…
```

## Design decisions (good viva material)

| Decision | Why |
|---|---|
| **Warden approves students** | A blockchain cannot know who is a real student. Identity checking stays off-chain; allocation and ordering are on-chain. |
| **One FIFO queue per (room type, year)** | Priority by year with O(1) pops. Sorting an on-chain array would cost more gas as the list grows. |
| **Free-room list per type** | Finding a free bed is O(1) instead of looping over all rooms. |
| **Lazy removal + tickets** | Leaving the waitlist is O(1). Every queue entry carries a ticket, so someone who cancels and re-applies goes to the back and the old entry cannot be reused. |
| **Invariant: free bed ⇒ empty waitlist** | The waitlist is served whenever capacity appears, so the two can never both exist. A test checks this. |
| **Custom errors, OpenZeppelin `Ownable` + `Pausable`** | Cheaper than revert strings, and audited access-control code. |
| **`renounceOwnership` disabled** | Losing the warden would lock the system for good. |
| **Reads via a plain RPC, writes via the wallet** | Anyone can audit allocations without installing a wallet. |

## Limitations and ideas for extension

- Roll numbers are public on-chain. In production store a hash and keep records off-chain.
- One warden account. Use a multisig or `AccessControl` for several wardens.
- Separate boys' / girls' blocks (add a `block` field and one queue set per block).
- Offer-and-accept window (for example 24 hours) before a free bed passes to the next student.
- Security deposit in ETH, refunded on vacating.
- Waitlist serving loops are bounded by room capacity (max 6) but skipping many cancelled entries could use more gas; a `processWaitlist(maxSteps)` function would cap this.

## Deploying to Sepolia (optional)

1. Copy `.env.example` to `.env` and fill in `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` (a throw-away wallet with test ETH).
2. `npm run deploy:sepolia`. This also updates `frontend/src/contracts/HostelAllocation.json`.
3. In `frontend/.env` set `VITE_RPC_URL` to the same Sepolia RPC URL, then `npm run frontend`.

## Troubleshooting

| Problem | Fix |
|---|---|
| "The contract is not deployed on this chain" | The node was restarted. Run `npm run deploy:local` again. |
| Transactions fail with a nonce error after restarting the node | MetaMask → Settings → Advanced → *Clear activity tab data*. |
| Admin panel does not show | Connect with Account #0, the account that deployed the contract. |
| Page shows old data | Wait a few seconds; the app refreshes every 4 seconds and after each transaction. |
