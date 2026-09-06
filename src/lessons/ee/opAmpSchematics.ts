/**
 * The op-amp stages EE 230 is built on, drawn once and shared by every tier that needs one.
 *
 * Tier 2 draws them ideal; Tier 3 draws the same stages and shows where the real device
 * departs from them; Tier 4 reuses the op-amp symbol for comparators. So the geometry lives
 * here, and the exports are a contract: each stage takes labels and element kinds as
 * options, wires only to the terminals `opAmp`/`resistor`/`capacitor` report, and hands
 * back the terminal points so a lesson can put a callout exactly on a node instead of
 * guessing a coordinate.
 *
 * Every junction where three or more conductors meet is one shared endpoint plus a drawn
 * dot, which is what `checkConductorConnectivity` asks for and what a reader needs to see.
 */
import { capacitor, ground, opAmp, resistor, wire, type CircuitSymbol, type Point, type SymbolOptions } from "../../physics/circuit.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT } from "./kit.js";
import type { GroupNode, Node, Track } from "../../spec/types.js";

/** Which two-terminal element sits in a branch. An integrator and a differentiator differ by these two. */
export type ElementKind = "resistor" | "capacitor";

/** Element size, px. One value everywhere so the stages look like one drawing set. */
const EL = 70;
/** Op-amp body size, px. */
const OA_SIZE = 90;
const OA_X = 200;
const OA_Y = 40;
/** The feedback rail, above the op-amp. */
const FB_Y = 0;
/** Left edge of the input element on its row. */
const EL_X = 60;
/** Vertical pitch between input rows on the summing stage. */
const ROW_PITCH = 70;

export interface StagePoints {
  /** Input terminals, in the order the weights were given. */
  inputs: Point[];
  /** The inverting node: the summing junction, and the virtual ground of any inverting stage. */
  summing: Point;
  /** The non-inverting terminal. */
  plus: Point;
  /** The output terminal, where v_out is taken. */
  out: Point;
  /** Centre of the feedback element, so a callout lands on the part rather than beside it. */
  feedback: Point;
}

export interface OpAmpStage {
  node: GroupNode;
  /** Extent from the group's origin. Content runs from about y = -32 to y = bbox.h - 32. */
  bbox: { w: number; h: number };
  points: StagePoints;
  /** The op-amp body itself, for a tier that draws supply rails or a chip name on it. */
  opAmp: { x: number; y: number; size: number };
}

export interface StageOptions {
  id: string;
  x: number;
  y: number;
  /** Marching-ants current on every wire. */
  current?: boolean;
  /** A name on the op-amp body, e.g. "LF356". */
  opAmpLabel?: string;
  /**
   * Lesson time at which the surrounding network fades in. Before it, only the op-amp and
   * its output terminal are drawn -- the bare device, which is where `ee.opAmpRules` starts.
   */
  revealAt?: number;
  theme?: string;
}

const KIND: Record<ElementKind, (o: SymbolOptions) => CircuitSymbol> = { resistor, capacitor };

/**
 * Stand a horizontal symbol upright: rotating the group 90° about terminal `a` maps the
 * offset (size, 0) to (0, size), so `b` lands directly below `a`. Built without a label so
 * the label can be placed upright beside it.
 */
function vertical(
  make: (o: SymbolOptions) => CircuitSymbol,
  o: { id: string; x: number; y: number; color: string },
): { node: Node; a: Point; b: Point } {
  const sym = make({ id: o.id, x: o.x, y: o.y, size: EL, color: o.color });
  return {
    node: { id: `${o.id}-v`, type: "group", x: 0, y: 0, rotation: 90, anchor: { x: o.x, y: o.y }, children: [sym.node] },
    a: { x: o.x, y: o.y },
    b: { x: o.x, y: o.y + EL },
  };
}

/** A junction dot, centred on the node rather than hung off it. */
function junction(id: string, p: Point, fill: string): Node {
  return { id, type: "ellipse", x: p.x - 4.5, y: p.y - 4.5, width: 9, height: 9, fill };
}

function caption(id: string, x: number, y: number, text: string, align: "left" | "center" | "right", fill: string, size = 15): Node {
  return { id, type: "text", x, y, text, fontFamily: LABEL_FONT, fontWeight: 600, fontSize: size, fill, align, baseline: "middle" };
}

/** The network arrives on cue: before `at` the track holds its first keyframe, so it is simply absent. */
function revealTrack(at: number): Track[] {
  return [
    {
      property: "opacity",
      keyframes: [
        { t: at, value: 0 },
        { t: at + 0.5, value: 1 },
      ],
    },
  ];
}

/** The pieces every stage shares: the op-amp, the run out to the v_out terminal, and the labels. */
function core(o: StageOptions & { outLabel?: string }) {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const cur = o.current === true;
  const w = (id: string, points: Point[]): Node => wire({ id, points, current: cur, color: cur ? theme.palette.accent : ink });

  const oa = opAmp({
    id: `${o.id}-oa`,
    x: OA_X,
    y: OA_Y,
    size: OA_SIZE,
    color: ink,
    ...(o.opAmpLabel ? { label: o.opAmpLabel } : {}),
  });
  const nodeX = oa.inMinus.x - 20;
  const outX = oa.out.x + 40;
  const termX = oa.out.x + 100;
  const outTerm: Point = { x: termX, y: oa.out.y };
  const outNode: Point = { x: outX, y: oa.out.y };

  const device: Node[] = [
    oa.node,
    w(`${o.id}-w-out-1`, [oa.out, outNode]),
    w(`${o.id}-w-out-2`, [outNode, outTerm]),
    junction(`${o.id}-dot-out`, outTerm, ink),
    caption(`${o.id}-lbl-out`, outTerm.x, outTerm.y - 18, o.outLabel ?? "v_out", "center", theme.palette.accent),
  ];
  return { theme, ink, w, oa, nodeX, outX, termX, outTerm, outNode, device };
}

/** The + input tied to the common rail. `drop` clears whatever else runs below the terminal. */
function plusToGround(id: string, at: Point, w: (id: string, p: Point[]) => Node, ink: string, drop = 60): Node[] {
  const foot: Point = { x: at.x, y: at.y + drop };
  return [w(`${id}-w-gnd`, [at, foot]), ground({ id: `${id}-gnd`, x: foot.x, y: foot.y, size: 34, color: ink }).node];
}

function assemble(
  o: StageOptions,
  device: Node[],
  network: Node[],
  bbox: { w: number; h: number },
  points: StagePoints,
  oa: { x: number; y: number; size: number },
): OpAmpStage {
  const net: Node = {
    id: `${o.id}-net`,
    type: "group",
    x: 0,
    y: 0,
    children: network,
    ...(o.revealAt !== undefined ? { tracks: revealTrack(o.revealAt) } : {}),
  };
  return {
    node: { id: o.id, type: "group", x: o.x, y: o.y, children: [...device, net] },
    bbox,
    points: {
      inputs: points.inputs.map((p) => ({ x: p.x + o.x, y: p.y + o.y })),
      summing: { x: points.summing.x + o.x, y: points.summing.y + o.y },
      plus: { x: points.plus.x + o.x, y: points.plus.y + o.y },
      out: { x: points.out.x + o.x, y: points.out.y + o.y },
      feedback: { x: points.feedback.x + o.x, y: points.feedback.y + o.y },
    },
    opAmp: { x: oa.x + o.x, y: oa.y + o.y, size: oa.size },
  };
}

export interface SingleInputStageOptions extends StageOptions {
  /** The element in series with the input. Default a resistor. */
  input?: ElementKind;
  /** The element in the feedback path. Default a resistor. */
  feedback?: ElementKind;
  /** Label on the input element. Carry a real value: the connectivity gate reads the notation. */
  inputLabel?: string;
  /** Label on the feedback element. */
  feedbackLabel?: string;
  inputTerminalLabel?: string;
  outLabel?: string;
}

/**
 * One input element into the inverting node, one element back from the output: the shape
 * every inverting stage in the course has. `input`/`feedback` choose the elements, so the
 * same drawing is the inverting amplifier (R, R), the integrator (R, C) and the
 * differentiator (C, R).
 */
function singleInputStage(o: SingleInputStageOptions): OpAmpStage {
  const { theme, ink, w, oa, nodeX, outX, outTerm, device } = core(o);
  const rowY = oa.inMinus.y;
  const summing: Point = { x: nodeX, y: rowY };
  const inTerm: Point = { x: 0, y: rowY };

  const e1 = KIND[o.input ?? "resistor"]({
    id: `${o.id}-e1`,
    x: EL_X,
    y: rowY,
    size: EL,
    color: ink,
    ...(o.inputLabel ? { label: o.inputLabel } : {}),
  });
  const e2 = KIND[o.feedback ?? "resistor"]({
    id: `${o.id}-e2`,
    x: nodeX + 20,
    y: FB_Y,
    size: EL,
    color: ink,
    ...(o.feedbackLabel ? { label: o.feedbackLabel } : {}),
  });

  const network: Node[] = [
    // Input branch: terminal, element, on to the summing node.
    junction(`${o.id}-dot-in`, inTerm, ink),
    caption(`${o.id}-lbl-in`, inTerm.x, inTerm.y - 18, o.inputTerminalLabel ?? "v_in", "center", theme.palette.primary),
    w(`${o.id}-w-in-1`, [inTerm, e1.a]),
    e1.node,
    w(`${o.id}-w-in-2`, [e1.b, summing]),
    w(`${o.id}-w-in-3`, [summing, oa.inMinus]),
    // Feedback branch: up from the summing node, across, down onto the output run.
    w(`${o.id}-w-fb-1`, [summing, { x: nodeX, y: FB_Y }]),
    w(`${o.id}-w-fb-2`, [{ x: nodeX, y: FB_Y }, e2.a]),
    e2.node,
    w(`${o.id}-w-fb-3`, [e2.b, { x: outX, y: FB_Y }]),
    w(`${o.id}-w-fb-4`, [
      { x: outX, y: FB_Y },
      { x: outX, y: oa.out.y },
    ]),
    junction(`${o.id}-dot-node`, summing, theme.palette.accent),
    junction(`${o.id}-dot-outnode`, { x: outX, y: oa.out.y }, ink),
    ...plusToGround(o.id, oa.inPlus, w, ink),
  ];

  return assemble(
    o,
    device,
    network,
    { w: outTerm.x + 30, h: 220 },
    { inputs: [inTerm], summing, plus: oa.inPlus, out: outTerm, feedback: { x: e2.a.x + EL / 2, y: FB_Y } },
    { x: OA_X, y: OA_Y, size: OA_SIZE },
  );
}

/** The inverting amplifier: v_out = -(R_f/R_in) v_in. */
export function invertingStage(o: SingleInputStageOptions = { id: "inv", x: 0, y: 0 }): OpAmpStage {
  return singleInputStage({
    inputLabel: "R_in = 10 kΩ",
    feedbackLabel: "R_f = 20 kΩ",
    ...o,
    input: o.input ?? "resistor",
    feedback: o.feedback ?? "resistor",
  });
}

/**
 * The integrator: v_out = -(1/RC) ∫ v_in dt. Swap the two elements
 * (`input: "capacitor", feedback: "resistor"`) and the same drawing is the differentiator.
 */
export function integratorStage(o: SingleInputStageOptions = { id: "int", x: 0, y: 0 }): OpAmpStage {
  const input = o.input ?? "resistor";
  const feedback = o.feedback ?? "capacitor";
  return singleInputStage({
    inputLabel: input === "resistor" ? "R = 10 kΩ" : "C = 100 nF",
    feedbackLabel: feedback === "capacitor" ? "C = 100 nF" : "R = 10 kΩ",
    ...o,
    input,
    feedback,
  });
}

export interface NonInvertingStageOptions extends StageOptions {
  /** Label on the feedback resistor, from the output back to the inverting node. */
  rfLabel?: string;
  /** Label on the resistor from the inverting node to the common rail. */
  rgLabel?: string;
  inputTerminalLabel?: string;
  outLabel?: string;
}

/**
 * The non-inverting amplifier: v_out = (1 + R_f/R_g) v_in, input and output in phase.
 *
 * The symbol puts − above +, so the branch from the inverting node down to R_g crosses the
 * input rail on its way. Crossing wires without a dot are not joined -- standard drafting,
 * and the only alternative would be to mirror the op-amp symbol.
 */
export function nonInvertingStage(o: NonInvertingStageOptions = { id: "ni", x: 0, y: 0 }): OpAmpStage {
  const { theme, ink, w, oa, nodeX, outX, outTerm, device } = core(o);
  const rowY = oa.inMinus.y;
  const summing: Point = { x: nodeX, y: rowY };
  const inTerm: Point = { x: 0, y: oa.inPlus.y };
  /** The R_g column, far enough left that it crosses the input rail well clear of both ends. */
  const gX = EL_X;
  const gTop: Point = { x: gX, y: rowY };
  const rg = vertical(resistor, { id: `${o.id}-rg`, x: gX, y: oa.inPlus.y + 20, color: ink });
  const rf = resistor({
    id: `${o.id}-rf`,
    x: nodeX + 20,
    y: FB_Y,
    size: EL,
    color: ink,
    label: o.rfLabel ?? "R_f = 10 kΩ",
  });

  const network: Node[] = [
    junction(`${o.id}-dot-in`, inTerm, ink),
    caption(`${o.id}-lbl-in`, inTerm.x, inTerm.y - 18, o.inputTerminalLabel ?? "v_in", "center", theme.palette.primary),
    w(`${o.id}-w-in`, [inTerm, oa.inPlus]),
    // The inverting node: left to the R_g column, up to the feedback rail, right to the op-amp.
    w(`${o.id}-w-n-1`, [gTop, summing]),
    w(`${o.id}-w-n-2`, [summing, oa.inMinus]),
    w(`${o.id}-w-rg-1`, [gTop, rg.a]),
    rg.node,
    caption(`${o.id}-lbl-rg`, gX + 16, (rg.a.y + rg.b.y) / 2, o.rgLabel ?? "R_g = 10 kΩ", "left", ink),
    w(`${o.id}-w-rg-2`, [rg.b, { x: gX, y: rg.b.y + 20 }]),
    ground({ id: `${o.id}-gnd`, x: gX, y: rg.b.y + 20, size: 34, color: ink }).node,
    w(`${o.id}-w-fb-1`, [summing, { x: nodeX, y: FB_Y }]),
    w(`${o.id}-w-fb-2`, [{ x: nodeX, y: FB_Y }, rf.a]),
    rf.node,
    w(`${o.id}-w-fb-3`, [rf.b, { x: outX, y: FB_Y }]),
    w(`${o.id}-w-fb-4`, [
      { x: outX, y: FB_Y },
      { x: outX, y: oa.out.y },
    ]),
    junction(`${o.id}-dot-node`, summing, theme.palette.accent),
    junction(`${o.id}-dot-g`, gTop, ink),
    junction(`${o.id}-dot-outnode`, { x: outX, y: oa.out.y }, ink),
  ];

  return assemble(
    o,
    device,
    network,
    { w: outTerm.x + 30, h: 270 },
    { inputs: [inTerm], summing, plus: oa.inPlus, out: outTerm, feedback: { x: rf.a.x + EL / 2, y: FB_Y } },
    { x: OA_X, y: OA_Y, size: OA_SIZE },
  );
}

export interface SummingStageOptions extends StageOptions {
  /** One entry per input: the series resistor's label and the terminal's name. */
  inputs?: Array<{ label: string; terminal: string }>;
  feedbackLabel?: string;
  outLabel?: string;
}

/**
 * The summing amplifier: every input drives the same node through its own resistor, and
 * because that node is held at zero the currents simply add — v_out = -R_f (v_1/R_1 + v_2/R_2 + …).
 * The first input runs straight in; the rest step up a shared column to the same junction,
 * which is what makes "one node" visible.
 */
export function summingStage(o: SummingStageOptions = { id: "sum", x: 0, y: 0 }): OpAmpStage {
  const { theme, ink, w, oa, nodeX, outX, outTerm, device } = core(o);
  const rowY = oa.inMinus.y;
  const summing: Point = { x: nodeX, y: rowY };
  const inputs = o.inputs ?? [
    { label: "R_1 = 10 kΩ", terminal: "v_1" },
    { label: "R_2 = 5 kΩ", terminal: "v_2" },
  ];
  const rf = resistor({
    id: `${o.id}-rf`,
    x: nodeX + 20,
    y: FB_Y,
    size: EL,
    color: ink,
    label: o.feedbackLabel ?? "R_f = 10 kΩ",
  });

  /** The column the lower rows climb, kept clear of the + input's drop to the common rail. */
  const colX = EL_X + EL;
  const terminals: Point[] = [];
  const network: Node[] = [];
  inputs.forEach((inp, k) => {
    const y = rowY + k * ROW_PITCH;
    const term: Point = { x: 0, y };
    terminals.push(term);
    const r = resistor({ id: `${o.id}-r${k + 1}`, x: EL_X, y, size: EL, color: ink });
    // Row 0 labels above; the rows below label under the part, clear of the column they climb.
    const labelY = k === 0 ? y - 24 : y + 26;
    network.push(
      junction(`${o.id}-dot-in${k}`, term, ink),
      caption(`${o.id}-lbl-in${k}`, term.x, term.y - 18, inp.terminal, "center", theme.palette.primary),
      caption(`${o.id}-lbl-r${k}`, EL_X + EL / 2, labelY, inp.label, "center", ink),
      w(`${o.id}-w-in${k}-1`, [term, r.a]),
      r.node,
    );
    // Every row above the first climbs the shared column to the one summing node.
    if (k > 0) network.push(w(`${o.id}-w-in${k}-2`, [r.b, { x: colX, y: y - ROW_PITCH }]));
  });

  network.push(
    w(`${o.id}-w-col`, [{ x: colX, y: rowY }, summing]),
    junction(`${o.id}-dot-col`, { x: colX, y: rowY }, theme.palette.accent),
    w(`${o.id}-w-n`, [summing, oa.inMinus]),
    w(`${o.id}-w-fb-1`, [summing, { x: nodeX, y: FB_Y }]),
    w(`${o.id}-w-fb-2`, [{ x: nodeX, y: FB_Y }, rf.a]),
    rf.node,
    w(`${o.id}-w-fb-3`, [rf.b, { x: outX, y: FB_Y }]),
    w(`${o.id}-w-fb-4`, [
      { x: outX, y: FB_Y },
      { x: outX, y: oa.out.y },
    ]),
    junction(`${o.id}-dot-node`, summing, theme.palette.accent),
    junction(`${o.id}-dot-outnode`, { x: outX, y: oa.out.y }, ink),
    ...plusToGround(o.id, oa.inPlus, w, ink, 60 + (inputs.length - 1) * ROW_PITCH),
  );

  return assemble(
    o,
    device,
    network,
    { w: outTerm.x + 30, h: 220 + (inputs.length - 1) * ROW_PITCH },
    { inputs: terminals, summing, plus: oa.inPlus, out: outTerm, feedback: { x: rf.a.x + EL / 2, y: FB_Y } },
    { x: OA_X, y: OA_Y, size: OA_SIZE },
  );
}
