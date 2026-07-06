package orchestrator

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestWebhookDeliversSignedPayload(t *testing.T) {
	var gotBody []byte
	var gotSig string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotBody, _ = io.ReadAll(r.Body)
		gotSig = r.Header.Get("X-Showman-Signature")
		w.WriteHeader(200)
	}))
	defer ts.Close()

	w := &WebhookSender{Secret: "s3cr3t", Allowlist: []string{"127.0.0.1"}}
	view := JobView{JobID: "job-1", Status: PhaseDone}
	if err := w.Deliver(context.Background(), ts.URL, view); err != nil {
		t.Fatal(err)
	}

	var got JobView
	if err := json.Unmarshal(gotBody, &got); err != nil || got.JobID != "job-1" {
		t.Fatalf("wrong body delivered: %v %s", err, gotBody)
	}
	mac := hmac.New(sha256.New, []byte("s3cr3t"))
	mac.Write(gotBody)
	want := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	if gotSig != want {
		t.Fatalf("signature mismatch: got %q want %q", gotSig, want)
	}
}

func TestWebhookUnsignedWhenNoSecret(t *testing.T) {
	var gotSig string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotSig = r.Header.Get("X-Showman-Signature")
		w.WriteHeader(200)
	}))
	defer ts.Close()

	w := &WebhookSender{Allowlist: []string{"127.0.0.1"}}
	if err := w.Deliver(context.Background(), ts.URL, JobView{JobID: "job-1"}); err != nil {
		t.Fatal(err)
	}
	if gotSig != "" {
		t.Fatalf("expected no signature header without a secret, got %q", gotSig)
	}
}

func TestWebhookRejectsNon2xx(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(500)
	}))
	defer ts.Close()
	w := &WebhookSender{Allowlist: []string{"127.0.0.1"}}
	if err := w.Deliver(context.Background(), ts.URL, JobView{}); err == nil {
		t.Fatal("expected an error for a 500 response")
	}
}

func TestWebhookSSRFGuardBlocksPrivateAddressesUnlessAllowlisted(t *testing.T) {
	w := &WebhookSender{}
	for _, url := range []string{
		"http://127.0.0.1:9999/hook",
		"http://localhost/hook",
		"http://169.254.169.254/latest/meta-data", // cloud metadata endpoint — the classic SSRF target
		"http://[::1]/hook",
	} {
		if err := w.Deliver(context.Background(), url, JobView{}); err == nil {
			t.Fatalf("expected the SSRF guard to reject %q", url)
		}
	}

	// The same private address, now explicitly allowlisted, must be permitted through
	// to the actual HTTP attempt (it will still fail to connect, but for a DIFFERENT
	// reason — a real network/dial error, not the SSRF guard's rejection).
	wAllowed := &WebhookSender{Allowlist: []string{"127.0.0.1"}, Client: &http.Client{Timeout: 200 * time.Millisecond}}
	err := wAllowed.Deliver(context.Background(), "http://127.0.0.1:1/hook", JobView{}) // port 1: nothing listens there
	if err == nil {
		t.Fatal("expected a connection error")
	}
	if err.Error() == "" {
		t.Fatal("expected a non-empty error")
	}
}

func TestWebhookRejectsNonHTTPSchemes(t *testing.T) {
	w := &WebhookSender{}
	if err := w.Deliver(context.Background(), "file:///etc/passwd", JobView{}); err == nil {
		t.Fatal("expected the scheme guard to reject file://")
	}
}

// TestPipelineDeliversWebhookExactlyOnce proves E1's stated acceptance bar end to
// end: a job with Options.Webhook set fires its webhook once on completion, and a
// second delivery attempt (modeling a crash-resume re-entry into an already-
// terminal job) is a no-op because WebhookDeliveredAt is already set.
func TestPipelineDeliversWebhookExactlyOnce(t *testing.T) {
	var hits int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(200)
	}))
	defer ts.Close()

	engine := &pipelineEngine{stubEngine: stubEngine{tools: realishCatalog()}}
	p, _ := newTestPipeline(engine)
	p.Webhook = &WebhookSender{Allowlist: []string{"127.0.0.1"}}

	s, err := p.Run(context.Background(), "job-webhook", ExternalRequest{
		Topic: "counting", Query: "count to 3",
		Options: GenerateVideoOptions{Webhook: ts.URL},
	})
	if err != nil {
		t.Fatal(err)
	}
	if s.WebhookDeliveredAt == nil {
		t.Fatal("expected WebhookDeliveredAt to be set after a successful delivery")
	}
	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("want exactly 1 delivery, got %d", hits)
	}

	// Re-entry into the (already terminal) job must not re-fire.
	p.deliverWebhook(context.Background(), s)
	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("want still exactly 1 delivery after a repeat call, got %d", hits)
	}
}

// TestCrashResumeRetriesUndeliveredWebhook: a job that finished but crashed before
// its webhook fired must still get exactly one delivery after a restart's boot scan.
func TestCrashResumeRetriesUndeliveredWebhook(t *testing.T) {
	var hits int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&hits, 1)
		w.WriteHeader(200)
	}))
	defer ts.Close()

	dir := t.TempDir()
	before := newFileBackedServer(t, dir)
	before.Pipeline.Webhook = &WebhookSender{Allowlist: []string{"127.0.0.1"}}

	req := ExternalRequest{Topic: "counting", Query: "count to 3", Options: GenerateVideoOptions{Webhook: ts.URL}}
	seed, err := NewJobContext("job-webhook-crash", req, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	seed.Phase = PhaseDone // finished, but never delivered (simulates the crash window)
	seed.Final = &FinalAssembly{VideoKey: "x", DurationSec: 1}
	if err := before.Checkpoint.Save(context.Background(), seed); err != nil {
		t.Fatal(err)
	}

	after := newFileBackedServer(t, dir)
	after.Pipeline.Webhook = &WebhookSender{Allowlist: []string{"127.0.0.1"}}
	resumed, err := after.ResumeIncompleteJobs(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if resumed != 1 {
		t.Fatalf("want the boot scan to retry exactly 1 undelivered webhook, got %d", resumed)
	}

	deadline := time.Now().Add(5 * time.Second)
	for atomic.LoadInt32(&hits) == 0 {
		if time.Now().After(deadline) {
			t.Fatal("webhook was never retried after the simulated crash")
		}
		time.Sleep(20 * time.Millisecond)
	}
	if atomic.LoadInt32(&hits) != 1 {
		t.Fatalf("want exactly 1 delivery, got %d", hits)
	}
}
