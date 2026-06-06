/**
 * @file InsuranceModule.test.ts
 * @description Tests 15-20: Policy creation, FHE.select claim payments, replay protection,
 *              and vault balance assertions. All values are MOCK DATA.
 */

import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import type { PatientRegistry }  from "../typechain-types";
import type { HealthQueryEngine } from "../typechain-types";
import type { InsuranceModule }   from "../typechain-types";
import type { MockPaymentVault }  from "../typechain-types";

/*************** Helpers ***************/

async function encryptU64(
    value:        bigint,
    contractAddr: string,
    user:         HardhatEthersSigner
): Promise<{ handle: Uint8Array; proof: Uint8Array }> {
    const input = fhevm.createEncryptedInput(contractAddr, user.address);
    input.add64(value);
    const enc = await input.encrypt();
    return { handle: enc.handles[0], proof: enc.inputProof };
}

async function registerAndAuthorize(
    registry:       PatientRegistry,
    engine:         HealthQueryEngine,
    patient:        HardhatEthersSigner,
    riskScore:      bigint,
    conditionFlags: bigint
): Promise<void> {
    const regAddr    = await registry.getAddress();
    const engineAddr = await engine.getAddress();

    const [rs, cf, ag, mc] = await Promise.all([
        encryptU64(riskScore,      regAddr, patient),
        encryptU64(conditionFlags, regAddr, patient),
        encryptU64(35n,            regAddr, patient),
        encryptU64(2n,             regAddr, patient),
    ]);
    const txReg = await registry.connect(patient).registerPatient(
        rs.handle, rs.proof,
        cf.handle, cf.proof,
        ag.handle, ag.proof,
        mc.handle, mc.proof
    );
    await txReg.wait();

    const txAuth = await registry.connect(patient).authorizeProvider(engineAddr);
    await txAuth.wait();
}

/**
 * Run an eligibility check via HealthQueryEngine and return the resulting checkId.
 * Parses the EligibilityChecked event from the transaction receipt.
 */
async function runCheckAndGetId(
    engine:    HealthQueryEngine,
    provider:  HardhatEthersSigner,
    patient:   HardhatEthersSigner,
    threshold: number
): Promise<string> {
    const tx      = await engine.connect(provider).runEligibilityCheck(patient.address, threshold);
    const receipt = await tx.wait();
    const event   = receipt?.logs
        .map((log) => { try { return engine.interface.parseLog(log); } catch { return null; } })
        .find((e) => e?.name === "EligibilityChecked");
    if (!event) throw new Error("EligibilityChecked event not found");
    return event.args.checkId as string;
}

/*************** Test Suite ***************/

describe("InsuranceModule", function () {

    let registry:  PatientRegistry;
    let engine:    HealthQueryEngine;
    let insurance: InsuranceModule;
    let vault:     MockPaymentVault;

    let owner:        HardhatEthersSigner;
    let alice:        HardhatEthersSigner;
    let bob:          HardhatEthersSigner;
    let provider:     HardhatEthersSigner;

    let registryAddr:  string;
    let engineAddr:    string;
    let insuranceAddr: string;
    let vaultAddr:     string;

    const COVERAGE_AMOUNT = 5000n;

    beforeEach(async function () {
        [owner, alice, bob, provider] = await ethers.getSigners();

        const RegistryFactory  = await ethers.getContractFactory("PatientRegistry");
        const EngineFactory    = await ethers.getContractFactory("HealthQueryEngine");
        const InsuranceFactory = await ethers.getContractFactory("InsuranceModule");
        const VaultFactory     = await ethers.getContractFactory("MockPaymentVault");

        registry  = await RegistryFactory.deploy() as unknown as PatientRegistry;
        await registry.waitForDeployment();
        registryAddr = await registry.getAddress();

        engine = await EngineFactory.deploy(registryAddr) as unknown as HealthQueryEngine;
        await engine.waitForDeployment();
        engineAddr = await engine.getAddress();

        insurance = await InsuranceFactory.deploy(engineAddr) as unknown as InsuranceModule;
        await insurance.waitForDeployment();
        insuranceAddr = await insurance.getAddress();

        vault = await VaultFactory.deploy(insuranceAddr) as unknown as MockPaymentVault;
        await vault.waitForDeployment();
        vaultAddr = await vault.getAddress();

        /* Wire InsuranceModule into HealthQueryEngine (for ACL grants on eligibility results). */
        const txSetIns = await engine.connect(owner).setInsuranceModule(insuranceAddr);
        await txSetIns.wait();

        /* Wire vault into InsuranceModule. */
        const txSetVault = await insurance.connect(owner).setPaymentVault(vaultAddr);
        await txSetVault.wait();

        /* Seed the vault with demo ETH so getBalance() is non-zero before tests. */
        const txDeposit = await vault.connect(owner).depositFunds({ value: ethers.parseEther("1.0") });
        await txDeposit.wait();
    });

    /*************** Test 15 ***************/

    it("Test 15: createPolicy stores policy with correct parameters", async function () {
        const txPol = await insurance.connect(owner).createPolicy(
            alice.address,
            100n,
            COVERAGE_AMOUNT,
            70
        );
        await txPol.wait();

        const policy = await insurance.getPolicy(alice.address);
        expect(policy.monthlyPremium).to.equal(100n);
        expect(policy.coverageAmount).to.equal(COVERAGE_AMOUNT);
        expect(policy.riskThreshold).to.equal(70n);
        expect(policy.active).to.be.true;
    });

    /*************** Test 16 ***************/

    it("Test 16: processClaimPayment - eligible patient receives coverage amount in vault", async function () {
        /*
         * Alice registers with riskScore=40. Threshold=70 so FHE.le(40, 70) = true.
         * FHE.select selects coverageAmount branch; vault decrypted payment = COVERAGE_AMOUNT.
         */
        await registerAndAuthorize(registry, engine, alice, 40n, 0n);

        const txPol = await insurance.connect(owner).createPolicy(alice.address, 100n, COVERAGE_AMOUNT, 70);
        await txPol.wait();

        const checkId = await runCheckAndGetId(engine, provider, alice, 70);

        const txClaim = await insurance.connect(provider).processClaimPayment(alice.address, checkId);
        await txClaim.wait();

        /* Verify the encrypted payment amount stored in vault decrypts to coverageAmount. */
        const payHandle    = await vault.getPendingPayment(alice.address);
        const payDecrypted = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            payHandle,
            vaultAddr,
            alice
        );
        expect(payDecrypted).to.equal(COVERAGE_AMOUNT);
    });

    /*************** Test 17 ***************/

    it("Test 17: processClaimPayment - ineligible patient vault payment decrypts to 0", async function () {
        /*
         * Bob registers with riskScore=90. Threshold=70 so FHE.le(90, 70) = false.
         * FHE.select selects zero branch; vault decrypted payment = 0.
         */
        await registerAndAuthorize(registry, engine, bob, 90n, 0n);

        const txPol = await insurance.connect(owner).createPolicy(bob.address, 100n, COVERAGE_AMOUNT, 70);
        await txPol.wait();

        const checkId = await runCheckAndGetId(engine, provider, bob, 70);

        const txClaim = await insurance.connect(provider).processClaimPayment(bob.address, checkId);
        await txClaim.wait();

        const payHandle    = await vault.getPendingPayment(bob.address);
        const payDecrypted = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            payHandle,
            vaultAddr,
            bob
        );
        expect(payDecrypted).to.equal(0n);
    });

    /*************** Test 18 ***************/

    it("Test 18: processClaimPayment replay protection - same checkId cannot be used twice", async function () {
        await registerAndAuthorize(registry, engine, alice, 40n, 0n);

        const txPol = await insurance.connect(owner).createPolicy(alice.address, 100n, COVERAGE_AMOUNT, 70);
        await txPol.wait();

        const checkId   = await runCheckAndGetId(engine, provider, alice, 70);
        const txFirst   = await insurance.connect(provider).processClaimPayment(alice.address, checkId);
        await txFirst.wait();

        /* Second use of the same checkId must revert. */
        await expect(
            insurance.connect(provider).processClaimPayment(alice.address, checkId)
        ).to.be.revertedWith("Claim already processed");
    });

    /*************** Test 19 ***************/

    it("Test 19: processClaimPayment reverts when no active policy exists for the patient", async function () {
        await registerAndAuthorize(registry, engine, alice, 40n, 0n);
        const checkId = await runCheckAndGetId(engine, provider, alice, 70);

        /*
         * No policy has been created for alice - revert expected.
         */
        await expect(
            insurance.connect(provider).processClaimPayment(alice.address, checkId)
        ).to.be.revertedWith("No active policy");
    });

    /*************** Test 20 ***************/

    it("Test 20: Payment vault integration - vault balance decreases after claim is processed", async function () {
        await registerAndAuthorize(registry, engine, alice, 40n, 0n);

        const txPol = await insurance.connect(owner).createPolicy(alice.address, 100n, COVERAGE_AMOUNT, 70);
        await txPol.wait();

        const checkId = await runCheckAndGetId(engine, provider, alice, 70);

        const balBefore = await vault.getBalance();

        const txClaim = await insurance.connect(provider).processClaimPayment(alice.address, checkId);
        await txClaim.wait();

        const balAfter = await vault.getBalance();

        /* Each releasePremium call decrements reserve by RESERVE_UNIT (1 wei). */
        expect(balAfter).to.be.lt(balBefore);
        expect(balBefore - balAfter).to.equal(await vault.RESERVE_UNIT());
    });
});
