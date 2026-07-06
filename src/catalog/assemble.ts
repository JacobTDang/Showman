/**
 * Deterministic Scene Assembler: BuilderPlacement[] -> one validated SceneSpec.
 *
 * The engine-side half of the orchestrator's per-scene pipeline. Pure function of its
 * input (same request -> byte-identical spec), no LLM:
 *
 *   1. invoke each placement via the registry (params validated by the tool's Zod schema)
 *   2. namespace each placement's node ids (idGen prefixes repeat across calls)
 *   3. lay node-level outputs out by slot/at using each output's bbox
 *   4. animate: kind-aware entrances + content beats (see ./motion.ts), golden-safe
 *   5. frame the envelope (canvas dims, theme background, seed, duration)
 *   6. narrate: spread the beat's narrationBeats across the duration
 *   7. validate + autoRepairSpec, and content-hash the result
 *
 * A request is either ONE scene-level builder or N node-level builders — never mixed
 * (the design's Selector constraint, enforced here as the last line of defense).
 */

import { createHash } from "node:crypto";
import type { BuilderRegistry } from "./registry.js";
import type { BBox } from "./types.js";
import type { GroupNode, NarrationSegment, Node, SceneSpec, Track } from "../spec/types.js";
import { LIMITS, SPEC_VERSION } from "../spec/schema.js";
import { getTheme } from "../theme/themes.js";
import { validateScene, type ValidationError } from "../validator/validate.js";
import { autoRepairSpec } from "../authoring/autoRepair.js";
import { planPlacementMotion, titleReveal, ANIMATE_HINTS, type AnimateHint } from "./motion.js";

export interface AssemblePlacement {
  builder: string;
  params?: Record<string, unknown>;
  /** Declarative layout region. Default "center". "grid" auto-arranges every
   * grid-slotted placement in the request into a centered grid using their bboxes
   * (2 -> side-by-side, 3-4 -> 2x2, 5-6 -> 3x2). */
  slot?: "center" | "left" | "right" | "top" | "bottom" | "grid";
  /** Explicit coordinate override; wins over slot. */
  at?: { x: number; y: number };
  scale?: number;
  /** On-canvas label under the placement. */
  caption?: string;
  /** Entrance motion: "auto" (kind-aware, default), a named preset, or "none". */
  animate?: AnimateHint;
}

export interface AssembleBeat {
  title?: string;
  narrationBeats?: string[];
  durationBudgetSec?: number;
}

export interface AssembleRequest {
  placements: AssemblePlacement[];
  beat?: AssembleBeat;
  theme?: string;
  canvas?: { width?: number; height?: number; fps?: number };
  seed?: number;
  voice?: string;
}

export type AssembleResult =
  { ok: true; spec: SceneSpec; specHash: string; durationSec: number; repaired: string[] } | { ok: false; errors: ValidationError[] };

const DEFAULT_CANVAS = { width: 1280, height: 720, fps: 30 };
const DEFAULT_DURATION = 6;
const STAGGER = 0.35;
/** Motion-free tail before the cut, so scenes land before the next one starts. */
const REST = 0.75;
const DEFAULT_BBOX: BBox = { w: 240, h: 120 };

/** Assemble one scene from placements. Never throws on bad input — returns errors. */
export function assembleScene(registry: BuilderRegistry, req: AssembleRequest): AssembleResult {
  if (!Array.isArray(req.placements) || req.placements.length === 0) {
    return { ok: false, errors: [err("placements", "EMPTY", "placements must be a non-empty array")] };
  }

  const levels = req.placements.map((p) => registry.get(p.builder)?.level);
  if (levels.some((l) => l === undefined)) {
    const bad = req.placements.filter((p) => !registry.get(p.builder)).map((p) => p.builder);
    return { ok: false, errors: bad.map((b) => err("placements", "INVALID_VALUE", `unknown builder "${b}"`)) };
  }
  const badHints = req.placements.filter((p) => p.animate !== undefined && !ANIMATE_HINTS.includes(p.animate));
  if (badHints.length > 0) {
    return {
      ok: false,
      errors: badHints.map((p) =>
        err("placements", "INVALID_VALUE", `unknown animate hint "${String(p.animate)}" (use ${ANIMATE_HINTS.join("|")})`),
      ),
    };
  }
  const sceneLevel = levels.filter((l) => l === "scene").length;
  if (sceneLevel > 0 && (sceneLevel > 1 || req.placements.length > 1)) {
    return {
      ok: false,
      errors: [
        err("placements", "INVALID_VALUE", "a scene request is either ONE scene-level builder or N node-level builders — never mixed"),
      ],
    };
  }

  try {
    const { spec, layoutRepairs } =
      sceneLevel === 1 ? { spec: assembleSceneLevel(registry, req), layoutRepairs: [] } : assembleNodeLevel(registry, req);
    return finalize(spec, layoutRepairs);
  } catch (e) {
    return { ok: false, errors: [err("placements", "INVALID_VALUE", (e as Error).message)] };
  }
}

/** One scene-level tool: build the whole lesson, injecting canvas dims + theme + seed. */
function assembleSceneLevel(registry: BuilderRegistry, req: AssembleRequest): SceneSpec {
  const p = req.placements[0]!;
  const canvas = { ...DEFAULT_CANVAS, ...req.canvas };
  const spec = registry.invokeScene(p.builder, {
    ...(p.params ?? {}),
    width: canvas.width,
    height: canvas.height,
    fps: canvas.fps,
    ...(req.theme ? { theme: req.theme } : {}),
  });
  if (req.seed !== undefined) spec.seed = req.seed;
  return spec;
}

/**
 * N node-level tools: build, namespace, lay out, animate, frame, narrate.
 *
 * TIMELINE-FIRST (P2): when the beat has narration, one shared timeline is built
 * before anything is emitted — slot k spans max(speech k, motion k) — and BOTH the
 * narration segments and the placement animations are timed from it, so the voice
 * describes what is moving right now. Without narration, placements enter on a light
 * fixed stagger (the P1 behavior).
 */
function assembleNodeLevel(registry: BuilderRegistry, req: AssembleRequest): { spec: SceneSpec; layoutRepairs: string[] } {
  const canvas = { ...DEFAULT_CANVAS, ...req.canvas };
  const theme = getTheme(req.theme);
  const nodes: Node[] = [];

  const title = req.beat?.title?.trim();
  const titleH = title ? 84 : 0;
  if (title) {
    nodes.push({
      id: "scene-title",
      type: "text",
      x: canvas.width / 2,
      y: 52,
      text: title,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: 40,
      fill: theme.palette.primary,
      align: "center",
      baseline: "middle",
      tracks: titleReveal(title),
    });
  }

  // Pass 1 — build every placement's motion on a local t=0 clock and measure its span.
  const built = req.placements.map((p, i) => {
    const params = { ...(p.params ?? {}), ...(req.theme && !("theme" in (p.params ?? {})) ? { theme: req.theme } : {}) };
    const out = registry.invokeNode(p.builder, params);
    const motion = planPlacementMotion(namespaceIds(out.node, `s${i}`), p.animate, 0, p.scale ?? 1);
    return { p, i, out, motion };
  });

  // Pass 2 — the shared timeline. With narration: slot k = max(speech k, motion k).
  // Without: the P1 stagger.
  const lines = (req.beat?.narrationBeats ?? []).map((l) => l.trim()).filter(Boolean);
  const titleLead = title ? 0.35 : 0;
  const starts: number[] = [];
  const segments: NarrationSegment[] = [];
  let timelineEnd = 0;

  if (lines.length > 0) {
    const slotCount = Math.max(lines.length, built.length);
    let cursor = titleLead;
    for (let k = 0; k < slotCount; k++) {
      const speech = k < lines.length ? speechDur(lines[k]!) : 0;
      const motion = k < built.length ? built[k]!.motion.end + 0.2 : 0;
      const dur = Math.max(speech, motion, 1.0);
      if (k < built.length) starts.push(cursor);
      if (k < lines.length) {
        segments.push({ t: round3(cursor), text: lines[k]!, duration: round3(Math.min(speech > 0 ? speech - 0.2 : dur, dur)) });
      }
      cursor += dur;
    }
    timelineEnd = cursor;
  } else {
    built.forEach((b) => starts.push(titleLead + b.i * STAGGER));
    timelineEnd = built.reduce((end, b, k) => Math.max(end, starts[k]! + b.motion.end), titleLead);
  }

  // Pass 2.5 — layout (C2): grid-slotted placements get auto-arranged as a group;
  // everyone else keeps their slot/at center. Then the overlap guard shrinks
  // whichever of any two overlapping placements is larger, deterministically.
  const bboxes = built.map(({ out }) => out.bbox ?? DEFAULT_BBOX);
  const gridIdx = built.map(({ p }, i) => (p.slot === "grid" && !p.at ? i : -1)).filter((i) => i >= 0);
  const gridPos =
    gridIdx.length > 0
      ? gridLayout(
          gridIdx.map((i) => bboxes[i]!),
          canvas.width,
          canvas.height,
          titleH,
        )
      : [];
  const positions = built.map(({ p }, i) => {
    if (p.at) return p.at;
    const gi = gridIdx.indexOf(i);
    return gi !== -1 ? gridPos[gi]! : slotCenter(p.slot ?? "center", canvas.width, canvas.height, titleH);
  });
  const scales = built.map(({ p }) => p.scale ?? 1);
  const layoutRepairs = applyOverlapGuard(positions, bboxes, scales);

  // Pass 3 — emit: shift each placement's motion to its slot and build the groups.
  built.forEach(({ p, i, out, motion }) => {
    const bbox = out.bbox ?? DEFAULT_BBOX;
    const pos = positions[i]!;
    const scale = scales[i]!;
    const start = starts[i] ?? 0;

    const entrance = shiftTracks(motion.entrance, start);
    shiftSubtreeTracks(motion.node, start);

    const children: Node[] = [motion.node];
    if (p.caption?.trim()) {
      children.push({
        id: `s${i}-caption`,
        type: "text",
        x: bbox.w / 2,
        y: bbox.h + 34,
        text: p.caption.trim(),
        fontFamily: theme.bodyFont,
        fontWeight: theme.bodyWeight,
        fontSize: 22,
        fill: theme.palette.muted,
        align: "center",
        baseline: "middle",
      });
    }

    const group: GroupNode = {
      id: `placement-${i}`,
      type: "group",
      // slot/at gives the placement's CENTER; the group origin is its top-left.
      x: pos.x - (bbox.w * scale) / 2,
      y: pos.y - (bbox.h * scale) / 2,
      ...(scale !== 1 ? { scale } : {}),
      ...(entrance.length > 0 ? { tracks: entrance } : {}),
      children,
    };
    nodes.push(group);
  });

  const budget = req.beat?.durationBudgetSec ?? 0;
  const duration = Math.min(LIMITS.maxDuration, Math.max(budget > 0 ? budget : DEFAULT_DURATION, timelineEnd + REST));

  const spec: SceneSpec = {
    specVersion: SPEC_VERSION,
    width: canvas.width,
    height: canvas.height,
    fps: canvas.fps,
    duration,
    seed: req.seed ?? 0,
    background: theme.palette.bg,
    nodes,
  };

  if (segments.length > 0) spec.narration = { segments, ...(req.voice ? { voice: req.voice } : {}) };
  return { spec, layoutRepairs };
}

/** Spoken-length estimate: ~2.6 words/sec plus a breath, floored at 1.4s. */
function speechDur(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.4, words / 2.6 + 0.4);
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}

/** Shift every keyframe in a track list by dt (returns new tracks). */
function shiftTracks(tracks: Track[], dt: number): Track[] {
  if (dt === 0) return tracks;
  return tracks.map((track) => ({ ...track, keyframes: track.keyframes.map((kf) => ({ ...kf, t: round3(kf.t + dt) })) }));
}

/** Shift every track in a subtree by dt, in place (the subtree is already a fresh clone). */
function shiftSubtreeTracks(node: Node, dt: number): void {
  if (dt !== 0 && node.tracks && node.tracks.length > 0) node.tracks = shiftTracks(node.tracks, dt);
  if (node.type === "group") for (const child of node.children) shiftSubtreeTracks(child, dt);
}

/** Validate, mechanically repair if needed, and content-hash. */
function finalize(spec: SceneSpec, extraRepairs: string[] = []): AssembleResult {
  let out = spec;
  let repaired: string[] = [...extraRepairs];
  let validation = validateScene(out);
  if (!validation.valid) {
    const fix = autoRepairSpec(out, validation.errors);
    const revalidation = validateScene(fix.spec);
    if (!revalidation.valid) return { ok: false, errors: revalidation.errors };
    out = fix.spec as SceneSpec;
    repaired = [...repaired, ...fix.fixed];
    validation = revalidation;
  }
  const canonical = JSON.stringify(out);
  const specHash = createHash("sha256").update(canonical).digest("hex");
  return { ok: true, spec: out, specHash, durationSec: out.duration, repaired };
}

/** How many columns a grid of n items uses: 1->1, 2->2, 3-4->2, 5-6->3, beyond ->
 * ceil(sqrt(n)) (not spec'd, but a reasonable extrapolation). */
function gridCols(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n <= 4) return 2;
  if (n <= 6) return 3;
  return Math.ceil(Math.sqrt(n));
}

const GRID_GUTTER = 24;

/** Auto-arrange N bboxes into a centered grid (each row individually centered, so a
 * partial last row doesn't hug the left edge). Returns each item's CENTER point. */
function gridLayout(boxes: BBox[], w: number, h: number, titleH: number): { x: number; y: number }[] {
  const n = boxes.length;
  const cols = gridCols(n);
  const rows = Math.ceil(n / cols);
  const cellW = Math.max(...boxes.map((b) => b.w)) + GRID_GUTTER;
  const cellH = Math.max(...boxes.map((b) => b.h)) + GRID_GUTTER;
  const gridH = rows * cellH;
  const top = titleH;
  const availH = h - top;
  const originY = top + Math.max(0, (availH - gridH) / 2);

  return boxes.map((_, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const itemsInRow = row === rows - 1 ? n - row * cols : cols;
    const rowW = itemsInRow * cellW;
    const rowOriginX = (w - rowW) / 2;
    return { x: rowOriginX + col * cellW + cellW / 2, y: originY + row * cellH + cellH / 2 };
  });
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
}

function rectOf(pos: { x: number; y: number }, bbox: BBox, scale: number): Rect {
  const w = bbox.w * scale;
  const h = bbox.h * scale;
  return { x0: pos.x - w / 2, y0: pos.y - h / 2, x1: pos.x + w / 2, y1: pos.y + h / 2, area: w * h };
}

function intersectArea(a: Rect, b: Rect): number {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return ix * iy;
}

const OVERLAP_THRESHOLD = 0.1;
const MIN_SHRINK_SCALE = 0.5;

/** C2 overlap guard: for every pair of placements whose rendered bboxes intersect by
 * more than 10% of the smaller one's area, shrink the LARGER one's scale by the
 * overlap ratio (floored so it never vanishes). Mutates `scales` in place; returns
 * one repair note per correction (surfaced in AssembleResult.repaired). Deterministic:
 * pairs are checked in placement order, ties shrink the later index. */
function applyOverlapGuard(positions: { x: number; y: number }[], bboxes: BBox[], scales: number[]): string[] {
  const repairs: string[] = [];
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const ri = rectOf(positions[i]!, bboxes[i]!, scales[i]!);
      const rj = rectOf(positions[j]!, bboxes[j]!, scales[j]!);
      const inter = intersectArea(ri, rj);
      if (inter <= 0) continue;
      const ratio = inter / Math.min(ri.area, rj.area);
      if (ratio <= OVERLAP_THRESHOLD) continue;
      const shrinkIdx = ri.area > rj.area ? i : j;
      const otherIdx = shrinkIdx === i ? j : i;
      const factor = Math.max(MIN_SHRINK_SCALE, 1 - ratio);
      scales[shrinkIdx] = scales[shrinkIdx]! * factor;
      repairs.push(
        `shrunk placement ${shrinkIdx} to ${Math.round(scales[shrinkIdx]! * 100)}% to resolve a ${Math.round(ratio * 100)}% overlap with placement ${otherIdx}`,
      );
    }
  }
  return repairs;
}

/** The center point of a named layout slot (title band reserved at the top). */
function slotCenter(slot: NonNullable<AssemblePlacement["slot"]>, w: number, h: number, titleH: number): { x: number; y: number } {
  const top = titleH;
  const cy = top + (h - top) / 2;
  switch (slot) {
    case "left":
      return { x: w * 0.27, y: cy };
    case "right":
      return { x: w * 0.73, y: cy };
    case "top":
      return { x: w / 2, y: top + (h - top) * 0.28 };
    case "bottom":
      return { x: w / 2, y: top + (h - top) * 0.76 };
    default:
      return { x: w / 2, y: cy };
  }
}

/** Recursively prefix every node id so repeated builders can't collide. */
function namespaceIds(node: Node, prefix: string): Node {
  const renamed = { ...node, id: `${prefix}:${node.id}` } as Node;
  if (renamed.type === "group") {
    (renamed as GroupNode).children = (renamed as GroupNode).children.map((c) => namespaceIds(c, prefix));
  }
  return renamed;
}

function err(path: string, code: ValidationError["code"], message: string): ValidationError {
  return { path, code, message };
}
