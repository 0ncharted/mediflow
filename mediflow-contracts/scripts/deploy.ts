/**
 * @file deploy.ts
 * @description Deployment script for all MediFlow contracts.
 *              Deploys in dependency order and wires contracts together after deployment.
 *              Run: npx hardhat run scripts/deploy.ts --network sepolia
 *
 *              IMPORTANT: After deployment, patients must call
 *              PatientRegistry.authorizeProvider(address(healthQueryEngine))
 *              before eligibility checks can run on their data.
 *
 *              All deployed contract addresses are printed to stdout. Save them - there is
 *              no on-chain registry; addresses must be hard-coded in the frontend config.
 */

import { ethers } from "hardhat";

async function main(): Promise<void> {
    const [deployer] = await ethers.getSigners();
    const network    = await ethers.provider.getNetwork();

    console.log(`Deploying MediFlow contracts on chain ${network.chainId}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance:  ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} ETH`);

    /* ===== 1. PatientRegistry ===== */
    const RegistryFactory = await ethers.getContractFactory("PatientRegistry");
    const registry        = await RegistryFactory.deploy();
    await registry.waitForDeployment();
    const registryAddr    = await registry.getAddress();
    console.log(`PatientRegistry:  ${registryAddr}`);

    /* ===== 2. HealthQueryEngine (depends on PatientRegistry) ===== */
    const EngineFactory = await ethers.getContractFactory("HealthQueryEngine");
    const engine        = await EngineFactory.deploy(registryAddr);
    await engine.waitForDeployment();
    const engineAddr    = await engine.getAddress();
    console.log(`HealthQueryEngine: ${engineAddr}`);

    /* ===== 3. ResearchRegistry ===== */
    const ResRegFactory = await ethers.getContractFactory("ResearchRegistry");
    const resRegistry   = await ResRegFactory.deploy();
    await resRegistry.waitForDeployment();
    const resRegistryAddr = await resRegistry.getAddress();
    console.log(`ResearchRegistry:  ${resRegistryAddr}`);

    /* ===== 4. InsuranceModule (depends on HealthQueryEngine) ===== */
    const InsuranceFactory = await ethers.getContractFactory("InsuranceModule");
    const insurance        = await InsuranceFactory.deploy(engineAddr);
    await insurance.waitForDeployment();
    const insuranceAddr    = await insurance.getAddress();
    console.log(`InsuranceModule:   ${insuranceAddr}`);

    /* ===== 5. MockPaymentVault (depends on InsuranceModule) ===== */
    const VaultFactory = await ethers.getContractFactory("MockPaymentVault");
    const vault        = await VaultFactory.deploy(insuranceAddr);
    await vault.waitForDeployment();
    const vaultAddr    = await vault.getAddress();
    console.log(`MockPaymentVault:  ${vaultAddr}`);

    /* ===== Wire contracts together ===== */
    console.log("\nWiring contracts...");

    /* Grant HealthQueryEngine automatic ACL on every future registerPatient call. */
    const txSetQEInReg = await registry.setQueryEngine(engineAddr);
    await txSetQEInReg.wait();
    console.log("PatientRegistry.setQueryEngine done");

    const txSetIns = await engine.setInsuranceModule(insuranceAddr);
    await txSetIns.wait();
    console.log("HealthQueryEngine.setInsuranceModule done");

    const txSetRes = await engine.setResearchRegistry(resRegistryAddr);
    await txSetRes.wait();
    console.log("HealthQueryEngine.setResearchRegistry done");

    const txSetQE = await resRegistry.setQueryEngine(engineAddr);
    await txSetQE.wait();
    console.log("ResearchRegistry.setQueryEngine done");

    const txSetVault = await insurance.setPaymentVault(vaultAddr);
    await txSetVault.wait();
    console.log("InsuranceModule.setPaymentVault done");

    /* ===== Print summary ===== */
    console.log("\n=== DEPLOYMENT SUMMARY ===");
    console.log(`VITE_PATIENT_REGISTRY_ADDRESS=${registryAddr}`);
    console.log(`VITE_HEALTH_QUERY_ENGINE_ADDRESS=${engineAddr}`);
    console.log(`VITE_RESEARCH_REGISTRY_ADDRESS=${resRegistryAddr}`);
    console.log(`VITE_INSURANCE_MODULE_ADDRESS=${insuranceAddr}`);
    console.log(`VITE_PAYMENT_VAULT_ADDRESS=${vaultAddr}`);
    console.log("\nCopy the VITE_* lines to artifacts/mediflow-ui/.env");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
