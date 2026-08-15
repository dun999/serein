# Covenant SDK

`@covenant/sdk` is the library that knows how to talk to a Serein vault. The website is built on it, and it is published on its own so the website is not the only thing that can drive a vault.

Its job, in one line: **author, authorize and settle policy-governed payments from a native XRPL account.**

## Why it ships separately

Serein has no private back end. There is no server holding a key, deciding what is allowed, or keeping a list of your vaults. Every action the website performs — creating a vault, encrypting rules, asking the checker for permission, executing the payment — is a call this library makes against the blockchain and the confidential checker.

That has a consequence worth stating plainly: anything the website can do, you can do. If the site disappeared tomorrow your vault is still reachable, because the SDK is the same door the site uses. Nothing is held back behind an endpoint only Serein can call.

It also makes the library the honest description of the system. To know what really happens when money leaves a vault, reading the SDK beats reading any diagram.

## What it covers

Four jobs.

**Vaults.** Create one, list the vaults an address owns, and read live state — balance, status, nonce, guardian, the saved XRPL payout address, and any pending timelock.

**Rules.** Turn limits into a policy, encrypt it, and produce the fingerprint the vault stores on-chain. Rules never travel in the clear, so this happens in the library rather than on a server.

**Permission.** Send an authorization request through the on-chain instruction sender and wait for the checker's signed answer. Where the rules demand a fingerprint or face, build the WebAuthn challenge and package the proof.

**Settlement.** Execute payments, withdrawals, FXRP-to-XRP redemptions, and closure. Lock, unlock, and recovery live here too.

Authorization and settlement are deliberately separate calls. Between them you hold a permission slip, which is what lets an interface show someone exactly what was approved before anything is spent.

## Two halves in one library

The name causes confusion, so it is worth being precise. `@covenant/sdk` contains two kinds of code.

One half wraps what Flare already publishes. Flare-owned addresses — FXRP, the FAssets manager, the price feed — are resolved from Flare's on-chain contract registry rather than hard-coded, so a Flare-side redeploy needs no release here.

The other half has no upstream equivalent. Flare publishes no TypeScript SDK for Confidential Compute, so the confidential checker, the encrypted policy, and the passkey layers are Serein's own.

Both ship together. When these docs say "Flare SDK" they mean `@flarenetwork/flare-tx-sdk`, Flare's own package, which `@covenant/sdk` depends on — one of four runtime dependencies alongside `viem` and the two `@noble` cryptography packages. The dependency runs one way: Covenant builds on Flare's, never the reverse.

## Getting it

The library has its own repository: [dun999/covenant-sdk](https://github.com/dun999/covenant-sdk).

It is not on the public npm registry yet, so install it from the repository rather than with `npm install @covenant/sdk`. It ships as ES modules with TypeScript types included.

One quirk to expect: several internal package and contract names still say `Covenant`, this project's earlier name. They refer to the same system described throughout these docs.

## Next

Flare SDK has the working code — client setup, a payment end to end, reading state, moving money out, lock and recovery, and the three error types.

That error distinction is the part most worth reading before building anything. A refusal from the checker is not an outage. Treating it like one means telling people to retry something that will be refused again, at their own expense.
