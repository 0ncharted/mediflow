---
name: Zama SDK v3 wagmi compatibility
description: WagmiSigner from @zama-fhe/react-sdk@3.0.1 breaks on wagmi>=2.19 — watchConnection renamed; fix uses custom signer class.
---

## The problem

`@zama-fhe/react-sdk@3.0.1`'s built-in `WagmiSigner` imports `watchConnection` (singular) from `wagmi/actions`. `wagmi@2.19+` renamed this to `watchConnections` (plural). This causes a runtime crash on init and a missing export at import time.

**Why:** The SDK was compiled against an older wagmi version. `@wagmi/core` action names diverged.

## The fix

Do NOT import `WagmiSigner` from `@zama-fhe/react-sdk/wagmi`. Instead, implement a custom `MediFlowWagmiSigner` class in `src/lib/fhevm.ts` using `@wagmi/core` actions:

- `watchAccount` instead of `watchConnection`
- Cast `wagmiConfig as any` when passing to `@wagmi/core` action functions (RainbowKit's typed `Config<[Sepolia]>` doesn't satisfy `@wagmi/core`'s generic `Config` — cross-package version mismatch, safe at runtime)
- Add `/* eslint-disable @typescript-eslint/no-explicit-any */` at top of file
- Add `@wagmi/core` as a direct dep: `pnpm --filter @workspace/mediflow-ui add @wagmi/core`

## Provider cast

In `providers.tsx`, pass the custom signer as `signer={zamaSigner as never}` to satisfy ZamaProvider's `GenericSigner` prop type without installing matching type versions.

**How to apply:** Any MediFlow session using `ZamaProvider` with wagmi >= 2.19.
