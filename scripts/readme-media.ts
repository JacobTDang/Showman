/**
 * Generate the README showcase media: hero + capability stills (PNG) and a short animated demo
 * (MP4 + GIF). Everything is rendered by the engine itself, so the images are faithful output.
 *
 *   npx tsx scripts/readme-media.ts
 */
import { renderFrame, validateScene, encodeSceneToFile, SPEC_VERSION, diagram, math, buildCountingLesson } from "../src/index.js";
import type { SceneSpec, Node } from "../src/index.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DIR = "docs/media";
mkdirSync(DIR, { recursive: true });

function check(name: string, spec: SceneSpec): SceneSpec {
  const res = validateScene(spec);
  if (!res.valid) throw new Error(`${name} invalid: ${JSON.stringify(res.errors.slice(0, 3))}`);
  return spec;
}
function still(name: string, spec: SceneSpec, frame = 0): void {
  writeFileSync(`${DIR}/${name}.png`, renderFrame(check(name, spec), frame).toPNG());
  console.log(`wrote ${DIR}/${name}.png`);
}

// --- Hero: gradient backdrop + grain + a gradient/shadowed title and capability cards ----------
function hero(): SceneSpec {
  const W = 1200;
  const H = 630;
  const cards: { x: number; label: string; g: [string, string] }[] = [
    { x: 245, label: "Narration", g: ["#38bdf8", "#0ea5e9"] },
    { x: 495, label: "Diagrams", g: ["#a78bfa", "#7c3aed"] },
    { x: 745, label: "Mathematics", g: ["#fbbf24", "#f59e0b"] },
  ];
  const nodes: Node[] = [
    {
      id: "title",
      type: "text",
      x: W / 2,
      y: 215,
      text: "Showman",
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: 124,
      fill: "#e2e8f0",
      align: "center",
      baseline: "middle",
      gradient: {
        type: "linear",
        from: { x: -340, y: 0 },
        to: { x: 340, y: 0 },
        stops: [
          { offset: 0, color: "#38bdf8" },
          { offset: 1, color: "#a78bfa" },
        ],
      },
      shadow: { color: "rgba(129,140,248,0.45)", blur: 34 },
    },
    {
      id: "sub",
      type: "text",
      x: W / 2,
      y: 305,
      text: "A deterministic engine for narrated learning videos, authored by AI agents.",
      fontFamily: "Inter",
      fontWeight: 400,
      fontSize: 28,
      fill: "#94a3b8",
      align: "center",
      baseline: "middle",
      maxWidth: 840,
    },
  ];
  const cw = 210;
  const ch = 120;
  const cy = 400;
  cards.forEach((c, i) => {
    nodes.push({
      id: `card${i}`,
      type: "rect",
      x: c.x,
      y: cy,
      width: cw,
      height: ch,
      radius: 18,
      gradient: {
        type: "linear",
        from: { x: 0, y: 0 },
        to: { x: cw, y: ch },
        stops: [
          { offset: 0, color: c.g[0] },
          { offset: 1, color: c.g[1] },
        ],
      },
      shadow: { color: "rgba(0,0,0,0.45)", blur: 26, offsetY: 12 },
    });
    nodes.push({
      id: `cl${i}`,
      type: "text",
      x: c.x + cw / 2,
      y: cy + ch / 2,
      text: c.label,
      fontFamily: "Inter",
      fontWeight: 700,
      fontSize: 24,
      fill: "#0f172a",
      align: "center",
      baseline: "middle",
    });
  });
  return {
    specVersion: SPEC_VERSION,
    width: W,
    height: H,
    fps: 1,
    duration: 1,
    seed: 7,
    background: {
      fill: {
        type: "linear",
        from: { x: 0, y: 0 },
        to: { x: 0, y: H },
        stops: [
          { offset: 0, color: "#0b1220" },
          { offset: 1, color: "#1e293b" },
        ],
      },
      vignette: 0.5,
      grain: 0.07,
    },
    nodes,
  };
}

// --- Mathematics: a labeled coordinate plane with a line and a parabola -------------------------
function mathStill(): SceneSpec {
  const plane = math.coordinatePlane({
    id: "p",
    x: 70,
    y: 50,
    width: 520,
    height: 380,
    xMin: -5,
    xMax: 5,
    yMin: -3,
    yMax: 7,
    theme: "ocean",
    step: 1,
  });
  const line = math.plotLine(plane, { m: 1, b: 1 }, { stroke: "#1d6f72", strokeWidth: 4 });
  const parab = math.plotFunction(plane, (x) => 0.4 * x * x - 2, { samples: 72 }, { stroke: "#ef6c35", strokeWidth: 6, id: "parab" });
  return {
    specVersion: SPEC_VERSION,
    width: 640,
    height: 470,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#f8fbfe",
    nodes: [plane.node, line, parab],
  };
}

// --- Diagrams: a flowchart beside a data table -------------------------------------------------
function diagramStill(): SceneSpec {
  const flow = diagram.flowchart({
    nodes: [
      { id: "start", x: 40, y: 30, width: 170, height: 60, shape: "ellipse", label: "Start", fill: "#dbeafe" },
      { id: "decide", x: 34, y: 140, width: 184, height: 92, shape: "diamond", label: "Valid input?", fill: "#fef9c3" },
      {
        id: "process",
        x: 300,
        y: 152,
        width: 190,
        height: 70,
        shape: "rounded",
        label: "Process and persist the request",
        fill: "#dcfce7",
      },
      { id: "store", x: 322, y: 286, width: 146, height: 84, shape: "cylinder", label: "Database", fill: "#ede9fe" },
    ],
    edges: [
      { from: "start", to: "decide" },
      { from: "decide", to: "process", label: "yes" },
      { from: "process", to: "store", dash: [6, 4] },
    ],
  });
  const t = diagram.table({
    x: 560,
    y: 44,
    rows: [
      ["Method", "Idempotent", "Body"],
      ["GET", "yes", "no"],
      ["POST", "no", "yes"],
      ["PUT", "yes", "yes"],
      ["DELETE", "yes", "no"],
    ],
    columnAlign: ["left", "center", "center"],
  });
  return { specVersion: SPEC_VERSION, width: 860, height: 410, fps: 1, duration: 1, seed: 1, background: "#f8fafc", nodes: [flow, t.node] };
}

// --- Animated demo: a parabola draws itself onto a coordinate plane -----------------------------
function demo(): SceneSpec {
  const W = 960;
  const H = 540;
  const plane = math.coordinatePlane({
    id: "p",
    x: 130,
    y: 120,
    width: 700,
    height: 360,
    xMin: -5,
    xMax: 5,
    yMin: -3,
    yMax: 7,
    theme: "ocean",
    step: 1,
  });
  const parab = math.plotFunction(plane, (x) => 0.4 * x * x - 2, { samples: 72 }, { stroke: "#ef6c35", strokeWidth: 6, id: "parab" });
  const parabAnim: Node = {
    ...parab,
    progress: 0,
    tracks: [
      {
        property: "progress",
        keyframes: [
          { t: 1.2, value: 0 },
          { t: 3.4, value: 1, easing: "easeOutCubic" },
        ],
      },
    ],
  };
  const title: Node = {
    id: "eq",
    type: "text",
    x: W / 2,
    y: 64,
    text: "y = 0.4x² − 2",
    fontFamily: "JetBrains Mono",
    fontWeight: 600,
    fontSize: 42,
    fill: "#0f172a",
    align: "center",
    baseline: "middle",
    tracks: [
      {
        property: "opacity",
        keyframes: [
          { t: 0.2, value: 0 },
          { t: 1.0, value: 1, easing: "easeOutQuad" },
        ],
      },
    ],
  };
  return {
    specVersion: SPEC_VERSION,
    width: W,
    height: H,
    fps: 30,
    duration: 4,
    seed: 3,
    background: "#f8fbfe",
    nodes: [plane.node, title, parabAnim],
  };
}

async function main(): Promise<void> {
  still("hero", hero());
  still("showcase-math", mathStill());
  still("showcase-diagram", diagramStill());
  const lesson = buildCountingLesson({ count: 5, topic: "stars", theme: "sunshine", itemShape: "star" });
  still("showcase-lesson", lesson, Math.floor(lesson.fps * lesson.duration * 0.85));

  const demoSpec = check("demo", demo());
  await encodeSceneToFile(demoSpec, { outPath: `${DIR}/showman-demo.mp4`, crf: 20 });
  console.log(`wrote ${DIR}/showman-demo.mp4`);
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        `${DIR}/showman-demo.mp4`,
        "-vf",
        "fps=15,scale=760:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
        "-loop",
        "0",
        `${DIR}/showman-demo.gif`,
      ],
      { stdio: "ignore" },
    );
    console.log(`wrote ${DIR}/showman-demo.gif`);
  } catch (e) {
    console.warn("gif step failed (mp4 still written):", (e as Error).message);
  }
}

void main();
