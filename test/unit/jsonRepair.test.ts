import { describe, it, expect } from "vitest";
import { extractJson } from "../../src/authoring/agent.js";
import { sliceBalancedJson, repairJsonText } from "../../src/index.js";

describe("tolerant JSON extraction (LLM author output)", () => {
  it("pulls a spec object out of chatty prose", () => {
    const obj = extractJson('Sure! Here you go:\n{"a": 1, "b": {"c": "}"}}\nHope that helps') as { a: number; b: { c: string } };
    expect(obj.a).toBe(1);
    expect(obj.b.c).toBe("}"); // a brace inside a string must not close the object
  });

  it("unwraps a fenced ```json code block", () => {
    const obj = extractJson('```json\n{"x": 42}\n```') as { x: number };
    expect(obj.x).toBe(42);
  });

  it("unwraps a bare ``` fence too", () => {
    const obj = extractJson('```\n{"ok": true}\n```') as { ok: boolean };
    expect(obj.ok).toBe(true);
  });

  it("recovers from a trailing comma before } and ]", () => {
    const obj = extractJson('{"nodes": [1, 2, 3,], "n": 5,}') as { nodes: number[]; n: number };
    expect(obj.nodes).toEqual([1, 2, 3]);
    expect(obj.n).toBe(5);
  });

  it("never removes a comma that lives inside a string", () => {
    const obj = extractJson('{"label": "a, b, c", "k": 1}') as { label: string; k: number };
    expect(obj.label).toBe("a, b, c");
    expect(obj.k).toBe(1);
  });

  it("throws when there is genuinely no JSON", () => {
    expect(() => extractJson("absolutely no json here")).toThrow();
  });

  it("sliceBalancedJson returns just the first balanced object", () => {
    expect(sliceBalancedJson('noise {"a":1} more {"b":2}')).toBe('{"a":1}');
    expect(sliceBalancedJson("no object")).toBeNull();
  });

  it("repairJsonText only strips genuine trailing commas", () => {
    expect(repairJsonText('{"a":[1,2,],}')).toBe('{"a":[1,2]}');
    expect(repairJsonText('{"s":"x, ]"}')).toBe('{"s":"x, ]"}'); // comma+] inside a string is untouched
  });
});
