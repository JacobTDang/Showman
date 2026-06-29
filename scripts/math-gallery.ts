/**
 * Math gallery — renders every math builder onto one contact sheet for visual review,
 * and validates each builder's output individually (so a bad one is easy to spot).
 * Run: npm run math-gallery  ->  out/math-gallery.png
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { renderFrame, validateScene, getTheme } from "../src/index.js";
import type { Node, SceneSpec } from "../src/index.js";
import {
  coordinatePlane,
  plotLine,
  plotFunction,
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
  buildMorph,
} from "../src/math/index.js";

const CIRCLE_D = "M50 0 C77.6 0 100 22.4 100 50 C100 77.6 77.6 100 50 100 C22.4 100 0 77.6 0 50 C0 22.4 22.4 0 50 0 Z";
const STAR_D = "M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z";

const THEME = "ocean";
const theme = getTheme(THEME);

interface Cell {
  label: string;
  x: number;
  y: number;
  build: () => Node | Node[];
}

const cells: Cell[] = [
  {
    label: "ten-frame (7/10)",
    x: 60,
    y: 120,
    build: () => buildTenFrame({ id: "tf", x: 60, y: 120, filled: 7, cellSize: 42, theme: THEME }),
  },
  {
    label: "array 3×4",
    x: 540,
    y: 120,
    build: () => buildArrayGrid({ id: "ag", x: 540, y: 120, rows: 3, cols: 4, gap: 44, theme: THEME }),
  },
  { label: "dot pattern (6)", x: 1000, y: 120, build: () => buildDotPattern({ id: "dp", x: 1000, y: 120, n: 6, size: 150, theme: THEME }) },

  {
    label: "number sentence",
    x: 60,
    y: 400,
    build: () => buildNumberSentence({ id: "ns", x: 60, y: 400, a: 3, op: "+", b: 4, result: 7, theme: THEME }),
  },
  {
    label: "fraction pie 3/8",
    x: 580,
    y: 380,
    build: () => fractionCircle({ id: "fc", x: 580, y: 380, radius: 70, numerator: 3, denominator: 8, theme: THEME }),
  },
  {
    label: "fraction bar 3/5",
    x: 1000,
    y: 410,
    build: () => fractionBar({ id: "fb", x: 1000, y: 410, width: 320, height: 70, numerator: 3, denominator: 5, theme: THEME }),
  },

  {
    label: "base-ten 1·2·3",
    x: 60,
    y: 660,
    build: () => buildBaseTenBlocks({ id: "bt", x: 60, y: 660, hundreds: 1, tens: 2, ones: 3, unit: 13, theme: THEME }),
  },
  {
    label: "bar graph",
    x: 540,
    y: 660,
    build: () =>
      buildBarGraph({
        id: "bg",
        x: 540,
        y: 660,
        width: 320,
        height: 200,
        bars: [
          { label: "A", value: 3 },
          { label: "B", value: 5 },
          { label: "C", value: 2 },
          { label: "D", value: 4 },
        ],
        theme: THEME,
      }),
  },
  {
    label: "angle 60°",
    x: 1000,
    y: 700,
    build: () => buildAngle({ id: "an", x: 1040, y: 780, degrees: 60, rayLength: 110, theme: THEME }),
  },

  {
    label: "balance 3 = 3",
    x: 60,
    y: 960,
    build: () => buildBalanceScale({ id: "bs", x: 60, y: 960, left: 3, right: 3, width: 300, theme: THEME }),
  },
  {
    label: "tape 3 + 5",
    x: 520,
    y: 960,
    build: () =>
      buildTapeDiagram({
        id: "td",
        x: 520,
        y: 960,
        width: 360,
        height: 54,
        totalLabel: "8",
        segments: [
          { value: 3, label: "3" },
          { value: 5, label: "5" },
        ],
        theme: THEME,
      }),
  },
  {
    label: "notation  y = ½x²",
    x: 1000,
    y: 900,
    build: () =>
      buildMathExpr({
        id: "me",
        x: 1000,
        y: 1000,
        fontSize: 44,
        theme: THEME,
        parts: [
          { kind: "text", text: "y = " },
          { kind: "frac", num: "1", den: "2" },
          { kind: "text", text: "x" },
          { kind: "pow", base: "", exp: "2" },
        ],
      }),
  },
  {
    label: "morph  ○ → ★",
    x: 1400,
    y: 600,
    build: () =>
      [0, 0.5, 1].map((v, k) => ({
        ...buildMorph({
          from: CIRCLE_D,
          to: STAR_D,
          x: 1400 + k * 115,
          y: 660,
          samples: 64,
          fill: theme.palette.primary,
          stroke: "#1d6f72",
          strokeWidth: 3,
        }),
        id: `mph${k}`,
        morph: v,
      })),
  },
  {
    label: "SVG path import + draw-on",
    x: 1400,
    y: 880,
    build: (): Node[] => [
      {
        id: "gx-heart",
        type: "path",
        x: 1400,
        y: 920,
        d: "M50 28 C 35 4, -2 18, 50 64 C 102 18, 65 4, 50 28 Z",
        fill: "#e63946",
        stroke: "#a01a28",
        strokeWidth: 3,
      },
      { id: "gx-star-draw", type: "path", x: 1540, y: 920, d: STAR_D, stroke: theme.palette.primary, strokeWidth: 5, progress: 0.6 },
    ],
  },
];

// A coordinate plane with a line + parabola, in its own column on the far right.
const plane = coordinatePlane({
  id: "pl",
  x: 1400,
  y: 150,
  width: 300,
  height: 300,
  xMin: -4,
  xMax: 4,
  yMin: -4,
  yMax: 4,
  theme: THEME,
  step: 2,
});

function scene(nodes: Node[], w: number, h: number): SceneSpec {
  return { specVersion: 1, width: w, height: h, fps: 1, duration: 1, background: theme.palette.bg, nodes };
}

// 1) Validate each builder in isolation.
let allOk = true;
for (const c of cells) {
  const out = c.build();
  const nodes = Array.isArray(out) ? out : [out];
  const v = validateScene(scene(nodes, 1760, 1160));
  if (!v.valid) {
    allOk = false;
    console.log(`INVALID  ${c.label}:`, JSON.stringify(v.errors.slice(0, 2)));
  } else {
    console.log(`ok       ${c.label}`);
  }
}

// 2) Compose the full contact sheet.
const nodes: Node[] = [];
for (const c of cells) {
  nodes.push({
    id: `lbl-${c.x}-${c.y}`,
    type: "text",
    x: c.x,
    y: c.y - 26,
    text: c.label,
    fontSize: 18,
    fontFamily: theme.bodyFont,
    fontWeight: 600,
    fill: theme.palette.muted,
    align: "left",
    baseline: "middle",
  });
  const out = c.build();
  for (const n of Array.isArray(out) ? out : [out]) nodes.push(n);
}
nodes.push({
  id: "lbl-plane",
  type: "text",
  x: 1400,
  y: 124,
  text: "coordinate plane + graphs",
  fontSize: 18,
  fontFamily: theme.bodyFont,
  fontWeight: 600,
  fill: theme.palette.muted,
  align: "left",
  baseline: "middle",
});
nodes.push(plane.node);
nodes.push(plotLine(plane, { m: 1, b: 1 }, { stroke: theme.palette.primary, strokeWidth: 4 }));
nodes.push(plotFunction(plane, (x) => 0.4 * x * x - 3, { samples: 60 }, { stroke: "#ef6c35", strokeWidth: 4, id: "pl-parab" }));
nodes.push({
  id: "title",
  type: "text",
  x: 880,
  y: 44,
  text: "Showman — Math Builder Gallery",
  fontSize: 34,
  fontFamily: theme.headingFont,
  fontWeight: theme.headingWeight,
  fill: theme.palette.primary,
  align: "center",
  baseline: "middle",
});

const spec = scene(nodes, 1760, 1160);
const v = validateScene(spec);
console.log("\ncombined scene valid:", v.valid, v.valid ? "" : JSON.stringify(v.errors.slice(0, 4)));

mkdirSync("out", { recursive: true });
writeFileSync("out/math-gallery.png", renderFrame(spec, 0).toPNG());
console.log("wrote out/math-gallery.png", allOk && v.valid ? "(all valid)" : "(SEE ISSUES ABOVE)");
