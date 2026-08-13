# Covenant Go FCC workload

The release entry point is `cmd/docker`: it starts tee-node and the Covenant
extension in one image. `cmd/start-tee` supports the local-process deployment
script, while `cmd/main` runs the extension handler by itself for development.

```text
internal/config        FCC operation constants and ports
internal/extension     action envelope and command routing
internal/privatevault  policy crypto, Flare reads, WebAuthn, movement/admin authorization
pkg/server             HTTP server startup
pkg/types              FCC response types
```

Verify with:

```bash
go test ./...
go vet ./...
CGO_ENABLED=0 go build ./cmd/docker
```

The container uses tee-node's loopback-only `/decrypt` and `/sign` endpoints.
Standalone development may supply `ENCLAVE_KEY_HEX`, but release deployment
must use the registered tee-node identity.
