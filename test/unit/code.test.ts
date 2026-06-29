import { describe, it, expect } from "vitest";
import { renderFrame, validateScene, SPEC_VERSION, code } from "../../src/index.js";
import type { SceneSpec, Node, GroupNode } from "../../src/index.js";

const { tokenize, codeBlock, CODE_DARK } = code;
function scene(n: Node, w = 480, h = 300): SceneSpec {
  return { specVersion: SPEC_VERSION, width: w, height: h, fps: 1, duration: 1, seed: 1, background: "#ffffff", nodes: [n] };
}
const kids = (g: Node): Node[] => (g as GroupNode).children;
const types = (line: { type: string }[]): string[] => line.map((t) => t.type);

describe("tokenize", () => {
  it("classifies JS/TS keywords, strings, numbers, comments, functions", () => {
    const ln = tokenize(`const n = foo(42); // note`, "ts")[0]!;
    expect(types(ln)).toContain("keyword"); // const
    expect(types(ln)).toContain("function"); // foo(
    expect(types(ln)).toContain("number"); // 42
    expect(types(ln)).toContain("comment"); // // note
    const str = tokenize(`let s = "hi";`, "js")[0]!;
    expect(str.find((t) => t.type === "string")?.text).toBe('"hi"');
  });
  it("handles a multi-line block comment and python # comments", () => {
    const lines = tokenize(`a;\n/* big\ncomment */\nb;`, "js");
    expect(lines[1]!.some((t) => t.type === "comment")).toBe(true);
    expect(lines[2]!.some((t) => t.type === "comment")).toBe(true); // comment spans lines
    const py = tokenize(`x = 1  # set x`, "python")[0]!;
    expect(py.some((t) => t.type === "comment" && t.text.includes("set x"))).toBe(true);
  });
  it("merges adjacent same-type runs", () => {
    const ln = tokenize(`x   y`, "js")[0]!; // the spaces collapse into one plain run between idents
    expect(ln.filter((t) => t.type === "plain")).toHaveLength(1);
  });
});

describe("codeBlock", () => {
  const src = `function f(x) {\n  return x + 1;\n}`;
  it("builds an editor card with chrome, gutter, and colored tokens; validates", () => {
    const c = codeBlock({ id: "c", x: 10, y: 10, code: src, lang: "ts", title: "f.ts", highlightLines: [2] });
    const ids = kids(c).map((n) => n.id);
    expect(ids).toContain("c-card");
    expect(ids.filter((i) => i.startsWith("c-dot-"))).toHaveLength(3); // traffic-light dots
    expect(ids.some((i) => i.startsWith("c-ln-"))).toBe(true); // gutter line numbers
    expect(ids.some((i) => i.startsWith("c-hl-"))).toBe(true); // highlight band
    // a keyword token is colored with the theme keyword color
    const kw = kids(c).find((n) => n.type === "text" && (n as { text?: string }).text === "function") as { fill?: string };
    expect(kw.fill).toBe(CODE_DARK.token.keyword);
    expect(validateScene(scene(c, 420, 200))).toMatchObject({ valid: true });
  });

  it("reveals line-by-line when animated, and renders deterministically", () => {
    const c = codeBlock({ id: "c", x: 10, y: 10, code: src, animate: true, shadow: false });
    const tok = kids(c).find((n) => n.type === "text" && (n as { tracks?: unknown }).tracks) as { tracks?: { property: string }[] };
    expect(tok.tracks?.[0]?.property).toBe("opacity");
    const s = scene(codeBlock({ x: 10, y: 10, code: src, shadow: false }), 420, 200);
    expect(Buffer.from(renderFrame(s, 0).pixels).equals(Buffer.from(renderFrame(s, 0).pixels))).toBe(true);
  });
});
