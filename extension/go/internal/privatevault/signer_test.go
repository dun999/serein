package privatevault

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
)

func TestTeeSignClientUsesTheRegisteredMachineSignature(t *testing.T) {
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			Message []byte `json:"message"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		digest := crypto.Keccak256(request.Message)
		signature, signErr := crypto.Sign(accounts.TextHash(digest), key)
		if signErr != nil {
			t.Error(signErr)
			return
		}
		_ = json.NewEncoder(w).Encode(struct {
			Message   []byte `json:"message"`
			Signature []byte `json:"signature"`
		}{request.Message, signature})
	}))
	defer server.Close()

	client := newTeeSignClient(server.URL, server.Client())
	preimage := make([]byte, 320)
	_, _ = rand.Read(preimage)
	signature, address, err := client.Sign(context.Background(), preimage)
	if err != nil {
		t.Fatal(err)
	}
	if address != crypto.PubkeyToAddress(key.PublicKey) {
		t.Fatalf("wrong machine: %s", address)
	}
	digest := crypto.Keccak256(preimage)
	recovered, err := crypto.SigToPub(accounts.TextHash(digest), signature)
	if err != nil || crypto.PubkeyToAddress(*recovered) != address {
		t.Fatal("signature did not verify as the registered machine")
	}
}
