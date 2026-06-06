---
name: MediFlow FHEVM frontend patterns
description: Zama relayer-sdk@0.4.1 web import quirks, contract interaction patterns, and deployment flow for MediFlow
---

## SDK import
- Always `import("@zama-fhe/relayer-sdk/web")` (dynamic, in useEffect) — not bare import
- Add `optimizeDeps: { exclude: ["@zama-fhe/relayer-sdk"] }` and `worker: { format: "es" }` to vite.config.ts
- COOP `same-origin` + COEP `credentialless` required for SharedArrayBuffer (FHE WASM)

## registerPatient — 4 separate proofs
Each euint64 field needs its own `createEncryptedInput` + `encrypt()` call:
```ts
const inp = instance.createEncryptedInput(contractAddr, userAddr);
inp.add64(value);
const { handles, inputProof } = await inp.encrypt();
```
`handles[0]` and `inputProof` are Uint8Array — convert with `toHex()` from viem before passing to wagmi args.

## runEligibilityCheck is non-view
`HealthQueryEngine.runEligibilityCheck(patient, maxRisk)` is state-changing. Use `useWriteContract`, not `useReadContract`. It stores the encrypted ebool result keyed by checkId. Read result with `getEligibilityResult(checkId)`.

## Contract address gating
`CONTRACTS_DEPLOYED = PATIENT_REGISTRY_ADDRESS !== "0x000…0"` — all write buttons and live reads gate on this flag. Banners guide user to deploy and set `VITE_*_ADDRESS` env vars.

**Why:** Contracts are deployed separately to Sepolia; the frontend must gracefully preview without addresses set.

## mediflow-contracts is standalone npm
Located at `mediflow-contracts/` — NOT part of the pnpm workspace. Has its own `node_modules`. Always run npm commands inside that directory, not from workspace root.
