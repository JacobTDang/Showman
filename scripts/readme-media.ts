/**
 * Generate the README showcase media: a hero, a gallery of capability stills (PNG), and a short
 * animated demo (MP4 + GIF). Everything is rendered by the engine itself, so the images are faithful
 * output — what an agent authors is exactly what ships.
 *
 *   npx tsx scripts/readme-media.ts
 */
import {
  renderFrame,
  validateScene,
  encodeSceneToFile,
  SPEC_VERSION,
  diagram,
  math,
  chart,
  code,
  chem,
  physics,
  icon,
  brand,
  items,
  motion,
  makeRng,
  buildCountingLesson,
} from "../src/index.js";
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

const card = (w: number, h: number, nodes: Node[], background: SceneSpec["background"] = "#f8fafc"): SceneSpec => ({
  specVersion: SPEC_VERSION,
  width: w,
  height: h,
  fps: 1,
  duration: 1,
  seed: 1,
  background,
  nodes,
});

// --- Hero: gradient backdrop + grain + a gradient/shadowed title and capability cards ----------
function hero(): SceneSpec {
  const W = 1200;
  const H = 630;
  const cards: { x: number; label: string; g: [string, string] }[] = [
    { x: 170, label: "Diagrams", g: ["#38bdf8", "#0ea5e9"] },
    { x: 405, label: "Mathematics", g: ["#a78bfa", "#7c3aed"] },
    { x: 640, label: "Charts", g: ["#34d399", "#059669"] },
    { x: 875, label: "Chemistry", g: ["#fb7185", "#e11d48"] },
  ];
  const nodes: Node[] = [
    {
      id: "title",
      type: "text",
      x: W / 2,
      y: 220,
      text: "Showman",
      fontFamily: "Inter",
      fontWeight: 800,
      fontSize: 128,
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
      shadow: { color: "rgba(129,140,248,0.45)", blur: 36 },
    },
    {
      id: "sub",
      type: "text",
      x: W / 2,
      y: 312,
      text: "Beautiful, narrated learning videos — rendered deterministically from a single spec.",
      fontFamily: "Inter",
      fontWeight: 400,
      fontSize: 27,
      fill: "#94a3b8",
      align: "center",
      baseline: "middle",
      maxWidth: 880,
    },
  ];
  const cw = 195;
  const ch = 120;
  const cy = 410;
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
      fontSize: 23,
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
  return card(640, 470, [plane.node, line, parab], "#f8fbfe");
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
  return card(860, 410, [flow, t.node]);
}

// --- Charts: a grouped bar chart with round axis ticks -----------------------------------------
function chartStill(): SceneSpec {
  const c = chart.barChart({
    id: "bc",
    x: 30,
    y: 24,
    width: 660,
    height: 400,
    title: "Quarterly revenue",
    categories: ["Q1", "Q2", "Q3", "Q4"],
    series: [
      { name: "2025", values: [38, 52, 47, 61] },
      { name: "2026", values: [44, 58, 63, 79] },
    ],
    yFormat: "currency",
  });
  return card(720, 450, [c]);
}

// --- Code: a syntax-highlighted editor card ----------------------------------------------------
function codeStill(): SceneSpec {
  const src = `export function plotLine(plane, { m, b }) {\n  const x0 = plane.xMin, x1 = plane.xMax;\n  return polyline({\n    points: [pt(x0, m * x0 + b), pt(x1, m * x1 + b)],\n    stroke: "#1d6f72",\n    progress: 1, // draws itself on\n  });\n}`;
  const block = code.codeBlock({ id: "cb", x: 24, y: 24, width: 672, code: src, lang: "ts", title: "plotLine.ts", shadow: false });
  return card(720, 300, [block], "#0b1220");
}

// --- Chemistry: an ethanol molecule beside a combustion reaction -------------------------------
function chemStill(): SceneSpec {
  const mol = chem.molecule({ id: "etoh", ...chem.MOLECULE_PRESETS.ethanol, ox: 130, oy: 110, scale: 46 });
  const rxn = chem.reaction({ id: "rxn", reactants: ["2H2", "O2"], products: ["2H2O"], x: 300, y: 250, size: 30, conditions: "spark" });
  return card(720, 360, [mol, rxn], "#ffffff");
}

// --- Physics: a free-body diagram beside a circuit ---------------------------------------------
function physicsStill(): SceneSpec {
  const fbd = physics.forceDiagram({
    id: "fbd",
    x: 150,
    y: 150,
    bodyLabel: "m",
    bodyRadius: 22,
    forces: [
      { label: "N", magnitude: 70, angle: 90, color: "#16a34a" },
      { label: "mg", magnitude: 70, angle: 270, color: "#dc2626" },
      { label: "F", magnitude: 95, angle: 0, color: "#2563eb" },
      { label: "f", magnitude: 55, angle: 180, color: "#d97706" },
    ],
  });
  const b = physics.battery({ id: "b", x: 360, y: 110, label: "9V" });
  const r = physics.resistor({ id: "r", x: 470, y: 110, label: "R" });
  const l = physics.lamp({ id: "l", x: 580, y: 110 });
  const w1 = physics.wire({ id: "w1", points: [b.b, r.a], current: true });
  const w2 = physics.wire({ id: "w2", points: [r.b, l.a], current: true });
  const w3 = physics.wire({ id: "w3", points: [l.b, { x: 650, y: 110 }, { x: 650, y: 230 }, { x: 360, y: 230 }, b.a], current: true });
  return card(720, 300, [fbd, w1, w2, w3, b.node, r.node, l.node]);
}

// --- Icons: the frozen line-art set ------------------------------------------------------------
function iconStill(): SceneSpec {
  const names = icon.iconNames();
  const cols = 9;
  const cell = 56;
  const nodes = names.map((name, i) =>
    icon.icon({ id: `ic${i}`, name, x: 26 + (i % cols) * cell, y: 26 + Math.floor(i / cols) * cell, size: 36, color: "#1e293b" }),
  );
  return card(26 * 2 + cols * cell, 26 * 2 + Math.ceil(names.length / cols) * cell, nodes);
}

// --- Brand: a white-label title card -----------------------------------------------------------
function brandStill(): SceneSpec {
  return brand.titleCard(
    { name: "Northwind Academy", primary: "#0ea5e9" },
    { title: "Photosynthesis", subtitle: "Unit 3 · How plants make food", width: 720, height: 405 },
  );
}

// --- Assessment: a quiz card with the answer revealed ------------------------------------------
function quizStill(): SceneSpec {
  const item = items.generateItem(items.multiplicationTemplate, makeRng(1));
  const qc = items.quizCard({ id: "quiz", item, x: 30, y: 26, width: 460, theme: "ocean", reveal: true });
  return card(520, 380, [qc], "#eef2f7");
}

// --- Counting lesson (a frame) -----------------------------------------------------------------

// --- Animated demo: a parabola draws itself onto a coordinate plane with an ease-in-out --------
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
  const parabAnim: Node = { ...parab, progress: 0, tracks: motion.drawOn({ start: 1.2, duration: 2.2 }) };
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
    tracks: motion.fadeIn({ start: 0.2, duration: 0.8 }),
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

// --- Chemistry: the periodic table -------------------------------------------------------------
function periodicStill(): SceneSpec {
  const pt = chem.periodicTable({ id: "pt", x: 16, y: 16, cellSize: 40, highlight: ["O", "Na", "Cl", "Fe", "Au"] });
  return card(16 * 2 + 18 * 40, 16 * 2 + 10 * 40, [pt]);
}

// --- Chemistry: a reaction-coordinate energy diagram beside a pH scale --------------------------
function energyStill(): SceneSpec {
  const ed = chem.energyDiagram({
    id: "ed",
    x: 56,
    y: 24,
    width: 420,
    height: 250,
    reactantsLevel: 30,
    productsLevel: 12,
    activationPeak: 78,
    catalystPeak: 55,
    labels: { reactants: "reactants", products: "products" },
  });
  const ph = chem.phScale({ id: "ph", x: 56, y: 330, width: 420, value: 3, label: "lemon" });
  return card(540, 380, [ed, ph], "#ffffff");
}

// --- Physics: a converging-lens ray diagram ----------------------------------------------------
function opticsStill(): SceneSpec {
  return card(
    560,
    320,
    [physics.rayDiagram({ id: "rd", x: 24, y: 20, width: 520, height: 280, focalLength: 90, object: { distance: 190, height: 80 } })],
    "#ffffff",
  );
}

// --- Physics: projectile motion drawing itself onto a coordinate plane --------------------------
function mechanicsStill(): SceneSpec {
  const plane = math.coordinatePlane({
    id: "p",
    x: 56,
    y: 24,
    width: 460,
    height: 300,
    xMin: 0,
    xMax: 10,
    yMin: 0,
    yMax: 5,
    theme: "ocean",
    step: 1,
  });
  const proj = physics.projectile(plane, {
    id: "pr",
    speed: 9.6,
    angle: 58,
    g: 9.8,
    color: "#2563eb",
    markerColor: "#f59e0b",
    animate: false,
  });
  const bars = physics.energyBars({
    id: "e",
    x: 540,
    y: 60,
    width: 120,
    height: 250,
    bars: [
      { label: "KE", value: 7, color: "#2563eb" },
      { label: "PE", value: 3, color: "#16a34a" },
    ],
    max: 10,
  });
  return card(700, 360, [plane.node, proj, bars], "#f8fbfe");
}

async function main(): Promise<void> {
  still("hero", hero());
  still("showcase-periodic", periodicStill());
  still("showcase-energy", energyStill());
  still("showcase-optics", opticsStill());
  still("showcase-mechanics", mechanicsStill());
  still("showcase-math", mathStill());
  still("showcase-diagram", diagramStill());
  still("showcase-chart", chartStill());
  still("showcase-code", codeStill());
  still("showcase-chem", chemStill());
  still("showcase-physics", physicsStill());
  still("showcase-icons", iconStill());
  still("showcase-brand", brandStill());
  still("showcase-quiz", quizStill());
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
