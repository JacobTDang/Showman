import { describe, expect, it } from "vitest";
import { checkConductorConnectivity } from "../../src/authoring/connectivity.js";
import { AuthoringAgent, ScriptedAuthor } from "../../src/authoring/agent.js";
import { loadPrompts } from "../../src/authoring/prompts.js";
import { createDefaultRegistry, validateScene } from "../../src/index.js";

const scene = (nodes: unknown[]) => ({
  specVersion: 1,
  width: 800,
  height: 450,
  fps: 30,
  duration: 5,
  seed: 1,
  background: "#ffffff",
  nodes,
});

const INK = "#334155";
const wire = (id: string, points: Array<{ x: number; y: number }>) => ({
  id,
  type: "polyline",
  x: 0,
  y: 0,
  points,
  stroke: INK,
  strokeWidth: 3,
});
const box = (id: string, x: number, y: number, width: number, height: number) => ({
  id,
  type: "rect",
  x,
  y,
  width,
  height,
  fill: "#fde68a",
  stroke: INK,
  strokeWidth: 3,
});
const label = (id: string, x: number, y: number, text: string) => ({ id, type: "text", x, y, text, fontSize: 18, fill: INK });
const dot = (id: string, x: number, y: number) => ({ id, type: "ellipse", x: x - 4.5, y: y - 4.5, width: 9, height: 9, fill: INK });

/**
 * The freehand Thevenin spec reported in issue #121, geometry verbatim: three component
 * boxes, six wire stubs with 50px holes on both sides of every component, and no return
 * path. The two terminal dots are included because the report counted them — a check that
 * only notices bare open ends would pass this by marking A and B as legitimate.
 */
const disconnectedThevenin = () =>
  scene([
    {
      id: "circuit",
      type: "group",
      x: 400,
      y: 225,
      children: [
        box("source", -200, -100, 40, 80),
        box("r1", -50, -140, 100, 40),
        box("r2", 150, -140, 100, 40),
        wire("w1", [
          { x: -180, y: -140 },
          { x: -100, y: -140 },
        ]),
        wire("w2", [
          { x: -180, y: -60 },
          { x: -100, y: -60 },
        ]),
        wire("w3", [
          { x: 50, y: -140 },
          { x: 100, y: -140 },
        ]),
        wire("w4", [
          { x: 50, y: -60 },
          { x: 100, y: -60 },
        ]),
        wire("w5", [
          { x: 250, y: -140 },
          { x: 300, y: -140 },
        ]),
        wire("w6", [
          { x: 250, y: -60 },
          { x: 300, y: -60 },
        ]),
        dot("term-a", 300, -140),
        dot("term-b", 300, -60),
        label("l-source", -180, -10, "12 V"),
        label("l-r1", 0, -160, "R1 = 4 kΩ"),
        label("l-r2", 200, -160, "R2 = 2 kΩ"),
        label("l-a", 315, -140, "A"),
        label("l-b", 315, -60, "B"),
      ],
    },
  ]);

/** The same circuit wired properly: one closed loop, every run meeting the next. */
const connectedLoop = () =>
  scene([
    {
      id: "circuit",
      type: "group",
      x: 400,
      y: 225,
      children: [
        box("source", -200, -100, 40, 80),
        box("r1", -50, -140, 100, 40),
        box("r2", 150, -140, 100, 40),
        wire("w1", [
          { x: -180, y: -100 },
          { x: -180, y: -140 },
          { x: -50, y: -140 },
        ]),
        wire("w2", [
          { x: 50, y: -140 },
          { x: 150, y: -140 },
        ]),
        wire("w3", [
          { x: 250, y: -140 },
          { x: 300, y: -140 },
          { x: 300, y: -60 },
        ]),
        wire("w4", [
          { x: 300, y: -60 },
          { x: -180, y: -60 },
          { x: -180, y: -20 },
        ]),
        label("l-source", -180, -10, "12 V"),
        label("l-r1", 0, -160, "R1 = 4 kΩ"),
        label("l-r2", 200, -160, "R2 = 2 kΩ"),
      ],
    },
  ]);

describe("checkConductorConnectivity — the reported defect", () => {
  it("fails the disconnected schematic from issue #121", () => {
    const check = checkConductorConnectivity(disconnectedThevenin());

    expect(check.status).toBe("failed");
    expect(check.passed).toBe(false);
    expect(check.stranded.length).toBeGreaterThanOrEqual(3);
    // The issue measured 50px holes; the worst is the wire that stops short of R2.
    expect(Math.max(...check.stranded.map((s) => s.gap))).toBeGreaterThanOrEqual(50);
  });

  it("measures a stranded endpoint against everything but its own conductor", () => {
    // An endpoint matched against its own polyline reads 0px and the check means nothing.
    const check = checkConductorConnectivity(disconnectedThevenin());
    const short = check.stranded.find((s) => s.x === 500 && s.y === 85);

    expect(short, `no stranded endpoint at the R1→R2 hole: ${JSON.stringify(check.stranded)}`).toBeDefined();
    expect(short!.gap).toBeCloseTo(50, 5);
    expect(check.stranded.every((s) => s.gap > 0)).toBe(true);
  });

  it("passes the same circuit once the runs actually meet", () => {
    const check = checkConductorConnectivity(connectedLoop());

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
  });
});

describe("checkConductorConnectivity — what it must not reject", () => {
  const registry = createDefaultRegistry();
  const built = (name: string, params: unknown) => scene([registry.invokeNode(name, params).node]);

  it("passes a series schematic drawn by physics.circuit", () => {
    const spec = built("physics.circuit", {
      elements: [
        { kind: "acSource", label: "12 V AC" },
        { kind: "diode", label: "D1" },
        { kind: "resistor", label: "R1 = 1 kΩ" },
      ],
    });
    const check = checkConductorConnectivity(spec);

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
  });

  // Criterion 2 of the issue: an open A–B pair is exactly what a Thevenin output is.
  it("passes a voltage divider whose A–B terminals are deliberately open", () => {
    const spec = built("physics.voltageDivider", { sourceLabel: "12 V", r1Label: "R1 = 4 kΩ", r2Label: "R2 = 2 kΩ" });
    const check = checkConductorConnectivity(spec);

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
  });

  // Criterion 3: a capacitor's plates and a ground symbol's bars are free-standing marks
  // with open ends by design. An early check treated every polyline as a wire and flagged them.
  it("passes an op-amp stage whose glyph strokes have open ends", () => {
    const spec = built("physics.opAmpStage", {
      inputKind: "resistor",
      feedbackKind: "capacitor",
      inputLabel: "R1 = 10 kΩ",
      feedbackLabel: "C1 = 100 nF",
    });
    const check = checkConductorConnectivity(spec);

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
  });

  it("passes a circuit whose switch blade is lifted away from its contact", () => {
    // An open switch's blade is a long stroke hinged at one end and deliberately not
    // touching the other. It is drawn at an angle; wiring runs square, and that is what
    // keeps the blade out of the conductor set.
    const spec = built("physics.circuit", {
      elements: [
        { kind: "battery", label: "9 V" },
        { kind: "switch", label: "S1" },
        { kind: "lamp", label: "L1" },
      ],
    });
    const check = checkConductorConnectivity(spec);

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
  });

  it("passes a freehand loop whose symbol strokes have open ends", () => {
    // Drawn by hand rather than by a builder: a capacitor as two plates struck through by
    // the rail, and a polarity tick rising off the rail beside the source. Both are
    // free-standing marks with open ends — the trap that made an early check flag every
    // polyline as a wire.
    const check = checkConductorConnectivity(
      scene([
        box("load", 240, 80, 120, 40),
        wire("w-t1", [
          { x: 100, y: 100 },
          { x: 240, y: 100 },
        ]),
        wire("w-t2", [
          { x: 360, y: 100 },
          { x: 500, y: 100 },
        ]),
        wire("w-r1", [
          { x: 500, y: 100 },
          { x: 500, y: 170 },
        ]),
        wire("w-r2", [
          { x: 500, y: 190 },
          { x: 500, y: 260 },
        ]),
        wire("w-b", [
          { x: 500, y: 260 },
          { x: 100, y: 260 },
        ]),
        wire("w-l", [
          { x: 100, y: 260 },
          { x: 100, y: 100 },
        ]),
        wire("c-plate1", [
          { x: 470, y: 170 },
          { x: 530, y: 170 },
        ]),
        wire("c-plate2", [
          { x: 470, y: 190 },
          { x: 530, y: 190 },
        ]),
        wire("polarity", [
          { x: 150, y: 100 },
          { x: 150, y: 80 },
        ]),
        label("l-load", 250, 60, "R1 = 220 Ω"),
        label("l-cap", 545, 180, "C1 = 100 nF"),
      ]),
    );

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
    // Six rails; the plates and the tick are marks, not wiring.
    expect(check.conductors).toBe(6);
  });

  it("accepts a freehand open terminal marked with a dot", () => {
    const check = checkConductorConnectivity(
      scene([
        box("r1", 200, 180, 100, 40),
        wire("w-in", [
          { x: 100, y: 200 },
          { x: 200, y: 200 },
        ]),
        wire("w-out", [
          { x: 300, y: 200 },
          { x: 420, y: 200 },
        ]),
        wire("w-ret", [
          { x: 100, y: 200 },
          { x: 100, y: 320 },
          { x: 420, y: 320 },
        ]),
        dot("term-a", 420, 200),
        dot("term-b", 420, 320),
        label("l-r1", 210, 160, "R1 = 4 kΩ"),
        label("l-a", 435, 200, "A"),
      ]),
    );

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
  });

  it("does not treat a plotted curve and its axes as a conductor network", () => {
    // An RC lesson that draws only the charging curve has no schematic to check, even
    // though its title says "circuit".
    const curve = Array.from({ length: 40 }, (_, i) => ({ x: 120 + i * 12, y: 360 - 220 * (1 - Math.exp(-i / 12)) }));
    const check = checkConductorConnectivity(
      scene([
        wire("axis-x", [
          { x: 120, y: 360 },
          { x: 700, y: 360 },
        ]),
        wire("axis-y", [
          { x: 120, y: 360 },
          { x: 120, y: 80 },
        ]),
        wire("curve", curve),
        label("title", 400, 40, "RC charging circuit"),
        label("eq", 400, 400, "V_C(t) = V(1 − e^(−t/RC))"),
      ]),
    );

    expect(check.status).toBe("unchecked");
    expect(check.stranded).toEqual([]);
  });

  it("passes a schematic drawn beside its charging curve", () => {
    // The archetypal electronics lesson puts a circuit next to a plot. The plot's axes are
    // long straight runs that end in mid-air by design; judging them as wiring failed a
    // scene whose schematic is perfectly connected.
    const curve = Array.from({ length: 30 }, (_, i) => ({ x: 460 + i * 8, y: 380 - 200 * (1 - Math.exp(-i / 9)) }));
    const check = checkConductorConnectivity(
      scene([
        box("r1", 120, 100, 90, 36),
        wire("s1", [
          { x: 60, y: 118 },
          { x: 120, y: 118 },
        ]),
        wire("s2", [
          { x: 210, y: 118 },
          { x: 300, y: 118 },
          { x: 300, y: 260 },
        ]),
        wire("s3", [
          { x: 300, y: 260 },
          { x: 60, y: 260 },
          { x: 60, y: 118 },
        ]),
        wire("axis-x", [
          { x: 460, y: 380 },
          { x: 760, y: 380 },
        ]),
        wire("axis-y", [
          { x: 460, y: 380 },
          { x: 460, y: 140 },
        ]),
        wire("curve", curve),
        label("l-r1", 130, 80, "R1 = 10 kΩ"),
      ]),
    );

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
    // The axes are not wiring, so they are not among the runs judged.
    expect(check.conductors).toBe(3);
  });

  it("does not read a bar chart's axes and gridlines as wiring", () => {
    // Bars rest across an axis rather than terminating on it, so the axis never joins the
    // component network — even though the title says R1.
    const check = checkConductorConnectivity(
      scene([
        wire("axis-x", [
          { x: 100, y: 380 },
          { x: 700, y: 380 },
        ]),
        wire("axis-y", [
          { x: 100, y: 380 },
          { x: 100, y: 100 },
        ]),
        wire("grid1", [
          { x: 100, y: 300 },
          { x: 700, y: 300 },
        ]),
        wire("grid2", [
          { x: 100, y: 220 },
          { x: 700, y: 220 },
        ]),
        box("bar1", 150, 260, 60, 120),
        box("bar2", 250, 200, 60, 180),
        label("t", 400, 60, "Current through R1"),
      ]),
    );

    expect(check.status).toBe("unchecked");
    expect(check.stranded).toEqual([]);
  });

  it("leaves the authoring prompt's own worked examples alone", () => {
    // The example is the one spec the model is told to study. Its labelled RC diagram is a
    // single wire with two boxes on it — not a schematic, and it must not be gated as one.
    const specs = [
      ...loadPrompts()
        .system("schema")
        .matchAll(/^\{"specVersion".*$/gm),
    ].map((m) => JSON.parse(m[0]!));
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(checkConductorConnectivity(spec).status, `${JSON.stringify(spec).slice(0, 80)}`).not.toBe("failed");
    }
  });

  it("leaves a scene with no polylines unchecked", () => {
    expect(checkConductorConnectivity(scene([box("r1", 10, 10, 100, 40), label("l", 10, 80, "R1 = 4 kΩ")])).status).toBe("unchecked");
  });

  it("does not judge a flowchart, whose connectors are the same shape as wiring", () => {
    // Boxes joined by orthogonal runs, and one connector genuinely stops short. Geometry
    // alone cannot tell this from a schematic, so the check reads the scene's notation:
    // nothing here is electrical, and connectivity is not this scene's contract.
    const check = checkConductorConnectivity(
      scene([
        box("s1", 100, 60, 160, 60),
        box("s2", 100, 220, 160, 60),
        box("s3", 400, 220, 160, 60),
        box("s4", 400, 60, 160, 60),
        wire("c1", [
          { x: 180, y: 120 },
          { x: 180, y: 220 },
        ]),
        wire("c2", [
          { x: 260, y: 250 },
          { x: 400, y: 250 },
        ]),
        // Stops 40px short of s4.
        wire("c3", [
          { x: 480, y: 220 },
          { x: 480, y: 160 },
        ]),
        label("t1", 110, 90, "Validate the spec"),
        label("t2", 110, 250, "Repair it"),
        label("t3", 410, 250, "Retry"),
        label("t4", 410, 90, "Publish"),
      ]),
    );

    expect(check.status).toBe("unchecked");
  });

  it("does not judge a single labelled component with one lead", () => {
    // A close-up of one part is a fragment, not a circuit; two runs cannot make a loop.
    const check = checkConductorConnectivity(
      scene([
        box("r1", 300, 200, 120, 48),
        wire("lead", [
          { x: 180, y: 224 },
          { x: 300, y: 224 },
        ]),
        label("l", 310, 180, "R1 = 10 kΩ"),
      ]),
    );

    expect(check.status).toBe("unchecked");
  });

  it("accepts a rail loop drawn as a single polyline back to its start", () => {
    // Both endpoints land on the same point, and a tap joins the rail part-way along.
    const check = checkConductorConnectivity(
      scene([
        wire("loop", [
          { x: 100, y: 100 },
          { x: 500, y: 100 },
          { x: 500, y: 300 },
          { x: 100, y: 300 },
          { x: 100, y: 100 },
        ]),
        wire("tap", [
          { x: 300, y: 100 },
          { x: 300, y: 200 },
        ]),
        wire("tap2", [
          { x: 300, y: 200 },
          { x: 500, y: 200 },
        ]),
        box("r1", 260, 180, 80, 40),
        label("l", 110, 80, "R1 = 4 kΩ battery loop"),
      ]),
    );

    expect(check.stranded).toEqual([]);
  });
});

describe("checkConductorConnectivity — geometry", () => {
  it("judges a rotated subtree in scene coordinates", () => {
    // The renderer rotates about the anchor after translating; reading the raw points
    // would measure a circuit that is not the one drawn.
    const upright = checkConductorConnectivity(disconnectedThevenin());
    const rotated = checkConductorConnectivity(
      scene([{ id: "spin", type: "group", x: 0, y: 0, rotation: 90, anchor: { x: 400, y: 225 }, children: disconnectedThevenin().nodes }]),
    );

    expect(rotated.status).toBe("failed");
    expect(rotated.stranded.map((s) => Math.round(s.gap)).sort()).toEqual(upright.stranded.map((s) => Math.round(s.gap)).sort());
  });

  it("accepts a run that ends part-way along another run", () => {
    // A T-junction is real wiring: the shunt meets the rail between its endpoints.
    const check = checkConductorConnectivity(
      scene([
        box("r1", 200, 100, 100, 40),
        box("r2", 330, 200, 40, 100),
        wire("rail-in", [
          { x: 100, y: 120 },
          { x: 200, y: 120 },
        ]),
        wire("rail-out", [
          { x: 300, y: 120 },
          { x: 400, y: 120 },
        ]),
        // Meets rail-out between its endpoints, 45px from the nearest endpoint anywhere.
        wire("shunt", [
          { x: 350, y: 120 },
          { x: 350, y: 200 },
        ]),
        wire("ret", [
          { x: 350, y: 300 },
          { x: 100, y: 300 },
          { x: 100, y: 120 },
        ]),
        dot("term-a", 400, 120),
        label("l-r1", 210, 80, "R1 = 4 kΩ"),
        label("l-r2", 350, 240, "R2 = 2 kΩ"),
      ]),
    );

    expect(check.stranded).toEqual([]);
    expect(check.status).toBe("passed");
  });
});

describe("the authoring loop refuses a disconnected schematic", () => {
  /** Minimal ShowmanClient: real validation, no rendering. */
  const stubClient = () =>
    ({
      getSchema: async () => ({}) as never,
      validate: async (spec: unknown) => validateScene(spec as never),
      preview: async () => ({ ok: true, errors: [] }),
      submit: async () => ({ ok: true, jobId: "job-1", errors: [] }),
    }) as never;

  // Deliberately names NO topology. A brief that does ("thevenin equivalent", "rectifier",
  // "integrator", ...) is routed to a catalog builder before this gate runs, which replaces
  // the freehand drawing outright -- so the gate never sees it, and these tests would pass
  // for the wrong reason. The gate exists for what routing declines. There is a test below
  // pinning that split; do not "fix" this brief by naming the topology.
  const brief = "Explain how R1 = 4 kilohm and R2 = 2 kilohm share a 12 V source between terminals A and B";

  it("both fixtures are valid specs, so only connectivity is under test", () => {
    expect(validateScene(disconnectedThevenin() as never).errors).toEqual([]);
    expect(validateScene(connectedLoop() as never).errors).toEqual([]);
  });

  it("burns a retry on the disconnected spec and publishes the corrected one", async () => {
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([disconnectedThevenin(), connectedLoop()]));
    const result = await agent.authorSpec(brief);

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.history[0]?.connectivity?.status).toBe("failed");
    expect(result.history[1]?.connectivity?.status).toBe("passed");
  });

  it("hands the author the coordinates it has to move", async () => {
    // The whole reason this fails an attempt rather than repairing the spec: the model
    // wrote those numbers and can move them, which a text measurement could never be.
    const notes: string[] = [];
    const author = {
      async propose(_brief: string, ctx: { feedback?: { note?: string } }) {
        if (ctx.feedback?.note) notes.push(ctx.feedback.note);
        return disconnectedThevenin();
      },
    };
    await new AuthoringAgent(stubClient(), author, { maxAttempts: 2 }).authorSpec(brief);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("(500, 85)");
    expect(notes[0]).toMatch(/50px/);
    expect(notes[0]).toMatch(/physics\.circuit/);
  });

  // The split between the two mechanisms, stated once so neither can drift silently.
  it("does not reach the gate when the brief names a topology, because routing fixes it first", async () => {
    const routable = "Explain the Thevenin equivalent of a resistive network with a 12 V source, R1 = 4 kilohm and R2 = 2 kilohm";
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([disconnectedThevenin()]), { maxAttempts: 1 });
    const result = await agent.authorSpec(routable);

    // Same disconnected drawing, but the builder replaced it, so there is nothing to fail on.
    expect(result.ok).toBe(true);
    expect(result.history[0]?.connectivity?.status).not.toBe("failed");
  });

  it("fails rather than publishing when the schematic stays disconnected", async () => {
    const agent = new AuthoringAgent(stubClient(), new ScriptedAuthor([disconnectedThevenin()]), { maxAttempts: 2 });
    const result = await agent.authorSpec(brief);

    expect(result.ok).toBe(false);
    expect(result.spec).toBeUndefined();
    expect(result.history).toHaveLength(2);
    expect(result.history.every((h) => h.connectivity?.status === "failed")).toBe(true);
  });
});

describe("checkConductorConnectivity — wires drawn as SVG paths", () => {
  /** The same spec with every polyline redrawn as an equivalent path node. */
  const asPaths = (spec: any): any => {
    const convert = (n: any): any => {
      if (n?.type === "polyline" && Array.isArray(n.points)) {
        const { points, ...rest } = n;
        return { ...rest, type: "path", d: points.map((p: any, i: number) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") };
      }
      if (Array.isArray(n?.children)) return { ...n, children: n.children.map(convert) };
      return n;
    };
    return { ...spec, nodes: spec.nodes.map(convert) };
  };

  // The gate measured polylines only, so a schematic whose wires were drawn as paths
  // found no conductors and came back "unchecked" -- the defect it exists to catch,
  // waved through because of the node type the author happened to pick.
  it("fails the disconnected schematic when its wires are paths", () => {
    const check = checkConductorConnectivity(asPaths(disconnectedThevenin()));
    expect(check.status).toBe("failed");
    expect(check.status === "failed" && check.stranded.length).toBeGreaterThan(0);
  });

  it("passes the connected loop when its wires are paths", () => {
    expect(checkConductorConnectivity(asPaths(connectedLoop())).status).toBe("passed");
  });

  it("reads a path with several subpaths as several runs", () => {
    // Three disjoint stubs in ONE path node, each leaving a component and stopping short
    // of the next: every one of them must be found, not just the first subpath.
    const spec = scene([
      box("src", 40, 100, 40, 40),
      box("r1", 200, 100, 100, 40),
      box("r2", 400, 100, 100, 40),
      { id: "all", type: "path", x: 0, y: 0, d: "M 80 120 L 150 120 M 300 120 L 350 120 M 500 120 L 560 120", stroke: INK, strokeWidth: 3 },
      label("l0", 60, 80, "12 V"),
      label("l1", 250, 80, "R1 = 4 kΩ"),
      label("l2", 450, 80, "R2 = 2 kΩ"),
    ]);
    const check = checkConductorConnectivity(spec);
    expect(check.status).toBe("failed");
    expect(check.status === "failed" && check.stranded.length).toBe(3);
  });
});

describe("checkConductorConnectivity — arc-drawn components", () => {
  // A round meter face drawn as an arc is a component body like any other. Routing already
  // treats it as one; the gate did not, so a wire that met it read as stranded.
  it("accepts a wire that ends on an arc-drawn body", () => {
    const meterX = 300;
    const meterY = 100;
    const r = 20;
    const spec = scene([
      box("src", 40, 100, 40, 40),
      box("r1", 160, 100, 80, 40),
      { id: "meter", type: "arc", x: meterX, y: meterY, radius: r, stroke: INK, strokeWidth: 3 },
      wire("w1", [
        { x: 80, y: 120 },
        { x: 160, y: 120 },
      ]),
      wire("w2", [
        { x: 240, y: 120 },
        { x: meterX, y: 120 },
      ]),
      wire("w3", [
        { x: meterX + 2 * r, y: 120 },
        { x: 420, y: 120 },
      ]),
      wire("w4", [
        { x: 420, y: 120 },
        { x: 420, y: 200 },
      ]),
      wire("w5", [
        { x: 420, y: 200 },
        { x: 60, y: 200 },
      ]),
      wire("w6", [
        { x: 60, y: 200 },
        { x: 60, y: 140 },
      ]),
      label("l0", 60, 80, "12 V"),
      label("l1", 200, 80, "R1 = 4 kΩ"),
      label("l2", 320, 70, "V"),
    ]);
    expect(checkConductorConnectivity(spec).status).toBe("passed");
  });
});
