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
		{Name: "items.card", Domain: DomainItems, Level: "node", Keywords: []string{"card", "summary", "takeaway"}},
	}
}

func sel() *KeywordSelector { return NewKeywordSelector(&stubEngine{tools: realishCatalog()}) }

// expandedCatalog mirrors the REAL keyword sets (copied verbatim from the TS tool
// files) for a representative slice of every domain the catalog grew into across
// Roadmap A1-A4 (~90 tools total by A4; this is the subset most likely to collide on
// shared words like "graph"/"table"/"energy"/"line"). Roadmap A5: the offline
// selector must still discriminate correctly at this scale, not just against the
// original 7-tool fixture.
func expandedCatalog() []CatalogEntry {
	return []CatalogEntry{
		{Name: "math.functionGraph", Domain: DomainMath, Level: "node", Keywords: []string{
			"graph", "plot", "coordinate plane", "y = mx + b", "line", "slope", "parabola", "quadratic", "y = ax^2", "function", "curve", "points", "scatter",
		}},
		{Name: "math.numberLine", Domain: DomainMath, Level: "node", Keywords: []string{"number line", "interval"}},
		{Name: "math.balanceScale", Domain: DomainMath, Level: "node", Keywords: []string{
			"balance", "scale", "equation", "solve", "unknown", "variable", "equal", "compare", "weigh",
		}},
		{Name: "physics.rayDiagram", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"lens", "ray diagram", "optics", "focal length", "image formation", "converging", "diverging", "refraction",
		}},
		{Name: "physics.energyBars", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"energy", "kinetic", "potential", "conservation", "bar chart", "KE", "PE", "thermal",
		}},
		{Name: "physics.circuit", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"circuit", "series circuit", "resistor", "battery", "switch", "capacitor", "diode", "wire", "electricity", "voltage", "current",
		}},
		{Name: "physics.motionGraph", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"motion graph", "position vs time", "velocity vs time", "acceleration vs time", "position time graph", "velocity time graph", "kinematics", "moving man", "x-t graph", "v-t graph",
		}},
		{Name: "physics.vectorField", Domain: DomainPhysics, Level: "node", Keywords: []string{
			"vector field", "field lines", "electric field", "magnetic field", "gravitational field", "flow field", "field arrows", "vortex", "dipole field",
		}},
		{Name: "chem.energyDiagram", Domain: DomainChem, Level: "node", Keywords: []string{
			"energy diagram", "activation energy", "reaction coordinate", "transition state", "catalyst", "exothermic", "endothermic",
		}},
		{Name: "chem.periodicTable", Domain: DomainChem, Level: "node", Keywords: []string{
			"periodic table", "element", "atomic number", "group", "period", "metals", "nonmetals",
		}},
		{Name: "chem.molecule", Domain: DomainChem, Level: "node", Keywords: []string{
			"molecule", "structure", "compound", "smiles", "atoms", "bonds", "chemical structure",
		}},
		{Name: "diagram.table", Domain: DomainDiagram, Level: "node", Keywords: []string{
			"table", "grid", "rows", "columns", "data table", "spreadsheet",
		}},
		{Name: "diagram.flowchart", Domain: DomainDiagram, Level: "node", Keywords: []string{
			"flowchart", "flow chart", "process diagram", "steps", "boxes and arrows", "workflow",
		}},
		{Name: "chart.bar", Domain: DomainChart, Level: "node", Keywords: []string{
			"bar chart", "bars", "categories", "compare", "stacked bar", "data",
		}},
		{Name: "chart.line", Domain: DomainChart, Level: "node", Keywords: []string{
			"line chart", "trend", "time series", "plot", "series", "data over time",
		}},
		{Name: "chart.scatter", Domain: DomainChart, Level: "node", Keywords: []string{
			"scatter plot", "scatter chart", "correlation", "points", "distribution", "clusters",
		}},
		{Name: "items.card", Domain: DomainItems, Level: "node", Keywords: []string{"card", "summary", "takeaway"}},
	}
}

func expandedSel() *KeywordSelector { return NewKeywordSelector(&stubEngine{tools: expandedCatalog()}) }

// TestKeywordSelectorScalesAcrossExpandedCatalog proves keyword scoring (sum of
// matched-keyword lengths, longest/most-specific phrase wins) still discriminates
// correctly once the catalog holds many domains with overlapping vocabulary — e.g.
// "periodic table" (chem.periodicTable, 14 chars) must beat "table" (diagram.table,
// 5 chars) even though both match text containing "periodic table".
func TestKeywordSelectorScalesAcrossExpandedCatalog(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		goal string
		want string
	}{
		{"show the periodic table of elements and highlight sodium", "chem.periodicTable"},
		{"plot the line y = 2x + 1 on a coordinate plane", "math.functionGraph"},
		{"draw a ray diagram for a converging lens with focal length 10", "physics.rayDiagram"},
		{"show the reaction energy diagram with the activation energy peak", "chem.energyDiagram"},
		{"chart the quarterly revenue as a bar chart across categories", "chart.bar"},
		{"plot temperature as a line chart trend over time", "chart.line"},
		{"draw a scatter plot showing the correlation between two variables", "chart.scatter"},
		{"draw a flowchart of the steps in the process", "diagram.flowchart"},
		{"put the results in a data table with rows and columns", "diagram.table"},
		{"draw the molecule structure for water using smiles", "chem.molecule"},
		{"wire a series circuit with a battery and a resistor", "physics.circuit"},
		{"show the energy bars for kinetic and potential energy conservation", "physics.energyBars"},
		{"show the position vs time and velocity vs time motion graph for kinematics", "physics.motionGraph"},
		{"draw the electric field lines around a point charge as a vector field", "physics.vectorField"},
	}
	for _, c := range cases {
		got, err := expandedSel().Select(ctx, SelectorView{Beat: SceneBeat{Goal: c.goal}})
		if err != nil {
			t.Fatalf("%q: %v", c.goal, err)
		}
		if got[0].Builder != c.want {
			t.Errorf("%q: want %s, got %s", c.goal, c.want, got[0].Builder)
		}
	}
}

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
