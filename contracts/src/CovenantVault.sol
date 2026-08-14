// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ContractRegistry} from "@flarenetwork/flare-periphery-contracts/coston2/ContractRegistry.sol";
import {FtsoV2Interface} from "@flarenetwork/flare-periphery-contracts/coston2/FtsoV2Interface.sol";
import {IAssetManager} from "@flarenetwork/flare-periphery-contracts/coston2/IAssetManager.sol";
import {ITeeMachineRegistry} from "./interfaces/ITeeMachineRegistry.sol";

/// @title CovenantVault
/// @notice A confidential, policy-controlled FXRP account.
///
/// @dev The policy itself is encrypted for a Flare Confidential Compute (FCC)
/// extension. Only its commitment and ciphertext are public. The extension
/// independently reads this contract and FTSOv2, evaluates that policy, and
/// signs a one-use authorization. The owner's transaction and the FCC
/// authorization are both required before FXRP can leave.
contract CovenantVault {
    enum Status {
        ACTIVE,
        LOCKED,
        DESTROYED
    }

    enum Operation {
        SPEND,
        WITHDRAW,
        REDEEM
    }

    /// @dev Administrative actions use a separate signed domain from asset
    /// movement. FCC only signs these after verifying the passkey enrolled in
    /// the currently active encrypted policy.
    enum AdminAction {
        POLICY_UPDATE,
        DESTROY,
        TEE_UPDATE,
        GUARDIAN_UPDATE,
        XRPL_PAYOUT_UPDATE
    }

    struct PendingPolicy {
        bytes32 commitment;
        bytes ciphertext;
        uint64 effectiveAt;
    }

    struct PendingAddress {
        address value;
        uint64 effectiveAt;
    }

    IERC20 public immutable fxrp;
    FtsoV2Interface public immutable ftso;
    ITeeMachineRegistry public immutable teeRegistry;
    IAssetManager public immutable assetManager;
    uint256 public immutable extensionId;

    address public owner;
    address public guardian;
    address public tee;
    uint32 public immutable timelockSeconds;
    Status public status;

    bytes32 public policyCommitment;
    bytes public encryptedPolicy;
    uint64 public policyVersion;
    PendingPolicy private _pendingPolicy;
    PendingAddress public pendingTee;
    PendingAddress public pendingGuardian;

    string public xrplPayout;
    string public pendingXrplPayout;
    uint64 public pendingXrplPayoutAt;

    uint256 public nonce;
    mapping(uint64 day => uint256 amountUsd) public spentUsdByDay;
    uint64 public recoveryAt;
    uint64 public unlockAt;
    bool private _entered;

    bytes21 public constant XRP_USD_FEED_ID = bytes21(0x015852502f55534400000000000000000000000000);
    uint64 public constant MAX_PRICE_AGE = 1 hours;
    uint64 public constant MAX_PRICE_FUTURE_SKEW = 30 seconds;
    uint8 internal constant TEE_STATUS_PRODUCTION = 2;
    uint256 public constant FIRST_PUBLIC_EXTENSION_ID = 0x10000;
    uint32 public constant MIN_TIMELOCK = 1 days;
    uint32 public constant MAX_TIMELOCK = 30 days;

    event PolicyInitialized(bytes32 indexed commitment, uint64 indexed version);
    event PolicyProposed(bytes32 indexed commitment, uint64 indexed version, uint64 effectiveAt);
    event PolicyApplied(bytes32 indexed commitment, uint64 indexed version);
    event PolicyProposalCancelled(bytes32 indexed commitment);
    event Funded(address indexed from, uint256 amount);
    event Spent(
        address indexed to,
        uint256 amount,
        uint256 amountUsd,
        uint64 priceTimestamp,
        uint256 indexed nonce,
        uint64 policyVersion
    );
    event Withdrawn(address indexed owner, uint256 amount, uint256 amountUsd, uint256 indexed nonce);
    event Redeemed(string xrplAddress, uint256 amount, uint256 amountUsd, uint256 indexed nonce);
    event Locked(address indexed by);
    event UnlockScheduled(uint64 effectiveAt);
    event Unlocked(address indexed by);
    event RecoveryScheduled(uint64 effectiveAt);
    event RecoveryCancelled(address indexed by);
    event RecoveryExecuted(string xrplAddress, uint256 amount);
    event TeeProposed(address indexed tee, uint64 effectiveAt);
    event TeeChanged(address indexed tee);
    event GuardianProposed(address indexed guardian, uint64 effectiveAt);
    event GuardianChanged(address indexed guardian);
    event XrplPayoutProposed(string xrplAddress, uint64 effectiveAt);
    event XrplPayoutChanged(string xrplAddress);
    event VaultDestroyed(address indexed owner, uint256 amount, uint256 indexed nonce);
    event DestroyedBalanceSwept(address indexed owner, uint256 amount);

    error NotOwner();
    error NotGuardian();
    error NotOwnerOrGuardian();
    error VaultLocked();
    error VaultActive();
    error PolicyNotInitialized();
    error PolicyAlreadyInitialized();
    error InvalidPolicy();
    error NothingPending();
    error TimelockNotElapsed(uint64 effectiveAt);
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance(uint256 held, uint256 requested);
    error TransferFailed();
    error PriceChanged(uint64 authorizedTimestamp, uint64 currentTimestamp);
    error AmountUsdChanged(uint256 authorizedAmount, uint256 currentAmount);
    error StalePrice(uint64 timestamp);
    error AuthorizationExpired(uint64 deadline);
    error WrongNonce(uint256 expected, uint256 supplied);
    error WrongPolicyVersion(uint64 expected, uint64 supplied);
    error NotTheTee(address recovered, address expected);
    error TeeNotTrusted(address tee);
    error MalformedSignature();
    error NoXrplPayout();
    error Reentrancy();
    error InvalidTimelock(uint32 supplied);
    error InvalidExtensionId(uint256 supplied);
    error InvalidFlareDependency();
    error IncompleteRedemption(uint256 requested, uint256 redeemed);
    error VaultIsDestroyed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian || guardian == address(0)) revert NotGuardian();
        _;
    }

    modifier onlyOwnerOrGuardian() {
        if (msg.sender != owner && msg.sender != guardian) revert NotOwnerOrGuardian();
        _;
    }

    modifier whenActive() {
        if (status != Status.ACTIVE) revert VaultLocked();
        _;
    }

    modifier whenDestroyed() {
        if (status != Status.DESTROYED) revert VaultIsDestroyed();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert Reentrancy();
        _entered = true;
        _;
        _entered = false;
    }

    constructor(
        address _owner,
        address _guardian,
        address _tee,
        uint32 _timelockSeconds,
        string memory _xrplPayout,
        ITeeMachineRegistry _teeRegistry,
        uint256 _extensionId
    ) {
        if (_owner == address(0) || _tee == address(0)) revert ZeroAddress();
        if (_extensionId < FIRST_PUBLIC_EXTENSION_ID) revert InvalidExtensionId(_extensionId);
        if (bytes(_xrplPayout).length == 0) revert NoXrplPayout();
        if (_timelockSeconds < MIN_TIMELOCK || _timelockSeconds > MAX_TIMELOCK) {
            revert InvalidTimelock(_timelockSeconds);
        }

        // Flare-owned dependencies come from Flare's own contract registry
        // rather than constructor-supplied addresses, so a Flare-side redeploy
        // does not require re-deploying every vault. FXRP is deliberately not
        // read from the registry: the FAsset token is not registered under its
        // own name, and taking it from `assetManager.fAsset()` guarantees the
        // token matches the asset manager we are about to call.
        assetManager = ContractRegistry.getAssetManagerFXRP();
        ftso = ContractRegistry.getFtsoV2();
        if (address(assetManager) == address(0) || address(ftso) == address(0)) {
            revert InvalidFlareDependency();
        }
        fxrp = IERC20(address(assetManager.fAsset()));

        owner = _owner;
        guardian = _guardian;
        tee = _tee;
        timelockSeconds = _timelockSeconds;
        xrplPayout = _xrplPayout;
        teeRegistry = _teeRegistry;
        extensionId = _extensionId;
        status = Status.ACTIVE;

        _requireTrustedTee(_tee);
    }

    // ---------------------------------------------------------------------
    // Confidential policy

    /// @notice Install the first encrypted policy before the vault is funded.
    function initializePolicy(bytes32 commitment, bytes calldata ciphertext) external onlyOwner {
        if (policyVersion != 0) revert PolicyAlreadyInitialized();
        _setPolicy(commitment, ciphertext, 1);
        emit PolicyInitialized(commitment, 1);
    }

    /// @notice Stage a policy change. All opaque changes wait because the
    /// contract cannot safely classify an encrypted change as tighter/looser.
    function proposePolicy(
        bytes32 commitment,
        bytes calldata ciphertext,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) external onlyOwner whenActive {
        _validatePolicy(commitment, ciphertext);
        _authorizeAdmin(
            AdminAction.POLICY_UPDATE,
            policyPayloadHash(commitment, ciphertext),
            forNonce,
            forPolicyVersion,
            deadline,
            authorization
        );
        uint64 effectiveAt = uint64(block.timestamp) + timelockSeconds;
        _pendingPolicy = PendingPolicy(commitment, ciphertext, effectiveAt);
        emit PolicyProposed(commitment, policyVersion + 1, effectiveAt);
    }

    function applyPolicy() external onlyOwner whenActive {
        PendingPolicy memory pending = _pendingPolicy;
        if (pending.effectiveAt == 0) revert NothingPending();
        if (block.timestamp < pending.effectiveAt) revert TimelockNotElapsed(pending.effectiveAt);
        _setPolicy(pending.commitment, pending.ciphertext, policyVersion + 1);
        delete _pendingPolicy;
        emit PolicyApplied(policyCommitment, policyVersion);
    }

    function cancelPolicyProposal() external onlyOwnerOrGuardian {
        bytes32 commitment = _pendingPolicy.commitment;
        if (_pendingPolicy.effectiveAt == 0) revert NothingPending();
        delete _pendingPolicy;
        emit PolicyProposalCancelled(commitment);
    }

    function pendingPolicy() external view returns (bytes32 commitment, bytes memory ciphertext, uint64 effectiveAt) {
        PendingPolicy storage pending = _pendingPolicy;
        return (pending.commitment, pending.ciphertext, pending.effectiveAt);
    }

    function _setPolicy(bytes32 commitment, bytes memory ciphertext, uint64 version) internal {
        _validatePolicy(commitment, ciphertext);
        policyCommitment = commitment;
        encryptedPolicy = ciphertext;
        policyVersion = version;
    }

    function _validatePolicy(bytes32 commitment, bytes memory ciphertext) internal pure {
        // go-ethereum ECIES overhead is an ephemeral secp256k1 key (65),
        // AES-CTR IV (16), and HMAC-SHA256 tag (32), plus bound plaintext.
        if (commitment == bytes32(0) || ciphertext.length < 114) revert InvalidPolicy();
    }

    function policyPayloadHash(bytes32 commitment, bytes memory ciphertext) public pure returns (bytes32) {
        return keccak256(abi.encode(commitment, keccak256(ciphertext)));
    }

    // ---------------------------------------------------------------------
    // Funding and Flare-authorized movement

    /// @notice Convenience funding path. Direct-minted FXRP can also be sent
    /// straight to this vault because its ERC-20 balance is authoritative.
    function deposit(uint256 amount) external whenActive nonReentrant {
        if (policyVersion == 0) revert PolicyNotInitialized();
        if (amount == 0) revert ZeroAmount();
        if (!fxrp.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Funded(msg.sender, amount);
    }

    function balance() public view returns (uint256) {
        return fxrp.balanceOf(address(this));
    }

    function spend(
        address to,
        uint256 amount,
        uint256 amountUsd,
        uint64 priceTimestamp,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) external onlyOwner whenActive nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        _authorize(
            Operation.SPEND,
            to,
            bytes32(0),
            amount,
            amountUsd,
            priceTimestamp,
            forNonce,
            forPolicyVersion,
            deadline,
            authorization
        );
        if (!fxrp.transfer(to, amount)) revert TransferFailed();
        emit Spent(to, amount, amountUsd, priceTimestamp, forNonce, forPolicyVersion);
    }

    function withdraw(
        uint256 amount,
        uint256 amountUsd,
        uint64 priceTimestamp,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) external onlyOwner whenActive nonReentrant {
        _authorize(
            Operation.WITHDRAW,
            owner,
            bytes32(0),
            amount,
            amountUsd,
            priceTimestamp,
            forNonce,
            forPolicyVersion,
            deadline,
            authorization
        );
        if (!fxrp.transfer(owner, amount)) revert TransferFailed();
        emit Withdrawn(owner, amount, amountUsd, forNonce);
    }

    function redeemToXrp(
        uint256 amount,
        uint256 amountUsd,
        uint64 priceTimestamp,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) external onlyOwner whenActive nonReentrant returns (uint256 redeemedAmount) {
        string memory payout = xrplPayout;
        if (bytes(payout).length == 0) revert NoXrplPayout();
        _authorize(
            Operation.REDEEM,
            address(0),
            keccak256(bytes(payout)),
            amount,
            amountUsd,
            priceTimestamp,
            forNonce,
            forPolicyVersion,
            deadline,
            authorization
        );

        if (!fxrp.approve(address(assetManager), amount)) revert TransferFailed();
        redeemedAmount = assetManager.redeemAmount(amount, payout, payable(address(0)));
        if (redeemedAmount != amount) revert IncompleteRedemption(amount, redeemedAmount);
        emit Redeemed(payout, amount, amountUsd, forNonce);
    }

    function _authorize(
        Operation operation,
        address to,
        bytes32 destinationHash,
        uint256 amount,
        uint256 amountUsd,
        uint64 priceTimestamp,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) internal {
        if (policyVersion == 0) revert PolicyNotInitialized();
        if (amount == 0) revert ZeroAmount();
        uint256 held = balance();
        if (amount > held) revert InsufficientBalance(held, amount);
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        if (forNonce != nonce) revert WrongNonce(nonce, forNonce);
        if (forPolicyVersion != policyVersion) {
            revert WrongPolicyVersion(policyVersion, forPolicyVersion);
        }
        _requireTrustedTee(tee);

        _validatePrice(amount, amountUsd, priceTimestamp);

        bytes32 digest = authorizationDigest(
            operation, to, destinationHash, amount, amountUsd, priceTimestamp, forNonce, forPolicyVersion, deadline
        );
        address recovered = _recover(_ethSigned(digest), authorization);
        if (recovered != tee) revert NotTheTee(recovered, tee);

        nonce = forNonce + 1;
        spentUsdByDay[uint64(block.timestamp / 1 days)] += amountUsd;
    }

    function authorizationDigest(
        Operation operation,
        address to,
        bytes32 destinationHash,
        uint256 amount,
        uint256 amountUsd,
        uint64 priceTimestamp,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                "COVENANT_PRIVATE_VAULT_V1",
                block.chainid,
                address(this),
                operation,
                to,
                destinationHash,
                amount,
                amountUsd,
                priceTimestamp,
                forNonce,
                forPolicyVersion,
                deadline
            )
        );
    }

    function quote(uint256 amount) external returns (uint256 amountUsd, uint64 priceTimestamp) {
        return _toUsd(amount);
    }

    // ---------------------------------------------------------------------
    // Passkey-authorized administration

    function adminAuthorizationDigest(
        AdminAction action,
        bytes32 payloadHash,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                "COVENANT_PRIVATE_VAULT_ADMIN_V1",
                block.chainid,
                address(this),
                action,
                payloadHash,
                forNonce,
                forPolicyVersion,
                deadline
            )
        );
    }

    function _authorizeAdmin(
        AdminAction action,
        bytes32 payloadHash,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) internal {
        if (policyVersion == 0) revert PolicyNotInitialized();
        if (block.timestamp > deadline) revert AuthorizationExpired(deadline);
        if (forNonce != nonce) revert WrongNonce(nonce, forNonce);
        if (forPolicyVersion != policyVersion) {
            revert WrongPolicyVersion(policyVersion, forPolicyVersion);
        }
        _requireTrustedTee(tee);

        bytes32 digest = adminAuthorizationDigest(action, payloadHash, forNonce, forPolicyVersion, deadline);
        address recovered = _recover(_ethSigned(digest), authorization);
        if (recovered != tee) revert NotTheTee(recovered, tee);
        nonce = forNonce + 1;
    }

    /// @notice Permanently closes the vault and returns its complete FXRP
    /// balance to the owner. Solidity code is intentionally retained so any
    /// FXRP accidentally sent later can still be swept to that same owner.
    function destroyVault(uint256 forNonce, uint64 forPolicyVersion, uint64 deadline, bytes calldata authorization)
        external
        onlyOwner
        whenActive
        nonReentrant
        returns (uint256 amount)
    {
        bytes32 payloadHash = keccak256(abi.encode(owner));
        _authorizeAdmin(AdminAction.DESTROY, payloadHash, forNonce, forPolicyVersion, deadline, authorization);

        amount = balance();
        status = Status.DESTROYED;
        delete policyCommitment;
        delete encryptedPolicy;
        delete _pendingPolicy;
        delete pendingTee;
        delete pendingGuardian;
        delete pendingXrplPayout;
        pendingXrplPayoutAt = 0;
        unlockAt = 0;
        recoveryAt = 0;

        if (amount != 0 && !fxrp.transfer(owner, amount)) revert TransferFailed();
        emit VaultDestroyed(owner, amount, forNonce);
    }

    /// @notice Returns FXRP sent to a terminal vault after it was destroyed.
    /// Anyone may trigger this, but the destination is permanently the owner.
    function sweepDestroyedBalance() external whenDestroyed nonReentrant returns (uint256 amount) {
        amount = balance();
        if (amount == 0) revert ZeroAmount();
        if (!fxrp.transfer(owner, amount)) revert TransferFailed();
        emit DestroyedBalanceSwept(owner, amount);
    }

    function _toUsd(uint256 amount) internal returns (uint256 amountUsd, uint64 timestamp) {
        (uint256 value, int8 decimals, uint64 feedTimestamp) = ftso.getFeedById(XRP_USD_FEED_ID);
        if (
            value == 0 || decimals < 0 || decimals > 18
                || feedTimestamp > block.timestamp + MAX_PRICE_FUTURE_SKEW
                || block.timestamp > feedTimestamp + MAX_PRICE_AGE
        ) {
            revert StalePrice(feedTimestamp);
        }
        uint256 scale = 10 ** uint256(uint8(decimals));
        amountUsd = (amount * value * 1e8) / (1e6 * scale);
        timestamp = feedTimestamp;
    }

    // FCC signs the price observation used for the private policy decision.
    // FTSO can publish a newer observation between that decision and the
    // wallet transaction, so exact timestamp/value equality would make a
    // valid authorization randomly unexecutable. Keep the signed quote fresh
    // and require the latest on-chain quote to remain within 1%.
    function _validatePrice(uint256 amount, uint256 amountUsd, uint64 priceTimestamp) internal {
        if (
            priceTimestamp > block.timestamp + MAX_PRICE_FUTURE_SKEW
                || block.timestamp > priceTimestamp + MAX_PRICE_AGE
        ) {
            revert StalePrice(priceTimestamp);
        }
        (uint256 currentUsd, uint64 currentTimestamp) = _toUsd(amount);
        if (currentTimestamp < priceTimestamp) {
            revert PriceChanged(priceTimestamp, currentTimestamp);
        }
        uint256 difference = currentUsd > amountUsd ? currentUsd - amountUsd : amountUsd - currentUsd;
        uint256 allowedDifference = (amountUsd * 100) / 10_000;
        if (amountUsd == 0 || difference > allowedDifference) {
            revert AmountUsdChanged(amountUsd, currentUsd);
        }
    }

    // ---------------------------------------------------------------------
    // Lock and recovery

    function lock() external onlyOwnerOrGuardian {
        if (status == Status.DESTROYED) revert VaultIsDestroyed();
        status = Status.LOCKED;
        unlockAt = 0;
        emit Locked(msg.sender);
    }

    function scheduleUnlock() external onlyOwner {
        if (status != Status.LOCKED) revert VaultActive();
        unlockAt = uint64(block.timestamp) + timelockSeconds;
        emit UnlockScheduled(unlockAt);
    }

    function confirmUnlock() external {
        if (status != Status.LOCKED) revert VaultActive();
        if (guardian == address(0)) {
            if (msg.sender != owner) revert NotOwner();
        } else if (msg.sender != guardian) {
            revert NotGuardian();
        }
        if (unlockAt == 0) revert NothingPending();
        if (block.timestamp < unlockAt) revert TimelockNotElapsed(unlockAt);
        status = Status.ACTIVE;
        unlockAt = 0;
        recoveryAt = 0;
        emit Unlocked(msg.sender);
    }

    function scheduleRecovery() external onlyOwnerOrGuardian {
        if (status != Status.LOCKED) revert VaultActive();
        recoveryAt = uint64(block.timestamp) + timelockSeconds;
        emit RecoveryScheduled(recoveryAt);
    }

    function cancelRecovery() external {
        if (guardian == address(0)) {
            if (msg.sender != owner) revert NotOwner();
        } else if (msg.sender != guardian) {
            revert NotGuardian();
        }
        if (recoveryAt == 0) revert NothingPending();
        recoveryAt = 0;
        emit RecoveryCancelled(msg.sender);
    }

    /// @notice Escape hatch for a lost/revoked TEE. It can only redeem the
    /// complete balance to the precommitted XRPL address after the delay.
    function executeRecovery() external nonReentrant returns (uint256 redeemedAmount) {
        if (status != Status.LOCKED) revert VaultActive();
        uint64 effectiveAt = recoveryAt;
        if (effectiveAt == 0) revert NothingPending();
        if (block.timestamp < effectiveAt) revert TimelockNotElapsed(effectiveAt);
        uint256 amount = balance();
        if (amount == 0) revert ZeroAmount();
        recoveryAt = 0;

        if (!fxrp.approve(address(assetManager), amount)) revert TransferFailed();
        redeemedAmount = assetManager.redeemAmount(amount, xrplPayout, payable(address(0)));
        if (redeemedAmount != amount) revert IncompleteRedemption(amount, redeemedAmount);
        emit RecoveryExecuted(xrplPayout, amount);
    }

    // ---------------------------------------------------------------------
    // Timelocked authority and destination changes

    function proposeTee(
        address newTee,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) external onlyOwner whenActive {
        if (newTee == address(0)) revert ZeroAddress();
        _requireTrustedTee(newTee);
        _authorizeAdmin(
            AdminAction.TEE_UPDATE, keccak256(abi.encode(newTee)), forNonce, forPolicyVersion, deadline, authorization
        );
        uint64 effectiveAt = uint64(block.timestamp) + timelockSeconds;
        pendingTee = PendingAddress(newTee, effectiveAt);
        emit TeeProposed(newTee, effectiveAt);
    }

    function applyTee() external onlyOwner whenActive {
        PendingAddress memory pending = pendingTee;
        if (pending.effectiveAt == 0) revert NothingPending();
        if (block.timestamp < pending.effectiveAt) revert TimelockNotElapsed(pending.effectiveAt);
        _requireTrustedTee(pending.value);
        tee = pending.value;
        delete pendingTee;
        emit TeeChanged(tee);
    }

    function proposeGuardian(
        address newGuardian,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) external onlyOwner whenActive {
        _authorizeAdmin(
            AdminAction.GUARDIAN_UPDATE,
            keccak256(abi.encode(newGuardian)),
            forNonce,
            forPolicyVersion,
            deadline,
            authorization
        );
        uint64 effectiveAt = uint64(block.timestamp) + timelockSeconds;
        pendingGuardian = PendingAddress(newGuardian, effectiveAt);
        emit GuardianProposed(newGuardian, effectiveAt);
    }

    function applyGuardian() external onlyOwner whenActive {
        PendingAddress memory pending = pendingGuardian;
        if (pending.effectiveAt == 0) revert NothingPending();
        if (block.timestamp < pending.effectiveAt) revert TimelockNotElapsed(pending.effectiveAt);
        guardian = pending.value;
        delete pendingGuardian;
        emit GuardianChanged(guardian);
    }

    function proposeXrplPayout(
        string calldata newPayout,
        uint256 forNonce,
        uint64 forPolicyVersion,
        uint64 deadline,
        bytes calldata authorization
    ) external onlyOwner whenActive {
        if (bytes(newPayout).length == 0) revert NoXrplPayout();
        _authorizeAdmin(
            AdminAction.XRPL_PAYOUT_UPDATE,
            keccak256(bytes(newPayout)),
            forNonce,
            forPolicyVersion,
            deadline,
            authorization
        );
        uint64 effectiveAt = uint64(block.timestamp) + timelockSeconds;
        pendingXrplPayout = newPayout;
        pendingXrplPayoutAt = effectiveAt;
        emit XrplPayoutProposed(newPayout, effectiveAt);
    }

    function applyXrplPayout() external onlyOwner whenActive {
        uint64 effectiveAt = pendingXrplPayoutAt;
        if (effectiveAt == 0) revert NothingPending();
        if (block.timestamp < effectiveAt) revert TimelockNotElapsed(effectiveAt);
        xrplPayout = pendingXrplPayout;
        delete pendingXrplPayout;
        pendingXrplPayoutAt = 0;
        emit XrplPayoutChanged(xrplPayout);
    }

    function cancelXrplPayout() external onlyOwnerOrGuardian {
        if (pendingXrplPayoutAt == 0) revert NothingPending();
        delete pendingXrplPayout;
        pendingXrplPayoutAt = 0;
    }

    function _requireTrustedTee(address candidate) internal view {
        try teeRegistry.getTeeMachineStatus(candidate) returns (uint8 machineStatus) {
            if (machineStatus != TEE_STATUS_PRODUCTION) revert TeeNotTrusted(candidate);
        } catch {
            revert TeeNotTrusted(candidate);
        }
        try teeRegistry.getExtensionId(candidate) returns (uint256 machineExtensionId) {
            if (machineExtensionId != extensionId) revert TeeNotTrusted(candidate);
        } catch {
            revert TeeNotTrusted(candidate);
        }
    }

    function _ethSigned(bytes32 digest) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) revert MalformedSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert MalformedSignature();
        }
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert MalformedSignature();
        return recovered;
    }
}
