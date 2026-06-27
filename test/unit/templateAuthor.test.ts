import { describe, it, expect } from "vitest";
import { parseBrief, TemplateAuthor, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";

describe("parseBrief", () => {
  it("extracts the count from 'count to N' (words and digits)", () => {
    expect(parseBrief("teach counting to five with stars").count).toBe(5);
    expect(parseBrief("count to 7 apples").count).toBe(7);
    expect(parseBrief("a lesson about shapes").count).toBe(3); // default
    expect(parseBrief("count to 99 things").count).toBe(10); // clamped
  });

  it("picks the shape", () => {
    expect(parseBrief("count to 3 with stars").shape).toBe("star");
    expect(parseBrief("count triangles").shape).toBe("triangle");
    expect(parseBrief("count the apples").shape).toBe("circle");
  });

  it("picks the theme from mood words", () => {
    expect(parseBrief("count fish under the sea").theme).toBe("ocean");
    expect(parseBrief("count trees in the forest").theme).toBe("meadow");
    expect(parseBrief("a magical fairy counting lesson").theme).toBe("berry");
    expect(parseBrief("count to 3").theme).toBe("sunshine");
  });

  it("picks a topic noun or derives one", () => {
    expect(parseBrief("count the balloons").topic).toBe("balloons");
    expect(parseBrief("count to 4 with stars").topic).toBe("stars");
  });
});

describe("TemplateAuthor", () => {
  it("authors a valid lesson spec from a brief", async () => {
    const author = new TemplateAuthor({ width: 320, height: 180, fps: 10 });
    const spec = (await author.propose("teach counting to four with stars under the sea", { schema: {} as never, attempt: 1 })) as SceneSpec;
    expect(validateScene(spec).valid).toBe(true);
    expect(spec.width).toBe(320);
    expect(spec.narration!.segments!.length).toBe(6); // intro + 4 + recap
    expect(spec.nodes.some((n) => n.id === "item4")).toBe(true);
    expect(spec.background).toBe("#eaf6fb"); // ocean theme bg
  });
});
