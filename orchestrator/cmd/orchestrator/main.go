// The orchestrator service: {topic, query} in, a finished multi-scene video out.
// With OPENROUTER_API_KEY set, the LLM planner + selector run first (Eino ChatModel,
// OpenAI-compatible endpoint); the offline tiers (stub planner + keyword selector)
// remain the fallback rungs, so the service always works without a key.
//
// Env:
//
//	PORT                 listen port (default 8090)
//	SHOWMAN_ENGINE_URL   engine base URL (default http://127.0.0.1:8080)
//	SHOWMAN_OUT_DIR      final-video output dir (default ./out)
//	SHOWMAN_DATA_DIR     when set, job checkpoints persist to {dir}/contexts/*.json
//	                     (survives a restart); unset -> in-memory (test/dev default,
//	                     lost on exit)
//	SHOWMAN_PROMPT_DIR   override dir for planner/selector prompts (optional)
//	OPENROUTER_API_KEY   enables the LLM tiers (optional)
//	OPENROUTER_BASE_URL  OpenAI-compatible endpoint (default openrouter.ai/api/v1)
//	OPENROUTER_MODEL     model id (default openai/gpt-oss-120b)
package main

import (
	"context"
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
	var checkpoint orch.CheckpointStore
	if dataDir := os.Getenv("SHOWMAN_DATA_DIR"); dataDir != "" {
		checkpoint = orch.NewFileCheckpointStore(dataDir)
	} else {
		checkpoint = orch.NewInMemoryCheckpointStore()
	}

	// Tiered planner/selector: LLM first when a key is configured, offline always last.
	var planner orch.LessonPlanner = orch.StubPlanner{}
	var selector orch.DomainSelector = orch.NewKeywordSelector(engine)
	chat, err := orch.NewOpenAIChatModel(context.Background(), os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, "orchestrator: chat model:", err)
		os.Exit(1)
	}
	llmEnabled := chat != nil
	if llmEnabled {
		planner = orch.FallbackPlanner{Tiers: []orch.LessonPlanner{&orch.LLMPlanner{Model: chat}, orch.StubPlanner{}}}
		selector = orch.FallbackSelector{Tiers: []orch.DomainSelector{&orch.LLMSelector{Model: chat, Engine: engine}, orch.NewKeywordSelector(engine)}}
	}

	pipeline := &orch.Pipeline{
		Director: orch.NewDirector(checkpoint, nil),
		Planner:  planner,
		Selector: selector,
		Engine:   engine,
		Stitcher: &orch.FFmpegStitcher{Fetcher: engine, OutDir: outDir},
	}
	server := &orch.Server{Pipeline: pipeline, Checkpoint: checkpoint}

	ln, _, err := server.Listen(":" + port)
	if err != nil {
		fmt.Fprintln(os.Stderr, "orchestrator: listen:", err)
		os.Exit(1)
	}
	fmt.Printf("[showman-orchestrator] listening on %s (engine %s, llm=%v)\n", ln.Addr(), engineURL, llmEnabled)
	select {} // serve forever
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
