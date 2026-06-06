/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
import {
  getAccount,
  getBlock,
  getChainId,
  readContract,
  signTypedData as wagmiSignTypedData,
  waitForTransactionReceipt,
  watchAccount,
  writeContract as wagmiWriteContract,
} from "@wagmi/core";
import { RelayerWeb, indexedDBStorage, SepoliaConfig } from "@zama-fhe/sdk";
import { wagmiConfig } from "@/lib/wagmi";

// wagmiConfig is RainbowKit's typed Config<[Sepolia]>; @wagmi/core actions expect
// the generic unparameterised Config — cross-package version mismatch, safe at runtime.
const cfg = wagmiConfig as any;

class MediFlowWagmiSigner {
  async getChainId(): Promise<number> {
    return getChainId(cfg);
  }

  async getAddress(): Promise<`0x${string}`> {
    const acct = getAccount(cfg);
    if (!acct?.address) throw new TypeError("Wallet not connected");
    return acct.address as `0x${string}`;
  }

  async signTypedData(params: any): Promise<`0x${string}`> {
    const { EIP712Domain: _omit, ...types } = params?.types ?? {};
    const primaryType = Object.keys(types)[0];
    return wagmiSignTypedData(cfg, {
      primaryType,
      types,
      domain: params?.domain,
      message: params?.message,
    });
  }

  async writeContract(params: any): Promise<`0x${string}`> {
    return wagmiWriteContract(cfg, params);
  }

  async readContract(params: any): Promise<unknown> {
    return readContract(cfg, params);
  }

  async waitForTransactionReceipt(hash: `0x${string}`) {
    return waitForTransactionReceipt(cfg, { hash });
  }

  async getBlockTimestamp(): Promise<bigint> {
    const block = await getBlock(cfg);
    return block.timestamp;
  }

  subscribe(callbacks: {
    onDisconnect?: () => void;
    onAccountChange?: (address: string) => void;
    onChainChange?: (chainId: number) => void;
  } = {}) {
    const {
      onDisconnect = () => {},
      onAccountChange = () => {},
      onChainChange = () => {},
    } = callbacks;
    return watchAccount(cfg, {
      onChange(curr, prev) {
        if (curr.status === "disconnected" && prev.status !== "disconnected") onDisconnect();
        if (prev.address && curr.address && curr.address !== prev.address)
          onAccountChange(curr.address);
        if (
          typeof prev.chainId === "number" &&
          typeof curr.chainId === "number" &&
          curr.chainId !== prev.chainId
        )
          onChainChange(curr.chainId);
      },
    });
  }
}

export const zamaSigner = new MediFlowWagmiSigner();

export const zamaRelayer = new RelayerWeb({
  getChainId: () => zamaSigner.getChainId(),
  transports: {
    [SepoliaConfig.chainId]: {
      ...SepoliaConfig,
    },
  },
});

export { indexedDBStorage };
