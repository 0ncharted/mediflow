# Forum Post: MediFlow — Why FHE for Health Records (not just encryption-at-rest)

**Posted to: Zama Community Forum · Use Cases & Projects**

---

## The problem with traditional health data encryption

Standard encryption-at-rest for health records solves the wrong problem. The data is encrypted on disk, but to do anything useful — run an eligibility check, price an insurance policy, include a patient in a research cohort — you have to decrypt it. The moment the plaintext is in memory on the processing server, you've recreated the exact attack surface encryption was supposed to remove.

Existing "privacy-preserving" systems address this through data minimization (share only what's needed), audit logs (detect breaches after the fact), or access controls (limit who can request decryption). None of these prevent a compromised processor from seeing raw health attributes.

FHE changes the fundamental model: the processor never receives plaintext.

---

## MediFlow: encrypted health attributes as composable on-chain state

MediFlow stores four health attributes per patient on Sepolia testnet as `euint64` ciphertexts: risk score, condition flags bitmask, age, and medication count. These are encrypted client-side using `@zama-fhe/react-sdk`'s `useEncrypt()` hook and submitted to `PatientRegistry.sol`.

The key architectural property: these ciphertexts are *composable*. Other contracts can read the handles and compute on them without ever seeing the underlying values.

---

## The composability chain

**PatientRegistry → HealthQueryEngine → InsuranceModule**

When a hospital runs an eligibility check:

```
HealthQueryEngine.runEligibilityCheck(patientAddr, maxRiskThreshold)
    ↓
TFHE.le(registry.riskScore[patient], TFHE.asEuint64(maxRiskThreshold))
    ↓
encrypted ebool stored on-chain as check result
```

The query engine never decrypts the risk score. It runs `FHE.le` on the ciphertext. The result is another ciphertext — an encrypted boolean. That encrypted boolean is what the insurance module reads to gate claim payments:

```
InsuranceModule.processClaimPayment(patientAddr, checkId)
    ↓ reads encrypted ebool from HealthQueryEngine
    ↓ TFHE.if(eligibilityResult, coverageAmount, zero)
    ↓ encrypted payment amount → KMS decrypts → ETH transfer
```

Three contracts, zero plaintext intermediate values, one payment. The insurer learns only whether the claim was paid — not the patient's actual risk score.

---

## Field-level delegated decryption

Beyond the eligibility pipeline, MediFlow adds a delegated decryption UI in the Patient Portal. Patients can grant a regulator or auditor the ability to decrypt a single field — not the whole record.

In practice: the patient selects "Risk Score" from a dropdown, enters the regulator's wallet address, and signs a transaction that calls `grantDelegatedFieldAccess(grantee, fieldIndex)`. The contract calls `TFHE.allow(patient.fields[fieldIndex], grantee)` for only that one ciphertext handle. The regulator can now request KMS decryption of the risk score handle — and only that handle — via the Zama relayer.

This is field-level access control, not record-level. It's not achievable with traditional symmetric encryption without re-encrypting the field for the auditor's public key and distributing a re-encryption key — which requires a trusted intermediary. FHE's ACL system handles this natively on-chain.

---

## Research without individual exposure

`ResearchRegistry.sol` lets approved institutions register patient cohorts and run aggregate queries. The aggregate is computed on ciphertexts:

```
TFHE.add(cohort[0].riskScore, cohort[1].riskScore, ..., cohort[n].riskScore)
→ encrypted aggregate → divide by n → public result
```

Individual risk scores are never exposed. The institution gets a population-level statistic derived from encrypted individual data. No re-identification possible from the aggregate alone.

---

## What the @zama-fhe/react-sdk v3 migration changed for us

We migrated from `@zama-fhe/relayer-sdk@0.4.1` (legacy primitive SDK) to `@zama-fhe/sdk@^3` + `@zama-fhe/react-sdk@^3`.

The biggest change in the health context: **session-based authorization via `useAllow()`**. Instead of signing an EIP-712 message for every individual decrypt request, the patient signs once to authorize a set of contracts, and all subsequent decryption calls for those contracts use the cached credential. For a patient reviewing their own record across multiple fields, this is meaningfully better UX.

The `useEncrypt()` mutation pattern also fits the healthcare workflow well — the "encrypting…" state is distinct from the "submitting…" state, which lets us show the patient clearly that their data is being encrypted locally (never sent to any server) before it hits the chain.

---

## Open questions

**Condition flags as a bitmask**: we store the three condition flags (diabetes, hypertension, cardiac) as bit positions in a `euint64`. This lets a query engine run `TFHE.and(conditionFlags, TFHE.asEuint64(CARDIAC_BIT))` to check for cardiac history without knowing any other conditions. Is there a cleaner FHE-native approach, or is the bitmask pattern idiomatic?

**Cross-patient aggregation and ACL**: for `ResearchRegistry` to add encrypted ciphertexts across patients, it needs ACL access to each patient's handles. Currently patients must pre-authorize the registry contract. Is there a way for patients to delegate this authorization to the PatientRegistry contract itself, so new institutions can be approved without requiring patients to re-sign?

**Zama gateway latency for insurance claims**: the `processClaimPayment` function relies on the encrypted eligibility result being available on-chain from a previous `runEligibilityCheck` call. There's a gap between when the query engine stores the result and when the Zama KMS decrypts it for the payout logic. We use a `bytes32 checkId` as a handle and require the claim processor to wait for the check to settle. Any patterns for tighter coupling here?

All source code and contracts are on Sepolia. Happy to discuss the composability model or the ACL delegation patterns further.
