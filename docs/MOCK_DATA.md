# Mock Data Reference

> **All data documented here is entirely synthetic. No real patient records are used.**

## Mock Patient Profiles

These 5 profiles are seeded by `mediflow-contracts/scripts/seed.ts` using the first 5 Hardhat default signers.

| # | Label | Risk Score | Condition Flags | Age | Medications | Bitmask |
|---|---|---|---|---|---|---|
| 1 | Healthy young adult | 25 | None | 32 | 1 | 0 |
| 2 | Moderate risk | 65 | Diabetes | 55 | 4 | 1 |
| 3 | High risk | 88 | Diabetes + Hypertension | 67 | 8 | 3 |
| 4 | Moderate | 42 | Hypertension | 48 | 2 | 2 |
| 5 | Very high risk | 91 | All (DM + HTN + Cardiac) | 72 | 12 | 7 |

### Condition Flags Bitmask

```
Bit 0 (value 1) = Diabetes
Bit 1 (value 2) = Hypertension
Bit 2 (value 4) = Cardiac History

Examples:
  0 = No conditions
  1 = Diabetes only
  2 = Hypertension only
  3 = Diabetes + Hypertension (1 + 2)
  7 = All three (1 + 2 + 4)
```

### Default Patient on Frontend

The Patient Portal defaults to **"Alice Chen"** — a composite of Patient 1 and 4:
- Risk Score: 37
- Conditions: Hypertension (bitmask 2)
- Age: 42
- Medications: 2

This profile is used for single-patient demo flows (the slider defaults). The seed script registers distinct profiles for the 5 Hardhat accounts.

---

## Mock Cohorts

| Cohort | Patients Included | Purpose |
|---|---|---|
| Cohort A | All 5 patients | Full population aggregate queries |
| Cohort B | Patients 2, 3, 5 (risk > 60) | High-risk focused research |

### Pre-Computed Aggregate Results

These are the deterministic results for seed data queries. In production with deployed contracts, these would be FHE-computed on Sepolia.

**Cohort A (n=5):**
- High-Risk Count (risk > 60): **3** — Patients 2 (65), 3 (88), 5 (91)
- Diabetes Prevalence: **3** — Patients 2, 3, 5

**Cohort B (n=3):**
- High-Risk Count (risk > 60): **3** — All patients in cohort
- Diabetes Prevalence: **3** — All patients in cohort

---

## Mock Policies

Insurance policies created by the seed script:

| Patient | Monthly Premium | Coverage | Risk Threshold |
|---|---|---|---|
| Patient 1 | 0.005 ETH | 1.0 ETH | 80 |
| Patient 2 | 0.010 ETH | 0.8 ETH | 70 |
| Patient 3 | 0.020 ETH | 0.5 ETH | 60 |
| Patient 4 | 0.008 ETH | 0.9 ETH | 75 |
| Patient 5 | 0.025 ETH | 0.3 ETH | 50 |

### Eligibility at Default Threshold (70)

| Patient | Risk Score | Eligible at 70? |
|---|---|---|
| Patient 1 | 25 | ✅ Yes |
| Patient 2 | 65 | ✅ Yes |
| Patient 3 | 88 | ❌ No |
| Patient 4 | 42 | ✅ Yes |
| Patient 5 | 91 | ❌ No |

---

## Mock Research Institution

| Field | Value |
|---|---|
| Address | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Hardhat account #1) |
| Name | Mayo Clinic Research Division |
| Purpose | Aggregate diabetes prevalence and risk score studies |
| Initial Query Count | 0 (incremented by each runAggregateQuery call) |

---

## MockPaymentVault Seed

The vault is seeded with **10 ETH** via `vault.deposit({ value: parseEther("10") })`.

This simulates an insurance float. In production this would be USDC or USDT with multi-sig governance.

---

## Hardhat Account Mapping

When running the seed script against a local Hardhat network:

| Role | Account Index | Address |
|---|---|---|
| Owner / Deployer | 0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Patient 1 | 1 | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |
| Patient 2 | 2 | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` |
| Patient 3 | 3 | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` |
| Patient 4 | 4 | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` |
| Patient 5 | 5 | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` |
| Institution | 6 | `0x976EA74026E726554dB657fA54763abd0C3a0aa9` |

On Sepolia, replace with real funded wallets. The seed script uses `ethers.getSigners()` which returns the signers in index order based on your `hardhat.config.ts` accounts array.
