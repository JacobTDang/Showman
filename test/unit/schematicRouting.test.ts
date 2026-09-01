import { describe, expect, it } from "vitest";
import {
  selectSchematicBuilder,
  routeSchematicToBuilder,
  SCHEMATIC_PHRASES,
  type SchematicSelection,
} from "../../src/authoring/schematicRouting.js";
import { expandBuilderPlacements } from "../../src/authoring/builderPlacements.js";
import { defaultRegistry } from "../../src/catalog/index.js";
import { validateScene } from "../../src/validator/validate.js";
import { AuthoringAgent, ScriptedAuthor } from "../../src/authoring/agent.js";

const THEVENIN = "Explain the Thevenin equivalent of a resistive network with a 12 V source, R1 = 4 kilohm and R2 = 2 kilohm";

function labels(sel: SchematicSelection | null): string {
  return JSON.stringify(sel?.params ?? {});
}

describe("schematic selection", () => {
  it("routes a Thevenin brief to the shunt-topology divider", () => {
    const sel = selectSchematicBuilder({ brief: THEVENIN });
    expect(sel?.builder).toBe("physics.voltageDivider");
    expect(sel?.params["r1Label"]).toBe("R1 = 4 kΩ");
    expect(sel?.params["r2Label"]).toBe("R2 = 2 kΩ");
    expect(sel?.params["sourceLabel"]).toBe("12 V");
  });

  it("routes an integrator to a capacitor in the feedback path, not on the input", () => {
    const sel = selectSchematicBuilder({ brief: "Show an op-amp integrator with R = 10 kohm and C = 100 nF" });
    expect(sel?.builder).toBe("physics.opAmpStage");
    expect(sel?.params["inputKind"]).toBe("resistor");
    expect(sel?.params["feedbackKind"]).toBe("capacitor");
    expect(labels(sel)).toContain("10 kΩ");
    expect(labels(sel)).toContain("100 nF");
  });

  it("mirrors the elements for a differentiator", () => {
    const sel = selectSchematicBuilder({ brief: "Explain the op-amp differentiator" });
    expect(sel?.builder).toBe("physics.opAmpStage");
    expect(sel?.params["inputKind"]).toBe("capacitor");
    expect(sel?.params["feedbackKind"]).toBe("resistor");
  });

  it("routes a half-wave rectifier to a source, a diode and a load in series", () => {
    const sel = selectSchematicBuilder({ brief: "Explain a half-wave rectifier driving a 1 kohm load" });
    expect(sel?.builder).toBe("physics.circuit");
    expect((sel?.params["elements"] as Array<{ kind: string }>).map((e) => e.kind)).toEqual(["acSource", "diode", "resistor"]);
  });

  it("routes an RC charging brief to a closed series RC loop", () => {
    const sel = selectSchematicBuilder({ brief: "Show how an RC charging circuit reaches 63.2% of the supply" });
    expect(sel?.builder).toBe("physics.circuit");
    expect((sel?.params["elements"] as Array<{ kind: string }>).map((e) => e.kind)).toEqual(["battery", "switch", "resistor", "capacitor"]);
  });

  // An unlabelled schematic makes the reader guess which box is which. When the brief
  // carries no values, the components still name themselves.
  it("names every component even when the brief gives no values", () => {
    const rc = selectSchematicBuilder({ brief: "Explain an RC charging circuit" });
    expect((rc?.params["elements"] as Array<{ label?: string }>).map((e) => e.label)).toEqual(["V", undefined, "R", "C"]);

    const divider = selectSchematicBuilder({ brief: "Explain a voltage divider" });
    expect(divider?.params["r1Label"]).toBe("R1");
    expect(divider?.params["r2Label"]).toBe("R2");

    const amp = selectSchematicBuilder({ brief: "Explain an op-amp integrator" });
    expect(amp?.params["inputLabel"]).toBe("R");
    expect(amp?.params["feedbackLabel"]).toBe("C");
  });

  it("declines a brief that names no circuit topology", () => {
    expect(selectSchematicBuilder({ brief: "Explain photosynthesis for a ninth grader" })).toBeNull();
  });

  // The bar that matters: a wrong builder is worse than no builder. Generic domain
  // vocabulary names a subject, not a topology, so it must not override freehand.
  it("declines a brief that is merely electrical", () => {
    expect(selectSchematicBuilder({ brief: "Explain the difference between voltage and current in a circuit" })).toBeNull();
    expect(selectSchematicBuilder({ brief: "What does a resistor do?" })).toBeNull();
  });

  it("declines when the brief names more than one topology", () => {
    expect(selectSchematicBuilder({ brief: "Compare a voltage divider with a half-wave rectifier" })).toBeNull();
  });

  // The composed author brief carries the pedagogy constraints, so a forbidden term
  // would otherwise select the very builder it forbids.
  it("never selects on a forbidden term", () => {
    expect(selectSchematicBuilder({ brief: "Explain gain in an amplifier", forbid: ["op-amp", "integrator"] })).toBeNull();
  });

  it("reads topic and mustShow as well as the brief", () => {
    const sel = selectSchematicBuilder({ brief: "Work the algebra through", topic: "Thevenin equivalent" });
    expect(sel?.builder).toBe("physics.voltageDivider");
  });

  it("only ever emits params its builder accepts", () => {
    const registry = defaultRegistry();
    expect(SCHEMATIC_PHRASES.length).toBeGreaterThan(5);
    for (const phrase of SCHEMATIC_PHRASES) {
      // "series circuit" names a topology but not its contents, so the brief supplies them.
      const sel = selectSchematicBuilder({ brief: `Explain the ${phrase} built from a battery, a resistor and a switch` });
      expect(sel, `phrase "${phrase}" selected nothing`).not.toBeNull();
      expect(() => registry.invokeNode(sel!.builder, sel!.params), `phrase "${phrase}"`).not.toThrow();
    }
  });
});

/**
 * The geometry reported on #121: three component boxes and six mutually disjoint
 * stubs, inside one group, with the algebra as separate text well below it.
 */
function freehandThevenin() {
  return {
    specVersion: 1,
    width: 960,
    height: 540,
    fps: 30,
    duration: 8,
    background: "#ffffff",
    nodes: [
      { id: "title", type: "text", x: 480, y: 40, text: "Thevenin equivalent", fontSize: 34, align: "center", baseline: "middle" },
      {
        id: "schematic",
        type: "group",
        x: 480,
        y: 260,
        children: [
          { id: "source", type: "rect", x: -200, y: -100, width: 40, height: 80, stroke: "#334155", strokeWidth: 3 },
          { id: "r1", type: "rect", x: -50, y: -140, width: 100, height: 40, stroke: "#334155", strokeWidth: 3 },
          { id: "r2", type: "rect", x: 150, y: -140, width: 100, height: 40, stroke: "#334155", strokeWidth: 3 },
          { id: "r1-label", type: "text", x: 0, y: -120, text: "R1 = 4 kΩ", fontSize: 18, align: "center", baseline: "middle" },
          { id: "r2-label", type: "text", x: 200, y: -120, text: "R2 = 2 kΩ", fontSize: 18, align: "center", baseline: "middle" },
          {
            id: "w1",
            type: "polyline",
            points: [
              { x: -180, y: -140 },
              { x: -100, y: -140 },
            ],
            stroke: "#334155",
          },
          {
            id: "w2",
            type: "polyline",
            points: [
              { x: -180, y: -60 },
              { x: -100, y: -60 },
            ],
            stroke: "#334155",
          },
          {
            id: "w3",
            type: "polyline",
            points: [
              { x: 50, y: -140 },
              { x: 100, y: -140 },
            ],
            stroke: "#334155",
          },
          {
            id: "w4",
            type: "polyline",
            points: [
              { x: 50, y: -60 },
              { x: 100, y: -60 },
            ],
            stroke: "#334155",
          },
          {
            id: "w5",
            type: "polyline",
            points: [
              { x: 250, y: -140 },
              { x: 300, y: -140 },
            ],
            stroke: "#334155",
          },
          {
            id: "w6",
            type: "polyline",
            points: [
              { x: 250, y: -60 },
              { x: 300, y: -60 },
            ],
            stroke: "#334155",
          },
        ],
      },
      { id: "eq1", type: "text", x: 480, y: 430, text: "V_Th = 12V × (2kΩ / 6kΩ) = 4V", fontSize: 26, align: "center", baseline: "middle" },
      { id: "eq2", type: "text", x: 480, y: 480, text: "R_Th = 1.33 kΩ", fontSize: 26, align: "center", baseline: "middle" },
    ],
  };
}

function walk(node: any, out: any[] = []): any[] {
  out.push(node);
  (node?.children ?? []).forEach((c: any) => walk(c, out));
  return out;
}

function allNodes(spec: any): any[] {
  return spec.nodes.flatMap((n: any) => walk(n));
}

describe("routing a freehand schematic to a builder", () => {
  const registry = defaultRegistry();
  const selection = () => selectSchematicBuilder({ brief: THEVENIN })!;

  it("removes the freehand line-art and the labels sitting on it", () => {
    const out = routeSchematicToBuilder(freehandThevenin(), selection(), registry);
    expect(out.routed).toBe(true);
    const ids = allNodes(out.spec).map((n) => n.id);
    for (const gone of ["w1", "w2", "w3", "w4", "w5", "w6", "source", "r1", "r2", "r1-label", "r2-label"]) {
      expect(ids, `${gone} should have been replaced`).not.toContain(gone);
    }
  });

  it("keeps the authored algebra and title, which sit outside the drawing", () => {
    const out = routeSchematicToBuilder(freehandThevenin(), selection(), registry);
    const ids = allNodes(out.spec).map((n) => n.id);
    expect(ids).toContain("title");
    expect(ids).toContain("eq1");
    expect(ids).toContain("eq2");
  });

  it("never mutates the spec it is given", () => {
    const input = freehandThevenin();
    routeSchematicToBuilder(input, selection(), registry);
    expect(allNodes(input).map((n) => n.id)).toContain("w1");
  });

  // The builder's own connectivity is pinned by physics-circuitTopology.test.ts. What
  // routing owns is that NO freehand wire survives to draw a second, disconnected circuit.
  it("leaves a builder placement and no freehand wires at all", () => {
    const routed = routeSchematicToBuilder(freehandThevenin(), selection(), registry).spec as any;
    expect(Array.isArray(routed.builders)).toBe(true);
    expect(routed.builders[0].builder).toBe("physics.voltageDivider");

    const expanded = expandBuilderPlacements(routed, registry);
    expect(expanded.errors).toEqual([]);
    expect(expanded.expanded).toEqual(["physics.voltageDivider"]);
    expect(validateScene(expanded.spec as any).errors).toEqual([]);

    const wires = allNodes(expanded.spec as any).filter((n) => n.type === "polyline");
    expect(wires.length).toBeGreaterThan(6);
    expect(wires.every((n) => String(n.id).startsWith("vd-"))).toBe(true);
  });

  it("places the builder where the freehand drawing was", () => {
    const routed = routeSchematicToBuilder(freehandThevenin(), selection(), registry).spec as any;
    const placement = routed.builders[0];
    // The wires spanned canvas x 300..780, y 120..200 -> centre (540, 160).
    const scale = placement.scale ?? 1;
    const cx = placement.x + (300 * scale) / 2;
    const cy = placement.y + (210 * scale) / 2;
    expect(Math.abs(cx - 540)).toBeLessThan(60);
    expect(Math.abs(cy - 160)).toBeLessThan(60);
  });

  // Freehand wires are drawn as a flat strip, so fitting the strip alone would shrink a
  // properly-proportioned schematic for no reason when the band around it is empty.
  it("grows into the free space around the drawing instead of fitting a flat strip", () => {
    const routed = routeSchematicToBuilder(freehandThevenin(), selection(), registry).spec as any;
    expect(routed.builders[0].scale ?? 1).toBe(1);
  });

  it("keeps the placement inside the canvas", () => {
    const spec = { ...freehandThevenin(), width: 360, height: 240 };
    const routed = routeSchematicToBuilder(spec, selection(), registry).spec as any;
    const p = routed.builders[0];
    const scale = p.scale ?? 1;
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x + 300 * scale).toBeLessThanOrEqual(360);
    expect(p.y + 210 * scale).toBeLessThanOrEqual(240);
  });

  // Half size is where the symbols stop reading. A schematic squeezed below that is not a
  // schematic, so the scene keeps whatever the author drew rather than gaining a smudge.
  it("declines a canvas too small to draw the schematic legibly", () => {
    const spec = { ...freehandThevenin(), width: 64, height: 64 };
    const out = routeSchematicToBuilder(spec, selection(), registry);
    expect(out.routed).toBe(false);
    expect(out.repairs).toEqual([]);
    expect((out.spec as any).builders).toBeUndefined();
    expect(allNodes(out.spec as any).map((n) => n.id)).toContain("w1");
  });

  it("reports what it replaced", () => {
    const out = routeSchematicToBuilder(freehandThevenin(), selection(), registry);
    expect(out.repairs.join(" ")).toMatch(/physics\.voltageDivider/);
  });

  it("places the builder in the emptiest band when nothing was drawn freehand", () => {
    const spec = {
      specVersion: 1,
      width: 960,
      height: 540,
      fps: 30,
      duration: 6,
      nodes: [
        { id: "title", type: "text", x: 480, y: 40, text: "Thevenin", fontSize: 34, align: "center", baseline: "middle" },
        { id: "eq", type: "text", x: 480, y: 500, text: "V_Th = 4 V", fontSize: 26, align: "center", baseline: "middle" },
      ],
    };
    const out = routeSchematicToBuilder(spec, selection(), registry);
    expect(out.routed).toBe(true);
    const ids = allNodes(out.spec as any).map((n) => n.id);
    expect(ids).toContain("title");
    expect(ids).toContain("eq");
    const p = (out.spec as any).builders[0];
    const scale = p.scale ?? 1;
    // Clear of the title band above and the equation band below.
    expect(p.y).toBeGreaterThan(60);
    expect(p.y + 210 * scale).toBeLessThan(480);
  });

  // Canvas-space reasoning is invalid under rotation, exactly as textFit treats it.
  it("leaves a rotated subtree alone", () => {
    const spec: any = freehandThevenin();
    spec.nodes[1].rotation = 15;
    const out = routeSchematicToBuilder(spec, selection(), registry);
    expect(allNodes(out.spec as any).map((n) => n.id)).toContain("w1");
  });
});

describe("the authoring loop routes without being asked to", () => {
  /** Minimal ShowmanClient: real validation, no rendering. */
  const stubClient = () =>
    ({
      getSchema: async () => ({}) as never,
      validate: async (spec: unknown) => validateScene(spec as never),
      preview: async () => ({ ok: true, errors: [] }),
      submit: async () => ({ ok: true, jobId: "job-1", errors: [] }),
    }) as never;

  it("hands a Thevenin brief to the builder even though the author drew it freehand", async () => {
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([freehandThevenin()]));
    const result = await agent.authorSpec({ brief: THEVENIN });

    expect(result.ok).toBe(true);
    const ids = allNodes(result.spec as any).map((n: any) => n.id);
    expect(ids).toContain("voltage-divider");
    expect(ids).not.toContain("w1");
    expect(ids).toContain("eq1");
    expect(result.history.at(-1)?.repaired?.join(" ")).toMatch(/physics\.voltageDivider/);
  });

  it("leaves a brief that names no topology exactly as the author drew it", async () => {
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([freehandThevenin()]));
    const result = await agent.authorSpec({ brief: "Explain equivalent resistance for R1 and R2" });

    expect(result.ok).toBe(true);
    const ids = allNodes(result.spec as any).map((n: any) => n.id);
    expect(ids).toContain("w1");
    expect(ids).not.toContain("voltage-divider");
    expect(result.history.at(-1)?.repaired).toBeUndefined();
  });
});
