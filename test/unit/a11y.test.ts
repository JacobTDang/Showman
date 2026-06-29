import { describe, it, expect } from "vitest";
import { SPEC_VERSION, a11y } from "../../src/index.js";
import type { SceneSpec, Node, Keyframe } from "../../src/index.js";

const { auditScene } = a11y;
function scene(nodes: Node[], background: SceneSpec["background"] = "#ffffff"): SceneSpec {
  return { specVersion: SPEC_VERSION, width: 400, height: 200, fps: 30, duration: 1.2, seed: 1, background, nodes };
}
const flashKfs = (perSec: number): Keyframe[] => {
  const out: Keyframe[] = [];
  const step = 1 / (perSec * 2);
  for (let i = 0; i * step <= 1.1; i++) out.push({ t: i * step, value: i % 2 });
  return out;
};

describe("flash safety (WCAG 2.3.1)", () => {
  it("flags opacity flashing faster than 3×/second as serious", () => {
    const r = auditScene(
      scene([
        {
          id: "f",
          type: "rect",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          fill: "#000",
          tracks: [{ property: "opacity", keyframes: flashKfs(5) }],
        },
      ]),
    );
    expect(r.passed).toBe(false);
    expect(r.findings.some((f) => f.code === "flash" && f.severity === "serious")).toBe(true);
  });
  it("flags a smoothly-keyframed (sine-sampled) full-amplitude strobe (review: false-negative fix)", () => {
    const kfs: Keyframe[] = [];
    const freq = 6;
    const samplesPerCycle = 8;
    const dt = 1 / (freq * samplesPerCycle);
    for (let i = 0; i < 6 * samplesPerCycle; i++) {
      const p = (i / samplesPerCycle) * 2 * Math.PI;
      kfs.push({ t: i * dt, value: (1 - Math.cos(p)) / 2 }); // raised sine 0..1, 6 Hz
    }
    const r = auditScene(
      scene([
        { id: "glow", type: "rect", x: 0, y: 0, width: 50, height: 50, fill: "#fff", tracks: [{ property: "opacity", keyframes: kfs }] },
      ]),
    );
    expect(r.passed).toBe(false);
    expect(r.findings.some((f) => f.code === "flash")).toBe(true);
  });
  it("does not flag a smooth, finely-sampled single fade-in (no false positive)", () => {
    const kfs: Keyframe[] = [];
    for (let i = 0; i <= 20; i++) kfs.push({ t: i * 0.05, value: i / 20 }); // monotonic 0→1 over 1s
    const r = auditScene(
      scene([
        { id: "fade", type: "rect", x: 0, y: 0, width: 50, height: 50, fill: "#000", tracks: [{ property: "opacity", keyframes: kfs }] },
      ]),
    );
    expect(r.findings.some((f) => f.code === "flash")).toBe(false);
  });
  it("does not flag a slow flash (≤ 3/second)", () => {
    const r = auditScene(
      scene([
        {
          id: "f",
          type: "rect",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          fill: "#000",
          tracks: [{ property: "opacity", keyframes: flashKfs(2) }],
        },
      ]),
    );
    expect(r.findings.some((f) => f.code === "flash")).toBe(false);
  });
  it("flags a rapidly alternating fill color (luminance flash)", () => {
    const kfs: Keyframe[] = flashKfs(5).map((k) => ({ t: k.t, value: k.value === 1 ? "#ffffff" : "#000000" }));
    const r = auditScene(
      scene([{ id: "f", type: "rect", x: 0, y: 0, width: 50, height: 50, fill: "#000", tracks: [{ property: "fill", keyframes: kfs }] }]),
    );
    expect(r.findings.some((f) => f.code === "flash")).toBe(true);
  });
  it("detects a flashing node nested inside a group", () => {
    const r = auditScene(
      scene([
        {
          id: "g",
          type: "group",
          x: 0,
          y: 0,
          children: [
            {
              id: "f",
              type: "rect",
              x: 0,
              y: 0,
              width: 40,
              height: 40,
              fill: "#000",
              tracks: [{ property: "opacity", keyframes: flashKfs(6) }],
            },
          ],
        },
      ]),
    );
    expect(r.findings.some((f) => f.nodeId === "f" && f.code === "flash")).toBe(true);
  });
});

describe("contrast (WCAG 1.4.3)", () => {
  it("warns on low-contrast text but passes (warning, not serious)", () => {
    const r = auditScene(scene([{ id: "t", type: "text", x: 10, y: 10, text: "faint", fontSize: 16, fill: "#cccccc" }]));
    const finding = r.findings.find((f) => f.code === "contrast");
    expect(finding?.severity).toBe("warning");
    expect(r.passed).toBe(true); // warnings don't fail the audit
  });
  it("accepts high-contrast text and applies the large-text threshold", () => {
    expect(auditScene(scene([{ id: "t", type: "text", x: 0, y: 0, text: "ok", fontSize: 16, fill: "#000" }])).findings).toHaveLength(0);
    // #888 on white ≈ 3.5:1 — fails as normal text, passes as large text (≥24px)
    expect(auditScene(scene([{ id: "t", type: "text", x: 0, y: 0, text: "x", fontSize: 16, fill: "#888888" }])).findings.length).toBe(1);
    expect(auditScene(scene([{ id: "t", type: "text", x: 0, y: 0, text: "x", fontSize: 30, fill: "#888888" }])).findings.length).toBe(0);
  });
  it("skips gradient text + transparent fills", () => {
    const grad = {
      type: "linear" as const,
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      stops: [
        { offset: 0, color: "#fff" },
        { offset: 1, color: "#eee" },
      ],
    };
    expect(
      auditScene(scene([{ id: "t", type: "text", x: 0, y: 0, text: "x", fontSize: 14, fill: "#ffffff", gradient: grad }])).findings,
    ).toHaveLength(0);
  });
  it("uses a backdrop gradient's first stop as the background", () => {
    const bg = {
      fill: {
        type: "linear" as const,
        from: { x: 0, y: 0 },
        to: { x: 0, y: 1 },
        stops: [
          { offset: 0, color: "#0f172a" },
          { offset: 1, color: "#1e293b" },
        ],
      },
    };
    // white text on a dark backdrop → high contrast → no finding
    expect(auditScene(scene([{ id: "t", type: "text", x: 0, y: 0, text: "x", fontSize: 16, fill: "#ffffff" }], bg)).findings).toHaveLength(
      0,
    );
  });
});
