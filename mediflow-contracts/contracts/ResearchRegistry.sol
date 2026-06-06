/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.28;

/**
 * @file ResearchRegistry.sol
 * @description Manages approved research institutions and patient cohorts for aggregate FHE queries.
 *              No FHE operations in this contract - it is a pure access-control registry.
 *              All patient data used in development and demos is MOCK DATA.
 */

/**
 * @title ResearchRegistry
 * @notice Registry of approved research institutions and the patient cohorts they may query.
 * @dev This contract holds no encrypted state - it only stores plaintext metadata about
 *      institutions and cohort membership. FHE operations are performed by HealthQueryEngine
 *      which calls isApproved and incrementQueryCount on this contract.
 */
contract ResearchRegistry {

    /*************** Storage Layout ***************/

    /** @notice Owner of this registry (typically the protocol administrator). */
    address public immutable owner;

    /** @notice Address of the HealthQueryEngine allowed to call incrementQueryCount. */
    address public queryEngine;

    /**
     * @notice Metadata for a research institution.
     * @dev queryCount is a plaintext counter incremented after every successful aggregate query.
     */
    struct ResearchInstitution {
        string  name;
        string  purpose;
        bool    approved;
        uint256 queryCount;
    }

    /** @notice Mapping from institution address to its metadata. */
    mapping(address => ResearchInstitution) public institutions;

    /**
     * @notice Cohort ID -> array of consenting patient wallet addresses.
     * @dev Cohort IDs are arbitrary bytes32 keys assigned by the registry owner.
     *      Only patients who called PatientRegistry.authorizeProvider(address(healthQueryEngine))
     *      should be added to cohorts - this is enforced off-chain in the demo.
     */
    mapping(bytes32 => address[]) private _cohortPatients;

    /** @notice Institution address -> list of cohort IDs they are approved to query. */
    mapping(address => bytes32[]) public approvedCohorts;

    /*************** Events ***************/

    /** @notice Emitted when a new institution is approved. */
    event InstitutionApproved(address indexed institution, string name);

    /** @notice Emitted when a new cohort is registered. */
    event CohortRegistered(bytes32 indexed cohortId, uint256 patientCount);

    /** @notice Emitted when an institution completes an aggregate query. */
    event QueryCountIncremented(address indexed institution, uint256 newCount);

    /*************** Modifiers ***************/

    /** @notice Restricts a function to the registry owner. */
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    /** @notice Restricts a function to the registered HealthQueryEngine. */
    modifier onlyQueryEngine() {
        require(msg.sender == queryEngine, "Not query engine");
        _;
    }

    /*************** Constructor ***************/

    /**
     * @notice Deploy and set the owner.
     */
    constructor() {
        owner = msg.sender;
    }

    /*************** Admin Functions ***************/

    /**
     * @notice Approve a research institution and record its metadata.
     * @dev An already-approved institution can be re-approved to update its metadata.
     * @param institution Address of the institution.
     * @param name        Human-readable name of the institution.
     * @param purpose     Brief description of the research purpose.
     */
    function approveInstitution(
        address institution,
        string calldata name,
        string calldata purpose
    ) external onlyOwner {
        require(institution != address(0), "Zero address");

        institutions[institution] = ResearchInstitution({
            name:       name,
            purpose:    purpose,
            approved:   true,
            queryCount: institutions[institution].queryCount
        });

        emit InstitutionApproved(institution, name);
    }

    /**
     * @notice Set the HealthQueryEngine address authorized to call incrementQueryCount.
     * @param _queryEngine Address of the deployed HealthQueryEngine.
     */
    function setQueryEngine(address _queryEngine) external onlyOwner {
        require(_queryEngine != address(0), "Zero address");
        queryEngine = _queryEngine;
    }

    /**
     * @notice Register a cohort of consenting patients and approve an institution for it.
     * @dev The caller is responsible for ensuring all patients in the cohort have called
     *      PatientRegistry.authorizeProvider(address(healthQueryEngine)) before queries run.
     * @param institution Address of the institution to approve for this cohort.
     * @param cohortId    Unique identifier for this cohort.
     * @param patients    Array of patient wallet addresses who consented to aggregate queries.
     */
    function registerCohort(
        address institution,
        bytes32 cohortId,
        address[] calldata patients
    ) external onlyOwner {
        require(institutions[institution].approved, "Institution not approved");

        _cohortPatients[cohortId] = patients;
        approvedCohorts[institution].push(cohortId);

        emit CohortRegistered(cohortId, patients.length);
    }

    /*************** Engine-Gated Functions ***************/

    /**
     * @notice Increment the query counter for an institution after a successful aggregate query.
     * @dev Only callable by the registered HealthQueryEngine contract.
     * @param institution Address of the institution that ran the query.
     */
    function incrementQueryCount(address institution) external onlyQueryEngine {
        institutions[institution].queryCount += 1;
        emit QueryCountIncremented(institution, institutions[institution].queryCount);
    }

    /*************** View Functions ***************/

    /**
     * @notice Check whether a given address is an approved research institution.
     * @param institution Address to check.
     * @return True if the institution is approved.
     */
    function isApproved(address institution) external view returns (bool) {
        return institutions[institution].approved;
    }

    /**
     * @notice Return the patient addresses belonging to a given cohort.
     * @param cohortId The cohort identifier.
     * @return Array of patient addresses in the cohort.
     */
    function getCohortPatients(bytes32 cohortId) external view returns (address[] memory) {
        return _cohortPatients[cohortId];
    }

    /**
     * @notice Return the total number of approved cohorts for an institution.
     * @param institution Address of the institution.
     * @return Number of cohorts approved for that institution.
     */
    function getCohortCount(address institution) external view returns (uint256) {
        return approvedCohorts[institution].length;
    }
}
