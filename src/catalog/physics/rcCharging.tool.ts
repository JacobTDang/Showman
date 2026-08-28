import { z } from "zod";
import { battery, capacitor, resistor, switchSym, wire } from "../../physics/circuit.js";
import { texToNodes } from "../../math/tex.js";
import type { Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

const Params = z.object({
  resistanceOhms: z.number().positive().default(1000),
  capacitanceFarads: z.number().positive().default(0.001),
  sourceVolts: z.number().positive().default(5),
  switchTimeSec: z.number().min(0).default(1),
  animationDurationSec: z.number().positive().max(30).default(6),
});
type Params = z.infer<typeof Params>;

export function rcValues(p: Pick<Params, "resistanceOhms" | "capacitanceFarads" | "sourceVolts">, t: number) {
  const tau = p.resistanceOhms * p.capacitanceFarads;
  return {
    tau,
    voltage: p.sourceVolts * (1 - Math.exp(-t / tau)),
    current: (p.sourceVolts / p.resistanceOhms) * Math.exp(-t / tau),
  };
}

export const rcChargingTool: BuilderTool<Params> = {
  name: "physics.rcCharging",
  domain: "physics",
  level: "node",
  description:
    "animated RC charging lesson linking switch closure, decreasing current, capacitor voltage, exponential graph, equation, and 63.2% time constant",
  keywords: ["rc circuit", "rc charging", "capacitor charging", "time constant", "exponential charging", "charging curve"],
  params: Params,
  example: { resistanceOhms: 1000, capacitanceFarads: 0.001, sourceVolts: 5, switchTimeSec: 1, animationDurationSec: 6 },
  build(p) {
    const ink = "#16324f";
    const accent = "#e76f51";
    const blue = "#277da1";
    const tau = p.resistanceOhms * p.capacitanceFarads;
    const end = p.switchTimeSec + p.animationDurationSec;
    const bat = battery({ id: "rc-battery", x: 0, y: 70, label: `${p.sourceVolts} V`, color: ink });
    const sw = switchSym({ id: "rc-switch", x: 105, y: 70, label: "closes at t = 0", color: ink });
    const blade = sw.node.children.find((node) => node.id === "rc-switch-blade");
    if (blade) {
      blade.anchor = sw.a;
      blade.tracks = [
        {
          property: "rotation",
          keyframes: [
            { t: p.switchTimeSec, value: 0 },
            { t: p.switchTimeSec + 0.25, value: 22, easing: "easeOutCubic" },
          ],
        },
      ];
    }
    const res = resistor({ id: "rc-resistor", x: 210, y: 70, label: `${p.resistanceOhms} Ω`, color: ink });
    const cap = capacitor({ id: "rc-capacitor", x: 325, y: 70, label: `${p.capacitanceFarads} F`, color: ink });
    const graphX = 470;
    const graphY = 45;
    const graphW = 270;
    const graphH = 170;
    const curve: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 48; i++) {
      const t = (5 * tau * i) / 48;
      curve.push({ x: graphX + (graphW * i) / 48, y: graphY + graphH * (1 - rcValues(p, t).voltage / p.sourceVolts) });
    }
    const equation = texToNodes({
      id: "rc-eq",
      latex: "v_C(t)=V_s\\left(1-e^{-t/(RC)}\\right)",
      x: 470,
      y: 245,
      size: 23,
      color: ink,
    });
    const children: Node[] = [
      {
        id: "rc-title",
        type: "text",
        text: "RC charging: cause → change → equation",
        x: 0,
        y: 0,
        fontFamily: "Inter",
        fontWeight: 700,
        fontSize: 24,
        fill: ink,
      },
      bat.node,
      sw.node,
      res.node,
      cap.node,
      wire({ id: "rc-wire-1", points: [bat.b, sw.a], current: true, color: accent }),
      wire({ id: "rc-wire-2", points: [sw.b, res.a], current: true, color: accent }),
      wire({ id: "rc-wire-3", points: [res.b, cap.a], current: true, color: accent }),
      wire({ id: "rc-return", points: [cap.b, { x: 420, y: 150 }, { x: 0, y: 150 }, bat.a], current: true, color: accent }),
      {
        id: "rc-current",
        type: "text",
        text: "current i(t): starts high, then decreases",
        x: 105,
        y: 115,
        fontFamily: "Inter",
        fontSize: 15,
        fill: accent,
        opacity: 0,
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: p.switchTimeSec, value: 0 },
              { t: p.switchTimeSec + 0.35, value: 1 },
              { t: end, value: 0.45 },
            ],
          },
        ],
      },
      {
        id: "rc-vc",
        type: "text",
        text: "capacitor voltage v_C(t): increases",
        x: 105,
        y: 140,
        fontFamily: "Inter",
        fontSize: 15,
        fill: blue,
        opacity: 0,
        tracks: [
          {
            property: "opacity",
            keyframes: [
              { t: p.switchTimeSec, value: 0 },
              { t: p.switchTimeSec + tau, value: 1 },
            ],
          },
        ],
      },
      {
        id: "rc-x-axis",
        type: "polyline",
        points: [
          { x: graphX, y: graphY + graphH },
          { x: graphX + graphW, y: graphY + graphH },
        ],
        stroke: ink,
        strokeWidth: 2,
      },
      {
        id: "rc-y-axis",
        type: "polyline",
        points: [
          { x: graphX, y: graphY + graphH },
          { x: graphX, y: graphY },
        ],
        stroke: ink,
        strokeWidth: 2,
      },
      {
        id: "rc-curve",
        type: "polyline",
        points: curve,
        stroke: blue,
        strokeWidth: 4,
        progress: 0,
        tracks: [
          {
            property: "progress",
            keyframes: [
              { t: p.switchTimeSec, value: 0 },
              { t: end, value: 1, easing: "easeOutExpo" },
            ],
          },
        ],
      },
      {
        id: "rc-tau-line",
        type: "polyline",
        points: [
          { x: graphX + graphW / 5, y: graphY + graphH },
          { x: graphX + graphW / 5, y: graphY + graphH * 0.368 },
        ],
        stroke: accent,
        strokeWidth: 2,
        dash: [5, 4],
      },
      {
        id: "rc-tau-label",
        type: "text",
        text: `τ = RC = ${tau.toPrecision(3)} s`,
        x: graphX + graphW / 5,
        y: graphY + graphH + 9,
        fontFamily: "Inter",
        fontSize: 15,
        align: "center",
        fill: ink,
      },
      {
        id: "rc-632",
        type: "text",
        text: `v_C(τ) = 63.2% of ${p.sourceVolts} V`,
        x: graphX + graphW / 5 + 8,
        y: graphY + graphH * 0.368 - 18,
        fontFamily: "Inter",
        fontSize: 14,
        fill: accent,
      },
      equation.node,
      {
        id: "rc-explain",
        type: "text",
        text: "At one time constant, the gap to the final voltage has shrunk to e⁻¹ = 36.8%.",
        x: 0,
        y: 255,
        maxWidth: 430,
        fontFamily: "Inter",
        fontSize: 17,
        fill: ink,
      },
    ];
    return { node: { id: "rc-charging", type: "group", children }, bbox: { w: 760, h: 310 } };
  },
};
