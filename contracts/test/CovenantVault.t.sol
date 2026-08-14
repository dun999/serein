// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";

import {CovenantVault} from "../src/CovenantVault.sol";
import {CovenantVaultFactory} from "../src/CovenantVaultFactory.sol";
import {ITeeMachineRegistry} from "../src/interfaces/ITeeMachineRegistry.sol";

/// @notice Test double for Flare's contract registry, which is at the same
/// address on every Flare network. Foundry cannot deploy to a chosen address,
/// so the mock is etched at that constant and its two mapping slots are copied
/// with vm.store.
contract MockFlareContractRegistry {
    mapping(bytes32 => address) private byHash;

    function set(string memory name, address target) external {
        byHash[keccak256(abi.encode(name))] = target;
    }

    function getContractAddressByHash(bytes32 hash) external view returns (address) {
        return byHash[hash];
    }

    function getContractAddressByName(string calldata name) external view returns (address) {
        return byHash[keccak256(abi.encode(name))];
    }

    function getContractAddressesByName(string[] calldata names)
        external
        view
        returns (address[] memory out)
    {
        out = new address[](names.length);
        for (uint256 i = 0; i < names.length; ++i) out[i] = byHash[keccak256(abi.encode(names[i]))];
    }

    function getContractAddressesByHash(bytes32[] calldata hashes)
        external
        view
        returns (address[] memory out)
    {
        out = new address[](hashes.length);
        for (uint256 i = 0; i < hashes.length; ++i) out[i] = byHash[hashes[i]];
    }

    function getAllContracts() external pure returns (string[] memory, address[] memory) {
        return (new string[](0), new address[](0));
    }
}

contract VaultMockFxrp {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function burnFrom(address from, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }
}

contract VaultMockFtso {
    uint256 public value = 500_000;
    int8 public decimals = 6;
    uint64 public timestamp;

    constructor() {
        timestamp = uint64(block.timestamp);
    }

    function setPrice(uint256 nextValue, uint64 nextTimestamp) external {
        value = nextValue;
        timestamp = nextTimestamp;
    }

    function getFeedById(bytes21) external payable returns (uint256, int8, uint64) {
        return (value, decimals, timestamp);
    }

    function calculateFeeById(bytes21) external pure returns (uint256) {
        return 0;
    }
}

contract VaultMockRegistry is ITeeMachineRegistry {
    mapping(address => uint8) public machineStatus;
    mapping(address => uint256) public machineExtensionId;

    function setStatus(address machine, uint8 status) external {
        machineStatus[machine] = status;
    }

    function setExtensionId(address machine, uint256 extensionId) external {
        machineExtensionId[machine] = extensionId;
    }

    function getTeeMachineStatus(address machine) external view returns (uint8) {
        return machineStatus[machine];
    }

    function getTeeMachineOwner(address) external pure returns (address) {
        return address(0);
    }

    function getExtensionId(address machine) external view returns (uint256) {
        return machineExtensionId[machine];
    }
}

contract VaultMockAssetManager {
    VaultMockFxrp public immutable token;
    string public lastPayout;
    uint256 public lastAmount;
    uint256 public maximumRedeemAmount = type(uint256).max;

    constructor(VaultMockFxrp token_) {
        token = token_;
    }

    function fAsset() external view returns (address) {
        return address(token);
    }

    function setMaximumRedeemAmount(uint256 amount) external {
        maximumRedeemAmount = amount;
    }

    function redeemAmount(uint256 requested, string calldata payout, address payable)
        external
        payable
        returns (uint256 redeemedAmount)
    {
        redeemedAmount = requested < maximumRedeemAmount ? requested : maximumRedeemAmount;
        token.burnFrom(msg.sender, redeemedAmount);
        lastPayout = payout;
        lastAmount = redeemedAmount;
    }

    function minimumRedeemAmountUBA() external pure returns (uint256) {
        return 5e6;
    }
}

contract CovenantVaultTest is Test {
    VaultMockFxrp internal fxrp;
    VaultMockFtso internal ftso;
    VaultMockRegistry internal registry;
    VaultMockAssetManager internal assetManager;
    CovenantVaultFactory internal factory;
    CovenantVault internal vault;

    uint256 internal teeKey = 0xC0FFEE;
    address internal tee;
    address internal owner = address(0xA11CE);
    address internal guardian = address(0x600D);
    address internal merchant = address(0xB0B);
    string internal constant PAYOUT = "rKGAv7Z5LEf7vrdSGteLK46kC1wiqp1Z7N";
    uint32 internal constant TIMELOCK = 1 days;
    uint256 internal constant EXTENSION_ID = 0x1002a;
    address internal constant FLARE_CONTRACT_REGISTRY_ADDRESS =
        0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;

    function setUp() public {
        vm.warp(1_000_000);
        tee = vm.addr(teeKey);
        fxrp = new VaultMockFxrp();
        ftso = new VaultMockFtso();
        registry = new VaultMockRegistry();
        registry.setStatus(tee, 2);
        registry.setExtensionId(tee, EXTENSION_ID);
        assetManager = new VaultMockAssetManager(fxrp);
        _etchFlareContractRegistry();
        factory = new CovenantVaultFactory(registry, EXTENSION_ID);

        vm.prank(owner);
        address deployed = factory.createVault(tee, guardian, TIMELOCK, PAYOUT);
        vault = CovenantVault(deployed);

        vm.prank(owner);
        vault.initializePolicy(keccak256("private-policy"), new bytes(160));
        fxrp.mint(address(vault), 1_000e6);
    }

    /// @notice Places a mock registry at Flare's constant registry address and
    /// seeds the FtsoV2 and AssetManagerFXRP entries. The mapping lives in
    /// slot 0, so entry `hash` sits at keccak256(abi.encode(hash, 0)).
    function _etchFlareContractRegistry() internal {
        MockFlareContractRegistry flareRegistry = new MockFlareContractRegistry();
        vm.etch(FLARE_CONTRACT_REGISTRY_ADDRESS, address(flareRegistry).code);
        vm.store(
            FLARE_CONTRACT_REGISTRY_ADDRESS,
            _registrySlot("FtsoV2"),
            bytes32(uint256(uint160(address(ftso))))
        );
        vm.store(
            FLARE_CONTRACT_REGISTRY_ADDRESS,
            _registrySlot("AssetManagerFXRP"),
            bytes32(uint256(uint160(address(assetManager))))
        );
    }

    function _registrySlot(string memory name) internal pure returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encode(keccak256(abi.encode(name)), uint256(0)))));
    }

    function _authorization(
        CovenantVault.Operation operation,
        address to,
        bytes32 destinationHash,
        uint256 amount,
        uint256 amountUsd,
        uint64 priceTimestamp,
        uint256 forNonce,
        uint64 policyVersion,
        uint64 deadline,
        uint256 key
    ) internal view returns (bytes memory) {
        bytes32 digest = vault.authorizationDigest(
            operation, to, destinationHash, amount, amountUsd, priceTimestamp, forNonce, policyVersion, deadline
        );
        bytes32 signed = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, signed);
        return abi.encodePacked(r, s, v);
    }

    function _spendAuthorization(address to, uint256 amount, uint64 deadline, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        return _authorization(
            CovenantVault.Operation.SPEND,
            to,
            bytes32(0),
            amount,
            amount / 2 * 100,
            ftso.timestamp(),
            vault.nonce(),
            vault.policyVersion(),
            deadline,
            key
        );
    }

    function _adminAuthorization(CovenantVault.AdminAction action, bytes32 payloadHash, uint64 deadline, uint256 key)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest =
            vault.adminAuthorizationDigest(action, payloadHash, vault.nonce(), vault.policyVersion(), deadline);
        bytes32 signed = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, signed);
        return abi.encodePacked(r, s, v);
    }

    function test_FactoryCreatesDiscoverableIsolatedVault() public view {
        address[] memory mine = factory.vaultsOf(owner);
        assertEq(mine.length, 1);
        assertEq(mine[0], address(vault));
        assertTrue(factory.isVault(address(vault)));
        assertEq(vault.balance(), 1_000e6);
    }

    function test_FactoryRejectsUnsafeRecoveryTimelock() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.InvalidTimelock.selector, uint32(0)));
        factory.createVault(tee, guardian, 0, PAYOUT);
    }

    function test_FactoryRejectsReservedSystemExtensionId() public {
        vm.expectRevert(abi.encodeWithSelector(CovenantVaultFactory.InvalidExtensionId.selector, 1));
        new CovenantVaultFactory(registry, 1);
    }

    function test_FlareDependenciesResolvedFromFlareContractRegistry() public view {
        assertEq(address(vault.ftso()), address(ftso));
        assertEq(address(vault.assetManager()), address(assetManager));
        assertEq(address(vault.fxrp()), address(fxrp));
    }

    function test_PolicyCanInitializeAfterUnsolicitedDirectMint() public {
        vm.prank(owner);
        address second = factory.createVault(tee, guardian, TIMELOCK, PAYOUT);
        fxrp.mint(second, 1);

        vm.prank(owner);
        CovenantVault(second).initializePolicy(keccak256("second-policy"), new bytes(160));
        assertEq(CovenantVault(second).policyVersion(), 1);
        assertEq(CovenantVault(second).balance(), 1);
    }

    function test_AuthorizationDigestMatchesGoFixture() public {
        address fixtureVault = address(0xC0dE);
        vm.etch(fixtureVault, address(vault).code);
        vm.chainId(114);
        bytes32 digest = CovenantVault(fixtureVault)
            .authorizationDigest(
                CovenantVault.Operation.SPEND,
                address(0xB0B),
                bytes32(0),
                20_000_000,
                1_000_000_000,
                1_700_000_000,
                7,
                3,
                1_700_000_300
            );
        assertEq(digest, 0xd9d00eb29ce3c8c83a0418dbffcc444636688a01d6ecd9deb01d97dae2ede182);
    }

    function test_AdminAuthorizationDigestMatchesGoFixture() public {
        address fixtureVault = address(0xC0dE);
        vm.etch(fixtureVault, address(vault).code);
        vm.chainId(114);
        bytes32 digest = CovenantVault(fixtureVault)
            .adminAuthorizationDigest(
                CovenantVault.AdminAction.POLICY_UPDATE,
                0x1111111111111111111111111111111111111111111111111111111111111111,
                7,
                3,
                1_700_000_300
            );
        assertEq(digest, 0x2c761dd726613f7715aa61ac9ccaa071cf1df6d801d1c089c851050c42936a00);
    }

    function test_DirectMintedBalanceIsImmediatelyAvailable() public view {
        // No deposit accounting or sync transaction is required: FAssets can
        // direct-mint to the vault's address and balance() sees it immediately.
        assertEq(vault.balance(), fxrp.balanceOf(address(vault)));
    }

    function test_SpendRequiresOwnerAndFccAuthorization() public {
        uint256 amount = 20e6;
        uint256 amountUsd = 10e8;
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        uint64 priceTimestamp = ftso.timestamp();
        bytes memory auth = _spendAuthorization(merchant, amount, deadline, teeKey);

        vm.prank(owner);
        vault.spend(merchant, amount, amountUsd, priceTimestamp, 0, 1, deadline, auth);

        assertEq(fxrp.balanceOf(merchant), amount);
        assertEq(vault.nonce(), 1);
        assertEq(vault.spentUsdByDay(uint64(block.timestamp / 1 days)), amountUsd);
    }

    function test_StolenOwnerKeyCannotForgeFccAuthorization() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        uint64 priceTimestamp = ftso.timestamp();
        bytes memory forged = _spendAuthorization(merchant, 20e6, deadline, 0xBAD);

        vm.prank(owner);
        vm.expectRevert();
        vault.spend(merchant, 20e6, 10e8, priceTimestamp, 0, 1, deadline, forged);
        assertEq(fxrp.balanceOf(merchant), 0);
    }

    function test_NonProductionTeeCannotAuthorize() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        uint64 priceTimestamp = ftso.timestamp();
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);
        registry.setStatus(tee, 1); // registered, but not promoted to Production

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.TeeNotTrusted.selector, tee));
        vault.spend(merchant, 20e6, 10e8, priceTimestamp, 0, 1, deadline, auth);
    }

    function test_TeeFromAnotherExtensionCannotAuthorize() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        uint64 priceTimestamp = ftso.timestamp();
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);
        registry.setExtensionId(tee, EXTENSION_ID + 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.TeeNotTrusted.selector, tee));
        vault.spend(merchant, 20e6, 10e8, priceTimestamp, 0, 1, deadline, auth);
    }

    function test_AuthorizationCannotBeReplayed() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        uint64 priceTimestamp = ftso.timestamp();
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);
        vm.prank(owner);
        vault.spend(merchant, 20e6, 10e8, priceTimestamp, 0, 1, deadline, auth);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.WrongNonce.selector, 1, 0));
        vault.spend(merchant, 20e6, 10e8, priceTimestamp, 0, 1, deadline, auth);
    }

    function test_PolicyChangesAreOpaqueAndTimelocked() public {
        bytes32 next = keccak256("next-private-policy");
        bytes memory ciphertext = new bytes(160);
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes32 payloadHash = vault.policyPayloadHash(next, ciphertext);
        bytes memory authorization =
            _adminAuthorization(CovenantVault.AdminAction.POLICY_UPDATE, payloadHash, deadline, teeKey);
        vm.prank(owner);
        vault.proposePolicy(next, ciphertext, 0, 1, deadline, authorization);

        vm.prank(owner);
        vm.expectRevert();
        vault.applyPolicy();

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(owner);
        vault.applyPolicy();
        assertEq(vault.policyCommitment(), next);
        assertEq(vault.policyVersion(), 2);
    }

    function test_StolenOwnerKeyCannotReplacePolicyWithoutPasskeyBackedFccAuthorization() public {
        bytes32 next = keccak256("malicious-policy");
        bytes memory ciphertext = new bytes(160);
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes32 payloadHash = vault.policyPayloadHash(next, ciphertext);
        bytes memory forged = _adminAuthorization(CovenantVault.AdminAction.POLICY_UPDATE, payloadHash, deadline, 0xBAD);

        vm.prank(owner);
        vm.expectRevert();
        vault.proposePolicy(next, ciphertext, 0, 1, deadline, forged);
        assertEq(vault.policyVersion(), 1);
    }

    function test_DestroyReturnsCompleteBalanceAndPermanentlyClosesVault() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes32 payloadHash = keccak256(abi.encode(owner));
        bytes memory authorization =
            _adminAuthorization(CovenantVault.AdminAction.DESTROY, payloadHash, deadline, teeKey);

        vm.prank(owner);
        uint256 returned = vault.destroyVault(0, 1, deadline, authorization);

        assertEq(returned, 1_000e6);
        assertEq(fxrp.balanceOf(owner), 1_000e6);
        assertEq(vault.balance(), 0);
        assertEq(uint8(vault.status()), uint8(CovenantVault.Status.DESTROYED));
        assertEq(vault.policyCommitment(), bytes32(0));
        assertEq(vault.encryptedPolicy().length, 0);

        vm.prank(owner);
        vm.expectRevert(CovenantVault.VaultLocked.selector);
        vault.deposit(1);
    }

    function test_StolenOwnerKeyCannotDestroyWithoutPasskeyBackedFccAuthorization() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes32 payloadHash = keccak256(abi.encode(owner));
        bytes memory forged = _adminAuthorization(CovenantVault.AdminAction.DESTROY, payloadHash, deadline, 0xBAD);

        vm.prank(owner);
        vm.expectRevert();
        vault.destroyVault(0, 1, deadline, forged);
        assertEq(vault.balance(), 1_000e6);
        assertEq(uint8(vault.status()), uint8(CovenantVault.Status.ACTIVE));
    }

    function test_StolenOwnerKeyCannotRotateTeeToBypassPolicyAuthorization() public {
        uint256 nextTeeKey = 0xBEEF;
        address nextTee = vm.addr(nextTeeKey);
        registry.setStatus(nextTee, 2);
        registry.setExtensionId(nextTee, EXTENSION_ID);
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes32 payloadHash = keccak256(abi.encode(nextTee));
        bytes memory forged = _adminAuthorization(CovenantVault.AdminAction.TEE_UPDATE, payloadHash, deadline, 0xBAD);

        vm.prank(owner);
        vm.expectRevert();
        vault.proposeTee(nextTee, 0, 1, deadline, forged);
        assertEq(vault.tee(), tee);
    }

    function test_DestroyedVaultSweepsLaterDirectMintsOnlyToOwner() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes32 payloadHash = keccak256(abi.encode(owner));
        bytes memory authorization =
            _adminAuthorization(CovenantVault.AdminAction.DESTROY, payloadHash, deadline, teeKey);
        vm.prank(owner);
        vault.destroyVault(0, 1, deadline, authorization);

        fxrp.mint(address(vault), 12e6);
        vm.prank(address(0xBAD));
        vault.sweepDestroyedBalance();
        assertEq(fxrp.balanceOf(owner), 1_012e6);
        assertEq(vault.balance(), 0);
    }

    function test_FreshAuthorizationSurvivesANewerFtsoObservation() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);
        uint64 oldTimestamp = ftso.timestamp();
        vm.warp(block.timestamp + 1);
        ftso.setPrice(500_001, oldTimestamp + 1);

        vm.prank(owner);
        vault.spend(merchant, 20e6, 10e8, oldTimestamp, 0, 1, deadline, auth);

        assertEq(fxrp.balanceOf(merchant), 20e6);
        assertEq(vault.nonce(), 1);
    }

    function test_PriceMoveBeyondOnePercentRequiresFreshAuthorization() public {
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);
        uint64 oldTimestamp = ftso.timestamp();
        vm.warp(block.timestamp + 1);
        ftso.setPrice(600_000, oldTimestamp + 1);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.AmountUsdChanged.selector, 10e8, 12e8));
        vault.spend(merchant, 20e6, 10e8, oldTimestamp, 0, 1, deadline, auth);
    }

    function test_FuturePriceTimestampIsRejected() public {
        uint64 futureTimestamp = uint64(block.timestamp + vault.MAX_PRICE_FUTURE_SKEW() + 1);
        ftso.setPrice(500_000, futureTimestamp);
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.StalePrice.selector, futureTimestamp));
        vault.spend(merchant, 20e6, 10e8, futureTimestamp, 0, 1, deadline, auth);
    }

    function test_SmallFtsoClockSkewDoesNotBlockExecution() public {
        uint64 futureTimestamp = uint64(block.timestamp + 3);
        ftso.setPrice(500_000, futureTimestamp);
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);

        vm.prank(owner);
        vault.spend(merchant, 20e6, 10e8, futureTimestamp, 0, 1, deadline, auth);

        assertEq(fxrp.balanceOf(merchant), 20e6);
    }

    function test_ZeroPriceCannotBypassPolicyAccounting() public {
        ftso.setPrice(0, uint64(block.timestamp));
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        bytes memory auth = _spendAuthorization(merchant, 20e6, deadline, teeKey);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.StalePrice.selector, uint64(block.timestamp)));
        vault.spend(merchant, 20e6, 0, uint64(block.timestamp), 0, 1, deadline, auth);
    }

    function test_LockStopsSpendButRecoveryCannotRedirect() public {
        vm.prank(guardian);
        vault.lock();
        vm.prank(owner);
        vault.scheduleRecovery();

        vm.expectRevert();
        vault.executeRecovery();

        vm.warp(block.timestamp + TIMELOCK);
        uint256 redeemedAmount = vault.executeRecovery();
        assertEq(redeemedAmount, 1_000e6);
        assertEq(assetManager.lastPayout(), PAYOUT);
        assertEq(assetManager.lastAmount(), 1_000e6);
        assertEq(vault.balance(), 0);
    }

    function test_GuardianCanCancelCompromisedOwnerRecovery() public {
        vm.prank(owner);
        vault.lock();
        vm.prank(owner);
        vault.scheduleRecovery();
        vm.prank(guardian);
        vault.cancelRecovery();

        vm.warp(block.timestamp + TIMELOCK);
        vm.expectRevert(CovenantVault.NothingPending.selector);
        vault.executeRecovery();
    }

    function test_RedeemUsesFAssetsAndCommittedDestination() public {
        uint256 amount = 40e6;
        uint256 amountUsd = 20e8;
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        uint64 priceTimestamp = ftso.timestamp();
        bytes memory auth = _authorization(
            CovenantVault.Operation.REDEEM,
            address(0),
            keccak256(bytes(PAYOUT)),
            amount,
            amountUsd,
            priceTimestamp,
            0,
            1,
            deadline,
            teeKey
        );

        vm.prank(owner);
        uint256 redeemedAmount = vault.redeemToXrp(amount, amountUsd, priceTimestamp, 0, 1, deadline, auth);
        assertEq(redeemedAmount, amount);
        assertEq(assetManager.lastPayout(), PAYOUT);
        assertEq(vault.balance(), 960e6);
    }

    function test_PartialFAssetsRedemptionRevertsAtomically() public {
        uint256 amount = 40e6;
        uint256 amountUsd = 20e8;
        uint64 deadline = uint64(block.timestamp + 5 minutes);
        uint64 priceTimestamp = ftso.timestamp();
        bytes memory auth = _authorization(
            CovenantVault.Operation.REDEEM,
            address(0),
            keccak256(bytes(PAYOUT)),
            amount,
            amountUsd,
            priceTimestamp,
            0,
            1,
            deadline,
            teeKey
        );
        assetManager.setMaximumRedeemAmount(20e6);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CovenantVault.IncompleteRedemption.selector, amount, 20e6));
        vault.redeemToXrp(amount, amountUsd, priceTimestamp, 0, 1, deadline, auth);
        assertEq(vault.balance(), 1_000e6);
        assertEq(vault.nonce(), 0);
    }
}
