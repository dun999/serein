// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {CovenantVault} from "./CovenantVault.sol";
import {IAssetManager} from "./interfaces/IAssetManager.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IFtsoV2} from "./interfaces/IFtsoV2.sol";
import {ITeeMachineRegistry} from "./interfaces/ITeeMachineRegistry.sol";

/// @title CovenantVaultFactory
/// @notice Deploys discoverable, isolated Covenant vault accounts.
contract CovenantVaultFactory {
    uint256 private constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    IERC20 public immutable fxrp;
    IFtsoV2 public immutable ftso;
    ITeeMachineRegistry public immutable teeRegistry;
    IAssetManager public immutable assetManager;
    uint256 public immutable extensionId;

    mapping(address owner => address[] vaults) private _vaultsOf;
    mapping(address owner => uint256 nonce) public deploymentNonce;
    mapping(address vault => bool known) public isVault;

    event VaultCreated(
        address indexed owner,
        address indexed vault,
        address indexed tee,
        address guardian,
        string xrplPayout,
        uint32 timelockSeconds
    );

    error InvalidDependency(address dependency);
    error InvalidExtensionId(uint256 supplied);

    constructor(
        IERC20 _fxrp,
        IFtsoV2 _ftso,
        ITeeMachineRegistry _teeRegistry,
        IAssetManager _assetManager,
        uint256 _extensionId
    ) {
        if (address(_fxrp).code.length == 0) revert InvalidDependency(address(_fxrp));
        if (address(_ftso).code.length == 0) revert InvalidDependency(address(_ftso));
        if (address(_teeRegistry).code.length == 0) revert InvalidDependency(address(_teeRegistry));
        if (address(_assetManager).code.length == 0) revert InvalidDependency(address(_assetManager));
        if (_extensionId < FIRST_PUBLIC_EXTENSION_ID) revert InvalidExtensionId(_extensionId);
        fxrp = _fxrp;
        ftso = _ftso;
        teeRegistry = _teeRegistry;
        assetManager = _assetManager;
        extensionId = _extensionId;
    }

    function createVault(address tee, address guardian, uint32 timelockSeconds, string calldata xrplPayout)
        external
        returns (address vault)
    {
        uint256 ownerNonce = deploymentNonce[msg.sender]++;
        bytes32 salt = keccak256(abi.encode(msg.sender, ownerNonce));
        vault = address(
            new CovenantVault{salt: salt}(
                msg.sender,
                guardian,
                tee,
                timelockSeconds,
                xrplPayout,
                fxrp,
                ftso,
                teeRegistry,
                assetManager,
                extensionId
            )
        );
        _vaultsOf[msg.sender].push(vault);
        isVault[vault] = true;
        emit VaultCreated(msg.sender, vault, tee, guardian, xrplPayout, timelockSeconds);
    }

    function vaultsOf(address owner) external view returns (address[] memory) {
        return _vaultsOf[owner];
    }

    function predictVaultAddress(
        address owner,
        uint256 ownerNonce,
        address tee,
        address guardian,
        uint32 timelockSeconds,
        string calldata xrplPayout
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(owner, ownerNonce));
        bytes memory creation = abi.encodePacked(
            type(CovenantVault).creationCode,
            abi.encode(
                owner,
                guardian,
                tee,
                timelockSeconds,
                xrplPayout,
                fxrp,
                ftso,
                teeRegistry,
                assetManager,
                extensionId
            )
        );
        return
            address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(creation)))))
            );
    }
}
