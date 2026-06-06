import { useAccount, useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useRelayerStatus } from "@/providers";

export function RelayerDot() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const relayerStatus = useRelayerStatus();

  const isSepolia = chainId === sepolia.id;

  let color: string;
  let pulse = false;
  let title: string;

  if (!isConnected) {
    color = "bg-muted-foreground/40";
    title = "Connect wallet to enable FHE";
  } else if (!isSepolia) {
    color = "bg-amber-400";
    title = "Switch to Sepolia to enable FHE";
  } else if (relayerStatus === "loading") {
    color = "bg-yellow-400";
    pulse = true;
    title = "Zama relayer initializing…";
  } else if (relayerStatus === "error") {
    color = "bg-red-500";
    title = "Zama relayer error — check console";
  } else {
    color = "bg-green-400";
    title = "Zama FHE relayer active · Sepolia";
  }

  return (
    <div
      className="flex items-center gap-1.5 cursor-default select-none"
      title={title}
    >
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${color} ${pulse ? "animate-pulse" : ""}`}
      />
      <span className="text-xs text-muted-foreground hidden sm:inline">FHE</span>
    </div>
  );
}
