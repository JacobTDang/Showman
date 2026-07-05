#!/usr/bin/env bash
# Run the golden-frame suite on a pinned x64 Linux target, byte-identical to CI,
# regardless of host architecture (Apple Silicon, Intel, Linux, Windows via Docker
# Desktop). Native execution on arm64 hosts fails golden byte-comparisons because
# @napi-rs/canvas's Skia rasterizer takes different SIMD codepaths per architecture —
# see docker/golden.Dockerfile for the full explanation.
#
# Requires: a running Docker daemon.
#
# Usage:  bash scripts/test-golden-x64.sh
set -euo pipefail

IMAGE="showman-golden:x64"

# The repo-root .dockerignore excludes test/ (it's tuned for the production worker
# image, which never needs test fixtures). Stage a throwaway context instead of
# fighting that exclusion from a Dockerfile living in docker/.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -R package.json package-lock.json tsconfig.json vitest.config.ts src assets test "$STAGE"/

echo "==> building $IMAGE (linux/amd64)"
docker build --platform linux/amd64 -f docker/golden.Dockerfile -t "$IMAGE" "$STAGE"

echo "==> running golden suite"
docker run --rm --platform linux/amd64 \
  -v "$(pwd)/test/golden/__received__:/app/test/golden/__received__" \
  "$IMAGE"
