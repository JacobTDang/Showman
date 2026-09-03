/**
 * The EE 230 lesson kit: the three views every circuit lesson shows at once.
 *
 * The course (Geiger, Sedra/Smith) is organised around transfer characteristics and
 * transfer functions, with one theorem at its centre: a sinusoid in gives a sinusoid out,
 * scaled by |T(jω)| and shifted by ∠T(jω). A static schematic shows none of that. So each
 * lesson holds three views in a fixed layout — the schematic, the waveforms against time
 * (the lab oscilloscope), and the transfer view (a Bode plot or V_out against V_in) — and
 * drives the scope and the transfer view from the SAME clock, so when the output trace
 * shrinks and lags, the operating-point dot rides down the Bode curve at that instant.
 *
 * Panes are pure functions of their options and return plain nodes; a lesson composes
 * them with `eeLesson`, which sequences beats and narrates them.
 */
import type { GroupNode, NarrationSegment, Node, SceneSpec, Track } from "../../spec/types.js";
import { LIMITS, SPEC_VERSION } from "../../spec/schema.js";
import { getTheme, type Theme } from "../../theme/themes.js";
import { movingMarker, plotFunction, type Plane } from "../../math/builders.js";
import { texToNodes } from "../../math/tex.js";

/**
 * Plain-text labels carry ω, θ and subscripts. The theme body font (Nunito) has none of them
 * and draws tofu; Inter has all of them, and is what the circuit symbols already use. No
 * pinned font has ∠, so plain text writes "arg T" and leaves ∠ to KaTeX.
 */
export const LABEL_FONT = "Inter";

/* ------------------------------------------------------------------ layout */

/** The fixed 1280×720 layout every lesson uses, so a reader learns to read it once. */
export const LAYOUT = {
  width: 1280,
  height: 720,
  schematic: { x: 40, y: 90, w: 560, h: 270 },
  equation: { x: 40, y: 400, w: 560, h: 280 },
  scope: { x: 640, y: 90, w: 600, h: 280 },
  transfer: { x: 640, y: 400, w: 600, h: 280 },
} as const;

/* -------------------------------------------------------- transfer functions */

/** A linear transfer function, evaluated at s = jω. */
export interface Transfer {
  /** The corner (−3 dB) frequency, rad/s. */
  omega0: number;
  mag(omega: number): number;
  dB(omega: number): number;
  phaseRad(omega: number): number;
  phaseDeg(omega: number): number;
  /** T(s), for the equation pane. */
  latex: string;
}

const RAD2DEG = 180 / Math.PI;

/** T(s) = 1 / (1 + sRC): unity at DC, −3 dB and −45° at ω0 = 1/RC, −20 dB/decade above. */
export function rcLowpass(R: number, C: number): Transfer {
  const tau = R * C;
  const omega0 = 1 / tau;
  const mag = (w: number) => 1 / Math.sqrt(1 + (w * tau) ** 2);
  const phaseRad = (w: number) => -Math.atan(w * tau);
  return {
    omega0,
    mag,
    dB: (w) => 20 * Math.log10(mag(w)),
    phaseRad,
    phaseDeg: (w) => phaseRad(w) * RAD2DEG,
    latex: "T(s)=\\frac{1}{1+sRC}",
  };
}

/** T(s) = sRC / (1 + sRC): the mirror image — passes high, blocks low, +45° at ω0. */
export function rcHighpass(R: number, C: number): Transfer {
  const tau = R * C;
  const omega0 = 1 / tau;
  const mag = (w: number) => (w * tau) / Math.sqrt(1 + (w * tau) ** 2);
  const phaseRad = (w: number) => Math.PI / 2 - Math.atan(w * tau);
  return {
    omega0,
    mag,
    dB: (w) => 20 * Math.log10(Math.max(mag(w), 1e-12)),
    phaseRad,
    phaseDeg: (w) => phaseRad(w) * RAD2DEG,
    latex: "T(s)=\\frac{sRC}{1+sRC}",
  };
}

/* ------------------------------------------------------------------ sweep */

/** A logarithmic frequency sweep over a time window — the clock both panes share. */
export interface Sweep {
  omega0: number;
  fromDecade: number;
  toDecade: number;
  /** Seconds the sweep lasts. */
  duration: number;
  omega(t: number): number;
  /** Decades relative to ω0 at time t, i.e. log10(ω(t)/ω0). */
  decadeAt(t: number): number;
  /** ∫₀ᵗ ω(τ) dτ — the accumulated phase, so a chirp built on it is continuous. */
  phase(t: number): number;
}

export function logSweep(opts: { omega0: number; fromDecade: number; toDecade: number; duration: number }): Sweep {
  const { omega0, fromDecade, toDecade } = opts;
  const D = Math.max(1e-6, opts.duration);
  const clampT = (t: number) => Math.min(D, Math.max(0, t));
  const decadeAt = (t: number) => fromDecade + ((toDecade - fromDecade) * clampT(t)) / D;
  const omega = (t: number) => omega0 * 10 ** decadeAt(t);
  // ω(t) = ω(0)·e^{a t}, so ∫ω = ω(0)(e^{a t} − 1)/a; a linear sweep (a = 0) integrates to ω·t.
  const a = ((toDecade - fromDecade) * Math.LN10) / D;
  const w0 = omega(0);
  const phase = (t: number) => {
    const tc = clampT(t);
    return Math.abs(a) < 1e-12 ? w0 * tc : (w0 * (Math.exp(a * tc) - 1)) / a;
  };
  return { omega0, fromDecade, toDecade, duration: D, omega, decadeAt, phase };
}

/* ------------------------------------------------------------------ plane */

export interface PlaneSpec {
  id: string;
  /** Placement within the parent, and size. */
  x: number;
  y: number;
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xTicks: number[];
  yTicks: number[];
  xTickLabel?: (v: number) => string;
  yTickLabel?: (v: number) => string;
  xLabel?: string;
  yLabel?: string;
  theme: Theme;
}

/**
 * A plotting box with independent x and y ticks, satisfying the `Plane` contract so the
 * math kit's `plotFunction` and `movingMarker` draw onto it unchanged. `coordinatePlane`
 * shares one tick step between axes, which puts a gridline every decibel on a Bode plot.
 */
export function makePlane(spec: PlaneSpec): Plane {
  const { id, x, y, width, height, xMin, xMax, yMin, yMax, theme } = spec;
  const toLocal = (dx: number, dy: number) => ({
    x: ((dx - xMin) / (xMax - xMin)) * width,
    y: height - ((dy - yMin) / (yMax - yMin)) * height,
  });
  const children: Node[] = [];
  const grid = theme.palette.muted;
  const ink = theme.palette.text;

  for (const gx of spec.xTicks) {
    if (gx < xMin || gx > xMax) continue;
    const lx = toLocal(gx, yMin).x;
    children.push({
      id: `${id}-gx-${gx}`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: lx, y: 0 },
        { x: lx, y: height },
      ],
      stroke: grid,
      strokeWidth: 1,
      opacity: 0.5,
    });
    const lxText = spec.xTickLabel ? spec.xTickLabel(gx) : String(gx);
    if (lxText !== "")
      children.push({
        id: `${id}-lx-${gx}`,
        type: "text",
        x: lx,
        y: height + 14,
        text: lxText,
        fontFamily: LABEL_FONT,
        fontSize: 12,
        fill: ink,
        align: "center",
        baseline: "middle",
      });
  }
  for (const gy of spec.yTicks) {
    if (gy < yMin || gy > yMax) continue;
    const ly = toLocal(xMin, gy).y;
    children.push({
      id: `${id}-gy-${gy}`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: 0, y: ly },
        { x: width, y: ly },
      ],
      stroke: grid,
      strokeWidth: 1,
      opacity: 0.5,
    });
    const lyText = spec.yTickLabel ? spec.yTickLabel(gy) : String(gy);
    if (lyText !== "")
      children.push({
        id: `${id}-ly-${gy}`,
        type: "text",
        x: -8,
        y: ly,
        text: lyText,
        fontFamily: LABEL_FONT,
        fontSize: 12,
        fill: ink,
        align: "right",
        baseline: "middle",
      });
  }
  children.push({ id: `${id}-frame`, type: "rect", x: 0, y: 0, width, height, fill: "none", stroke: ink, strokeWidth: 1.5 });
  if (spec.xLabel) {
    children.push({
      id: `${id}-xl`,
      type: "text",
      x: width / 2,
      y: height + 32,
      text: spec.xLabel,
      fontFamily: LABEL_FONT,
      fontSize: 13,
      fill: ink,
      align: "center",
      baseline: "middle",
    });
  }
  if (spec.yLabel) {
    children.push({
      id: `${id}-yl`,
      type: "text",
      x: 0,
      y: -14,
      text: spec.yLabel,
      fontFamily: LABEL_FONT,
      fontSize: 13,
      fill: ink,
      align: "left",
      baseline: "middle",
    });
  }

  return {
    node: { id, type: "group", x, y, children },
    originX: x,
    originY: y,
    idPrefix: id,
    range: { xMin, xMax, yMin, yMax },
    theme,
    toLocal,
  };
}

/** Draw a curve on over a window — linear, so a marker riding it stays on the drawn tip. */
function drawOn(node: Node, start: number, duration: number): Node {
  const n = node as Node & { progress?: number; tracks?: Track[] };
  n.progress = 0;
  n.tracks = [
    {
      property: "progress",
      keyframes: [
        { t: start, value: 0 },
        { t: start + Math.max(1e-3, duration), value: 1 },
      ],
    },
  ];
  return n;
}

/* ------------------------------------------------------------------ scope */

export interface ScopeOptions {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sweep: Sweep;
  transfer: Transfer;
  /** Input amplitude, volts. */
  amplitude: number;
  /** Animation window: the traces draw on and the dots ride from `start` for `duration`. */
  start: number;
  duration: number;
  /** Points per trace. Default 1200 — enough for a two-decade chirp to stay above Nyquist. */
  samples?: number;
  /** How many input cycles fit the screen at the START of the sweep. Default 2. */
  startCycles?: number;
  theme?: string;
}

export interface ScopePane {
  node: GroupNode;
  /** Drawn input phase at sweep time t. The timebase is scaled to fit the screen. */
  inputPhase(t: number): number;
  input(t: number): number;
  output(t: number): number;
  /** Drawn samples per cycle at the highest frequency in the window. */
  samplesPerCycleAtTop: number;
}

/**
 * The lab oscilloscope: input above, output below, on one shared time axis. During a
 * frequency sweep the traces are a chirp — φ(t) = k·∫ω — so the local frequency rises
 * left to right while the output shrinks and lags. The real ω is far too fast to draw, so
 * the timebase is scaled by a constant k; gain and phase shift are still evaluated at the
 * REAL ω, which is what the lesson is teaching.
 */
export function scopePane(opts: ScopeOptions): ScopePane {
  const theme = getTheme(opts.theme);
  const { sweep, transfer, amplitude: A } = opts;
  const D = sweep.duration;
  const samples = opts.samples ?? 1200;
  const startCycles = opts.startCycles ?? 2;
  // Scale the timebase so `startCycles` input cycles fit the window at the sweep's start.
  const k = (2 * Math.PI * startCycles) / D / sweep.omega(0);
  const inputPhase = (t: number) => k * sweep.phase(t);
  const input = (t: number) => Math.sin(inputPhase(t));
  const output = (t: number) => {
    const w = sweep.omega(t);
    return A * transfer.mag(w) * Math.sin(inputPhase(t) + transfer.phaseRad(w));
  };
  const topDrawnHz = (k * sweep.omega(D)) / (2 * Math.PI);
  const samplesPerCycleAtTop = samples / D / topDrawnHz;

  const gap = 26;
  const planeH = (opts.height - gap) / 2;
  const yPad = A * 1.15;
  const ticks = [-A, 0, A];
  const fmt = (v: number) => `${v.toFixed(A < 1 ? 2 : 1)} V`;
  const mkPlane = (id: string, py: number, label: string, xLabel?: string) =>
    makePlane({
      id,
      x: 0,
      y: py,
      width: opts.width,
      height: planeH,
      xMin: 0,
      xMax: D,
      yMin: -yPad,
      yMax: yPad,
      xTicks: [],
      yTicks: ticks,
      yTickLabel: fmt,
      yLabel: label,
      ...(xLabel ? { xLabel } : {}),
      theme,
    });
  const inPlane = mkPlane(`${opts.id}-in`, 0, "v_in(t)");
  const outPlane = mkPlane(`${opts.id}-out`, planeH + gap, "v_out(t)", "time");

  const inCurve = drawOn(
    plotFunction(inPlane, (t) => A * input(t), { samples }, { id: `${opts.id}-in-trace`, stroke: theme.palette.primary, strokeWidth: 2 }),
    opts.start,
    opts.duration,
  );
  const outCurve = drawOn(
    plotFunction(outPlane, output, { samples }, { id: `${opts.id}-out-trace`, stroke: theme.palette.accent, strokeWidth: 2 }),
    opts.start,
    opts.duration,
  );
  const inDot = movingMarker(inPlane, (t) => ({ x: t, y: A * input(t) }), {
    id: `${opts.id}-in-dot`,
    tMin: 0,
    tMax: D,
    start: opts.start,
    duration: opts.duration,
    samples: 240,
    radius: 5,
    fill: theme.palette.primary,
  });
  const outDot = movingMarker(outPlane, (t) => ({ x: t, y: output(t) }), {
    id: `${opts.id}-out-dot`,
    tMin: 0,
    tMax: D,
    start: opts.start,
    duration: opts.duration,
    samples: 240,
    radius: 5,
    fill: theme.palette.accent,
  });

  return {
    node: { id: opts.id, type: "group", x: opts.x, y: opts.y, children: [inPlane.node, outPlane.node, inCurve, outCurve, inDot, outDot] },
    inputPhase,
    input,
    output,
    samplesPerCycleAtTop,
  };
}

/* ------------------------------------------------------------------- bode */

export interface BodeOptions {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transfer: Transfer;
  sweep: Sweep;
  start: number;
  duration: number;
  theme?: string;
}

export interface BodePane {
  node: GroupNode;
  /** Absolute x (within the pane's parent) of a decade on the magnitude plot. */
  toX(decade: number): number;
  /** Decibels at an absolute y on the magnitude plot. */
  fromY(y: number): number;
  /** Where the operating-point dot is at absolute lesson time t. */
  dotAt(t: number): { decade: number; dB: number; phaseDeg: number };
}

/**
 * Magnitude in dB and phase in degrees against log frequency. The x-axis is in decades
 * relative to ω0 — log10(ω/ω0) — which is what makes a Bode plot straight lines. A dot on
 * each curve rides the same sweep the scope draws, so the two views move together.
 */
export function bodePane(opts: BodeOptions): BodePane {
  const theme = getTheme(opts.theme);
  const { transfer: T, sweep } = opts;
  const D = sweep.duration;
  const xMin = Math.floor(sweep.fromDecade);
  const xMax = Math.ceil(sweep.toDecade);
  const decades: number[] = [];
  for (let d = xMin; d <= xMax; d++) decades.push(d);
  const decadeLabel = (d: number) => (d === 0 ? "ω₀" : d === 1 ? "10ω₀" : d === -1 ? "0.1ω₀" : `10^${d}ω₀`);

  const gap = 36;
  const planeH = (opts.height - gap) / 2;
  const dBMin = Math.min(-40, Math.floor(T.dB(T.omega0 * 10 ** xMax) / 10) * 10);
  const magPlane = makePlane({
    id: `${opts.id}-mag`,
    x: 0,
    y: 0,
    width: opts.width,
    height: planeH,
    xMin,
    xMax,
    yMin: dBMin,
    yMax: 5,
    xTicks: decades,
    yTicks: [0, -20, -40].filter((v) => v >= dBMin),
    xTickLabel: decadeLabel,
    yTickLabel: (v) => `${v} dB`,
    yLabel: "|T(jω)|",
    theme,
  });
  const phLo = Math.floor(Math.min(T.phaseDeg(T.omega0 * 10 ** xMin), T.phaseDeg(T.omega0 * 10 ** xMax)) / 45) * 45;
  const phHi = Math.ceil(Math.max(T.phaseDeg(T.omega0 * 10 ** xMin), T.phaseDeg(T.omega0 * 10 ** xMax)) / 45) * 45;
  const phTicks: number[] = [];
  for (let p = phLo; p <= phHi; p += 45) phTicks.push(p);
  const phPlane = makePlane({
    id: `${opts.id}-ph`,
    x: 0,
    y: planeH + gap,
    width: opts.width,
    height: planeH,
    xMin,
    xMax,
    yMin: phLo === phHi ? phLo - 45 : phLo,
    yMax: phLo === phHi ? phHi + 45 : phHi,
    xTicks: decades,
    yTicks: phTicks,
    xTickLabel: decadeLabel,
    yTickLabel: (v) => `${v}°`,
    yLabel: "arg T(jω)",
    xLabel: "frequency (log scale)",
    theme,
  });

  const magCurve = plotFunction(
    magPlane,
    (d) => T.dB(T.omega0 * 10 ** d),
    { samples: 200 },
    { id: `${opts.id}-mag-curve`, stroke: theme.palette.primary, strokeWidth: 2.5 },
  );
  const phCurve = plotFunction(
    phPlane,
    (d) => T.phaseDeg(T.omega0 * 10 ** d),
    { samples: 200 },
    { id: `${opts.id}-ph-curve`, stroke: theme.palette.primary, strokeWidth: 2.5 },
  );

  // The corner, marked: a dashed drop at ω0 and a dashed line at −3 dB.
  const cornerX = magPlane.originX + magPlane.toLocal(0, 0).x;
  const m3Y = magPlane.originY + magPlane.toLocal(0, -3.0103).y;
  const marks: Node[] = [
    {
      id: `${opts.id}-corner`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cornerX, y: magPlane.originY },
        { x: cornerX, y: magPlane.originY + planeH },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
    },
    {
      id: `${opts.id}-m3`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: magPlane.originX, y: m3Y },
        { x: magPlane.originX + opts.width, y: m3Y },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
    },
  ];

  marks.push({
    id: `${opts.id}-m3-lbl`,
    type: "text",
    x: magPlane.originX + opts.width - 6,
    y: m3Y - 9,
    text: "-3 dB",
    fontFamily: LABEL_FONT,
    fontSize: 12,
    fill: theme.palette.muted,
    align: "right",
    baseline: "middle",
  });
  const magDot = movingMarker(magPlane, (t) => ({ x: sweep.decadeAt(t), y: T.dB(sweep.omega(t)) }), {
    id: `${opts.id}-mag-dot`,
    tMin: 0,
    tMax: D,
    start: opts.start,
    duration: opts.duration,
    samples: 240,
    radius: 6,
    fill: theme.palette.accent,
  });
  const phDot = movingMarker(phPlane, (t) => ({ x: sweep.decadeAt(t), y: T.phaseDeg(sweep.omega(t)) }), {
    id: `${opts.id}-ph-dot`,
    tMin: 0,
    tMax: D,
    start: opts.start,
    duration: opts.duration,
    samples: 240,
    radius: 6,
    fill: theme.palette.accent,
  });

  return {
    node: {
      id: opts.id,
      type: "group",
      x: opts.x,
      y: opts.y,
      children: [magPlane.node, phPlane.node, ...marks, magCurve, phCurve, magDot, phDot],
    },
    toX: (decade) => opts.x + magPlane.originX + magPlane.toLocal(decade, 0).x,
    fromY: (y) => {
      const ly = y - opts.y - magPlane.originY;
      return magPlane.range.yMax - (ly / planeH) * (magPlane.range.yMax - magPlane.range.yMin);
    },
    dotAt: (t) => {
      const st = Math.min(D, Math.max(0, t - opts.start));
      const w = sweep.omega(st);
      return { decade: sweep.decadeAt(st), dB: T.dB(w), phaseDeg: T.phaseDeg(w) };
    },
  };
}

/* --------------------------------------------------------------- equation */

export interface EquationOptions {
  id: string;
  latex: string;
  x: number;
  y: number;
  /** Lesson time at which the equation fades in. */
  at: number;
  size?: number;
  color?: string;
  theme?: string;
}

/** A LaTeX equation that arrives when its beat does, not all at once with the rest. */
export function equationPane(opts: EquationOptions): { node: GroupNode; width: number; height: number } {
  const tex = texToNodes({
    id: opts.id,
    latex: opts.latex,
    x: opts.x,
    y: opts.y,
    size: opts.size ?? 26,
    ...(opts.color ? { color: opts.color } : {}),
    ...(opts.theme ? { theme: opts.theme } : {}),
  });
  tex.node.tracks = [
    {
      property: "opacity",
      keyframes: [
        { t: opts.at, value: 0 },
        { t: opts.at + 0.5, value: 1 },
      ],
    },
  ];
  return tex;
}

/* ----------------------------------------------------------------- lesson */

export interface Beat {
  /** Lesson time the beat starts. */
  at: number;
  /** How long the beat's motion runs. */
  dur: number;
  /** Nodes this beat adds; they carry their own timing. */
  nodes: Node[];
  /** Narration spoken at `at`. */
  say?: string;
}

export interface LessonOptions {
  title: string;
  beats: Beat[];
  theme?: string;
  fps?: number;
}

/** Motion-free tail so the last beat lands before the cut, matching the assembler. */
const REST = 0.75;

/** The assembler's spoken-length estimate: ~2.6 words/s plus a breath, floored at 1.4 s. */
function speechDur(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.4, words / 2.6 + 0.4);
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

/** Sequence beats into one narrated 1280×720 scene. */
export function eeLesson(opts: LessonOptions): SceneSpec {
  const theme = getTheme(opts.theme);
  const beats = [...opts.beats].sort((a, b) => a.at - b.at);
  const nodes: Node[] = [
    {
      id: "ee-title",
      type: "text",
      x: LAYOUT.width / 2,
      y: 44,
      text: opts.title,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: 30,
      fill: theme.palette.primary,
      align: "center",
      baseline: "middle",
    },
    ...beats.flatMap((b) => b.nodes),
  ];

  const segments: NarrationSegment[] = [];
  beats.forEach((b, i) => {
    if (!b.say?.trim()) return;
    const next = beats.slice(i + 1).find((n) => n.say?.trim());
    const room = next ? next.at - b.at : Number.POSITIVE_INFINITY;
    segments.push({ t: round3(b.at), text: b.say.trim(), duration: round3(Math.min(speechDur(b.say), room)) });
  });

  const end = beats.reduce((e, b) => Math.max(e, b.at + b.dur), 0);
  const lastSpeech = segments.reduce((e, s) => Math.max(e, s.t + (s.duration ?? 0)), 0);
  const duration = Math.min(LIMITS.maxDuration, round3(Math.max(end, lastSpeech) + REST));

  return {
    specVersion: SPEC_VERSION,
    width: LAYOUT.width,
    height: LAYOUT.height,
    fps: opts.fps ?? 30,
    duration,
    seed: 0,
    background: theme.palette.bg,
    nodes,
    ...(segments.length > 0 ? { narration: { segments } } : {}),
  };
}

/* ----------------------------------------------------------- generic scope */

export interface RawTrace {
  id: string;
  fn: (t: number) => number;
  color?: string;
  /** Draw-on window. Omit to show the trace from the start. */
  start?: number;
  duration?: number;
  /** A dot riding the drawn tip. */
  marker?: boolean;
  dash?: number[];
  strokeWidth?: number;
}

export interface RawPlane {
  label: string;
  yMin: number;
  yMax: number;
  yTicks: number[];
  yTickLabel?: (v: number) => string;
  traces: RawTrace[];
}

export interface RawScopeOptions {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Seconds on the shared time axis. */
  tMax: number;
  planes: RawPlane[];
  xLabel?: string;
  samples?: number;
  theme?: string;
}

/**
 * The oscilloscope in its general form: stacked planes on one time axis, each holding any
 * number of traces of t. The sweep scope is a special case; this one draws whatever a
 * lesson hands it — a reference sinusoid beside a changed one, v and i on separate planes,
 * two step responses that start at different moments.
 */
export function scopePaneRaw(opts: RawScopeOptions): { node: GroupNode; planes: Plane[] } {
  const theme = getTheme(opts.theme);
  const n = Math.max(1, opts.planes.length);
  const gap = 26;
  const planeH = (opts.height - gap * (n - 1)) / n;
  const samples = opts.samples ?? 600;
  const children: Node[] = [];
  const planes: Plane[] = [];
  opts.planes.forEach((p, i) => {
    const plane = makePlane({
      id: `${opts.id}-p${i}`,
      x: 0,
      y: i * (planeH + gap),
      width: opts.width,
      height: planeH,
      xMin: 0,
      xMax: opts.tMax,
      yMin: p.yMin,
      yMax: p.yMax,
      xTicks: [],
      yTicks: p.yTicks,
      ...(p.yTickLabel ? { yTickLabel: p.yTickLabel } : {}),
      yLabel: p.label,
      ...(i === n - 1 && opts.xLabel ? { xLabel: opts.xLabel } : {}),
      theme,
    });
    planes.push(plane);
    children.push(plane.node);
    for (const tr of p.traces) {
      const color = tr.color ?? theme.palette.primary;
      const curve = plotFunction(plane, tr.fn, { samples }, { id: `${opts.id}-${tr.id}`, stroke: color, strokeWidth: tr.strokeWidth ?? 2 });
      if (tr.dash) (curve as Node & { dash?: number[] }).dash = tr.dash;
      if (tr.start !== undefined) drawOn(curve, tr.start, tr.duration ?? 1);
      children.push(curve);
      if (tr.marker && tr.start !== undefined) {
        children.push(
          movingMarker(plane, (t) => ({ x: t, y: tr.fn(t) }), {
            id: `${opts.id}-${tr.id}-dot`,
            tMin: 0,
            tMax: opts.tMax,
            start: tr.start,
            duration: tr.duration ?? 1,
            samples: 240,
            radius: 5,
            fill: color,
          }),
        );
      }
    }
  });
  return { node: { id: opts.id, type: "group", x: opts.x, y: opts.y, children }, planes };
}

/* --------------------------------------------------------- multi-Bode */

export interface BodeMultiOptions {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transfers: Array<{ transfer: Transfer; label: string; color?: string }>;
  sweep: Sweep;
  start: number;
  duration: number;
  theme?: string;
}

/** Several transfer functions on one Bode plot, each with its own dot on the shared sweep. */
export function bodePaneMulti(opts: BodeMultiOptions): {
  node: GroupNode;
  dotAt(i: number, t: number): { decade: number; dB: number; phaseDeg: number };
} {
  const theme = getTheme(opts.theme);
  const { sweep } = opts;
  const D = sweep.duration;
  const xMin = Math.floor(sweep.fromDecade);
  const xMax = Math.ceil(sweep.toDecade);
  const decades: number[] = [];
  for (let d = xMin; d <= xMax; d++) decades.push(d);
  const decadeLabel = (d: number) => (d === 0 ? "ω₀" : d === 1 ? "10ω₀" : d === -1 ? "0.1ω₀" : `10^${d}ω₀`);
  const gap = 36;
  const planeH = (opts.height - gap) / 2;
  const w0 = sweep.omega0;
  const allDb = opts.transfers.flatMap(({ transfer: T }) => [T.dB(w0 * 10 ** xMin), T.dB(w0 * 10 ** xMax)]);
  const dBMin = Math.min(-40, Math.floor(Math.min(...allDb) / 10) * 10);
  const allPh = opts.transfers.flatMap(({ transfer: T }) => [T.phaseDeg(w0 * 10 ** xMin), T.phaseDeg(w0 * 10 ** xMax)]);
  const phLo = Math.floor(Math.min(...allPh) / 45) * 45;
  const phHi = Math.ceil(Math.max(...allPh) / 45) * 45;
  const phTicks: number[] = [];
  for (let p = phLo; p <= phHi; p += 45) phTicks.push(p);

  const magPlane = makePlane({
    id: `${opts.id}-mag`,
    x: 0,
    y: 0,
    width: opts.width,
    height: planeH,
    xMin,
    xMax,
    yMin: dBMin,
    yMax: 5,
    xTicks: decades,
    yTicks: [0, -20, -40].filter((v) => v >= dBMin),
    xTickLabel: decadeLabel,
    yTickLabel: (v) => `${v} dB`,
    yLabel: "|T(jω)|",
    theme,
  });
  const phPlane = makePlane({
    id: `${opts.id}-ph`,
    x: 0,
    y: planeH + gap,
    width: opts.width,
    height: planeH,
    xMin,
    xMax,
    yMin: phLo,
    yMax: phHi,
    xTicks: decades,
    yTicks: phTicks,
    xTickLabel: decadeLabel,
    yTickLabel: (v) => `${v}°`,
    yLabel: "arg T(jω)",
    xLabel: "frequency (log scale)",
    theme,
  });

  const cornerX = magPlane.originX + magPlane.toLocal(0, 0).x;
  const m3Y = magPlane.originY + magPlane.toLocal(0, -3.0103).y;
  const children: Node[] = [
    magPlane.node,
    phPlane.node,
    {
      id: `${opts.id}-corner`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: cornerX, y: magPlane.originY },
        { x: cornerX, y: magPlane.originY + planeH },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
    },
    {
      id: `${opts.id}-m3`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: magPlane.originX, y: m3Y },
        { x: magPlane.originX + opts.width, y: m3Y },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
    },
  ];
  const palette = [theme.palette.primary, theme.palette.accent, theme.palette.secondary];
  opts.transfers.forEach(({ transfer: T, label, color }, i) => {
    const c = color ?? palette[i % palette.length]!;
    children.push(
      plotFunction(magPlane, (d) => T.dB(w0 * 10 ** d), { samples: 200 }, { id: `${opts.id}-mag-${i}`, stroke: c, strokeWidth: 2.5 }),
    );
    children.push(
      plotFunction(phPlane, (d) => T.phaseDeg(w0 * 10 ** d), { samples: 200 }, { id: `${opts.id}-ph-${i}`, stroke: c, strokeWidth: 2.5 }),
    );
    children.push(
      movingMarker(magPlane, (t) => ({ x: sweep.decadeAt(t), y: T.dB(sweep.omega(t)) }), {
        id: `${opts.id}-mag-dot-${i}`,
        tMin: 0,
        tMax: D,
        start: opts.start,
        duration: opts.duration,
        samples: 240,
        radius: 6,
        fill: c,
      }),
    );
    children.push(
      movingMarker(phPlane, (t) => ({ x: sweep.decadeAt(t), y: T.phaseDeg(sweep.omega(t)) }), {
        id: `${opts.id}-ph-dot-${i}`,
        tMin: 0,
        tMax: D,
        start: opts.start,
        duration: opts.duration,
        samples: 240,
        radius: 6,
        fill: c,
      }),
    );
    children.push({
      id: `${opts.id}-legend-${i}`,
      type: "text",
      x: magPlane.originX + 10,
      y: magPlane.originY + 14 + i * 18,
      text: label,
      fontFamily: LABEL_FONT,
      fontWeight: 600,
      fontSize: 13,
      fill: c,
      align: "left",
      baseline: "middle",
    });
  });
  return {
    node: { id: opts.id, type: "group", x: opts.x, y: opts.y, children },
    dotAt: (i, t) => {
      const T = opts.transfers[i]!.transfer;
      const st = Math.min(D, Math.max(0, t - opts.start));
      const w = sweep.omega(st);
      return { decade: sweep.decadeAt(st), dB: T.dB(w), phaseDeg: T.phaseDeg(w) };
    },
  };
}

/* ------------------------------------------------- transfer characteristic */

export interface TransferCurveOptions {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The pseudo-static V_out = f(V_in). */
  fn: (vin: number) => number;
  /** Axis half-range, volts. */
  vMax: number;
  /** The input applied over time, so the dot traces the operating point. */
  drive: (t: number) => number;
  tMax: number;
  start: number;
  duration: number;
  /** Draw the y = x reference. */
  reference?: boolean;
  theme?: string;
}

/**
 * Geiger's Fig. 3: the transfer characteristic as a curve of V_out against V_in, with a dot
 * that sits at the operating point as the input drives it. Where the curve bends, the
 * output waveform in the scope bends with it — that is what "nonlinear" looks like.
 */
export function transferCurvePane(opts: TransferCurveOptions): { node: GroupNode; at(t: number): { vin: number; vout: number } } {
  const theme = getTheme(opts.theme);
  const V = opts.vMax;
  const plane = makePlane({
    id: `${opts.id}-plane`,
    x: 0,
    y: 0,
    width: opts.width,
    height: opts.height,
    xMin: -V,
    xMax: V,
    yMin: -V,
    yMax: V,
    xTicks: [-V, 0, V],
    yTicks: [-V, 0, V],
    xTickLabel: (v) => `${v} V`,
    yTickLabel: (v) => `${v} V`,
    xLabel: "v_in",
    yLabel: "v_out",
    theme,
  });
  const children: Node[] = [plane.node];
  if (opts.reference !== false) {
    const a = plane.toLocal(-V, -V);
    const b = plane.toLocal(V, V);
    children.push({
      id: `${opts.id}-ref`,
      type: "polyline",
      x: plane.originX,
      y: plane.originY,
      points: [a, b],
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
      dash: [5, 4],
    });
  }
  children.push(
    plotFunction(
      plane,
      (v) => Math.max(-V, Math.min(V, opts.fn(v))),
      { samples: 200 },
      { id: `${opts.id}-curve`, stroke: theme.palette.primary, strokeWidth: 3 },
    ),
  );
  children.push(
    movingMarker(plane, (t) => ({ x: opts.drive(t), y: opts.fn(opts.drive(t)) }), {
      id: `${opts.id}-dot`,
      tMin: 0,
      tMax: opts.tMax,
      start: opts.start,
      duration: opts.duration,
      samples: 300,
      radius: 6,
      fill: theme.palette.accent,
    }),
  );
  return {
    node: { id: opts.id, type: "group", x: opts.x, y: opts.y, children },
    at: (t) => {
      const st = Math.min(opts.tMax, Math.max(0, t - opts.start));
      const vin = opts.drive(st);
      return { vin, vout: opts.fn(vin) };
    },
  };
}

/* ------------------------------------------------------------- s-plane */

export interface PoleSpec {
  id: string;
  sigma: number;
  omega: number;
  label?: string;
  /** Slide the pole to a new σ over a window. */
  moveTo?: { sigma: number; at: number; dur: number };
}

export interface SPlaneOptions {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Most negative σ shown; the right edge sits a little past zero. */
  sigmaMin: number;
  poles: PoleSpec[];
  theme?: string;
}

/** The s-plane: σ across, jω up, a pole drawn as ×. A pole can slide, and everything that depends on it follows. */
export function sPlanePane(opts: SPlaneOptions): { node: GroupNode; poleX(sigma: number): number } {
  const theme = getTheme(opts.theme);
  const xMax = Math.abs(opts.sigmaMin) * 0.15;
  const plane = makePlane({
    id: `${opts.id}-plane`,
    x: 0,
    y: 0,
    width: opts.width,
    height: opts.height,
    xMin: opts.sigmaMin,
    xMax,
    yMin: -1,
    yMax: 1,
    xTicks: [opts.sigmaMin, opts.sigmaMin / 2, 0],
    yTicks: [0],
    xTickLabel: (v) => (v === 0 ? "0" : `${v}`),
    yTickLabel: () => "",
    xLabel: "σ (real)",
    yLabel: "jω",
    theme,
  });
  const children: Node[] = [plane.node];
  const axisX = plane.toLocal(0, 0).x;
  children.push({
    id: `${opts.id}-jw`,
    type: "polyline",
    x: plane.originX,
    y: plane.originY,
    points: [
      { x: axisX, y: 0 },
      { x: axisX, y: opts.height },
    ],
    stroke: theme.palette.text,
    strokeWidth: 1.5,
  });
  const poleX = (sigma: number) => plane.originX + plane.toLocal(sigma, 0).x;
  for (const p of opts.poles) {
    const lx = plane.toLocal(p.sigma, p.omega);
    const s = 7;
    const cross: Node = {
      id: `${opts.id}-${p.id}`,
      type: "group",
      x: plane.originX + lx.x,
      y: plane.originY + lx.y,
      children: [
        {
          id: `${opts.id}-${p.id}-a`,
          type: "polyline",
          x: 0,
          y: 0,
          points: [
            { x: -s, y: -s },
            { x: s, y: s },
          ],
          stroke: theme.palette.accent,
          strokeWidth: 3,
        },
        {
          id: `${opts.id}-${p.id}-b`,
          type: "polyline",
          x: 0,
          y: 0,
          points: [
            { x: -s, y: s },
            { x: s, y: -s },
          ],
          stroke: theme.palette.accent,
          strokeWidth: 3,
        },
        ...(p.label
          ? [
              {
                id: `${opts.id}-${p.id}-l`,
                type: "text",
                x: 0,
                y: -16,
                text: p.label,
                fontFamily: LABEL_FONT,
                fontWeight: 600,
                fontSize: 13,
                fill: theme.palette.accent,
                align: "center",
                baseline: "middle",
              } as Node,
            ]
          : []),
      ],
      ...(p.moveTo
        ? {
            tracks: [
              {
                property: "x",
                keyframes: [
                  { t: p.moveTo.at, value: plane.originX + lx.x },
                  {
                    t: p.moveTo.at + p.moveTo.dur,
                    value: plane.originX + plane.toLocal(p.moveTo.sigma, p.omega).x,
                    easing: "easeInOutCubic",
                  },
                ],
              },
            ],
          }
        : {}),
    };
    children.push(cross);
  }
  return { node: { id: opts.id, type: "group", x: opts.x, y: opts.y, children }, poleX };
}

/* -------------------------------------------------------------- phasor */

export interface PhasorOptions {
  id: string;
  /** Centre of the circle. */
  cx: number;
  cy: number;
  radius: number;
  /** Drawn angular speed, rad per lesson-second (a visual rate, not the real ω). */
  omega: number;
  start: number;
  duration: number;
  label?: string;
  color?: string;
  theme?: string;
}

/**
 * The rotating arrow. A sinusoid IS the vertical shadow of a vector spinning at ω; watch
 * the arrow turn beside the scope and the waveform stops being a formula. Rotation is
 * counter-clockwise, which on a y-down canvas is a negative rotation track.
 */
export function phasorPane(opts: PhasorOptions): { node: GroupNode; angleAt(t: number): number } {
  const theme = getTheme(opts.theme);
  const c = opts.color ?? theme.palette.accent;
  const r = opts.radius;
  const head = 9;
  const arrow: Node = {
    id: `${opts.id}-arrow`,
    type: "group",
    x: opts.cx,
    y: opts.cy,
    anchor: { x: 0, y: 0 },
    children: [
      {
        id: `${opts.id}-shaft`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: 0, y: 0 },
          { x: r, y: 0 },
        ],
        stroke: c,
        strokeWidth: 3.5,
      },
      {
        id: `${opts.id}-head`,
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: r - head, y: -head * 0.6 },
          { x: r, y: 0 },
          { x: r - head, y: head * 0.6 },
        ],
        stroke: c,
        strokeWidth: 3.5,
      },
      { id: `${opts.id}-tip`, type: "ellipse", x: r - 5, y: -5, width: 10, height: 10, fill: c },
    ],
    rotation: 0,
    tracks: [
      {
        property: "rotation",
        keyframes: [
          { t: opts.start, value: 0 },
          { t: opts.start + opts.duration, value: (-opts.omega * opts.duration * 180) / Math.PI },
        ],
      },
    ],
  };
  const children: Node[] = [
    {
      id: `${opts.id}-circle`,
      type: "ellipse",
      x: opts.cx - r,
      y: opts.cy - r,
      width: 2 * r,
      height: 2 * r,
      fill: "none",
      stroke: theme.palette.muted,
      strokeWidth: 1.5,
    },
    {
      id: `${opts.id}-hax`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: opts.cx - r - 10, y: opts.cy },
        { x: opts.cx + r + 10, y: opts.cy },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1,
      dash: [4, 4],
    },
    {
      id: `${opts.id}-vax`,
      type: "polyline",
      x: 0,
      y: 0,
      points: [
        { x: opts.cx, y: opts.cy - r - 10 },
        { x: opts.cx, y: opts.cy + r + 10 },
      ],
      stroke: theme.palette.muted,
      strokeWidth: 1,
      dash: [4, 4],
    },
    arrow,
    ...(opts.label
      ? [
          {
            id: `${opts.id}-lbl`,
            type: "text",
            x: opts.cx,
            y: opts.cy + r + 24,
            text: opts.label,
            fontFamily: LABEL_FONT,
            fontWeight: 600,
            fontSize: 14,
            fill: theme.palette.text,
            align: "center",
            baseline: "middle",
          } as Node,
        ]
      : []),
  ];
  return {
    node: { id: opts.id, type: "group", x: 0, y: 0, children },
    angleAt: (t) => opts.omega * Math.min(opts.duration, Math.max(0, t - opts.start)),
  };
}
