import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { sepolia } from "wagmi/chains";

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

if (!PROJECT_ID) {
  console.warn(
    "VITE_WALLETCONNECT_PROJECT_ID not set — WalletConnect disabled, MetaMask/injected wallets only",
  );
}

export const wagmiConfig = getDefaultConfig({
  appName: "MediFlow",
  projectId: PROJECT_ID ?? "mediflow-dev-placeholder",
  chains: [sepolia],
  transports: {
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
  },
});
