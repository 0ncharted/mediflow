/**
 * @file hardhat.config.ts
 * @description Hardhat configuration for MediFlow FHEVM contracts targeting Sepolia and local mock.
 */

import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";

import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const RPC_URL = process.env.RPC_URL || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    networks: {
        hardhat: { chainId: 31337 },
        sepolia: {
            chainId: 11155111,
            url: RPC_URL,
            accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
        },
    },
    solidity: {
        version: "0.8.28",
        settings: {
            optimizer: { enabled: true, runs: 800 },
            evmVersion: "cancun",
            metadata: { bytecodeHash: "none" },
        },
    },
    typechain: {
        outDir: "typechain-types",
        target: "ethers-v6",
    },
    etherscan: { apiKey: ETHERSCAN_API_KEY },
};

export default config;
