import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("Seeding with:", owner.address);

  // deployments/sepolia.json lives one level up from scripts/
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const deployments = require("../deployments/sepolia.json") as {
    contracts: {
      PatientRegistry: string;
      HealthQueryEngine: string;
      ResearchRegistry: string;
      InsuranceModule: string;
      MockPaymentVault: string;
    };
  };

  const researchRegistry = await ethers.getContractAt(
    "ResearchRegistry",
    deployments.contracts.ResearchRegistry,
  );
  const vault = await ethers.getContractAt(
    "MockPaymentVault",
    deployments.contracts.MockPaymentVault,
  );

  // Approve research institution (owner address as demo institution)
  const tx1 = await researchRegistry.approveInstitution(
    owner.address,
    "Demo Research Institute",
    "Clinical trial demonstration",
  );
  await tx1.wait();
  console.log("Institution approved.");
  console.log("  Tx:       ", tx1.hash);
  console.log("  Etherscan:", `https://sepolia.etherscan.io/tx/${tx1.hash}`);

  // Seed vault with ETH for demo payouts
  const tx2 = await vault.depositFunds({ value: ethers.parseEther("0.01") });
  await tx2.wait();
  console.log("Vault seeded with 0.01 ETH.");
  console.log("  Tx:       ", tx2.hash);
  console.log("  Etherscan:", `https://sepolia.etherscan.io/tx/${tx2.hash}`);

  console.log("\nSeed complete. Contract addresses:");
  console.log(JSON.stringify(deployments.contracts, null, 2));
}

main().catch(console.error);
