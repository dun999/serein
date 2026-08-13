# Default FCC image: self-contained, pinned, and reproducible. The build
# context is the extension root, so paths are prefixed with go/.
FROM golang:1.25.1-trixie@sha256:ff83f3762390c2cccb53618ccc18af23e556aff9b1db4428637e9f63287c8171 AS builder

ARG SOURCE_DATE_EPOCH
ENV SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH
WORKDIR /build

# Pin Debian packages to the source commit's snapshot when reproducibility is
# requested. The fallback keeps local builds convenient.
RUN \
  --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt,sharing=locked \
  if [ "${SOURCE_DATE_EPOCH:-0}" -gt 0 ] 2>/dev/null; then \
    : "${SOURCE_DATE_EPOCH:=$(stat --format=%Y /etc/apt/sources.list.d/debian.sources)}" && \
    snapshot="$(/bin/bash -euc "printf \"%(%Y%m%dT%H%M%SZ)T\n\" \"${SOURCE_DATE_EPOCH}\"")" && \
    sed -i -e '/Types: deb/ a\Snapshot: true' /etc/apt/sources.list.d/debian.sources && \
    rm -f /etc/apt/apt.conf.d/docker-clean && \
    echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' >/etc/apt/apt.conf.d/keep-cache && \
    apt-get install --update --snapshot "${snapshot}" -o Acquire::Check-Valid-Until=false -o Acquire::https::Verify-Peer=false -y ca-certificates && \
    apt-get install --snapshot "${snapshot}" -y ca-certificates && \
    rm -rf /var/log/* /var/cache/ldconfig/aux-cache; \
  else \
    apt-get update && apt-get install -y ca-certificates && \
    rm -rf /var/log/* /var/cache/ldconfig/aux-cache; \
  fi

COPY --chmod=644 --chown=0:0 go/go.mod go/go.sum ./
RUN go mod download && go mod verify

COPY --chmod=644 --chown=0:0 go/cmd/ ./cmd/
COPY --chmod=644 --chown=0:0 go/internal/ ./internal/
COPY --chmod=644 --chown=0:0 go/pkg/ ./pkg/

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOFLAGS="-buildvcs=false" \
    go build -trimpath -ldflags="-buildid= -s -w" -o /app/extension-tee ./cmd/docker && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOFLAGS="-buildvcs=false" \
    go build -trimpath -ldflags="-buildid= -s -w" -o /app/extension ./cmd

RUN if [ "${SOURCE_DATE_EPOCH:-0}" -gt 0 ] 2>/dev/null; then find /app -exec touch -h -d @${SOURCE_DATE_EPOCH} {} +; fi

FROM gcr.io/distroless/static
WORKDIR /app

COPY --chmod=644 --chown=65532:65532 --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --chmod=755 --chown=65532:65532 --from=builder /app/extension-tee /app/extension-tee
COPY --chmod=755 --chown=65532:65532 --from=builder /app/extension /app/extension

# MODE=1 is simulated attestation for local/testnet development; production
# Confidential Space deployment must override it to 0.
ENV MODE=1 \
    CONFIG_PORT=5501 \
    SIGN_PORT=7701 \
    EXTENSION_PORT=7702 \
    TEE_SIGN_URL=http://127.0.0.1:7701/sign \
    COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc \
    FTSO_V2_ADDRESS=0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d

# This matches tee-node and the official scaffold. The TEE is the isolation
# boundary; the sign/decrypt service itself is fixed to loopback.
USER 0:0

# Required by FCC Confidential Space. Only public/network configuration is
# overridable; no application decryption key exists in the environment.
LABEL "tee.launch_policy.allow_env_override"="LOG_LEVEL,PROXY_URL,INITIAL_OWNER,EXTENSION_ID,CHAIN_URL,MODE,CONFIG_PORT,SIGN_PORT,EXTENSION_PORT,COSTON2_RPC_URL,FTSO_V2_ADDRESS"

EXPOSE 5501 7701 7702
CMD ["/app/extension-tee"]
