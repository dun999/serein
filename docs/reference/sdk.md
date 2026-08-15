# Flare SDK

Serein is built on Flare's own published packages. Anything Flare defines — protocol ABIs and the addresses of Flare-owned contracts — comes from Flare directly, so a Flare-side redeploy does not need a release here.

Flare has no TypeScript SDK for Confidential Compute, so the FCC, policy, and passkey layers are Serein's own. Both halves ship in one library, @covenant/sdk, and are described below.

### What comes from Flare

| Package                                            | Role                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@flarenetwork/flare-tx-sdk`                       | Runtime dependency. The trust anchor: `Network`, `Constants`, registry resolution (`getFlareContracts`), and on-chain reads (`invokeContractCallOnC`).                          |
| `@flarenetwork/flare-periphery-contract-artifacts` | DevDependency. Source of Flare's ABIs, compiled into `as const` literals at build time so viem keeps full type inference and neither ethers nor wagmi ever reaches the browser. |

Regenerate the ABI literals after a Flare release:

```bash
pnpm --filter @covenant/sdk gen:abi
```

### Addresses resolve from Flare

`FlareContractRegistry` lives at the same address on every Flare network, which makes it the one constant everything else hangs off:

```ts
import {
  createFlareNetwork,
  resolveFlareContracts,
  readXrpUsdPrice,
  FLARE_CONTRACT_REGISTRY_ADDRESS,
  type Network,
} from "@covenant/sdk";

const network = createFlareNetwork();                // shared Coston2 Network, or bind a custom RPC
const { ftsoV2, assetManager, fxrp } = await resolveFlareContracts(network);
const { priceUsd, timestamp } = await readXrpUsdPrice(network);
```

`createFlareNetwork(rpcUrl?)` returns the SDK's shared `Network.COSTON2` singleton, or a new `Network` bound to a custom RPC endpoint. `resolveFlareContracts` reads `FtsoV2` and `AssetManagerFXRP` by name from the registry; FXRP is taken from `assetManager.fAsset()` rather than the registry — the FAsset token is not registered under its own name, and deriving it guarantees the token matches the asset manager being called. `readXrpUsdPrice` reads the XRP/USD feed straight from the resolved FTSOv2 contract.

The app seeds its first render from the deployment manifest so nothing waits on an RPC round trip, then upgrades to the resolved addresses. If the registry is unreachable the manifest stays in use, and /api/status reports any divergence as a flareRegistry failure.

Addresses Flare does not publish — the vault factory, the instruction sender, and the TEE machine registry — stay in the manifest. See [Contracts and addresses](contracts).

### What stays Serein's own

Flare's packages contain no TEE or Confidential Compute contracts, so these have no upstream equivalent:

* Requesting authorization through the on-chain instruction sender and waiting for the answer.
* Encrypting rules and building the fingerprint the vault stores.
* Building WebAuthn passkey challenges and packaging the proofs.
* Creating vaults, reading their state, and executing payments, withdrawals, redemptions, and closure.
* Lock, unlock, recovery, and the timelocked changes.

### Setting it up

The FCC client owns the instruction round trip; the vault client owns everything else:

```ts
import { FccClient, PrivateVaultClient, createFlareNetwork, resolveFlareContracts } from "@covenant/sdk";

const network = createFlareNetwork();
const { assetManager, fxrp } = await resolveFlareContracts(network);

const fcc = new FccClient({
  instructionSender: INSTRUCTION_SENDER_ADDRESS,
  proxyUrl: FCC_PROXY_URL,
  publicClient,           // viem PublicClient on Coston2
  walletClient,           // viem WalletClient
});

const client = new PrivateVaultClient({
  factory: VAULT_FACTORY_ADDRESS,
  assetManager,           // from resolveFlareContracts
  fxrp,                   // from resolveFlareContracts
  publicClient,
  walletClient,
  fcc,
});
```

### A payment

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

authorizeSpend sends the on-chain request and waits for the signed answer. executeSpend submits it. Between them you hold a permission slip valid for five minutes. spend() does both in one call.

### Reading state

```ts
const state = await client.getState(vault);
// status, balance, nonce, policyVersion, owner, guardian, tee,
// xrplPayout, timelockSeconds, recoveryAt, unlockAt
```

recoveryAt and unlockAt are Unix seconds, or 0 when nothing is pending — use them to gate the recovery and unlock controls.

### Money out

```ts
await client.withdraw({ vault, amount, passkey });     // to the owner wallet
await client.redeemToXrp({ vault, amount, passkey });  // to the saved XRPL address
await client.destroyVault({ vault, passkey });         // close, return everything
```

Each has authorize\* and execute\* halves if you want the two-step flow.

### FAssets reads

These call Flare's IAssetManager directly, through Flare's published ABI:

```ts
const settings = await client.directMintSettings();
// paymentAddress, feeBips, minimumFeeUba, executorFeeUba
const minimum = await client.minimumRedeemAmount();
```

### Lock and recovery

```ts
await client.lock(vault);
await client.scheduleUnlock(vault);
await client.confirmUnlock(vault);      // after the timelock
await client.scheduleRecovery(vault);
await client.cancelRecovery(vault);
await client.executeRecovery(vault);    // after the timelock
```

### Handling errors

Three error types, and they mean different things:

```ts
import { PolicyViolation, FccInfrastructureError, CovenantError } from "@covenant/sdk";
```

* PolicyViolation — the system worked and said no. reason explains which rule. Show it; do not retry unchanged.
* FccInfrastructureError — the request was accepted on-chain but no decision came back. Carries instructionTransaction as evidence. Safe to retry.
* CovenantError — everything else.

The distinction matters: a refusal is not an outage, and telling users to retry a refusal just wastes their gas.

### Building

```bash
pnpm install
pnpm --filter @covenant/sdk build
pnpm --filter @covenant/sdk test
```
