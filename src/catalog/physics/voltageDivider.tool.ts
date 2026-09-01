import { z } from "zod";
import { acSource, battery, resistor, wire, type CircuitSymbol, type Point, type SymbolOptions } from "../../physics/circuit.js";
import type { Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.voltageDivider — a source, R1 in series along the top rail, and R2 as a SHUNT
 * branch from the junction down to the return rail, with the output taken across A–B.
 *
 * The topology is the point. `V_out = V · R2 / (R1 + R2)` only describes a circuit where R2
 * sits across the output; drawn in series it describes a different circuit entirely. This
 * builder cannot draw the series arrangement, so the schematic and the algebra cannot
 * disagree.
 */

const EL = 70;
const TOP_Y = 30;
const BOT_Y = 190;
/** Centres a vertical element in the rail gap. */
const LEAD = (BOT_Y - TOP_Y - EL) / 2;
const R1_X = 60;
const JUNCTION_X = 200;
const OUT_X = 280;
const INK = "#1e293b";

const Params = z.object({
  sourceKind: z.enum(["battery", "acSource"]).default("battery"),
  sourceLabel: z.string().optional(),
  r1Label: z.string().optional(),
  r2Label: z.string().optional(),
  outputLabels: z.tuple([z.string(), z.string()]).default(["A", "B"]),
  theme: z.string().optional(),
});
type DividerParams = z.infer<typeof Params>;

/**
 * Stand a horizontal symbol upright. Every symbol in circuit.ts runs left-to-right with
 * terminal `a` at (x, y) and `b` at (x + size, y); rotating the group 90° about `a` maps the
 * offset (size, 0) to (0, size), so `b` lands directly below `a`. The symbol is built WITHOUT
 * its label — a rotated label would read sideways — and the caller places an upright one
 * beside it.
 */
function vertical(
  make: (o: SymbolOptions) => CircuitSymbol,
  opts: { id: string; x: number; y: number; size: number; color: string },
): { node: Node; a: Point; b: Point } {
  const sym = make({ id: opts.id, x: opts.x, y: opts.y, size: opts.size, color: opts.color });
  return {
    node: {
      id: `${opts.id}-v`,
      type: "group",
      x: 0,
      y: 0,
      rotation: 90,
      anchor: { x: opts.x, y: opts.y },
      children: [sym.node],
    },
    a: { x: opts.x, y: opts.y },
    b: { x: opts.x, y: opts.y + opts.size },
  };
}

function dot(id: string, p: Point): Node {
  return { id, type: "ellipse", x: p.x, y: p.y, width: 9, height: 9, fill: INK };
}

function caption(id: string, x: number, y: number, text: string, align: "left" | "center" | "right"): Node {
  return { id, type: "text", x, y, text, fontFamily: "Inter", fontWeight: 600, fontSize: 15, fill: INK, align, baseline: "middle" };
}

export const voltageDividerTool: BuilderTool<DividerParams> = {
  name: "physics.voltageDivider",
  domain: "physics",
  level: "node",
  description: "a two-resistor voltage divider: R1 in series, R2 shunt across the A–B output — the Thevenin source topology",
  keywords: [
    "voltage divider",
    "divider",
    "thevenin",
    "thevenin equivalent",
    "equivalent resistance",
    "open circuit voltage",
    "potential divider",
    "series parallel",
  ],
  params: Params,
  example: { sourceKind: "battery", sourceLabel: "12 V", r1Label: "R1 = 4 kΩ", r2Label: "R2 = 2 kΩ", outputLabels: ["A", "B"] },
  build(p) {
    const children: Node[] = [];
    const topLeft: Point = { x: 0, y: TOP_Y };
    const botLeft: Point = { x: 0, y: BOT_Y };
    const junction: Point = { x: JUNCTION_X, y: TOP_Y };
    const botJunction: Point = { x: JUNCTION_X, y: BOT_Y };
    const outA: Point = { x: OUT_X, y: TOP_Y };
    const outB: Point = { x: OUT_X, y: BOT_Y };

    // Source, standing upright on the left rail.
    const src = vertical(p.sourceKind === "acSource" ? acSource : battery, {
      id: "vd-source",
      x: 0,
      y: TOP_Y + LEAD,
      size: EL,
      color: INK,
    });
    children.push(src.node);
    children.push(wire({ id: "vd-w-src-top", points: [topLeft, src.a] }));
    children.push(wire({ id: "vd-w-src-bot", points: [src.b, botLeft] }));
    if (p.sourceLabel?.trim()) children.push(caption("vd-source-lbl", src.a.x - 14, (src.a.y + src.b.y) / 2, p.sourceLabel, "right"));

    // R1 in series along the top rail.
    const r1 = resistor({ id: "vd-r1", x: R1_X, y: TOP_Y, size: EL, color: INK, ...(p.r1Label ? { label: p.r1Label } : {}) });
    children.push(r1.node);
    children.push(wire({ id: "vd-w-top-1", points: [topLeft, r1.a] }));
    children.push(wire({ id: "vd-w-top-2", points: [r1.b, junction] }));

    // R2 as a shunt branch from the junction down to the return rail.
    const r2 = vertical(resistor, { id: "vd-r2", x: JUNCTION_X, y: TOP_Y + LEAD, size: EL, color: INK });
    children.push(r2.node);
    children.push(wire({ id: "vd-w-shunt-top", points: [junction, r2.a] }));
    children.push(wire({ id: "vd-w-shunt-bot", points: [r2.b, botJunction] }));
    if (p.r2Label?.trim()) children.push(caption("vd-r2-lbl", JUNCTION_X + 22, (r2.a.y + r2.b.y) / 2, p.r2Label, "left"));

    // The top rail continues past the junction to A: R2 taps the rail, it does not interrupt it.
    children.push(wire({ id: "vd-w-out-a", points: [junction, outA] }));
    children.push(wire({ id: "vd-w-bot-1", points: [botLeft, botJunction] }));
    children.push(wire({ id: "vd-w-out-b", points: [botJunction, outB] }));

    children.push(dot("vd-dot-a", outA), dot("vd-dot-b", outB));
    children.push(caption("vd-lbl-a", outA.x, outA.y - 20, p.outputLabels[0], "center"));
    children.push(caption("vd-lbl-b", outB.x, outB.y + 20, p.outputLabels[1], "center"));

    return { node: { id: "voltage-divider", type: "group", x: 0, y: 0, children }, bbox: { w: 300, h: 210 } };
  },
};
