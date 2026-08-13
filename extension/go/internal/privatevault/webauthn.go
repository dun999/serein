package privatevault

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
)

type StepUpProof struct {
	CredentialID      string `json:"credentialId"`
	AuthenticatorData string `json:"authenticatorData"`
	ClientDataJSON    string `json:"clientDataJSON"`
	Signature         string `json:"signature"`
}

type clientData struct {
	Type      string `json:"type"`
	Challenge string `json:"challenge"`
	Origin    string `json:"origin"`
}

func VerifyWebAuthn(credential *WebAuthnCredential, proofJSON []byte, challenge [32]byte) error {
	if credential == nil {
		return fmt.Errorf("step-up is required but no passkey is enrolled")
	}
	var proof StepUpProof
	dec := json.NewDecoder(bytes.NewReader(proofJSON))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&proof); err != nil {
		return fmt.Errorf("decode passkey proof: %w", err)
	}
	if proof.CredentialID != credential.CredentialID {
		return fmt.Errorf("passkey credential does not match policy")
	}
	authData, err := base64.RawURLEncoding.DecodeString(proof.AuthenticatorData)
	if err != nil || len(authData) < 37 {
		return fmt.Errorf("invalid passkey authenticator data")
	}
	clientJSON, err := base64.RawURLEncoding.DecodeString(proof.ClientDataJSON)
	if err != nil {
		return fmt.Errorf("invalid passkey client data")
	}
	var client clientData
	if err := json.Unmarshal(clientJSON, &client); err != nil {
		return fmt.Errorf("decode passkey client data: %w", err)
	}
	if client.Type != "webauthn.get" {
		return fmt.Errorf("passkey response has wrong ceremony type")
	}
	expectedChallenge := base64.RawURLEncoding.EncodeToString(challenge[:])
	if client.Challenge != expectedChallenge {
		return fmt.Errorf("passkey challenge is for a different request")
	}
	if !contains(credential.Origins, client.Origin) {
		return fmt.Errorf("passkey origin is not allowed")
	}
	rpHash := sha256.Sum256([]byte(credential.RPID))
	if !bytes.Equal(authData[:32], rpHash[:]) {
		return fmt.Errorf("passkey relying party does not match policy")
	}
	flags := authData[32]
	if flags&0x01 == 0 || flags&0x04 == 0 {
		return fmt.Errorf("passkey did not prove user presence and verification")
	}

	spki, err := base64.RawURLEncoding.DecodeString(credential.PublicKeySPKI)
	if err != nil {
		return fmt.Errorf("invalid passkey public key")
	}
	parsed, err := x509.ParsePKIXPublicKey(spki)
	if err != nil {
		return fmt.Errorf("parse passkey public key: %w", err)
	}
	publicKey, ok := parsed.(*ecdsa.PublicKey)
	if !ok {
		return fmt.Errorf("passkey public key is not ECDSA")
	}
	signature, err := base64.RawURLEncoding.DecodeString(proof.Signature)
	if err != nil {
		return fmt.Errorf("invalid passkey signature")
	}
	clientHash := sha256.Sum256(clientJSON)
	signed := append(append([]byte{}, authData...), clientHash[:]...)
	digest := sha256.Sum256(signed)
	if !ecdsa.VerifyASN1(publicKey, digest[:], signature) {
		return fmt.Errorf("passkey signature is invalid")
	}
	return nil
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}
