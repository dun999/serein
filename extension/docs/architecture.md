# Covenant FCC architecture

## Components

| Component | Responsibility |
| --- | --- |
| `contracts/InstructionSender.sol` | Authenticates the vault owner and sends typed FCC instructions to the vault's assigned TEE |
| `go/internal/extension` | Decodes FCC action envelopes and dispatches Covenant commands |
| `go/internal/privatevault` | Reads Flare state, decrypts and evaluates policy, verifies WebAuthn, and produces authorization data |
| tee-node | Owns the registered machine key and exposes loopback-only signing/decryption |
| tee-proxy | Relays instructions and signed results between Flare and the workload |
| `CovenantVault` | Rechecks TEE identity, policy version, nonce, amount, price epoch, and deadline before value moves |

## Authorization flow

```text
owner wallet
  -> CovenantInstructionSender
  -> TeeExtensionRegistry
  -> exact vault TEE
  -> decrypt policy + read vault/FTSOv2 + verify passkey
  -> tee-node signs exact action
  -> owner submits authorization to CovenantVault
  -> vault independently rechecks and moves/redeems FXRP
```

The browser supplies intent, never authoritative price, nonce, budget state, or
policy interpretation. The TEE re-reads those values from Flare. The final
transaction still requires the owner, so an FCC response alone cannot spend.

Administrative calls use a separate signed domain. Policy replacement, TEE
rotation, guardian changes, XRPL payout changes, and vault destruction always
verify the WebAuthn credential from the currently active encrypted policy. FCC
signs the exact action and payload hash; `CovenantVault` rejects a raw
owner-only call. Policy and configuration changes retain their on-chain
timelock after this authentication step. Destruction is terminal and transfers
the full FXRP balance only to the vault owner.

Policy plaintext is bound to chain ID, vault address, and policy version before
ECIES encryption. Authorization digests bind the same domain plus operation,
destination, amount, USD value, FTSO timestamp, nonce, and deadline. Exact wire
formats are documented in [../../docs/architecture.md](../../docs/architecture.md).
