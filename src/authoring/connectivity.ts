/**
 * Conductor connectivity for an authored schematic.
 *
 * A model drawing a circuit freehand places every wire by eye, and the result is not a
 * circuit: the runs stop short of the components they should meet and the loop never
 * closes. Issue #121 measured 50px holes on both sides of every component with three
 * mutually disjoint bottom segments — correct algebra beside a drawing of nothing.
 *
 * The criterion as originally written — "every component terminal must coincide with a
 * wire endpoint" — cannot be applied to a flat primitive list: a freehand spec has no
 * notion of a terminal. `CircuitSymbol.a`/`.b` exist only at build time. So it is
 * reformulated in terms of what the primitives actually carry:
 *
 *   A CONDUCTOR is a polyline that runs axis-aligned, is longer than any glyph stroke in
 *   the symbol set, and is wired into the component network. Every one of its endpoints
 *   must meet something: another polyline (anywhere along it, so a T-junction counts), a
 *   component body, or a marked terminal. An endpoint that meets nothing is STRANDED.
 *
 * Three false positives this has to avoid, all hit for real:
 *
 *  1. Symbol glyph strokes are not conductors. A capacitor's plates, a battery's bars, a
 *     ground symbol's rungs and an open switch's blade are free-standing marks with open
 *     ends by design. Each clause of the definition throws one family out: a blade and a
 *     zigzag are not square, a polarity tick is too short, and a mark struck through its
 *     middle by a lead is not joined to the network at its own ends. They stay meetable
 *     throughout, because a wire arriving at one is properly connected.
 *  2. Open terminals are legitimate. An open A–B pair is exactly what a Thevenin
 *     equivalent's output is. The builders mark such a terminal with a dot; an ellipse is
 *     a body like any other, so a marked terminal satisfies its conductor and the
 *     feedback tells a freehand author to mark one the same way.
 *  3. An endpoint is never matched against its own polyline. An earlier attempt at this
 *     excluded only the endpoint object, so every endpoint still matched its own copy at
 *     distance zero and reported a 0px worst gap on a schematic full of holes. What is
 *     excluded here is the whole run the endpoint belongs to.
 *
 * The check is deliberately not a validator rule: node position is unconstrained there,
 * and a wrong answer here must cost a retry rather than reject a spec outright.
 *
 * Pure and deterministic; reads the spec without mutating it and never throws on input it
 * cannot read.
 */

/** px of slack allowed at a joint. Symbol leads meet wires exactly; the reported holes were 50px. */
const MAX_GAP = 12;
/**
 * px below which a run is a glyph stroke rather than wiring. The longest axis-aligned
 * stroke in the symbol set is the ground symbol's top rung at 28px.
 */
const MIN_CONDUCTOR_LENGTH = 32;
/**
 * Conductor runs before a scene counts as a schematic. Fewer is a fragment — a close-up of
 * one labelled part with a lead — and a fragment makes no claim about a circuit.
 */
const MIN_CONDUCTORS = 3;
/** px tolerance for calling a segment axis-aligned. */
const AXIS_EPS = 0.5;
/** Endpoints named in the feedback; enough to locate the defect without flooding the prompt. */
const MAX_REPORTED = 6;

/**
 * Electrical notation, matched against the scene's visible text.
 *
 * Gating every spec on conductor connectivity would be wrong — a chart, a flowchart and a
 * number line all draw straight lines that legitimately end in mid-air — so the check only
 * applies to a scene that is drawing a circuit. A schematic says so in its own notation:
 * component designators, resistance/capacitance/inductance magnitudes, or the component
 * names themselves.
 *
 * Only what the scene actually shows counts. Node ids were tried too and are worse than
 * useless: "c1" and "d1" are ordinary names for a flowchart's connectors, and a flowchart
 * is boxes joined by orthogonal runs — the one non-electrical scene this check would
 * otherwise misread as wiring.
 */
const ELECTRICAL_NOTATION: RegExp[] = [
  // Component designators: R1, C2, L3, D1, Q1, U1.
  /\b[rcldqu]\d+\b/,
  // Magnitudes with an electrical unit: 4 kΩ, 470 ohm, 100 nF, 10 mH, 12 V, 20 mA.
  /\d\s*[kmµμunp]?\s*(?:ω|ohms?\b)/,
  /\d\s*[mµμunp]\s*f\b/,
  /\d\s*[mµμun]?\s*h\b/,
  /\d\s*[kmµμ]?\s*v\b/,
  /\d\s*[kmµμ]?\s*a\b/,
  // The components and the subject itself.
  /\b(?:resistors?|resistance|capacitors?|capacitance|inductors?|inductance|diodes?|transistors?|batter(?:y|ies)|voltmeter|ammeter|op-?amps?|operational amplifier|kirchhoff|thevenin|norton|schematic|circuits?)\b/,
];

export interface StrandedEndpoint {
  /** Id of the conductor whose end is stranded. */
  id: string;
  /** Scene-space position of the endpoint. */
  x: number;
  y: number;
  /** px to the nearest thing this endpoint could legitimately meet. */
  gap: number;
}

export interface ConnectivityCheck {
  /** "unchecked" when the scene is not drawing a schematic at all. */
  status: "passed" | "failed" | "unchecked";
  passed: boolean;
  /** Conductor runs found — wiring, not glyph strokes. */
  conductors: number;
  /** Conductor ends that meet nothing, worst gap first. */
  stranded: StrandedEndpoint[];
}

interface Pt {
  x: number;
  y: number;
}

/** An affine transform [a c e; b d f], as the renderer composes it. */
type Mat = readonly [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function multiply(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function transform(m: Mat, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * A node's own transform: translate(x, y), then rotate and scale about the anchor —
 * `src/engine/render.ts` (`ctx.translate` → `ctx.rotate` → `ctx.scale`). Reading raw
 * points instead would measure a circuit that is not the one drawn: the voltage divider
 * stands its resistors upright by rotating them 90° about terminal `a`.
 */
function localMatrix(node: Record<string, unknown>): Mat {
  const x = num(node["x"], 0);
  const y = num(node["y"], 0);
  const rotation = num(node["rotation"], 0);
  const scale = num(node["scale"], 1);
  const sx = num(node["scaleX"], scale);
  const sy = num(node["scaleY"], scale);
  const anchor = isObject(node["anchor"]) ? node["anchor"] : undefined;
  const ax = num(anchor?.["x"], 0);
  const ay = num(anchor?.["y"], 0);
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // T(x,y) · T(a) · R · S · T(-a)
  const rs: Mat = [cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0];
  const about = multiply([1, 0, 0, 1, ax, ay], multiply(rs, [1, 0, 0, 1, -ax, -ay]));
  return multiply([1, 0, 0, 1, x, y], about);
}

/** Animating any of these makes the static coordinates a lie about where the run is. */
const GEOMETRIC_PROPS = new Set(["x", "y", "scale", "scaleX", "scaleY", "rotation"]);

function hasGeometricTrack(node: Record<string, unknown>): boolean {
  const tracks = node["tracks"];
  return (
    Array.isArray(tracks) && tracks.some((t) => isObject(t) && typeof t["property"] === "string" && GEOMETRIC_PROPS.has(t["property"]))
  );
}

/** A drawn run of line segments in scene space. */
interface Segment {
  id: string;
  points: Pt[];
  /** A closed run is an outline — a component body, never wiring. */
  closed: boolean;
  /** Whether this run may be judged as a conductor (a moving node cannot be). */
  judgeable: boolean;
}

/** A component body in scene space: the four transformed corners of its box. */
type Region = Pt[];

interface Drawing {
  segments: Segment[];
  regions: Region[];
  /** Visible text, lowercased — the corpus the schematic gate reads. */
  words: string[];
}

function collect(nodes: unknown, m: Mat, moving: boolean, out: Drawing): void {
  if (!Array.isArray(nodes)) return;
  for (const raw of nodes) {
    if (!isObject(raw)) continue;
    const node = raw;
    const here = multiply(m, localMatrix(node));
    const stillMoving = moving || hasGeometricTrack(node);
    const id = typeof node["id"] === "string" ? node["id"] : "";

    switch (node["type"]) {
      case "group":
        collect(node["children"], here, stillMoving, out);
        break;
      case "text":
        if (typeof node["text"] === "string") out.words.push(node["text"].toLowerCase());
        break;
      case "polyline":
      case "polygon": {
        const raws = node["points"];
        if (!Array.isArray(raws)) break;
        const points = raws.filter(isObject).map((p) => transform(here, { x: num(p["x"], 0), y: num(p["y"], 0) }));
        if (points.length < 2) break;
        // A closed run is an outline, not wiring: the diode's triangle, a polygon body.
        const closed = node["closed"] === true || node["type"] === "polygon";
        if (closed) points.push(points[0]!);
        out.segments.push({ id, points, closed, judgeable: !closed && !stillMoving });
        break;
      }
      case "rect":
      case "ellipse": {
        const w = num(node["width"], 0);
        const h = num(node["height"], 0);
        if (!(w > 0) || !(h > 0)) break;
        const x = 0;
        const y = 0;
        // An ellipse is taken as its bounding box: generous by a few px at the corners,
        // which errs toward accepting a joint rather than inventing a defect.
        out.regions.push(
          [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ].map((p) => transform(here, p)),
        );
        break;
      }
      default:
        // arc, path, image, counter: no cheap exact geometry. Ignored, which can only
        // cost a retry, never a false pass.
        break;
    }
  }
}

function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shortest distance from `p` to the segment `a`–`b`. */
function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Shortest distance from `p` to a run of segments — anywhere along it, so a T-junction counts. */
function distanceToRun(p: Pt, points: Pt[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < points.length; i++) best = Math.min(best, distanceToSegment(p, points[i - 1]!, points[i]!));
  return best;
}

/** Shortest distance from `p` to a convex quad, zero inside it. */
function distanceToRegion(p: Pt, quad: Region): number {
  let inside = true;
  let sign = 0;
  for (let i = 0; i < quad.length; i++) {
    const a = quad[i]!;
    const b = quad[(i + 1) % quad.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross !== 0) {
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) inside = false;
    }
  }
  if (inside && sign !== 0) return 0;
  return distanceToRun(p, [...quad, quad[0]!]);
}

/**
 * How far `p` is from the nearest thing it could legitimately meet: any run except `own`
 * (matching an endpoint against its own polyline reads zero and measures nothing), or any
 * component body.
 */
function gapAt(p: Pt, own: Segment, drawing: Drawing): number {
  let best = Number.POSITIVE_INFINITY;
  for (const other of drawing.segments) {
    if (other === own) continue;
    best = Math.min(best, distanceToRun(p, other.points));
  }
  for (const region of drawing.regions) best = Math.min(best, distanceToRegion(p, region));
  return best;
}

function runLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1]!, points[i]!);
  return total;
}

/** Drafting convention: wiring runs horizontally and vertically. A zigzag or a coil does not. */
function isAxisAligned(points: Pt[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (Math.abs(a.x - b.x) > AXIS_EPS && Math.abs(a.y - b.y) > AXIS_EPS) return false;
  }
  return true;
}

function endsOf(segment: Segment): Pt[] {
  return [segment.points[0]!, segment.points[segment.points.length - 1]!];
}

/**
 * The runs that are wired into the component network: a run with an endpoint on a
 * component body, then anything joined to those, to a fixed point.
 *
 * This is what separates a circuit's wiring from a chart's furniture. Axes and gridlines
 * are long straight runs that meet each other and end in mid-air by design; they are
 * crossed by the bars they carry rather than terminating on them, so they never enter the
 * network. A wire, by contrast, exists to run between components.
 */
function attachedRuns(drawing: Drawing): Set<Segment> {
  const bodies = drawing.segments.filter((s) => s.closed);
  const nearBody = (p: Pt, own: Segment): boolean =>
    drawing.regions.some((r) => distanceToRegion(p, r) <= MAX_GAP) ||
    bodies.some((b) => b !== own && distanceToRun(p, b.points) <= MAX_GAP);

  const attached = new Set(drawing.segments.filter((s) => endsOf(s).some((p) => nearBody(p, s))));
  for (let grew = true; grew;) {
    grew = false;
    for (const s of drawing.segments) {
      if (attached.has(s)) continue;
      const joins = endsOf(s).some((p) => [...attached].some((a) => distanceToRun(p, a.points) <= MAX_GAP));
      if (joins) {
        attached.add(s);
        grew = true;
      }
    }
  }
  return attached;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function checkConductorConnectivity(spec: unknown): ConnectivityCheck {
  const unchecked: ConnectivityCheck = { status: "unchecked", passed: false, conductors: 0, stranded: [] };
  if (!isObject(spec)) return unchecked;

  const drawing: Drawing = { segments: [], regions: [], words: [] };
  collect(spec["nodes"], IDENTITY, false, drawing);

  const corpus = drawing.words.join(" ").toLowerCase();
  if (!ELECTRICAL_NOTATION.some((pattern) => pattern.test(corpus))) return unchecked;

  const attached = attachedRuns(drawing);
  const conductors = drawing.segments.filter(
    (s) => s.judgeable && attached.has(s) && isAxisAligned(s.points) && runLength(s.points) >= MIN_CONDUCTOR_LENGTH,
  );
  if (conductors.length < MIN_CONDUCTORS) return unchecked;

  const stranded: StrandedEndpoint[] = [];
  for (const conductor of conductors) {
    for (const end of endsOf(conductor)) {
      const gap = gapAt(end, conductor, drawing);
      if (gap > MAX_GAP) stranded.push({ id: conductor.id, x: round2(end.x), y: round2(end.y), gap: round2(gap) });
    }
  }
  stranded.sort((a, b) => b.gap - a.gap);

  return {
    status: stranded.length === 0 ? "passed" : "failed",
    passed: stranded.length === 0,
    conductors: conductors.length,
    stranded,
  };
}

/**
 * Correction for the author. The model wrote these coordinates and can move them, so
 * unlike a text measurement the feedback is actionable — and naming the builder gives it
 * a way out that is connected by construction.
 */
export function strandedFeedback(check: ConnectivityCheck): string {
  const shown = check.stranded.slice(0, MAX_REPORTED);
  const rest = check.stranded.length - shown.length;
  const list = shown.map((s) => `"${s.id}" at (${s.x}, ${s.y}) is ${Math.round(s.gap)}px from anything`).join("; ");
  return (
    `The schematic is disconnected: ${check.stranded.length} conductor endpoint${check.stranded.length === 1 ? "" : "s"} meet nothing — ` +
    `${list}${rest > 0 ? `; and ${rest} more` : ""}. ` +
    `Move each endpoint onto the component or wire it joins so the coordinates coincide, or mark a deliberate open terminal with a ` +
    `small filled ellipse at that point. To have the wiring laid out for you, place a catalog builder instead: ` +
    `"builders": [{ "builder": "physics.circuit", "x": 120, "y": 160, "params": { "elements": [ ... ] } }].`
  );
}
