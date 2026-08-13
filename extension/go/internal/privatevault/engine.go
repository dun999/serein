package privatevault

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	OperationSpend uint8 = iota
	OperationWithdraw
	OperationRedeem
	AuthorizationWindow = 5 * time.Minute
	MaxPriceAge         = time.Hour
)

type Request struct {
	Vault       common.Address
	To          common.Address
	Amount      *big.Int
	Operation   uint8
	StepUpProof []byte
}

type Result struct {
	Tee            common.Address
	Authorization  []byte
	Digest         common.Hash
	Nonce          *big.Int
	Deadline       uint64
	AmountUSD      uint64
	PriceTimestamp uint64
	PolicyVersion  uint64
	Operation      uint8
	XrplPayout     string
}

type Engine struct {
	chain   *Chain
	box     PolicyDecrypter
	signer  AuthorizationSigner
	address common.Address
	chainID uint64
}

func NewEngine(chain *Chain, box PolicyDecrypter, signer AuthorizationSigner, chainID uint64) (*Engine, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	address, err := signer.Address(ctx)
	if err != nil {
		return nil, fmt.Errorf("FCC machine identity: %w", err)
	}
	return &Engine{
		chain: chain, box: box, signer: signer, address: address, chainID: chainID,
	}, nil
}

func FromEnv() (*Engine, error) {
	var missing []string
	get := func(name string) string {
		value := strings.TrimSpace(os.Getenv(name))
		if value == "" {
			missing = append(missing, name)
		}
		return value
	}
	rpcURL := get("COSTON2_RPC_URL")
	ftsoRaw := get("FTSO_V2_ADDRESS")
	if len(missing) > 0 {
		return nil, fmt.Errorf("missing environment: %s", strings.Join(missing, ", "))
	}
	if !common.IsHexAddress(ftsoRaw) {
		return nil, fmt.Errorf("FTSO_V2_ADDRESS is invalid")
	}
	chain, err := NewChain(rpcURL, common.HexToAddress(ftsoRaw), &http.Client{Timeout: 15 * time.Second})
	if err != nil {
		return nil, err
	}
	var signer AuthorizationSigner
	var box PolicyDecrypter
	if signURL := strings.TrimSpace(os.Getenv("TEE_SIGN_URL")); signURL != "" {
		client := &http.Client{Timeout: 10 * time.Second}
		signer = newTeeSignClient(signURL, client)
		identityCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		publicKey, keyErr := signer.PublicKey(identityCtx)
		cancel()
		if keyErr != nil {
			return nil, fmt.Errorf("FCC machine public key: %w", keyErr)
		}
		decryptURL := strings.TrimSuffix(signURL, "/sign") + "/decrypt"
		box = newTeePolicyBox(decryptURL, crypto.FromECDSAPub(publicKey), client)
	} else {
		signingRaw := strings.TrimSpace(os.Getenv("ENCLAVE_KEY_HEX"))
		if signingRaw == "" {
			return nil, fmt.Errorf("missing environment: TEE_SIGN_URL (or ENCLAVE_KEY_HEX for standalone development)")
		}
		signing, keyErr := decodeKey("ENCLAVE_KEY_HEX", signingRaw)
		if keyErr != nil {
			return nil, keyErr
		}
		signer, keyErr = newLocalSigner(signing)
		if keyErr != nil {
			return nil, keyErr
		}
		box, keyErr = NewPolicyBox(signing)
		if keyErr != nil {
			return nil, keyErr
		}
	}
	return NewEngine(chain, box, signer, 114)
}

func decodeKey(name, raw string) ([]byte, error) {
	key, err := hex.DecodeString(strings.TrimPrefix(raw, "0x"))
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("%s must be 32-byte hex", name)
	}
	return key, nil
}

func (e *Engine) Address() common.Address { return e.address }
func (e *Engine) ChainID() uint64         { return e.chainID }
func (e *Engine) PolicyPublicKey() string { return e.box.PublicKey() }

func (e *Engine) Authorize(ctx context.Context, req Request) (*Result, error) {
	if req.Vault == (common.Address{}) {
		return nil, fmt.Errorf("vault is zero")
	}
	if req.Amount == nil || req.Amount.Sign() <= 0 || !req.Amount.IsUint64() {
		return nil, fmt.Errorf("amount is invalid")
	}
	if req.Operation > OperationRedeem {
		return nil, fmt.Errorf("operation is invalid")
	}

	snapshot, err := e.chain.Snapshot(ctx, req.Vault, true)
	if err != nil {
		return nil, fmt.Errorf("read Flare authorization snapshot: %w", err)
	}
	chainTimestamp := snapshot.Timestamp
	now := time.Unix(int64(chainTimestamp), 0)
	state := snapshot.Vault
	if state.Status != 0 {
		return nil, fmt.Errorf("vault is locked")
	}
	if state.PolicyVersion == 0 {
		return nil, fmt.Errorf("private policy is not initialized")
	}
	if state.Tee != e.address {
		return nil, fmt.Errorf("vault is assigned to a different TEE")
	}
	if state.Balance.Cmp(req.Amount) < 0 {
		return nil, fmt.Errorf("vault balance is insufficient")
	}
	if req.Operation == OperationWithdraw {
		req.To = state.Owner
	}
	if req.Operation == OperationRedeem && state.XrplPayout == "" {
		return nil, fmt.Errorf("XRPL payout is not configured")
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
	if req.Operation == OperationSpend && !policy.Allows(req.To) {
		return nil, fmt.Errorf("recipient is not allowed by the private policy")
	}

	value, decimals, priceTimestamp := snapshot.PriceValue, snapshot.PriceDecimals, snapshot.PriceTimestamp
	if priceTimestamp > chainTimestamp || now.Sub(time.Unix(int64(priceTimestamp), 0)) > MaxPriceAge {
		return nil, fmt.Errorf("FTSOv2 price is stale")
	}
	amountUSD, err := priceUSD(req.Amount.Uint64(), value, decimals)
	if err != nil {
		return nil, err
	}
	if amountUSD > policy.PerTxCap {
		return nil, fmt.Errorf("per-transaction limit exceeded")
	}
	if exceedsDailyCap(state.SpentTodayUSD, amountUSD, policy.DailyCap) {
		return nil, fmt.Errorf("daily limit exceeded")
	}

	if amountUSD > policy.StepUpThreshold {
		challenge, err := stepUpDigest(e.chainID, req, state.Nonce, state.PolicyVersion)
		if err != nil {
			return nil, err
		}
		if err := VerifyWebAuthn(policy.WebAuthn, req.StepUpProof, challenge); err != nil {
			return nil, err
		}
	}

	deadline := uint64(now.Add(AuthorizationWindow).Unix())
	destinationHash := common.Hash{}
	if req.Operation == OperationRedeem {
		destinationHash = crypto.Keccak256Hash([]byte(state.XrplPayout))
	}
	preimage, digest, err := authorizationPayload(
		e.chainID, req.Vault, req.Operation, req.To, destinationHash, req.Amount,
		amountUSD, priceTimestamp, state.Nonce, state.PolicyVersion, deadline,
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

	return &Result{
		Tee: e.address, Authorization: signature, Digest: digest, Nonce: state.Nonce,
		Deadline: deadline, AmountUSD: amountUSD, PriceTimestamp: priceTimestamp,
		PolicyVersion: state.PolicyVersion, Operation: req.Operation, XrplPayout: state.XrplPayout,
	}, nil
}

func priceUSD(amount, value uint64, decimals uint8) (uint64, error) {
	if value == 0 || decimals > 18 {
		return 0, fmt.Errorf("FTSO price is invalid")
	}
	numerator := new(big.Int).SetUint64(amount)
	numerator.Mul(numerator, new(big.Int).SetUint64(value))
	numerator.Mul(numerator, big.NewInt(100_000_000))
	denominator := new(big.Int).Mul(big.NewInt(1_000_000), new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(decimals)), nil))
	result := numerator.Div(numerator, denominator)
	if !result.IsUint64() {
		return 0, fmt.Errorf("USD amount is out of range")
	}
	return result.Uint64(), nil
}

func exceedsDailyCap(spent *big.Int, amount, cap uint64) bool {
	if spent == nil || !spent.IsUint64() || amount > cap {
		return true
	}
	return spent.Uint64() > cap-amount
}

func authorizationDigest(
	chainID uint64, vault common.Address, operation uint8, to common.Address,
	destinationHash common.Hash, amount *big.Int, amountUSD uint64, priceTimestamp uint64,
	nonce *big.Int, policyVersion uint64, deadline uint64,
) (common.Hash, error) {
	_, digest, err := authorizationPayload(
		chainID, vault, operation, to, destinationHash, amount, amountUSD,
		priceTimestamp, nonce, policyVersion, deadline,
	)
	return digest, err
}

func authorizationPayload(
	chainID uint64, vault common.Address, operation uint8, to common.Address,
	destinationHash common.Hash, amount *big.Int, amountUSD uint64, priceTimestamp uint64,
	nonce *big.Int, policyVersion uint64, deadline uint64,
) ([]byte, common.Hash, error) {
	args, err := authorizationArguments()
	if err != nil {
		return nil, common.Hash{}, err
	}
	packed, err := args.Pack(
		"COVENANT_PRIVATE_VAULT_V1", new(big.Int).SetUint64(chainID), vault,
		operation, to, destinationHash, amount, new(big.Int).SetUint64(amountUSD),
		priceTimestamp, nonce, policyVersion, deadline,
	)
	if err != nil {
		return nil, common.Hash{}, err
	}
	return packed, crypto.Keccak256Hash(packed), nil
}

func stepUpDigest(chainID uint64, req Request, nonce *big.Int, policyVersion uint64) ([32]byte, error) {
	str, _ := abi.NewType("string", "", nil)
	uint256T, _ := abi.NewType("uint256", "", nil)
	uint8T, _ := abi.NewType("uint8", "", nil)
	uint64T, _ := abi.NewType("uint64", "", nil)
	addressT, _ := abi.NewType("address", "", nil)
	args := abi.Arguments{{Type: str}, {Type: uint256T}, {Type: addressT}, {Type: uint8T}, {Type: addressT}, {Type: uint256T}, {Type: uint256T}, {Type: uint64T}}
	packed, err := args.Pack("COVENANT_STEP_UP_V1", new(big.Int).SetUint64(chainID), req.Vault, req.Operation, req.To, req.Amount, nonce, policyVersion)
	if err != nil {
		return [32]byte{}, err
	}
	return crypto.Keccak256Hash(packed), nil
}

func authorizationArguments() (abi.Arguments, error) {
	names := []string{"string", "uint256", "address", "uint8", "address", "bytes32", "uint256", "uint256", "uint64", "uint256", "uint64", "uint64"}
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
