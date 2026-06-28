/**
 * Template author — turns a plain-English brief into a lesson spec deterministically,
 * with NO LLM. It parses intent (count, topic, theme, shape) and builds a structured
 * lesson from the M5 templates. This makes the full brief -> video flow runnable and
 * testable offline; `AnthropicSpecAuthor` is the richer LLM path when a key is set.
 */

import { AnthropicSpecAuthor, type SpecAuthor } from "./agent.js";
import { OpenRouterSpecAuthor } from "./openRouterAuthor.js";
import { buildCountingLesson, buildLessonFromOutline, type CountingLessonOptions } from "../lessons/templates.js";
import { buildMathLesson } from "../math/lessons.js";
import { parseMathBrief } from "./mathBrief.js";
import { THEMES } from "../theme/themes.js";

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const TOPIC_WORDS = [
  "apples",
  "stars",
  "balloons",
  "flowers",
  "fish",
  "ducks",
  "bananas",
  "cars",
  "blocks",
  "hearts",
  "frogs",
  "bears",
  "cats",
  "dogs",
  "fruits",
  "shapes",
  "boats",
  "trees",
  "bees",
  "birds",
];

export interface ParsedBrief {
  count: number;
  topic: string;
  theme: string;
  shape: "circle" | "star" | "triangle";
  kind: "counting" | "outline";
}

/** Heuristically parse a brief into lesson parameters. Always returns sane defaults. */
export function parseBrief(brief: string): ParsedBrief {
  const b = brief.toLowerCase();

  // Count: "count to N", or the first number word / digit (1..10).
  let count = 3;
  const toMatch = b.match(/count(?:ing)?\s+(?:to|up to)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/);
  const anyNum = b.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/);
  const numToken = toMatch?.[1] ?? anyNum?.[1];
  if (numToken) count = NUMBER_WORDS[numToken] ?? Math.min(10, Math.max(1, parseInt(numToken, 10) || 3));
  count = Math.min(10, Math.max(1, count));

  // Shape.
  const shape: ParsedBrief["shape"] = /\bstar/.test(b) ? "star" : /\btriangle/.test(b) ? "triangle" : "circle";

  // Theme.
  const theme = /ocean|sea|under\s*water|fish|wave/.test(b)
    ? "ocean"
    : /forest|meadow|tree|garden|nature|leaf/.test(b)
      ? "meadow"
      : /berry|pink|magic|fairy|princess|unicorn/.test(b)
        ? "berry"
        : "sunshine";

  // Topic: first known topic noun, else derive from shape.
  let topic = TOPIC_WORDS.find((w) => b.includes(w));
  if (!topic) topic = shape === "star" ? "stars" : shape === "triangle" ? "triangles" : "shapes";

  // Counting briefs vs generic lessons.
  const kind: ParsedBrief["kind"] = /count|how many|number/.test(b) ? "counting" : "counting";

  return { count, topic, theme: THEMES[theme] ? theme : "sunshine", shape, kind };
}

export interface TemplateAuthorOptions {
  width?: number;
  height?: number;
  fps?: number;
}

/** A SpecAuthor that builds a lesson from a brief with no LLM. */
export class TemplateAuthor implements SpecAuthor {
  constructor(private readonly opts: TemplateAuthorOptions = {}) {}

  async propose(brief: string): Promise<unknown> {
    // A math brief ("graph y = 2x + 1", "show 3/4 as a pie", …) routes to a math lesson.
    const dims = {
      ...(this.opts.width !== undefined ? { width: this.opts.width } : {}),
      ...(this.opts.height !== undefined ? { height: this.opts.height } : {}),
      ...(this.opts.fps !== undefined ? { fps: this.opts.fps } : {}),
    };
    const mathIntent = parseMathBrief(brief);
    if (mathIntent) {
      return buildMathLesson(mathIntent.topic, { ...mathIntent.params, ...dims });
    }

    const parsed = parseBrief(brief);
    const base: CountingLessonOptions = {
      count: parsed.count,
      topic: parsed.topic,
      theme: parsed.theme,
      itemShape: parsed.shape,
      ...dims,
    };
    return buildCountingLesson(base);
  }
}

/**
 * Pick the best available author: an LLM author when a key is configured (richer,
 * free-form lessons), otherwise the offline TemplateAuthor (always works).
 * Preference: OpenRouter > Anthropic > Template.
 */
export function createDefaultAuthor(opts: TemplateAuthorOptions = {}): SpecAuthor {
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return new OpenRouterSpecAuthor();
    } catch {
      /* fall through */
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return new AnthropicSpecAuthor();
    } catch {
      /* fall through */
    }
  }
  return new TemplateAuthor(opts);
}

/** Build a generic intro→concept→example→recap lesson from a title + outline lines. */
export function lessonFromBriefOutline(title: string, lines: string[], theme = "sunshine") {
  const kinds: Array<"intro" | "concept" | "example" | "recap"> = ["intro", "concept", "example", "recap"];
  return buildLessonFromOutline({
    title,
    theme,
    segments: lines.slice(0, 4).map((heading, i) => ({ kind: kinds[i] ?? "concept", heading })),
  });
}
