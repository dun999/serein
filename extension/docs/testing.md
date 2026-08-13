# Testing

## Automated suites

```bash
# FCC instruction sender
forge test

# Confidential policy engine and wire-format fixtures
cd go && go test ./... && go vet ./...

# Registration, proxy, and deployment tooling
cd ../tools && go test ./... && go vet ./...
```

The root `pnpm verify` runs these together with the vault contracts, SDK, and
web checks.

Important coverage includes:

- owner authentication and routing to the vault's exact TEE;
- Go/Solidity authorization digest parity;
- TypeScript ECIES ciphertext decrypted by Go;
- policy commitment, chain/vault/version binding, and malformed input refusal;
- independent Flare state and FTSOv2 reads;
- WebAuthn challenge, RP ID, origin, UV flag, and P-256 signature validation;
- loopback tee-node signing and decryption clients;
- registration and governance configuration checks.

## Live test

`scripts/test.sh` submits a real `AUTHORIZE_SPEND` instruction and checks the
FCC result. It requires `INSTRUCTION_SENDER`, `VAULT_ADDRESS`, and
`TEST_RECIPIENT`; the recipient must already be allowed by the encrypted policy.
It intentionally does not submit the final vault execution transaction.
