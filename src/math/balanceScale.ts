/**
 * Balance scale — a composite builder for equations and comparisons (< = >).
 *
 * A triangular fulcrum sits at bottom-center; a horizontal beam balances on the
 * fulcrum's apex and TILTS toward the heavier side (rotated about its center
 * pivot). Two pans hang from the beam ends, each labelled with its weight. Equal
 * weights leave the beam level (0°); the tilt is clamped to ±12°.
 *
 * Like every math builder this is a PURE function of its options (same opts ->
 * identical spec) and returns a single themeable `GroupNode` to drop into a scene.
 */

import type { Node, GroupNode } from "../spec/types.js";
import { getTheme, idGen, clamp, finiteNum, posSize } from "./shared.js";
import { fillRamp, elevation, type Depth } from "../theme/depth.js";

export interface BalanceScaleOptions {
  /** Weight on the left pan — drives the tilt. */
  left: number;
  /** Weight on the right pan. */
  right: number;
  /** Top-left placement of the whole scale. */
  x?: number;
  y?: number;
  /** Overall pixel width (the beam span). Default 320. */
  width?: number;
  /** Theme name (palette + fonts). Default theme when omitted. */
  theme?: string;
  /** Optional caption under the left pan (e.g. "apples"). */
  leftLabel?: string;
  /** Optional caption under the right pan. */
  rightLabel?: string;
  /** Id prefix; every child id is namespaced from it. Default "balance". */
  id?: string;
  /** Dimensionality of the beam/pans/fulcrum (gradient + crisp lift). Default "soft"; "flat" = solid. */
  depth?: Depth;
}

/** Maximum tilt of the beam, in degrees, in either direction. */
const MAX_TILT = 12;

/**
 * A balance scale: fulcrum (triangle) + tilting beam + two hanging pans, each
 * showing its weight. The beam group rotates about its center pivot so the
 * heavier side sinks; equal weights keep it level.
 */
export function buildBalanceScale(opts: BalanceScaleOptions): GroupNode {
  const theme = getTheme(opts.theme);
  const prefix = opts.id ?? "balance";
  const nid = idGen(prefix);
  const w = posSize(opts.width, 320);
  const cx = w / 2;

  // Sanitize the weights: non-finite inputs (NaN/Infinity) would poison the tilt
  // (clamp does NOT catch NaN) and the pan counters. Finite weights pass through
  // unchanged, so valid inputs render identically.
  const left = finiteNum(opts.left, 0);
  const right = finiteNum(opts.right, 0);

  // ── Vertical layout (local coords; the group origin is top-left) ──
  const pivotY = 44; // beam center line == rotation pivot
  const beamH = 16; // beam thickness
  const panW = Math.min(96, w * 0.28); // pan tray width
  const panH = 26; // pan tray height
  const armHalf = cx - panW / 2 - 6; // pivot -> pan hang point
  const beamHalf = armHalf + 12; // beam reaches a touch past the hang points
  const hangLen = 64; // string length from beam to pan
  const panTopY = pivotY + hangLen;
  const panMidY = panTopY + panH / 2;
  const leftX = cx - armHalf;
  const rightX = cx + armHalf;

  // ── Tilt: the heavier side sinks. In canvas space (y grows downward) a
  // positive rotation drops the RIGHT side, so map (right - left) -> rotation,
  // normalize by the total weight, and clamp to ±MAX_TILT. Equal weights => 0°. ──
  const total = Math.abs(left) + Math.abs(right);
  const ratio = total === 0 ? 0 : (right - left) / total;
  const tilt = clamp(ratio * MAX_TILT, -MAX_TILT, MAX_TILT);
  const depth = opts.depth ?? "soft";

  /** One hanging pan: a string, the tray, the weight counter, and an optional caption. */
  const pan = (centerX: number, value: number, label?: string): Node[] => {
    const items: Node[] = [
      // string from the beam down to the pan
      {
        id: nid(),
        type: "polyline",
        points: [
          { x: centerX, y: pivotY },
          { x: centerX, y: panTopY },
        ],
        stroke: theme.palette.text,
        strokeWidth: 2,
        lineCap: "round",
      },
      // the pan tray
      {
        id: nid(),
        type: "rect",
        x: centerX - panW / 2,
        y: panTopY,
        width: panW,
        height: panH,
        radius: panH / 2,
        fill: theme.palette.accent,
        ...(fillRamp(theme.palette.accent, panH, depth) ? { gradient: fillRamp(theme.palette.accent, panH, depth)! } : {}),
        ...(elevation(depth) ? { shadow: elevation(depth)! } : {}),
        stroke: theme.palette.text,
        strokeWidth: 2,
      },
      // the weight, as a count-up-ready counter
      {
        id: nid(),
        type: "counter",
        x: centerX,
        y: panMidY,
        value,
        decimals: Number.isInteger(value) ? 0 : 1,
        fontSize: 22,
        fontFamily: theme.headingFont,
        fontWeight: theme.headingWeight,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
      },
    ];
    if (label !== undefined) {
      items.push({
        id: nid(),
        type: "text",
        x: centerX,
        y: panTopY + panH + 14,
        text: label,
        fontSize: 15,
        fontFamily: theme.bodyFont,
        fontWeight: theme.bodyWeight,
        fill: theme.palette.muted,
        align: "center",
        baseline: "middle",
      });
    }
    return items;
  };

  // ── The beam subtree: rotates as one rigid arm about the center pivot. ──
  const beamGroup: GroupNode = {
    id: nid(),
    type: "group",
    x: 0,
    y: 0,
    rotation: tilt,
    anchor: { x: cx, y: pivotY }, // pivot at the beam's center, atop the fulcrum
    children: [
      {
        id: nid(),
        type: "rect",
        x: cx - beamHalf,
        y: pivotY - beamH / 2,
        width: beamHalf * 2,
        height: beamH,
        radius: beamH / 2,
        fill: theme.palette.primary,
        ...(fillRamp(theme.palette.primary, beamH, depth) ? { gradient: fillRamp(theme.palette.primary, beamH, depth)! } : {}),
        stroke: theme.palette.text,
        strokeWidth: 2,
      },
      ...pan(leftX, left, opts.leftLabel),
      ...pan(rightX, right, opts.rightLabel),
    ],
  };

  // ── Static stand: the triangular fulcrum (points up to the pivot) + a base. ──
  const fulcrumR = Math.max(40, w * 0.16);
  const apexY = pivotY + 4; // apex tucked just under the beam
  const baseY = apexY + fulcrumR * 1.5; // a sides-3 polygon is 1.5*radius tall
  const groundW = fulcrumR * 2.1;

  const fulcrumGrad = fillRamp(theme.palette.secondary, fulcrumR * 1.5, depth);
  const fulcrum: Node = {
    id: nid(),
    type: "polygon",
    x: cx - fulcrumR, // center sits at (cx, apexY + fulcrumR); apex at (cx, apexY)
    y: apexY,
    sides: 3,
    radius: fulcrumR,
    fill: theme.palette.secondary,
    ...(fulcrumGrad ? { gradient: fulcrumGrad } : {}),
    stroke: theme.palette.text,
    strokeWidth: 2,
  };
  const ground: Node = {
    id: nid(),
    type: "rect",
    x: cx - groundW / 2,
    y: baseY - 4,
    width: groundW,
    height: 12,
    radius: 6,
    fill: theme.palette.muted,
  };

  // Draw order: stand behind, then the beam + pans on top.
  return {
    id: prefix,
    type: "group",
    x: finiteNum(opts.x, 0),
    y: finiteNum(opts.y, 0),
    children: [ground, fulcrum, beamGroup],
  };
}
