# Testing a Coston2 FCC deployment

You need a freshly registered Covenant extension, a reachable proxy, an
initialized private vault assigned to that TEE, and an EVM recipient allowed by
the vault's encrypted policy.

## Confirm the machine

```bash
curl -s "$EXT_PROXY_URL/info" | jq '.machineData | {extensionId, codeHash, platform, publicKey}'
cd tools
go run ./cmd/query-tee -ext "$EXTENSION_ID" -rpc "$CHAIN_URL"
go run ./cmd/verify-deploy -a ../config/coston2/deployed-addresses.json -c "$CHAIN_URL"
```

The extension ID and public key must match the on-chain registry. Use
`GCP_AMD_SEV`/real attestation for hardware confidentiality; `TEST_PLATFORM` is
functional test mode only.

## Submit an authorization request

```bash
export VAULT_ADDRESS=0x...
export TEST_RECIPIENT=0x...
export TEST_AMOUNT=1000000
./scripts/test.sh
```

The command submits `COVENANT/AUTHORIZE_SPEND`, polls the proxy, and validates
that FCC returned a complete authorization. A named policy refusal is also
useful evidence that the private engine executed; an outage or timeout is not.

If results remain missing, check for stale active machines, proxy/indexer
health, chain ID 114 across node and proxy, and whether the tunnel URL changed.
The dispatch event alone is not delivery evidence: confirm the selected machine
is Production, its availability check is fresh, and `/action/status/<epoch>/<id>`
plus the proxy's `instructions_received` / `instructions_rejected` metrics.
