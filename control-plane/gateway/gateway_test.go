package gateway

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// stubBackend records the last request it received and returns a canned response.
type stubBackend struct {
	server    *httptest.Server
	lastPath  string
	lastBody  string
	respCode  int
	respBody  string
	callCount int
}

func newStub(code int, body string) *stubBackend {
	s := &stubBackend{respCode: code, respBody: body}
	s.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.callCount++
		s.lastPath = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		s.lastBody = string(b)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(s.respCode)
		_, _ = io.WriteString(w, s.respBody)
	}))
	return s
}

func do(g *Gateway, method, path, body string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	g.ServeHTTP(rec, req)
	return rec
}

func baseConfig(worker, coord *stubBackend) Config {
	return Config{
		WorkerURL:      worker.server.URL,
		CoordinatorURL: coord.server.URL,
		Bounds:         Bounds{MaxWidth: 1920, MaxHeight: 1080, MaxFrames: 9000, MaxDuration: 300},
	}
}

func TestHealthz(t *testing.T) {
	g := New(Config{})
	rec := do(g, "GET", "/healthz", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("healthz = %d", rec.Code)
	}
}

func TestProxiesValidateToWorker(t *testing.T) {
	worker := newStub(http.StatusOK, `{"valid":true}`)
	coord := newStub(http.StatusAccepted, `{}`)
	g := New(baseConfig(worker, coord))

	rec := do(g, "POST", "/v1/validate", `{"spec":{}}`, map[string]string{"Content-Type": "application/json"})
	if rec.Code != http.StatusOK {
		t.Fatalf("validate proxied code = %d", rec.Code)
	}
	if worker.lastPath != "/validate" {
		t.Fatalf("worker path = %q", worker.lastPath)
	}
	if !strings.Contains(rec.Body.String(), `"valid":true`) {
		t.Fatalf("body not proxied: %s", rec.Body.String())
	}
}

func TestSubmitForwardsToCoordinator(t *testing.T) {
	worker := newStub(http.StatusOK, `{}`)
	coord := newStub(http.StatusAccepted, `{"jobId":"abc"}`)
	g := New(baseConfig(worker, coord))

	rec := do(g, "POST", "/v1/jobs", `{"spec":{"width":640,"height":360,"fps":30,"duration":3}}`, nil)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("submit code = %d body=%s", rec.Code, rec.Body.String())
	}
	if coord.lastPath != "/jobs" {
		t.Fatalf("coordinator path = %q", coord.lastPath)
	}
}

func TestAuthRequiredWhenKeysConfigured(t *testing.T) {
	worker := newStub(http.StatusOK, `{}`)
	coord := newStub(http.StatusAccepted, `{}`)
	cfg := baseConfig(worker, coord)
	cfg.APIKeys = map[string]string{"secret-key": "alice"}
	g := New(cfg)

	// No key -> 401.
	rec := do(g, "POST", "/v1/jobs", `{"spec":{"width":640,"height":360,"fps":30,"duration":3}}`, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("no key code = %d", rec.Code)
	}
	// Valid key -> forwarded.
	rec = do(g, "POST", "/v1/jobs", `{"spec":{"width":640,"height":360,"fps":30,"duration":3}}`, map[string]string{"X-API-Key": "secret-key"})
	if rec.Code != http.StatusAccepted {
		t.Fatalf("with key code = %d", rec.Code)
	}
}

func TestSpecBoundsRejected(t *testing.T) {
	worker := newStub(http.StatusOK, `{}`)
	coord := newStub(http.StatusAccepted, `{}`)
	g := New(baseConfig(worker, coord))

	// 4000px wide exceeds MaxWidth 1920.
	rec := do(g, "POST", "/v1/jobs", `{"spec":{"width":4000,"height":360,"fps":30,"duration":3}}`, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("oversized width code = %d", rec.Code)
	}
	if coord.callCount != 0 {
		t.Fatalf("oversized spec reached coordinator (%d calls)", coord.callCount)
	}

	// 30fps * 600s = 18000 frames exceeds MaxFrames 9000.
	rec = do(g, "POST", "/v1/jobs", `{"spec":{"width":640,"height":360,"fps":30,"duration":600}}`, nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("too many frames/duration code = %d", rec.Code)
	}
}

func TestQuotaEnforced(t *testing.T) {
	worker := newStub(http.StatusOK, `{}`)
	coord := newStub(http.StatusAccepted, `{}`)
	cfg := baseConfig(worker, coord)
	cfg.APIKeys = map[string]string{"k": "bob"}
	cfg.MaxJobsPerUser = 1
	g := New(cfg)

	h := map[string]string{"X-API-Key": "k"}
	spec := `{"spec":{"width":640,"height":360,"fps":30,"duration":3}}`
	if rec := do(g, "POST", "/v1/jobs", spec, h); rec.Code != http.StatusAccepted {
		t.Fatalf("first submit = %d", rec.Code)
	}
	if rec := do(g, "POST", "/v1/jobs", spec, h); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("second submit over quota = %d", rec.Code)
	}
}

func TestObjectsAndPreviewRequireAuthWhenConfigured(t *testing.T) {
	worker := newStub(http.StatusOK, `png`)
	coord := newStub(http.StatusOK, `bytes`)
	cfg := baseConfig(worker, coord)
	cfg.APIKeys = map[string]string{"k": "alice"}
	g := New(cfg)

	// Object retrieval and preview must reject unauthenticated callers (compute/data).
	if rec := do(g, "GET", "/v1/objects/videos/abc.mp4", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauth objects = %d", rec.Code)
	}
	if rec := do(g, "POST", "/v1/preview", `{"spec":{}}`, nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("unauth preview = %d", rec.Code)
	}
	// With a valid key they pass through.
	if rec := do(g, "GET", "/v1/objects/videos/abc.mp4", "", map[string]string{"X-API-Key": "k"}); rec.Code != http.StatusOK {
		t.Fatalf("auth objects = %d", rec.Code)
	}
	if coord.callCount == 0 {
		t.Fatalf("authed object request did not reach coordinator")
	}
}

func TestMetricsExposed(t *testing.T) {
	worker := newStub(http.StatusOK, `{}`)
	coord := newStub(http.StatusAccepted, `{}`)
	g := New(baseConfig(worker, coord))

	// A bounds rejection and a successful submit.
	do(g, "POST", "/v1/jobs", `{"spec":{"width":9000,"height":360,"fps":30,"duration":3}}`, nil)
	do(g, "POST", "/v1/jobs", `{"spec":{"width":640,"height":360,"fps":30,"duration":3}}`, nil)

	rec := do(g, "GET", "/metrics", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("metrics code = %d", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{"showman_gateway_requests_total", "showman_gateway_bounds_rejections_total 1", "showman_gateway_submits_total 1"} {
		if !strings.Contains(body, want) {
			t.Fatalf("metrics missing %q in:\n%s", want, body)
		}
	}
}

func TestCDNRedirect(t *testing.T) {
	worker := newStub(http.StatusOK, `{}`)
	coord := newStub(http.StatusOK, `bytes`)
	cfg := baseConfig(worker, coord)
	cfg.CDNBaseURL = "https://cdn.example.com"
	g := New(cfg)

	rec := do(g, "GET", "/v1/objects/videos/abc.mp4", "", nil)
	if rec.Code != http.StatusFound {
		t.Fatalf("expected 302, got %d", rec.Code)
	}
	if loc := rec.Header().Get("Location"); loc != "https://cdn.example.com/videos/abc.mp4" {
		t.Fatalf("redirect location = %q", loc)
	}
	if coord.callCount != 0 {
		t.Fatalf("object bytes proxied despite CDN config")
	}
}

func TestJobStatusProxied(t *testing.T) {
	worker := newStub(http.StatusOK, `{}`)
	coord := newStub(http.StatusOK, `{"state":"done"}`)
	g := New(baseConfig(worker, coord))

	rec := do(g, "GET", "/v1/jobs/xyz", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status code = %d", rec.Code)
	}
	if coord.lastPath != "/jobs/xyz" {
		t.Fatalf("coordinator status path = %q", coord.lastPath)
	}
}
