import { useAccount, useChainId } from "wagmi";
import { sepolia } from "wagmi/chains";
import { useRelayerStatus } from "@/providers";

export function RelayerDot() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const relayerStatus = useRelayerStatus();

  const isSepolia = chainId === sepolia.id;

  let dotColor: string;
  let pulse = false;
  let label: string;
  let labelColor: string;

  if (!isConnected) {
    dotColor = "bg-gray-400";
    label = "FHE: Disconnected";
    labelColor = "text-gray-500";
  } else if (!isSepolia) {
    dotColor = "bg-amber-400";
    label = "FHE: Wrong Network";
    labelColor = "text-amber-400";
  } else if (relayerStatus === "loading") {
    dotColor = "bg-yellow-400";
    pulse = true;
    label = "FHE: Connecting";
    labelColor = "text-yellow-400";
  } else if (relayerStatus === "error") {
    dotColor = "bg-red-500";
    label = "FHE: Error";
    labelColor = "text-red-400";
  } else {
    dotColor = "bg-[#0b7a45]";
    label = "FHE: Ready";
    labelColor = "text-[#0b7a45]";
  }

  return (
    <div className="flex items-center gap-2 select-none" title={label}>
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${dotColor} ${pulse ? "animate-pulse" : ""}`}
      />
      <span className={`text-xs font-medium ${labelColor}`}>{label}</span>
    </div>
  );
}
