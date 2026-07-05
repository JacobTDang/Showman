# Runs the golden-frame suite on a pinned x64 Linux target, regardless of host
# architecture. @napi-rs/canvas's Skia rasterizer takes different SIMD codepaths on
# arm64 vs x64, producing tiny floating-point/antialiasing differences that shift PNG
# bytes without being a real visual regression. The goldens are blessed on x64 (CI's
# determinism matrix is ubuntu-latest + windows-latest, both x64), so this image lets
# an Apple Silicon (or any arm64) machine reproduce them bit-for-bit too — always
# `docker build --platform linux/amd64`.
FROM node:22-bookworm-slim
WORKDIR /app

# fontconfig/libfontconfig1 = Skia (@napi-rs/canvas) text rendering on slim Debian.
RUN apt-get update && apt-get install -y --no-install-recommends fontconfig libfontconfig1 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vitest.config.ts ./
COPY src ./src
COPY assets ./assets
COPY test ./test

CMD ["npx", "vitest", "run", "test/golden/golden.test.ts"]
