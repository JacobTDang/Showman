#!/usr/bin/env bash
# Container smoke test — proves the whole stack runs in Docker end-to-end:
#   build the image → run it → wait for health → POST a brief to /v1/generate →
#   fetch the returned MP4 and assert it's a real ftyp file → tear down.
#
# Requires: a running Docker daemon. No API keys needed — the offline template author
# and silent TTS render a valid MP4 with zero external services. Set OPENROUTER_API_KEY
# (and pass it with --env) to exercise the gpt-oss-120b LLM author instead.
#
# Usage:  bash scripts/smoke-container.sh
set -euo pipefail

IMAGE="showman:smoke"
NAME="showman-smoke-$$"
PORT="${SMOKE_PORT:-8089}"
BRIEF="${SMOKE_BRIEF:-teach counting to three with stars}"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> building $IMAGE"
docker build -t "$IMAGE" .

echo "==> running container $NAME on :$PORT"
docker run -d --name "$NAME" -p "$PORT:8080" "$IMAGE" >/dev/null

echo "==> waiting for /healthz"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then break; fi
  if [ "$i" = "60" ]; then echo "FAIL: server never became healthy"; docker logs "$NAME"; exit 1; fi
  sleep 1
done

echo "==> POST /v1/generate  (brief: \"$BRIEF\")"
RESP="$(curl -fsS -X POST "http://127.0.0.1:$PORT/v1/generate" \
  -H 'content-type: application/json' \
  -d "{\"brief\":\"$BRIEF\"}")"
echo "    response: $RESP"

# Pull the video key out of the JSON response and fetch the bytes.
KEY="$(printf '%s' "$RESP" | sed -n 's/.*"video":{[^}]*"key":"\([^"]*\)".*/\1/p')"
[ -n "$KEY" ] || { echo "FAIL: no video key in response"; exit 1; }

echo "==> fetching /objects/$KEY"
OUT="$(mktemp -t showman-smoke-XXXX.mp4)"
curl -fsS "http://127.0.0.1:$PORT/objects/$KEY" -o "$OUT"

# Bytes 4..8 of a valid MP4 are the "ftyp" box marker.
MARKER="$(dd if="$OUT" bs=1 skip=4 count=4 2>/dev/null || true)"
SIZE="$(wc -c <"$OUT" | tr -d ' ')"
if [ "$MARKER" = "ftyp" ] && [ "$SIZE" -gt 0 ]; then
  echo "==> OK: rendered a $SIZE-byte MP4 from a plain-English brief, in one call. Smoke test passed."
else
  echo "FAIL: fetched file is not a valid MP4 (marker='$MARKER', size=$SIZE)"; exit 1
fi
