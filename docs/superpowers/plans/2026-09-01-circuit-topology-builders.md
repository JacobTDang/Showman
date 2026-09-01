# Circuit Topology Builders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the catalog builders that can draw a shunt branch and an op-amp feedback path, so the two reported topologies `physics.circuit` cannot express become expressible with the topology correct by construction.

**Architecture:** One new symbol primitive (`opAmp`) in `src/physics/circuit.ts`, then two purpose-built node-level builders following the `physics.rcCharging` precedent — `physics.voltageDivider` and `physics.opAmpStage` — each composing existing symbols and wiring only to the terminals those symbols report.

**Tech Stack:** TypeScript (ESM, NodeNext — every relative import ends in `.js`), Zod for builder params, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-circuit-topology-builders-design.md`

## Global Constraints

- Relative imports MUST end in `.js`.
- **Wire only to reported terminals.** Never hardcode a coordinate that a symbol already reports — use `sym.a`, `sym.b`, `oa.inMinus`, `oa.inPlus`, `oa.out`. This is what makes connectivity structural rather than coincidental.
- **Every junction is an explicit shared endpoint.** Where three conductors meet, split the wires so three endpoints coincide at that point. A wire merely passing through a junction leaves the third wire's endpoint stranded.
- Builders are pure: same params in, byte-identical node out. No randomness, no `Date`.
- Element size 70 and stroke width match `physics.circuit`; op-amp size 90.
- `npm run verify` MUST pass before the final commit.
- Do NOT modify `src/authoring/`, `src/validator/`, or `src/engine/`. This change is confined to physics symbols and the catalog.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/physics/circuit.ts` | **Modify.** Add the `opAmp` symbol and its `OpAmpSymbol` type. |
| `src/catalog/physics/voltageDivider.tool.ts` | **Create.** The divider builder, plus the local `vertical()` helper. |
| `src/catalog/physics/opAmpStage.tool.ts` | **Create.** The op-amp stage builder. |
| `src/catalog/register.ts` | **Modify.** Register both tools. |
| `test/unit/physics-circuitTopology.test.ts` | **Create.** Tests for all three. |

---

### Task 1: The `opAmp` symbol

**Files:**
- Modify: `src/physics/circuit.ts`
- Test: `test/unit/physics-circuitTopology.test.ts`

**Interfaces:**
- Consumes: the module-private `poly` helper and `SW` constant already in `circuit.ts`.
- Produces: `export interface OpAmpSymbol { node: GroupNode; inMinus: Point; inPlus: Point; out: Point }` and `export function opAmp(opts: SymbolOptions): OpAmpSymbol`. Task 3 imports both.

- [ ] **Step 1: Write the failing test**

Create `test/unit/physics-circuitTopology.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { opAmp } from "../../src/physics/circuit.js";
import type { Node } from "../../src/spec/types.js";

/** Every polyline in a subtree, as its raw point list. */
function polylines(node: unknown, out: Array<Array<{ x: number; y: number }>> = []): Array<Array<{ x: number; y: number }>> {
  const n = node as { type?: string; points?: Array<{ x: number; y: number }>; children?: Node[] };
  if (n?.type === "polyline" && Array.isArray(n.points)) out.push(n.points);
  (n?.children ?? []).forEach((c) => polylines(c, out));
  return out;
}

/** Every wire endpoint in a subtree. */
function endpoints(node: unknown): Array<{ x: number; y: number }> {
  return polylines(node).flatMap((p) => [p[0]!, p[p.length - 1]!]);
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("opAmp symbol", () => {
  it("reports three distinct terminals with the output opposite the inputs", () => {
    const oa = opAmp({ id: "oa", x: 100, y: 100, size: 90 });
    expect(oa.inMinus).not.toEqual(oa.inPlus);
    expect(oa.inMinus.x).toBe(oa.inPlus.x);
    // Inputs on the left, output on the right.
    expect(oa.out.x).toBeGreaterThan(oa.inMinus.x);
    // Inverting input above non-inverting.
    expect(oa.inMinus.y).toBeLessThan(oa.inPlus.y);
    // Output vertically between the two inputs.
    expect(oa.out.y).toBeGreaterThan(oa.inMinus.y);
    expect(oa.out.y).toBeLessThan(oa.inPlus.y);
  });

  it("draws a triangle body, not a rectangle", () => {
    // The reported integrator drew its op-amp as a plain rounded rect.
    const body = polylines(opAmp({ id: "oa", x: 0, y: 0, size: 90 }).node).find((p) => p.length === 3);
    expect(body, "expected a 3-point body polyline").toBeDefined();
    const xs = body!.map((p) => p.x);
    const ys = body!.map((p) => p.y);
    // Two points share the left edge, the apex sits alone on the right.
    expect(xs.filter((x) => x === Math.min(...xs))).toHaveLength(2);
    expect(ys[2]).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2, 5);
  });

  it("marks the inverting and non-inverting inputs", () => {
    const texts: string[] = [];
    const walk = (n: any) => {
      if (n?.type === "text") texts.push(String(n.text));
      (n?.children ?? []).forEach(walk);
    };
    walk(opAmp({ id: "oa", x: 0, y: 0, size: 90 }).node);
    expect(texts).toContain("−");
    expect(texts).toContain("+");
  });

  it("puts every terminal at the end of a lead, so a wire meets a lead not an edge", () => {
    const oa = opAmp({ id: "oa", x: 100, y: 100, size: 90 });
    const ends = endpoints(oa.node);
    for (const t of [oa.inMinus, oa.inPlus, oa.out]) {
      expect(Math.min(...ends.map((e) => dist(e, t))), `no lead ends at ${JSON.stringify(t)}`).toBeLessThan(0.001);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/physics-circuitTopology.test.ts`
Expected: FAIL — `"opAmp" is not exported by "src/physics/circuit.ts"`.

- [ ] **Step 3: Write the implementation**

Append to `src/physics/circuit.ts`, after the `meter` function and before `WireOptions`:

```ts
/** An op-amp has three terminals, so it cannot use the a/b pair every two-terminal symbol reports. */
export interface OpAmpSymbol {
  node: GroupNode;
  /** Inverting input, at the end of its lead. */
  inMinus: Point;
  /** Non-inverting input, at the end of its lead. */
  inPlus: Point;
  /** Output, at the end of its lead. */
  out: Point;
}

/**
 * An op-amp: triangle body pointing right, inverting (−) above non-inverting (+) on the
 * left edge, output at the apex. Every terminal sits at the end of a short lead so a wire
 * meets a lead end rather than an arbitrary point on a sloped edge.
 */
export function opAmp(opts: SymbolOptions): OpAmpSymbol {
  const id = opts.id ?? "opamp";
  const { x, y } = opts;
  const size = opts.size ?? 90;
  const color = opts.color ?? "#1e293b";
  const lead = Math.round(size * 0.22);
  const minusY = y + size / 3;
  const plusY = y + (size * 2) / 3;
  const outY = y + size / 2;

  const children: Node[] = [
    {
      id: `${id}-body`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x, y },
        { x, y: y + size },
        { x: x + size, y: outY },
      ],
      closed: true,
      stroke: color,
      strokeWidth: SW,
    },
    poly(
      `${id}-lead-minus`,
      [
        { x: x - lead, y: minusY },
        { x, y: minusY },
      ],
      color,
    ),
    poly(
      `${id}-lead-plus`,
      [
        { x: x - lead, y: plusY },
        { x, y: plusY },
      ],
      color,
    ),
    poly(
      `${id}-lead-out`,
      [
        { x: x + size, y: outY },
        { x: x + size + lead, y: outY },
      ],
      color,
    ),
    mark(`${id}-mark-minus`, x + size * 0.17, minusY, "−", color),
    mark(`${id}-mark-plus`, x + size * 0.17, plusY, "+", color),
  ];

  if (opts.label !== undefined && opts.label.trim() !== "") {
    children.push({
      id: `${id}-lbl`,
      type: "text",
      x: x + size / 2,
      y: y - size * 0.16,
      text: opts.label,
      fontFamily: "Inter",
      fontWeight: 600,
      fontSize: 15,
      fill: color,
      align: "center",
      baseline: "middle",
    });
  }

  return {
    node: { id, type: "group", x: 0, y: 0, children },
    inMinus: { x: x - lead, y: minusY },
    inPlus: { x: x - lead, y: plusY },
    out: { x: x + size + lead, y: outY },
  };
}

/** A polarity glyph drawn just inside the op-amp's left edge. */
function mark(id: string, x: number, y: number, text: string, color: Color): Node {
  return {
    id,
    type: "text",
    x,
    y,
    text,
    fontFamily: "Inter",
    fontWeight: 700,
    fontSize: 16,
    fill: color,
    align: "center",
    baseline: "middle",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/unit/physics-circuitTopology.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/physics/circuit.ts test/unit/physics-circuitTopology.test.ts
git commit -m "feat(physics): add an op-amp symbol with named terminals"
```

---

### Task 2: `physics.voltageDivider`

**Files:**
- Create: `src/catalog/physics/voltageDivider.tool.ts`
- Modify: `src/catalog/register.ts`
- Test: `test/unit/physics-circuitTopology.test.ts`

**Interfaces:**
- Consumes: `resistor`, `battery`, `acSource`, `wire`, `CircuitSymbol`, `Point` from `src/physics/circuit.js`; `BuilderTool` from `src/catalog/types.js`.
- Produces: `export const voltageDividerTool: BuilderTool<DividerParams>` registered as `physics.voltageDivider`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/physics-circuitTopology.test.ts`:

```ts
import { createDefaultRegistry, validateScene } from "../../src/index.js";

const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol = 0.001) => dist(a, b) < tol;

describe("physics.voltageDivider", () => {
  const build = () =>
    createDefaultRegistry().invokeNode("physics.voltageDivider", {
      sourceLabel: "12 V",
      r1Label: "R1 = 4 kΩ",
      r2Label: "R2 = 2 kΩ",
    });

  it("leaves no wire endpoint stranded", () => {
    const ends = endpoints(build().node);
    expect(ends.length).toBeGreaterThan(8);
    const nearest = (e: { x: number; y: number }) => Math.min(...ends.filter((o) => o !== e).map((o) => dist(o, e)));
    // Symbol glyphs leave a small draughting gap at their leads; the freehand output this
    // replaces had 50px gaps and no return path at all.
    expect(Math.max(...ends.map(nearest))).toBeLessThan(15);
  });

  // THE criterion-2 test: this fails if R2 is placed in series after R1.
  it("draws R2 as a shunt across the output, not in series", () => {
    const segments = polylines(build().node);
    const ends = endpoints(build().node);

    const ys = ends.map((p) => p.y);
    const topY = Math.min(...ys);
    const botY = Math.max(...ys);

    // A vertical run exists that spans most of the rail gap somewhere in the middle of the
    // circuit — that is the shunt branch. A series R2 would have no such vertical run.
    const verticals = segments.filter((p) => Math.abs(p[0]!.x - p[p.length - 1]!.x) < 0.001);
    const shunt = verticals.filter((p) => p[0]!.x > topY && p[0]!.x < Math.max(...ends.map((e) => e.x)));
    expect(shunt.length, "expected a vertical branch between the rails").toBeGreaterThan(0);

    // The branch's column carries conductors touching BOTH rails.
    const columnX = shunt[0]![0]!.x;
    const inColumn = ends.filter((p) => Math.abs(p.x - columnX) < 0.001);
    expect(inColumn.some((p) => Math.abs(p.y - topY) < 0.001), "shunt does not reach the top rail").toBe(true);
    expect(inColumn.some((p) => Math.abs(p.y - botY) < 0.001), "shunt does not reach the return rail").toBe(true);

    // And the top rail continues PAST that column to the output terminal — R2 taps the
    // rail rather than interrupting it, which is what V = V·R2/(R1+R2) describes.
    const maxX = Math.max(...ends.map((e) => e.x));
    expect(maxX).toBeGreaterThan(columnX);
    expect(ends.some((p) => Math.abs(p.y - topY) < 0.001 && Math.abs(p.x - maxX) < 0.001)).toBe(true);
  });

  it("labels both output terminals", () => {
    const texts: string[] = [];
    const walk = (n: any) => {
      if (n?.type === "text") texts.push(String(n.text));
      (n?.children ?? []).forEach(walk);
    };
    walk(build().node);
    expect(texts).toContain("A");
    expect(texts).toContain("B");
    expect(texts).toContain("R2 = 2 kΩ");
  });

  it("keeps every label upright", () => {
    // A rotated element would otherwise drag its label onto its side.
    const rotated: string[] = [];
    const walk = (n: any, spinning = false) => {
      const spins = spinning || (typeof n?.rotation === "number" && n.rotation !== 0);
      if (n?.type === "text" && spins) rotated.push(String(n.text));
      (n?.children ?? []).forEach((c: any) => walk(c, spins));
    };
    walk(build().node);
    expect(rotated).toEqual([]);
  });

  it("produces a valid, deterministic scene", () => {
    const a = build();
    const b = build();
    expect(JSON.stringify(a.node)).toBe(JSON.stringify(b.node));
    const scene = { specVersion: 1, width: 800, height: 450, fps: 30, duration: 4, seed: 0, background: "#ffffff", nodes: [a.node] };
    expect(validateScene(scene as never).errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/physics-circuitTopology.test.ts -t "voltageDivider"`
Expected: FAIL — `unknown builder "physics.voltageDivider"` (a `CatalogError` from the registry).

- [ ] **Step 3: Write the implementation**

Create `src/catalog/physics/voltageDivider.tool.ts`:

```ts
import { z } from "zod";
import { acSource, battery, resistor, wire, type CircuitSymbol, type Point, type SymbolOptions } from "../../physics/circuit.js";
import type { Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.voltageDivider — a source, R1 in series along the top rail, and R2 as a SHUNT
 * branch from the junction down to the return rail, with the output taken across A–B.
 *
 * The topology is the point. `V_out = V · R2 / (R1 + R2)` only describes a circuit where
 * R2 sits across the output; drawn in series it describes a different circuit entirely.
 * This builder cannot draw the series arrangement, so the schematic and the algebra
 * cannot disagree.
 */

const EL = 70;
const TOP_Y = 30;
const BOT_Y = 190;
/** Centres a vertical element in the rail gap. */
const LEAD = (BOT_Y - TOP_Y - EL) / 2;
const R1_X = 60;
const JUNCTION_X = 200;
const OUT_X = 280;
const INK = "#1e293b";

const Params = z.object({
  sourceKind: z.enum(["battery", "acSource"]).default("battery"),
  sourceLabel: z.string().optional(),
  r1Label: z.string().optional(),
  r2Label: z.string().optional(),
  outputLabels: z.tuple([z.string(), z.string()]).default(["A", "B"]),
  theme: z.string().optional(),
});
type DividerParams = z.infer<typeof Params>;

/**
 * Stand a horizontal symbol upright. Every symbol in circuit.ts runs left-to-right with
 * terminal `a` at (x, y) and `b` at (x + size, y); rotating the group 90° about `a` maps
 * the offset (size, 0) to (0, size), so `b` lands directly below `a`. The symbol is built
 * WITHOUT its label — a rotated label would read sideways — and the caller places an
 * upright one beside it.
 */
function vertical(
  make: (o: SymbolOptions) => CircuitSymbol,
  opts: { id: string; x: number; y: number; size: number; color: string },
): { node: Node; a: Point; b: Point } {
  const sym = make({ id: opts.id, x: opts.x, y: opts.y, size: opts.size, color: opts.color });
  return {
    node: { id: `${opts.id}-v`, type: "group", x: 0, y: 0, rotation: 90, anchor: { x: opts.x, y: opts.y }, children: [sym.node] },
    a: { x: opts.x, y: opts.y },
    b: { x: opts.x, y: opts.y + opts.size },
  };
}

function dot(id: string, p: Point, color: string): Node {
  return { id, type: "ellipse", x: p.x, y: p.y, width: 9, height: 9, fill: color };
}

function caption(id: string, x: number, y: number, text: string, align: "left" | "center"): Node {
  return {
    id,
    type: "text",
    x,
    y,
    text,
    fontFamily: "Inter",
    fontWeight: 600,
    fontSize: 15,
    fill: INK,
    align,
    baseline: "middle",
  };
}

export const voltageDividerTool: BuilderTool<DividerParams> = {
  name: "physics.voltageDivider",
  domain: "physics",
  level: "node",
  description: "a two-resistor voltage divider: R1 in series, R2 shunt across the A–B output — the Thevenin source topology",
  keywords: [
    "voltage divider",
    "divider",
    "thevenin",
    "thevenin equivalent",
    "equivalent resistance",
    "open circuit voltage",
    "potential divider",
    "series parallel",
  ],
  params: Params,
  example: { sourceKind: "battery", sourceLabel: "12 V", r1Label: "R1 = 4 kΩ", r2Label: "R2 = 2 kΩ" },
  build(p) {
    const children: Node[] = [];
    const topLeft: Point = { x: 0, y: TOP_Y };
    const botLeft: Point = { x: 0, y: BOT_Y };
    const junction: Point = { x: JUNCTION_X, y: TOP_Y };
    const botJunction: Point = { x: JUNCTION_X, y: BOT_Y };
    const outA: Point = { x: OUT_X, y: TOP_Y };
    const outB: Point = { x: OUT_X, y: BOT_Y };

    // Source, standing upright on the left rail.
    const src = vertical(p.sourceKind === "acSource" ? acSource : battery, { id: "vd-source", x: 0, y: TOP_Y + LEAD, size: EL, color: INK });
    children.push(src.node);
    children.push(wire({ id: "vd-w-src-top", points: [topLeft, src.a] }));
    children.push(wire({ id: "vd-w-src-bot", points: [src.b, botLeft] }));
    if (p.sourceLabel?.trim()) children.push(caption("vd-source-lbl", src.a.x - 14, (src.a.y + src.b.y) / 2, p.sourceLabel, "right" as "left"));

    // R1 in series along the top rail.
    const r1 = resistor({ id: "vd-r1", x: R1_X, y: TOP_Y, size: EL, color: INK, ...(p.r1Label ? { label: p.r1Label } : {}) });
    children.push(r1.node);
    children.push(wire({ id: "vd-w-top-1", points: [topLeft, r1.a] }));
    children.push(wire({ id: "vd-w-top-2", points: [r1.b, junction] }));

    // R2 as a shunt branch from the junction down to the return rail.
    const r2 = vertical(resistor, { id: "vd-r2", x: JUNCTION_X, y: TOP_Y + LEAD, size: EL, color: INK });
    children.push(r2.node);
    children.push(wire({ id: "vd-w-shunt-top", points: [junction, r2.a] }));
    children.push(wire({ id: "vd-w-shunt-bot", points: [r2.b, botJunction] }));
    if (p.r2Label?.trim()) children.push(caption("vd-r2-lbl", JUNCTION_X + 22, (r2.a.y + r2.b.y) / 2, p.r2Label, "left"));

    // The top rail continues past the junction to A: R2 taps the rail, it does not interrupt it.
    children.push(wire({ id: "vd-w-out-a", points: [junction, outA] }));
    children.push(wire({ id: "vd-w-bot-1", points: [botLeft, botJunction] }));
    children.push(wire({ id: "vd-w-out-b", points: [botJunction, outB] }));

    children.push(dot("vd-dot-a", outA, INK), dot("vd-dot-b", outB, INK));
    children.push(caption("vd-lbl-a", outA.x, outA.y - 20, p.outputLabels[0], "center"));
    children.push(caption("vd-lbl-b", outB.x, outB.y + 20, p.outputLabels[1], "center"));

    return { node: { id: "voltage-divider", type: "group", x: 0, y: 0, children }, bbox: { w: 300, h: 210 } };
  },
};
```

Note: the source caption uses `align: "right"` cast through `"left"` because the local `caption` helper's union is narrower. Widen the helper's `align` parameter to `"left" | "center" | "right"` and drop the cast.

- [ ] **Step 4: Register the tool**

In `src/catalog/register.ts`, add the import beside `circuitTool`:

```ts
import { voltageDividerTool } from "./physics/voltageDivider.tool.js";
```

and add `voltageDividerTool,` to the tools array, next to `circuitTool,`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/unit/physics-circuitTopology.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/catalog/physics/voltageDivider.tool.ts src/catalog/register.ts test/unit/physics-circuitTopology.test.ts
git commit -m "feat(physics): add a voltage divider builder with a real shunt branch"
```

---

### Task 3: `physics.opAmpStage`

**Files:**
- Create: `src/catalog/physics/opAmpStage.tool.ts`
- Modify: `src/catalog/register.ts`
- Test: `test/unit/physics-circuitTopology.test.ts`

**Interfaces:**
- Consumes: `opAmp`, `OpAmpSymbol` (Task 1); `resistor`, `capacitor`, `ground`, `wire`, `Point` from `src/physics/circuit.js`.
- Produces: `export const opAmpStageTool: BuilderTool<OpAmpStageParams>` registered as `physics.opAmpStage`.

- [ ] **Step 1: Write the failing test**

Append to `test/unit/physics-circuitTopology.test.ts`:

```ts
describe("physics.opAmpStage", () => {
  /** The reported brief: R = 10 kΩ in, C = 100 nF in the feedback path. */
  const integrator = () =>
    createDefaultRegistry().invokeNode("physics.opAmpStage", {
      inputKind: "resistor",
      feedbackKind: "capacitor",
      inputLabel: "R = 10 kΩ",
      feedbackLabel: "C = 100 nF",
    });

  it("leaves no wire endpoint stranded", () => {
    const ends = endpoints(integrator().node);
    const nearest = (e: { x: number; y: number }) => Math.min(...ends.filter((o) => o !== e).map((o) => dist(o, e)));
    // The reported output had "a stray vertical wire rising from the capacitor to nothing".
    expect(Math.max(...ends.map(nearest))).toBeLessThan(15);
  });

  // THE criterion-2 test: this fails if the feedback element is drawn in series on the input.
  it("routes the feedback element from the output back to the inverting input", () => {
    const node = integrator().node;
    const segments = polylines(node);
    const ends = endpoints(node);

    const inputY = Math.max(...ends.map((e) => e.y).filter((y) => y < 150));
    const feedbackY = Math.min(...ends.map((e) => e.y));
    // The feedback rail is a distinct horizontal run ABOVE the input rail.
    expect(feedbackY).toBeLessThan(inputY);

    // A conductor rises from the inverting node to the feedback rail...
    const risesToFeedback = segments.some(
      (p) => Math.abs(p[0]!.x - p[p.length - 1]!.x) < 0.001 && Math.min(p[0]!.y, p[p.length - 1]!.y) <= feedbackY + 0.001,
    );
    expect(risesToFeedback, "nothing connects the inverting node up to the feedback rail").toBe(true);

    // ...and another descends from the feedback rail to the output node, further right.
    const invertingX = Math.min(...ends.filter((e) => Math.abs(e.y - inputY) < 0.001).map((e) => e.x));
    const descendsToOutput = segments.some(
      (p) =>
        Math.abs(p[0]!.x - p[p.length - 1]!.x) < 0.001 &&
        Math.min(p[0]!.y, p[p.length - 1]!.y) <= feedbackY + 0.001 &&
        p[0]!.x > invertingX + 100,
    );
    expect(descendsToOutput, "the feedback rail never comes back down to the output").toBe(true);
  });

  it("grounds the non-inverting input and nothing else", () => {
    const node = integrator().node as any;
    const groundGroup = (function find(n: any): any {
      if (typeof n?.id === "string" && n.id.includes("gnd")) return n;
      for (const c of n?.children ?? []) {
        const hit = find(c);
        if (hit) return hit;
      }
      return null;
    })(node);
    expect(groundGroup, "no ground symbol").not.toBeNull();
    const groundTop = endpoints(groundGroup).reduce((a, b) => (a.y < b.y ? a : b));
    const others = endpoints(node).filter((e) => !endpoints(groundGroup).includes(e));
    expect(Math.min(...others.map((o) => dist(o, groundTop)))).toBeLessThan(15);
  });

  it("draws the kinds the params ask for", () => {
    const ids: string[] = [];
    const walk = (n: any) => {
      if (typeof n?.id === "string") ids.push(n.id);
      (n?.children ?? []).forEach(walk);
    };
    walk(integrator().node);
    expect(ids.some((i) => i.startsWith("oa-zin"))).toBe(true);
    expect(ids.some((i) => i.startsWith("oa-zf"))).toBe(true);

    // A differentiator swaps them; the builder must follow.
    const diff = createDefaultRegistry().invokeNode("physics.opAmpStage", { inputKind: "capacitor", feedbackKind: "resistor" });
    const diffIds: string[] = [];
    walk2(diff.node, diffIds);
    function walk2(n: any, out: string[]) {
      if (typeof n?.id === "string") out.push(n.id);
      (n?.children ?? []).forEach((c: any) => walk2(c, out));
    }
    expect(diffIds.some((i) => i.startsWith("oa-zin"))).toBe(true);
  });

  it("produces a valid, deterministic scene", () => {
    const a = integrator();
    const b = integrator();
    expect(JSON.stringify(a.node)).toBe(JSON.stringify(b.node));
    const scene = { specVersion: 1, width: 800, height: 450, fps: 30, duration: 4, seed: 0, background: "#ffffff", nodes: [a.node] };
    expect(validateScene(scene as never).errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/physics-circuitTopology.test.ts -t "opAmpStage"`
Expected: FAIL — `unknown builder "physics.opAmpStage"`.

- [ ] **Step 3: Write the implementation**

Create `src/catalog/physics/opAmpStage.tool.ts`:

```ts
import { z } from "zod";
import { capacitor, ground, opAmp, resistor, wire, type CircuitSymbol, type Point, type SymbolOptions } from "../../physics/circuit.js";
import type { Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.opAmpStage — an inverting op-amp stage: an input impedance on the input rail, a
 * feedback impedance on a rail running over the top of the amplifier from the inverting
 * node back to the output, and the non-inverting input tied to ground.
 *
 * The feedback path is the point. An integrator is a stage whose feedback element is a
 * capacitor; drawn in series on the input it is a high-pass filter instead. This builder
 * has no way to put the feedback element on the input rail, so the drawing and the lesson
 * cannot disagree.
 *
 * One builder covers the family: (R, R) is the inverting amplifier, (R, C) the integrator,
 * (C, R) the differentiator.
 */

const EL = 70;
const OP_SIZE = 90;
const OP_X = 240;
const OP_Y = 60;
const FEEDBACK_Y = 20;
const ZIN_X = 40;
const INK = "#1e293b";

const ELEMENTS: Record<"resistor" | "capacitor", (o: SymbolOptions) => CircuitSymbol> = { resistor, capacitor };

const Params = z.object({
  inputKind: z.enum(["resistor", "capacitor"]).default("resistor"),
  feedbackKind: z.enum(["resistor", "capacitor"]).default("capacitor"),
  inputLabel: z.string().optional(),
  feedbackLabel: z.string().optional(),
  inputTerminalLabel: z.string().default("Vin"),
  outputTerminalLabel: z.string().default("Vout"),
  theme: z.string().optional(),
});
type OpAmpStageParams = z.infer<typeof Params>;

function dot(id: string, p: Point): Node {
  return { id, type: "ellipse", x: p.x, y: p.y, width: 9, height: 9, fill: INK };
}

function caption(id: string, x: number, y: number, text: string, align: "left" | "center" | "right"): Node {
  return { id, type: "text", x, y, text, fontFamily: "Inter", fontWeight: 600, fontSize: 15, fill: INK, align, baseline: "middle" };
}

export const opAmpStageTool: BuilderTool<OpAmpStageParams> = {
  name: "physics.opAmpStage",
  domain: "physics",
  level: "node",
  description: "an inverting op-amp stage with the feedback element in the feedback path — inverting amp, integrator, or differentiator",
  keywords: [
    "op-amp",
    "opamp",
    "operational amplifier",
    "inverting amplifier",
    "integrator",
    "differentiator",
    "feedback",
    "virtual ground",
    "gain",
  ],
  params: Params,
  example: { inputKind: "resistor", feedbackKind: "capacitor", inputLabel: "R = 10 kΩ", feedbackLabel: "C = 100 nF" },
  build(p) {
    const children: Node[] = [];
    const amp = opAmp({ id: "oa-amp", x: OP_X, y: OP_Y, size: OP_SIZE, color: INK });
    children.push(amp.node);

    // The input rail sits at whatever height the symbol reports for its inverting input.
    const inY = amp.inMinus.y;
    const vin: Point = { x: 0, y: inY };

    const zin = ELEMENTS[p.inputKind]({
      id: "oa-zin",
      x: ZIN_X,
      y: inY,
      size: EL,
      color: INK,
      ...(p.inputLabel ? { label: p.inputLabel } : {}),
    });
    children.push(zin.node);
    children.push(wire({ id: "oa-w-in", points: [vin, zin.a] }));

    // The inverting node is an explicit junction: three conductors share this endpoint,
    // so none of them is left stranded.
    const invertingNode: Point = { x: (zin.b.x + amp.inMinus.x) / 2, y: inY };
    children.push(wire({ id: "oa-w-zin-node", points: [zin.b, invertingNode] }));
    children.push(wire({ id: "oa-w-node-in", points: [invertingNode, amp.inMinus] }));

    // Feedback: up from the inverting node, across through Zf, and back down to the output.
    const fbLeft: Point = { x: invertingNode.x, y: FEEDBACK_Y };
    const zf = ELEMENTS[p.feedbackKind]({
      id: "oa-zf",
      x: invertingNode.x + 40,
      y: FEEDBACK_Y,
      size: EL,
      color: INK,
      ...(p.feedbackLabel ? { label: p.feedbackLabel } : {}),
    });
    const outputNode: Point = { x: amp.out.x + 30, y: amp.out.y };
    const fbRight: Point = { x: outputNode.x, y: FEEDBACK_Y };
    children.push(zf.node);
    children.push(wire({ id: "oa-w-fb-up", points: [invertingNode, fbLeft] }));
    children.push(wire({ id: "oa-w-fb-1", points: [fbLeft, zf.a] }));
    children.push(wire({ id: "oa-w-fb-2", points: [zf.b, fbRight] }));
    children.push(wire({ id: "oa-w-fb-down", points: [fbRight, outputNode] }));

    // Output node: amplifier out, the feedback drop, and the Vout lead all meet here.
    const vout: Point = { x: outputNode.x + 60, y: amp.out.y };
    children.push(wire({ id: "oa-w-out", points: [amp.out, outputNode] }));
    children.push(wire({ id: "oa-w-vout", points: [outputNode, vout] }));

    // Non-inverting input to ground.
    const gndTop: Point = { x: amp.inPlus.x, y: amp.inPlus.y + 50 };
    children.push(wire({ id: "oa-w-gnd", points: [amp.inPlus, gndTop] }));
    children.push(ground({ id: "oa-gnd", x: gndTop.x, y: gndTop.y, size: 40, color: INK }).node);

    children.push(dot("oa-dot-in", vin), dot("oa-dot-out", vout));
    children.push(caption("oa-lbl-in", vin.x, vin.y - 20, p.inputTerminalLabel, "left"));
    children.push(caption("oa-lbl-out", vout.x, vout.y - 20, p.outputTerminalLabel, "right"));

    return { node: { id: "opamp-stage", type: "group", x: 0, y: 0, children }, bbox: { w: vout.x + 20, h: gndTop.y + 40 } };
  },
};
```

- [ ] **Step 4: Register the tool**

In `src/catalog/register.ts`, add:

```ts
import { opAmpStageTool } from "./physics/opAmpStage.tool.js";
```

and add `opAmpStageTool,` to the tools array beside `voltageDividerTool,`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/unit/physics-circuitTopology.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 6: Run the catalog suite for regressions**

Run: `npx vitest run test/unit/catalog.test.ts test/unit/builderPlacements.test.ts`
Expected: PASS. `catalog.test.ts` walks every registered tool, so it exercises both new ones for schema and example validity.

- [ ] **Step 7: Commit**

```bash
git add src/catalog/physics/opAmpStage.tool.ts src/catalog/register.ts test/unit/physics-circuitTopology.test.ts
git commit -m "feat(physics): add an op-amp stage builder with a real feedback path"
```

---

### Task 4: Full verification

**Files:** none modified.

- [ ] **Step 1: Run the full verify gate**

Run: `npm run verify`
Expected: typecheck clean, lint clean, format check clean, all tests pass.

- [ ] **Step 2: Fix formatting if `format:check` fails**

Run: `npm run format && npm run verify`

- [ ] **Step 3: Confirm both reported cases render connected**

Run:

```bash
npx tsx -e '
import { createDefaultRegistry } from "./src/index.js";
const reg = createDefaultRegistry();
const ends = (n: any, out: any[] = []): any[] => {
  if (n?.type === "polyline" && n.points) { out.push(n.points[0], n.points[n.points.length-1]); }
  (n?.children ?? []).forEach((c: any) => ends(c, out));
  return out;
};
for (const [name, params] of [
  ["physics.voltageDivider", { sourceLabel:"12 V", r1Label:"R1 = 4 kΩ", r2Label:"R2 = 2 kΩ" }],
  ["physics.opAmpStage", { inputKind:"resistor", feedbackKind:"capacitor", inputLabel:"R = 10 kΩ", feedbackLabel:"C = 100 nF" }],
] as const) {
  const e = ends(reg.invokeNode(name, params).node);
  const worst = Math.max(...e.map((p:any) => Math.min(...e.filter((q:any)=>q!==p).map((q:any)=>Math.hypot(p.x-q.x,p.y-q.y)))));
  console.log(`${name}: ${e.length} endpoints, worst gap ${worst.toFixed(2)}px`);
}
'
```

Expected: both report a worst gap well under 15px — against the 50px gaps and open loop the issue measured on freehand output.

- [ ] **Step 4: Commit any formatting fixes**

```bash
git add -A
git commit -m "style: format circuit topology builders"
```

---

## Self-Review

**Spec coverage:** `opAmp` primitive with three named terminals and lead-ended geometry (Task 1) · `physics.voltageDivider` with shunt branch, params, geometry and A/B terminals (Task 2) · `physics.opAmpStage` with feedback rail, element-kind params and ground (Task 3) · vertical elements via `rotation: 90` about `a` with labels kept upright (Task 2, `vertical()` helper plus the upright-label test) · registration (Tasks 2 and 3) · every test row in the spec's table appears in Tasks 1-3, including both bolded criterion-2 assertions.

**Type consistency:** `OpAmpSymbol`/`opAmp` defined in Task 1, consumed in Task 3. `Point` and `CircuitSymbol` come from `circuit.js` throughout. `BuilderTool<P>` with `build(p): BuilderOutput` matches `src/catalog/types.ts:37-53`. Test helpers `polylines`, `endpoints`, `dist` are defined once in Task 1 and reused by Tasks 2-3.

**Known rough edge to fix while implementing:** Task 2's `caption` helper is introduced with the union `"left" | "center"` but called with `"right"`; widen it to `"left" | "center" | "right"` and drop the cast, as the note there says.
