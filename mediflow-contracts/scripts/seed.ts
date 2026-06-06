/**
 * @file seed.ts
 * @description Seeds MediFlow contracts with mock patient data, cohorts, policies,
 *              and a mock research institution. All data is synthetic — no real records.
 *
 * Usage (after deploying contracts):
 *   PATIENT_REGISTRY_ADDRESS=0x… \
 *   HEALTH_QUERY_ENGINE_ADDRESS=0x… \
 *   INSURANCE_MODULE_ADDRESS=0x… \
 *   RESEARCH_REGISTRY_ADDRESS=0x… \
 *   MOCK_PAYMENT_VAULT_ADDRESS=0x… \
 *   npx hardhat run scripts/seed.ts --network sepolia
 *
 * For local Hardhat network (no env vars needed — uses fresh deploy):
 *   npx hardhat run scripts/seed.ts --network localhost
 */

import { ethers, fhevm } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type {
  PatientRegistry,
  HealthQueryEngine,
  InsuranceModule,
  ResearchRegistry,
  MockPaymentVault,
} from "../typechain-types";

/* ───────────────────────── helpers ───────────────────────── */

async function encryptU64(
  value: bigint,
  contractAddr: string,
  user: HardhatEthersSigner,
): Promise<{ handle: Uint8Array; proof: Uint8Array }> {
  const input = fhevm.createEncryptedInput(contractAddr, user.address);
  input.add64(value);
  const enc = await input.encrypt();
  return { handle: enc.handles[0], proof: enc.inputProof };
}

async function registerPatient(
  registry: PatientRegistry,
  patient: HardhatEthersSigner,
  riskScore: bigint,
  conditionFlags: bigint,
  age: bigint,
  medCount: bigint,
): Promise<void> {
  const addr = await registry.getAddress();
  const [rs, cf, ag, mc] = await Promise.all([
    encryptU64(riskScore, addr, patient),
    encryptU64(conditionFlags, addr, patient),
    encryptU64(age, addr, patient),
    encryptU64(medCount, addr, patient),
  ]);

  const tx = await registry.connect(patient).registerPatient(
    rs.handle, rs.proof,
    cf.handle, cf.proof,
    ag.handle, ag.proof,
    mc.handle, mc.proof,
  );
  await tx.wait();
  console.log(`  ✓ Patient ${patient.address.slice(0, 10)}… registered (risk=${riskScore})`);
}

/* ───────────────────────── mock profiles ───────────────────────── */

/**
 * 5 mock patients — all data is synthetic.
 *
 * conditionFlags bitmask:
 *   bit 0 (1) = Diabetes
 *   bit 1 (2) = Hypertension
 *   bit 2 (4) = Cardiac History
 */
const MOCK_PATIENTS = [
  { riskScore: 25n, conditionFlags: 0n, age: 32n, medCount: 1n,  label: "Healthy young adult"       },
  { riskScore: 65n, conditionFlags: 1n, age: 55n, medCount: 4n,  label: "Moderate risk, diabetes"   },
  { riskScore: 88n, conditionFlags: 3n, age: 67n, medCount: 8n,  label: "High risk, DM + HTN"       },
  { riskScore: 42n, conditionFlags: 2n, age: 48n, medCount: 2n,  label: "Moderate, hypertension"    },
  { riskScore: 91n, conditionFlags: 7n, age: 72n, medCount: 12n, label: "Very high risk, all flags" },
] as const;

/* ───────────────────────── main ───────────────────────── */

async function main() {
  const signers = await ethers.getSigners();
  const [owner, p1, p2, p3, p4, p5, institution] = signers;

  console.log("\n🌱  MediFlow seed script — all data is MOCK/SYNTHETIC\n");
  console.log("Owner:      ", owner.address);
  console.log("Patients:   ", [p1, p2, p3, p4, p5].map((s) => s.address).join(", "));
  console.log("Institution:", institution.address);
  console.log("");

  /* ── resolve contract addresses ── */
  let registry: PatientRegistry;
  let engine: HealthQueryEngine;
  let insurance: InsuranceModule;
  let resRegistry: ResearchRegistry;
  let vault: MockPaymentVault;

  const envRegistry  = process.env.PATIENT_REGISTRY_ADDRESS;
  const envEngine    = process.env.HEALTH_QUERY_ENGINE_ADDRESS;
  const envInsurance = process.env.INSURANCE_MODULE_ADDRESS;
  const envResReg    = process.env.RESEARCH_REGISTRY_ADDRESS;
  const envVault     = process.env.MOCK_PAYMENT_VAULT_ADDRESS;

  if (envRegistry && envEngine && envInsurance && envResReg && envVault) {
    console.log("📌  Using deployed contract addresses from environment variables\n");
    registry    = (await ethers.getContractAt("PatientRegistry",  envRegistry))  as unknown as PatientRegistry;
    engine      = (await ethers.getContractAt("HealthQueryEngine", envEngine))   as unknown as HealthQueryEngine;
    insurance   = (await ethers.getContractAt("InsuranceModule",  envInsurance)) as unknown as InsuranceModule;
    resRegistry = (await ethers.getContractAt("ResearchRegistry", envResReg))    as unknown as ResearchRegistry;
    vault       = (await ethers.getContractAt("MockPaymentVault", envVault))     as unknown as MockPaymentVault;
  } else {
    console.log("📦  No env vars found — deploying fresh contracts\n");
    registry    = await (await ethers.getContractFactory("PatientRegistry")).deploy()  as unknown as PatientRegistry;
    engine      = await (await ethers.getContractFactory("HealthQueryEngine")).deploy(await registry.getAddress()) as unknown as HealthQueryEngine;
    insurance   = await (await ethers.getContractFactory("InsuranceModule")).deploy(await registry.getAddress(), await engine.getAddress()) as unknown as InsuranceModule;
    resRegistry = await (await ethers.getContractFactory("ResearchRegistry")).deploy() as unknown as ResearchRegistry;
    vault       = await (await ethers.getContractFactory("MockPaymentVault")).deploy() as unknown as MockPaymentVault;

    await Promise.all([
      registry.waitForDeployment(),
      engine.waitForDeployment(),
      insurance.waitForDeployment(),
      resRegistry.waitForDeployment(),
      vault.waitForDeployment(),
    ]);

    console.log("PatientRegistry:  ", await registry.getAddress());
    console.log("HealthQueryEngine:", await engine.getAddress());
    console.log("InsuranceModule:  ", await insurance.getAddress());
    console.log("ResearchRegistry: ", await resRegistry.getAddress());
    console.log("MockPaymentVault: ", await vault.getAddress());
    console.log("");
  }

  const registryAddr = await registry.getAddress();
  const engineAddr   = await engine.getAddress();
  const patients     = [p1, p2, p3, p4, p5];

  /* ── 1. Register 5 mock patients ── */
  console.log("1️⃣   Registering 5 mock patients…");
  for (let i = 0; i < patients.length; i++) {
    const p = MOCK_PATIENTS[i];
    await registerPatient(registry, patients[i], p.riskScore, p.conditionFlags, p.age, p.medCount);
    const authTx = await registry.connect(patients[i]).authorizeProvider(engineAddr);
    await authTx.wait();
  }
  console.log("");

  /* ── 2. Approve research institution ── */
  console.log("2️⃣   Approving research institution…");
  const approveTx = await resRegistry.connect(owner).approveInstitution(
    institution.address,
    "Mayo Clinic Research Division",
    "Aggregate diabetes prevalence and risk score studies",
  );
  await approveTx.wait();
  console.log(`  ✓ Approved: ${institution.address}`);
  console.log("");

  /* ── 3. Register 2 cohorts ── */
  console.log("3️⃣   Registering cohorts…");

  const cohortAId = ethers.id("cohort-A-all-patients-2026");
  const cohortATx = await resRegistry.connect(institution).registerCohort(
    institution.address,
    cohortAId,
    patients.map((p) => p.address),
  );
  await cohortATx.wait();
  console.log(`  ✓ Cohort A (all 5 patients): ${cohortAId.slice(0, 14)}…`);

  const cohortBId = ethers.id("cohort-B-high-risk-2026");
  const cohortBTx = await resRegistry.connect(institution).registerCohort(
    institution.address,
    cohortBId,
    [p2.address, p3.address, p5.address],
  );
  await cohortBTx.wait();
  console.log(`  ✓ Cohort B (patients 2, 3, 5): ${cohortBId.slice(0, 14)}…`);
  console.log("");

  /* ── 4. Create insurance policies for all 5 patients ── */
  console.log("4️⃣   Creating insurance policies…");
  const PREMIUMS   = [ethers.parseEther("0.005"), ethers.parseEther("0.01"), ethers.parseEther("0.02"), ethers.parseEther("0.008"), ethers.parseEther("0.025")];
  const COVERAGES  = [ethers.parseEther("1.0"), ethers.parseEther("0.8"), ethers.parseEther("0.5"), ethers.parseEther("0.9"), ethers.parseEther("0.3")];
  const THRESHOLDS = [80n, 70n, 60n, 75n, 50n];

  for (let i = 0; i < patients.length; i++) {
    const tx = await insurance.connect(owner).createPolicy(
      patients[i].address,
      PREMIUMS[i],
      COVERAGES[i],
      THRESHOLDS[i],
    );
    await tx.wait();
    console.log(`  ✓ Policy for Patient ${i + 1} (threshold=${THRESHOLDS[i]}, premium=${ethers.formatEther(PREMIUMS[i])} ETH)`);
  }
  console.log("");

  /* ── 5. Seed MockPaymentVault ── */
  console.log("5️⃣   Seeding MockPaymentVault with 10 ETH…");
  try {
    const depositTx = await vault.connect(owner).deposit({ value: ethers.parseEther("10") });
    await depositTx.wait();
    console.log("  ✓ Vault funded with 10 ETH");
  } catch {
    console.log("  ⚠ Vault deposit failed — check MockPaymentVault.deposit() signature");
  }
  console.log("");

  console.log("✅  Seed complete!\n");
  console.log("Contract addresses to set as VITE_* env vars:");
  console.log(`  VITE_PATIENT_REGISTRY_ADDRESS=${await registry.getAddress()}`);
  console.log(`  VITE_HEALTH_QUERY_ENGINE_ADDRESS=${await engine.getAddress()}`);
  console.log(`  VITE_INSURANCE_MODULE_ADDRESS=${await insurance.getAddress()}`);
  console.log(`  VITE_RESEARCH_REGISTRY_ADDRESS=${await resRegistry.getAddress()}`);
  console.log(`  VITE_MOCK_PAYMENT_VAULT_ADDRESS=${await vault.getAddress()}`);
  console.log("");
  console.log("Mock patient wallets (use as signers for frontend testing):");
  patients.forEach((p, i) => {
    const profile = MOCK_PATIENTS[i];
    console.log(`  Patient ${i + 1}: ${p.address} — risk=${profile.riskScore}, age=${profile.age} (${profile.label})`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
