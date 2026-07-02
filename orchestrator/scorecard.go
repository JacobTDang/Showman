package orchestrator

// Scorecard is the per-job quality summary (Graph Perfection P6): the source
// distribution ("85% builder / 10% free-author / 5% fallback") is the single best
// health metric for whether the catalog + ladder are working; degraded and cached
// rates track reliability and cost. Computed from the store, surfaced on the JobView
// once the job completes, and regression-tracked by the evals.
type Scorecard struct {
	Scenes       int     `json:"scenes"`
	SourceDist   Dist    `json:"sourceDist"`
	DegradedRate float64 `json:"degradedRate"`
	CachedRate   float64 `json:"cachedRate"`
	RepairRate   float64 `json:"repairRate"` // scenes that needed the re-correct rung
}

// Dist is the per-source scene share (each 0..1; sums to 1 for non-empty jobs).
type Dist struct {
	Builder    float64 `json:"builder"`
	FreeAuthor float64 `json:"freeAuthor"`
	Fallback   float64 `json:"fallback"`
}

// ComputeScorecard summarizes a completed (or in-flight) job's scenes.
func ComputeScorecard(s *JobContext) Scorecard {
	n := len(s.Scenes)
	if n == 0 {
		return Scorecard{}
	}
	var builder, free, fallback, degraded, cached, repaired int
	for _, sc := range s.Scenes {
		switch sc.Outcome.Source {
		case SourceFreeAuthor:
			free++
		case SourceFallback:
			fallback++
		default:
			builder++
		}
		if sc.Outcome.Degraded {
			degraded++
		}
		if sc.Outcome.Rung >= 2 && !sc.Outcome.Degraded {
			repaired++
		}
		if sc.Render != nil && sc.Render.Cached {
			cached++
		}
	}
	f := func(count int) float64 { return float64(count) / float64(n) }
	return Scorecard{
		Scenes:       n,
		SourceDist:   Dist{Builder: f(builder), FreeAuthor: f(free), Fallback: f(fallback)},
		DegradedRate: f(degraded),
		CachedRate:   f(cached),
		RepairRate:   f(repaired),
	}
}
