# MediFlow — System Architecture

## Overview

MediFlow is a five-contract system on Sepolia testnet that uses Zama FHEVM v0.11 to store and compute over encrypted health data without any party ever seeing raw values.

```
                         ┌─────────────────────────────────┐
                         │        Patient (Browser)         │
                         │  @zama-fhe/relayer-sdk@0.4.1     │
                         │  createEncryptedInput()          │
                         │  → 4x Uint8Array handles+proofs  │
                         └──────────┬──────────────────────┘
                                    │ registerPatient(8 args)
                                    │ authorizeProvider(addr)
                                    ▼
                      ┌─────────────────────────┐
                      │    PatientRegistry       │
                      │  euint64 riskScore       │
                      │  euint64 conditionFlags  │
                      │  euint64 age             │
                      │  euint64 medCount        │
                      │  ACL mapping per patient │
                      └────────────┬────────────┘
                                   │ ACL-gated reads
               ┌───────────────────┼───────────────────┐
               ▼                   ▼                    ▼
   ┌───────────────────┐ ┌──────────────────┐ ┌────────────────────┐
   │  HealthQueryEngine│ │  InsuranceModule  │ │  ResearchRegistry  │
   │                   │ │                   │ │                    │
   │  FHE.le(risk, T)  │ │  createPolicy()   │ │  approveInstitution│
   │  → ebool on-chain │ │  processClaimPmt()│ │  registerCohort()  │
   │  runAggregateQuery│ │  reads ebool from │ │  runAggregateQuery │
   │  FHE sum over     │ │  HealthEngine     │ │  via HealthEngine  │
   │  cohort           │ └────────┬──────────┘ └────────────────────┘
   └───────────────────┘          │ triggers payment
                                  ▼
                      ┌─────────────────────────┐
                      │    MockPaymentVault       │
                      │  ETH escrow deposit/     │
                      │  release                 │
                      └─────────────────────────┘
```

---

## Contract Descriptions

### PatientRegistry.sol
**Purpose:** Stores FHE-encrypted health attributes per patient wallet.

**Key storage:**
- `mapping(address => PatientRecord)` where `PatientRecord` contains four `euint64` handles (riskScore, conditionFlags, age, medCount), an `enrolled` bool, and `lastUpdated`.
- `mapping(address => mapping(address => bool)) providerAuthorized` — ACL for provider access.

**Key functions:**
- `registerPatient(bytes32, bytes, bytes32, bytes, bytes32, bytes, bytes32, bytes)` — takes 4 encrypted inputs (handle + proof each). Registers or updates the patient's encrypted record.
- `authorizeProvider(address)` — grants ACL to a provider. Called by the patient.
- `getPatientRecord(address)` — returns the struct (handles are bytes32, not raw values).
- `checkRiskScoreACL(address patient, address grantee)` — verifies ACL status.

**Security model:** Only the patient can register/update their own record and grant/revoke provider access. Providers with ACL can read handles but cannot decrypt without Zama KMS consent.

---

### HealthQueryEngine.sol
**Purpose:** Runs FHE computations over patient records.

**Key functions:**
- `runEligibilityCheck(address patient, uint64 maxRiskThreshold) returns (bytes32 checkId)` — **non-view**. Reads the patient's encrypted riskScore via `FHE.le(riskScore, threshold)` and stores the encrypted boolean result keyed by `checkId`. Requires ACL.
- `getEligibilityResult(bytes32 checkId) returns (bytes32)` — returns the encrypted `ebool` handle.
- `checkExists(bytes32) returns (bool)` — check if a given checkId exists on-chain.
- `runAggregateQuery(address[] cohort, uint8 queryType) returns (bytes32)` — FHE-sums an attribute (risk scores or condition flags) across all cohort members. Returns an encrypted `euint64`.

**FHE primitives used:** `FHE.le()` (comparison), `FHE.add()` (accumulation), `FHE.select()` (conditional).

**Latency:** The FHE coprocessor on Sepolia requires ~30–60 seconds to process the FHE computation after the transaction is confirmed. The result is available in `getEligibilityResult` once the coprocessor callback fires.

---

### InsuranceModule.sol
**Purpose:** Bridges encrypted health eligibility to automated payment release.

**Key functions:**
- `createPolicy(address patient, uint256 premium, uint256 coverage, uint64 riskThreshold)` — called by the insurer. Stores a policy struct on-chain.
- `processClaimPayment(address patient, bytes32 eligibilityCheckId)` — reads the encrypted eligibility result from `HealthQueryEngine`. If the FHE coprocessor confirms the patient is eligible (decrypted `ebool = true`), transfers the coverage amount from `MockPaymentVault` to the patient.
- `getPolicy(address patient)` — returns the policy struct.
- `isClaimProcessed(bytes32 checkId)` — idempotency check.

**No human in the loop:** The entire eligibility → payment flow is automated on-chain. Neither the hospital nor the insurer ever decrypts the raw risk score — they only receive the boolean eligibility result.

---

### ResearchRegistry.sol
**Purpose:** Governs which research institutions can run aggregate queries.

**Key functions:**
- `approveInstitution(address, string name, string purpose)` — owner-only. Adds institution to allowlist.
- `registerCohort(address institution, bytes32 cohortId, address[] patients)` — approved institution registers a patient group.
- `getCohortCount(address institution)` — returns number of registered cohorts.
- `institutions(address)` — returns institution struct (name, purpose, approved, queryCount).

**Privacy model:** Individual patient records are never exposed. Research institutions can only run aggregate FHE queries through `HealthQueryEngine.runAggregateQuery`. The sum reveals only the group statistic, not any individual value.

---

### MockPaymentVault.sol
**Purpose:** Simulates an ETH escrow for insurance claim payments.

**Design note:** In production, this would be replaced by an ERC-20 stablecoin vault (USDC/USDT) with additional access controls and multi-sig governance. The mock version accepts ETH deposits and releases them to eligible patients upon insurer invocation.

---

## Data Flow: Patient Enrollment

```
1. Patient opens MediFlow frontend
2. FHE SDK initializes (connects to Zama relayer, fetches public key)
3. Patient sets mock health data via sliders/inputs
4. "Encrypt & Store" clicked:
   a. Browser calls createEncryptedInput(contractAddr, patientAddr)
   b. Adds value with add64(riskScore)
   c. await input.encrypt() → { handles[0]: Uint8Array, inputProof: Uint8Array }
   d. Repeat for all 4 fields → 4 separate ciphertexts, 4 proofs
   e. toHex() converts Uint8Array → 0x... hex strings
5. Browser calls registerPatient(h0, p0, h1, p1, h2, p2, h3, p3)
6. Transaction confirmed on Sepolia
7. Patient calls authorizeProvider(hospitalAddress) to grant ACL
```

## Data Flow: Eligibility Check

```
1. Hospital enters patient address + risk threshold in Provider Dashboard
2. Calls runEligibilityCheck(patientAddr, threshold)
3. HealthQueryEngine reads patient's encrypted riskScore (ACL required)
4. FHE coprocessor computes FHE.le(riskScore, threshold) → encrypted ebool
5. Stores ebool handle at keccak256(patient||provider||nonce) = checkId
6. EligibilityChecked event emitted with checkId
7. ~45s later: getEligibilityResult(checkId) returns ebool handle
8. Patient can user-decrypt via EIP-712 signed request to Zama KMS
9. If eligible: processClaimPayment(patient, checkId) releases funds
```

---

## Frontend Architecture

```
artifacts/mediflow-ui/src/
├── App.tsx                    # Router + dark wrapper
├── providers.tsx              # WagmiProvider → QueryClientProvider → RainbowKitProvider
├── main.tsx                   # Mount + document.documentElement.classList.add("dark")
├── lib/
│   ├── contracts.ts           # 4 ABIs + VITE_*_ADDRESS env bindings
│   └── wagmi.ts               # Sepolia config, publicnode RPC
├── hooks/
│   └── useFhevm.ts            # Dynamic import of relayer-sdk/web, creates instance on Sepolia
├── components/
│   ├── Nav.tsx                # Sticky nav with wallet connect
│   └── TransactionToast.tsx   # 4-state TX feedback + FHE countdown
└── pages/
    ├── PatientPortal.tsx      # Sections A (encrypt), B (providers), C (policies)
    ├── HospitalQuery.tsx      # Step-by-step eligibility + aggregate queries
    ├── InsuranceModule.tsx    # Policy creation, claim processing, policy view
    ├── ResearchRegistry.tsx   # Cohort selector, query runner, result display
    └── Admin.tsx              # Institution approval, tx log
```

---

## Key Technical Decisions

1. **Dynamic FHE SDK import**: `@zama-fhe/relayer-sdk/web` is dynamically imported in a `useEffect` to avoid Vite bundler conflicts with the WASM binary. `optimizeDeps.exclude` prevents pre-bundling.

2. **COOP/COEP headers**: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` are set on the Vite dev server. These are required for `SharedArrayBuffer` which the FHE WASM uses for parallel computation. Trade-off: Coinbase Base wallet shows a compatibility warning.

3. **4 separate proofs**: `registerPatient` takes 8 arguments because each `euint64` field has its own ciphertext and zero-knowledge proof. This prevents ciphertext reuse across fields.

4. **Non-view eligibility check**: `runEligibilityCheck` must be a state-changing function because it stores the encrypted result on-chain. This means it costs gas and requires a wallet signature — it cannot be a `view` read.

5. **Contract address gating**: All UI interactions gate on `CONTRACTS_DEPLOYED = (PATIENT_REGISTRY_ADDRESS !== "0x000…0")`. When not deployed, the frontend shows informational banners and disables all write buttons.

---

## Deployment

See `README.md` Quick Start section. Contracts use `@fhevm/hardhat-plugin` which adds `fhevm` to the Hardhat runtime environment for tests and scripts.
