// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/// @notice Flare Confidential Compute's register of attested TEE machines.
///
/// @dev A machine's id is the address it signs with, so an attestation can be
/// checked against this register by recovering its signer. That is what lets a
/// contract require "signed inside an attested enclave" rather than merely
/// "signed by a key someone told us about".
interface ITeeMachineRegistry {
    /// @return Status of the machine. The current FCC `TeeStatus` enum uses
    /// `2` for Production; registered, paused, and banned machines must not be
    /// trusted to authorize vault actions.
    function getTeeMachineStatus(address _teeId) external view returns (uint8);

    function getTeeMachineOwner(address _teeId) external view returns (address);

    function getExtensionId(address _teeId) external view returns (uint256);
}
