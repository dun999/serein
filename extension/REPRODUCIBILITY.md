# Reproducible FCC image

FCC registers the workload code hash on-chain, so image determinism is a
security property. Covenant ships one authoritative image: `go/Dockerfile`.

The build uses a digest-pinned Go base, verified Go modules, `CGO_ENABLED=0`,
`-trimpath`, an empty build ID, normalized mtimes, and a distroless final image.
Only public network configuration can be overridden by the Confidential Space
launch policy; no policy-decryption secret exists in the environment.

Build and verify it from the extension directory. Podman's
`--rewrite-timestamp` normalizes the timestamps of newly created OCI layers;
the build argument also pins the Debian snapshot and Go output mtimes:

```bash
podman build --no-cache --rewrite-timestamp \
  --build-arg SOURCE_DATE_EPOCH=1700000000 \
  -f go/Dockerfile -t covenant-fcc:verify .
```

Two local builds at that epoch produced image ID
`sha256:5cdb6185aaadbccf0d54ab3a0b1a38d6d23cab0008576f73fa3fdb1b7de0dcc0`
and manifest digest
`sha256:01efca7eb60cba645d7b6d2ce80fce3338b31933dac4d9ec1da3321433d2ba30`.
