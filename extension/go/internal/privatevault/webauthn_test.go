package privatevault

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"testing"
)

func TestVerifyWebAuthnBindsChallengeOriginAndUserVerification(t *testing.T) {
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	spki, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	credential := &WebAuthnCredential{
		CredentialID:  "credential-one",
		PublicKeySPKI: base64.RawURLEncoding.EncodeToString(spki),
		RPID:          "vault.example",
		Origins:       []string{"https://vault.example"},
	}
	challenge := sha256.Sum256([]byte("exact covenant authorization"))
	proof := signedProof(t, privateKey, credential, challenge, "https://vault.example")
	encoded, _ := json.Marshal(proof)
	if err := VerifyWebAuthn(credential, encoded, challenge); err != nil {
		t.Fatalf("valid proof refused: %v", err)
	}

	wrongChallenge := sha256.Sum256([]byte("different authorization"))
	if err := VerifyWebAuthn(credential, encoded, wrongChallenge); err == nil {
		t.Fatal("proof was accepted for another challenge")
	}
	wrongOrigin := signedProof(t, privateKey, credential, challenge, "https://phishing.example")
	wrongOriginJSON, _ := json.Marshal(wrongOrigin)
	if err := VerifyWebAuthn(credential, wrongOriginJSON, challenge); err == nil {
		t.Fatal("proof was accepted for another origin")
	}
}

func signedProof(
	t *testing.T,
	privateKey *ecdsa.PrivateKey,
	credential *WebAuthnCredential,
	challenge [32]byte,
	origin string,
) StepUpProof {
	t.Helper()
	clientJSON, _ := json.Marshal(clientData{
		Type:      "webauthn.get",
		Challenge: base64.RawURLEncoding.EncodeToString(challenge[:]),
		Origin:    origin,
	})
	rpHash := sha256.Sum256([]byte(credential.RPID))
	authData := make([]byte, 37)
	copy(authData, rpHash[:])
	authData[32] = 0x05 // user present + user verified
	clientHash := sha256.Sum256(clientJSON)
	signed := append(append([]byte{}, authData...), clientHash[:]...)
	digest := sha256.Sum256(signed)
	signature, err := ecdsa.SignASN1(rand.Reader, privateKey, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	return StepUpProof{
		CredentialID:      credential.CredentialID,
		AuthenticatorData: base64.RawURLEncoding.EncodeToString(authData),
		ClientDataJSON:    base64.RawURLEncoding.EncodeToString(clientJSON),
		Signature:         base64.RawURLEncoding.EncodeToString(signature),
	}
}
