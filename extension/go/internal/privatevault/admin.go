package privatevault

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	AdminPolicyUpdate uint8 = iota
	AdminDestroy
	AdminTeeUpdate
	AdminGuardianUpdate
	AdminXrplPayoutUpdate
)

type AdminRequest struct {
	Vault       common.Address
	Action      uint8
	PayloadHash common.Hash
	StepUpProof []byte
}

type AdminResult struct {
	Tee           common.Address
	Authorization []byte
	Digest        common.Hash
	Nonce         *big.Int
	Deadline      uint64
	PolicyVersion uint64
	Action        uint8
	PayloadHash   common.Hash
}

// AuthorizeAdmin always requires the passkey enrolled in the active encrypted
// policy. The wallet signature that dispatches the request is deliberately not
// sufficient: the resulting TEE signature is what the vault enforces on-chain.
func (e *Engine) AuthorizeAdmin(ctx context.Context, req AdminRequest) (*AdminResult, error) {
	if req.Vault == (common.Address{}) {
		return nil, fmt.Errorf("vault is zero")
	}
	if req.Action > AdminXrplPayoutUpdate {
		return nil, fmt.Errorf("admin action is invalid")
	}
	if req.PayloadHash == (common.Hash{}) {
		return nil, fmt.Errorf("admin payload hash is zero")
	}

	snapshot, err := e.chain.Snapshot(ctx, req.Vault, false)
	if err != nil {
		return nil, fmt.Errorf("read Flare admin snapshot: %w", err)
	}
	chainTimestamp := snapshot.Timestamp
	state := snapshot.Vault
	if state.Status != 0 {
		return nil, fmt.Errorf("vault is not active")
	}
	if state.PolicyVersion == 0 {
		return nil, fmt.Errorf("private policy is not initialized")
	}
	if state.Tee != e.address {
		return nil, fmt.Errorf("vault is assigned to a different TEE")
	}

	plaintext, err := e.box.Open(ctx, state.EncryptedPolicy, e.chainID, req.Vault, state.PolicyVersion)
	if err != nil {
		return nil, err
	}
	if err := VerifyCommitment(plaintext, state.PolicyCommitment); err != nil {
		return nil, err
	}
	policy, err := ParsePolicy(plaintext)
	if err != nil {
		return nil, err
	}
	challenge, err := adminStepUpDigest(e.chainID, req, state.Nonce, state.PolicyVersion)
	if err != nil {
		return nil, err
	}
	if err := VerifyWebAuthn(policy.WebAuthn, req.StepUpProof, challenge); err != nil {
		return nil, err
	}

	deadline := chainTimestamp + uint64(AuthorizationWindow/time.Second)
	preimage, digest, err := adminAuthorizationPayload(
		e.chainID, req.Vault, req.Action, req.PayloadHash, state.Nonce, state.PolicyVersion, deadline,
	)
	if err != nil {
		return nil, err
	}
	signature, signerAddress, err := e.signer.Sign(ctx, preimage)
	if err != nil {
		return nil, err
	}
	if signerAddress != e.address {
		return nil, fmt.Errorf("FCC signing identity changed")
	}

	return &AdminResult{
		Tee: e.address, Authorization: signature, Digest: digest, Nonce: state.Nonce,
		Deadline: deadline, PolicyVersion: state.PolicyVersion, Action: req.Action,
		PayloadHash: req.PayloadHash,
	}, nil
}

func adminStepUpDigest(
	chainID uint64, req AdminRequest, nonce *big.Int, policyVersion uint64,
) ([32]byte, error) {
	args, err := abiArguments("string", "uint256", "address", "uint8", "bytes32", "uint256", "uint64")
	if err != nil {
		return [32]byte{}, err
	}
	packed, err := args.Pack(
		"COVENANT_ADMIN_STEP_UP_V1", new(big.Int).SetUint64(chainID), req.Vault,
		req.Action, req.PayloadHash, nonce, policyVersion,
	)
	if err != nil {
		return [32]byte{}, err
	}
	return crypto.Keccak256Hash(packed), nil
}

func adminAuthorizationPayload(
	chainID uint64,
	vault common.Address,
	action uint8,
	payloadHash common.Hash,
	nonce *big.Int,
	policyVersion uint64,
	deadline uint64,
) ([]byte, common.Hash, error) {
	args, err := abiArguments(
		"string", "uint256", "address", "uint8", "bytes32", "uint256", "uint64", "uint64",
	)
	if err != nil {
		return nil, common.Hash{}, err
	}
	packed, err := args.Pack(
		"COVENANT_PRIVATE_VAULT_ADMIN_V1", new(big.Int).SetUint64(chainID), vault,
		action, payloadHash, nonce, policyVersion, deadline,
	)
	if err != nil {
		return nil, common.Hash{}, err
	}
	return packed, crypto.Keccak256Hash(packed), nil
}

func abiArguments(names ...string) (abi.Arguments, error) {
	args := make(abi.Arguments, 0, len(names))
	for _, name := range names {
		typeValue, err := abi.NewType(name, "", nil)
		if err != nil {
			return nil, err
		}
		args = append(args, abi.Argument{Type: typeValue})
	}
	return args, nil
}
