import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, pedagogy } from "../../src/index.js";
import type { SceneSpec, Node } from "../../src/index.js";

const { nextSegment, walk, validateGraph, nextHint, revealedHints, hintsExhausted, hintCard } = pedagogy;

const graph: pedagogy.LessonGraph = {
  start: "intro",
  segments: [
    { id: "intro", next: "q1" },
    {
      id: "q1",
      branches: [
        { when: "correct", to: "q2" },
        { when: "incorrect", to: "remediate" },
      ],
    },
    { id: "remediate", next: "q1" },
    { id: "q2", next: "summary" },
    { id: "summary" },
  ],
};

describe("branching graph", () => {
  it("follows branches, falls back to next, and ends at a terminal", () => {
    expect(nextSegment(graph, "q1", "correct")).toBe("q2");
    expect(nextSegment(graph, "q1", "incorrect")).toBe("remediate");
    expect(nextSegment(graph, "intro", "anything")).toBe("q1"); // no branch → default next
    expect(nextSegment(graph, "summary", "correct")).toBeNull(); // terminal
    expect(nextSegment(graph, "ghost", "correct")).toBeNull(); // unknown segment
  });
  it("walks a path through remediation and back", () => {
    expect(walk(graph, ["x", "incorrect", "redo", "correct", "done"])).toEqual(["intro", "q1", "remediate", "q1", "q2", "summary"]);
    expect(walk({ start: "nope", segments: [{ id: "a" }] }, [])).toEqual([]); // bad start
  });
  it("validates a clean graph and flags duplicate / dangling / unreachable (with a valid start)", () => {
    expect(validateGraph(graph)).toEqual([]);
    const bad: pedagogy.LessonGraph = {
      start: "a",
      segments: [
        { id: "a", next: "missing" }, // dangling ref
        { id: "a", next: "b" }, // duplicate id
        { id: "b" },
        { id: "orphan", next: "b" }, // unreachable from start
      ],
    };
    const codes = validateGraph(bad).map((p) => p.code);
    expect(codes).toContain("DUPLICATE_ID");
    expect(codes).toContain("DANGLING_REF");
    expect(codes).toContain("UNREACHABLE");
  });
  it("flags a missing start", () => {
    expect(validateGraph({ start: "ghost", segments: [{ id: "a" }] }).map((p) => p.code)).toContain("MISSING_START");
  });
  it("reachability follows the runtime (first-wins) edge on duplicate ids (review fix)", () => {
    const g: pedagogy.LessonGraph = { start: "a", segments: [{ id: "a", next: "b" }, { id: "a", next: "c" }, { id: "b" }, { id: "c" }] };
    const probs = validateGraph(g);
    expect(walk(g, ["x"])).toEqual(["a", "b"]); // runtime takes the first 'a' → b
    expect(probs.some((p) => p.code === "UNREACHABLE" && p.segmentId === "b")).toBe(false); // b IS reached
    expect(probs.some((p) => p.code === "UNREACHABLE" && p.segmentId === "c")).toBe(true); // c is the dead one
  });
});

describe("hint ladder", () => {
  const ladder: pedagogy.HintLadder = [
    { level: 3, text: "answer-level" },
    { level: 1, text: "nudge" },
    { level: 2, text: "strategy" },
  ];
  it("reveals one escalating rung per wrong attempt (sorted by level), in order", () => {
    expect(nextHint(ladder, 0)).toBeNull(); // none before a wrong attempt
    expect(nextHint(ladder, 1)?.text).toBe("nudge");
    expect(nextHint(ladder, 2)?.text).toBe("strategy");
    expect(nextHint(ladder, 3)?.text).toBe("answer-level");
    expect(nextHint(ladder, 4)).toBeNull(); // exhausted
  });
  it("reveals cumulatively and reports exhaustion", () => {
    expect(revealedHints(ladder, 2).map((h) => h.text)).toEqual(["nudge", "strategy"]);
    expect(hintsExhausted(ladder, 2)).toBe(false);
    expect(hintsExhausted(ladder, 3)).toBe(true);
  });
});

describe("hintCard", () => {
  it("renders a valid card with the level eyebrow and text", () => {
    const card = hintCard({ hint: { level: 2, text: "Try skip-counting by the first number." }, x: 30, y: 30, theme: "sunshine" });
    expect(card.children.some((n) => n.id.endsWith("-edge"))).toBe(true);
    const eyebrow = card.children.find((n) => n.id.endsWith("-eyebrow")) as { text?: string };
    expect(eyebrow.text).toBe("HINT 2");
    const spec: SceneSpec = {
      specVersion: SPEC_VERSION,
      width: 480,
      height: 160,
      fps: 1,
      duration: 1,
      seed: 1,
      background: "#fffdf7",
      nodes: [card as Node],
    };
    expect(validateScene(spec)).toMatchObject({ valid: true });
  });
  it("grows the card for multi-line (newline) hints so text doesn't overflow (review fix)", () => {
    const cardH = (h: string): number =>
      (hintCard({ hint: h, x: 0, y: 0 }).children.find((n) => n.id.endsWith("-card")) as { height: number }).height;
    expect(cardH("a\nb\nc\nd\ne\nf")).toBeGreaterThan(cardH("short") * 2);
  });
});
