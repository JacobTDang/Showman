import { describe, it, expect } from "vitest";
import {
  validateScene,
  renderFrame,
  getTheme,
  swatch,
  motion,
  captionsFromNarration,
  toVTT,
  toSRT,
  SilentTtsProvider,
  synthesizeNarration,
  estimateSpeechDuration,
  SAMPLE_RATE,
  RuleBasedModeration,
  moderateScene,
  collectSceneTexts,
  buildCountingLesson,
  buildLessonFromOutline,
} from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { samplePixel, isColorNear } from "../helpers.js";

describe("M5.1 primitives", () => {
  it("renders a polygon star (center filled, bbox corner empty)", () => {
    const spec: SceneSpec = {
      specVersion: 1,
      width: 120,
      height: 120,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "s", type: "polygon", x: 10, y: 10, sides: 5, radius: 50, innerRadius: 22, fill: "#ffb703" }],
    };
    expect(validateScene(spec).valid).toBe(true);
    const f = renderFrame(spec, 0);
    expect(isColorNear(samplePixel(f, 60, 60), { r: 255, g: 183, b: 3 })).toBe(true); // center is the star fill
    expect(isColorNear(samplePixel(f, 12, 12), { r: 255, g: 255, b: 255 })).toBe(true); // a concave gap stays background
  });

  it("renders a triangle polygon and validates sides>=3", () => {
    expect(validateScene({ specVersion: 1, width: 60, height: 60, fps: 1, duration: 1, nodes: [{ id: "t", type: "polygon", sides: 2 }] }).valid).toBe(false);
    const tri: SceneSpec = { specVersion: 1, width: 80, height: 80, fps: 1, duration: 1, background: "#fff", nodes: [{ id: "t", type: "polygon", x: 10, y: 10, sides: 3, radius: 30, fill: "red" }] };
    expect(validateScene(tri).valid).toBe(true);
    expect(isColorNear(samplePixel(renderFrame(tri, 0), 40, 45), { r: 255, g: 0, b: 0 })).toBe(true);
  });

  it("typewriter reveal shows fewer dark pixels at reveal 0 than reveal 1", () => {
    const make = (reveal: number): SceneSpec => ({
      specVersion: 1,
      width: 240,
      height: 80,
      fps: 1,
      duration: 1,
      background: "#ffffff",
      nodes: [{ id: "t", type: "text", x: 10, y: 40, text: "HELLO WORLD", fontSize: 40, fontWeight: 800, fill: "#000000", baseline: "middle", reveal }],
    });
    const dark = (spec: SceneSpec) => {
      const f = renderFrame(spec, 0);
      let n = 0;
      for (let i = 0; i < f.pixels.length; i += 4) if (f.pixels[i]! < 80) n++;
      return n;
    };
    const none = dark(make(0));
    const half = dark(make(0.5));
    const full = dark(make(1));
    expect(none).toBe(0);
    expect(half).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(half);
  });
});

describe("M5.2 motion presets", () => {
  it("popIn emits opacity + scale tracks ending at rest", () => {
    const tracks = motion.popIn({ start: 0.2, duration: 0.5 });
    const props = tracks.map((t) => t.property).sort();
    expect(props).toEqual(["opacity", "scale"]);
    const scale = tracks.find((t) => t.property === "scale")!;
    expect(scale.keyframes[scale.keyframes.length - 1]!.value).toBe(1);
    expect(scale.keyframes[scale.keyframes.length - 1]!.easing).toBe("easeOutBack");
  });

  it("stagger shifts each item's start time", () => {
    const groups = motion.stagger(3, (start) => motion.fadeIn({ start }), { step: 0.2 });
    const starts = groups.map((g) => g[0]!.keyframes[0]!.t);
    expect(starts).toEqual([0, 0.2, 0.4]);
  });

  it("mergeTracks keeps the last track per property", () => {
    const merged = motion.mergeTracks(motion.fadeIn({ start: 0 }), motion.fadeOut({ start: 1 }));
    expect(merged.filter((t) => t.property === "opacity").length).toBe(1);
  });
});

describe("M5.3 theming", () => {
  it("returns themes and cycles swatches", () => {
    const theme = getTheme("ocean");
    expect(theme.name).toBe("ocean");
    expect(theme.headingFont).toBe("Fredoka");
    expect(swatch(theme, theme.palette.swatches.length)).toBe(swatch(theme, 0)); // cycles
  });
  it("falls back to the default theme for unknown names", () => {
    expect(getTheme("does-not-exist").name).toBe(getTheme().name);
  });
});

describe("M5.4 TTS + narration", () => {
  it("estimateSpeechDuration scales with word count", () => {
    expect(estimateSpeechDuration("hi")).toBeLessThan(estimateSpeechDuration("one two three four five"));
  });
  it("synthesizeNarration produces a WAV of the scene duration", async () => {
    const { wav } = await synthesizeNarration(new SilentTtsProvider(), { segments: [{ t: 0, text: "one" }, { t: 1, text: "two" }] }, 3);
    expect(wav.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wav.subarray(8, 12).toString("ascii")).toBe("WAVE");
    const dataSize = wav.readUInt32LE(40);
    expect(dataSize).toBe(Math.round(3 * SAMPLE_RATE) * 2); // 3s mono 16-bit
  });
});

describe("M5.5 captions", () => {
  const narration = { segments: [{ t: 0, text: "Hello" }, { t: 1.5, text: "Count with me" }] };
  it("derives cue end-times from the next segment / scene duration", () => {
    const cues = captionsFromNarration(narration, 4);
    expect(cues[0]!.end).toBeCloseTo(1.5, 5);
    expect(cues[1]!.end).toBeCloseTo(4, 5);
  });
  it("emits valid WebVTT and SRT", () => {
    const cues = captionsFromNarration(narration, 4);
    const vtt = toVTT(cues);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:00.000 --> 00:00:01.500");
    const srt = toSRT(cues);
    expect(srt).toContain("00:00:00,000 --> 00:00:01,500");
    expect(srt).toContain("1\n");
  });
});

describe("M5.7 content safety", () => {
  const mod = new RuleBasedModeration();
  it("blocks unsafe text and passes safe text", async () => {
    expect((await mod.check([{ text: "the friendly bunny hops", where: "x" }])).safe).toBe(true);
    const unsafe = await mod.check([{ text: "the gun goes bang", where: "x" }]);
    expect(unsafe.safe).toBe(false);
    expect(unsafe.findings.some((f) => f.category === "violence")).toBe(true);
  });
  it("collects text from nodes and narration", () => {
    const spec: SceneSpec = {
      specVersion: 1, width: 64, height: 64, fps: 1, duration: 1,
      nodes: [{ id: "g", type: "group", children: [{ id: "t", type: "text", text: "hi there" }] }],
      narration: { segments: [{ t: 0, text: "welcome" }] },
    };
    const texts = collectSceneTexts(spec).map((i) => i.text);
    expect(texts).toContain("hi there");
    expect(texts).toContain("welcome");
  });
  it("moderateScene flags a scary monster narration as a warning, not a block", async () => {
    const spec: SceneSpec = { specVersion: 1, width: 64, height: 64, fps: 1, duration: 1, nodes: [], narration: { segments: [{ t: 0, text: "a friendly monster" }] } };
    const r = await moderateScene(spec);
    expect(r.safe).toBe(true); // "monster" is a warn, not a block
    expect(r.findings.some((f) => f.category === "scary")).toBe(true);
  });
});

describe("M5.6 lesson templates", () => {
  it("buildCountingLesson produces a valid, narrated, structured lesson", async () => {
    const lesson = buildCountingLesson({ count: 3, topic: "apples", theme: "sunshine", itemShape: "star" });
    expect(validateScene(lesson).valid).toBe(true);
    expect(lesson.narration!.segments!.length).toBe(5); // intro + 3 numbers + recap
    const ids = lesson.nodes.map((n) => n.id);
    expect(ids).toContain("title");
    expect(ids).toContain("item3");
    expect(ids).toContain("num3");
    expect(ids).toContain("recap");
    expect((await moderateScene(lesson)).safe).toBe(true);
  });

  it("buildLessonFromOutline encodes intro/concept/example/recap and validates", () => {
    const lesson = buildLessonFromOutline({
      title: "Shapes Around Us",
      theme: "meadow",
      segments: [
        { kind: "intro", heading: "Hello shapes!", body: "Today we find shapes." },
        { kind: "concept", heading: "A circle is round" },
        { kind: "example", heading: "A wheel is a circle" },
        { kind: "recap", heading: "We found shapes!" },
      ],
    });
    expect(validateScene(lesson).valid).toBe(true);
    expect(lesson.duration).toBeGreaterThan(4);
  });
});
