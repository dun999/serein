# Covenant FCC extension

This directory is the confidential-compute half of Covenant. It is a Go-only
extension derived from Flare's official FCC scaffold and implements three
commands:

| OP type | OP command | Request |
| --- | --- | --- |
| `COVENANT` | `AUTHORIZE_SPEND` | vault, recipient, amount, passkey proof |
| `COVENANT` | `AUTHORIZE_WITHDRAW` | vault, amount, passkey proof |
| `COVENANT` | `AUTHORIZE_REDEEM` | vault, amount, passkey proof |

`contracts/InstructionSender.sol` authenticates the vault owner and routes the
request to the exact TEE assigned to that vault. The engine in
`go/internal/privatevault` independently reads the vault and FTSOv2, decrypts
the bound policy through tee-node's loopback `/decrypt` endpoint, verifies
WebAuthn when required, and signs the exact authorization through `/sign`.

No application policy key is supplied to the container. Both decryption and
authorization use the registered TEE machine identity. `ENCLAVE_KEY_HEX` exists
only for the standalone development entry point; the FCC image requires
`TEE_SIGN_URL`.

## Verify

```bash
forge test
cd go && go test ./... && go vet ./...
cd ../tools && go test ./... && go vet ./...
```

## Deploy to Coston2

```bash
cp .env.example .env
./scripts/pre-build.sh
./scripts/start-services.sh --chain coston2 --tunnel
./scripts/post-build.sh
```

Then deploy the root `CovenantVaultFactory` with the resulting extension ID and
registered TEE machine. See [docs/deployment-steps.md](docs/deployment-steps.md).
