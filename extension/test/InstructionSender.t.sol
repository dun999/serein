// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {CovenantInstructionSender} from "../contracts/InstructionSender.sol";
import {ITeeExtensionRegistry} from "../contracts/interfaces/ITeeExtensionRegistry.sol";

contract MockExtensionRegistry is ITeeExtensionRegistry {
    address public registeredSender;
    address public lastTee;
    TeeInstructionParams private _lastParams;

    function setSender(address sender) external {
        registeredSender = sender;
    }

    function sendInstructions(address[] calldata teeIds, TeeInstructionParams calldata params)
        external
        payable
        returns (bytes32)
    {
        require(msg.sender == registeredSender, "wrong sender");
        require(teeIds.length == 1, "wrong TEE count");
        lastTee = teeIds[0];
        _lastParams = params;
        return keccak256(abi.encode(teeIds, params.message));
    }

    function nextPublicExtensionId() external pure returns (uint256) {
        return 0x10001;
    }

    function getTeeExtensionInstructionsSender(uint256 extensionId) external view returns (address) {
        return extensionId == 0x10000 ? registeredSender : address(0);
    }

    function lastMessage() external view returns (bytes memory) {
        return _lastParams.message;
    }
}

contract MockVaultIdentity {
    address public immutable owner;
    address public immutable tee;

    constructor(address owner_, address tee_) {
        owner = owner_;
        tee = tee_;
    }
}

contract SenderCaller {
    function request(CovenantInstructionSender sender, address vault) external returns (bytes32) {
        return sender.requestWithdraw(vault, 1, "");
    }
}

contract CovenantInstructionSenderTest {
    function test_RoutesToTheExactVaultTeeAndEncodesIntent() public {
        MockExtensionRegistry registry = new MockExtensionRegistry();
        CovenantInstructionSender sender = new CovenantInstructionSender(registry);
        registry.setSender(address(sender));
        sender.setExtensionId();

        address machine = address(0x7EE);
        MockVaultIdentity vault = new MockVaultIdentity(address(this), machine);
        address recipient = address(0xB0B);
        bytes memory proof = hex"010203";
        bytes32 instructionId = sender.requestSpend(address(vault), recipient, 25e6, proof);

        require(instructionId != bytes32(0), "missing instruction id");
        require(registry.lastTee() == machine, "request was routed to another TEE");
        (address decodedVault, address decodedTo, uint256 amount, bytes memory decodedProof) =
            abi.decode(registry.lastMessage(), (address, address, uint256, bytes));
        require(decodedVault == address(vault), "vault mismatch");
        require(decodedTo == recipient, "recipient mismatch");
        require(amount == 25e6, "amount mismatch");
        require(keccak256(decodedProof) == keccak256(proof), "proof mismatch");
    }

    function test_RejectsCallerWhoDoesNotOwnTheVault() public {
        MockExtensionRegistry registry = new MockExtensionRegistry();
        CovenantInstructionSender sender = new CovenantInstructionSender(registry);
        registry.setSender(address(sender));
        sender.setExtensionId();
        MockVaultIdentity vault = new MockVaultIdentity(address(this), address(0x7EE));

        SenderCaller caller = new SenderCaller();
        try caller.request(sender, address(vault)) returns (bytes32) {
            revert("non-owner request succeeded");
        } catch {}
    }

    function test_AdminRequestIsPinnedToVaultTeeAndExactPayload() public {
        MockExtensionRegistry registry = new MockExtensionRegistry();
        CovenantInstructionSender sender = new CovenantInstructionSender(registry);
        registry.setSender(address(sender));
        sender.setExtensionId();

        address machine = address(0x7EE);
        MockVaultIdentity vault = new MockVaultIdentity(address(this), machine);
        bytes32 payloadHash = keccak256("replacement-policy");
        bytes memory proof = hex"aabbcc";
        bytes32 instructionId = sender.requestAdmin(address(vault), 0, payloadHash, proof);

        require(instructionId != bytes32(0), "missing instruction id");
        require(registry.lastTee() == machine, "request was routed to another TEE");
        (address decodedVault, uint8 action, bytes32 decodedPayloadHash, bytes memory decodedProof) =
            abi.decode(registry.lastMessage(), (address, uint8, bytes32, bytes));
        require(decodedVault == address(vault), "vault mismatch");
        require(action == 0, "action mismatch");
        require(decodedPayloadHash == payloadHash, "payload mismatch");
        require(keccak256(decodedProof) == keccak256(proof), "proof mismatch");
    }
}
