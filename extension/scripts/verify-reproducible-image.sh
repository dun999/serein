#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1700000000}"
TAG_PREFIX="${IMAGE_TAG_PREFIX:-covenant-fcc-repro}"

cd "$PROJECT_DIR"

if command -v podman >/dev/null 2>&1; then
    builder=(podman build --no-cache --rewrite-timestamp)
    inspect=(podman image inspect --format '{{.Id}}')
elif command -v docker >/dev/null 2>&1; then
    export DOCKER_BUILDKIT=1
    builder=(docker build --no-cache)
    inspect=(docker image inspect --format '{{.Id}}')
else
    echo "Neither Podman nor Docker is available" >&2
    exit 1
fi

"${builder[@]}" --build-arg "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH" -f go/Dockerfile -t "$TAG_PREFIX:a" .
"${builder[@]}" --build-arg "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH" -f go/Dockerfile -t "$TAG_PREFIX:b" .

first="$(${inspect[@]} "$TAG_PREFIX:a")"
second="$(${inspect[@]} "$TAG_PREFIX:b")"
if [[ "$first" != "$second" ]]; then
    echo "FCC image is not reproducible: $first != $second" >&2
    exit 1
fi

echo "FCC image reproducibility verified: $first"
