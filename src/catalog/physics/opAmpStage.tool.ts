import { z } from "zod";
import { capacitor, ground, opAmp, resistor, wire, type CircuitSymbol, type Point, type SymbolOptions } from "../../physics/circuit.js";
import type { Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.opAmpStage — an inverting op-amp stage: an input impedance on the input rail, a
 * feedback impedance on a rail running over the top of the amplifier from the inverting node
 * back to the output, and the non-inverting input tied to ground.
 *
 * The feedback path is the point. An integrator is a stage whose feedback element is a
 * capacitor; the same capacitor drawn in series on the input is a high-pass filter instead.
 * This builder has no way to put the feedback element on the input rail, so the drawing and
 * the lesson cannot disagree.
 *
 * One builder covers the family: (R, R) is the inverting amplifier, (R, C) the integrator,
 * (C, R) the differentiator.
 */

const EL = 70;
const OP_SIZE = 90;
const OP_X = 240;
const OP_Y = 60;
const FEEDBACK_Y = 20;
const ZIN_X = 40;
const INK = "#1e293b";

const ELEMENTS: Record<"resistor" | "capacitor", (o: SymbolOptions) => CircuitSymbol> = { resistor, capacitor };

const Params = z.object({
  inputKind: z.enum(["resistor", "capacitor"]).default("resistor"),
  feedbackKind: z.enum(["resistor", "capacitor"]).default("capacitor"),
  inputLabel: z.string().optional(),
  feedbackLabel: z.string().optional(),
  inputTerminalLabel: z.string().default("Vin"),
  outputTerminalLabel: z.string().default("Vout"),
  theme: z.string().optional(),
});
type OpAmpStageParams = z.infer<typeof Params>;

function dot(id: string, p: Point): Node {
  return { id, type: "ellipse", x: p.x, y: p.y, width: 9, height: 9, fill: INK };
}

function caption(id: string, x: number, y: number, text: string, align: "left" | "center" | "right"): Node {
  return { id, type: "text", x, y, text, fontFamily: "Inter", fontWeight: 600, fontSize: 15, fill: INK, align, baseline: "middle" };
}

export const opAmpStageTool: BuilderTool<OpAmpStageParams> = {
  name: "physics.opAmpStage",
  domain: "physics",
  level: "node",
  description: "an inverting op-amp stage with the feedback element in the feedback path — inverting amp, integrator, or differentiator",
  keywords: [
    "op-amp",
    "opamp",
    "operational amplifier",
    "inverting amplifier",
    "integrator",
    "differentiator",
    "feedback",
    "virtual ground",
    "gain",
  ],
  params: Params,
  example: {
    inputKind: "resistor",
    feedbackKind: "capacitor",
    inputLabel: "R = 10 kΩ",
    feedbackLabel: "C = 100 nF",
    inputTerminalLabel: "Vin",
    outputTerminalLabel: "Vout",
  },
  build(p) {
    const children: Node[] = [];
    const amp = opAmp({ id: "oa-amp", x: OP_X, y: OP_Y, size: OP_SIZE, color: INK });
    children.push(amp.node);

    // The input rail sits at whatever height the symbol reports for its inverting input.
    const inY = amp.inMinus.y;
    const vin: Point = { x: 0, y: inY };

    const zin = ELEMENTS[p.inputKind]({
      id: "oa-zin",
      x: ZIN_X,
      y: inY,
      size: EL,
      color: INK,
      ...(p.inputLabel ? { label: p.inputLabel } : {}),
    });
    children.push(zin.node);
    children.push(wire({ id: "oa-w-in", points: [vin, zin.a] }));

    // The inverting node is an explicit junction: three conductors share this endpoint, so
    // none of them is left stranded.
    const invertingNode: Point = { x: (zin.b.x + amp.inMinus.x) / 2, y: inY };
    children.push(wire({ id: "oa-w-zin-node", points: [zin.b, invertingNode] }));
    children.push(wire({ id: "oa-w-node-in", points: [invertingNode, amp.inMinus] }));

    // Feedback: up from the inverting node, across through Zf, and back down to the output.
    const fbLeft: Point = { x: invertingNode.x, y: FEEDBACK_Y };
    const zf = ELEMENTS[p.feedbackKind]({
      id: "oa-zf",
      x: invertingNode.x + 40,
      y: FEEDBACK_Y,
      size: EL,
      color: INK,
      ...(p.feedbackLabel ? { label: p.feedbackLabel } : {}),
    });
    const outputNode: Point = { x: amp.out.x + 30, y: amp.out.y };
    const fbRight: Point = { x: outputNode.x, y: FEEDBACK_Y };
    children.push(zf.node);
    children.push(wire({ id: "oa-w-fb-up", points: [invertingNode, fbLeft] }));
    children.push(wire({ id: "oa-w-fb-1", points: [fbLeft, zf.a] }));
    children.push(wire({ id: "oa-w-fb-2", points: [zf.b, fbRight] }));
    children.push(wire({ id: "oa-w-fb-down", points: [fbRight, outputNode] }));

    // Output node: the amplifier's output, the feedback drop and the Vout lead all meet here.
    const vout: Point = { x: outputNode.x + 60, y: amp.out.y };
    children.push(wire({ id: "oa-w-out", points: [amp.out, outputNode] }));
    children.push(wire({ id: "oa-w-vout", points: [outputNode, vout] }));

    // Non-inverting input to ground.
    const gndTop: Point = { x: amp.inPlus.x, y: amp.inPlus.y + 50 };
    children.push(wire({ id: "oa-w-gnd", points: [amp.inPlus, gndTop] }));
    children.push(ground({ id: "oa-gnd", x: gndTop.x, y: gndTop.y, size: 40, color: INK }).node);

    children.push(dot("oa-dot-in", vin), dot("oa-dot-out", vout));
    children.push(caption("oa-lbl-in", vin.x, vin.y - 20, p.inputTerminalLabel, "left"));
    children.push(caption("oa-lbl-out", vout.x, vout.y - 20, p.outputTerminalLabel, "right"));

    return { node: { id: "opamp-stage", type: "group", x: 0, y: 0, children }, bbox: { w: vout.x + 20, h: gndTop.y + 40 } };
  },
};
