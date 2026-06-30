package orchestrator

import "testing"

func TestRequestHashDeterministic(t *testing.T) {
	r := ExternalRequest{Topic: "photosynthesis", Query: "explain it"}
	h1, err := RequestHash(r)
	if err != nil {
		t.Fatal(err)
	}
	h2, _ := RequestHash(r)
	if h1 != h2 {
		t.Fatalf("hash not deterministic: %s vs %s", h1, h2)
	}
	if len(h1) != 64 {
		t.Fatalf("want 64-hex-char sha256, got %d", len(h1))
	}
	other, _ := RequestHash(ExternalRequest{Topic: "photosynthesis", Query: "different"})
	if other == h1 {
		t.Fatal("different requests must hash differently")
	}
}

func TestSeedsNonNegativeDeterministicAndDistinct(t *testing.T) {
	root := RootSeed("some-request-hash")
	if root < 0 {
		t.Fatalf("root seed must be non-negative, got %d", root)
	}
	if RootSeed("some-request-hash") != root {
		t.Fatal("root seed not deterministic")
	}
	a := SceneSeed(root, 0)
	b := SceneSeed(root, 1)
	if a < 0 || b < 0 {
		t.Fatalf("scene seeds must be non-negative, got %d, %d", a, b)
	}
	if a == b {
		t.Fatal("scene seeds for different indices must differ")
	}
	if SceneSeed(root, 0) != a {
		t.Fatal("scene seed not deterministic")
	}
}
