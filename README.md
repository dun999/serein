# Serein

**Private spending rules for XRP.**

Serein is a protected FXRP vault on Flare. It helps you control where funds can
go, how much can be sent, and when a passkey is required.

FXRP is XRP represented on Flare. It keeps its connection to XRP while making
the funds usable by smart contracts. Serein holds FXRP in a vault contract and
checks every outgoing action against rules chosen by the owner.

The rules are encrypted. Approved recipients, spending limits, labels, and
passkey details are not published as readable blockchain data. They are opened
only inside Flare Confidential Compute, a protected environment that checks the
request and approves it only when the rules are satisfied.

Live testnet app: [serein.finance](https://serein.finance)

> Serein currently runs on the Flare Coston2 and XRP Ledger test networks.

## Why Serein exists

A normal wallet usually has one main line of defense: its signing key. If that
key is stolen, an attacker may be able to send everything immediately.

Serein adds another layer of control around the funds:

- Only approved addresses can receive payments.
- Each payment can have a maximum value.
- Total spending can have a daily limit.
- Larger payments can require a passkey, confirmed with biometrics, a device
  PIN, or a password manager.
- Rules and important vault settings cannot be changed with the wallet alone.
- XRP redemption can settle only to the XRP Ledger address saved in the vault.
- A delayed recovery path remains available if the confidential service is
  unavailable.

These controls are enforced outside the website as well. Calling the contract
directly does not skip them.

## What you can do

### Create a private vault

Connect a Coston2 wallet and choose:

- an XRP Ledger address for cash-out and recovery;
- approved Flare recipient addresses;
- a maximum value for one payment;
- a daily spending limit;
- the value above which a passkey is required; and
- an optional guardian who can help lock the vault or cancel recovery.

The app creates a separate vault contract for the owner, enrolls a passkey, and
stores the encrypted rules on Flare.

### Add funds

There are two ways to fund a vault:

1. Deposit FXRP that is already in the connected Flare wallet.
2. Send XRP from Xaman on the XRP Ledger Testnet and mint the resulting FXRP
   directly into the vault.

The direct-mint flow is **native XRP to FXRP**:

```text
XRP Ledger Testnet XRP → Flare FAssets verification → FXRP in the Serein vault
```

Serein prepares the correct destination and payment memo. Xaman is used only to
review and sign the XRP Ledger Testnet payment. The Flare FAssets system then
verifies that payment before FXRP is created.

### Send FXRP

Enter a Flare address and an amount. Serein checks the private recipient list,
the payment limit, the daily limit, the current XRP/USD price, and whether a
passkey is needed.

An approved payment has two visible transactions:

1. The first transaction requests a private decision from Flare Confidential
   Compute.
2. The second transaction executes the exact approved payment from the vault.

If the recipient is not approved, the first transaction remains visible as
evidence, but the vault payment is never submitted.

### Cash out to native XRP

FXRP can be redeemed through Flare FAssets. Serein allows the redemption to use
only the XRP Ledger address saved in the vault.

A successful Flare transaction creates a redemption request. Native XRP does
not arrive in the same transaction; the FAssets agent completes the XRP Ledger
payment afterward. The app shows the confirmed confidential instruction and
the vault transaction separately so a request is not mistaken for a completed
payment.

### Update private rules

Rules can be replaced only after the current passkey is confirmed. The new rules
are encrypted before they are sent to Flare, and the change has a waiting period
before it becomes active.

The browser keeps a local copy of names and editable rule details. If that local
copy is missing, the vault remains protected and the confidential service can
still enforce the encrypted rules. Import or recreate the local details before
editing them.

### Lock, recover, or destroy a vault

- **Lock** stops normal outgoing actions immediately.
- **Recovery** waits for the vault delay, then redeems the complete balance only
  to the saved XRP Ledger address.
- **Destroy vault** always requires the enrolled passkey. It returns all FXRP to
  the owner wallet, removes the private rules, and permanently closes normal
  vault use.

## How a payment is protected

```text
Owner requests a payment
        ↓
The request is recorded on Flare
        ↓
Flare Confidential Compute reads the vault and opens its encrypted rules
        ↓
Recipient, limits, price, balance, and passkey are checked
        ↓
A one-time approval is created for that exact payment
        ↓
The owner confirms the vault transaction
        ↓
The vault checks the approval again and sends FXRP
```

The approval includes the vault, recipient, amount, current rule version,
one-time counter, price time, and expiry time. Changing any of those values makes
the approval invalid.

## What happens if a wallet is compromised?

A stolen wallet key is still serious, but it is not enough by itself to empty a
Serein vault.

An attacker is still limited by the encrypted recipient list, per-payment limit,
daily limit, and passkey threshold. The attacker also cannot replace the rules,
change the confidential machine, change the guardian or XRP Ledger destination,
or destroy the vault without the passkey saved in the active policy.

The protection is weaker if an attacker controls both the wallet and the
enrolled passkey account or device. Serein also cannot protect funds that remain
outside the vault. Consider these limits when deciding how much to keep in a
vault and which devices can approve sensitive actions.

## Main parts of the project

| Path | Purpose |
| --- | --- |
| `contracts/src/CovenantVault.sol` | Holds FXRP, checks approvals, applies delays, and starts XRP redemption |
| `contracts/src/CovenantVaultFactory.sol` | Creates and lists vaults for each owner |
| `extension/contracts/InstructionSender.sol` | Records confidential approval requests on Flare |
| `extension/go/internal/privatevault` | Opens private rules, checks requests, verifies passkeys, and creates approvals |
| `packages/sdk/src` | Shared vault, passkey, FAssets, and confidential-service client code. Flare-owned addresses and the XRP/USD feed come from the official [`@flarenetwork/flare-tx-sdk`](https://dev.flare.network/network/flare-tx-sdk), never from hard-coded values |
| `web` | The Serein website and wallet experience |

Some internal contract and package names still use `Covenant`, the project's
earlier working name. The product name is Serein.

For deeper technical details, read [docs/architecture.md](docs/architecture.md).

## Run locally

Requirements:

- Node.js 24 or newer
- pnpm 11
- Go 1.25 or newer
- Foundry

Install dependencies, verify the project, and start the website:

```bash
pnpm install
pnpm verify
pnpm dev
```

The app is then available at `http://localhost:3000`.

Without deployment settings, the public landing page still works and the app
shows which network values are missing. It does not display fake vault data.

Useful focused checks:

```bash
forge test --match-contract CovenantVaultTest -vv
cd extension/go && go test ./...
cd extension/tools && go test ./...
pnpm --filter @covenant/sdk test
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web exec tsc --noEmit
pnpm --filter web build
```

## Configuration

Copy `.env.example` and fill in the current Coston2 contract addresses. Public
browser settings begin with `NEXT_PUBLIC_`. Private keys, Xaman credentials, and
database credentials must never use that prefix.

For the Xaman direct-mint flow, set these server-only values:

```text
XAMAN_API_KEY=
XAMAN_API_SECRET=
```

The server accepts only a vault and an amount from the browser. It reads the
current FAssets destination, verifies the vault, and builds the XRP Ledger
Testnet payment itself. The browser cannot ask this route to create an unrelated
Xaman payment.

## Deploy on Coston2

### 1. Start the confidential service

```bash
cd extension
cp .env.example .env
./scripts/pre-build.sh
./scripts/start-services.sh --chain coston2 --tunnel
./scripts/post-build.sh
```

Keep the public HTTPS address stable. Flare providers deliver instructions to
the registered address, so changing it without updating the registration will
break new requests.

### 2. Deploy the vault factory

Use the registered confidential machine and extension ID when deploying:

```bash
forge script contracts/script/DeployPrivateVault.s.sol \
  --rpc-url coston2 --broadcast
```

### 3. Configure and build the website

Add the deployed factory, instruction sender, confidential machine, proxy, and
machine registry addresses to `.env.local`. FXRP, the FAssets manager, and the
price feed are resolved from Flare's on-chain contract registry by the vault
and the SDK, so no addresses are needed for those, then run:

```bash
pnpm deployment:update
pnpm --filter @covenant/sdk build
pnpm --filter web build
```

`GET /api/status` checks the configured network, contracts, confidential
machine, and proxy without returning private credentials.

## Important operating note

The current simulated confidential machine creates a new identity when it is
restarted. Existing vaults trust the identity they were created with. Before
restarting or replacing that machine, move each vault to a newly registered
machine through the vault's protected update process.

Do not treat a container restart as a normal software update for a machine that
still protects active vaults.

## Safety

Serein currently uses testnet assets. Never send mainnet XRP through the
current deployment.

## Flare SDK integration

Serein uses two official Flare packages as the single source of truth for
Flare-owned addresses and on-chain reads:

| Layer | Package | Role |
| --- | --- | --- |
| **Solidity** | `@flarenetwork/flare-periphery-contracts` | Vault constructor resolves `FtsoV2`, `AssetManagerFXRP`, and FXRP from Flare's `ContractRegistry` on-chain; no deploy-time addresses needed for those services |
| **TypeScript SDK** | `@flarenetwork/flare-tx-sdk` | `resolveFlareContracts()` and `readXrpUsdPrice()` re-derive the same addresses via `getFlareContracts()` / `invokeContractCallOnC()` and read the FTSOv2 XRP/USD feed |
| **FCC** | `@flare-foundation/go-flare-common` + `tee-node` | Confidential policy engine runs in Flare's registered TEE |

Because every Flare address is resolved from the chain, a Flare-side service
upgrade never requires re-deploying the factory or vaults.
