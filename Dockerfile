# Showman render worker — the unit of horizontal scale (M1.4).
#
# Stateless image: Node + the pinned engine + FFmpeg + pinned fonts. Everything
# that affects pixels is baked in (fonts especially) so cloned workers render
# byte-identical frames. Multi-stage: compile in the builder, ship a slim runtime.

# ---- builder ---------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# FFmpeg is the encoder. Pin via the distro; for strict cross-host pixel parity,
# pin a specific FFmpeg build instead of the rolling apt version.
# ffmpeg = encoder; fontconfig/libfontconfig1 = Skia (@napi-rs/canvas) text rendering on slim Debian.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates fontconfig libfontconfig1 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Pinned, baked assets (fonts) + compiled engine. assets/ must sit beside dist/
# so the engine resolves ../../assets at runtime.
COPY assets ./assets
COPY --from=builder /app/dist ./dist

ENV PORT=8080 \
    SHOWMAN_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/service/worker.js"]
