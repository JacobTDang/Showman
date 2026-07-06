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
//	SHOWMAN_WEBHOOK_SECRET     HMAC-signs webhook deliveries when set (optional;
//	                           delivery still works unsigned without it)
//	SHOWMAN_WEBHOOK_ALLOWLIST  comma-separated hostnames exempt from the SSRF guard's
//	                           private/loopback-address check (optional, e.g. for
//	                           local dev against "localhost")
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/cloudwego/eino/compose"
	orch "showman/orchestrator"
)

func main() {
	engineURL := envOr("SHOWMAN_ENGINE_URL", "http://127.0.0.1:8080")
	port := envOr("PORT", "8090")
	outDir := envOr("SHOWMAN_OUT_DIR", "out")

	engine := orch.NewHTTPEngineClient(engineURL, 5*time.Minute)
	dataDir := os.Getenv("SHOWMAN_DATA_DIR")
	var checkpoint orch.CheckpointStore
	var byteStore compose.CheckPointStore
	if dataDir != "" {
		checkpoint = orch.NewFileCheckpointStore(dataDir)
		byteStore = orch.NewFileByteStore(dataDir)
	} else {
		checkpoint = orch.NewInMemoryCheckpointStore()
		byteStore = orch.NewEinoByteStore()
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

	var allowlist []string
	if raw := os.Getenv("SHOWMAN_WEBHOOK_ALLOWLIST"); raw != "" {
		for _, h := range strings.Split(raw, ",") {
			if h = strings.TrimSpace(h); h != "" {
				allowlist = append(allowlist, h)
			}
		}
	}

	pipeline := &orch.Pipeline{
		Director: orch.NewDirector(checkpoint, nil),
		Planner:  planner,
		Selector: selector,
		Engine:   engine,
		Stitcher: &orch.FFmpegStitcher{Fetcher: engine, OutDir: outDir},
		Webhook:  &orch.WebhookSender{Secret: os.Getenv("SHOWMAN_WEBHOOK_SECRET"), Allowlist: allowlist},
	}

	ctx := context.Background()
	graph, err := orch.BuildGenerateGraph(ctx, pipeline, byteStore)
	if err != nil {
		fmt.Fprintln(os.Stderr, "orchestrator: build graph:", err)
		os.Exit(1)
	}
	server := &orch.Server{Pipeline: pipeline, Graph: graph, Checkpoint: checkpoint}

	if resumed, err := server.ResumeIncompleteJobs(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "orchestrator: crash-resume scan:", err)
	} else if resumed > 0 {
		fmt.Printf("[showman-orchestrator] crash-resume: re-driving %d incomplete job(s)\n", resumed)
	}

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
