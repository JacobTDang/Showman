package orchestrator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// HTTPEngineClient is the real EngineClient: a thin JSON client for the TS engine's
// catalog/build/assemble/render endpoints. It owns no spec types — specs flow through
// as opaque json.RawMessage blobs.
type HTTPEngineClient struct {
	baseURL string
	client  *http.Client
}

// NewHTTPEngineClient builds a client for an engine at baseURL (e.g. "http://engine:8080").
func NewHTTPEngineClient(baseURL string, timeout time.Duration) *HTTPEngineClient {
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	return &HTTPEngineClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: timeout},
	}
}

// Catalog lists the builder tools for a domain (empty domain = all).
func (c *HTTPEngineClient) Catalog(ctx context.Context, domain Domain) ([]CatalogEntry, error) {
	path := "/catalog"
	if domain != "" {
		path += "?domain=" + url.QueryEscape(string(domain))
	}
	var out struct {
		Tools []CatalogEntry `json:"tools"`
	}
	if err := c.getJSON(ctx, path, &out); err != nil {
		return nil, err
	}
	return out.Tools, nil
}

// CatalogDigest returns the token-frugal catalog text for a domain.
func (c *HTTPEngineClient) CatalogDigest(ctx context.Context, domain Domain) (string, error) {
	path := "/catalog/digest"
	if domain != "" {
		path += "?domain=" + url.QueryEscape(string(domain))
	}
	var out struct {
		Digest string `json:"digest"`
	}
	if err := c.getJSON(ctx, path, &out); err != nil {
		return "", err
	}
	return out.Digest, nil
}

// Build invokes one builder with params.
func (c *HTTPEngineClient) Build(ctx context.Context, req BuildRequest) (BuildResult, error) {
	var out BuildResult
	if err := c.postJSON(ctx, "/build", req, &out); err != nil {
		return BuildResult{}, err
	}
	return out, nil
}

// Assemble turns placements into one validated SceneSpec (+ content hash).
func (c *HTTPEngineClient) Assemble(ctx context.Context, req AssembleRequest) (AssembleResult, error) {
	var out AssembleResult
	if err := c.postJSON(ctx, "/assemble", req, &out); err != nil {
		return AssembleResult{}, err
	}
	return out, nil
}

// Render renders an opaque spec to a stored clip.
func (c *HTTPEngineClient) Render(ctx context.Context, req RenderRequest) (RenderResult, error) {
	var out RenderResult
	if err := c.postJSON(ctx, "/render", req, &out); err != nil {
		return RenderResult{}, err
	}
	return out, nil
}

func (c *HTTPEngineClient) getJSON(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	return c.do(req, path, out)
}

func (c *HTTPEngineClient) postJSON(ctx context.Context, path string, body any, out any) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	return c.do(req, path, out)
}

// do executes the request and decodes JSON. 422 responses (structured validation
// failures like {ok:false, errors}) decode into `out` so the caller can inspect them;
// other non-2xx statuses become Go errors.
func (c *HTTPEngineClient) do(req *http.Request, path string, out any) error {
	res, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("engine %s: %w", path, err)
	}
	defer func() { _ = res.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(res.Body, 64<<20))
	if err != nil {
		return fmt.Errorf("engine %s: read: %w", path, err)
	}
	if res.StatusCode >= 200 && res.StatusCode < 300 || res.StatusCode == http.StatusUnprocessableEntity {
		if err := json.Unmarshal(body, out); err != nil {
			return fmt.Errorf("engine %s: decode (status %d): %w", path, res.StatusCode, err)
		}
		return nil
	}
	return fmt.Errorf("engine %s: status %d: %s", path, res.StatusCode, truncate(string(body), 300))
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
