package gateway

import (
	"fmt"
	"net/http"
	"sort"
	"sync"
)

// metrics is a tiny in-process counter registry rendered in Prometheus text format.
// Enough to surface gateway health (request volume, policy rejections, upstream
// errors) without pulling in a metrics dependency.
type metrics struct {
	mu       sync.Mutex
	counters map[string]int64
}

func newMetrics() *metrics {
	return &metrics{counters: map[string]int64{}}
}

func (m *metrics) inc(name string) {
	m.mu.Lock()
	m.counters[name]++
	m.mu.Unlock()
}

// render writes the registry in Prometheus exposition format.
func (m *metrics) render(w http.ResponseWriter) {
	m.mu.Lock()
	keys := make([]string, 0, len(m.counters))
	for k := range m.counters {
		keys = append(keys, k)
	}
	snapshot := make(map[string]int64, len(m.counters))
	for k, v := range m.counters {
		snapshot[k] = v
	}
	m.mu.Unlock()

	sort.Strings(keys)
	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	w.WriteHeader(http.StatusOK)
	for _, k := range keys {
		fmt.Fprintf(w, "showman_gateway_%s %d\n", k, snapshot[k])
	}
}
