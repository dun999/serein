package privatevault

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/crypto/ecies"
)

const policyContext = "COVENANT_POLICY_V1"

// Policy is encrypted for FCC. Amounts are decimal strings to avoid lossy JSON
// number handling across Go, TypeScript and Solidity.
type Policy struct {
	Version            int                 `json:"version"`
	Name               string              `json:"name"`
	PerTxCapUSD        string              `json:"perTxCapUsd"`
	DailyCapUSD        string              `json:"dailyCapUsd"`
	StepUpThresholdUSD string              `json:"stepUpThresholdUsd"`
	AllowedRecipients  []Recipient         `json:"allowedRecipients"`
	WebAuthn           *WebAuthnCredential `json:"webAuthn,omitempty"`
}

type Recipient struct {
	Address string `json:"address"`
	Label   string `json:"label,omitempty"`
}

type WebAuthnCredential struct {
	CredentialID  string   `json:"credentialId"`
	PublicKeySPKI string   `json:"publicKeySpki"`
	RPID          string   `json:"rpId"`
	Origins       []string `json:"origins"`
}

type ParsedPolicy struct {
	Policy
	PerTxCap        uint64
	DailyCap        uint64
	StepUpThreshold uint64
	recipients      map[common.Address]struct{}
}

func ParsePolicy(plaintext []byte) (*ParsedPolicy, error) {
	var policy Policy
	dec := json.NewDecoder(strings.NewReader(string(plaintext)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&policy); err != nil {
		return nil, fmt.Errorf("decode private policy: %w", err)
	}
	if policy.Version != 1 {
		return nil, fmt.Errorf("unsupported private policy version %d", policy.Version)
	}
	perTx, err := parseUint64("perTxCapUsd", policy.PerTxCapUSD)
	if err != nil {
		return nil, err
	}
	daily, err := parseUint64("dailyCapUsd", policy.DailyCapUSD)
	if err != nil {
		return nil, err
	}
	stepUp, err := parseUint64("stepUpThresholdUsd", policy.StepUpThresholdUSD)
	if err != nil {
		return nil, err
	}
	if perTx == 0 || daily == 0 || perTx > daily {
		return nil, fmt.Errorf("private policy caps are inconsistent")
	}

	recipients := make(map[common.Address]struct{}, len(policy.AllowedRecipients))
	for _, recipient := range policy.AllowedRecipients {
		if !common.IsHexAddress(recipient.Address) {
			return nil, fmt.Errorf("private policy recipient %q is not an address", recipient.Address)
		}
		recipients[common.HexToAddress(recipient.Address)] = struct{}{}
	}

	return &ParsedPolicy{
		Policy:          policy,
		PerTxCap:        perTx,
		DailyCap:        daily,
		StepUpThreshold: stepUp,
		recipients:      recipients,
	}, nil
}

func (p *ParsedPolicy) Allows(to common.Address) bool {
	_, ok := p.recipients[to]
	return ok
}

func parseUint64(name, raw string) (uint64, error) {
	v, ok := new(big.Int).SetString(raw, 10)
	if !ok || !v.IsUint64() {
		return 0, fmt.Errorf("private policy %s is not a uint64", name)
	}
	return v.Uint64(), nil
}

// PolicyDecrypter keeps the policy private key behind the FCC boundary. In a
// deployed extension, Open delegates to tee-node's loopback /decrypt service;
// only standalone tests use a process-local key.
type PolicyDecrypter interface {
	Open(context.Context, []byte, uint64, common.Address, uint64) ([]byte, error)
	PublicKey() string
}

type PolicyBox struct {
	private *ecies.PrivateKey
	public  []byte
}

// NewPolicyBox is the standalone-development implementation. It deliberately
// uses the same secp256k1 key for signing and ECIES decryption, matching
// tee-node's registered machine identity.
func NewPolicyBox(privateKey []byte) (*PolicyBox, error) {
	key, err := crypto.ToECDSA(privateKey)
	if err != nil {
		return nil, fmt.Errorf("policy key: %w", err)
	}
	return &PolicyBox{private: ecies.ImportECDSA(key), public: crypto.FromECDSAPub(&key.PublicKey)}, nil
}

func (b *PolicyBox) PublicKey() string {
	return base64.RawURLEncoding.EncodeToString(b.public)
}

func (b *PolicyBox) Open(
	_ context.Context,
	ciphertext []byte,
	chainID uint64,
	vault common.Address,
	policyVersion uint64,
) ([]byte, error) {
	if len(ciphertext) < 113+len(policyContext)+8+20+8+1 {
		return nil, fmt.Errorf("invalid encrypted policy envelope")
	}
	plaintext, err := b.private.Decrypt(ciphertext, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt private policy: %w", err)
	}
	return openPolicyPayload(plaintext, chainID, vault, policyVersion)
}

type teePolicyBox struct {
	url    string
	public []byte
	client *http.Client
}

func newTeePolicyBox(url string, publicKey []byte, client *http.Client) *teePolicyBox {
	return &teePolicyBox{url: url, public: append([]byte(nil), publicKey...), client: client}
}

func (b *teePolicyBox) PublicKey() string {
	return base64.RawURLEncoding.EncodeToString(b.public)
}

func (b *teePolicyBox) Open(
	ctx context.Context,
	ciphertext []byte,
	chainID uint64,
	vault common.Address,
	policyVersion uint64,
) ([]byte, error) {
	if len(ciphertext) < 113+len(policyContext)+8+20+8+1 {
		return nil, fmt.Errorf("invalid encrypted policy envelope")
	}
	body, err := json.Marshal(struct {
		EncryptedMessage []byte `json:"encryptedMessage"`
	}{EncryptedMessage: ciphertext})
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := b.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("FCC decrypt service: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("FCC decrypt service returned %s", response.Status)
	}
	var result struct {
		DecryptedMessage []byte `json:"decryptedMessage"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode FCC plaintext: %w", err)
	}
	return openPolicyPayload(result.DecryptedMessage, chainID, vault, policyVersion)
}

func policyBinding(chainID uint64, vault common.Address, policyVersion uint64) []byte {
	out := make([]byte, 0, len(policyContext)+8+20+8)
	out = append(out, []byte(policyContext)...)
	var word [8]byte
	binary.BigEndian.PutUint64(word[:], chainID)
	out = append(out, word[:]...)
	out = append(out, vault.Bytes()...)
	binary.BigEndian.PutUint64(word[:], policyVersion)
	out = append(out, word[:]...)
	return out
}

func openPolicyPayload(payload []byte, chainID uint64, vault common.Address, policyVersion uint64) ([]byte, error) {
	binding := policyBinding(chainID, vault, policyVersion)
	if len(payload) <= len(binding) || !bytes.Equal(payload[:len(binding)], binding) {
		return nil, fmt.Errorf("encrypted policy is bound to a different chain, vault, or version")
	}
	return payload[len(binding):], nil
}

func VerifyCommitment(plaintext []byte, commitment common.Hash) error {
	if crypto.Keccak256Hash(plaintext) != commitment {
		return fmt.Errorf("private policy commitment does not match decrypted policy")
	}
	return nil
}
