package orchestrator

import (
	"context"
	"encoding/json"
	"testing"
)

// stubEngine serves a fixed catalog (mirroring the real tools' names/keywords) without HTTP.
type stubEngine struct{ tools []CatalogEntry }

func (s *stubEngine) Catalog(_ context.Context, domain Domain) ([]CatalogEntry, error) {
	if domain == "" {
		return s.tools, nil
	}
	var out []CatalogEntry
	for _, t := range s.tools {
		if t.Domain == domain {
			out = append(out, t)
		}
	}
	return out, nil
}
func (s *stubEngine) CatalogDigest(context.Context, Domain) (string, error) { return "digest", nil }
func (s *stubEngine) Build(context.Context, BuildRequest) (BuildResult, error) {
	return BuildResult{}, nil
}
func (s *stubEngine) Assemble(context.Context, AssembleRequest) (AssembleResult, error) {
	return AssembleResult{OK: true, Spec: json.RawMessage(`{}`), SpecHash: "h"}, nil
}
func (s *stubEngine) Render(context.Context, RenderRequest) (RenderResult, error) {
	return RenderResult{}, nil
}

func realishCatalog() []CatalogEntry {
	return []CatalogEntry{
		{Name: "math.numberLine", Domain: DomainMath, Level: "node", Keywords: []string{"number line", "interval"}},
		{Name: "math.fractionLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"fraction", "pie", "numerator", "denominator"}},
		{Name: "math.graphingLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"graph", "line", "slope", "y = mx + b", "coordinate plane", "plot"}},
		{Name: "math.quadraticLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"quadratic", "parabola", "vertex"}},
		{Name: "math.countingLesson", Domain: DomainMath, Level: "scene", Keywords: []string{"count", "counting", "how many"}},
		{Name: "chem.reaction", Domain: DomainChem, Level: "node", Keywords: []string{"reaction", "chemical equation", "combustion"}},
	}
}

func sel() *KeywordSelector { return NewKeywordSelector(&stubEngine{tools: realishCatalog()}) }

func TestKeywordSelectorPicksByKeywordsAndExtractsParams(t *testing.T) {
	ctx := context.Background()

	got, err := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "graph the line y = 2x + 1 on a coordinate plane"}})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Builder != "math.graphingLesson" {
		t.Fatalf("want graphingLesson, got %s", got[0].Builder)
	}
	if got[0].Params["m"] != 2.0 || got[0].Params["b"] != 1.0 {
		t.Fatalf("slope/intercept not extracted: %+v", got[0].Params)
	}

	frac, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "show the fraction 3/4 as a pie"}})
	if frac[0].Builder != "math.fractionLesson" || frac[0].Params["numerator"] != 3 || frac[0].Params["denominator"] != 4 {
		t.Fatalf("fraction extraction failed: %+v", frac[0])
	}

	count, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "teach counting to 7 with stars"}})
	if count[0].Builder != "math.countingLesson" || count[0].Params["count"] != 7 {
		t.Fatalf("count extraction failed: %+v", count[0])
	}
}

func TestKeywordSelectorHonorsDomainHintAndWidens(t *testing.T) {
	ctx := context.Background()

	chem, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "show the combustion reaction", DomainHint: DomainChem}})
	if chem[0].Builder != "chem.reaction" {
		t.Fatalf("domain hint not honored: %+v", chem[0])
	}

	// A chem-hinted beat whose text only matches a math tool: widen beyond the hint.
	widened, _ := sel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: "plot a parabola", DomainHint: DomainChem}})
	if widened[0].Builder != "math.quadraticLesson" {
		t.Fatalf("expected widening to find quadraticLesson, got %+v", widened[0])
	}
}

func TestKeywordSelectorFallsBackToCounting(t *testing.T) {
	got, err := sel().Select(context.Background(), SelectorView{Beat: SceneBeat{Goal: "zzz nothing matches this"}})
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Builder != "math.countingLesson" {
		t.Fatalf("expected counting fallback, got %+v", got[0])
	}
}
