package privatevault

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/crypto/ecies"
)

func TestPolicyEnvelopeRoundTripAndCommitment(t *testing.T) {
	receiver, err := crypto.GenerateKey()
	if err != nil {
		t.Fatal(err)
	}
	box, err := NewPolicyBox(crypto.FromECDSA(receiver))
	if err != nil {
		t.Fatal(err)
	}
	publicBytes, err := base64.RawURLEncoding.DecodeString(box.PublicKey())
	if err != nil {
		t.Fatal(err)
	}

	plaintext := []byte(`{"version":1,"name":"Operations","perTxCapUsd":"5000000000","dailyCapUsd":"10000000000","stepUpThresholdUsd":"2500000000","allowedRecipients":[{"address":"0x00000000000000000000000000000000000000b0","label":"Merchant"}]}`)
	vault := common.HexToAddress("0x000000000000000000000000000000000000c0de")
	ciphertext := sealForTest(t, publicBytes, plaintext, 114, vault, 1)

	opened, err := box.Open(context.Background(), ciphertext, 114, vault, 1)
	if err != nil {
		t.Fatal(err)
	}
	if string(opened) != string(plaintext) {
		t.Fatalf("plaintext mismatch")
	}
	if err := VerifyCommitment(opened, crypto.Keccak256Hash(plaintext)); err != nil {
		t.Fatal(err)
	}
	policy, err := ParsePolicy(opened)
	if err != nil {
		t.Fatal(err)
	}
	if !policy.Allows(common.HexToAddress("0x00000000000000000000000000000000000000B0")) {
		t.Fatal("expected recipient to be allowed")
	}
}

func TestPolicyEnvelopeIsBoundToVaultAndVersion(t *testing.T) {
	receiver, _ := crypto.GenerateKey()
	box, _ := NewPolicyBox(crypto.FromECDSA(receiver))
	publicBytes, _ := base64.RawURLEncoding.DecodeString(box.PublicKey())
	vault := common.HexToAddress("0x000000000000000000000000000000000000c0de")
	ciphertext := sealForTest(t, publicBytes, []byte("secret"), 114, vault, 1)

	if _, err := box.Open(context.Background(), ciphertext, 114, common.HexToAddress("0x000000000000000000000000000000000000bad0"), 1); err == nil {
		t.Fatal("ciphertext opened for another vault")
	}
	if _, err := box.Open(context.Background(), ciphertext, 114, vault, 2); err == nil {
		t.Fatal("ciphertext opened for another policy version")
	}
}

// Produced by packages/sdk/src/private-policy.ts. This fails if the browser
// and tee-node/go-ethereum ever disagree on the ECIES wire format.
func TestTypeScriptEciesFixtureDecryptsInGo(t *testing.T) {
	privateKey := make([]byte, 32)
	privateKey[31] = 1
	box, err := NewPolicyBox(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	const raw = "0x04935090b6e6afbdcdf69e5040cd771c2b121b353f353e73709b7833669e0431110fe4d82989214c844c4f82d4d8acd419dfb4c1bec6fba425ed6cdc0aa67b45ed2864ac9ef498d26bd2acb18bef535999e63b8165ae12f51b62543337ae39f1818a1e36c90256eabd9fdf78e3b7331248fcc0a207d11e1274b8cbf3370bbf039002b7dde05abb5e3912f9248c236ecd707685cb68d1d3cb008ce00a3bce61f480fc641ecef35d7b4847d6e6949dabaf8bdf5256dc9a94163c034b03f33137a8110f2b5a915bae0b8be37267442113850a0ebf8ea373725c3eb3570334151e6a2ad5896f6bcafb08419c3be7b8ee8081e2d783aa1b34d6264630bac5c987a405e57c060d2ff93bfeff7f4fd5559eea3f7cea8ea29eaf235047378996867033b7d969da146ca313f537a7fd0f7921aaee1d7f19586e788d51dcfc078a0c4b0fffa8772b50d983744b5d515c395fa0cd118ae3212d5a08"
	ciphertext, err := hex.DecodeString(strings.TrimPrefix(raw, "0x"))
	if err != nil {
		t.Fatal(err)
	}
	vault := common.HexToAddress("0x000000000000000000000000000000000000c0de")
	plaintext, err := box.Open(context.Background(), ciphertext, 114, vault, 1)
	if err != nil {
		t.Fatal(err)
	}
	const expected = `{"version":1,"name":"Fixture","perTxCapUsd":"100","dailyCapUsd":"200","stepUpThresholdUsd":"50","allowedRecipients":[{"address":"0x00000000000000000000000000000000000000b0"}]}`
	if string(plaintext) != expected {
		t.Fatalf("plaintext mismatch: %s", plaintext)
	}
	if crypto.Keccak256Hash(plaintext).Hex() != "0xcf0a84df01290d356dd336b31d73b5be0c36ae1f6a0458df372ead49b4fb8883" {
		t.Fatal("TypeScript commitment mismatch")
	}
}

func TestTeePolicyBoxUsesLoopbackDecryptService(t *testing.T) {
	receiver, _ := crypto.GenerateKey()
	publicKey := crypto.FromECDSAPub(&receiver.PublicKey)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			EncryptedMessage []byte `json:"encryptedMessage"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			return
		}
		plaintext, err := ecies.ImportECDSA(receiver).Decrypt(request.EncryptedMessage, nil, nil)
		if err != nil {
			t.Error(err)
			return
		}
		_ = json.NewEncoder(w).Encode(struct {
			DecryptedMessage []byte `json:"decryptedMessage"`
		}{DecryptedMessage: plaintext})
	}))
	defer server.Close()

	vault := common.HexToAddress("0x000000000000000000000000000000000000c0de")
	ciphertext := sealForTest(t, publicKey, []byte("secret"), 114, vault, 3)
	box := newTeePolicyBox(server.URL, publicKey, server.Client())
	plaintext, err := box.Open(context.Background(), ciphertext, 114, vault, 3)
	if err != nil {
		t.Fatal(err)
	}
	if string(plaintext) != "secret" {
		t.Fatalf("plaintext = %q", plaintext)
	}
}

func sealForTest(t *testing.T, receiverPublic, plaintext []byte, chainID uint64, vault common.Address, version uint64) []byte {
	t.Helper()
	peer, err := crypto.UnmarshalPubkey(receiverPublic)
	if err != nil {
		t.Fatal(err)
	}
	payload := append(policyBinding(chainID, vault, version), plaintext...)
	ciphertext, err := ecies.Encrypt(rand.Reader, ecies.ImportECDSAPublic(peer), payload, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	return ciphertext
}
