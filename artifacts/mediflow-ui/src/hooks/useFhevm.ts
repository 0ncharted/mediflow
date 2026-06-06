import { useChainId, useAccount } from "wagmi";
import { sepolia } from "wagmi/chains";

export function useFhevm() {
  const chainId = useChainId();
  const { isConnected } = useAccount();

  const onSepolia = chainId === sepolia.id;
  const ready = isConnected && onSepolia;

  return {
    instance: ready ? {} : null,
    loading: isConnected && !onSepolia,
    error: isConnected && !onSepolia ? "Switch to Sepolia testnet to enable FHE" : null,
  };
}
