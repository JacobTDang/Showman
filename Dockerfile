# Showman render worker — the unit of horizontal scale (M1.4).
#
# Stateless image: Node + the pinned engine + FFmpeg + pinned fonts. Everything
# that affects pixels is baked in (fonts especially) so cloned workers render
# byte-identical frames. Multi-stage: compile in the builder, ship a slim runtime.

# ---- builder ---------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
# Roadmap E4: the default slim image omits optional deps (kokoro-js / onnxruntime,
# ~+500MB) — local Kokoro TTS isn't bundled. Build with --build-arg
# INCLUDE_KOKORO=1 (see docker-compose.yml's worker-kokoro service, or scripts/*
# for a plain `docker build` invocation) to get a variant that has it, then run
# that image with SHOWMAN_TTS_PROVIDER=kokoro to actually use it (ttsFactory.ts
# already supports the "kokoro" provider — it was only ever missing from the image).
ARG INCLUDE_KOKORO=0
COPY package.json package-lock.json ./
RUN if [ "$INCLUDE_KOKORO" = "1" ]; then npm ci; else npm ci --omit=optional; fi
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG INCLUDE_KOKORO=0

# FFmpeg is the encoder; fontconfig/libfontconfig1 = Skia (@napi-rs/canvas) text rendering on slim Debian.
#
# Pin the apt package set to a frozen Debian snapshot so ffmpeg — and therefore the
# libx264 build it links — is byte-for-byte the SAME on every image rebuild. The rolling
# apt pool would otherwise drift ffmpeg between builds, and a different encoder build can
# emit different bytes for the same frames, breaking reproducible (`deterministic`) encodes
# and the spec+options content hash that keys the render cache. Freezing the whole apt set
# (not just ffmpeg) also pins fontconfig, which affects text rendering.
#
# Why a snapshot rather than `ffmpeg=<exact-version>`: a hard version pin breaks the day
# Debian rolls that build out of the main pool; the snapshot keeps resolving forever.
# http:// (not https) sidesteps a ca-certificates bootstrap — integrity still comes from
# apt's gpg-signed Release files. check-valid-until=no accepts the (by design) old index.
# Bump DEBIAN_SNAPSHOT to intentionally move the toolchain forward.
# If the snapshot mirror is down (it 503s under load a few times a year), fall back to
# the rolling pool with a LOUD marker: the build succeeds but is explicitly UNPINNED —
# grep the build log for "UNPINNED" before trusting byte-stability of that image.
ARG DEBIAN_SNAPSHOT=20250601T000000Z
RUN set -eux; \
  rm -f /etc/apt/sources.list.d/*; \
  { \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}/ bookworm main"; \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}/ bookworm-updates main"; \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}/ bookworm-security main"; \
  } > /etc/apt/sources.list; \
  ok=1; \
  timeout 120 apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Retries=2 -o Acquire::http::Timeout=20 update || ok=0; \
  if [ "$ok" = 1 ]; then \
    timeout 420 apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=20 install -y --no-install-recommends \
      ffmpeg ca-certificates fontconfig libfontconfig1 \
      && echo "apt: PINNED to snapshot ${DEBIAN_SNAPSHOT}" || ok=0; \
  fi; \
  if [ "$ok" = 0 ]; then \
    echo "WARNING: snapshot.debian.org unavailable — building UNPINNED from deb.debian.org"; \
    { \
      echo "deb http://deb.debian.org/debian bookworm main"; \
      echo "deb http://deb.debian.org/debian bookworm-updates main"; \
      echo "deb http://deb.debian.org/debian-security bookworm-security main"; \
    } > /etc/apt/sources.list; \
    dpkg --configure -a || true; \
    apt-get -o Acquire::Retries=3 update; \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates fontconfig libfontconfig1; \
  fi; \
  ffmpeg -version | head -n1; \
  rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN if [ "$INCLUDE_KOKORO" = "1" ]; then npm ci --omit=dev; else npm ci --omit=dev --omit=optional; fi \
  && npm cache clean --force

# Pinned, baked assets (fonts) + editable authoring prompts + compiled engine.
# assets/ and prompts/ must sit beside dist/ so they resolve at ../../ from the build.
# (Override prompts at runtime with SHOWMAN_PROMPT_DIR; mount a volume to tune without a rebuild.)
COPY assets ./assets
COPY prompts ./prompts
COPY --from=builder /app/dist ./dist

ENV PORT=8080 \
    SHOWMAN_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/service/worker.js"]
