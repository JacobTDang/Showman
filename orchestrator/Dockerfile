# Showman orchestrator (Go): {topic, query} -> planned multi-scene video, calling the
# TS engine over HTTP. Needs ffmpeg at runtime (final clip concat happens here), so the
# runtime base is Debian slim with the SAME frozen-snapshot apt pin as the engine image —
# the concat/mux toolchain stays byte-identical across rebuilds.
FROM golang:1.26-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/orchestrator ./cmd/orchestrator

FROM debian:bookworm-slim
# Pinned snapshot when the mirror is healthy; LOUDLY-labeled unpinned fallback when it
# 503s (grep the build log for "UNPINNED" before trusting byte-stability of an image).
ARG DEBIAN_SNAPSHOT=20250601T000000Z
RUN set -eux; \
  rm -f /etc/apt/sources.list.d/*; \
  { \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}/ bookworm main"; \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}/ bookworm-updates main"; \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}/ bookworm-security main"; \
  } > /etc/apt/sources.list; \
  if apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Retries=2 -o Acquire::http::Timeout=20 update; then \
    echo "apt: PINNED to snapshot ${DEBIAN_SNAPSHOT}"; \
  else \
    echo "WARNING: snapshot.debian.org unavailable — building UNPINNED from deb.debian.org"; \
    { \
      echo "deb http://deb.debian.org/debian bookworm main"; \
      echo "deb http://deb.debian.org/debian bookworm-updates main"; \
      echo "deb http://deb.debian.org/debian-security bookworm-security main"; \
    } > /etc/apt/sources.list; \
    apt-get -o Acquire::Retries=3 update; \
  fi; \
  apt-get install -y --no-install-recommends ffmpeg ca-certificates; \
  ffmpeg -version | head -n1; \
  rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/orchestrator /orchestrator
ENV PORT=8090 \
    SHOWMAN_ENGINE_URL=http://worker:8080 \
    SHOWMAN_OUT_DIR=/data/final
VOLUME ["/data"]
EXPOSE 8090
ENTRYPOINT ["/orchestrator"]
