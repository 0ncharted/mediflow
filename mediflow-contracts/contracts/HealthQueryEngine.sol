/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.28;

/**
 * @file HealthQueryEngine.sol
 * @description Executes FHE queries against encrypted patient health records without
 *              decrypting individual values. Supports per-patient eligibility checks and
 *              aggregate cohort analytics for approved research institutions.
 *              All patient data used in development and demos is MOCK DATA.
 */

import { FHE, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { PatientRegistry } from "./PatientRegistry.sol";
import { ResearchRegistry } from "./ResearchRegistry.sol";

/**
 * @title HealthQueryEngine
 * @notice Runs confidential eligibility checks and aggregate analytics over encrypted health data.
 * @dev For eligibility checks the calling provider must have been authorized by the patient via
 *      PatientRegistry.authorizeProvider. For this contract to run FHE ops on patient handles,
 *      the patient must also call authorizeProvider(address(this)).
 *      For aggregate queries the caller must be a ResearchRegistry-approved institution and
 *      all cohort patients must have authorized this contract.
 */
contract HealthQueryEngine is ZamaEthereumConfig {

    /*************** Storage Layout ***************/

    /** @notice Bound PatientRegistry - set at construction, immutable. */
    PatientRegistry public immutable registry;

    /** @notice Bound ResearchRegistry - set post-deployment by owner. */
    ResearchRegistry public researchRegistry;

    /** @notice InsuranceModule address that receives ACL grants on eligibility results. */
    address public insuranceModule;

    /** @notice Contract owner (deployer). */
    address public immutable owner;

    /** @notice Encrypted eligibility result per checkId. */
    mapping(bytes32 => ebool) private _eligibilityResults;

    /** @notice Guards against reads on uninitialized check slots. */
    mapping(bytes32 => bool) private _checkExists;

    /*************** Events ***************/

    /**
     * @notice Emitted when an eligibility check completes.
     * @dev Intentionally emits NO health data - only identifiers for off-chain correlation.
     */
    event EligibilityChecked(
        address indexed patient,
        address indexed provider,
        bytes32 indexed checkId
    );

    /** @notice Emitted when an approved institution completes an aggregate query. */
    event AggregateQueryCompleted(
        address indexed institution,
        uint8   queryType,
        uint256 cohortSize
    );

    /*************** Modifiers ***************/

    /** @notice Restricts a function to the contract owner. */
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /*************** Constructor ***************/

    /**
     * @notice Deploy the engine and bind it to a PatientRegistry.
     * @param _registry Address of the deployed PatientRegistry contract.
     */
    constructor(address _registry) {
        require(_registry != address(0), "Zero address");
        owner    = msg.sender;
        registry = PatientRegistry(_registry);
    }

    /*************** Admin Functions ***************/

    /**
     * @notice Bind a ResearchRegistry used to gate aggregate queries.
     * @param _researchRegistry Address of the deployed ResearchRegistry.
     */
    function setResearchRegistry(address _researchRegistry) external onlyOwner {
        require(_researchRegistry != address(0), "Zero address");
        researchRegistry = ResearchRegistry(_researchRegistry);
    }

    /**
     * @notice Set the InsuranceModule address that will receive FHE.allow on every
     *         eligibility result so it can call FHE.select in processClaimPayment.
     * @dev Must be called after InsuranceModule is deployed; can be updated if re-deployed.
     * @param _insuranceModule Address of the deployed InsuranceModule contract.
     */
    function setInsuranceModule(address _insuranceModule) external onlyOwner {
        require(_insuranceModule != address(0), "Zero address");
        insuranceModule = _insuranceModule;
    }

    /*************** External Functions ***************/

    /**
     * @notice Run a confidential eligibility check comparing a patient's riskScore to a threshold.
     * @dev FHE.le(riskScore, threshold) returns an encrypted true/false without revealing the score.
     *      The patient must have called PatientRegistry.authorizeProvider(address(this)) for this
     *      contract to have ACL on the riskScore handle.
     *      The result is stored keyed by checkId and ACL-granted to both the calling provider and
     *      the InsuranceModule so they can use it in subsequent FHE operations.
     * @param patient          Address of the patient to check.
     * @param maxRiskThreshold Plaintext maximum acceptable risk score (0-100).
     * @return checkId         Unique identifier for this check result, used by InsuranceModule.
     */
    function runEligibilityCheck(
        address patient,
        uint64  maxRiskThreshold
    ) external returns (bytes32 checkId) {
        require(registry.isEnrolled(patient), "Patient not enrolled");

        PatientRegistry.PatientRecord memory record = registry.getPatientRecord(patient);
        require(FHE.isInitialized(record.riskScore), "Risk score not initialized");

        /*
         * FHE.le(a, b): encrypted true if a <= b.
         * Scalar form used (uint64 operand) - cheaper than asEuint64 wrapper.
         * Patient is eligible when their riskScore is within the acceptable ceiling.
         */
        ebool eligible = FHE.le(record.riskScore, maxRiskThreshold);

        checkId = keccak256(abi.encodePacked(patient, msg.sender, block.timestamp, maxRiskThreshold));

        _eligibilityResults[checkId] = eligible;
        _checkExists[checkId]        = true;

        /* allowThis: FHE ops grant only transient ACL; persist for cross-tx reads. */
        FHE.allowThis(eligible);

        /* InsuranceModule needs ACL to call FHE.select on this result. */
        if (insuranceModule != address(0)) {
            FHE.allow(eligible, insuranceModule);
        }

        /* Provider gets ACL for optional local decryption of the result. */
        FHE.allow(eligible, msg.sender);

        emit EligibilityChecked(patient, msg.sender, checkId);
    }

    /**
     * @notice Run an aggregate cohort query using FHE.select to count matching patients.
     * @dev Iterates over a plaintext address array (length is not a secret) and accumulates
     *      an encrypted count without branching on any health value.
     *      Each patient in cohort must have authorized this contract via authorizeProvider.
     *      Only approved research institutions registered in ResearchRegistry may call this.
     *      queryType 0: count patients with riskScore > 70 (high-risk cohort sizing).
     *      queryType 1: count patients with conditionFlags bit 0 set (diabetes prevalence).
     * @param cohort    Array of patient addresses who consented to aggregate research queries.
     * @param queryType Integer distinguishing the query variant (0 or 1).
     * @return Encrypted count of matching patients in the cohort.
     */
    function runAggregateQuery(
        address[] calldata cohort,
        uint8              queryType
    ) external returns (euint64) {
        require(address(researchRegistry) != address(0), "ResearchRegistry not set");
        require(researchRegistry.isApproved(msg.sender),  "Not approved institution");
        require(queryType <= 1,                            "Unknown query type");

        euint64 count = FHE.asEuint64(0);

        /* allowThis on the initial zero so the contract can reference it in the first iteration. */
        FHE.allowThis(count);

        for (uint256 i = 0; i < cohort.length; i++) {
            PatientRegistry.PatientRecord memory record = registry.getPatientRecord(cohort[i]);

            /* Skip unregistered patients rather than operating on uninitialized handles. */
            if (!FHE.isInitialized(record.riskScore)) {
                continue;
            }

            ebool condition;

            if (queryType == 0) {
                /* High-risk flag: riskScore > 70. Scalar form is cheaper than asEuint64. */
                condition = FHE.gt(record.riskScore, uint64(70));
            } else {
                /*
                 * Diabetes flag: isolate bit 0 of conditionFlags via FHE.and scalar,
                 * then compare against zero to obtain the encrypted boolean.
                 */
                euint64 bit0 = FHE.and(record.conditionFlags, uint64(1));
                condition    = FHE.gt(bit0, uint64(0));
            }

            /*
             * FHE.select: add 1 if condition is true, add 0 otherwise.
             * No plaintext branch is taken; both paths are computed symmetrically.
             */
            euint64 inc = FHE.select(condition, FHE.asEuint64(1), FHE.asEuint64(0));
            count       = FHE.add(count, inc);

            /*
             * allowThis after each FHE.add: the add produces a new handle whose default ACL
             * is transient only. Persist it so the next loop iteration can reference it.
             */
            FHE.allowThis(count);
        }

        /* Caller (the institution) gets ACL to decrypt the aggregate result. */
        FHE.allow(count, msg.sender);

        researchRegistry.incrementQueryCount(msg.sender);

        emit AggregateQueryCompleted(msg.sender, queryType, cohort.length);

        return count;
    }

    /*************** View Functions ***************/

    /**
     * @notice Retrieve the stored encrypted eligibility result for a given checkId.
     * @dev The caller must have ACL on the returned handle (granted during runEligibilityCheck).
     *      This function is view-safe because it only reads a stored handle; no FHE ops.
     * @param checkId The check identifier returned by runEligibilityCheck.
     * @return The encrypted ebool eligibility result.
     */
    function getEligibilityResult(bytes32 checkId) external view returns (ebool) {
        require(_checkExists[checkId], "Check not found");
        return _eligibilityResults[checkId];
    }

    /**
     * @notice Check whether a given checkId has a stored result.
     * @param checkId The check identifier to query.
     * @return True if the eligibility result exists.
     */
    function checkExists(bytes32 checkId) external view returns (bool) {
        return _checkExists[checkId];
    }
}
