# Showman orchestrator (Go): {topic, query} -> planned multi-scene video, calling the
# TS engine over HTTP. Needs ffmpeg at runtime (final clip concat happens here), so the
# runtime base is Debian slim with the SAME frozen-snapshot apt pin as the engine image —
# the concat/mux toolchain stays byte-identical across rebuilds.
FROM golang:1.26-bookworm AS builder
WORKDIR /src
COPY go.mod ./
COPY *.go ./
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/orchestrator ./cmd/orchestrator

FROM debian:bookworm-slim
ARG DEBIAN_SNAPSHOT=20250601T000000Z
RUN set -eux; \
  rm -f /etc/apt/sources.list.d/*; \
  { \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}/ bookworm main"; \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}/ bookworm-updates main"; \
    echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}/ bookworm-security main"; \
  } > /etc/apt/sources.list; \
  apt-get -o Acquire::Check-Valid-Until=false -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update; \
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
