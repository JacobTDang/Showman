/**
 * Accessibility audit — a pure, deterministic static analysis of a Scene Spec for the two issues
 * that matter most for learning video: photosensitive-seizure flash risk (WCAG 2.3.1, the
 * "three flashes in any one second" rule) and text/background contrast (WCAG 1.4.3). No rendering;
 * it reads the spec + its animation tracks. The basis for a VPAT/conformance report.
 *
 * Scope (documented limitations): flash detection uses an opacity/fill-luminance proxy over keyframe
 * values — it does not model brightness changes from `scale`/`blur`/position, nor the overshoot of a
 * single-segment oscillating ease (elastic/bounce/spring). Contrast is measured against the scene
 * background, not layered cards. These are conservative gaps, not false passes for the common cases.
 */

import type { SceneSpec, Node, Backdrop, Color } from "../spec/types.js";
import { parseColor, relativeLuminance, contrastRatio } from "../engine/color.js";

export type A11ySeverity = "serious" | "warning";

export interface A11yFinding {
  code: "flash" | "contrast";
  severity: A11ySeverity;
  nodeId?: string;
  message: string;
  /** The WCAG success criterion. */
  wcag: string;
}

export interface A11yReport {
  /** True when there are no `serious` findings. */
  passed: boolean;
  findings: A11yFinding[];
}

/** Resolve the scene background to a representative solid color. */
function backgroundColor(bg: Color | Backdrop | undefined): string {
  if (bg === undefined) return "#ffffff";
  if (typeof bg === "string") return bg === "transparent" ? "#ffffff" : bg;
  const fill = bg.fill;
  if (typeof fill === "string") return fill;
  if (fill && Array.isArray(fill.stops) && fill.stops[0]) return fill.stops[0].color;
  return "#ffffff";
}

/** The most flashes per any 1-second window, given the times of the luminance peaks. */
function peakFlashesPerSecond(peakTimes: number[]): number {
  let max = 0;
  for (let i = 0; i < peakTimes.length; i++) {
    let count = 0;
    for (let j = i; j < peakTimes.length; j++) if (peakTimes[j]! - peakTimes[i]! <= 1) count++;
    max = Math.max(max, count);
  }
  return max;
}

/**
 * Times of luminance peaks whose drop to the *neighbouring troughs* exceeds `minSwing`.
 *
 * Crucially this collapses the value sequence to its turning points (local extrema) first, so the
 * result is invariant to how densely a ramp is keyframed: a full 0→1→0 strobe is detected whether it
 * is authored as a hard square wave or as a finely-sampled sine. Measuring trough-to-peak (not the
 * step to the adjacent keyframe) is what makes a smoothly-ramped strobe count as a flash.
 */
function significantPeaks(times: number[], values: number[], minSwing: number): number[] {
  if (values.length < 3) return [];
  // Indices of local extrema (maxima + minima), endpoints included as boundary troughs/peaks.
  const ext: number[] = [0];
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i - 1]!;
    const b = values[i]!;
    const c = values[i + 1]!;
    if ((b > a && b >= c) || (b < a && b <= c)) ext.push(i);
  }
  ext.push(values.length - 1);
  const peaks: number[] = [];
  for (let k = 1; k < ext.length - 1; k++) {
    const i = ext[k]!;
    const v = values[i]!;
    const prev = values[ext[k - 1]!]!;
    const next = values[ext[k + 1]!]!;
    if (v > prev && v >= next && v - Math.min(prev, next) >= minSwing) peaks.push(times[i]!);
  }
  return peaks;
}

function flashFindings(node: Node): A11yFinding[] {
  const tracks = node.tracks;
  if (!tracks) return [];
  const out: A11yFinding[] = [];
  for (const track of tracks) {
    if (track.property !== "opacity" && track.property !== "fill") continue;
    const kfs = [...track.keyframes].sort((a, b) => a.t - b.t);
    if (kfs.length < 3) continue;
    const times = kfs.map((k) => k.t);
    // Relative-luminance proxy: opacity 0..1, or the color's luminance.
    const values = kfs.map((k) => (track.property === "opacity" ? Number(k.value) : relativeLuminance(String(k.value))));
    const range = Math.max(...values) - Math.min(...values);
    if (range < 0.1) continue; // negligible swing can't flash
    // Trough-to-peak swing threshold: a flash is a near-full luminance excursion. 0.4 (opacity) keeps
    // half-amplitude strobes in scope while ignoring gentle pulses; 0.1 for color luminance.
    const minSwing = track.property === "opacity" ? 0.4 : 0.1;
    const peaks = significantPeaks(times, values, minSwing);
    const fps = peakFlashesPerSecond(peaks);
    if (fps > 3) {
      out.push({
        code: "flash",
        severity: "serious",
        ...(node.id ? { nodeId: node.id } : {}),
        message: `"${track.property}" flashes ~${fps}× per second (> 3) — a photosensitive-seizure risk.`,
        wcag: "2.3.1 Three Flashes or Below Threshold",
      });
    }
  }
  return out;
}

function contrastFinding(node: Node, bg: string): A11yFinding | null {
  if (node.type !== "text" && node.type !== "counter") return null;
  const fill = (node as { fill?: Color }).fill ?? "#000000";
  if (fill === "transparent" || parseColor(fill) === null) return null;
  // Skip if the node carries a gradient (can't reduce to one color).
  if ((node as { gradient?: unknown }).gradient !== undefined) return null;
  const ratio = contrastRatio(fill, bg);
  const fontSize = (node as { fontSize?: number }).fontSize ?? 48;
  const weight = (node as { fontWeight?: number | string }).fontWeight;
  const bold = weight === "bold" || (typeof weight === "number" && weight >= 700);
  const large = fontSize >= 24 || (bold && fontSize >= 18.66);
  const threshold = large ? 3 : 4.5;
  if (ratio < threshold) {
    return {
      code: "contrast",
      severity: "warning",
      ...(node.id ? { nodeId: node.id } : {}),
      message: `text contrast ${ratio.toFixed(2)}:1 is below WCAG AA (${threshold}:1 for ${large ? "large" : "normal"} text). Note: measured against the scene background, not layered cards.`,
      wcag: "1.4.3 Contrast (Minimum)",
    };
  }
  return null;
}

function walk(node: Node, bg: string, findings: A11yFinding[]): void {
  findings.push(...flashFindings(node));
  const c = contrastFinding(node, bg);
  if (c) findings.push(c);
  if (node.type === "group") for (const child of node.children) walk(child, bg, findings);
}

/** Audit a scene for flash risk + text contrast. Pure + deterministic. */
export function auditScene(spec: SceneSpec): A11yReport {
  const bg = backgroundColor(spec.background);
  const findings: A11yFinding[] = [];
  for (const node of spec.nodes) walk(node, bg, findings);
  const passed = !findings.some((f) => f.severity === "serious");
  return { passed, findings };
}
