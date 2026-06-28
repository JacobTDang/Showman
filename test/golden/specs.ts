/**
 * Golden scenes — blessed reference renders.
 *
 * These specs are rendered at fixed frames and their PNG output is committed under
 * test/golden/. The golden test re-renders and asserts byte-identical output; the
 * `golden:update` script regenerates the references when a change is intentional.
 *
 * Goldens are pinned to a machine + engine + font version (that is the whole
 * point). Until M1 bakes those into a container image, treat a local mismatch on a
 * different machine as "regenerate here", not "regression".
 */

import { SPEC_VERSION } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { coordinatePlane, plotLine, plotFunction, fractionCircle, numberLine } from "../../src/math/index.js";

export interface GoldenCase {
  name: string;
  spec: SceneSpec;
  /** Frame indices to render and compare. */
  frames: number[];
}

/** Pure-shape scene: rounded rect, stroked ellipse, rotation. No text (most portable). */
const shapes: SceneSpec = {
  specVersion: SPEC_VERSION,
  width: 320,
  height: 200,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#ffffff",
  nodes: [
    {
      id: "card",
      type: "rect",
      x: 30,
      y: 40,
      width: 120,
      height: 120,
      radius: 24,
      fill: "#1d6f72",
      rotation: 15,
      anchor: { x: 60, y: 60 },
    },
    { id: "ball", type: "ellipse", x: 180, y: 50, width: 100, height: 100, fill: "#ffb703", stroke: "#fb8500", strokeWidth: 6 },
    { id: "bar", type: "rect", x: 40, y: 170, width: 240, height: 16, radius: 8, fill: "#e63946" },
  ],
};

/** A tiny counting lesson: title, three apples that pop in, and their numbers. */
function countingLesson(): SceneSpec {
  const teal = "#1d6f72";
  const apple = "#e63946";
  const centers = [160, 320, 480];
  const nodes: SceneSpec["nodes"] = [
    {
      id: "title",
      type: "text",
      x: 320,
      y: 46,
      text: "Count to 3!",
      fontSize: 46,
      fontWeight: 800,
      fill: teal,
      align: "center",
      baseline: "middle",
    },
    {
      id: "subtitle",
      type: "text",
      x: 320,
      y: 320,
      text: "Let's count the apples",
      fontSize: 24,
      fontWeight: 500,
      fill: "#457b9d",
      align: "center",
      baseline: "middle",
    },
  ];
  centers.forEach((cx, i) => {
    const start = 0.3 + i * 0.3;
    const end = start + 0.6;
    nodes.push({
      id: `apple${i + 1}`,
      type: "ellipse",
      x: cx - 35,
      y: 150,
      width: 70,
      height: 70,
      fill: apple,
      anchor: { x: 35, y: 35 },
      tracks: [
        {
          property: "opacity",
          keyframes: [
            { t: start, value: 0 },
            { t: end, value: 1, easing: "easeOutQuad" },
          ],
        },
        {
          property: "scale",
          keyframes: [
            { t: start, value: 0.6 },
            { t: end, value: 1, easing: "easeOutBack" },
          ],
        },
      ],
    });
    nodes.push({
      id: `num${i + 1}`,
      type: "text",
      x: cx,
      y: 250,
      text: String(i + 1),
      fontSize: 34,
      fontWeight: 700,
      fill: teal,
      align: "center",
      baseline: "middle",
      tracks: [
        {
          property: "opacity",
          keyframes: [
            { t: end - 0.1, value: 0 },
            { t: end + 0.2, value: 1 },
          ],
        },
      ],
    });
  });
  return { specVersion: SPEC_VERSION, width: 640, height: 360, fps: 30, duration: 3, seed: 7, background: "#fdf6e3", nodes };
}

/** The three new engine primitives in one frame: an arc, a polyline, a counter. */
const mathPrimitives: SceneSpec = {
  specVersion: SPEC_VERSION,
  width: 320,
  height: 170,
  fps: 1,
  duration: 1,
  seed: 1,
  background: "#ffffff",
  nodes: [
    { id: "arc", type: "arc", x: 20, y: 25, radius: 60, startAngle: 0, endAngle: 270, fill: "#2a9d8f" },
    {
      id: "poly",
      type: "polyline",
      x: 165,
      y: 35,
      points: [
        { x: 0, y: 80 },
        { x: 40, y: 0 },
        { x: 80, y: 80 },
        { x: 120, y: 10 },
      ],
      stroke: "#e63946",
      strokeWidth: 5,
    },
    { id: "count", type: "counter", x: 165, y: 145, value: 42, prefix: "Score: ", fontSize: 28, fill: "#1d6f72" },
  ],
};

/** The headline algebra visual: a coordinate plane with a line and a parabola. */
function mathGraph(): SceneSpec {
  const plane = coordinatePlane({
    id: "p",
    x: 20,
    y: 20,
    width: 240,
    height: 200,
    xMin: -4,
    xMax: 4,
    yMin: -4,
    yMax: 4,
    theme: "ocean",
    step: 2,
  });
  const line = plotLine(plane, { m: 1, b: 1 }, { stroke: "#1d6f72", strokeWidth: 4 });
  const parab = plotFunction(plane, (x) => 0.4 * x * x - 3, { samples: 48 }, { stroke: "#ef6c35", strokeWidth: 4, id: "parab" });
  return {
    specVersion: SPEC_VERSION,
    width: 280,
    height: 240,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#eaf6fb",
    nodes: [plane.node, line, parab],
  };
}

/** A fraction pie (3/8) and a number line — the most-used number visuals. */
function mathNumber(): SceneSpec {
  const pie = fractionCircle({ id: "fc", x: 20, y: 30, radius: 70, numerator: 3, denominator: 8, theme: "berry" });
  const nl = numberLine({ id: "nl", x: 190, y: 90, width: 200, from: 0, to: 5, theme: "berry" });
  return { specVersion: SPEC_VERSION, width: 420, height: 180, fps: 1, duration: 1, seed: 1, background: "#fff5f8", nodes: [pie, nl.node] };
}

export const GOLDEN_CASES: GoldenCase[] = [
  { name: "shapes", spec: shapes, frames: [0] },
  // frame 0: only title + subtitle visible (apples still hidden); frame 60 (t=2): fully composed.
  { name: "lesson", spec: countingLesson(), frames: [0, 60] },
  { name: "math-primitives", spec: mathPrimitives, frames: [0] },
  { name: "math-graph", spec: mathGraph(), frames: [0] },
  { name: "math-number", spec: mathNumber(), frames: [0] },
];

/** The committed filename for a golden frame. */
export function goldenFileName(name: string, frame: number): string {
  return `${name}.f${frame}.png`;
}
