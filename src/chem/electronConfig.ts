/**
 * Electron configuration — computes an element's ground-state filling (Aufbau order) and renders it as
 * orbital boxes with up/down spin arrows (Hund's rule + Pauli), plus the spectroscopic notation. Pure
 * + deterministic + golden-safe.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme } from "../theme/themes.js";

// Aufbau fill order: [subshell, capacity].
const ORDER: [string, number][] = [
  ["1s", 2],
  ["2s", 2],
  ["2p", 6],
  ["3s", 2],
  ["3p", 6],
  ["4s", 2],
  ["3d", 10],
  ["4p", 6],
  ["5s", 2],
  ["4d", 10],
  ["5p", 6],
  ["6s", 2],
  ["4f", 14],
  ["5d", 10],
  ["6p", 6],
  ["7s", 2],
  ["5f", 14],
  ["6d", 10],
  ["7p", 6],
];

export interface SubshellFill {
  sub: string;
  electrons: number;
}

/** The ground-state configuration of `z` electrons, as filled subshells (Aufbau order). */
export function electronConfiguration(z: number): SubshellFill[] {
  const out: SubshellFill[] = [];
  let rem = Math.max(0, Math.floor(z));
  for (const [sub, cap] of ORDER) {
    if (rem <= 0) break;
    const electrons = Math.min(rem, cap);
    out.push({ sub, electrons });
    rem -= electrons;
  }
  return out;
}

/** Spectroscopic notation, e.g. "1s2 2s2 2p4" for oxygen (plain digits — superscripts aren't in the pinned fonts). */
export function configNotation(z: number): string {
  return electronConfiguration(z)
    .map((s) => `${s.sub}${s.electrons}`)
    .join(" ");
}

const orbCount = (sub: string): number => (sub.endsWith("s") ? 1 : sub.endsWith("p") ? 3 : sub.endsWith("d") ? 5 : 7);

export interface ElectronConfigOptions {
  id?: string;
  x: number;
  y: number;
  z: number;
  boxSize?: number;
  /** Show the notation caption under the boxes. Default true. */
  notation?: boolean;
  theme?: string;
}

/** Orbital-box diagram: a row per subshell, each orbital a box with ↑/↓ spin arrows (Hund + Pauli). */
export function electronConfig(opts: ElectronConfigOptions): GroupNode {
  const id = opts.id ?? "econf";
  const theme = getTheme(opts.theme);
  const color = theme.palette.text;
  const box = opts.boxSize ?? 24;
  const gap = 4;
  const rowH = box + 14;
  const fills = electronConfiguration(opts.z);
  const children: Node[] = [];

  fills.forEach((f, r) => {
    const ry = opts.y + r * rowH;
    children.push({
      id: `${id}-lbl${r}`,
      type: "text",
      x: opts.x,
      y: ry + box / 2,
      text: f.sub,
      fontFamily: theme.bodyFont,
      fontWeight: 600,
      fontSize: 14,
      fill: theme.palette.muted,
      align: "left",
      baseline: "middle",
    });
    const n = orbCount(f.sub);
    for (let o = 0; o < n; o++) {
      const bx = opts.x + 36 + o * (box + gap);
      children.push({
        id: `${id}-b${r}-${o}`,
        type: "rect",
        x: bx,
        y: ry,
        width: box,
        height: box,
        radius: 3,
        fill: "transparent",
        stroke: theme.palette.muted,
        strokeWidth: 1.5,
      });
      // Hund: one ↑ in each orbital first, then pair with ↓.
      const up = f.electrons > o;
      const down = f.electrons > o + n;
      const arrows = up && down ? "↑↓" : up ? "↑" : "";
      if (arrows !== "")
        children.push({
          id: `${id}-a${r}-${o}`,
          type: "text",
          x: bx + box / 2,
          y: ry + box / 2,
          text: arrows,
          fontFamily: theme.bodyFont,
          fontWeight: 600,
          fontSize: 14,
          fill: color,
          align: "center",
          baseline: "middle",
        });
    }
  });

  if (opts.notation !== false) {
    children.push({
      id: `${id}-note`,
      type: "text",
      x: opts.x,
      y: opts.y + fills.length * rowH + 8,
      text: configNotation(opts.z),
      fontFamily: theme.monoFont ?? "JetBrains Mono",
      fontWeight: 500,
      fontSize: 14,
      fill: theme.palette.text,
      align: "left",
      baseline: "middle",
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}
