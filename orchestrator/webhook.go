package orchestrator

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// WebhookSender POSTs the terminal JobView to a job's requested callback URL
// (Roadmap E1). Nil-safe by convention: a *Pipeline with no Webhook configured
// simply never attempts delivery — this type doesn't need its own "enabled" flag.
type WebhookSender struct {
	// Secret HMAC-signs the body (X-Showman-Signature: sha256=<hex>) when non-empty.
	// Unsigned delivery is still SSRF-guarded; signing just lets the receiver verify
	// the payload actually came from this orchestrator.
	Secret string
	// Allowlist is hostnames permitted even if they resolve to a private/loopback
	// address (e.g. "localhost" for local dev/testing). Exact, case-insensitive match.
	Allowlist []string
	// Client defaults to a 10s-timeout client when nil.
	Client *http.Client
}

func (w *WebhookSender) client() *http.Client {
	if w.Client != nil {
		return w.Client
	}
	return &http.Client{Timeout: 10 * time.Second}
}

// Deliver POSTs view as JSON to rawURL, HMAC-signed when a Secret is configured.
// Returns an error on an SSRF-guard rejection, a transport failure, or a non-2xx
// response — the caller decides whether that's worth retrying.
func (w *WebhookSender) Deliver(ctx context.Context, rawURL string, view JobView) error {
	if err := checkWebhookSSRF(rawURL, w.Allowlist); err != nil {
		return err
	}
	body, err := json.Marshal(view)
	if err != nil {
		return fmt.Errorf("webhook: marshal view: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, rawURL, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("webhook: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if w.Secret != "" {
		mac := hmac.New(sha256.New, []byte(w.Secret))
		mac.Write(body)
		req.Header.Set("X-Showman-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}
	res, err := w.client().Do(req)
	if err != nil {
		return fmt.Errorf("webhook: deliver: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("webhook: receiver returned status %d", res.StatusCode)
	}
	return nil
}

// checkWebhookSSRF rejects webhook URLs that would make this server issue a request
// to itself or to internal/private infrastructure — a classic SSRF vector when the
// target URL is caller-supplied (here, a job's Options.Webhook). Denies loopback,
// RFC1918/ULA private ranges, link-local, and unspecified addresses unless the
// hostname is explicitly allowlisted (exact match, e.g. for local dev).
func checkWebhookSSRF(rawURL string, allowlist []string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("webhook: invalid URL: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("webhook: unsupported scheme %q (must be http/https)", u.Scheme)
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("webhook: URL has no host")
	}
	for _, allowed := range allowlist {
		if strings.EqualFold(strings.TrimSpace(allowed), host) {
			return nil
		}
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return fmt.Errorf("webhook: resolve %q: %w", host, err)
	}
	if len(ips) == 0 {
		return fmt.Errorf("webhook: %q resolved to no addresses", host)
	}
	for _, ip := range ips {
		if isPrivateOrReservedIP(ip) {
			return fmt.Errorf("webhook: %q resolves to a private/reserved address (%s) — not allowed unless explicitly allowlisted", host, ip)
		}
	}
	return nil
}

func isPrivateOrReservedIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()
}

// deliverWebhook is the one call site every terminal path (Pipeline.Run's direct
// path, the Eino graph's stitch node, and the server's error/resume handlers) uses
// to fire a job's webhook. Best-effort and idempotent: no-ops when webhooks aren't
// configured, a job didn't request one, or WebhookDeliveredAt is already set (so a
// crash-resume retry, or any other re-entry into a terminal job, can never double-fire
// — see B4's boot scan, which also calls this for terminal jobs that finished but
// never got to deliver before a restart).
func (p *Pipeline) deliverWebhook(ctx context.Context, s *JobContext) {
	if p.Webhook == nil {
		return
	}
	target := strings.TrimSpace(s.Request.Options.Webhook)
	if target == "" || s.WebhookDeliveredAt != nil {
		return
	}
	if err := p.Webhook.Deliver(ctx, target, ProjectJob(s)); err != nil {
		// Best-effort: leave WebhookDeliveredAt unset so a later boot scan (B4) or
		// manual retry can try again. A delivery failure never fails the job itself.
		return
	}
	now := time.Now()
	_ = p.Director.Apply(ctx, s, WebhookDelivered{At: now})
}
