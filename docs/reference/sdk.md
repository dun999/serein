# Covenant SDK

`@covenant/sdk` is the TypeScript library the Serein app is built on. Everything the website can do, the SDK can do — the site has no private endpoint of its own.

It lives in [`packages/sdk`](https://github.com/dun999/serein/tree/main/packages/sdk).

## What it handles

- Creating vaults and reading their state.
- Encrypting rules and building the fingerprint the vault stores.
- Requesting authorization through the on-chain instruction sender, then waiting for the answer.
- Building WebAuthn passkey challenges and packaging the proofs.
- Executing payments, withdrawals, redemptions, and vault closure.
- Lock, unlock, recovery, and the timelocked changes.
- Reading FAssets direct-mint settings and building the memo.

## Setting it up

```ts
import { PrivateVaultClient } from "@covenant/sdk";

const client = new PrivateVaultClient({
  publicClient,           // viem PublicClient on Coston2
  walletClient,           // viem WalletClient
  factory: VAULT_FACTORY_ADDRESS,
  instructionSender: INSTRUCTION_SENDER_ADDRESS,
  proxyUrl: FCC_PROXY_URL,
});
```

## A payment

Authorization and execution are separate calls, so you can show the user what was approved before spending it:

```ts
const authorization = await client.authorizeSpend({
  vault,
  to: recipient,
  amount: parseFxrp("1.5"),
  passkey,                // only when above the step-up threshold
});

const hash = await client.executeSpend({ vault, to: recipient, amount, authorization });
```

`authorizeSpend` sends the on-chain request and waits for the signed answer. `executeSpend` submits it. Between them you hold a permission slip valid for five minutes.

## Reading state

```ts
const state = await client.getState(vault);
// status, balance, nonce, policyVersion, owner, guardian, tee,
// xrplPayout, timelockSeconds, recoveryAt, unlockAt
```

`recoveryAt` and `unlockAt` are Unix seconds, or `0` when nothing is pending — use them to gate the recovery and unlock controls.

## Money out

```ts
await client.withdraw({ vault, amount, passkey });     // to the owner wallet
await client.redeemToXrp({ vault, amount, passkey });  // to the saved XRPL address
await client.destroyVault({ vault, passkey });         // close, return everything
```

Each has `authorize*` and `execute*` halves if you want the two-step flow.

## Lock and recovery

```ts
await client.lock(vault);
await client.scheduleUnlock(vault);
await client.confirmUnlock(vault);      // after the timelock

await client.scheduleRecovery(vault);
await client.cancelRecovery(vault);
await client.executeRecovery(vault);    // after the timelock
```

## Handling errors

Three error types, and they mean different things:

```ts
import { PolicyViolation, FccInfrastructureError, CovenantError } from "@covenant/sdk";
```

- **`PolicyViolation`** — the system worked and said no. `reason` explains which rule. Show it; do not retry unchanged.
- **`FccInfrastructureError`** — the request was accepted on-chain but no decision came back. Carries `instructionTransaction` as evidence. Safe to retry.
- **`CovenantError`** — everything else.

The distinction matters: a refusal is not an outage, and telling users to retry a refusal just wastes their gas.

## Building

```bash
pnpm --filter @covenant/sdk build
pnpm --filter @covenant/sdk test
```
