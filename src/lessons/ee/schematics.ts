/**
 * The schematics the EE 230 lessons draw. Each composes the circuit symbol primitives and
 * wires only to the terminals they report, so connectivity holds by construction — the
 * same discipline as the catalog's physics builders.
 */
import { acSource, capacitor, resistor, wire, type CircuitSymbol, type Point, type SymbolOptions } from "../../physics/circuit.js";
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
