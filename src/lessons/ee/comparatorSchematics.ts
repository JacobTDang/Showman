/**
 * The three drawings Tier 4 needs, which are the same op-amp wired three ways.
 *
 * Tier 2's `opAmpSchematics.ts` owns every stage with NEGATIVE feedback, and none of these
 * is one. A comparator has no feedback at all; a Schmitt trigger's feedback goes to the +
 * terminal, which is the opposite of everything the course has drawn so far; and the
 * relaxation oscillator has no input terminal, because it makes its own. So the geometry
 * lives here, built from the same symbols and the same discipline: wires meet only the
 * terminals `opAmp`, `resistor`, `capacitor`, `battery` and `ground` report, and every
 * junction where three conductors meet is one shared endpoint plus a drawn dot.
 *
 * The one departure from Tier 2's drawing set is size. A stage whose feedback runs BELOW
 * the op-amp needs the vertical room Tier 2 spends on a feedback rail above it, so the
 * op-amp is 78 px here rather than 90 and the two-terminal elements 56 rather than 70. No
 * lesson shows a Tier 2 stage and a Tier 4 stage at the same time, so nothing is mismatched
 * on screen.
 */
import {
  battery,
  capacitor,
  ground,
  opAmp,
  resistor,
  wire,
  type CircuitSymbol,
  type Point,
  type SymbolOptions,
} from "../../physics/circuit.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT } from "./kit.js";
import type { GroupNode, Node } from "../../spec/types.js";

/** Two-terminal element size, px. */
const EL = 56;
/** Op-amp body size, px. */
const OA_SIZE = 78;
const OA_X = 200;
const OA_Y = 20;
/** The rail above the op-amp, used by whatever has to get from the output back to an input. */
const TOP_Y = 4;
/** The rail below the op-amp, where the positive-feedback divider sits. */
const DIV_Y = 112;

export interface StagePoints {
  /** Where the signal is applied. The oscillator has none: it makes its own. */
  input?: Point;
  /** The inverting terminal. */
  minus: Point;
  /** The non-inverting terminal. */
  plus: Point;
  /** The output terminal, where v_out is taken. */
  out: Point;
  /**
   * The node that sets the threshold: the divider tap on a Schmitt trigger, the top of the
   * reference source on a comparator. A callout about a threshold belongs here.
   */
  threshold: Point;
}

export interface ComparatorStage {
  node: GroupNode;
  /** Extent from the group's origin. Content runs from about y = -18 to y = bbox.h. */
  bbox: { w: number; h: number };
  points: StagePoints;
  /** The op-amp body itself, for a tier that wants to write on it. */
  opAmp: { x: number; y: number; size: number };
}

export interface StageOptions {
  id: string;
  x: number;
  y: number;
  /** Marching-ants current on every wire. */
  current?: boolean;
  /** Name on the v_out terminal. Default "v_out". */
  outLabel?: string;
  theme?: string;
}

/**
 * Stand a horizontal symbol upright: rotating the group 90° about terminal `a` maps the
 * offset (size, 0) to (0, size), so `b` lands directly below `a`. Built without a label so
 * the label can be placed upright beside it.
 */
function vertical(
  make: (o: SymbolOptions) => CircuitSymbol,
  o: { id: string; x: number; y: number; color: string; size?: number },
): { node: Node; a: Point; b: Point } {
  const size = o.size ?? EL;
  const sym = make({ id: o.id, x: o.x, y: o.y, size, color: o.color });
  return {
    node: { id: `${o.id}-v`, type: "group", x: 0, y: 0, rotation: 90, anchor: { x: o.x, y: o.y }, children: [sym.node] },
    a: { x: o.x, y: o.y },
    b: { x: o.x, y: o.y + size },
  };
}

/** A junction dot, centred on the node rather than hung off it. */
function junction(id: string, p: Point, fill: string): Node {
  return { id, type: "ellipse", x: p.x - 4.5, y: p.y - 4.5, width: 9, height: 9, fill };
}

function caption(id: string, x: number, y: number, text: string, align: "left" | "center" | "right", fill: string, size = 15): Node {
  return { id, type: "text", x, y, text, fontFamily: LABEL_FONT, fontWeight: 600, fontSize: size, fill, align, baseline: "middle" };
}

/** The op-amp, the run out to the v_out terminal, and the terminal's name: shared by all three. */
function core(o: StageOptions) {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const cur = o.current === true;
  const w = (id: string, points: Point[]): Node => wire({ id, points, current: cur, color: cur ? theme.palette.accent : ink });

  const oa = opAmp({ id: `${o.id}-oa`, x: OA_X, y: OA_Y, size: OA_SIZE, color: ink });
  const outNode: Point = { x: oa.out.x + 40, y: oa.out.y };
  const outTerm: Point = { x: oa.out.x + 100, y: oa.out.y };

  const device: Node[] = [
    oa.node,
    w(`${o.id}-w-out-1`, [oa.out, outNode]),
    w(`${o.id}-w-out-2`, [outNode, outTerm]),
    junction(`${o.id}-dot-out`, outTerm, ink),
    caption(`${o.id}-lbl-out`, outTerm.x, outTerm.y - 18, o.outLabel ?? "v_out", "center", theme.palette.accent),
  ];
  return { theme, ink, w, oa, outNode, outTerm, device };
}

function assemble(o: StageOptions, children: Node[], bbox: { w: number; h: number }, points: StagePoints): ComparatorStage {
  const shift = (p: Point): Point => ({ x: p.x + o.x, y: p.y + o.y });
  return {
    node: { id: o.id, type: "group", x: o.x, y: o.y, children },
    bbox,
    points: {
      ...(points.input ? { input: shift(points.input) } : {}),
      minus: shift(points.minus),
      plus: shift(points.plus),
      out: shift(points.out),
      threshold: shift(points.threshold),
    },
    opAmp: { x: OA_X + o.x, y: OA_Y + o.y, size: OA_SIZE },
  };
}

export interface ComparatorStageOptions extends StageOptions {
  /** Label on the reference source. Carry a real value: the connectivity gate reads the notation. */
  refLabel?: string;
  inputTerminalLabel?: string;
}

/**
 * The comparator: an op-amp with nothing wired back from its output at all.
 *
 * The signal drives the + terminal and a reference source holds the −, so the output is
 * +V_sat whenever v_in is above V_ref and −V_sat whenever it is below. The reference branch
 * leaves the − terminal UPWARD and comes down a column to the left of the input terminal,
 * because − sits above + in the symbol and any other route would have the two branches
 * cross with no junction between them.
 */
export function comparatorStage(o: ComparatorStageOptions = { id: "cmp", x: 0, y: 0 }): ComparatorStage {
  const { theme, ink, w, oa, outTerm, device } = core(o);
  const refX = 0;
  const inTerm: Point = { x: 110, y: oa.inPlus.y };
  const refTop: Point = { x: refX, y: TOP_Y };
  const bat = vertical(battery, { id: `${o.id}-vref`, x: refX, y: 38, color: ink, size: 64 });

  const children: Node[] = [
    ...device,
    // The reference: up from the − terminal, left along the top rail, down through the source.
    w(`${o.id}-w-ref-1`, [oa.inMinus, { x: oa.inMinus.x, y: TOP_Y }]),
    w(`${o.id}-w-ref-2`, [{ x: oa.inMinus.x, y: TOP_Y }, refTop]),
    w(`${o.id}-w-ref-3`, [refTop, bat.a]),
    bat.node,
    ground({ id: `${o.id}-gnd`, x: bat.b.x, y: bat.b.y, size: 34, color: ink }).node,
    caption(`${o.id}-lbl-ref`, refX - 16, (bat.a.y + bat.b.y) / 2, o.refLabel ?? "V_ref = 5.0 V", "right", theme.palette.secondary),
    // The signal, straight into the + terminal.
    junction(`${o.id}-dot-in`, inTerm, ink),
    caption(`${o.id}-lbl-in`, inTerm.x, inTerm.y - 18, o.inputTerminalLabel ?? "v_in", "center", theme.palette.primary),
    w(`${o.id}-w-in`, [inTerm, oa.inPlus]),
  ];

  return assemble(
    o,
    children,
    { w: outTerm.x + 30, h: bat.b.y + 30 },
    { input: inTerm, minus: oa.inMinus, plus: oa.inPlus, out: outTerm, threshold: bat.a },
  );
}

export interface DividerOptions {
  /** Label on the resistor from the divider tap to the common rail. */
  r1Label?: string;
  /** Label on the resistor from the output back to the divider tap. */
  r2Label?: string;
}

/**
 * The positive-feedback divider both the Schmitt trigger and the oscillator hang off the +
 * terminal: R_2 back from the output, R_1 down to the common rail, and the tap between them
 * holding v+ at β·v_out with β = R_1/(R_1 + R_2).
 */
function divider(o: StageOptions & DividerOptions, ctx: ReturnType<typeof core>): { children: Node[]; tap: Point; bottom: number } {
  const { theme, ink, w, oa, outNode } = ctx;
  const tap: Point = { x: oa.inPlus.x, y: DIV_Y };
  // Labelled below rather than above: the default position lands on the op-amp's sloping
  // lower edge, which passes only a few px over this row.
  const r2 = resistor({ id: `${o.id}-r2`, x: tap.x + 60, y: DIV_Y, size: EL, color: ink });
  const r1 = vertical(resistor, { id: `${o.id}-r1`, x: tap.x, y: DIV_Y + 34, color: ink });

  return {
    children: [
      w(`${o.id}-w-tap`, [tap, oa.inPlus]),
      w(`${o.id}-w-r2-1`, [tap, r2.a]),
      r2.node,
      caption(`${o.id}-lbl-r2`, r2.a.x + EL / 2, DIV_Y + 26, o.r2Label ?? "R_2 = 16 kΩ", "center", ink),
      w(`${o.id}-w-r2-2`, [r2.b, { x: outNode.x, y: DIV_Y }]),
      w(`${o.id}-w-r2-3`, [{ x: outNode.x, y: DIV_Y }, outNode]),
      w(`${o.id}-w-r1-1`, [tap, r1.a]),
      r1.node,
      caption(`${o.id}-lbl-r1`, tap.x + 16, (r1.a.y + r1.b.y) / 2, o.r1Label ?? "R_1 = 10 kΩ", "left", ink),
      w(`${o.id}-w-r1-2`, [r1.b, { x: tap.x, y: r1.b.y + 18 }]),
      ground({ id: `${o.id}-gnd`, x: tap.x, y: r1.b.y + 18, size: 34, color: ink }).node,
      junction(`${o.id}-dot-tap`, tap, theme.palette.accent),
      junction(`${o.id}-dot-outnode`, outNode, ink),
    ],
    tap,
    bottom: r1.b.y + 18 + 26,
  };
}

export interface SchmittStageOptions extends StageOptions, DividerOptions {
  inputTerminalLabel?: string;
}

/**
 * The inverting Schmitt trigger: the signal on the − terminal, and the output fed back to
 * the + terminal through R_1, R_2.
 *
 * Feedback to + is POSITIVE feedback, and it does the opposite of what every stage before
 * this one did: instead of settling the output it drives it harder, so the output is always
 * at a rail and the + terminal is always at ±β·V_sat. Those two voltages are the thresholds.
 * The cost of putting the feedback on + is that the signal has to move to −, so this
 * circuit inverts; the non-inverting Schmitt exists and has thresholds ±(R_1/R_2)·V_sat.
 */
export function schmittStage(o: SchmittStageOptions = { id: "sch", x: 0, y: 0 }): ComparatorStage {
  const ctx = core(o);
  const { theme, ink, w, oa, outTerm, device } = ctx;
  const div = divider(o, ctx);
  const inTerm: Point = { x: 0, y: oa.inMinus.y };

  const children: Node[] = [
    ...device,
    junction(`${o.id}-dot-in`, inTerm, ink),
    caption(`${o.id}-lbl-in`, inTerm.x, inTerm.y - 18, o.inputTerminalLabel ?? "v_in", "center", theme.palette.primary),
    w(`${o.id}-w-in`, [inTerm, oa.inMinus]),
    ...div.children,
  ];

  return assemble(
    o,
    children,
    { w: outTerm.x + 30, h: div.bottom },
    { input: inTerm, minus: oa.inMinus, plus: oa.inPlus, out: outTerm, threshold: div.tap },
  );
}

export interface RelaxationStageOptions extends StageOptions, DividerOptions {
  /** Label on the timing resistor, from the output back to the capacitor. */
  rLabel?: string;
  /** Label on the timing capacitor. */
  cLabel?: string;
}

/**
 * The relaxation oscillator: the same Schmitt trigger, with the signal terminal replaced by
 * an RC that the output charges.
 *
 * There is no input terminal. The output drives the capacitor through R toward its own
 * rail; when the capacitor reaches the threshold the Schmitt flips, the rail reverses, and
 * the capacitor turns round. The timing branch runs over the top rail so it never crosses
 * the feedback divider below.
 */
export function relaxationStage(o: RelaxationStageOptions = { id: "rlx", x: 0, y: 0 }): ComparatorStage {
  const ctx = core(o);
  const { theme, ink, w, oa, outNode, outTerm, device } = ctx;
  const div = divider(o, ctx);
  /** The capacitor node, which is also the inverting terminal. */
  const cNode: Point = { x: 110, y: oa.inMinus.y };
  const r = resistor({ id: `${o.id}-r`, x: 243, y: TOP_Y, size: EL, color: ink, label: o.rLabel ?? "R = 10 kΩ" });
  const cap = vertical(capacitor, { id: `${o.id}-c`, x: cNode.x, y: cNode.y + 34, color: ink });

  const children: Node[] = [
    ...device,
    // The timing resistor, from the output up over the top and back down to the − terminal.
    w(`${o.id}-w-r-1`, [outNode, { x: outNode.x, y: TOP_Y }]),
    w(`${o.id}-w-r-2`, [{ x: outNode.x, y: TOP_Y }, r.b]),
    r.node,
    w(`${o.id}-w-r-3`, [r.a, { x: cNode.x, y: TOP_Y }]),
    w(`${o.id}-w-r-4`, [{ x: cNode.x, y: TOP_Y }, cNode]),
    w(`${o.id}-w-c-1`, [cNode, cap.a]),
    cap.node,
    caption(`${o.id}-lbl-c`, cNode.x - 16, (cap.a.y + cap.b.y) / 2, o.cLabel ?? "C = 10 nF", "right", theme.palette.primary),
    ground({ id: `${o.id}-gnd-c`, x: cap.b.x, y: cap.b.y, size: 34, color: ink }).node,
    w(`${o.id}-w-n`, [cNode, oa.inMinus]),
    junction(`${o.id}-dot-c`, cNode, theme.palette.primary),
    ...div.children,
  ];

  return assemble(
    o,
    children,
    { w: outTerm.x + 30, h: div.bottom },
    { minus: oa.inMinus, plus: oa.inPlus, out: outTerm, threshold: div.tap },
  );
}
