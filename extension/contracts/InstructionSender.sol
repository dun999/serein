// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ITeeExtensionRegistry} from "./interfaces/ITeeExtensionRegistry.sol";

interface ICovenantVaultOwner {
    function owner() external view returns (address);
    function tee() external view returns (address);
}

/// @title CovenantInstructionSender
/// @notice Authenticated on-chain entry point for Covenant's FCC policy engine.
///
/// @dev Every request is submitted by the vault owner and delivered through
/// TeeExtensionRegistry. The extension re-reads the vault, decrypts its policy,
/// evaluates it against FTSOv2, and returns a one-use authorization.
contract CovenantInstructionSender {
    bytes32 public constant OP_TYPE_COVENANT = bytes32("COVENANT");
    bytes32 public constant OP_COMMAND_AUTHORIZE_SPEND = bytes32("AUTHORIZE_SPEND");
    bytes32 public constant OP_COMMAND_AUTHORIZE_WITHDRAW = bytes32("AUTHORIZE_WITHDRAW");
    bytes32 public constant OP_COMMAND_AUTHORIZE_REDEEM = bytes32("AUTHORIZE_REDEEM");
    bytes32 public constant OP_COMMAND_AUTHORIZE_ADMIN = bytes32("AUTHORIZE_ADMIN");

    ITeeExtensionRegistry public immutable TEE_EXTENSION_REGISTRY;

    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    uint256 private _extensionId;

    event AuthorizationRequested(
        bytes32 indexed instructionId,
        address indexed vault,
        address indexed requester,
        bytes32 command,
        address to,
        uint256 amount
    );

    error ExtensionIdAlreadySet();
    error ExtensionIdNotFound();
    error ExtensionIdNotSet();
    error NotVaultOwner(address expected, address actual);
    error ZeroAddress();
    error ZeroAmount();
    error InvalidAdminAction(uint8 action);
    error ZeroPayloadHash();

    constructor(ITeeExtensionRegistry teeExtensionRegistry) {
        if (address(teeExtensionRegistry) == address(0) || address(teeExtensionRegistry).code.length == 0) {
            revert ZeroAddress();
        }
        TEE_EXTENSION_REGISTRY = teeExtensionRegistry;
    }

    /// @notice Finds and caches the public extension registered for this sender.
    function setExtensionId() external {
        if (_extensionId != 0) revert ExtensionIdAlreadySet();
        uint256 next = TEE_EXTENSION_REGISTRY.nextPublicExtensionId();
        for (uint256 id = FIRST_PUBLIC_EXTENSION_ID; id < next; ++id) {
            if (TEE_EXTENSION_REGISTRY.getTeeExtensionInstructionsSender(id) == address(this)) {
                _extensionId = id;
                return;
            }
        }
        revert ExtensionIdNotFound();
    }

    function extensionId() external view returns (uint256) {
        return _getExtensionId();
    }

    function requestSpend(address vault, address to, uint256 amount, bytes calldata stepUpProof)
        external
        payable
        returns (bytes32 instructionId)
    {
        if (to == address(0)) revert ZeroAddress();
        instructionId = _send(vault, OP_COMMAND_AUTHORIZE_SPEND, to, amount, stepUpProof);
    }

    function requestWithdraw(address vault, uint256 amount, bytes calldata stepUpProof)
        external
        payable
        returns (bytes32 instructionId)
    {
        instructionId = _send(vault, OP_COMMAND_AUTHORIZE_WITHDRAW, msg.sender, amount, stepUpProof);
    }

    function requestRedeem(address vault, uint256 amount, bytes calldata stepUpProof)
        external
        payable
        returns (bytes32 instructionId)
    {
        instructionId = _send(vault, OP_COMMAND_AUTHORIZE_REDEEM, address(0), amount, stepUpProof);
    }

    /// @notice Requests an FCC signature for a passkey-protected vault
    /// administration action. Actions mirror CovenantVault.AdminAction.
    function requestAdmin(address vault, uint8 action, bytes32 payloadHash, bytes calldata stepUpProof)
        external
        payable
        returns (bytes32 instructionId)
    {
        if (vault == address(0)) revert ZeroAddress();
        if (action > 4) revert InvalidAdminAction(action);
        if (payloadHash == bytes32(0)) revert ZeroPayloadHash();
        address expectedOwner = ICovenantVaultOwner(vault).owner();
        if (msg.sender != expectedOwner) revert NotVaultOwner(expectedOwner, msg.sender);

        address[] memory teeIds = new address[](1);
        teeIds[0] = ICovenantVaultOwner(vault).tee();
        address[] memory cosigners = new address[](0);
        bytes memory message = abi.encode(vault, action, payloadHash, stepUpProof);
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: OP_TYPE_COVENANT,
            opCommand: OP_COMMAND_AUTHORIZE_ADMIN,
            message: message,
            cosigners: cosigners,
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });

        instructionId = TEE_EXTENSION_REGISTRY.sendInstructions{value: msg.value}(teeIds, params);
        emit AuthorizationRequested(
            instructionId, vault, msg.sender, OP_COMMAND_AUTHORIZE_ADMIN, address(0), uint256(action)
        );
    }

    function _send(address vault, bytes32 command, address to, uint256 amount, bytes calldata stepUpProof)
        internal
        returns (bytes32 instructionId)
    {
        if (vault == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        address expectedOwner = ICovenantVaultOwner(vault).owner();
        if (msg.sender != expectedOwner) revert NotVaultOwner(expectedOwner, msg.sender);

        // A Covenant authorization is intentionally pinned to the machine the
        // vault will verify. Random extension routing could choose another
        // valid machine whose otherwise-correct signature the vault must reject.
        address[] memory teeIds = new address[](1);
        teeIds[0] = ICovenantVaultOwner(vault).tee();
        address[] memory cosigners = new address[](0);
        bytes memory message = abi.encode(vault, to, amount, stepUpProof);
        ITeeExtensionRegistry.TeeInstructionParams memory params = ITeeExtensionRegistry.TeeInstructionParams({
            opType: OP_TYPE_COVENANT,
            opCommand: command,
            message: message,
            cosigners: cosigners,
            cosignersThreshold: 0,
            claimBackAddress: msg.sender
        });

        instructionId = TEE_EXTENSION_REGISTRY.sendInstructions{value: msg.value}(teeIds, params);
        emit AuthorizationRequested(instructionId, vault, msg.sender, command, to, amount);
    }

    function _getExtensionId() internal view returns (uint256) {
        if (_extensionId == 0) revert ExtensionIdNotSet();
        return _extensionId;
    }
}
