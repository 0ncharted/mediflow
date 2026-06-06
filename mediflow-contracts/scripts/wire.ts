/**
 * @file wire.ts
 * @description Completes the post-deployment wiring for already-deployed MediFlow contracts.
 *              Run this if the full deploy.ts script timed out after contracts were deployed.
 *              Run: npx hardhat run scripts/wire.ts --network sepolia
 */

import { ethers } from "hardhat";

const ADDRESSES = {
    patientRegistry:   "0x39e50e384f0d4DB24d2FD9BcF98c954C551Bfa71",
    healthQueryEngine: "0xB0e3cA8c95705F1E61D5c5f5575fBEBC269Aee95",
    researchRegistry:  "0x6F27ad8aa0aDc0e8D4090Cede877F3EA82808d22",
    insuranceModule:   "0xe0d3F99414d05fe2f1d6b087A114fC12A2b9b5a6",
    mockPaymentVault:  "0xF8bE9FcDfbB22DE62C09ae18fd09146DE2711d71",
};

async function main(): Promise<void> {
    const [deployer] = await ethers.getSigners();
    console.log(`Wiring MediFlow contracts on Sepolia`);
    console.log(`Deployer: ${deployer.address}`);

    const engine      = await ethers.getContractAt("HealthQueryEngine", ADDRESSES.healthQueryEngine);
    const resRegistry = await ethers.getContractAt("ResearchRegistry",  ADDRESSES.researchRegistry);
    const insurance   = await ethers.getContractAt("InsuranceModule",   ADDRESSES.insuranceModule);

    console.log("Calling HealthQueryEngine.setInsuranceModule...");
    const tx1 = await engine.setInsuranceModule(ADDRESSES.insuranceModule);
    await tx1.wait();
    console.log("HealthQueryEngine.setInsuranceModule done");

    console.log("Calling HealthQueryEngine.setResearchRegistry...");
    const tx2 = await engine.setResearchRegistry(ADDRESSES.researchRegistry);
    await tx2.wait();
    console.log("HealthQueryEngine.setResearchRegistry done");

    console.log("Calling ResearchRegistry.setQueryEngine...");
    const tx3 = await resRegistry.setQueryEngine(ADDRESSES.healthQueryEngine);
    await tx3.wait();
    console.log("ResearchRegistry.setQueryEngine done");

    console.log("Calling InsuranceModule.setPaymentVault...");
    const tx4 = await insurance.setPaymentVault(ADDRESSES.mockPaymentVault);
    await tx4.wait();
    console.log("InsuranceModule.setPaymentVault done");

    console.log("\n=== WIRING COMPLETE ===");
    console.log(`VITE_PATIENT_REGISTRY_ADDRESS=${ADDRESSES.patientRegistry}`);
    console.log(`VITE_HEALTH_QUERY_ENGINE_ADDRESS=${ADDRESSES.healthQueryEngine}`);
    console.log(`VITE_RESEARCH_REGISTRY_ADDRESS=${ADDRESSES.researchRegistry}`);
    console.log(`VITE_INSURANCE_MODULE_ADDRESS=${ADDRESSES.insuranceModule}`);
    console.log(`VITE_PAYMENT_VAULT_ADDRESS=${ADDRESSES.mockPaymentVault}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
