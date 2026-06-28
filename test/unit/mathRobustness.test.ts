/**
 * Robustness fuzz — every math builder must survive degenerate inputs (NaN, Infinity,
 * negative, zero, empty, huge, reversed/zero ranges): it must return a spec that
 * validateScene accepts, with every numeric field finite and non-negative sizes, and
 * it must terminate (this test completing is the termination proof). Guards against the
 * "unsanitized numeric option" class of bugs (invalid specs, native renderer panics on
 * NaN, and infinite loops).
 */

import { describe, it, expect } from "vitest";
import { validateScene } from "../../src/index.js";
import type { Node, SceneSpec } from "../../src/index.js";
import {
  coordinatePlane,
  plotLine,
  plotFunction,
  numberLine,
  fractionCircle,
  fractionBar,
  buildTenFrame,
  buildBaseTenBlocks,
  buildDotPattern,
  buildArrayGrid,
  buildNumberSentence,
  buildMathExpr,
  buildBalanceScale,
  buildTapeDiagram,
  buildBarGraph,
  buildAngle,
} from "../../src/math/index.js";

const NUM_FIELDS = [
  "x",
  "y",
  "width",
  "height",
  "radius",
  "innerRadius",
  "startAngle",
  "endAngle",
  "value",
  "strokeWidth",
  "fontSize",
  "rotation",
  "scale",
  "scaleX",
  "scaleY",
  "opacity",
  "progress",
];

function assertFinite(nodes: Node[], where: string): void {
  for (const node of nodes) {
    const n = node as unknown as Record<string, unknown>;
    for (const f of NUM_FIELDS) {
      const v = n[f];
      if (typeof v === "number") expect(Number.isFinite(v), `${where} ${node.id}.${f} = ${v}`).toBe(true);
    }
    const pts = n.points as Array<{ x: number; y: number }> | undefined;
    if (Array.isArray(pts))
      for (const p of pts) expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${where} ${node.id}.points`).toBe(true);
    const anchor = n.anchor as { x: number; y: number } | undefined;
    if (anchor) expect(Number.isFinite(anchor.x) && Number.isFinite(anchor.y), `${where} ${node.id}.anchor`).toBe(true);
    const children = n.children as Node[] | undefined;
    if (Array.isArray(children)) assertFinite(children, where);
  }
}

function check(name: string, nodes: Node[]): void {
  const spec: SceneSpec = { specVersion: 1, width: 800, height: 600, fps: 1, duration: 1, background: "#ffffff", nodes };
  const v = validateScene(spec);
  expect(v.valid, `${name} should be a valid spec; errors: ${JSON.stringify(v.errors.slice(0, 2))}`).toBe(true);
  assertFinite(nodes, name);
}

// Each entry returns the built node(s) for a degenerate input. If any of these hung
// (uncapped loop) or emitted NaN/negative sizes, the suite would fail/hang here.
const cases: Array<[string, () => Node[]]> = [
  // coordinate plane + plots
  ["plane zero-range", () => [coordinatePlane({ id: "p", xMin: 0, xMax: 0, yMin: 0, yMax: 0 }).node]],
  ["plane step 0", () => [coordinatePlane({ id: "p", xMin: -5, xMax: 5, yMin: -5, yMax: 5, step: 0 }).node]],
  ["plane reversed + NaN size", () => [coordinatePlane({ id: "p", xMin: 5, xMax: -5, yMin: 5, yMax: -5, width: NaN, height: -100 }).node]],
  [
    "plot NaN-returning fn",
    () => {
      const pl = coordinatePlane({ id: "p", xMin: -4, xMax: 4, yMin: -4, yMax: 4 });
      return [pl.node, plotLine(pl, { m: NaN, b: Infinity }), plotFunction(pl, () => NaN)];
    },
  ],
  // number line
  ["numberLine from==to", () => [numberLine({ id: "n", from: 3, to: 3 }).node]],
  ["numberLine step 0", () => [numberLine({ id: "n", from: 0, to: 5, step: 0 }).node]],
  ["numberLine reversed + huge", () => [numberLine({ id: "n", from: 5, to: 0, width: 1e9 }).node]],
  // fractions
  ["fractionCircle denom 0", () => [fractionCircle({ id: "f", numerator: 3, denominator: 0 })]],
  ["fractionCircle neg radius", () => [fractionCircle({ id: "f", numerator: 10, denominator: 4, radius: -50 })]],
  ["fractionBar NaN size", () => [fractionBar({ id: "f", numerator: 2, denominator: 4, width: NaN, height: -10 })]],
  // ten-frame
  ["tenFrame filled NaN", () => [buildTenFrame({ id: "t", filled: NaN })]],
  ["tenFrame total Infinity", () => [buildTenFrame({ id: "t", filled: 3, total: Infinity })]],
  ["tenFrame neg cell", () => [buildTenFrame({ id: "t", filled: 5, cellSize: -48 })]],
  // base-ten
  ["baseTen huge ones", () => [buildBaseTenBlocks({ id: "b", hundreds: 1, tens: 1, ones: 1e9, unit: 12 })]],
  ["baseTen NaN unit", () => [buildBaseTenBlocks({ id: "b", hundreds: 1, tens: 2, ones: 3, unit: NaN })]],
  ["baseTen negatives", () => [buildBaseTenBlocks({ id: "b", hundreds: -1, tens: -2, ones: -3, unit: -16 })]],
  // dot pattern
  ["dotPattern n 0", () => [buildDotPattern({ id: "d", n: 0 })]],
  ["dotPattern n NaN", () => [buildDotPattern({ id: "d", n: NaN, size: NaN })]],
  ["dotPattern n huge neg size", () => [buildDotPattern({ id: "d", n: 1e9, size: -120 })]],
  // array grid (large in one dim at a time to avoid a needless million-node spec)
  ["array 0x0", () => [buildArrayGrid({ id: "a", rows: 0, cols: 0 })]],
  ["array huge rows", () => [buildArrayGrid({ id: "a", rows: 1e9, cols: 1, dotRadius: -5 })]],
  ["array NaN dims", () => [buildArrayGrid({ id: "a", rows: NaN, cols: 3, gap: NaN })]],
  // number sentence
  ["numberSentence div by zero", () => [buildNumberSentence({ id: "s", a: 6, op: "÷", b: 0, result: 6 / 0 })]],
  ["numberSentence NaN operand", () => [buildNumberSentence({ id: "s", a: NaN, op: "+", b: 3, result: NaN })]],
  // math notation
  ["mathExpr empty", () => [buildMathExpr({ id: "m", parts: [] })]],
  [
    "mathExpr weird parts",
    () => [
      buildMathExpr({
        id: "m",
        fontSize: NaN,
        parts: [
          { kind: "frac", num: "", den: "0" },
          { kind: "pow", base: "", exp: "" },
        ],
      }),
    ],
  ],
  // balance scale
  ["balance 0=0", () => [buildBalanceScale({ id: "bs", left: 0, right: 0 })]],
  ["balance extreme + NaN", () => [buildBalanceScale({ id: "bs", left: NaN, right: 1e9, width: -100 })]],
  // tape diagram
  ["tape empty", () => [buildTapeDiagram({ id: "td", segments: [] })]],
  ["tape all-zero + NaN", () => [buildTapeDiagram({ id: "td", segments: [{ value: 0 }, { value: NaN }], width: NaN })]],
  // bar graph
  ["bar empty", () => [buildBarGraph({ id: "bg", bars: [] })]],
  [
    "bar all-zero + NaN",
    () => [
      buildBarGraph({
        id: "bg",
        bars: [
          { label: "a", value: 0 },
          { label: "b", value: NaN },
        ],
        maxValue: 0,
        height: -100,
      }),
    ],
  ],
  // angle
  ["angle NaN", () => [buildAngle({ id: "an", degrees: NaN, rayLength: NaN })]],
  ["angle huge + zero ray", () => [buildAngle({ id: "an", degrees: 1e9, rayLength: 0 })]],
];

describe("math builders are robust to degenerate inputs", () => {
  for (const [name, build] of cases) {
    it(`${name} -> valid, finite spec`, () => {
      check(name, build());
    });
  }
});
