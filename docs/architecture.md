# Private-vault architecture

## Components and authority

| Component | May do | May not do |
| --- | --- | --- |
| Owner wallet | Create vaults, request actions, submit authorized execution, schedule changes/recovery | Move FXRP without FCC authorization (except delayed full recovery to committed XRP) |
| Guardian | Lock, cancel policy proposal, cancel recovery, confirm delayed unlock | Spend, redirect XRP, decrypt policy |
| FCC extension | Decrypt/evaluate policy and sign a compliant exact action | Submit the owner-only vault transaction or rewrite on-chain state |
| Vault | Enforce public invariants, registry, price epoch, signature, nonce, timelock, payout | Learn or classify the encrypted rules |
| FAssets/FDC | Move value between XRPL and Flare with payment proofs | Override vault authorization |

## Policy envelope v1

```text
bytes 0..64   ephemeral uncompressed secp256k1 public key
bytes 65..80  AES-128-CTR IV
bytes 81..n   encrypted bound plaintext
last 32 bytes HMAC-SHA256 tag
```

This is go-ethereum ECIES, accepted directly by tee-node's loopback `/decrypt`
endpoint. The encrypted plaintext begins with the UTF-8 domain
`COVENANT_POLICY_V1`, followed by big-endian uint64 chain ID, the 20-byte vault
address, and big-endian uint64 policy version. The extension validates that
binding before parsing the policy.

The committed plaintext is deterministic JSON. Recipients are normalized to
lowercase and sorted, integer values are canonical decimal strings, and origins
are sorted.

## FCC authorization

`keccak256(abi.encode(...))` over:

```text
"COVENANT_PRIVATE_VAULT_V1"
chainId
vault
operation: SPEND | WITHDRAW | REDEEM
EVM recipient
keccak256(XRPL payout) for redemption
FXRP amount
USD amount (8 decimals)
FTSO timestamp
vault nonce
policy version
deadline
```

The ABI preimage is sent to tee-node's loopback sign endpoint. tee-node applies
keccak256 and the EIP-191 32-byte message prefix before signing with its machine
key. Solidity performs the same EIP-191 recovery and checks the result against
both the vault's assigned TEE, the registry's exact `Production` status, and
the Covenant FCC extension ID immutable in the factory and every vault.
The engine derives the daily-budget bucket, deadline, and price-age check from
the latest Flare block timestamp, matching the clock Solidity enforces.

## Step-up challenge

WebAuthn challenge is `keccak256(abi.encode(...))` over
`COVENANT_STEP_UP_V1`, chain, vault, operation, recipient, amount, nonce, and
policy version. FCC verifies credential ID, ceremony type, challenge, origin,
RP ID hash, user-presence and user-verification flags, P-256 SPKI key, and ASN.1
signature.

## State transitions

- Policy version 0: vault exists but cannot be funded through `deposit` or
  authorize value movement. Initial policy remains possible even if an
  unsolicited FAssets direct mint reached the deterministic vault address.
- Active: normal FCC-authorized movement is available.
- Locked: all normal movement is disabled. Owner may schedule unlock; guardian
  confirms after delay. Owner or guardian may schedule recovery.
- Recovery executable: anyone can trigger the already-constrained full
  redemption after the delay; payout remains the committed XRPL address.

Policy, TEE, guardian, and XRPL payout changes all use the vault's 1–30 day
timelock. A new TEE is registry-checked both when proposed and when applied.
