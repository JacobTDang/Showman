package orchestrator

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

func TestFileCheckpointStoreSurvivesRestart(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()

	// "Before restart": one process instance saves a job mid-flight.
	before := NewFileCheckpointStore(dir)
	req := ExternalRequest{Topic: "fractions", Query: "show 3/4 as a pie"}
	s, err := NewJobContext("job-restart", req, time.Unix(1000, 0))
	if err != nil {
		t.Fatal(err)
	}
	s.Phase = PhaseRendering
	s.Scenes = []SceneState{{Index: 0, SpecHash: "h0", SpecBlob: `{"specVersion":1}`}}
	if err := before.Save(ctx, s); err != nil {
		t.Fatal(err)
	}

	// "After restart": a brand new store instance, same directory, no shared memory.
	after := NewFileCheckpointStore(dir)
	loaded, err := after.Load(ctx, "job-restart")
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Phase != PhaseRendering || loaded.RequestHash != s.RequestHash {
		t.Fatalf("restart lost state: %+v", loaded)
	}
	if len(loaded.Scenes) != 1 || loaded.Scenes[0].SpecBlob != `{"specVersion":1}` {
		t.Fatalf("restart lost scene data: %+v", loaded.Scenes)
	}
}

func TestFileCheckpointStoreListAndMissing(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()
	store := NewFileCheckpointStore(dir)

	if ids, err := store.ListJobIDs(); err != nil || len(ids) != 0 {
		t.Fatalf("empty store should list nothing: %v %v", err, ids)
	}
	if _, err := store.Load(ctx, "nope"); err == nil {
		t.Fatal("expected an error loading a job that was never saved")
	}

	for _, id := range []string{"job-a", "job-b"} {
		s, _ := NewJobContext(id, ExternalRequest{Topic: id}, time.Unix(1, 0))
		if err := store.Save(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	ids, err := store.ListJobIDs()
	if err != nil || len(ids) != 2 {
		t.Fatalf("want 2 job ids, got %v (err=%v)", ids, err)
	}
}

func TestFileByteStoreRoundTripsAndMisses(t *testing.T) {
	dir := t.TempDir()
	ctx := context.Background()
	store := NewFileByteStore(dir)

	if _, ok, err := store.Get(ctx, "absent"); err != nil || ok {
		t.Fatalf("absent checkpoint should be (false, nil), got ok=%v err=%v", ok, err)
	}
	if err := store.Set(ctx, "cp-1", []byte("eino-checkpoint-bytes")); err != nil {
		t.Fatal(err)
	}

	// New instance, same directory — the "restart" case for the Eino graph store.
	restarted := NewFileByteStore(dir)
	data, ok, err := restarted.Get(ctx, "cp-1")
	if err != nil || !ok {
		t.Fatalf("expected the checkpoint to survive: ok=%v err=%v", ok, err)
	}
	if string(data) != "eino-checkpoint-bytes" {
		t.Fatalf("wrong bytes: %q", data)
	}

	// Set again (overwrite) must replace, not append.
	if err := store.Set(ctx, "cp-1", []byte("v2")); err != nil {
		t.Fatal(err)
	}
	data, _, _ = restarted.Get(ctx, "cp-1")
	if string(data) != "v2" {
		t.Fatalf("overwrite did not take effect: %q", data)
	}
}

func TestAtomicWriteFileNeverLeavesATempFile(t *testing.T) {
	dir := t.TempDir()
	nested := dir + "/nested"
	if err := atomicWriteFile(nested+"/file.json", []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(nested + "/file.json")
	if err != nil || string(got) != "hello" {
		t.Fatalf("file content wrong: %v %q", err, got)
	}
	// The temp file pattern is ".tmp-*"; confirm none remain alongside the real file.
	entries, err := os.ReadDir(nested)
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".tmp-") {
			t.Fatalf("leftover temp file after atomic write: %s", e.Name())
		}
	}
}
