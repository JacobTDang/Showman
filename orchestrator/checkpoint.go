package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
)

// CheckpointStore persists a JobContext so an async job survives crash/retry and can be
// resumed. The opaque per-scene SpecBlob (json:"-") is stored out-of-line by the Director,
// not by this store. In a later phase this is backed by the Eino checkpoint store; the
// interface stays the same.
type CheckpointStore interface {
	Save(ctx context.Context, s *JobContext) error
	Load(ctx context.Context, jobID string) (*JobContext, error)
}

// InMemoryCheckpointStore is a process-local CheckpointStore for tests and single-node dev.
type InMemoryCheckpointStore struct {
	mu   sync.RWMutex
	data map[string][]byte
}

// NewInMemoryCheckpointStore builds an empty in-memory store.
func NewInMemoryCheckpointStore() *InMemoryCheckpointStore {
	return &InMemoryCheckpointStore{data: make(map[string][]byte)}
}

// Save serializes and stores the context by job id.
func (m *InMemoryCheckpointStore) Save(_ context.Context, s *JobContext) error {
	b, err := json.Marshal(s)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.data[s.JobID] = b
	return nil
}

// Load returns the stored context for a job id, or an error if absent.
func (m *InMemoryCheckpointStore) Load(_ context.Context, jobID string) (*JobContext, error) {
	m.mu.RLock()
	b, ok := m.data[jobID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("no checkpoint for job %q", jobID)
	}
	var s JobContext
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}
