package privatevault

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// AuthorizationSigner signs the ABI preimage with the registered FCC machine
// identity. Sign receives the preimage—not its hash—because tee-node's /sign
// endpoint applies keccak256 and the EIP-191 prefix itself.
type AuthorizationSigner interface {
	Address(context.Context) (common.Address, error)
	PublicKey(context.Context) (*ecdsa.PublicKey, error)
	Sign(context.Context, []byte) ([]byte, common.Address, error)
}

type localSigner struct {
	key     *ecdsa.PrivateKey
	address common.Address
}

func newLocalSigner(keyBytes []byte) (*localSigner, error) {
	key, err := crypto.ToECDSA(keyBytes)
	if err != nil {
		return nil, err
	}
	return &localSigner{key: key, address: crypto.PubkeyToAddress(key.PublicKey)}, nil
}

func (s *localSigner) Address(context.Context) (common.Address, error) { return s.address, nil }

func (s *localSigner) PublicKey(context.Context) (*ecdsa.PublicKey, error) {
	return &s.key.PublicKey, nil
}

func (s *localSigner) Sign(_ context.Context, preimage []byte) ([]byte, common.Address, error) {
	digest := crypto.Keccak256(preimage)
	signature, err := crypto.Sign(accounts.TextHash(digest), s.key)
	return signature, s.address, err
}

type teeSignClient struct {
	url    string
	client *http.Client
}

func newTeeSignClient(url string, client *http.Client) *teeSignClient {
	return &teeSignClient{url: url, client: client}
}

func (s *teeSignClient) Address(ctx context.Context) (common.Address, error) {
	publicKey, err := s.PublicKey(ctx)
	if err != nil {
		return common.Address{}, err
	}
	return crypto.PubkeyToAddress(*publicKey), nil
}

func (s *teeSignClient) PublicKey(ctx context.Context) (*ecdsa.PublicKey, error) {
	var lastErr error
	for {
		preimage := []byte("COVENANT_TEE_IDENTITY_V1")
		signature, _, err := s.Sign(ctx, preimage)
		if err == nil {
			digest := crypto.Keccak256(preimage)
			publicKey, recoverErr := crypto.SigToPub(accounts.TextHash(digest), signature)
			if recoverErr == nil {
				return publicKey, nil
			}
			err = recoverErr
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("%w: %v", ctx.Err(), lastErr)
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func (s *teeSignClient) Sign(ctx context.Context, preimage []byte) ([]byte, common.Address, error) {
	body, err := json.Marshal(struct {
		Message []byte `json:"message"`
	}{Message: preimage})
	if err != nil {
		return nil, common.Address{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return nil, common.Address{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	response, err := s.client.Do(req)
	if err != nil {
		return nil, common.Address{}, fmt.Errorf("FCC sign service: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, common.Address{}, fmt.Errorf("FCC sign service returned %s", response.Status)
	}
	var result struct {
		Message   []byte `json:"message"`
		Signature []byte `json:"signature"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, common.Address{}, fmt.Errorf("decode FCC signature: %w", err)
	}
	if !bytes.Equal(result.Message, preimage) || len(result.Signature) != 65 {
		return nil, common.Address{}, fmt.Errorf("FCC sign service returned a malformed response")
	}
	digest := crypto.Keccak256(preimage)
	publicKey, err := crypto.SigToPub(accounts.TextHash(digest), result.Signature)
	if err != nil {
		return nil, common.Address{}, fmt.Errorf("recover FCC signer: %w", err)
	}
	return result.Signature, crypto.PubkeyToAddress(*publicKey), nil
}
