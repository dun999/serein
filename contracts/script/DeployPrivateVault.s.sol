// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script} from "forge-std/Script.sol";

import {CovenantVaultFactory} from "../src/CovenantVaultFactory.sol";
import {IAssetManager} from "../src/interfaces/IAssetManager.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IFtsoV2} from "../src/interfaces/IFtsoV2.sol";
import {ITeeMachineRegistry} from "../src/interfaces/ITeeMachineRegistry.sol";

/// @notice Deploys the vault factory against Flare's current Coston2 services.
/// @dev Every protocol address is required through the environment so a stale
/// example address can never silently become a production dependency.
contract DeployPrivateVault is Script {
    function run() external returns (CovenantVaultFactory factory) {
        IERC20 fxrp = IERC20(vm.envAddress("FXRP_ADDRESS"));
        IFtsoV2 ftso = IFtsoV2(vm.envAddress("FTSO_V2_ADDRESS"));
        ITeeMachineRegistry teeRegistry = ITeeMachineRegistry(vm.envAddress("TEE_MACHINE_REGISTRY_ADDRESS"));
        IAssetManager assetManager = IAssetManager(vm.envAddress("ASSET_MANAGER_FXRP_ADDRESS"));
        uint256 extensionId = vm.envUint("FCC_EXTENSION_ID");

        vm.startBroadcast(vm.envUint("COSTON2_PRIVATE_KEY"));
        factory = new CovenantVaultFactory(fxrp, ftso, teeRegistry, assetManager, extensionId);
        vm.stopBroadcast();
    }
}
