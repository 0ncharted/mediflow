---
name: Zama SDK v3 React migration patterns
description: ZamaProvider tree, useEncrypt hook usage, RelayerDot status indicator, delegated decryption in PatientPortal.
---

## Provider tree order

```
WagmiProvider → QueryClientProvider → ZamaProvider → RelayerStatusContext.Provider → RainbowKitProvider
```

ZamaProvider must be INSIDE QueryClientProvider. RainbowKitProvider must be INSIDE ZamaProvider (not outside).

## ZamaProvider props

```tsx
<ZamaProvider
  relayer={zamaRelayer}     // RelayerWeb instance from @zama-fhe/sdk
  signer={zamaSigner as never}  // custom MediFlowWagmiSigner cast to satisfy types
  storage={indexedDBStorage}    // from @zama-fhe/sdk
  onEvent={() => { /* mark relayer ready */ }}
>
```

## Relayer init

`RelayerWeb` is created at module level in `src/lib/fhevm.ts`:
```ts
export const zamaRelayer = new RelayerWeb({
  getChainId: () => zamaSigner.getChainId(),
  transports: { [SepoliaConfig.chainId]: { ...SepoliaConfig } },
});
```

## useEncrypt pattern (4 sequential calls for PatientRegistry)

```ts
const encrypt = useEncrypt();
// For each euint64 field, separate mutateAsync call = separate handle + inputProof
const r1 = await encrypt.mutateAsync({
  values: [{ value: BigInt(riskScore), type: "euint64" }],
  contractAddress: PATIENT_REGISTRY_ADDRESS,
  userAddress: address,
});
// r1.handles[0] → handle (hex string), r1.inputProof → proof bytes
// Convert: bytesToHex(r1.inputProof)
```

## RelayerDot component

`src/components/RelayerDot.tsx` — reads `useRelayerStatus()` from RelayerStatusContext.
- `"loading"` → amber pulsing dot
- `"ready"` → green dot
- `"error"` → red dot
Displayed as `● FHE` text in Nav.

## Delegated decryption

PatientPortal section B.2: calls `grantDelegatedFieldAccess(grantee: address, fieldIndex: uint8)` on PatientRegistry. ABI stub in `contracts.ts`. The contract calls `TFHE.allow(patient.fields[fieldIndex], grantee)` for only that one ciphertext handle — field-level ACL, not record-level.

Field indices: 0=riskScore, 1=conditionFlags, 2=age, 3=medCount.

## vite.config.ts

```ts
optimizeDeps: {
  exclude: ["@zama-fhe/relayer-sdk", "@zama-fhe/sdk", "@zama-fhe/react-sdk"]
}
```
All three must be excluded for WASM loaders to work.
