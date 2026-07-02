package orchestrator

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// fakeEngine mimics the TS engine's catalog/assemble/render JSON surface.
func fakeEngine(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /catalog", func(w http.ResponseWriter, r *http.Request) {
		tools := []CatalogEntry{
			{Name: "math.numberLine", Domain: DomainMath, Level: "node", Description: "number line",
				Keywords: []string{"number line"}, JSONSchema: json.RawMessage(`{"type":"object"}`)},
			{Name: "chem.reaction", Domain: DomainChem, Level: "node", Description: "reaction",
				Keywords: []string{"reaction"}, JSONSchema: json.RawMessage(`{"type":"object"}`)},
		}
		if r.URL.Query().Get("domain") == "math" {
			tools = tools[:1]
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"tools": tools})
	})
	mux.HandleFunc("GET /catalog/digest", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"digest": "Builder catalog — 2 tools."})
	})
	mux.HandleFunc("POST /assemble", func(w http.ResponseWriter, r *http.Request) {
		var req AssembleRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if len(req.Placements) == 0 {
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "errors": []ValidationError{{Path: "placements", Code: "EMPTY", Message: "empty"}}})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok": true, "spec": map[string]any{"specVersion": 1}, "specHash": "abc123", "durationSec": 6.0,
		})
	})
	mux.HandleFunc("POST /render", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(RenderResult{
			Video: ObjectRef{Key: "videos/x.mp4", URL: "/objects/videos/x.mp4"}, DurationSec: 6, Width: 640, Height: 360, FPS: 30, Cached: true,
		})
	})
	return httptest.NewServer(mux)
}

func TestHTTPEngineClientRoundTrips(t *testing.T) {
	srv := fakeEngine(t)
	defer srv.Close()
	c := NewHTTPEngineClient(srv.URL, 5*time.Second)
	ctx := context.Background()

	tools, err := c.Catalog(ctx, "")
	if err != nil || len(tools) != 2 {
		t.Fatalf("catalog: %v (%d tools)", err, len(tools))
	}
	mathOnly, err := c.Catalog(ctx, DomainMath)
	if err != nil || len(mathOnly) != 1 || mathOnly[0].Name != "math.numberLine" {
		t.Fatalf("domain filter: %v %+v", err, mathOnly)
	}

	digest, err := c.CatalogDigest(ctx, "")
	if err != nil || digest == "" {
		t.Fatalf("digest: %v %q", err, digest)
	}

	asm, err := c.Assemble(ctx, AssembleRequest{Placements: []BuilderPlacement{{Builder: "math.numberLine", Params: map[string]any{}}}})
	if err != nil || !asm.OK || asm.SpecHash != "abc123" {
		t.Fatalf("assemble: %v %+v", err, asm)
	}

	rr, err := c.Render(ctx, RenderRequest{Spec: asm.Spec})
	if err != nil || rr.Video.Key != "videos/x.mp4" || !rr.Cached {
		t.Fatalf("render: %v %+v", err, rr)
	}
}

func TestHTTPEngineClientSurfacesStructured422(t *testing.T) {
	srv := fakeEngine(t)
	defer srv.Close()
	c := NewHTTPEngineClient(srv.URL, 5*time.Second)

	asm, err := c.Assemble(context.Background(), AssembleRequest{})
	if err != nil {
		t.Fatalf("a 422 must decode, not error: %v", err)
	}
	if asm.OK || len(asm.Errors) == 0 {
		t.Fatalf("expected structured errors, got %+v", asm)
	}
}
