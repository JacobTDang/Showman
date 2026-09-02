/**
 * Route a schematic brief to the catalog builder that draws it correctly.
 *
 * A model placing wires by eye produces boxes and stubs that never meet: the reported
 * Thevenin scene left 50 px gaps between every wire and the component it should have
 * touched, and had no closed loop at all. The catalog builders own that geometry, but
 * `/generate` never reached them — and asking the author to reach them through the system
 * prompt was measured and made things worse, breaking two briefs that had authored
 * cleanly (malformed and truncated JSON) while two others ignored the instruction.
 *
 * So the DECISION is made here, in code, and never asked of the model:
 *
 *   1. `selectSchematicBuilder` reads the request for a phrase that names a *topology*
 *      ("voltage divider", "half-wave rectifier", "integrator") and fills the builder's
 *      params by mechanical extraction, the way the Go `KeywordSelector` does.
 *   2. `routeSchematicToBuilder` deletes the freehand line-art the model drew and leaves
 *      a `builders` placement in the space it occupied, which `expandBuilderPlacements`
 *      then turns into real, connected geometry.
 *
 * Two deliberate limits, because a wrong builder is worse than no builder:
 *
 *   - Only phrases that name a topology count. "voltage", "current" and "resistor" name a
 *     subject, not a circuit, and a brief carrying only those authors freehand as before.
 *   - A brief naming two topologies selects nothing. One builder cannot draw both, and
 *     guessing which one the lesson is really about is exactly the wrong kind of guess.
 *
 * Only builders that draw a schematic and NOTHING ELSE are routable. `physics.rcCharging`
 * is a whole lesson in a node's clothing — it draws its own graph, equation and captions —
 * so substituting it for a drawing would duplicate the algebra the author already wrote.
 * An RC brief routes to `physics.circuit` with a closed battery-switch-R-C loop instead.
 */
import type { BuilderRegistry } from "../catalog/index.js";
import type { PedagogyRequest } from "./semantic.js";

export interface SchematicSelection {
  /** Catalog builder name. */
  builder: string;
  /** Params, already valid against that builder's Zod schema. */
  params: Record<string, unknown>;
  /** The topology phrase that decided it, for the repair log. */
  matched: string;
}

export interface SchematicRoutingResult {
  /** A clone carrying the `builders` placement, or the input untouched. */
  spec: unknown;
  /** Human-readable notes, one per action, for the caller's repair log. */
  repairs: string[];
  routed: boolean;
}

/* ------------------------------------------------------------------ selection */

type CircuitElement = { kind: string; label?: string; meterSymbol?: string };

/** One topology, the phrases that name it, and the params it implies. */
interface Topology {
  builder: string;
  phrases: string[];
  params: (text: string) => Record<string, unknown> | null;
}

/**
 * Element words the series-loop builder understands, longest first so "ac source" wins
 * over "source" and "voltmeter" over "meter".
 */
const ELEMENT_WORDS: Array<{ word: string; element: CircuitElement }> = [
  { word: "ac source", element: { kind: "acSource" } },
  { word: "ac supply", element: { kind: "acSource" } },
  { word: "alternating source", element: { kind: "acSource" } },
  { word: "voltmeter", element: { kind: "meter", meterSymbol: "V" } },
  { word: "ammeter", element: { kind: "meter", meterSymbol: "A" } },
  { word: "resistor", element: { kind: "resistor" } },
  { word: "capacitor", element: { kind: "capacitor" } },
  { word: "inductor", element: { kind: "inductor" } },
  { word: "battery", element: { kind: "battery" } },
  { word: "diode", element: { kind: "diode" } },
  { word: "switch", element: { kind: "switch" } },
  { word: "lamp", element: { kind: "lamp" } },
  { word: "bulb", element: { kind: "lamp" } },
  { word: "cell", element: { kind: "battery" } },
];

const TOPOLOGIES: Topology[] = [
  {
    builder: "physics.voltageDivider",
    phrases: ["voltage divider", "potential divider", "thevenin", "thevenin equivalent"],
    params: dividerParams,
  },
  { builder: "physics.opAmpStage", phrases: ["integrator"], params: (t) => opAmpParams(t, "resistor", "capacitor") },
  { builder: "physics.opAmpStage", phrases: ["differentiator"], params: (t) => opAmpParams(t, "capacitor", "resistor") },
  {
    builder: "physics.opAmpStage",
    phrases: ["op amp", "opamp", "operational amplifier", "inverting amplifier", "inverting op amp"],
    params: (t) => opAmpParams(t, "resistor", "resistor"),
  },
  {
    builder: "physics.circuit",
    phrases: ["rectifier", "half wave rectifier"],
    params: (t) => loop(t, ["acSource", "diode", "resistor"]),
  },
  {
    builder: "physics.circuit",
    phrases: ["rc circuit", "rc charging", "charging circuit", "capacitor charging"],
    params: (t) => loop(t, ["battery", "switch", "resistor", "capacitor"]),
  },
  { builder: "physics.circuit", phrases: ["rl circuit"], params: (t) => loop(t, ["battery", "switch", "resistor", "inductor"]) },
  { builder: "physics.circuit", phrases: ["rlc circuit"], params: (t) => loop(t, ["battery", "resistor", "inductor", "capacitor"]) },
  { builder: "physics.circuit", phrases: ["series circuit", "series loop"], params: scannedLoop },
];

/** Every routable phrase, so a test can round-trip each one through the registry. */
export const SCHEMATIC_PHRASES: string[] = TOPOLOGIES.flatMap((t) => t.phrases);

/**
 * Lower-case, hyphen-free, single-spaced. Hyphens fold to spaces so "op-amp" and "op amp"
 * are one phrase rather than two spellings to keep in sync, and the unit spellings that
 * elide the "o" ("kilohm") are expanded so one resistance pattern reads them all.
 */
function normalize(value: string): string {
  return value
    .replace(/[‐-―-]+/g, " ")
    .replace(/kilo\s*ohms?/gi, "kohm")
    .replace(/kilohms?/gi, "kohm")
    .replace(/mega\s*ohms?/gi, "Mohm")
    .replace(/meg\s*ohms?/gi, "Mohm")
    .replace(/megohms?/gi, "Mohm")
    .replace(/microfarads?/gi, "uF")
    .replace(/nanofarads?/gi, "nF")
    .replace(/picofarads?/gi, "pF")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The text a topology is read from: what the lesson must SHOW, never what it must avoid.
 * `authorBrief` folds the whole pedagogy request into one string, so matching that string
 * would let `forbid: ["op-amp"]` select the op-amp builder.
 */
function selectionText(request: PedagogyRequest): string {
  return normalize([request.brief, request.topic ?? "", ...(request.objectives ?? []), ...(request.mustShow ?? [])].join(" "));
}

function contains(haystackLower: string, phrase: string): boolean {
  return new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(haystackLower);
}

export function selectSchematicBuilder(request: PedagogyRequest): SchematicSelection | null {
  const text = selectionText(request);
  const lower = text.toLowerCase();

  // One match per topology entry: its longest phrase present in the text.
  const hits = TOPOLOGIES.map((topology) => {
    const matched = topology.phrases.filter((p) => contains(lower, p)).sort((a, b) => b.length - a.length)[0];
    return matched ? { topology, matched } : null;
  }).filter((hit): hit is { topology: Topology; matched: string } => hit !== null);

  if (hits.length === 0) return null;
  // A brief naming two different topologies is ambiguous; one builder cannot draw both.
  if (new Set(hits.map((h) => h.topology.builder)).size > 1) return null;

  const best = hits.sort((a, b) => b.matched.length - a.matched.length)[0]!;
  const params = best.topology.params(text);
  return params ? { builder: best.topology.builder, params, matched: best.matched } : null;
}

/* --------------------------------------------------------- param extraction */

const OHM_PREFIX: Record<string, string> = { k: "k", kilo: "k", M: "M", mega: "M", meg: "M", m: "m", milli: "m" };

/** Every resistance in the text, as a display string like "4 kΩ". */
function resistances(text: string): Array<{ index: number; display: string }> {
  const out: Array<{ index: number; display: string }> = [];
  const re = /(\d+(?:\.\d+)?)\s*(kilo|mega|meg|milli|k|M|m)?\s*(?:ohms?|Ω)/g;
  for (const m of text.matchAll(re)) {
    const prefix = m[2] ? (OHM_PREFIX[m[2]] ?? OHM_PREFIX[m[2].toLowerCase()] ?? "") : "";
    out.push({ index: m.index, display: `${m[1]} ${prefix}Ω` });
  }
  return out;
}

/** The first capacitance in the text, as a display string like "100 nF". */
function capacitance(text: string): string | undefined {
  const m = /(\d+(?:\.\d+)?)\s*([pnuµμm])?\s*F\b/.exec(text);
  if (!m) return undefined;
  return `${m[1]} ${(m[2] ?? "").replace(/[µμ]/, "u")}F`;
}

/** The first voltage in the text, as a display string like "12 V". */
function voltage(text: string): string | undefined {
  const m = /(\d+(?:\.\d+)?)\s*([kmµμu])?\s*(?:V\b|volts?\b)/i.exec(text);
  if (!m) return undefined;
  return `${m[1]} ${(m[2] ?? "").replace(/[µμ]/, "u")}V`;
}

/** A resistance introduced as "R1 = ..." / "R2 = ...", which the divider labels by name. */
function namedResistor(text: string, n: 1 | 2): string | undefined {
  const m = new RegExp(`\\bR${n}\\s*(?:=|:|\\bis\\b)?\\s*(\\d+(?:\\.\\d+)?)\\s*(kilo|mega|meg|milli|k|M|m)?\\s*(?:ohms?|Ω)`, "i").exec(
    text,
  );
  if (!m) return undefined;
  const prefix = m[2] ? (OHM_PREFIX[m[2]] ?? OHM_PREFIX[m[2].toLowerCase()] ?? "") : "";
  return `R${n} = ${m[1]} ${prefix}Ω`;
}

/**
 * The letter a component answers to when the brief quotes no value for it. An unlabelled
 * schematic makes the reader guess which box is which, and the narration talks about "R"
 * and "C" either way.
 */
const SYMBOL: Record<string, string> = { resistor: "R", capacitor: "C", inductor: "L", diode: "D", battery: "V", acSource: "V" };

function dividerParams(text: string): Record<string, unknown> {
  const v = voltage(text);
  return {
    sourceKind: /\bac\b|alternating/i.test(text) ? "acSource" : "battery",
    sourceLabel: v ?? "V",
    r1Label: namedResistor(text, 1) ?? "R1",
    r2Label: namedResistor(text, 2) ?? "R2",
  };
}

function opAmpParams(text: string, inputKind: "resistor" | "capacitor", feedbackKind: "resistor" | "capacitor"): Record<string, unknown> {
  const value = (kind: "resistor" | "capacitor") => (kind === "resistor" ? resistances(text)[0]?.display : capacitance(text));
  const label = (kind: "resistor" | "capacitor") => {
    const v = value(kind);
    return v ? `${SYMBOL[kind]} = ${v}` : SYMBOL[kind]!;
  };
  return { inputKind, feedbackKind, inputLabel: label(inputKind), feedbackLabel: label(feedbackKind) };
}

/** Label a series element from whatever value the brief supplies for its kind. */
function labelled(kind: string, text: string): CircuitElement {
  const symbol = SYMBOL[kind];
  if (!symbol) return { kind };
  const value =
    kind === "resistor"
      ? resistances(text)[0]?.display
      : kind === "capacitor"
        ? capacitance(text)
        : kind === "battery" || kind === "acSource"
          ? voltage(text)
          : undefined;
  // A source's value already reads as a label ("12 V"); R and C need naming.
  if (!value) return { kind, label: symbol };
  return { kind, label: kind === "battery" || kind === "acSource" ? value : `${symbol} = ${value}` };
}

/** A closed series loop of fixed kinds, labelled from the brief. */
function loop(text: string, kinds: string[]): Record<string, unknown> {
  return { elements: kinds.map((kind) => labelled(kind, text)) };
}

/**
 * "Series circuit" names the topology but not its contents, so the elements come from the
 * brief. One element is not a loop worth drawing, so fewer than two declines rather than
 * inventing a circuit the brief never described.
 */
function scannedLoop(text: string): Record<string, unknown> | null {
  const lower = text.toLowerCase();
  const found: Array<{ index: number; element: CircuitElement }> = [];
  const claimed: Array<[number, number]> = [];
  for (const { word, element } of ELEMENT_WORDS) {
    for (const m of lower.matchAll(new RegExp(`\\b${word}s?\\b`, "g"))) {
      const span: [number, number] = [m.index, m.index + m[0].length];
      // "ac source" already consumed "source"; don't let a shorter word re-read it.
      if (claimed.some(([s, e]) => span[0] < e && s < span[1])) continue;
      claimed.push(span);
      found.push({ index: m.index, element });
    }
  }
  if (found.length < 2) return null;
  const elements = found
    .sort((a, b) => a.index - b.index)
    .slice(0, 6)
    .map(({ element }) => ({ ...element, ...labelled(element.kind, text) }));
  return { elements };
}

/* ------------------------------------------------------------------- routing */

/** px of slack around the freehand line-art before the region is considered clear. */
const PAD = 24;
/**
 * How far past the wiring a component can sit and still be part of the schematic. The
 * reported freehand output left 50px between every wire end and the part it should have
 * met; a component that far off is the defect, not a separate drawing. Far enough to
 * bridge that, not so far it reaches a chart on the other side of the canvas.
 */
const REACH = 80;
/** px kept clear of every canvas edge. */
const MARGIN = 16;
/** Below this a schematic stops being readable; the canvas may still force smaller. */
const MIN_SCALE = 0.5;
/** Fraction of a shape that must lie inside the region before it counts as part of it. */
const CLAIM_FRACTION = 0.6;
const DEFAULT_LINE_HEIGHT = 1.25;
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_SHAPE_SIZE = 100;

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

/**
 * A node whose own transform makes an axis-aligned box unreliable — the same bail-out
 * `fitAuthoredText` makes, for the same reason: canvas-space reasoning under rotation is
 * wrong, and a wrong box would delete the wrong nodes.
 */
function breaksBoxMath(node: Record<string, unknown>): boolean {
  if (num(node["rotation"], 0) !== 0) return true;
  const sx = num(node["scaleX"], num(node["scale"], 1));
  const sy = num(node["scaleY"], num(node["scale"], 1));
  return node["anchor"] !== undefined && (sx !== 1 || sy !== 1);
}

/** The canvas-space box a drawn node occupies, or null when it cannot be reasoned about. */
function shapeBox(node: Record<string, unknown>, ox: number, oy: number, sx: number, sy: number): Box | null {
  const type = node["type"];
  if (type === "polyline") {
    const points = node["points"];
    if (!Array.isArray(points) || points.length < 2) return null;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of points) {
      if (!isObject(p)) return null;
      xs.push(num(p["x"], 0));
      ys.push(num(p["y"], 0));
    }
    return { x0: ox + Math.min(...xs) * sx, x1: ox + Math.max(...xs) * sx, y0: oy + Math.min(...ys) * sy, y1: oy + Math.max(...ys) * sy };
  }
  if (type === "rect" || type === "ellipse" || type === "image") {
    const w = num(node["width"], DEFAULT_SHAPE_SIZE) * sx;
    const h = num(node["height"], DEFAULT_SHAPE_SIZE) * sy;
    return { x0: ox, y0: oy, x1: ox + w, y1: oy + h };
  }
  if (type === "polygon") {
    const r = num(node["radius"], 50);
    return { x0: ox, y0: oy, x1: ox + 2 * r * sx, y1: oy + 2 * r * sy };
  }
  // `path` and `arc` would need their own geometry parsed; they are left in place.
  return null;
}

/** The vertical band a text/counter node occupies — no glyph measurement needed. */
function textBand(node: Record<string, unknown>, oy: number, sy: number): { y0: number; y1: number } {
  const fontSize = num(node["fontSize"], DEFAULT_FONT_SIZE);
  const raw = node["text"];
  const lines = typeof raw === "string" ? raw.split("\n").length : 1;
  const h = fontSize * num(node["lineHeight"], DEFAULT_LINE_HEIGHT) * lines * sy;
  const baseline = node["baseline"];
  if (baseline === "middle") return { y0: oy - h / 2, y1: oy + h / 2 };
  if (baseline === "bottom" || baseline === "alphabetic") return { y0: oy - h, y1: oy };
  return { y0: oy, y1: oy + h };
}

function inflate(box: Box): Box {
  return {
    x0: box.x0,
    y0: box.y0,
    x1: box.x1 === box.x0 ? box.x1 + 1 : box.x1,
    y1: box.y1 === box.y0 ? box.y1 + 1 : box.y1,
  };
}

/** How much of `box` lies inside `region`, 0..1. */
function claimedFraction(box: Box, region: Box): number {
  const b = inflate(box);
  const ix = Math.max(0, Math.min(b.x1, region.x1) - Math.max(b.x0, region.x0));
  const iy = Math.max(0, Math.min(b.y1, region.y1) - Math.max(b.y0, region.y0));
  return (ix * iy) / ((b.x1 - b.x0) * (b.y1 - b.y0));
}

/** Every wire the model drew freehand, in canvas space. */
function collectWires(nodes: unknown, ox: number, oy: number, sx: number, sy: number, out: Box[]): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!isObject(raw) || breaksBoxMath(raw)) continue;
    const nx = ox + num(raw["x"], 0) * sx;
    const ny = oy + num(raw["y"], 0) * sy;
    const esx = sx * num(raw["scaleX"], num(raw["scale"], 1));
    const esy = sy * num(raw["scaleY"], num(raw["scale"], 1));
    if (raw["type"] === "group") {
      collectWires(raw["children"], nx, ny, esx, esy, out);
      continue;
    }
    if (raw["type"] !== "polyline") continue;
    const box = shapeBox(raw, nx, ny, esx, esy);
    if (box) out.push(box);
  }
}

/** Every filled or outlined shape that could be a drawn component, in canvas space. */
function collectShapes(nodes: unknown, ox: number, oy: number, sx: number, sy: number, out: Box[]): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!isObject(raw) || breaksBoxMath(raw)) continue;
    const nx = ox + num(raw["x"], 0) * sx;
    const ny = oy + num(raw["y"], 0) * sy;
    const esx = sx * num(raw["scaleX"], num(raw["scale"], 1));
    const esy = sy * num(raw["scaleY"], num(raw["scale"], 1));
    if (raw["type"] === "group") {
      collectShapes(raw["children"], nx, ny, esx, esy, out);
      continue;
    }
    if (raw["type"] === "polyline" || raw["type"] === "text" || raw["type"] === "counter") continue;
    const box = shapeBox(raw, nx, ny, esx, esy);
    if (box) out.push(box);
  }
}

/** Gap between a box and a region: zero when they touch or overlap. */
function gapTo(box: Box, region: Box): number {
  const dx = Math.max(0, region.x0 - box.x1, box.x0 - region.x1);
  const dy = Math.max(0, region.y0 - box.y1, box.y0 - region.y1);
  return Math.hypot(dx, dy);
}

/**
 * Widen the wire region to take in every component within reach of it, repeating until
 * nothing new is close enough. A part the freehand wires stopped short of is still part
 * of the drawing; without this it survived the prune and double-drew beside the builder.
 */
function growToReach(region: Box, shapes: Box[]): Box {
  const grown = { ...region };
  const pending = [...shapes];
  let absorbed = true;
  while (absorbed) {
    absorbed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const b = pending[i]!;
      if (gapTo(b, grown) > REACH) continue;
      grown.x0 = Math.min(grown.x0, b.x0 - PAD);
      grown.y0 = Math.min(grown.y0, b.y0 - PAD);
      grown.x1 = Math.max(grown.x1, b.x1 + PAD);
      grown.y1 = Math.max(grown.y1, b.y1 + PAD);
      pending.splice(i, 1);
      absorbed = true;
    }
  }
  return grown;
}

/** Every vertical band the remaining content occupies, in canvas space. */
function collectBands(nodes: unknown, oy: number, sy: number, out: Array<{ y0: number; y1: number }>): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!isObject(raw) || breaksBoxMath(raw)) continue;
    const ny = oy + num(raw["y"], 0) * sy;
    const esy = sy * num(raw["scaleY"], num(raw["scale"], 1));
    if (raw["type"] === "group") {
      collectBands(raw["children"], ny, esy, out);
      continue;
    }
    if (raw["type"] === "text" || raw["type"] === "counter") {
      out.push(textBand(raw, ny, esy));
      continue;
    }
    // Only the vertical extent is read, so the horizontal transform is not composed.
    const box = shapeBox(raw, 0, ny, 1, esy);
    if (box) out.push({ y0: box.y0, y1: box.y1 });
  }
}

/**
 * Rebuild `nodes` without whatever the region claims. Groups are never dropped outright —
 * they are pruned and dropped only once empty — so a group holding the schematic AND an
 * unrelated caption keeps the caption.
 */
function prune(nodes: unknown[], region: Box, ox: number, oy: number, sx: number, sy: number, dropped: string[]): unknown[] {
  const kept: unknown[] = [];
  for (const raw of nodes) {
    if (!isObject(raw) || breaksBoxMath(raw)) {
      kept.push(raw);
      continue;
    }
    const nx = ox + num(raw["x"], 0) * sx;
    const ny = oy + num(raw["y"], 0) * sy;
    const esx = sx * num(raw["scaleX"], num(raw["scale"], 1));
    const esy = sy * num(raw["scaleY"], num(raw["scale"], 1));

    if (raw["type"] === "group") {
      const children = Array.isArray(raw["children"]) ? raw["children"] : [];
      const next = prune(children, region, nx, ny, esx, esy, dropped);
      if (next.length === 0 && children.length > 0) {
        dropped.push(String(raw["id"] ?? "group"));
        continue;
      }
      raw["children"] = next;
      kept.push(raw);
      continue;
    }

    if (raw["type"] === "text" || raw["type"] === "counter") {
      // A label is claimed by where it points, not by how wide it renders.
      if (nx >= region.x0 && nx <= region.x1 && ny >= region.y0 && ny <= region.y1) {
        dropped.push(String(raw["id"] ?? raw["type"]));
        continue;
      }
      kept.push(raw);
      continue;
    }

    const box = shapeBox(raw, nx, ny, esx, esy);
    if (box && claimedFraction(box, region) >= CLAIM_FRACTION) {
      dropped.push(String(raw["id"] ?? raw["type"]));
      continue;
    }
    kept.push(raw);
  }
  return kept;
}

/** The tallest band around `y` that no remaining content occupies. */
function freeBandAround(spec: Record<string, unknown>, y: number, top: number, bottom: number): { y0: number; y1: number } {
  const bands: Array<{ y0: number; y1: number }> = [];
  collectBands(spec["nodes"], 0, 1, bands);
  let y0 = top;
  let y1 = bottom;
  for (const band of bands) {
    if (band.y1 <= y && band.y1 > y0) y0 = band.y1;
    if (band.y0 >= y && band.y0 < y1) y1 = band.y0;
  }
  return { y0: Math.max(top, y0), y1: Math.min(bottom, y1) };
}

/** The tallest horizontal band of the canvas no remaining content occupies. */
function emptiestBand(spec: Record<string, unknown>, top: number, bottom: number): { y0: number; y1: number } {
  const bands: Array<{ y0: number; y1: number }> = [];
  collectBands(spec["nodes"], 0, 1, bands);
  const occupied = bands
    .filter((b) => b.y1 > top && b.y0 < bottom)
    .map((b) => ({ y0: Math.max(top, b.y0), y1: Math.min(bottom, b.y1) }))
    .sort((a, b) => a.y0 - b.y0);

  let best = { y0: top, y1: bottom };
  let cursor = top;
  for (const band of occupied) {
    if (band.y0 - cursor > best.y1 - best.y0) best = { y0: cursor, y1: band.y0 };
    cursor = Math.max(cursor, band.y1);
  }
  if (bottom - cursor > best.y1 - best.y0) best = { y0: cursor, y1: bottom };
  return best;
}

export function routeSchematicToBuilder(spec: unknown, selection: SchematicSelection, registry: BuilderRegistry): SchematicRoutingResult {
  if (!isObject(spec) || !Array.isArray(spec["nodes"])) return { spec, repairs: [], routed: false };
  // A camera re-maps the whole coordinate space; canvas-space reasoning is invalid.
  if (spec["camera"] !== undefined) return { spec, repairs: [], routed: false };
  const canvasW = num(spec["width"], 0);
  const canvasH = num(spec["height"], 0);
  if (canvasW <= 0 || canvasH <= 0) return { spec, repairs: [], routed: false };

  // Params come from this module's own table, so an invalid one is a bug here, not bad
  // input: let it throw rather than quietly drawing nothing.
  const bbox = registry.invokeNode(selection.builder, selection.params).bbox ?? { w: 240, h: 120 };

  // A schematic squeezed below half size stops reading as one. Rather than replace a
  // drawing with a smudge, leave the scene exactly as it was authored.
  const availW = Math.max(1, canvasW - 2 * MARGIN);
  const availH = Math.max(1, canvasH - 2 * MARGIN);
  if (Math.min(availW / bbox.w, availH / bbox.h) < MIN_SCALE) return { spec, repairs: [], routed: false };

  const clone = structuredClone(spec) as Record<string, unknown>;
  const repairs: string[] = [];

  const wires: Box[] = [];
  collectWires(clone["nodes"], 0, 0, 1, 1, wires);

  let region: Box;
  let band: { y0: number; y1: number };
  if (wires.length >= 2) {
    region = {
      x0: Math.min(...wires.map((w) => w.x0)) - PAD,
      y0: Math.min(...wires.map((w) => w.y0)) - PAD,
      x1: Math.max(...wires.map((w) => w.x1)) + PAD,
      y1: Math.max(...wires.map((w) => w.y1)) + PAD,
    };
    const shapes: Box[] = [];
    collectShapes(clone["nodes"], 0, 0, 1, 1, shapes);
    region = growToReach(region, shapes);
    const dropped: string[] = [];
    clone["nodes"] = prune(clone["nodes"] as unknown[], region, 0, 0, 1, 1, dropped);
    if (dropped.length > 0) repairs.push(`removed ${dropped.length} freehand schematic nodes (${dropped.slice(0, 6).join(", ")})`);
    // Freehand wires are a flat strip, so the strip alone is no measure of the space
    // available: read it from what SURVIVED the prune instead.
    band = freeBandAround(clone, (region.y0 + region.y1) / 2, MARGIN, canvasH - MARGIN);
  } else {
    band = emptiestBand(clone, MARGIN, canvasH - MARGIN);
    region = { x0: MARGIN, x1: canvasW - MARGIN, y0: band.y0, y1: band.y1 };
  }

  // Fit the space the drawing was given, but never so small the symbols stop reading —
  // and never larger than the canvas, which always wins.
  const room = { w: region.x1 - region.x0, h: Math.max(region.y1 - region.y0, band.y1 - band.y0) };
  const scale = Math.min(Math.max(Math.min(room.w / bbox.w, room.h / bbox.h, 1), MIN_SCALE), availW / bbox.w, availH / bbox.h, 1);
  const w = bbox.w * scale;
  const h = bbox.h * scale;
  const clamp = (v: number, lo: number, hi: number) => (hi < lo ? lo : Math.min(Math.max(v, lo), hi));
  // Centred where the drawing was, then held inside the free band and the canvas.
  const x = clamp((region.x0 + region.x1) / 2 - w / 2, MARGIN, canvasW - MARGIN - w);
  const y = clamp(clamp((region.y0 + region.y1) / 2 - h / 2, band.y0, band.y1 - h), MARGIN, canvasH - MARGIN - h);

  // Append rather than assign: a spec that already carries placements keeps them.
  const existing = Array.isArray(clone["builders"]) ? (clone["builders"] as unknown[]) : [];
  clone["builders"] = [
    ...existing,
    {
      id: "routed-schematic",
      builder: selection.builder,
      params: selection.params,
      x: round2(x),
      y: round2(y),
      ...(scale !== 1 ? { scale: round2(scale) } : {}),
    },
  ];
  repairs.push(`drew the schematic with ${selection.builder} (brief names "${selection.matched}")`);
  return { spec: clone, repairs, routed: true };
}
