/* SPDX-License-Identifier: MIT */
pragma solidity ^0.8.28;

/**
 * @file MockPaymentVault.sol
 * @description Simple FHE-compatible payment vault for demo purposes.
 *              Receives encrypted payment amounts from InsuranceModule and tracks
 *              a plaintext reserve for balance verification in tests.
 *              All data used in development and demos is MOCK DATA.
 */

import { FHE, euint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title MockPaymentVault
 * @notice Holds a demo reserve and stores encrypted per-patient payment amounts.
 * @dev releasePremium accepts an encrypted euint64 amount so the payment value is never
 *      revealed on-chain. The plaintext reserve balance decrements by RESERVE_UNIT on each
 *      call to allow test assertions against getBalance(). In production this would connect
 *      to a confidential ERC20 (ERC-7984) transfer.
 */
contract MockPaymentVault is ZamaEthereumConfig {

    /*************** Constants ***************/

    /** @notice Placeholder unit deducted from the plaintext reserve per claim for demo accounting. */
    uint256 public constant RESERVE_UNIT = 1;

    /*************** Storage Layout ***************/

    /** @notice Address of the InsuranceModule contract - the only caller allowed to release funds. */
    address public immutable insuranceModule;

    /** @notice Plaintext reserve balance tracking demo ETH deposits. */
    uint256 private _reserve;

    /** @notice Encrypted payment amount per patient address (most recent claim). */
    mapping(address => euint64) private _pendingPayments;

    /*************** Events ***************/

    /** @notice Emitted when funds are deposited into the reserve. */
    event FundsDeposited(address indexed depositor, uint256 amount);

    /**
     * @notice Emitted when a premium is released for a patient.
     * @dev No amount emitted to preserve confidentiality of the claim.
     */
    event PremiumReleased(address indexed patient);

    /*************** Modifiers ***************/

    /** @notice Restricts a function to the InsuranceModule. */
    modifier onlyInsuranceModule() {
        require(msg.sender == insuranceModule, "Not insurance module");
        _;
    }

    /*************** Constructor ***************/

    /**
     * @notice Deploy the vault and bind it to a specific InsuranceModule address.
     * @param _insuranceModule Address of the deployed InsuranceModule contract.
     */
    constructor(address _insuranceModule) {
        require(_insuranceModule != address(0), "Zero address");
        insuranceModule = _insuranceModule;
    }

    /*************** External Functions ***************/

    /**
     * @notice Receive and store an encrypted payment amount for a patient.
     * @dev Called exclusively by InsuranceModule. The encrypted amount is the result of
     *      FHE.select in processClaimPayment: coverage if eligible, zero otherwise.
     *      FHE.allowThis persists the handle for future contract reads.
     *      FHE.allow(encAmount, to) lets the patient decrypt their own payment amount.
     * @param to        Patient address to credit.
     * @param encAmount Encrypted payment amount (euint64, from InsuranceModule FHE.select).
     */
    function releasePremium(address to, euint64 encAmount) external onlyInsuranceModule {
        _pendingPayments[to] = encAmount;

        /* allowThis required - the handle may have been passed across a contract boundary. */
        FHE.allowThis(encAmount);

        /* Patient can decrypt their own payment amount for verification. */
        FHE.allow(encAmount, to);

        /* Decrement plaintext reserve by a fixed unit for demo balance assertions. */
        if (_reserve >= RESERVE_UNIT) {
            _reserve -= RESERVE_UNIT;
        }

        emit PremiumReleased(to);
    }

    /**
     * @notice Deposit ETH into the demo reserve.
     * @dev Any address can seed the vault with test funds. In production this would
     *      be an ERC20 deposit function.
     */
    function depositFunds() external payable {
        _reserve += msg.value;
        emit FundsDeposited(msg.sender, msg.value);
    }

    /*************** View Functions ***************/

    /**
     * @notice Return the current plaintext reserve balance.
     * @dev Decreases by RESERVE_UNIT each time releasePremium is called.
     * @return The current reserve in wei.
     */
    function getBalance() external view returns (uint256) {
        return _reserve;
    }

    /**
     * @notice Return the stored encrypted payment handle for a patient.
     * @dev Caller must have ACL on the handle to decrypt it (granted in releasePremium).
     * @param patient Address of the patient.
     * @return The encrypted euint64 payment handle.
     */
    function getPendingPayment(address patient) external view returns (euint64) {
        return _pendingPayments[patient];
    }
}
