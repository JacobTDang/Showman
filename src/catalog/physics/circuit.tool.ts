import { z } from "zod";
import {
  resistor,
  battery,
  capacitor,
  lamp,
  switchSym,
  inductor,
  acSource,
  diode,
  meter,
  wire,
  type CircuitSymbol,
} from "../../physics/circuit.js";
import type { Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.circuit — a macro composing the circuit symbol builders into one closed
 * series loop: elements placed left-to-right along the top edge, wired together, with
 * the loop closed by wires down the right side, along the bottom, and up the left.
 *
 * v1 SCOPE CUT: series only. Parallel branches need a genuinely different topology
 * (a shared rail with per-branch drops) and are deferred rather than faked.
 */

const ELEMENT_SIZE = 70;
const GAP = 40;

type Kind = "resistor" | "battery" | "capacitor" | "lamp" | "switch" | "inductor" | "acSource" | "diode" | "meter";

const BUILDERS: Record<
  Exclude<Kind, "meter">,
  (opts: { id: string; x: number; y: number; size: number; label?: string }) => CircuitSymbol
> = {
  resistor,
  battery,
  capacitor,
  lamp,
  switch: switchSym,
  inductor,
  acSource,
  diode,
};

const Params = z.object({
  elements: z
    .array(
      z.object({
        kind: z.enum(["resistor", "battery", "capacitor", "lamp", "switch", "inductor", "acSource", "diode", "meter"]),
        label: z.string().optional(),
        meterSymbol: z.string().max(2).optional().describe('meter kind only, e.g. "V" or "A"'),
      }),
    )
    .min(1)
    .max(6)
    .describe("placed left-to-right around a closed series loop"),
  theme: z.string().optional(),
});
type CircuitParams = z.infer<typeof Params>;

export const circuitTool: BuilderTool<CircuitParams> = {
  name: "physics.circuit",
  domain: "physics",
  level: "node",
  description: "a series circuit loop: resistors/battery/switch/etc. wired left-to-right around a closed rectangle",
  keywords: [
    "circuit",
    "series circuit",
    "resistor",
    "battery",
    "switch",
    "capacitor",
    "diode",
    "wire",
    "electricity",
    "voltage",
    "current",
  ],
  params: Params,
  example: { elements: [{ kind: "battery", label: "9V" }, { kind: "resistor", label: "R1" }, { kind: "lamp" }] },
  build(p) {
    const n = p.elements.length;
    const totalWidth = n * ELEMENT_SIZE + (n - 1) * GAP;
    const loopHeight = 140;
    const topY = 20;

    const children: Node[] = [];
    let curX = 0;
    let prevB: { x: number; y: number } | null = null;

    p.elements.forEach((el, i) => {
      const id = `circuit-${i}`;
      const sym: CircuitSymbol =
        el.kind === "meter"
          ? meter({ id, x: curX, y: topY, size: ELEMENT_SIZE, ...(el.label ? { label: el.label } : {}), symbol: el.meterSymbol ?? "V" })
          : BUILDERS[el.kind]({ id, x: curX, y: topY, size: ELEMENT_SIZE, ...(el.label ? { label: el.label } : {}) });
      children.push(sym.node);
      if (prevB) children.push(wire({ id: `wire-${i}`, points: [prevB, sym.a] }));
      prevB = sym.b;
      curX += ELEMENT_SIZE + GAP;
    });

    const lastB = prevB as { x: number; y: number } | null;
    const firstA = { x: 0, y: topY };
    if (lastB) {
      const bottomY = topY + loopHeight;
      children.push(
        wire({ id: "wire-close-1", points: [lastB, { x: totalWidth, y: bottomY }] }),
        wire({
          id: "wire-close-2",
          points: [
            { x: totalWidth, y: bottomY },
            { x: 0, y: bottomY },
          ],
        }),
        wire({ id: "wire-close-3", points: [{ x: 0, y: bottomY }, firstA] }),
      );
    }

    return {
      node: { id: "circuit", type: "group", x: 0, y: 0, children },
      bbox: { w: totalWidth, h: topY + loopHeight + 20 },
    };
  },
};
