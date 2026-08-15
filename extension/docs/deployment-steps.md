# Deploy Covenant FCC to Coston2

This flow creates a fresh instruction sender, public FCC extension ID, machine
registration, and proxy endpoint for the private-vault implementation. Do not
reuse the earlier public-policy deployment. The hackathon-supported Coston2
profile uses `SIMULATED_TEE=true`; it exercises the live FCC registry, provider
delivery, and policy path without claiming hardware-backed confidentiality.

## 1. Prepare credentials and configuration

Requirements: Go 1.25+, Foundry, jq, Docker with Compose, a Coston2-funded
deployment account, and access to the FCC indexer database.

```bash
cp .env.example .env
```

Set at minimum:

```text
CHAIN=coston2
CHAIN_ID=114
CHAIN_URL=https://coston2-api.flare.network/ext/C/rpc
ADDRESSES_FILE=./config/coston2/deployed-addresses.json
LOCAL_MODE=false
SIMULATED_TEE=true
INITIAL_OWNER=<dedicated deployment address>
DEPLOYMENT_PRIVATE_KEY=<funded key; never commit>
PROXY_PRIVATE_KEY=<dedicated proxy key; never commit>
NORMAL_PROXY_URL=https://tee-proxy-coston2-1.flare.rocks
EXT_PROXY_URL=<stable public HTTPS proxy URL>
```

Public-chain startup fails closed when `INITIAL_OWNER` or `PROXY_PRIVATE_KEY`
is missing. The well-known Anvil identity is available only in local mode.

## 2. Deploy and register the instruction sender

```bash
./scripts/pre-build.sh
```

This regenerates Go bindings, compiles `CovenantInstructionSender`, deploys it,
registers a new public extension, and writes `INSTRUCTION_SENDER` plus
`EXTENSION_ID` to `config/extension.env`. Registration is one-shot: if the
sender is bound to the wrong extension, deploy a new sender.

## 3. Build the measured workload

```bash
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)
./scripts/verify-reproducible-image.sh
```

The script builds twice and requires identical image identities. Podman uses
explicit OCI layer timestamp normalization; Docker BuildKit recognizes the
same `SOURCE_DATE_EPOCH`. The image defaults to simulated mode so local development works. A real
Confidential Space launch must override `MODE=0`; `MODE` is explicitly allowed
by `tee.launch_policy.allow_env_override`. Deploy by immutable digest, never by
a mutable tag. See [../REPRODUCIBILITY.md](../REPRODUCIBILITY.md).

## 4. Start the proxy/workload and register the machine

For a local Coston2-connected stack behind a stable named tunnel or hostname:

```bash
./scripts/start-services.sh --chain coston2
./scripts/post-build.sh
```

Do not register a rotating `trycloudflare.com` or temporary ngrok hostname.
Providers deliver directly to the URL stored on-chain at `/instruction`; the
proxy does not discover extension instructions from the indexer.

For a Confidential Space VM, launch the same image with `MODE=0`, chain ID 114,
the new extension ID, owner, and proxy URL. Then run `post-build.sh` from the
deployment workstation. It permits the measured code version, sets governance,
requests a fresh attestation challenge, performs availability verification, and
promotes the machine to `Production`.

Confirm the proxy and registry agree:

```bash
curl -s "$EXT_PROXY_URL/info" | jq '.machineData'
cd tools
go run ./cmd/query-tee -ext "$EXTENSION_ID" -rpc "$CHAIN_URL"
go run ./cmd/verify-deploy -a ../config/coston2/deployed-addresses.json -c "$CHAIN_URL"
```

The public key, extension ID, measured code hash, and platform must match.
`TEST_PLATFORM` is functional test mode; hardware confidentiality requires the
real Confidential Space platform.

## 5. Deploy the private-vault factory

Return to the repository root and set the current FXRP, FTSOv2, AssetManager,
machine registry, and new extension ID:

```bash
forge script contracts/script/DeployPrivateVault.s.sol \
  --rpc-url coston2 --broadcast
```

Expose the resulting factory, instruction sender, registered TEE, FXRP,
AssetManager, and proxy URL through the web application's `NEXT_PUBLIC_*`
variables. Keep deployment and Xaman private keys server-only.

## 6. Validate a real policy decision

Create and initialize a vault through the app, then run:

```bash
export VAULT_ADDRESS=0x...
export TEST_RECIPIENT=0x...
export TEST_AMOUNT=1000000
./scripts/test.sh
```

Complete every product flow through the UI: successful payment, named refusal,
direct mint, and redemption. Record the verified explorer links with the
deployment release.

## Renewing the availability check

The availability check expires roughly six hours after it is accepted, and
nothing renews it on its own. Once it lapses the machine still reads as status
`2`, but `toProduction` reverts with `InvalidTeeStatus` and
`/api/status` reports `fccAvailability` as expired. The registry only accepts a
fresh proof from a paused machine, and the proof must be minted after the
pause, so renewal is `pause` followed by `Rap`:

```bash
cd tools
go run ./cmd/renew-availability \
  -a ../config/coston2/deployed-addresses.json \
  -c "$CHAIN_URL" -p "$EXT_PROXY_URL" -h "$EXT_PROXY_URL" -ep "$NORMAL_PROXY_URL"
```

The tool exits without touching the machine while more than `-min-remaining`
(default two hours) of validity is left, so it is safe to run on a short timer.
The Coston2 deployment runs it hourly on the FCC host as the `fcc-renew.timer`
systemd user unit; `journalctl --user -u fcc-renew` shows each decision.
Renewal pauses the machine for a few seconds, during which it cannot be
dispatched to.

## Operational traps

- A workload relaunch creates a new in-memory machine identity. Pause stale
  active machines after registering the replacement, or dispatch selection can
  send instructions to the stale identity. Keep one active machine per URL.
- A machine must be status `2` (Production), have a registered `teeId`, and
  retain a fresh availability check (currently less than six hours old). See
  [Renewing the availability check](#renewing-the-availability-check).
- The registered URL must be stable public HTTPS with a valid certificate;
  provider source addresses cannot be globally allowlisted.
- Environment variables outside the image's launch-policy label abort a
  Confidential Space workload before startup.
- `CHAIN_ID`, proxy chain ID, and the registry must all be 114.
- Rebuilding changes the measured image hash. Mirror an existing digest instead
  of rebuilding it in another registry.
- A new FCC manager deployment erases registrations; repeat sender registration
  and machine promotion with a fresh extension ID.
