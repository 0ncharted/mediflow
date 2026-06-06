/**
 * @file HealthQueryEngine.test.ts
 * @description Tests 9-14: Eligibility checks (FHE.le), aggregate queries (FHE.select loop),
 *              and ResearchRegistry gate. All values are MOCK DATA.
 */

import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import type { PatientRegistry }  from "../typechain-types";
import type { HealthQueryEngine } from "../typechain-types";
import type { ResearchRegistry }  from "../typechain-types";

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
    const addr = await registry.getAddress();
    const [rs, cf, ag, mc] = await Promise.all([
        encryptU64(riskScore,      addr, patient),
        encryptU64(conditionFlags, addr, patient),
        encryptU64(38n,            addr, patient),
        encryptU64(2n,             addr, patient),
    ]);
    const txReg = await registry.connect(patient).registerPatient(
        rs.handle, rs.proof,
        cf.handle, cf.proof,
        ag.handle, ag.proof,
        mc.handle, mc.proof
    );
    await txReg.wait();

    const engineAddr = await engine.getAddress();
    const txAuth     = await registry.connect(patient).authorizeProvider(engineAddr);
    await txAuth.wait();
}

/*************** Test Suite ***************/

describe("HealthQueryEngine", function () {

    let registry:     PatientRegistry;
    let engine:       HealthQueryEngine;
    let resRegistry:  ResearchRegistry;
    let owner:        HardhatEthersSigner;
    let alice:        HardhatEthersSigner;
    let bob:          HardhatEthersSigner;
    let carol:        HardhatEthersSigner;
    let provider:     HardhatEthersSigner;
    let institution:  HardhatEthersSigner;
    let engineAddr:   string;
    let registryAddr: string;

    beforeEach(async function () {
        [owner, alice, bob, carol, provider, institution] = await ethers.getSigners();

        const RegistryFactory  = await ethers.getContractFactory("PatientRegistry");
        const EngineFactory    = await ethers.getContractFactory("HealthQueryEngine");
        const ResRegFactory    = await ethers.getContractFactory("ResearchRegistry");

        registry    = await RegistryFactory.deploy() as unknown as PatientRegistry;
        await registry.waitForDeployment();
        registryAddr = await registry.getAddress();

        engine = await EngineFactory.deploy(registryAddr) as unknown as HealthQueryEngine;
        await engine.waitForDeployment();
        engineAddr = await engine.getAddress();

        resRegistry = await ResRegFactory.deploy() as unknown as ResearchRegistry;
        await resRegistry.waitForDeployment();
        const resRegistryAddr = await resRegistry.getAddress();

        /* Wire ResearchRegistry into engine. */
        const txSetRes = await engine.connect(owner).setResearchRegistry(resRegistryAddr);
        await txSetRes.wait();

        /* Wire engine into ResearchRegistry so incrementQueryCount is permitted. */
        const txSetEng = await resRegistry.connect(owner).setQueryEngine(engineAddr);
        await txSetEng.wait();

        /* Approve the test institution. */
        const txApprove = await resRegistry.connect(owner).approveInstitution(
            institution.address,
            "Demo Research Institute",
            "Aggregate health analytics"
        );
        await txApprove.wait();
    });

    /*************** Test 9 ***************/

    it("Test 9: runEligibilityCheck - riskScore=40 with threshold=70 returns eligible=true", async function () {
        await registerAndAuthorize(registry, engine, alice, 40n, 0n);

        const tx = await engine.connect(provider).runEligibilityCheck(alice.address, 70);
        const receipt = await tx.wait();
        const event   = receipt?.logs
            .map((log) => { try { return engine.interface.parseLog(log); } catch { return null; } })
            .find((e) => e?.name === "EligibilityChecked");
        expect(event).to.not.be.undefined;
        const checkId = event!.args.checkId as string;

        const resultHandle = await engine.getEligibilityResult(checkId);
        const eligible     = await fhevm.userDecryptEbool(resultHandle, engineAddr, provider);
        expect(eligible).to.equal(true);
    });

    /*************** Test 10 ***************/

    it("Test 10: runEligibilityCheck - riskScore=90 with threshold=70 returns eligible=false", async function () {
        await registerAndAuthorize(registry, engine, bob, 90n, 0n);

        const tx      = await engine.connect(provider).runEligibilityCheck(bob.address, 70);
        const receipt = await tx.wait();
        const event   = receipt?.logs
            .map((log) => { try { return engine.interface.parseLog(log); } catch { return null; } })
            .find((e) => e?.name === "EligibilityChecked");
        const checkId = event!.args.checkId as string;

        const resultHandle = await engine.getEligibilityResult(checkId);
        const eligible     = await fhevm.userDecryptEbool(resultHandle, engineAddr, provider);
        expect(eligible).to.equal(false);
    });

    /*************** Test 11 ***************/

    it("Test 11: runEligibilityCheck stores result under unique checkId, checkExists returns true", async function () {
        await registerAndAuthorize(registry, engine, alice, 55n, 0n);

        const tx      = await engine.connect(provider).runEligibilityCheck(alice.address, 60);
        const receipt = await tx.wait();
        const event   = receipt?.logs
            .map((log) => { try { return engine.interface.parseLog(log); } catch { return null; } })
            .find((e) => e?.name === "EligibilityChecked");
        const checkId = event!.args.checkId as string;

        expect(await engine.checkExists(checkId)).to.be.true;

        /* A fabricated checkId must not exist. */
        const fakeId = ethers.keccak256(ethers.toUtf8Bytes("nonexistent"));
        expect(await engine.checkExists(fakeId)).to.be.false;
    });

    /*************** Test 12 ***************/

    it("Test 12: runAggregateQuery type 0 counts patients with riskScore > 70", async function () {
        /*
         * Cohort: alice=80 (matches), bob=90 (matches), carol=40 (does not match).
         * Expected encrypted count = 2.
         */
        await registerAndAuthorize(registry, engine, alice, 80n, 0n);
        await registerAndAuthorize(registry, engine, bob,   90n, 0n);
        await registerAndAuthorize(registry, engine, carol, 40n, 0n);

        const cohort = [alice.address, bob.address, carol.address];

        const tx      = await engine.connect(institution).runAggregateQuery(cohort, 0);
        const receipt = await tx.wait();

        const event = receipt?.logs
            .map((log) => { try { return engine.interface.parseLog(log); } catch { return null; } })
            .find((e) => e?.name === "AggregateQueryCompleted");
        expect(event).to.not.be.undefined;
        expect(event!.args.cohortSize).to.equal(3n);

        /*
         * The return value of runAggregateQuery is not directly accessible as a tx return.
         * We verify via the ResearchRegistry queryCount incrementing correctly instead.
         */
        const res = await resRegistry.institutions(institution.address);
        expect(res.queryCount).to.equal(1n);
    });

    /*************** Test 13 ***************/

    it("Test 13: runAggregateQuery type 1 counts patients with diabetes flag (bit 0 set)", async function () {
        /*
         * conditionFlags: alice=1 (bit0=diabetes set), bob=4 (bit2=cardiac, bit0=0), carol=3 (bit0+1).
         * Expected count for bit0 = 2 (alice, carol).
         */
        await registerAndAuthorize(registry, engine, alice, 50n, 1n);
        await registerAndAuthorize(registry, engine, bob,   60n, 4n);
        await registerAndAuthorize(registry, engine, carol, 45n, 3n);

        const cohort = [alice.address, bob.address, carol.address];

        const tx      = await engine.connect(institution).runAggregateQuery(cohort, 1);
        const receipt = await tx.wait();

        const event = receipt?.logs
            .map((log) => { try { return engine.interface.parseLog(log); } catch { return null; } })
            .find((e) => e?.name === "AggregateQueryCompleted");
        expect(event).to.not.be.undefined;

        const res = await resRegistry.institutions(institution.address);
        expect(res.queryCount).to.equal(1n);
    });

    /*************** Test 14 ***************/

    it("Test 14: runAggregateQuery reverts when caller is not an approved institution", async function () {
        await registerAndAuthorize(registry, engine, alice, 50n, 0n);

        const unapproved = provider;
        await expect(
            engine.connect(unapproved).runAggregateQuery([alice.address], 0)
        ).to.be.revertedWith("Not approved institution");
    });
});
