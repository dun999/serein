# Getting started

Requirements: Go 1.25+, Foundry, jq, and Docker with Compose. The default FCC
image is the Go implementation; there are no alternate language handlers.

## Fast verification

```bash
forge test
cd go && go test ./... && go vet ./...
cd ../tools && go test ./... && go vet ./...
```

## Start the complete local stack

Copy `.env.example` to `.env`, fill the required local infrastructure values,
then run:

```bash
./scripts/full-setup.sh --chain local
```

Use `--local` to run the Go node/proxy as host processes while still using
Compose for Redis. Stop with:

```bash
./scripts/stop-services.sh --chain local
```

For public Coston2 registration, follow
[deployment-steps.md](deployment-steps.md). A real live authorization test also
needs an initialized vault and an allowed recipient; see
[testing-against-coston2.md](testing-against-coston2.md).
