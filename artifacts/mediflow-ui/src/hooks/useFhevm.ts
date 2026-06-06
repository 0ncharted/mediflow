import { useState, useEffect } from "react";
import { useAccount, useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";

export type FhevmInstance = Awaited<
  ReturnType<(typeof import("@zama-fhe/relayer-sdk/web"))["createInstance"]>
>;

export function useFhevm() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [instance, setInstance] = useState<FhevmInstance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) {
      setInstance(null);
      setError(null);
      return;
    }
    if (chainId !== sepolia.id) {
      setError("Switch to Sepolia testnet to enable FHE");
      setInstance(null);
      return;
    }
    if (typeof window === "undefined" || !(window as { ethereum?: unknown }).ethereum) {
      setError("No wallet provider detected");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const { initSDK, createInstance, SepoliaConfig } = await import(
          /* @vite-ignore */
          "@zama-fhe/relayer-sdk/web"
        );
        await initSDK();
        const inst = await createInstance({
          ...SepoliaConfig,
          network: (window as { ethereum?: unknown }).ethereum as Parameters<typeof createInstance>[0]["network"],
        });
        if (!cancelled) {
          setInstance(inst);
          setLoading(false);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to initialize FHE SDK");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return { instance, loading, error };
}
