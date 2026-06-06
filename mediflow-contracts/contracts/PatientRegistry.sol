/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.28;

/**
 * @file PatientRegistry.sol
 * @description Stores per-patient encrypted health attributes on-chain with patient-controlled ACL.
 *              All patient data used in development and demos is MOCK DATA.
 */

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PatientRegistry
 * @notice Confidential registry storing encrypted health attributes for each patient.
 * @dev All health values are stored as euint64 FHE handles. No plaintext health data
 *      is ever stored on-chain or emitted in events. fromExternal grants only TRANSIENT
 *      ACL; FHE.allowThis is required after every stored computation to persist access.
 */
contract PatientRegistry is ZamaEthereumConfig {

    /*************** Storage Layout ***************/

    /**
     * @notice The encrypted health record for a single patient.
     * @dev riskScore: 0-100 scale (higher = higher risk).
     *      conditionFlags: bitmask (bit0=diabetes, bit1=hypertension, bit2=cardiac).
     *      age: patient age in years.
     *      medCount: number of current medications.
     */
    struct PatientRecord {
        euint64 riskScore;
        euint64 conditionFlags;
        euint64 age;
        euint64 medCount;
        bool enrolled;
        uint256 lastUpdated;
    }

    /** @notice Mapping from patient address to their encrypted health record. */
    mapping(address => PatientRecord) private _records;

    /**
     * @notice Tracks whether a given patient has authorized a given provider address.
     * @dev A provider could be a human EOA or a contract such as HealthQueryEngine.
     *      Authorization grants read-ACL on all four encrypted fields.
     */
    mapping(address => mapping(address => bool)) public providerAuthorized;

    /*************** Events ***************/

    /** @notice Emitted when a patient successfully registers or re-registers. No health data emitted. */
    event PatientRegistered(address indexed patient, uint256 indexed timestamp);

    /** @notice Emitted when a patient grants a provider read-ACL on their record. */
    event ProviderAuthorized(address indexed patient, address indexed provider);

    /** @notice Emitted when a patient updates their encrypted risk score. */
    event RiskScoreUpdated(address indexed patient, uint256 indexed timestamp);

    /*************** External Functions ***************/

    /**
     * @notice Register or update a patient record with four encrypted health attributes.
     * @dev Each externalEuint64 is verified via ZK proof and converted to a persistent handle.
     *      FHE.fromExternal grants only transient ACL (current tx); FHE.allowThis persists it.
     *      FHE.allow(field, msg.sender) lets the patient decrypt their own values later.
     * @param _riskScore      Encrypted risk score (0-100, higher = higher risk).
     * @param _riskProof      ZK input proof bound to the same encrypt() call as _riskScore.
     * @param _conditionFlags Encrypted bitmask of conditions (bit0=diabetes, etc.).
     * @param _flagsProof     ZK input proof bound to the same encrypt() call as _conditionFlags.
     * @param _age            Encrypted patient age in years.
     * @param _ageProof       ZK input proof bound to the same encrypt() call as _age.
     * @param _medCount       Encrypted count of current medications.
     * @param _medProof       ZK input proof bound to the same encrypt() call as _medCount.
     */
    function registerPatient(
        externalEuint64 _riskScore,
        bytes calldata _riskProof,
        externalEuint64 _conditionFlags,
        bytes calldata _flagsProof,
        externalEuint64 _age,
        bytes calldata _ageProof,
        externalEuint64 _medCount,
        bytes calldata _medProof
    ) external {
        euint64 riskScore      = FHE.fromExternal(_riskScore, _riskProof);
        euint64 conditionFlags = FHE.fromExternal(_conditionFlags, _flagsProof);
        euint64 age            = FHE.fromExternal(_age, _ageProof);
        euint64 medCount       = FHE.fromExternal(_medCount, _medProof);

        PatientRecord storage r = _records[msg.sender];
        r.riskScore      = riskScore;
        r.conditionFlags = conditionFlags;
        r.age            = age;
        r.medCount       = medCount;
        r.enrolled       = true;
        r.lastUpdated    = block.timestamp;

        /*
         * allowThis is mandatory: fromExternal grants only TRANSIENT ACL (expires at tx end).
         * Without this, the next tx that tries to use these handles will revert with
         * SenderNotAllowed(address) when the contract is no longer the caller.
         */
        FHE.allowThis(riskScore);
        FHE.allowThis(conditionFlags);
        FHE.allowThis(age);
        FHE.allowThis(medCount);

        /* Patient retains persistent read ACL to decrypt their own values. */
        FHE.allow(riskScore, msg.sender);
        FHE.allow(conditionFlags, msg.sender);
        FHE.allow(age, msg.sender);
        FHE.allow(medCount, msg.sender);

        emit PatientRegistered(msg.sender, block.timestamp);
    }

    /**
     * @notice Update the encrypted risk score for the calling patient.
     * @dev Only the patient themselves (msg.sender) can update their own record.
     *      Reverts if the patient is not yet enrolled. Old handle is replaced by the new one.
     * @param newScore Encrypted new risk score value.
     * @param proof    ZK input proof bound to newScore.
     */
    function updateRiskScore(externalEuint64 newScore, bytes calldata proof) external {
        require(_records[msg.sender].enrolled, "Not enrolled");

        euint64 riskScore = FHE.fromExternal(newScore, proof);
        _records[msg.sender].riskScore   = riskScore;
        _records[msg.sender].lastUpdated = block.timestamp;

        /* allowThis required - transient ACL from fromExternal does not persist across txs. */
        FHE.allowThis(riskScore);
        FHE.allow(riskScore, msg.sender);

        emit RiskScoreUpdated(msg.sender, block.timestamp);
    }

    /**
     * @notice Grant a healthcare provider or authorized contract persistent read-ACL on all fields.
     * @dev FHE.allow modifies ACL contract state; this function cannot be view.
     *      The provider could be a human EOA (hospital) or a contract (HealthQueryEngine).
     *      Any address that will call FHE operations on the patient's handles MUST be
     *      authorized here before it can use those handles.
     * @param provider Address of the provider or authorized contract to receive read-ACL.
     */
    function authorizeProvider(address provider) external {
        require(_records[msg.sender].enrolled, "Not enrolled");
        require(provider != address(0), "Zero address");

        PatientRecord storage r = _records[msg.sender];

        FHE.allow(r.riskScore, provider);
        FHE.allow(r.conditionFlags, provider);
        FHE.allow(r.age, provider);
        FHE.allow(r.medCount, provider);

        providerAuthorized[msg.sender][provider] = true;

        emit ProviderAuthorized(msg.sender, provider);
    }

    /**
     * @notice Return the full encrypted patient record for a given patient address.
     * @dev Returns raw euint64 handles. This function is view-safe because it only reads
     *      stored handles without invoking any FHE operation or ACL-modifying call.
     *      Callers who intend to perform FHE operations on the returned handles must
     *      already have been granted ACL via authorizeProvider.
     * @param patient Address of the patient to query.
     * @return The PatientRecord struct containing all four encrypted field handles.
     */
    function getPatientRecord(address patient) external view returns (PatientRecord memory) {
        return _records[patient];
    }

    /**
     * @notice Check whether a patient is currently enrolled in the registry.
     * @param patient Address to check.
     * @return True if the patient has registered at least once.
     */
    function isEnrolled(address patient) external view returns (bool) {
        return _records[patient].enrolled;
    }

    /**
     * @notice Check whether the contract itself and a given grantee both have ACL on the
     *         patient's riskScore handle. Used for ACL correctness tests.
     * @dev FHE.isAllowed is a read-only predicate; view-safe per FHEVM v0.11 spec.
     * @param patient Address of the enrolled patient.
     * @param grantee Address to check ACL for (e.g. patient address, provider, or this contract).
     * @return contractHasACL True if address(this) has ACL on riskScore.
     * @return granteeHasACL  True if grantee has ACL on riskScore.
     */
    function checkRiskScoreACL(
        address patient,
        address grantee
    ) external view returns (bool contractHasACL, bool granteeHasACL) {
        euint64 handle = _records[patient].riskScore;
        contractHasACL = FHE.isAllowed(handle, address(this));
        granteeHasACL  = FHE.isAllowed(handle, grantee);
    }
}
