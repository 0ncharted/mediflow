import { createContext, useContext, useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, lightTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { ZamaProvider, useZamaSDK } from "@zama-fhe/react-sdk";
import { wagmiConfig } from "@/lib/wagmi";
import { zamaRelayer, zamaSigner, indexedDBStorage } from "@/lib/fhevm";

const queryClient = new QueryClient();

export type RelayerStatus = "loading" | "ready" | "error";
const RelayerStatusContext = createContext<RelayerStatus>("loading");
export const useRelayerStatus = () => useContext(RelayerStatusContext);

function ZamaStatusBridge({ onReady }: { onReady: () => void }) {
  const sdk = useZamaSDK();
  useEffect(() => {
    if (sdk) onReady();
  }, [sdk, onReady]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [relayerStatus, setRelayerStatus] = useState<RelayerStatus>("loading");

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider
          relayer={zamaRelayer}
          signer={zamaSigner as never}
          storage={indexedDBStorage}
          onEvent={() => {
            setRelayerStatus("ready");
          }}
        >
          <RelayerStatusContext.Provider value={relayerStatus}>
            <ZamaStatusBridge onReady={() => setRelayerStatus("ready")} />
            <RainbowKitProvider
              theme={lightTheme({
                accentColor: "#0b7a45",
                accentColorForeground: "white",
                borderRadius: "medium",
              })}
            >
              {children}
            </RainbowKitProvider>
          </RelayerStatusContext.Provider>
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
