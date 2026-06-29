import { describe, it, expect } from "vitest";
import { validateScene, SPEC_VERSION, makeRng, getTheme, items } from "../../src/index.js";
import type { SceneSpec, Node } from "../../src/index.js";

const { generateItem, generateBank, quizCard, additionTemplate, multiplicationTemplate, linearEquationTemplate } = items;

describe("parametric items", () => {
  it("generates deterministically; the correct index names the answer", () => {
    const a = generateItem(multiplicationTemplate, makeRng(5));
    const b = generateItem(multiplicationTemplate, makeRng(5));
    expect(a).toEqual(b); // same seed → identical item
    expect(a.choices[a.correctIndex]).toBe(String(a.answer));
    expect(a.rationales[a.correctIndex]).toBe(""); // correct option has no misconception
  });
  it("offers misconception distractors, deduped against the answer", () => {
    const it = generateItem(multiplicationTemplate, makeRng(3));
    const { a, b } = it.params;
    expect(it.answer).toBe(a! * b!);
    // every wrong choice has a stated misconception, and none equals the answer
    it.choices.forEach((c, i) => {
      if (i !== it.correctIndex) {
        expect(it.rationales[i]!.length).toBeGreaterThan(0);
        expect(Number(c)).not.toBe(it.answer);
      }
    });
    expect(new Set(it.choices).size).toBe(it.choices.length); // no duplicate options
  });
  it("linear-equation answers actually solve the equation", () => {
    for (let s = 0; s < 8; s++) {
      const it = generateItem(linearEquationTemplate, makeRng(s));
      const { a, b, c } = it.params;
      expect(a! * it.answer + b!).toBe(c!); // a·x + b = c
    }
  });
  it("generateBank returns the requested count of distinct, reproducible variants", () => {
    const bank = generateBank(additionTemplate, 6, 42);
    expect(bank).toHaveLength(6);
    expect(new Set(bank.map((i) => i.stem)).size).toBe(6); // all distinct
    expect(generateBank(additionTemplate, 6, 42).map((i) => i.stem)).toEqual(bank.map((i) => i.stem)); // deterministic
  });
  it("under-fills (without spinning) when count exceeds the parameter space (review fix)", () => {
    const bank = generateBank(multiplicationTemplate, 100000, 1); // space is only 7×10 = 70 distinct stems
    expect(bank.length).toBeLessThanOrEqual(70);
    expect(bank.length).toBeGreaterThan(40);
    expect(new Set(bank.map((i) => i.stem)).size).toBe(bank.length); // all distinct
  });
});

describe("quizCard", () => {
  const item = generateItem(multiplicationTemplate, makeRng(1));
  const scene = (node: Node): SceneSpec => ({
    specVersion: SPEC_VERSION,
    width: 520,
    height: 360,
    fps: 1,
    duration: 1,
    seed: 1,
    background: "#eef2f7",
    nodes: [node],
  });
  it("renders a row per choice and validates", () => {
    const card = quizCard({ item, x: 30, y: 30, theme: "ocean" });
    const rows = card.children.filter((n) => /-row-\d+$/.test(n.id));
    expect(rows).toHaveLength(item.choices.length);
    expect(validateScene(scene(card))).toMatchObject({ valid: true });
  });
  it("reveal highlights the correct row (accent fill) and dims the others", () => {
    const accent = getTheme("ocean").palette.accent;
    const plain = quizCard({ item, x: 30, y: 30, theme: "ocean" });
    const revealed = quizCard({ item, x: 30, y: 30, theme: "ocean", reveal: true });
    const row = (card: typeof plain, i: number) =>
      card.children.find((n) => n.id === `quiz-row-${i}`) as { fill?: string; opacity?: number };
    // The correct row is painted with the accent only when revealed (not before).
    expect(row(revealed, item.correctIndex).fill).toBe(accent);
    expect(row(plain, item.correctIndex).fill).not.toBe(accent);
    // A non-correct row is dimmed on reveal.
    const otherIdx = item.choices.findIndex((_, i) => i !== item.correctIndex);
    expect(row(revealed, otherIdx).opacity).toBeLessThan(1);
  });
});
