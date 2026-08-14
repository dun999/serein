// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";

import {CovenantVaultFactory} from "../src/CovenantVaultFactory.sol";
import {ITeeMachineRegistry} from "../src/interfaces/ITeeMachineRegistry.sol";

/// @notice Deploys the vault factory against Flare's current Coston2 services.
/// @dev The factory pins only the FCC machine registry and extension ID. The
/// FTSOv2, FAssets AssetManager, and FXRP addresses are resolved on-chain from
/// Flare's contract registry when each vault is created, so a Flare-side
/// redeploy of those services does not invalidate the factory.
contract DeployPrivateVault is Script {
    function run() external returns (CovenantVaultFactory factory) {
        ITeeMachineRegistry teeRegistry = ITeeMachineRegistry(vm.envAddress("TEE_MACHINE_REGISTRY_ADDRESS"));
        uint256 extensionId = vm.envUint("FCC_EXTENSION_ID");

        vm.startBroadcast(vm.envUint("COSTON2_PRIVATE_KEY"));
        factory = new CovenantVaultFactory(teeRegistry, extensionId);
        vm.stopBroadcast();
    }
}
