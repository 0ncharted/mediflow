# MediFlow

Composable confidential health records system on Zama FHEVM v0.11 — patients store FHE-encrypted health attributes on-chain; hospitals query without seeing raw data; insurance contracts trigger payments from eligibility results only.

## Run & Operate

- **Frontend**: workflow `artifacts/mediflow-ui: web` (preview path `/mediflow-ui/`)
- **Contracts**: `mediflow-contracts/` — standalone npm project (not in pnpm workspace)
  - `echo 'n' | npx hardhat compile` — compile all 5 contracts
  - `echo 'n' | npx hardhat test` — run tests (skip analytics prompt)
  - `npx hardhat run scripts/deploy.ts --network sepolia` — deploy to Sepolia
- `pnpm --filter @workspace/mediflow-ui exec tsc --noEmit` — typecheck frontend
- Current deployed addresses (Sepolia, 2026-06-06):
  - `VITE_PATIENT_REGISTRY_ADDRESS=0x39e50e384f0d4DB24d2FD9BcF98c954C551Bfa71`
  - `VITE_HEALTH_QUERY_ENGINE_ADDRESS=0xB0e3cA8c95705F1E61D5c5f5575fBEBC269Aee95`
  - `VITE_INSURANCE_MODULE_ADDRESS=0xe0d3F99414d05fe2f1d6b087A114fC12A2b9b5a6`
  - `VITE_RESEARCH_REGISTRY_ADDRESS=0x6F27ad8aa0aDc0e8D4090Cede877F3EA82808d22`
  - `VITE_MOCK_PAYMENT_VAULT_ADDRESS=0xF8bE9FcDfbB22DE62C09ae18fd09146DE2711d71`
- Required env after deploy: `VITE_PATIENT_REGISTRY_ADDRESS`, `VITE_HEALTH_QUERY_ENGINE_ADDRESS`, `VITE_INSURANCE_MODULE_ADDRESS`, `VITE_RESEARCH_REGISTRY_ADDRESS`
- Optional env: `VITE_WALLETCONNECT_PROJECT_ID` (without it: MetaMask/injected only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, wagmi v2, RainbowKit v2, viem
- **FHE SDK**: `@zama-fhe/relayer-sdk@0.4.1` (legacy relayer SDK, web import)
- **Contracts**: Solidity ^0.8.28, `@fhevm/solidity@0.11.1`, Hardhat TypeScript, Sepolia testnet
- **Wallet**: RainbowKit + wagmi, publicnode RPC for Sepolia

## Where things live

- `artifacts/mediflow-ui/` — React+Vite frontend artifact
  - `src/lib/contracts.ts` — all 4 ABIs + VITE_*_ADDRESS env var bindings
  - `src/lib/wagmi.ts` — wagmi config (Sepolia, publicnode RPC)
  - `src/providers.tsx` — WagmiProvider → QueryClientProvider → RainbowKitProvider
  - `src/hooks/useFhevm.ts` — dynamic import of FHE SDK, creates instance on Sepolia
  - `src/pages/` — PatientPortal, HospitalQuery, InsuranceModule, ResearchRegistry
- `mediflow-contracts/` — Hardhat project (standalone npm, NOT pnpm workspace)
  - `contracts/PatientRegistry.sol` — stores 4 euint64 fields per patient
  - `contracts/HealthQueryEngine.sol` — runEligibilityCheck (non-view, returns bytes32 checkId)
  - `contracts/InsuranceModule.sol` — createPolicy + processClaimPayment
  - `contracts/ResearchRegistry.sol` — approveInstitution + registerCohort
  - `contracts/MockPaymentVault.sol` — simulated ETH payment escrow

## Architecture decisions

- `@zama-fhe/relayer-sdk@0.4.1` is the **legacy** SDK (not `@zama-fhe/sdk`). Import from `@zama-fhe/relayer-sdk/web` in browser code. Use `optimizeDeps.exclude` in vite config.
- COOP/COEP headers set to `same-origin` / `credentialless` for SharedArrayBuffer (required by FHE WASM). Coinbase Base wallet shows a warning — expected trade-off.
- Each encrypted health field needs its **own** `createEncryptedInput` + `encrypt()` call (4 proofs for 4 fields), because `registerPatient` takes 4 separate proof bytes.
- `HealthQueryEngine.runEligibilityCheck` is **non-view** (state-changing) — it stores the encrypted result on-chain. Use `writeContract`, not `readContract`.
- Contract addresses default to `0x000…0` when env vars are absent; `CONTRACTS_DEPLOYED` flag gates all write buttons and shows deploy banners.
- All patient data in the frontend is MOCK data (Alice Chen, age 42, risk 37/100).

## Product

- **Patient Portal**: encrypt mock health data with FHE, register on-chain, authorize providers
- **Hospital Query**: run encrypted eligibility checks and aggregate cohort queries
- **Insurance**: create risk-gated policies, process claims triggered by eligibility results
- **Research**: approve institutions, register patient cohorts for privacy-preserving aggregate queries

## Gotchas

- `mediflow-contracts/` uses plain npm (not pnpm). Run `npm install` inside it, not `pnpm install`.
- Hardhat analytics prompt will block CI — always prefix with `echo 'n' |`.
- After deploy, set all 4 `VITE_*_ADDRESS` env vars before restarting the frontend workflow.
- `pnpm install` at workspace root may time out silently in the Replit shell — the workflow restart handles package resolution via Vite's dep scan instead.
