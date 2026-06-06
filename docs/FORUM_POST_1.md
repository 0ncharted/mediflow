# Forum Post: ConfidentialFlow — Composable Encrypted Payment Rails on FHEVM

**Posted to: Zama Community Forum · FHEVM dApps**

---

## What we built

ConfidentialFlow is an experimental framework for composable payment rails on Zama FHEVM. The core idea: payment intents, policy registries, and authorization gates are all encrypted on-chain. No participant — including the relayer — ever sees the cleartext of any payment amount, recipient score, or policy threshold.

Think Stripe's PaymentIntents, but where the authorization decision happens inside an FHE circuit rather than on a centralized server.

---

## The architecture

We split the system into three on-chain modules:

**1. PaymentIntentRegistry**

Each payment intent is stored as a tuple of encrypted fields: `euint128 amount`, `euint64 riskBand`, `euint8 statusFlags`. The creator encrypts these locally using `createEncryptedInput` and submits handles + proofs to the contract. The registry grants ACL access to the designated authorized processor — no one else can compute on the intent data.

**2. ProtocolRegistry**

Protocols register their processing thresholds as encrypted values. A lending protocol might register `euint64 maxExposureBps` without ever publishing what that threshold actually is. When a payment intent references a protocol, the payment engine reads the encrypted threshold and runs `FHE.le(intent.riskBand, protocol.maxExposureBps)` — returning an encrypted boolean.

**3. PaymentEngine**

The engine is the composable piece. It reads from both registries and gates all state transitions behind encrypted conditionals. Critically, it never decrypts anything — it only:

- Chains `FHE.and()` across multiple policy checks
- Calls `FHE.makePubliclyDecryptable()` on the final approval bit
- Emits the result handle for the Zama gateway to decrypt and return

The result is: payment approved/rejected on-chain, with the decision provably derived from the encrypted intent and protocol data, but no raw value ever exposed.

---

## The composability angle

The interesting part is that `PaymentIntentRegistry` outputs (encrypted handles) become inputs to `PaymentEngine` without any intermediate decryption. This is the composability pattern:

```
encrypt(amount, riskBand) → PaymentIntentRegistry.createIntent()
                                     ↓ encrypted handles
                          PaymentEngine.processIntent(intentId)
                                     ↓ FHE.and(check1, check2, check3)
                          encrypted approval bit → Zama KMS → cleartext bool
```

Each hop in this pipeline is a separate contract. Third-party protocols can plug in by implementing the `IConfidentialPolicy` interface — returning an encrypted boolean from a `checkIntent(euint64 riskBand) external returns (ebool)` function. The engine calls all registered policies and ANDs the results.

---

## SDK migration: relayer-sdk → @zama-fhe/sdk v3

We started on `@zama-fhe/relayer-sdk@0.4.1` and migrated to `@zama-fhe/sdk@^3` + `@zama-fhe/react-sdk@^3` mid-project. Key differences in practice:

The old SDK required manual `initSDK()` + `createInstance()` in a `useEffect`, bound to `window.ethereum`. The new SDK wraps this in `ZamaProvider` + a `RelayerWeb` transport, with `WagmiSigner` (or a custom `GenericSigner`) for wallet integration. State management for EIP-712 sessions is handled by the provider — no more manual keypair lifecycle.

For encryption specifically, we replaced:

```ts
// Old
const input = instance.createEncryptedInput(contractAddr, userAddr);
input.add64(amount);
const { handles, inputProof } = await input.encrypt();
```

with:

```ts
// New
const enc = await encrypt.mutateAsync({
  values: [{ value: amount, type: "euint64" }],
  contractAddress: contractAddr,
  userAddress: userAddr,
});
// enc.handles[0], enc.inputProof
```

The `useEncrypt()` hook plugs cleanly into React's state model. The mutation's `isPending` / `isSuccess` / `error` flow integrates with existing loading state without custom orchestration.

---

## What's still rough

**Wagmi version pinning**: `@zama-fhe/react-sdk@3.0.1`'s `WagmiSigner` imports `watchConnection` (singular) from `wagmi/actions`, but `wagmi >= 2.19` renamed this to `watchConnections`. We worked around it by implementing a `GenericSigner` using `@wagmi/core` actions directly.

**Encrypted intent finalization**: The Zama gateway decrypts the approval bit asynchronously. There's a polling delay between submitting the intent and getting the decrypted result back. We built a countdown timer component to set user expectations, but a websocket-style callback from the gateway would be cleaner.

**ACL composability limits**: Each encrypted handle tracks which contracts have ACL access. When the payment engine calls a third-party policy contract, that policy contract needs ACL access to the relevant handles. This means the intent creator must pre-authorize every policy contract at intent creation time — or the engine needs to forward ACL grants during processing. We chose the pre-authorization path for simplicity.

---

## Open questions for the community

1. Is there a recommended pattern for forwarding ACL grants through multi-contract pipelines without requiring the user to know all downstream processors at intent creation time?

2. For `useEncrypt` with multiple values: when all handles share one `inputProof`, does the `InputVerifier` correctly validate each handle independently if they're passed as separate args to a Solidity function?

3. Any plans for a websocket/event channel from the Zama gateway to notify dApps when a decryption result is ready?

Happy to share more of the architecture or the composable policy interface if useful.
