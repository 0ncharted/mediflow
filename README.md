# MediFlow — Composable Confidential Health Records on Zama FHEVM

> **Live demo:** [public-eta-lemon-42.vercel.app](https://mediflow-mediflow-ui.vercel.app/)
>
> **⚠ All data is mock/synthetic — no real patient records. Research demo on Sepolia testnet.**

---

## Testing — Get Sepolia ETH before interacting with any contract function

Visit **[sepoliafaucet.com](https://sepoliafaucet.com)** to fund your wallet with Sepolia ETH before using any write function (register patient, run eligibility check, create policy, etc.).

---

## Deployed Contracts (Sepolia)

Deployed 2026-06-06 · Deployer: `0x14A905eE9F79F871EaeEA20Aa932292BC472B435`

| Contract | Address | Etherscan |
|---|---|---|
| PatientRegistry | `0x511C202C1b5Cf3dfDd23688F4050E36aD3737837` | [↗](https://sepolia.etherscan.io/address/0x511C202C1b5Cf3dfDd23688F4050E36aD3737837) |
| HealthQueryEngine | `0xF29726623559de96BDBE89E64A53Bc63A78eec07` | [↗](https://sepolia.etherscan.io/address/0xF29726623559de96BDBE89E64A53Bc63A78eec07) |
| InsuranceModule | `0x88cF8Abd11F3CAa0708398FaE9a2bFBc8b1460ED` | [↗](https://sepolia.etherscan.io/address/0x88cF8Abd11F3CAa0708398FaE9a2bFBc8b1460ED) |
| ResearchRegistry | `0x0a720C544819f768101f568C812479cc65bf134e` | [↗](https://sepolia.etherscan.io/address/0x0a720C544819f768101f568C812479cc65bf134e) |
| MockPaymentVault | `0xeD7F64Efc6B17ecebb2958FFD4E3580529560217` | [↗](https://sepolia.etherscan.io/address/0xeD7F64Efc6B17ecebb2958FFD4E3580529560217) |

Deployment manifest: `mediflow-contracts/deployments/sepolia.json`

---

## What is MediFlow?

MediFlow is a composable confidential health records system built on [Zama FHEVM](https://docs.zama.ai/fhevm). Patients store encrypted health attributes on-chain using Fully Homomorphic Encryption (FHE). Hospitals run eligibility checks without seeing raw data. Insurance contracts trigger automated payments from encrypted eligibility results. Research institutions compute aggregate statistics over patient cohorts without accessing individual records.

**The composability hook:** InsuranceModule reads encrypted outputs from HealthQueryEngine, which reads encrypted inputs from PatientRegistry — each hop stays encrypted with no intermediate decryption.

---

## Architecture

```
PatientPortal (React)
  └─ @zama-fhe/react-sdk · useEncrypt()
       └─ RelayerWeb → Zama Sepolia relayer
            └─ PatientRegistry.sol  0x511C202C1b5Cf3dfDd23688F4050E36aD3737837
                 ├─ euint64 riskScore
                 ├─ euint64 conditionFlags
                 ├─ euint64 age
                 └─ euint64 medCount

HealthQueryEngine.sol  0xF29726623559de96BDBE89E64A53Bc63A78eec07
  └─ runEligibilityCheck(patient, maxRisk) → bytes32 checkId
       └─ FHE.gt(riskScore, threshold) → encrypted result stored on-chain

InsuranceModule.sol  0x88cF8Abd11F3CAa0708398FaE9a2bFBc8b1460ED
  └─ processClaimPayment(patient, checkId)
       └─ reads encrypted eligibility → triggers ETH payout

ResearchRegistry.sol  0x0a720C544819f768101f568C812479cc65bf134e
  └─ registerCohort(institution, patients[])
       └─ FHE aggregate only — no individual decryption
```

---

## SDK: @zama-fhe/react-sdk v3

MediFlow uses the **new Zama React SDK** (`@zama-fhe/sdk@^3` + `@zama-fhe/react-sdk@^3`).

| Legacy (`@zama-fhe/relayer-sdk`) | New (`@zama-fhe/react-sdk`) |
|---|---|
| `initSDK()` + `createInstance()` in `useEffect` | `ZamaProvider` + `useEncrypt()` hook |
| Manual `instance.createEncryptedInput()` | `encrypt.mutateAsync({ values, contractAddress, userAddress })` |
| No session/credential management | `useAllow()` + `useIsAllowed()` caches EIP-712 signatures |
| No delegated decryption hooks | `useDelegateDecryption()`, `useRevokeDelegation()` |

Provider tree:
```tsx
<WagmiProvider>
  <QueryClientProvider>
    <ZamaProvider relayer={zamaRelayer} signer={zamaSigner} storage={indexedDBStorage}>
      <RainbowKitProvider>
        {children}
      </RainbowKitProvider>
    </ZamaProvider>
  </QueryClientProvider>
</WagmiProvider>
```

**Note:** `@zama-fhe/react-sdk@3.0.1`'s `WagmiSigner` uses `watchConnection` (singular) from `wagmi/actions`, which was renamed `watchConnections` in `wagmi >= 2.19`. MediFlow works around this by implementing a `MediFlowWagmiSigner` class in `src/lib/fhevm.ts` using `@wagmi/core` actions with the correct API.

The `RelayerDot` component in the navbar shows:
- 🟢 Green — FHE relayer active (connected on Sepolia)
- 🟡 Amber — wrong network
- ⚪ Grey — wallet not connected

---

## Delegated Decryption

Patients can grant a regulator or auditor the ability to decrypt **one specific field** — not the whole record. The contract calls `TFHE.allow(patient.fields[fieldIndex], grantee)` for only that ciphertext handle.

Field indices: `0` = Risk Score · `1` = Conditions · `2` = Age · `3` = Medication Count

---

## Run & Develop

```bash
# Frontend (workflow: "artifacts/mediflow-ui: web")
pnpm --filter @workspace/mediflow-ui run dev

# Typecheck
pnpm --filter @workspace/mediflow-ui exec tsc --noEmit

# Build (static, for Vercel/CDN)
cd artifacts/mediflow-ui && NODE_ENV=production npx vite build --config vite.config.ts

# Contracts (standalone npm project — NOT pnpm workspace)
cd mediflow-contracts
npm install
echo 'n' | npx hardhat compile
echo 'n' | npx hardhat test
npx hardhat run scripts/deploy.ts --network sepolia

# Deploy to Vercel (requires VERCEL_TOKEN env var)
npx vercel deploy artifacts/mediflow-ui/dist/public --prod --yes --token=$VERCEL_TOKEN
```

Required env vars (set in Replit Secrets and in `artifacts/mediflow-ui/.env`):
```
VITE_PATIENT_REGISTRY_ADDRESS=0x511C202C1b5Cf3dfDd23688F4050E36aD3737837
VITE_HEALTH_QUERY_ENGINE_ADDRESS=0xF29726623559de96BDBE89E64A53Bc63A78eec07
VITE_INSURANCE_MODULE_ADDRESS=0x88cF8Abd11F3CAa0708398FaE9a2bFBc8b1460ED
VITE_RESEARCH_REGISTRY_ADDRESS=0x0a720C544819f768101f568C812479cc65bf134e
VITE_MOCK_PAYMENT_VAULT_ADDRESS=0xeD7F64Efc6B17ecebb2958FFD4E3580529560217
VITE_WALLETCONNECT_PROJECT_ID=...   # optional; MetaMask works without it
```

---

## Key gotchas

- `mediflow-contracts/` is plain **npm** (not pnpm workspace). Run `npm install` inside it.
- Hardhat analytics prompt blocks CI — always prefix: `echo 'n' | npx hardhat ...`.
- COOP `same-origin` + COEP `credentialless` headers required for FHE WASM SharedArrayBuffer. `credentialless` (not `require-corp`) is used because RainbowKit loads cross-origin wallet icons.
- `@zama-fhe/relayer-sdk` stays in `optimizeDeps.exclude` even after migration — the new SDK re-exports types from its bundle and carries the same WASM files.
- Contract addresses default to `0x000…0` when env vars absent; `CONTRACTS_DEPLOYED` flag gates all write buttons.
- The seed script (`scripts/seed.ts`) requires 7 Hardhat signers — it works on local hardhat network only, not on Sepolia with a single key.

---

## Contracts

| Contract | Role |
|---|---|
| `PatientRegistry.sol` | Stores 4 `euint64` fields per patient; `grantDelegatedFieldAccess(grantee, fieldIndex)` |
| `HealthQueryEngine.sol` | `runEligibilityCheck` — non-view, stores encrypted bool result on-chain |
| `InsuranceModule.sol` | `createPolicy` + `processClaimPayment` |
| `ResearchRegistry.sol` | `approveInstitution` + `registerCohort` |
| `MockPaymentVault.sol` | Simulated ETH escrow for insurance payouts |

All contracts inherit `ZamaEthereumConfig` (Sepolia v0.11 preset).

---

## Stack

- **Frontend**: React 19, Vite, Tailwind CSS, shadcn/ui, wagmi v2, RainbowKit v2, viem
- **FHE SDK**: `@zama-fhe/sdk@^3` + `@zama-fhe/react-sdk@^3` (new session-based SDK)
- **Contracts**: Solidity ^0.8.28, `@fhevm/solidity@0.11.1`, Hardhat TypeScript, Sepolia
- **Monorepo**: pnpm workspaces, Node.js 24, TypeScript 5.9
- **Wallet**: RainbowKit + wagmi, publicnode RPC for Sepolia
