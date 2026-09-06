/**
 * What a real op-amp needs drawn that an ideal one does not: the two supply pins.
 *
 * Tier 2 draws the stages, and they are the contract — this file composes them rather than
 * copying them. A stage hands back `opAmp: { x, y, size }` in scene space, which is all the
 * geometry a supply pin needs: the body is a triangle from (x, y) to (x, y + size) to
 * (x + size, y + size/2), so a pin dropped at a given fraction along it meets the sloped
 * edge exactly, and a wire that starts on a component body is connected by construction.
 *
 * The pins are stubs rather than full rails because the feedback network runs across the
 * top of every stage: a rail carried all the way up would cross it, and a crossing without
 * a dot is the one piece of drafting a beginner reliably misreads. Each stub ends in a
 * terminal dot, which is the convention the connectivity gate already understands for a
 * node that goes somewhere off the drawing.
 */
import { wire, type Point } from "../../physics/circuit.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT } from "./kit.js";
import type { OpAmpStage } from "./opAmpSchematics.js";
import type { GroupNode, Node, Track } from "../../spec/types.js";

export interface SupplyRailOptions {
  id: string;
  /** The stage to decorate. Only its `opAmp` box is read. */
  stage: OpAmpStage;
  /** Positive supply, volts. Default +15. */
  vPos?: number;
  /** Negative supply, volts. Default −15. */
  vNeg?: number;
  /** Fraction along the body, 0 at the left edge and 1 at the apex. Default 0.5. */
  where?: number;
  /** px each pin runs clear of the body. */
  stub?: number;
  /** Lesson time at which the pins fade in. Omit and they are there from the start. */
  revealAt?: number;
  theme?: string;
}

export interface SupplyRails {
  node: GroupNode;
  /** The two supply terminals, in scene space. */
  points: { pos: Point; neg: Point };
}

function terminal(id: string, p: Point, fill: string): Node {
  return { id, type: "ellipse", x: p.x - 4.5, y: p.y - 4.5, width: 9, height: 9, fill };
}

/**
 * The ±V supply pins on an op-amp body, with their voltages named.
 *
 * Returned as a sibling group in scene space, so the stage it decorates is untouched and
 * the two can be revealed on different beats.
 */
export function supplyRails(o: SupplyRailOptions): SupplyRails {
  const theme = getTheme(o.theme);
  const ink = theme.palette.secondary;
  const vPos = o.vPos ?? 15;
  const vNeg = o.vNeg ?? -15;
  const stub = o.stub ?? 34;
  const f = o.where ?? 0.5;
  const { x, y, size } = o.stage.opAmp;

  // The sloped edges: the upper runs to the apex at y + size/2, the lower comes back up to it.
  const px = x + f * size;
  const topEdge: Point = { x: px, y: y + (f * size) / 2 };
  const botEdge: Point = { x: px, y: y + size - (f * size) / 2 };
  const pos: Point = { x: px, y: topEdge.y - stub };
  const neg: Point = { x: px, y: botEdge.y + stub };

  const label = (id: string, p: Point, text: string): Node => ({
    id,
    type: "text",
    x: p.x + 12,
    y: p.y,
    text,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 15,
    fill: ink,
    align: "left",
    baseline: "middle",
  });

  const children: Node[] = [
    wire({ id: `${o.id}-w-pos`, points: [topEdge, pos], color: ink }),
    wire({ id: `${o.id}-w-neg`, points: [botEdge, neg], color: ink }),
    terminal(`${o.id}-t-pos`, pos, ink),
    terminal(`${o.id}-t-neg`, neg, ink),
    label(`${o.id}-lbl-pos`, pos, `+${vPos} V`),
    label(`${o.id}-lbl-neg`, neg, `${vNeg < 0 ? "−" : "+"}${Math.abs(vNeg)} V`),
  ];

  const tracks: Track[] =
    o.revealAt === undefined
      ? []
      : [
          {
            property: "opacity",
            keyframes: [
              { t: o.revealAt, value: 0 },
              { t: o.revealAt + 0.5, value: 1 },
            ],
          },
        ];

  return {
    node: { id: o.id, type: "group", x: 0, y: 0, children, ...(tracks.length > 0 ? { tracks } : {}) },
    points: { pos, neg },
  };
}
