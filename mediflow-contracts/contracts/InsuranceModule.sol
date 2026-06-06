/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.28;

/**
 * @file InsuranceModule.sol
 * @description Manages insurance policies and triggers FHE-gated claim payments.
 *              Uses FHE.select on encrypted eligibility results to determine payment amounts
 *              without ever decrypting the underlying health data.
 *              All patient data used in development and demos is MOCK DATA.
 */

import { FHE, euint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { HealthQueryEngine } from "./HealthQueryEngine.sol";
import { MockPaymentVault } from "./MockPaymentVault.sol";

/**
 * @title InsuranceModule
 * @notice FHE-gated insurance policy and claim payment module.
 * @dev Payment amounts are determined exclusively by FHE.select on an encrypted eligibility
 *      ebool - no plaintext health check is ever performed. Both the eligible and ineligible
 *      branches are computed in the same transaction, preventing timing-based leaks.
 */
contract InsuranceModule is ZamaEthereumConfig {

    /*************** Storage Layout ***************/

    /**
     * @notice Insurance policy for a single patient.
     * @dev coverageAmount is stored as uint256 but capped at uint64 max because FHE.asEuint64
     *      only accepts 64-bit values. riskThreshold is recorded for on-chain auditability
     *      (the actual FHE comparison is performed by HealthQueryEngine).
     */
    struct Policy {
        uint256 monthlyPremium;
        uint256 coverageAmount;
        uint64  riskThreshold;
        bool    active;
    }

    /** @notice Insurer address (owner). Immutable - set at deployment. */
    address public immutable owner;

    /** @notice Bound HealthQueryEngine - reads encrypted eligibility results from it. */
    HealthQueryEngine public immutable queryEngine;

    /** @notice Bound MockPaymentVault - receives encrypted payment amounts. */
    MockPaymentVault public paymentVault;

    /** @notice Patient address -> their policy. */
    mapping(address => Policy) private _policies;

    /**
     * @notice Tracks which eligibilityCheckIds have triggered a claim.
     * @dev Prevents replay: each checkId can only be used to process one claim.
     */
    mapping(bytes32 => bool) private _claimsProcessed;

    /*************** Events ***************/

    /** @notice Emitted when a new policy is created. No health data emitted. */
    event PolicyCreated(address indexed patient, uint256 premium, uint256 coverage);

    /**
     * @notice Emitted when a claim is processed. Payment amount is deliberately omitted.
     * @dev Off-chain observers can derive timing but not the eligibility outcome or amount.
     */
    event ClaimProcessed(address indexed patient, bytes32 indexed checkId, uint256 timestamp);

    /*************** Modifiers ***************/

    /** @notice Restricts a function to the insurer (owner). */
    modifier onlyInsurer() {
        require(msg.sender == owner, "Not insurer");
        _;
    }

    /*************** Constructor ***************/

    /**
     * @notice Deploy and bind to a HealthQueryEngine.
     * @param _queryEngine Address of the deployed HealthQueryEngine.
     */
    constructor(address _queryEngine) {
        require(_queryEngine != address(0), "Zero address");
        owner       = msg.sender;
        queryEngine = HealthQueryEngine(_queryEngine);
    }

    /*************** Admin Functions ***************/

    /**
     * @notice Bind a MockPaymentVault for fund disbursement.
     * @dev Must be called after MockPaymentVault is deployed. The vault's insuranceModule
     *      must match address(this) or releasePremium will revert.
     * @param _vault Address of the deployed MockPaymentVault.
     */
    function setPaymentVault(address _vault) external onlyInsurer {
        require(_vault != address(0), "Zero address");
        paymentVault = MockPaymentVault(_vault);
    }

    /*************** External Functions ***************/

    /**
     * @notice Create or replace an insurance policy for a patient.
     * @dev Only the insurer may create policies. coverageAmount is bounded to uint64 max
     *      because FHE.asEuint64 does not accept values exceeding 2^64 - 1.
     * @param patient        Patient address to issue the policy to.
     * @param premium        Monthly premium in vault tokens (plaintext, informational).
     * @param coverage       Coverage payout amount (max type(uint64).max).
     * @param riskThreshold  Maximum acceptable risk score for eligibility (for audit records).
     */
    function createPolicy(
        address patient,
        uint256 premium,
        uint256 coverage,
        uint64  riskThreshold
    ) external onlyInsurer {
        require(patient   != address(0),        "Zero patient address");
        require(coverage  <= type(uint64).max,  "Coverage exceeds uint64 max");
        require(coverage  > 0,                  "Coverage must be non-zero");

        _policies[patient] = Policy({
            monthlyPremium: premium,
            coverageAmount: coverage,
            riskThreshold:  riskThreshold,
            active:         true
        });

        emit PolicyCreated(patient, premium, coverage);
    }

    /**
     * @notice Process a claim by using an encrypted eligibility result to determine payment.
     * @dev FHE.select determines the payment amount without any plaintext branch:
     *        paymentAmount = eligible ? coverageAmount : 0
     *      Both paths are computed symmetrically. The encrypted result is forwarded to the
     *      vault; no plaintext payment amount appears on-chain.
     *      Replay protection: a checkId can only be used once.
     * @param patient             Patient address whose policy is being claimed.
     * @param eligibilityCheckId  Identifier returned by HealthQueryEngine.runEligibilityCheck.
     */
    function processClaimPayment(
        address patient,
        bytes32 eligibilityCheckId
    ) external {
        require(_policies[patient].active,             "No active policy");
        require(!_claimsProcessed[eligibilityCheckId], "Claim already processed");
        require(address(paymentVault) != address(0),   "Payment vault not set");

        _claimsProcessed[eligibilityCheckId] = true;

        Policy memory policy = _policies[patient];

        ebool eligibilityResult = queryEngine.getEligibilityResult(eligibilityCheckId);

        /*
         * FHE.select: computes payment without any plaintext eligibility branch.
         * Both euint64 branches must have matching types - no implicit upcast.
         * coverage is safe to cast to uint64 because createPolicy enforces the bound.
         */
        euint64 paymentAmount = FHE.select(
            eligibilityResult,
            FHE.asEuint64(uint64(policy.coverageAmount)),
            FHE.asEuint64(0)
        );

        /* allowThis: FHE.select produces a transient-only handle; persist for vault use. */
        FHE.allowThis(paymentAmount);
        FHE.allow(paymentAmount, address(paymentVault));

        paymentVault.releasePremium(patient, paymentAmount);

        emit ClaimProcessed(patient, eligibilityCheckId, block.timestamp);
    }

    /*************** View Functions ***************/

    /**
     * @notice Check whether a given checkId has already triggered a claim.
     * @param checkId The eligibility check identifier.
     * @return True if the claim has been processed.
     */
    function isClaimProcessed(bytes32 checkId) external view returns (bool) {
        return _claimsProcessed[checkId];
    }

    /**
     * @notice Return the policy for a patient.
     * @param patient Address of the patient.
     * @return The patient's Policy struct.
     */
    function getPolicy(address patient) external view returns (Policy memory) {
        return _policies[patient];
    }
}
