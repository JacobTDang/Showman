package orchestrator

import (
	"context"
	"sync"
	"time"
)

// Clock supplies the current time; injectable so reducers/audit are testable.
type Clock interface{ Now() time.Time }

// SystemClock is the real wall clock.
type SystemClock struct{}

// Now returns the current time.
func (SystemClock) Now() time.Time { return time.Now() }

// Director is the orchestration control plane and the single writer to the store. In later
// phases it also drives the Eino graph (planning -> select -> assemble -> render -> stitch);
// for now it owns the one load-bearing invariant: all writes go through Apply.
type Director struct {
	clock      Clock
	checkpoint CheckpointStore
	// mu guards the store during fan-out: Apply holds the write lock (single-writer,
	// enforced), and every store READ from a concurrent scene goroutine must go
	// through Read — views touching shared fields (Continuity.Recap) race otherwise.
	mu sync.RWMutex
}

// NewDirector builds a Director. A nil clock defaults to the system clock.
func NewDirector(cp CheckpointStore, clock Clock) *Director {
	if clock == nil {
		clock = SystemClock{}
	}
	return &Director{clock: clock, checkpoint: cp}
}

// Apply is the ONLY writer to the store: fold the delta in, stamp the time, append the
// audit record, and checkpoint. If the reducer fails, the store is left unstamped and
// un-checkpointed so a retry sees the same pre-state. Safe for concurrent callers.
func (d *Director) Apply(ctx context.Context, s *JobContext, delta Delta) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if err := delta.apply(s); err != nil {
		return err
	}
	s.UpdatedAt = d.clock.Now()
	s.History = append(s.History, NodeRunRecord{Kind: delta.Kind(), At: s.UpdatedAt})
	if d.checkpoint != nil {
		return d.checkpoint.Save(ctx, s)
	}
	return nil
}

// Read runs fn under the store's read lock. Concurrent scene goroutines must build
// their views (SelectView/AsmInput — anything reading shared store fields) inside it.
func (d *Director) Read(fn func()) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	fn()
}
