/**
 * M5.6 — Pedagogical lesson templates.
 *
 * Templates encode multimedia-learning principles into ready-made, beautiful
 * lessons: **segmentation** (distinct intro → concept → example → recap beats),
 * **signaling** (motion/pulse draws the eye to the current item), and **dual
 * coding** (each idea is shown *and* narrated/captioned). They compose primitives +
 * motion presets + a theme + a synced narration track into one valid Scene Spec.
 */

import type { SceneSpec, Node, NarrationSegment } from "../spec/types.js";
import { SPEC_VERSION } from "../spec/schema.js";
import { getTheme, swatch, type Theme } from "../theme/themes.js";
import { popIn, fadeIn, mergeTracks, typewriter } from "../motion/presets.js";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export interface CountingLessonOptions {
  /** What we're counting, e.g. "apples". Default "stars". */
  topic?: string;
  /** Count target 1..10. Default 3. */
  count?: number;
  /** Theme name. Default "sunshine". */
  theme?: string;
  /** Item shape. Default "circle". */
  itemShape?: "circle" | "star" | "triangle";
  width?: number;
  height?: number;
  fps?: number;
}

function titleNode(theme: Theme, text: string, width: number): Node {
  return {
    id: "title",
    type: "text",
    x: width / 2,
    y: 64,
    text,
    fontSize: 52,
    fontFamily: theme.headingFont,
    fontWeight: theme.headingWeight,
    fill: theme.palette.primary,
    align: "center",
    baseline: "middle",
    tracks: popIn({ start: 0.1, duration: 0.6 }),
  };
}

/** Build a warm, narrated counting lesson with intro → concept → example → recap. */
export function buildCountingLesson(opts: CountingLessonOptions = {}): SceneSpec {
  const theme = getTheme(opts.theme);
  const count = Math.max(1, Math.min(10, opts.count ?? 3));
  const topic = opts.topic ?? "stars";
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;
  const shape = opts.itemShape ?? "circle";

  const nodes: Node[] = [titleNode(theme, `Let's count to ${count}!`, width)];
  nodes.push({
    id: "subtitle",
    type: "text",
    x: width / 2,
    y: 120,
    text: `Count the ${topic} with me`,
    fontSize: 26,
    fontFamily: theme.bodyFont,
    fontWeight: theme.bodyWeight,
    fill: theme.palette.muted,
    align: "center",
    baseline: "middle",
    tracks: fadeIn({ start: 0.5, duration: 0.6 }),
  });

  // Concept beat: items appear one by one (staggered), each labeled with its number.
  const rowWidth = width * 0.82;
  const gap = rowWidth / count;
  const radius = Math.max(20, Math.min(46, gap * 0.32));
  const itemY = height * 0.46;
  const beatStart = 1.2;
  const beatStep = 0.7;
  const narration: NarrationSegment[] = [{ t: 0.15, text: `Let's count to ${count}!` }];

  for (let i = 0; i < count; i++) {
    const cx = (width - rowWidth) / 2 + gap * (i + 0.5);
    const start = beatStart + i * beatStep;
    const fill = swatch(theme, i);
    const anchor = { x: radius, y: radius };

    if (shape === "circle") {
      nodes.push({
        id: `item${i + 1}`,
        type: "ellipse",
        x: cx - radius,
        y: itemY - radius,
        width: radius * 2,
        height: radius * 2,
        fill,
        anchor,
        tracks: popIn({ start, duration: 0.5 }),
      });
    } else {
      const sides = shape === "triangle" ? 3 : 5;
      nodes.push({
        id: `item${i + 1}`,
        type: "polygon",
        x: cx - radius,
        y: itemY - radius,
        sides,
        radius,
        ...(shape === "star" ? { innerRadius: radius * 0.45 } : {}),
        fill,
        anchor,
        tracks: popIn({ start, duration: 0.5 }),
      });
    }

    nodes.push({
      id: `num${i + 1}`,
      type: "text",
      x: cx,
      y: itemY + radius + 36,
      text: String(i + 1),
      fontSize: 36,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.secondary,
      align: "center",
      baseline: "middle",
      tracks: popIn({ start: start + 0.15, duration: 0.45 }),
    });

    narration.push({ t: start + 0.05, text: NUMBER_WORDS[i + 1] ?? String(i + 1) });
  }

  // Recap beat.
  const recapStart = beatStart + count * beatStep + 0.3;
  nodes.push({
    id: "recap",
    type: "text",
    x: width / 2,
    y: height - 70,
    text: `We counted ${count} ${topic}!`,
    fontSize: 34,
    fontFamily: theme.headingFont,
    fontWeight: theme.headingWeight,
    fill: theme.palette.primary,
    align: "center",
    baseline: "middle",
    tracks: popIn({ start: recapStart, duration: 0.6 }),
  });
  narration.push({ t: recapStart + 0.1, text: `We counted ${count} ${topic}!` });

  const duration = Math.round((recapStart + 2.0) * 10) / 10;
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration,
    seed: 7,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}

export interface LessonSegment {
  kind: "intro" | "concept" | "example" | "recap";
  heading: string;
  body?: string;
}

export interface OutlineLessonOptions {
  title: string;
  theme?: string;
  segments: LessonSegment[];
  width?: number;
  height?: number;
  fps?: number;
  /** Seconds each segment is on screen. Default 3. */
  secondsPerSegment?: number;
}

/**
 * Build a generic intro → concept → example → recap lesson from an outline. Each
 * segment is a card: heading pops in, body types on (dual coding with narration),
 * then it fades for the next — explicit segmentation a child can follow.
 */
export function buildLessonFromOutline(opts: OutlineLessonOptions): SceneSpec {
  const theme = getTheme(opts.theme);
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const fps = opts.fps ?? 30;
  const per = opts.secondsPerSegment ?? 3;

  const nodes: Node[] = [titleNode(theme, opts.title, width)];
  const narration: NarrationSegment[] = [{ t: 0.15, text: opts.title }];

  opts.segments.forEach((seg, i) => {
    const t0 = 1.0 + i * per;
    const tagColors: Record<LessonSegment["kind"], string> = {
      intro: theme.palette.secondary,
      concept: theme.palette.primary,
      example: theme.palette.accent,
      recap: theme.palette.secondary,
    };
    nodes.push({
      id: `kind${i}`,
      type: "text",
      x: width / 2,
      y: height * 0.3,
      text: seg.kind.toUpperCase(),
      fontSize: 22,
      fontFamily: theme.bodyFont,
      fontWeight: 700,
      fill: tagColors[seg.kind],
      align: "center",
      baseline: "middle",
      tracks: mergeTracks(fadeIn({ start: t0, duration: 0.4 }), [
        {
          property: "opacity",
          keyframes: [
            { t: t0, value: 0 },
            { t: t0 + 0.4, value: 1 },
            { t: t0 + per - 0.3, value: 1 },
            { t: t0 + per - 0.05, value: 0 },
          ],
        },
      ]),
    });
    nodes.push({
      id: `heading${i}`,
      type: "text",
      x: width / 2,
      y: height * 0.46,
      text: seg.heading,
      fontSize: 44,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fill: theme.palette.text,
      align: "center",
      baseline: "middle",
      tracks: popIn({ start: t0 + 0.1, duration: 0.5 }),
    });
    if (seg.body) {
      nodes.push({
        id: `body${i}`,
        type: "text",
        x: width / 2,
        y: height * 0.6,
        text: seg.body,
        fontSize: 26,
        fontFamily: theme.bodyFont,
        fontWeight: theme.bodyWeight,
        fill: theme.palette.muted,
        align: "center",
        baseline: "middle",
        reveal: 0,
        tracks: typewriter({ start: t0 + 0.5, duration: Math.min(1.6, per - 1) }),
      });
    }
    narration.push({ t: t0 + 0.2, text: seg.body ? `${seg.heading}. ${seg.body}` : seg.heading });
  });

  const duration = Math.round((1.0 + opts.segments.length * per + 1.0) * 10) / 10;
  return {
    specVersion: SPEC_VERSION,
    width,
    height,
    fps,
    duration,
    seed: 11,
    background: theme.palette.bg,
    nodes,
    narration: { segments: narration },
  };
}
