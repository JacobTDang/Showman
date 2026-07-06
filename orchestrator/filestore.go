package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Persistent stores (Roadmap B1): a job restart must not lose in-flight work. Both
// stores below are pure filesystem implementations — no database, no daemon — so a
// killed and restarted orchestrator process picks up exactly where the last fsync'd
// write left off. Every write is atomic (write to a temp file, then rename into
// place), so a crash mid-write never leaves a half-written, corrupt file for the next
// read to trip over: os.Rename is atomic on the same filesystem on both POSIX and
// Windows (NTFS), which is the only guarantee this code depends on.

// atomicWriteFile writes data to path via a temp file + rename in the same directory
// (so the rename is same-filesystem, hence atomic) and fsyncs before renaming.
func atomicWriteFile(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	// On any early return, best-effort clean up the temp file; once Rename succeeds
	// tmpPath no longer exists, so this Remove is a harmless no-op.
	defer func() { _ = os.Remove(tmpPath) }()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpPath, perm); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

// FileCheckpointStore persists JobContext as one JSON file per job under
// {dir}/contexts/{jobId}.json. Implements CheckpointStore.
type FileCheckpointStore struct {
	dir string
}

// NewFileCheckpointStore builds a store rooted at dataDir (contexts/ is created under it).
func NewFileCheckpointStore(dataDir string) *FileCheckpointStore {
	return &FileCheckpointStore{dir: filepath.Join(dataDir, "contexts")}
}

func (f *FileCheckpointStore) path(jobID string) string {
	return filepath.Join(f.dir, jobID+".json")
}

// Save writes the job context, replacing any prior checkpoint for the same job id.
func (f *FileCheckpointStore) Save(_ context.Context, s *JobContext) error {
	data, err := json.Marshal(s)
	if err != nil {
		return err
	}
	return atomicWriteFile(f.path(s.JobID), data, 0o644)
}

// Load reads back the job context, or an error if none exists.
func (f *FileCheckpointStore) Load(_ context.Context, jobID string) (*JobContext, error) {
	data, err := os.ReadFile(f.path(jobID))
	if err != nil {
		return nil, fmt.Errorf("no checkpoint for job %q: %w", jobID, err)
	}
	var s JobContext
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("corrupt checkpoint for job %q: %w", jobID, err)
	}
	return &s, nil
}

// ListJobIDs returns every job id with a checkpoint on disk (B4: crash-resume scans
// this on boot). Order is unspecified; a missing/empty directory yields no error.
func (f *FileCheckpointStore) ListJobIDs() ([]string, error) {
	entries, err := os.ReadDir(f.dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(entries))
	for _, e := range entries {
		name := e.Name()
		const suffix = ".json"
		if !e.IsDir() && len(name) > len(suffix) && name[len(name)-len(suffix):] == suffix {
			ids = append(ids, name[:len(name)-len(suffix)])
		}
	}
	return ids, nil
}

// FileByteStore persists Eino graph checkpoints as one file per checkpoint id under
// {dir}/eino/{checkpointId}. Implements Eino's compose.CheckPointStore (Get/Set of
// opaque bytes) — see graph.go's EinoByteStore for the in-memory equivalent this
// mirrors.
type FileByteStore struct {
	dir string
}

// NewFileByteStore builds a store rooted at dataDir (eino/ is created under it).
func NewFileByteStore(dataDir string) *FileByteStore {
	return &FileByteStore{dir: filepath.Join(dataDir, "eino")}
}

func (f *FileByteStore) path(checkpointID string) string {
	return filepath.Join(f.dir, checkpointID)
}

// Get returns the stored bytes for checkpointID, or (nil, false, nil) if absent.
func (f *FileByteStore) Get(_ context.Context, checkpointID string) ([]byte, bool, error) {
	data, err := os.ReadFile(f.path(checkpointID))
	if os.IsNotExist(err) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	return data, true, nil
}

// Set stores checkpoint bytes for checkpointID, replacing any prior value.
func (f *FileByteStore) Set(_ context.Context, checkpointID string, checkpoint []byte) error {
	return atomicWriteFile(f.path(checkpointID), checkpoint, 0o644)
}
