# MediFlow Composability — Connecting Health Data to Confidential Payment Rails

## The Core Insight

Traditional health insurance involves a human in the loop: a claims adjuster reviews medical records, makes an eligibility determination, and triggers a payment. This process is slow, expensive, and requires sharing sensitive health data with multiple parties.

MediFlow removes the human in the loop entirely — **without** any party needing to see the patient's raw health data.

The bridge is `InsuranceModule.sol`:

```
Patient's encrypted health record (on PatientRegistry)
    ↓
HealthQueryEngine.runEligibilityCheck() → encrypted ebool result
    ↓
InsuranceModule.processClaimPayment() reads the encrypted boolean
    ↓
FHE coprocessor confirms: riskScore ≤ threshold (never decrypting riskScore)
    ↓
MockPaymentVault releases ETH to eligible patient
```

The insurer creates a policy with a `riskThreshold`. The hospital runs the eligibility check. The insurance contract reads the result and pays — all without any party decrypting the patient's risk score.

---

## How This Connects to ConfidentialFlow Payment Rails

MediFlow is designed to compose with a broader confidential payment infrastructure (e.g., ConfidentialFlow or any FHEVM-based payment network). The connection points are:

### 1. MockPaymentVault → Confidential Vault

The `MockPaymentVault` is a placeholder. In production, replace it with a confidential vault contract that:
- Holds encrypted balances (using `euint64` or `euint256` for amounts)
- Releases funds only when an encrypted eligibility proof is presented
- Maintains privacy for both the claimant amount and the insurer float

The `InsuranceModule` would call `vault.releaseEncrypted(patient, encryptedAmount, eligibilityCheckId)` — the vault verifies the check without knowing the amount.

### 2. InsuranceModule → Composable Claim Trigger

`InsuranceModule` is designed as a standalone module that can be integrated into any payment pipeline. A payment network can:
- Import the `IInsuranceModule` interface
- Read `isClaimProcessed(checkId)` as a gate for releasing further funds
- Compose multiple eligibility checks (e.g., require both health eligibility AND age verification)

### 3. HealthQueryEngine → Cross-Contract FHE Oracle

`HealthQueryEngine` acts as a **confidential oracle**. Any contract on Sepolia can:
1. Call `runEligibilityCheck(patientAddress, threshold)` (with patient's ACL permission)
2. Read the encrypted result via `getEligibilityResult(checkId)`
3. Use the encrypted boolean in their own FHE logic

This makes `HealthQueryEngine` reusable across multiple insurance products, employer benefits systems, loan underwriting, and any other risk-gated financial product — all without changing the underlying health data contract.

### 4. ResearchRegistry → Aggregate Data Market

Approved institutions can register cohorts and run aggregate queries. In a full composability stack:
- Institutions pay a per-query fee (in encrypted tokens) to access cohort data
- The fee goes into a `PatientDataVault` that distributes royalties to enrolled patients
- All financial flows use encrypted amounts — neither the institution nor the patient sees what others are paying/earning

---

## Composability Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    ConfidentialFlow / Payment Rails              │
│                                                                  │
│  ┌────────────────┐    ┌────────────────┐    ┌───────────────┐  │
│  │EncryptedPayment│    │  LoanGate      │    │ EmployerBenef.│  │
│  │  Vault         │    │  (risk-gated   │    │  Portal       │  │
│  │  (USDC/USDT)   │    │   lending)     │    │               │  │
│  └───────┬────────┘    └───────┬────────┘    └──────┬────────┘  │
│          │ releaseEncrypted    │ eligibilityGate    │           │
└──────────┼────────────────────┼────────────────────┼───────────┘
           │                    │                    │
           ▼                    ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    MediFlow Health Layer                          │
│                                                                  │
│  ┌──────────────────────────────────────────┐                   │
│  │           HealthQueryEngine               │                   │
│  │   runEligibilityCheck(patient, threshold) │◄── any contract   │
│  │   getEligibilityResult(checkId) → ebool  │                   │
│  │   runAggregateQuery(cohort, type) → sum  │                   │
│  └──────────────────┬───────────────────────┘                   │
│                     │ reads ACL-gated                            │
│                     ▼                                            │
│  ┌──────────────────────────────────────────┐                   │
│  │           PatientRegistry                 │                   │
│  │   euint64 riskScore, conditionFlags,      │                   │
│  │   age, medCount                           │                   │
│  └──────────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## The Automation Property

The key property that makes MediFlow composable with payment rails is **automated conditional release**:

> A payment is released if and only if the FHE coprocessor confirms `encryptedRiskScore ≤ plainTextThreshold` — without any human reviewing the patient's record.

This mirrors how DeFi lending protocols use price oracles: the protocol checks a condition (price) and automatically executes (liquidation / loan release). MediFlow brings the same pattern to health data — except the "price" is an encrypted health attribute and the "check" is performed by the FHE coprocessor without decrypting.

The result: **privacy-preserving automated underwriting** — a class of application that is impossible to build with traditional databases, ZK proofs alone, or standard smart contracts. FHE on EVM makes it practical.
