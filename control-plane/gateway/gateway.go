// Package gateway is the Showman control-plane edge (M3.2 + M6.1).
//
// It exposes the capability API to agents and the web app, enforces edge policy
// (API-key auth, per-user quota, and spec bounds so a runaway spec can't burn the
// farm), and proxies to the TypeScript worker (validate/preview/schema) and
// coordinator (submit/status/result). Languages meet only at JSON seams.
package gateway

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Bounds caps a spec so it can't exhaust the render farm. Enforced at the edge,
// before a job is ever enqueued.
type Bounds struct {
	MaxWidth    int
	MaxHeight   int
	MaxFrames   int
	MaxDuration float64
}

// Config holds gateway wiring and policy.
type Config struct {
	WorkerURL      string            // base URL of a render worker (validate/preview/schema)
	CoordinatorURL string            // base URL of the coordinator (jobs/status/objects)
	APIKeys        map[string]string // api-key -> userID; empty => auth disabled (dev)
	MaxJobsPerUser int               // 0 => unlimited
	Bounds         Bounds
	CDNBaseURL     string // if set, /v1/objects/<key> redirects here (M6.3 CDN delivery)
}

// ConfigFromEnv builds a Config from environment variables.
func ConfigFromEnv() Config {
	return Config{
		WorkerURL:      getenv("SHOWMAN_WORKER_URL", "http://worker:8080"),
		CoordinatorURL: getenv("SHOWMAN_COORDINATOR_URL", "http://coordinator:8090"),
		APIKeys:        parseKeys(os.Getenv("SHOWMAN_API_KEYS")),
		MaxJobsPerUser: atoiDefault(os.Getenv("SHOWMAN_MAX_JOBS_PER_USER"), 0),
		Bounds: Bounds{
			MaxWidth:    atoiDefault(os.Getenv("SHOWMAN_MAX_WIDTH"), 3840),
			MaxHeight:   atoiDefault(os.Getenv("SHOWMAN_MAX_HEIGHT"), 2160),
			MaxFrames:   atoiDefault(os.Getenv("SHOWMAN_MAX_FRAMES"), 18000),
			MaxDuration: atofDefault(os.Getenv("SHOWMAN_MAX_DURATION"), 600),
		},
		CDNBaseURL: os.Getenv("SHOWMAN_CDN_BASE_URL"),
	}
}

// Gateway is an http.Handler implementing the capability API + edge policy.
type Gateway struct {
	cfg     Config
	client  *http.Client
	mux     *http.ServeMux
	metrics *metrics

	mu       sync.Mutex
	jobCount map[string]int // userID -> jobs submitted (naive quota)
}

// New builds a Gateway.
func New(cfg Config) *Gateway {
	g := &Gateway{
		cfg:      cfg,
		client:   &http.Client{Timeout: 120 * time.Second},
		mux:      http.NewServeMux(),
		metrics:  newMetrics(),
		jobCount: map[string]int{},
	}
	g.routes()
	return g
}

func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	g.metrics.inc("requests_total")
	g.mux.ServeHTTP(w, r)
}

func (g *Gateway) routes() {
	g.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	})
	g.mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, _ *http.Request) {
		g.metrics.render(w)
	})
	g.mux.HandleFunc("GET /v1/schema", g.proxyWorker("/schema"))
	g.mux.HandleFunc("POST /v1/validate", g.proxyWorker("/validate"))
	g.mux.HandleFunc("POST /v1/preview", g.proxyWorker("/preview"))
	g.mux.HandleFunc("POST /v1/jobs", g.handleSubmit)
	g.mux.HandleFunc("GET /v1/jobs/{id}", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := g.authed(w, r); !ok {
			return
		}
		g.forward(w, r, g.cfg.CoordinatorURL, "/jobs/"+r.PathValue("id"), nil)
	})
	g.mux.HandleFunc("GET /v1/objects/{key...}", func(w http.ResponseWriter, r *http.Request) {
		key := r.PathValue("key")
		// M6.3: when a CDN fronts object storage, redirect finished videos there
		// instead of proxying bytes through the gateway.
		if g.cfg.CDNBaseURL != "" {
			g.metrics.inc("cdn_redirects_total")
			http.Redirect(w, r, strings.TrimRight(g.cfg.CDNBaseURL, "/")+"/"+key, http.StatusFound)
			return
		}
		g.forward(w, r, g.cfg.CoordinatorURL, "/objects/"+key, nil)
	})
}

// authed resolves the caller's userID. If no API keys are configured, auth is
// disabled and a default user is returned.
func (g *Gateway) authed(w http.ResponseWriter, r *http.Request) (string, bool) {
	if len(g.cfg.APIKeys) == 0 {
		return "anonymous", true
	}
	key := r.Header.Get("X-API-Key")
	if key == "" {
		if b := r.Header.Get("Authorization"); strings.HasPrefix(b, "Bearer ") {
			key = strings.TrimPrefix(b, "Bearer ")
		}
	}
	user, ok := g.cfg.APIKeys[key]
	if !ok {
		g.metrics.inc("auth_failures_total")
		writeJSON(w, http.StatusUnauthorized, map[string]any{"error": "unauthorized"})
		return "", false
	}
	return user, true
}

type submitBody struct {
	Spec struct {
		Width    int     `json:"width"`
		Height   int     `json:"height"`
		Fps      float64 `json:"fps"`
		Duration float64 `json:"duration"`
	} `json:"spec"`
}

func (g *Gateway) handleSubmit(w http.ResponseWriter, r *http.Request) {
	user, ok := g.authed(w, r)
	if !ok {
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, 16<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "read_failed"})
		return
	}
	// Spec bounds — reject a runaway spec before it reaches the farm.
	var sb submitBody
	_ = json.Unmarshal(raw, &sb)
	if msg := g.checkBounds(sb); msg != "" {
		g.metrics.inc("bounds_rejections_total")
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "spec_bounds_exceeded", "message": msg})
		return
	}
	// Quota.
	if g.cfg.MaxJobsPerUser > 0 {
		g.mu.Lock()
		if g.jobCount[user] >= g.cfg.MaxJobsPerUser {
			g.mu.Unlock()
			g.metrics.inc("quota_rejections_total")
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"error": "quota_exceeded", "limit": g.cfg.MaxJobsPerUser})
			return
		}
		g.jobCount[user]++
		g.mu.Unlock()
	}
	g.metrics.inc("submits_total")
	g.forward(w, r, g.cfg.CoordinatorURL, "/jobs", raw)
}

func (g *Gateway) checkBounds(sb submitBody) string {
	b := g.cfg.Bounds
	if b.MaxWidth > 0 && sb.Spec.Width > b.MaxWidth {
		return "width exceeds limit"
	}
	if b.MaxHeight > 0 && sb.Spec.Height > b.MaxHeight {
		return "height exceeds limit"
	}
	if b.MaxDuration > 0 && sb.Spec.Duration > b.MaxDuration {
		return "duration exceeds limit"
	}
	frames := int(math.Round(sb.Spec.Duration * sb.Spec.Fps))
	if b.MaxFrames > 0 && frames > b.MaxFrames {
		return "frame count exceeds limit"
	}
	return ""
}

func (g *Gateway) proxyWorker(path string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		g.forward(w, r, g.cfg.WorkerURL, path, nil)
	}
}

// forward proxies the request to base+path, copying status, body, and content-type.
func (g *Gateway) forward(w http.ResponseWriter, r *http.Request, base, path string, bodyOverride []byte) {
	target := strings.TrimRight(base, "/") + path
	if r.URL.RawQuery != "" {
		target += "?" + r.URL.RawQuery
	}
	var body io.Reader
	if bodyOverride != nil {
		body = bytes.NewReader(bodyOverride)
	} else if r.Body != nil {
		body = r.Body
	}
	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, body)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "bad_gateway"})
		return
	}
	if ct := r.Header.Get("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}
	resp, err := g.client.Do(req)
	if err != nil {
		g.metrics.inc("upstream_errors_total")
		writeJSON(w, http.StatusBadGateway, map[string]any{"error": "upstream_unreachable", "message": err.Error()})
		return
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func parseKeys(s string) map[string]string {
	out := map[string]string{}
	for _, pair := range strings.Split(s, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		if i := strings.IndexByte(pair, ':'); i > 0 {
			out[pair[:i]] = pair[i+1:]
		}
	}
	return out
}

func atoiDefault(s string, def int) int {
	if s == "" {
		return def
	}
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

func atofDefault(s string, def float64) float64 {
	if s == "" {
		return def
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return def
}
