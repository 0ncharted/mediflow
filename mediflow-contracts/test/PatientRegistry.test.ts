/**
 * @file PatientRegistry.test.ts
 * @description Tests 1-8: Patient registration, provider authorization, ACL correctness.
 *              All encrypted values are MOCK DATA; mock mode does not enforce decrypt ACL.
 */

import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/* Re-exported typechain type alias for readability. */
import type { PatientRegistry } from "../typechain-types";

/*************** Helpers ***************/

/**
 * Encrypt a single uint64 value bound to a specific contract and user address.
 * Returns the ZK-proved handle and inputProof as required by FHE.fromExternal.
 */
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

/**
 * Register a patient record with four encrypted health attributes.
 * Encrypts all four values separately (each encrypt() call binds handle to user+contract).
 */
async function registerPatient(
    registry:       PatientRegistry,
    patient:        HardhatEthersSigner,
    riskScore:      bigint,
    conditionFlags: bigint,
    age:            bigint,
    medCount:       bigint
): Promise<void> {
    const addr = await registry.getAddress();
    const [rs, cf, ag, mc] = await Promise.all([
        encryptU64(riskScore,      addr, patient),
        encryptU64(conditionFlags, addr, patient),
        encryptU64(age,            addr, patient),
        encryptU64(medCount,       addr, patient),
    ]);
    const tx = await registry.connect(patient).registerPatient(
        rs.handle, rs.proof,
        cf.handle, cf.proof,
        ag.handle, ag.proof,
        mc.handle, mc.proof
    );
    await tx.wait();
}

/*************** Test Suite ***************/

describe("PatientRegistry", function () {

    let registry: PatientRegistry;
    let owner:    HardhatEthersSigner;
    let alice:    HardhatEthersSigner;
    let bob:      HardhatEthersSigner;
    let hospital: HardhatEthersSigner;
    let registryAddr: string;

    beforeEach(async function () {
        [owner, alice, bob, hospital] = await ethers.getSigners();
        const Factory = await ethers.getContractFactory("PatientRegistry");
        registry     = await Factory.deploy() as unknown as PatientRegistry;
        await registry.waitForDeployment();
        registryAddr = await registry.getAddress();
    });

    /*************** Test 1 ***************/

    it("Test 1: registerPatient stores encrypted riskScore and patient can decrypt it", async function () {
        await registerPatient(registry, alice, 42n, 1n, 30n, 3n);

        const record    = await registry.getPatientRecord(alice.address);
        const decrypted = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            record.riskScore,
            registryAddr,
            alice
        );
        expect(decrypted).to.equal(42n);
    });

    /*************** Test 2 ***************/

    it("Test 2: registerPatient stores conditionFlags, age, and medCount correctly", async function () {
        await registerPatient(registry, alice, 50n, 3n, 45n, 7n);

        const record = await registry.getPatientRecord(alice.address);
        const [flags, age, meds] = await Promise.all([
            fhevm.userDecryptEuint(FhevmType.euint64, record.conditionFlags, registryAddr, alice),
            fhevm.userDecryptEuint(FhevmType.euint64, record.age,            registryAddr, alice),
            fhevm.userDecryptEuint(FhevmType.euint64, record.medCount,       registryAddr, alice),
        ]);
        expect(flags).to.equal(3n);
        expect(age).to.equal(45n);
        expect(meds).to.equal(7n);
    });

    /*************** Test 3 ***************/

    it("Test 3: authorizeProvider sets providerAuthorized mapping to true", async function () {
        await registerPatient(registry, alice, 55n, 0n, 40n, 2n);

        const txAuth = await registry.connect(alice).authorizeProvider(hospital.address);
        await txAuth.wait();

        const authorized = await registry.providerAuthorized(alice.address, hospital.address);
        expect(authorized).to.be.true;
    });

    /*************** Test 4 ***************/

    it("Test 4: authorizeProvider grants persistent read-ACL on riskScore to the provider", async function () {
        await registerPatient(registry, alice, 60n, 0n, 35n, 1n);

        const txAuth = await registry.connect(alice).authorizeProvider(hospital.address);
        await txAuth.wait();

        const [contractHasACL, providerHasACL] = await registry.checkRiskScoreACL(
            alice.address,
            hospital.address
        );
        expect(contractHasACL).to.be.true;
        expect(providerHasACL).to.be.true;
    });

    /*************** Test 5 ***************/

    it("Test 5: updateRiskScore replaces the stored riskScore with a new encrypted value", async function () {
        await registerPatient(registry, alice, 30n, 0n, 28n, 0n);

        const addr  = await registry.getAddress();
        const fresh = await encryptU64(88n, addr, alice);
        const txUpd = await registry.connect(alice).updateRiskScore(fresh.handle, fresh.proof);
        await txUpd.wait();

        const record    = await registry.getPatientRecord(alice.address);
        const decrypted = await fhevm.userDecryptEuint(
            FhevmType.euint64,
            record.riskScore,
            registryAddr,
            alice
        );
        expect(decrypted).to.equal(88n);
    });

    /*************** Test 6 ***************/

    it("Test 6: updateRiskScore reverts if the patient has not registered", async function () {
        const addr  = await registry.getAddress();
        const fresh = await encryptU64(50n, addr, bob);
        await expect(
            registry.connect(bob).updateRiskScore(fresh.handle, fresh.proof)
        ).to.be.revertedWith("Not enrolled");
    });

    /*************** Test 7 ***************/

    it("Test 7: authorizeProvider reverts if the patient has not registered", async function () {
        await expect(
            registry.connect(bob).authorizeProvider(hospital.address)
        ).to.be.revertedWith("Not enrolled");
    });

    /*************** Test 8 ***************/

    it("Test 8: ACL correctness - contract and patient both have ACL on encrypted fields", async function () {
        await registerPatient(registry, alice, 70n, 2n, 50n, 5n);

        /*
         * FHE.isAllowed is a view-safe predicate (not an FHE operation) so this call
         * does not touch the coprocessor - it only reads ACL contract storage.
         */
        const [contractHasACL, patientHasACL] = await registry.checkRiskScoreACL(
            alice.address,
            alice.address
        );
        expect(contractHasACL).to.be.true;
        expect(patientHasACL).to.be.true;

        /* isEnrolled sanity-check alongside ACL test. */
        expect(await registry.isEnrolled(alice.address)).to.be.true;
        expect(await registry.isEnrolled(bob.address)).to.be.false;
    });
});
