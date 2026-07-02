// The orchestrator service: {topic, query} in, a finished multi-scene video out.
// Wires the offline pipeline (stub planner + keyword selector) against a running
// engine; the LLM planner/selector tiers arrive with the Eino integration.
//
// Env:
//
//	PORT                 listen port (default 8090)
//	SHOWMAN_ENGINE_URL   engine base URL (default http://127.0.0.1:8080)
//	SHOWMAN_OUT_DIR      final-video output dir (default ./out)
package main

import (
	"fmt"
	"os"
	"time"

	orch "showman/orchestrator"
)

func main() {
	engineURL := envOr("SHOWMAN_ENGINE_URL", "http://127.0.0.1:8080")
	port := envOr("PORT", "8090")
	outDir := envOr("SHOWMAN_OUT_DIR", "out")

	engine := orch.NewHTTPEngineClient(engineURL, 5*time.Minute)
	checkpoint := orch.NewInMemoryCheckpointStore()
	pipeline := &orch.Pipeline{
		Director: orch.NewDirector(checkpoint, nil),
		Planner:  orch.StubPlanner{},
		Selector: orch.NewKeywordSelector(engine),
		Engine:   engine,
		Stitcher: &orch.FFmpegStitcher{Fetcher: engine, OutDir: outDir},
	}
	server := &orch.Server{Pipeline: pipeline, Checkpoint: checkpoint}

	ln, _, err := server.Listen(":" + port)
	if err != nil {
		fmt.Fprintln(os.Stderr, "orchestrator: listen:", err)
		os.Exit(1)
	}
	fmt.Printf("[showman-orchestrator] listening on %s (engine %s)\n", ln.Addr(), engineURL)
	select {} // serve forever
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
