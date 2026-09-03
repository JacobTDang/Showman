/**
 * The schematics the EE 230 lessons draw. Each composes the circuit symbol primitives and
 * wires only to the terminals they report, so connectivity holds by construction — the
 * same discipline as the catalog's physics builders.
 */
import {
  acSource,
  battery,
  capacitor,
  inductor,
  resistor,
  wire,
  type CircuitSymbol,
  type Point,
  type SymbolOptions,
} from "../../physics/circuit.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT } from "./kit.js";
import type { GroupNode, Node } from "../../spec/types.js";

const EL = 70;
const TOP_Y = 30;
const BOT_Y = 190;
/** Centres a vertical element in the rail gap. */
const LEAD = (BOT_Y - TOP_Y - EL) / 2;
const SERIES_X = 60;
const JUNCTION_X = 200;
const OUT_X = 280;

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

function dot(id: string, p: Point, fill: string): Node {
  return { id, type: "ellipse", x: p.x, y: p.y, width: 9, height: 9, fill };
}

function caption(id: string, x: number, y: number, text: string, align: "left" | "center" | "right", fill: string, font: string): Node {
  return { id, type: "text", x, y, text, fontFamily: font, fontWeight: 600, fontSize: 15, fill, align, baseline: "middle" };
}

export interface RcSchematicOptions {
  id: string;
  x: number;
  y: number;
  /** Which element sits in series on the top rail; the other shunts the output. */
  series: "R" | "C";
  rLabel?: string;
  cLabel?: string;
  /** Marching-ants current on every wire. */
  current?: boolean;
  theme?: string;
}

export interface RcSchematic {
  node: GroupNode;
  bbox: { w: number; h: number };
}

/**
 * A first-order RC network: an AC source on the left rail, one element in series along
 * the top rail, the other shunting from the junction to the return rail, and the output
 * taken across the shunt at A–B. `series: "R"` is the lowpass; `series: "C"` the highpass.
 */
export function rcSchematic(o: RcSchematicOptions): RcSchematic {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const font = LABEL_FONT;
  const children: Node[] = [];
  const cur = o.current === true;
  const w = (id: string, points: Point[]) => wire({ id, points, current: cur, color: cur ? theme.palette.accent : ink });

  const topLeft: Point = { x: 0, y: TOP_Y };
  const botLeft: Point = { x: 0, y: BOT_Y };
  const junction: Point = { x: JUNCTION_X, y: TOP_Y };
  const botJunction: Point = { x: JUNCTION_X, y: BOT_Y };
  const outA: Point = { x: OUT_X, y: TOP_Y };
  const outB: Point = { x: OUT_X, y: BOT_Y };

  const src = vertical(acSource, { id: `${o.id}-src`, x: 0, y: TOP_Y + LEAD, color: ink });
  children.push(src.node, w(`${o.id}-w-src-top`, [topLeft, src.a]), w(`${o.id}-w-src-bot`, [src.b, botLeft]));
  children.push(caption(`${o.id}-vin`, src.a.x - 26, (src.a.y + src.b.y) / 2, "v_in", "right", ink, font));

  const seriesMake = o.series === "R" ? resistor : capacitor;
  const shuntMake = o.series === "R" ? capacitor : resistor;
  const seriesLabel = o.series === "R" ? o.rLabel : o.cLabel;
  const shuntLabel = o.series === "R" ? o.cLabel : o.rLabel;

  const ser = seriesMake({
    id: `${o.id}-series`,
    x: SERIES_X,
    y: TOP_Y,
    size: EL,
    color: ink,
    ...(seriesLabel ? { label: seriesLabel } : {}),
  });
  children.push(ser.node, w(`${o.id}-w-top-1`, [topLeft, ser.a]), w(`${o.id}-w-top-2`, [ser.b, junction]));

  const sh = vertical(shuntMake, { id: `${o.id}-shunt`, x: JUNCTION_X, y: TOP_Y + LEAD, color: ink });
  children.push(sh.node, w(`${o.id}-w-shunt-top`, [junction, sh.a]), w(`${o.id}-w-shunt-bot`, [sh.b, botJunction]));
  if (shuntLabel) children.push(caption(`${o.id}-shunt-lbl`, JUNCTION_X + 22, (sh.a.y + sh.b.y) / 2, shuntLabel, "left", ink, font));

  children.push(
    w(`${o.id}-w-out-a`, [junction, outA]),
    w(`${o.id}-w-bot-1`, [botLeft, botJunction]),
    w(`${o.id}-w-out-b`, [botJunction, outB]),
  );
  children.push(dot(`${o.id}-dot-a`, outA, ink), dot(`${o.id}-dot-b`, outB, ink));
  children.push(caption(`${o.id}-vout`, outA.x, outA.y - 16, "v_out", "center", theme.palette.accent, font));

  return { node: { id: o.id, type: "group", x: o.x, y: o.y, children }, bbox: { w: 320, h: 210 } };
}

/* ---------------------------------------------------------- Tier 0 loops */

export interface SingleLoopOptions {
  id: string;
  x: number;
  y: number;
  element: "capacitor" | "inductor" | "resistor";
  label?: string;
  current?: boolean;
  theme?: string;
}

/** One source, one element, one loop: the simplest circuit that shows an i–v relationship. */
export function singleElementLoop(o: SingleLoopOptions): RcSchematic {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const cur = o.current === true;
  const w = (id: string, points: Point[]) => wire({ id, points, current: cur, color: cur ? theme.palette.accent : ink });
  const make = o.element === "capacitor" ? capacitor : o.element === "inductor" ? inductor : resistor;
  const RIGHT_X = 200;
  const children: Node[] = [];
  const src = vertical(acSource, { id: `${o.id}-src`, x: 0, y: TOP_Y + LEAD, color: ink });
  const el = vertical(make, { id: `${o.id}-el`, x: RIGHT_X, y: TOP_Y + LEAD, color: ink });
  children.push(src.node, el.node);
  children.push(w(`${o.id}-w-src-top`, [{ x: 0, y: TOP_Y }, src.a]), w(`${o.id}-w-src-bot`, [src.b, { x: 0, y: BOT_Y }]));
  children.push(
    w(`${o.id}-w-top`, [
      { x: 0, y: TOP_Y },
      { x: RIGHT_X, y: TOP_Y },
    ]),
    w(`${o.id}-w-el-top`, [{ x: RIGHT_X, y: TOP_Y }, el.a]),
  );
  children.push(
    w(`${o.id}-w-el-bot`, [el.b, { x: RIGHT_X, y: BOT_Y }]),
    w(`${o.id}-w-bot`, [
      { x: RIGHT_X, y: BOT_Y },
      { x: 0, y: BOT_Y },
    ]),
  );
  children.push(caption(`${o.id}-vin`, src.a.x - 26, (src.a.y + src.b.y) / 2, "v", "right", ink, LABEL_FONT));
  if (o.label) children.push(caption(`${o.id}-el-lbl`, RIGHT_X + 22, (el.a.y + el.b.y) / 2, o.label, "left", ink, LABEL_FONT));
  // The current arrow: which way i is taken positive, so "i leads v" has a meaning.
  children.push(caption(`${o.id}-i`, RIGHT_X / 2, TOP_Y - 16, "i →", "center", theme.palette.accent, LABEL_FONT));
  return { node: { id: o.id, type: "group", x: o.x, y: o.y, children }, bbox: { w: 240, h: 210 } };
}

export interface SeriesParallelOptions {
  id: string;
  x: number;
  y: number;
  r1Label: string;
  r2Label: string;
  r3Label: string;
  /** Lesson time the third resistor's branch appears. Omit to show it from the start. */
  branchAt?: number;
  current?: boolean;
  theme?: string;
}

/**
 * A battery, R1 in series, then R2 and R3 in parallel across the output. Drawn so KVL
 * around the left loop and KCL at the junction are both visible: the current arrives at
 * one node and leaves down two branches.
 */
export function seriesParallelLoop(o: SeriesParallelOptions): RcSchematic & { junction: Point } {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const cur = o.current === true;
  const w = (id: string, points: Point[]) => wire({ id, points, current: cur, color: cur ? theme.palette.accent : ink });
  const J = { x: JUNCTION_X, y: TOP_Y };
  const R3_X = 300;
  const children: Node[] = [];
  const bat = vertical(battery, { id: `${o.id}-bat`, x: 0, y: TOP_Y + LEAD, color: ink });
  children.push(bat.node, w(`${o.id}-w-bat-top`, [{ x: 0, y: TOP_Y }, bat.a]), w(`${o.id}-w-bat-bot`, [bat.b, { x: 0, y: BOT_Y }]));
  const r1 = resistor({ id: `${o.id}-r1`, x: SERIES_X, y: TOP_Y, size: EL, color: ink, label: o.r1Label });
  children.push(r1.node, w(`${o.id}-w-top-1`, [{ x: 0, y: TOP_Y }, r1.a]), w(`${o.id}-w-top-2`, [r1.b, J]));
  const r2 = vertical(resistor, { id: `${o.id}-r2`, x: JUNCTION_X, y: TOP_Y + LEAD, color: ink });
  children.push(r2.node, w(`${o.id}-w-r2-top`, [J, r2.a]), w(`${o.id}-w-r2-bot`, [r2.b, { x: JUNCTION_X, y: BOT_Y }]));
  children.push(caption(`${o.id}-r2-lbl`, JUNCTION_X - 22, (r2.a.y + r2.b.y) / 2, o.r2Label, "right", ink, LABEL_FONT));
  children.push(
    w(`${o.id}-w-bot-1`, [
      { x: 0, y: BOT_Y },
      { x: JUNCTION_X, y: BOT_Y },
    ]),
  );
  children.push(dot(`${o.id}-j`, J, theme.palette.accent));

  const r3 = vertical(resistor, { id: `${o.id}-r3`, x: R3_X, y: TOP_Y + LEAD, color: ink });
  const branch: Node = {
    id: `${o.id}-branch`,
    type: "group",
    x: 0,
    y: 0,
    ...(o.branchAt !== undefined
      ? {
          tracks: [
            {
              property: "opacity",
              keyframes: [
                { t: o.branchAt, value: 0 },
                { t: o.branchAt + 0.5, value: 1 },
              ],
            },
          ],
        }
      : {}),
    children: [
      w(`${o.id}-w-top-3`, [J, { x: R3_X, y: TOP_Y }]),
      w(`${o.id}-w-r3-top`, [{ x: R3_X, y: TOP_Y }, r3.a]),
      r3.node,
      w(`${o.id}-w-r3-bot`, [r3.b, { x: R3_X, y: BOT_Y }]),
      w(`${o.id}-w-bot-2`, [
        { x: JUNCTION_X, y: BOT_Y },
        { x: R3_X, y: BOT_Y },
      ]),
      caption(`${o.id}-r3-lbl`, R3_X + 22, (r3.a.y + r3.b.y) / 2, o.r3Label, "left", ink, LABEL_FONT),
    ],
  };
  children.push(branch);
  return { node: { id: o.id, type: "group", x: o.x, y: o.y, children }, bbox: { w: 360, h: 210 }, junction: J };
}
