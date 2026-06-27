# Showman control-plane gateway (Go). Tiny static binary on a distroless base.
FROM golang:1.26-bookworm AS builder
WORKDIR /src
COPY go.mod ./
COPY gateway ./gateway
COPY cmd ./cmd
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gateway ./cmd/gateway

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /out/gateway /gateway
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/gateway"]
