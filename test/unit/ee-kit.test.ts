import { describe, expect, it } from "vitest";
import { validateScene } from "../../src/index.js";
import { bodePane, eeLesson, equationPane, rcLowpass, scopePane, logSweep } from "../../src/lessons/ee/kit.js";

/** Every polyline in a subtree with its transformed points. */
function polylines(node: any, ox = 0, oy = 0, out: Array<{ id: string; pts: Array<{ x: number; y: number }> }> = []) {
  const x = ox + (node?.x ?? 0);
  const y = oy + (node?.y ?? 0);
  if (node?.type === "polyline" && Array.isArray(node.points))
    out.push({ id: String(node.id), pts: node.points.map((p: any) => ({ x: x + p.x, y: y + p.y })) });
  (node?.children ?? []).forEach((c: any) => polylines(c, x, y, out));
  return out;
}

describe("rcLowpass transfer function", () => {
  const T = rcLowpass(1000, 100e-9); // R = 1 kΩ, C = 100 nF → ω0 = 10^4 rad/s
  it("is unity at DC and falls 3.01 dB with -45° at the corner", () => {
    expect(T.dB(1e-3)).toBeCloseTo(0, 3);
    expect(T.dB(T.omega0)).toBeCloseTo(-3.0103, 3);
    expect(T.phaseDeg(T.omega0)).toBeCloseTo(-45, 6);
  });
  it("rolls off 20 dB per decade well above the corner", () => {
    expect(T.dB(T.omega0 * 100) - T.dB(T.omega0 * 1000)).toBeCloseTo(20, 1);
  });
});

describe("logSweep", () => {
  it("covers exactly the requested decades over the window", () => {
    const s = logSweep({ omega0: 1e4, fromDecade: -1, toDecade: 1, duration: 6 });
    expect(s.omega(0)).toBeCloseTo(1e3, 6);
    expect(s.omega(6)).toBeCloseTo(1e5, 6);
    expect(s.omega(3)).toBeCloseTo(1e4, 6);
  });
  it("accumulates phase as the integral of ω, so the chirp is continuous", () => {
    const s = logSweep({ omega0: 1e4, fromDecade: -1, toDecade: 1, duration: 6 });
    // Numerical integral of ω over [0, 2] must match the closed form.
    let acc = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) acc += s.omega(((i + 0.5) * 2) / n) * (2 / n);
    expect(s.phase(2)).toBeCloseTo(acc, 1);
  });
});

describe("bodePane", () => {
  const T = rcLowpass(1000, 100e-9);
  const sweep = logSweep({ omega0: T.omega0, fromDecade: -1.5, toDecade: 1.5, duration: 6 });
  const pane = bodePane({ id: "b", x: 0, y: 0, width: 400, height: 260, transfer: T, sweep, start: 1, duration: 6 });

  it("draws a magnitude curve that passes through the -3 dB point at the corner", () => {
    // Exact id: the plane's own gridlines also carry "mag" in theirs.
    const mag = polylines(pane.node).find((p) => p.id === "b-mag-curve")!;
    expect(mag).toBeDefined();
    // The corner (x = 0 decades) maps to the plane's mid-x; find the closest sample.
    const cornerX = pane.toX(0);
    const nearest = mag.pts.reduce((a, b) => (Math.abs(b.x - cornerX) < Math.abs(a.x - cornerX) ? b : a));
    expect(Math.abs(pane.fromY(nearest.y) - -3.0103)).toBeLessThan(0.25);
  });

  it("places the operating-point dot at the corner exactly halfway through the sweep", () => {
    const at = pane.dotAt(1 + 3); // sweep is symmetric: decade 0 at the midpoint
    expect(at.decade).toBeCloseTo(0, 6);
    expect(at.dB).toBeCloseTo(-3.0103, 3);
  });
});

describe("scopePane", () => {
  const T = rcLowpass(1000, 100e-9);
  const sweep = logSweep({ omega0: T.omega0, fromDecade: -1, toDecade: 1, duration: 6 });
  it("drives the output from the input through |T| and ∠T at every instant", () => {
    const pane = scopePane({ id: "s", x: 0, y: 0, width: 500, height: 260, sweep, transfer: T, amplitude: 1, start: 1, duration: 6 });
    // The scope's timebase is scaled to fit the screen, so assert the PHYSICS -- gain and
    // phase shift relative to whatever the drawn input phase is -- not the raw integral.
    for (const t of [0.5, 2, 3, 4.5, 5.9]) {
      const w = sweep.omega(t);
      const phi = pane.inputPhase(t);
      expect(pane.input(t)).toBeCloseTo(Math.sin(phi), 9);
      expect(pane.output(t)).toBeCloseTo(T.mag(w) * Math.sin(phi + T.phaseRad(w)), 9);
    }
    // And the drawn frequency must still rise with the real one: the chirp is monotone.
    expect(pane.inputPhase(4) - pane.inputPhase(3)).toBeGreaterThan(pane.inputPhase(1) - pane.inputPhase(0));
  });

  it("keeps the chirp well below the drawn polyline's Nyquist limit", () => {
    const pane = scopePane({ id: "s", x: 0, y: 0, width: 500, height: 260, sweep, transfer: T, amplitude: 1, start: 1, duration: 6 });
    // At least 6 drawn samples per cycle at the highest frequency in the window.
    expect(pane.samplesPerCycleAtTop).toBeGreaterThanOrEqual(6);
  });
});

describe("equationPane", () => {
  it("fades in at the beat it belongs to", () => {
    const eq = equationPane({ id: "e", latex: "T(s)=\\frac{1}{1+sRC}", x: 10, y: 10, at: 2.5 });
    const tracks = (eq.node as any).tracks ?? [];
    const op = tracks.find((t: any) => t.property === "opacity");
    expect(op).toBeDefined();
    expect(op.keyframes[0].t).toBeCloseTo(2.5, 6);
  });
});

describe("eeLesson", () => {
  const lesson = () =>
    eeLesson({
      title: "Test lesson",
      beats: [
        {
          at: 0.5,
          dur: 2,
          say: "First we look at the circuit.",
          nodes: [{ id: "a", type: "rect", x: 10, y: 10, width: 20, height: 20, fill: "#000" }],
        },
        { at: 3, dur: 2, say: "Then the waveform.", nodes: [{ id: "b", type: "rect", x: 40, y: 10, width: 20, height: 20, fill: "#000" }] },
      ],
    });

  it("produces a valid, deterministic scene", () => {
    const a = lesson();
    expect(validateScene(a).errors).toEqual([]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(lesson()));
    expect(a.width).toBe(1280);
    expect(a.height).toBe(720);
  });

  it("narrates each beat at its start, with no overlap", () => {
    const segs = lesson().narration!.segments!;
    expect(segs.map((s) => s.text)).toEqual(["First we look at the circuit.", "Then the waveform."]);
    for (let i = 0; i + 1 < segs.length; i++) {
      expect(segs[i]!.t + (segs[i]!.duration ?? 0)).toBeLessThanOrEqual(segs[i + 1]!.t + 1e-9);
    }
  });

  it("runs long enough for the last beat to finish", () => {
    const a = lesson();
    expect(a.duration).toBeGreaterThanOrEqual(5);
  });
});

describe("scopePaneRaw", () => {
  it("draws any traces on stacked planes sharing one time axis", async () => {
    const { scopePaneRaw } = await import("../../src/lessons/ee/kit.js");
    const pane = scopePaneRaw({
      id: "r",
      x: 0,
      y: 0,
      width: 400,
      height: 200,
      tMax: 4,
      planes: [
        {
          label: "v",
          yMin: -1,
          yMax: 1,
          yTicks: [-1, 0, 1],
          traces: [{ id: "sin", fn: (t) => Math.sin(t), start: 1, duration: 2, marker: true }],
        },
        { label: "i", yMin: -1, yMax: 1, yTicks: [-1, 0, 1], traces: [{ id: "cos", fn: (t) => Math.cos(t) }] },
      ],
    });
    expect(pane.planes).toHaveLength(2);
    const ids = JSON.stringify(pane.node).match(/"id":"r-[a-z-]+"/g)!;
    expect(ids.some((s) => s.includes("r-sin-dot"))).toBe(true);
    expect(ids.some((s) => s.includes("r-cos"))).toBe(true);
  });
});

describe("bodePaneMulti", () => {
  it("overlays a lowpass and a highpass that meet at -3 dB at the corner", async () => {
    const { bodePaneMulti, rcHighpass } = await import("../../src/lessons/ee/kit.js");
    const lp = rcLowpass(1000, 100e-9);
    const hp = rcHighpass(1000, 100e-9);
    const sweep = logSweep({ omega0: lp.omega0, fromDecade: -1, toDecade: 1, duration: 6 });
    const pane = bodePaneMulti({
      id: "m",
      x: 0,
      y: 0,
      width: 400,
      height: 260,
      transfers: [
        { transfer: lp, label: "lowpass" },
        { transfer: hp, label: "highpass" },
      ],
      sweep,
      start: 0,
      duration: 6,
    });
    expect(pane.dotAt(0, 3).dB).toBeCloseTo(-3.0103, 3);
    expect(pane.dotAt(1, 3).dB).toBeCloseTo(-3.0103, 3);
    expect(pane.dotAt(0, 3).phaseDeg).toBeCloseTo(-45, 6);
    expect(pane.dotAt(1, 3).phaseDeg).toBeCloseTo(45, 6);
  });
});

describe("transferCurvePane", () => {
  it("tracks the operating point through a clipping characteristic", async () => {
    const { transferCurvePane } = await import("../../src/lessons/ee/kit.js");
    const clip = (v: number) => Math.max(-1, Math.min(1, 3 * v));
    const pane = transferCurvePane({
      id: "tc",
      x: 0,
      y: 0,
      width: 240,
      height: 240,
      fn: clip,
      vMax: 1.2,
      drive: (t) => Math.sin(t),
      tMax: Math.PI,
      start: 2,
      duration: 3,
    });
    expect(pane.at(2).vout).toBeCloseTo(0, 9);
    expect(pane.at(2 + Math.PI / 2).vout).toBe(1); // clipped at the rail
    expect(pane.at(2 + Math.PI / 2).vin).toBeCloseTo(1, 9);
  });
});

describe("sPlanePane", () => {
  it("draws a pole as a cross and slides it left when asked", async () => {
    const { sPlanePane } = await import("../../src/lessons/ee/kit.js");
    const pane = sPlanePane({
      id: "sp",
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      sigmaMin: -10,
      poles: [{ id: "p1", sigma: -2, omega: 0, label: "-1/τ", moveTo: { sigma: -6, at: 3, dur: 1.5 } }],
    });
    const pole: any = (pane.node.children as any[]).find((n) => n.id === "sp-p1");
    expect(pole).toBeDefined();
    const track = pole.tracks.find((t: any) => t.property === "x");
    expect(track.keyframes[0].t).toBe(3);
    expect(track.keyframes[1].t).toBe(4.5);
    // Further left on the plane is a smaller x.
    expect(track.keyframes[1].value).toBeLessThan(track.keyframes[0].value);
    expect(pane.poleX(-6)).toBeLessThan(pane.poleX(-2));
  });
});

describe("phasorPane", () => {
  it("rotates counter-clockwise by ω·t, which is a negative canvas rotation", async () => {
    const { phasorPane } = await import("../../src/lessons/ee/kit.js");
    const pane = phasorPane({ id: "ph", cx: 100, cy: 100, radius: 60, omega: Math.PI, start: 1, duration: 2 });
    const arrow: any = (pane.node.children as any[]).find((n) => n.id === "ph-arrow");
    const rot = arrow.tracks.find((t: any) => t.property === "rotation");
    expect(rot.keyframes[1].value).toBeCloseTo(-360, 6);
    expect(pane.angleAt(2)).toBeCloseTo(Math.PI, 9);
  });
});
