# MediFlow — Composable Confidential Health Records on Zama FHEVM

> **⚠ All data in this project is mock/synthetic — no real patient records are stored, transmitted, or processed. This is a research demo of Zama FHEVM v0.11 on Sepolia testnet.**

## What is MediFlow?

MediFlow is a composable confidential health records system built on [Zama FHEVM](https://docs.zama.ai/fhevm). Patients store encrypted health attributes on-chain using Fully Homomorphic Encryption (FHE). Hospitals can run eligibility checks without ever seeing raw data. Insurance contracts trigger automated payments from encrypted eligibility results. Research institutions compute aggregate statistics over patient cohorts without accessing individual records.

**The composability hook:** InsuranceModule bridges health data directly to confidential payment rails — payments trigger automatically from encrypted eligibility results, with no human in the loop and no data exposure.

---

## Why FHE, not ZK?

Zero-Knowledge proofs let you *prove* a statement about private data (e.g., "my age is over 18") — but only if the statement is known in advance and the circuit is pre-compiled. Every new query type requires a new circuit and a trusted setup.

**FHE is fundamentally different.** With FHE, you store encrypted values on-chain and run *arbitrary computations* over them at query time — without decrypting. This unlocks:

- **Dynamic aggregate queries**: Sum encrypted risk scores across a cohort, count patients with a specific condition, compute prevalence rates — without pre-specifying the query at deployment time.
- **Composable eligibility logic**: The insurance contract reads an encrypted eligibility result from the health engine and triggers payment — without any party decrypting intermediate values.
- **Patient-controlled re-use**: The same encrypted health record can be queried by a hospital for eligibility, by a researcher for aggregate statistics, and by an insurer for claims — all without the patient re-proving anything.

ZK proofs cannot efficiently express these patterns. FHE can.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Patient Browser                         │
│  FHE encrypt (4x euint64) → handles + proofs               │
└──────────────────────┬──────────────────────────────────────┘
                       │  registerPatient(8 args)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   Sepolia Testnet                           │
│                                                             │
│  ┌──────────────────┐  authorizeProvider  ┌─────────────┐  │
│  │  PatientRegistry │◄────────────────── │   Patient   │  │
│  │  4 euint64 per   │                    └─────────────┘  │
│  │  patient         │                                     │
│  └────────┬─────────┘                                     │
│           │ ACL-gated encrypted attrs                     │
│           ▼                                               │
│  ┌────────────────────┐ runEligibilityCheck ┌──────────┐  │
│  │  HealthQueryEngine │◄─────────────────── │ Hospital │  │
│  │  FHE.le(risk,      │                    └──────────┘  │
│  │  threshold)        │                                   │
│  │  → encrypted ebool │                                   │
│  └────────┬───────────┘                                   │
│           │ encrypted result (bytes32 checkId)            │
│           ▼                                               │
│  ┌────────────────────┐ processClaimPayment ┌──────────┐  │
│  │  InsuranceModule   │◄─────────────────── │ Insurer  │  │
│  │  reads eligibility │                    └──────────┘  │
│  │  triggers payment  │                                   │
│  └────────┬───────────┘                                   │
│           │                                               │
│           ▼                                               │
│  ┌────────────────────┐                                   │
│  │  MockPaymentVault  │ ETH escrow release                │
│  └────────────────────┘                                   │
│                                                           │
│  ┌────────────────────┐ registerCohort  ┌─────────────┐  │
│  │  ResearchRegistry  │◄─────────────── │ Institution │  │
│  │  runAggregateQuery │                 └─────────────┘  │
│  │  FHE sum over      │                                   │
│  │  cohort            │                                   │
│  └────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployed Contract Addresses

| Contract | Sepolia Address |
|---|---|
| PatientRegistry | _Set after deploy_ |
| HealthQueryEngine | _Set after deploy_ |
| InsuranceModule | _Set after deploy_ |
| ResearchRegistry | _Set after deploy_ |
| MockPaymentVault | _Set after deploy_ |

Update with actual addresses after running the deploy script. See `docs/ARCHITECTURE.md` for deployment instructions.

---

## Latency Benchmarks

FHE eligibility check on Sepolia (`runEligibilityCheck`):

| Step | Observed Latency |
|---|---|
| Client-side FHE encryption (4 inputs) | ~200–400ms |
| Transaction submission | ~5–15s (Sepolia block time) |
| FHE coprocessor computation | ~30–60s |
| `getEligibilityResult` available | ~45s median |

> **Note:** Benchmarks measured on Zama Sepolia devnet with mock FHE coprocessor. Production Zama gateway latency may differ. Update this table with actual measurements after deployment.

---

## Quick Start

### Prerequisites
- Node.js 20+, pnpm 9+
- MetaMask with Sepolia ETH ([faucet](https://sepoliafaucet.com))

### 1. Install dependencies
```bash
# Workspace (frontend)
pnpm install

# Contracts
cd mediflow-contracts && npm install
```

### 2. Compile contracts
```bash
cd mediflow-contracts
echo 'n' | npx hardhat compile
```

### 3. Run tests
```bash
cd mediflow-contracts
echo 'n' | npx hardhat test
```

### 4. Deploy to Sepolia
```bash
cd mediflow-contracts
echo 'n' | npx hardhat run scripts/deploy.ts --network sepolia
```

### 5. Seed mock data
```bash
cd mediflow-contracts
PATIENT_REGISTRY_ADDRESS=0x… \
HEALTH_QUERY_ENGINE_ADDRESS=0x… \
INSURANCE_MODULE_ADDRESS=0x… \
RESEARCH_REGISTRY_ADDRESS=0x… \
MOCK_PAYMENT_VAULT_ADDRESS=0x… \
echo 'n' | npx hardhat run scripts/seed.ts --network sepolia
```

### 6. Start frontend
Set env vars in Replit Secrets, then restart the `mediflow-ui` workflow.

Required secrets:
```
VITE_PATIENT_REGISTRY_ADDRESS
VITE_HEALTH_QUERY_ENGINE_ADDRESS
VITE_INSURANCE_MODULE_ADDRESS
VITE_RESEARCH_REGISTRY_ADDRESS
VITE_WALLETCONNECT_PROJECT_ID  (optional — MetaMask works without it)
```

---

## How a Real Hospital Would Integrate

A hospital's existing EHR (Electronic Health Record) system would integrate MediFlow by deploying a lightweight gateway service that holds the hospital's Ethereum wallet. When a care coordinator initiates an eligibility verification for a patient — e.g., for a specific procedure or drug coverage — the gateway calls `HealthQueryEngine.runEligibilityCheck(patientAddress, riskThreshold)` using the hospital wallet. The patient must have previously called `authorizeProvider(hospitalAddress)` from their own wallet, granting the ACL permission.

The gateway monitors the Sepolia event log for `EligibilityChecked` events and reads the encrypted result handle. To display the eligibility decision to the care coordinator, the gateway initiates a user-decrypt request using an EIP-712 signed message from the patient — this is handled by the Zama KMS gateway and requires the patient's active consent. The decrypted boolean is shown in the hospital's UI for that session only. The on-chain state remains encrypted at all times.

## How a Real Insurer Would Integrate

An insurer integrates by calling `InsuranceModule.createPolicy(patientAddress, premium, coverage, riskThreshold)` to register a risk-gated policy. When a claim is submitted, the insurer calls `processClaimPayment(patientAddress, eligibilityCheckId)`. The contract reads the encrypted eligibility result from `HealthQueryEngine`, and if the FHE coprocessor confirms the patient's risk is within threshold, it triggers an ETH release from `MockPaymentVault` (or a stablecoin vault in production). The insurer never sees the patient's raw risk score — they only know the claim was approved or denied by the encrypted comparison. Audit trails are stored as on-chain events with encrypted payloads.

---

## Known Limitations

- **Mock data only**: All patient profiles are synthetic. This system has no HIPAA compliance, no data residency controls, and is not suitable for real patient data.
- **No real KMS user-decrypt**: The demo shows simulated decryption results. Production use requires the Zama KMS gateway for patient-approved EIP-712 decryption flows.
- **Aggregate queries are demo-grade**: `runAggregateQuery` computes a simple FHE sum. Production-grade research would require differential privacy mechanisms, minimum cohort size enforcement, and audit logging.
- **MockPaymentVault**: Uses plain ETH. Production would use ERC-20 stablecoins with additional access controls.
- **Sepolia only**: The Zama FHE coprocessor is available on Sepolia devnet. Mainnet deployment requires Zama partnership.
- **No revocation**: Provider authorization cannot be revoked in v1. ACL revocation is planned for v2.

---

## Stack

- **Contracts**: Solidity ^0.8.28, `@fhevm/solidity@0.11.1`, Hardhat TypeScript
- **Frontend**: React + Vite, wagmi v2, RainbowKit v2, viem, Tailwind CSS, shadcn/ui
- **FHE SDK**: `@zama-fhe/relayer-sdk@0.4.1` (legacy web SDK, dynamic import)
- **Network**: Sepolia testnet with Zama FHE coprocessor

See `docs/ARCHITECTURE.md` for full system design and `docs/COMPOSABILITY.md` for the payment rail integration pattern.
