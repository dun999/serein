# Covenant SDK

The Covenant SDK is the TypeScript library that knows how to talk to a Serein vault. It is what the Serein website is built on, and it is published on its own so that the website is not the only thing that can drive a vault.

Its one-line job: **author, authorize and settle policy-governed payments from a native XRPL account.**

## Why it exists separately

Serein has no private back end. There is no server that holds a key, decides what is allowed, or keeps a list of your vaults. Every action the website performs — creating a vault, encrypting your rules, asking the checker for permission, executing the payment — is a call this library makes against the blockchain and the confidential checker.

That has a consequence worth stating plainly: anything the website can do, you can do. If the site went away tomorrow, your vault is still reachable, because the SDK is the same door the site uses. Nothing is held back behind an endpoint only Serein can call.

It also means the library is the honest description of the system. If you want to know what really happens when money leaves a vault, reading the SDK is more reliable than reading a diagram.

## What it does

It covers four jobs.

**Vaults.** Create one, list the ones an address owns, and read a vault's live state — balance, status, nonce, the guardian, the saved XRPL payout address, and any pending timelock.

**Rules.** Turn your limits into a policy, encrypt it, and produce the fingerprint the vault stores on-chain. The rules never travel in the clear, so this step happens in the library rather than on a server.

**Permission.** Send an authorization request through the on-chain instruction sender and wait for the checker's signed answer. Where your rules demand a fingerprint or face, it also builds the WebAuthn passkey challenge and packages the proof.

**Settlement.** Execute payments, withdrawals, FXRP-to-XRP redemptions, and vault closure. Lock, unlock, and recovery live here too, including the timelocked variants.

Authorization and settlement are deliberately separate calls. Between them you are holding a permission slip, which is what lets an interface show a user exactly what was approved before anything is spent.

## Covenant SDK and Flare SDK are not the same thing

These two names appear close together in this documentation and they are easy to confuse.

| | What it is | Who publishes it |
| --- | --- | --- |
| **Flare SDK** (`@flarenetwork/flare-tx-sdk`) | Flare's official library. Serein treats it as the source of truth for every Flare-owned address — FXRP, the FAssets manager, the price feed — resolving them from Flare's on-chain contract registry rather than hard-coding them. | Flare |
| **Covenant SDK** (`@covenant/sdk`) | Serein's own library, described on this page. It handles vaults, encrypted rules, passkeys, and the confidential checker. | Serein |

The relationship is one-directional: the Covenant SDK depends on the Flare SDK. It is one of four runtime dependencies, alongside `viem` and the `@noble` cryptography packages.

Because Flare addresses are resolved through Flare's own registry at call time, a Flare-side redeploy of those services does not require a new release here. See [What we use from Flare](../concepts/what-we-use-from-flare.md) for what each Flare system actually does.

## Getting it

The library lives in its own repository: [dun999/covenant-sdk](https://github.com/dun999/covenant-sdk).

It is not on the public npm registry yet, so install it from the repository rather than with `npm install @covenant/sdk`. It ships as ES modules with TypeScript types included.

One naming quirk to expect: several internal package and contract names still say `Covenant`, which was this project's earlier name. They refer to the same system described throughout these docs.

## Next

The [SDK reference](sdk.md) has the working code — client setup, a payment end to end, reading state, moving money out, lock and recovery, and the three error types and what each one means.

That error distinction is the part most worth reading before you build anything. A refusal from the checker is not an outage, and treating it like one means telling users to retry something that will be refused again, at their expense.
