import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { checkConductorConnectivity } from "../../src/authoring/connectivity.js";
import { buildDiodeIV, SILICON, V_CVD, diodeCurrent, diodeVoltage, seriesDiode } from "../../src/lessons/ee/diodeIV.js";
import { buildHalfWaveRectifier, halfWaveWaveforms } from "../../src/lessons/ee/halfWaveRectifier.js";
import { buildFullWaveAndSmoothing, fullWaveWaveforms } from "../../src/lessons/ee/fullWaveAndSmoothing.js";
import { diodeTestSchematic, halfWaveSchematic, bridgeSchematic } from "../../src/lessons/ee/diodeSchematics.js";
import type { Node } from "../../src/spec/types.js";

const find = (n: any, id: string): any => (n?.id === id ? n : (n?.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const all = (n: any, out: any[] = []): any[] => {
  out.push(n);
  (n?.children ?? []).forEach((c: any) => all(c, out));
  return out;
};
const root = (s: SceneSpec) => ({ children: s.nodes });

/** Read an animated property off a node at lesson time `t`, the way the engine would. */
function trackValue(node: any, property: string, t: number): number {
  const track = (node.tracks ?? []).find((k: any) => k.property === property);
  if (!track) return node[property];
  const kf = track.keyframes;
  if (t <= kf[0].t) return kf[0].value;
  if (t >= kf[kf.length - 1].t) return kf[kf.length - 1].value;
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i].t) {
      const a = kf[i - 1];
      const b = kf[i];
      const u = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return a.value + (b.value - a.value) * u;
    }
  }
  return kf[kf.length - 1].value;
}

/** A scene carrying only the schematic, so connectivity judges the wiring and nothing else. */
function schematicScene(node: Node): SceneSpec {
  return {
    specVersion: 1,
    width: 1280,
    height: 720,
    fps: 30,
    duration: 5,
    seed: 0,
    background: "#ffffff",
    nodes: [node],
  } as SceneSpec;
}

/** What every lesson must satisfy. */
function isLesson(name: string, build: () => SceneSpec, views: string[]) {
  describe(name, () => {
    const lesson = build();
    it("is a valid, deterministic 1280×720 scene of sensible length", () => {
      expect(validateScene(lesson).errors).toEqual([]);
      expect(JSON.stringify(build())).toBe(JSON.stringify(lesson));
      expect(lesson.width).toBe(1280);
      expect(lesson.height).toBe(720);
      expect(lesson.duration).toBeGreaterThan(15);
      expect(lesson.duration).toBeLessThan(90);
    });
    it("shows every view it promises", () => {
      for (const id of views) expect(find(root(lesson), id), `missing ${id}`).toBeDefined();
    });
    it("narrates every beat without overlap", () => {
      const segs = lesson.narration!.segments!;
      expect(segs.length).toBeGreaterThanOrEqual(4);
      for (let i = 0; i + 1 < segs.length; i++) expect(segs[i]!.t + (segs[i]!.duration ?? 0)).toBeLessThanOrEqual(segs[i + 1]!.t + 1e-9);
    });
    it("is reachable through the catalog as a scene-level tool", () => {
      const reg = createDefaultRegistry();
      expect(reg.get(name)?.level).toBe("scene");
      expect(validateScene(reg.invokeScene(name, {})).errors).toEqual([]);
    });
    it("never emits an empty text node", () => {
      for (const n of all(root(lesson))) if (n?.type === "text") expect(String(n.text).trim().length, n.id).toBeGreaterThan(0);
    });
    it("draws every equation it lays out", () => {
      // KaTeX constructs this renderer cannot flatten (\dfrac, \begin{cases}) come back as
      // an empty group: laid out, timed, narrated, and invisible. Both were shipped once.
      const eqs = all(root(lesson)).filter((n) => String(n?.id).includes("-eq-") && !/-g\d+$/.test(String(n?.id)));
      expect(eqs.length).toBeGreaterThan(0);
      for (const eq of eqs) {
        const drawn = all(eq).filter((n) => n?.type && n.type !== "group");
        expect(drawn.length, `${eq.id} rendered nothing`).toBeGreaterThan(0);
      }
    });
  });
}

isLesson("ee.diodeIV", () => buildDiodeIV(), ["dv-sch", "dv-scope", "dv-iv", "dv-eq-shockley", "dv-eq-cvd"]);
isLesson("ee.halfWaveRectifier", () => buildHalfWaveRectifier(), ["hw-sch", "hw-scope", "hw-iv", "hw-eq-rule"]);
isLesson("ee.fullWaveAndSmoothing", () => buildFullWaveAndSmoothing(), ["fw-sch", "fw-scope", "fw-vtc", "fw-eq-bridge", "fw-eq-ripple"]);

/* ------------------------------------------------------------ the model */

describe("the diode model the tier is built on", () => {
  it("puts the knee at 0.7 V and one milliamp", () => {
    const i = diodeCurrent(V_CVD);
    expect(i).toBeGreaterThan(0.9e-3);
    expect(i).toBeLessThan(1.1e-3);
  });
  it("saturates at -I_S in reverse and is negligible there", () => {
    expect(diodeCurrent(-5)).toBeCloseTo(-SILICON.IS, 15);
    expect(Math.abs(diodeCurrent(-5))).toBeLessThan(1e-9);
  });
  it("climbs about a decade of current per n·V_T·ln10 of voltage", () => {
    const perDecade = SILICON.n * SILICON.VT * Math.LN10;
    expect(perDecade).toBeGreaterThan(0.1);
    expect(perDecade).toBeLessThan(0.115);
    expect(diodeCurrent(V_CVD + perDecade) / diodeCurrent(V_CVD)).toBeCloseTo(10, 1);
  });
  it("inverts itself: v(i(v)) = v", () => {
    for (const v of [0.3, 0.5, 0.65, 0.7, 0.8]) expect(diodeVoltage(diodeCurrent(v))).toBeCloseTo(v, 9);
  });
  it("solves the series loop so that v_D + i·R = v_S", () => {
    for (const vs of [-5, -0.5, 0, 0.5, 1, 3, 5]) {
      const { v, i } = seriesDiode(vs, 1000);
      expect(v + i * 1000, `v_S = ${vs}`).toBeCloseTo(vs, 6);
      expect(i).toBeCloseTo(diodeCurrent(v), 12);
    }
  });
});

/* ------------------------------------------------------------- ee.diodeIV */

describe("ee.diodeIV physics", () => {
  const lesson = buildDiodeIV();
  it("reads the current the model predicts at the end of the sweep", () => {
    const ctr = find(root(lesson), "dv-ctr-i");
    const track = ctr.tracks.find((t: any) => t.property === "value");
    const last = track.keyframes.at(-1);
    // The counter reads milliamps; the sweep ends at the top of the voltage range.
    expect(last.value).toBeCloseTo(diodeCurrent(0.8) * 1e3, 1);
  });
  it("reads sub-nanoamp reverse current before it reads milliamps", () => {
    const nano = find(root(lesson), "dv-ctr-i-na");
    const track = nano.tracks.find((t: any) => t.property === "value");
    expect(track.keyframes[0].value).toBeCloseTo(-SILICON.IS * 1e9, 6);
    expect(nano.suffix).toBe(" nA");
    expect(find(root(lesson), "dv-ctr-i").suffix).toBe(" mA");
  });
  it("draws the constant-voltage-drop model as a vertical wall at 0.7 V", () => {
    const cvd = find(root(lesson), "dv-iv-cvd");
    const plane = find(root(lesson), "dv-iv-plane");
    expect(cvd).toBeDefined();
    expect(plane).toBeDefined();
    // Its last two points share an x: a vertical segment, which no function of v could draw.
    const pts = cvd.points;
    expect(pts.at(-1).x).toBeCloseTo(pts.at(-2).x, 6);
    expect(pts.at(-1).y).toBeLessThan(pts.at(-2).y); // upward on screen
    // and it arrives after the exponential, as the approximation to it.
    expect(cvd.tracks.find((t: any) => t.property === "opacity").keyframes[0].t).toBeGreaterThan(0);
  });
  it("shows the exponential rising and the dot riding it on one clock", () => {
    const ids = all(root(lesson)).map((n) => String(n?.id));
    for (const id of ["dv-iv-exp", "dv-iv-dot", "dv-scope-p0", "dv-scope-p1"]) expect(ids).toContain(id);
  });
  it("draws the log-current trace across the whole sweep, rising", () => {
    // Handing the scope a function of VOLTAGE where it wants a function of TIME leaves a
    // trace that shoots off the top in the first tenth of the window. It shipped once.
    const width = 600 - 88; // LAYOUT.scope.w, less the pane's margins
    for (const id of ["dv-scope-v", "dv-scope-i"]) {
      const xs = find(root(lesson), id).points.map((p: any) => p.x);
      expect(Math.min(...xs), id).toBeLessThan(2);
      expect(Math.max(...xs), id).toBeGreaterThan(0.95 * width);
    }
    const pts = find(root(lesson), "dv-scope-i").points;
    expect(pts.at(-1).y).toBeLessThan(pts[0].y - 50); // screen y falls as the current climbs
  });
});

describe("the ee.diodeIV schematic", () => {
  it("is a connected circuit", () => {
    const check = checkConductorConnectivity(schematicScene(diodeTestSchematic({ id: "d", x: 60, y: 100 }).node));
    expect(check.stranded, JSON.stringify(check.stranded)).toEqual([]);
    expect(check.status).toBe("passed");
  });
});

/* --------------------------------------------------- ee.halfWaveRectifier */

describe("ee.halfWaveRectifier physics", () => {
  const w = halfWaveWaveforms();
  it("passes v_in minus one diode drop on the positive half", () => {
    for (let k = 1; k < 40; k++) {
      const t = (k / 40) * w.span;
      const vin = w.vin(t);
      if (vin <= V_CVD) continue;
      expect(w.voutModel(t), `t=${t}`).toBeCloseTo(vin - V_CVD, 9);
    }
  });
  it("holds the output at zero through the whole negative half", () => {
    for (let k = 0; k < 200; k++) {
      const t = (k / 200) * w.span;
      if (w.vin(t) >= 0) continue;
      expect(w.voutModel(t)).toBe(0);
      expect(Math.abs(w.vout(t)), `exact at t=${t}`).toBeLessThan(1e-3);
    }
  });
  it("has the exact exponential solution within 90 mV of the 0.7 V model", () => {
    for (let k = 0; k < 200; k++) {
      const t = (k / 200) * w.span;
      if (w.vin(t) < 1) continue;
      expect(Math.abs(w.vout(t) - w.voutModel(t)), `t=${t}`).toBeLessThan(0.09);
    }
  });
  it("conducts only while the diode is forward biased", () => {
    expect(w.windows.length).toBe(w.cycles);
    for (const win of w.windows) {
      expect(w.vin(win.on)).toBeCloseTo(V_CVD, 6);
      expect(w.vin(win.off)).toBeCloseTo(V_CVD, 6);
      expect(w.vin((win.on + win.off) / 2)).toBeGreaterThan(V_CVD);
    }
  });
  it("averages a little under the peak over pi, because the diode is off near the crossings", () => {
    const ideal = (w.Vp - V_CVD) / Math.PI;
    expect(w.average).toBeLessThan(ideal);
    expect(w.average).toBeGreaterThan(0.85 * ideal);
    // The exact mean of (V_p sin θ − 0.7) over the conducting arc, divided by a full period.
    const th1 = Math.asin(V_CVD / w.Vp);
    const exact = (2 * w.Vp * Math.cos(th1) - V_CVD * (Math.PI - 2 * th1)) / (2 * Math.PI);
    expect(w.average).toBeCloseTo(exact, 3);
  });

  const lesson = buildHalfWaveRectifier();
  it("lights the current in the loop only during the conducting arcs", () => {
    const lit = find(root(lesson), "hw-sch-live");
    expect(lit, "the gated conduction overlay").toBeDefined();
    const win = w.windows[1]!;
    expect(trackValue(lit, "opacity", w.start + (win.on + win.off) / 2)).toBeCloseTo(1, 3);
    // A quarter period past the end of the window the input is deep in its negative half.
    expect(trackValue(lit, "opacity", w.start + win.off + w.period / 4)).toBeCloseTo(0, 3);
    expect(trackValue(lit, "opacity", w.start + win.on - w.period / 4)).toBeCloseTo(0, 3);
  });
  it("draws input and output on one time axis and a dot on the i–v curve", () => {
    const ids = all(root(lesson)).map((n) => String(n?.id));
    for (const id of ["hw-scope-in", "hw-scope-out", "hw-scope-model", "hw-iv-exp", "hw-iv-dot"]) expect(ids).toContain(id);
  });
});

describe("the ee.halfWaveRectifier schematic", () => {
  it("is a connected circuit", () => {
    const check = checkConductorConnectivity(schematicScene(halfWaveSchematic({ id: "h", x: 60, y: 100 }).node));
    expect(check.stranded, JSON.stringify(check.stranded)).toEqual([]);
    expect(check.status).toBe("passed");
  });
  it("is still connected with the conduction overlay lit", () => {
    const sch = halfWaveSchematic({ id: "h", x: 60, y: 100, windows: [{ on: 1, off: 2 }] });
    const check = checkConductorConnectivity(schematicScene(sch.node));
    expect(check.stranded, JSON.stringify(check.stranded)).toEqual([]);
  });
});

/* ---------------------------------------------- ee.fullWaveAndSmoothing */

describe("ee.fullWaveAndSmoothing physics", () => {
  const w = fullWaveWaveforms();
  it("delivers the magnitude of the input minus two diode drops", () => {
    for (let k = 0; k < 200; k++) {
      const t = (k / 200) * w.span;
      expect(w.rect(t), `t=${t}`).toBeCloseTo(Math.max(0, Math.abs(w.vin(t)) - 2 * V_CVD), 9);
    }
  });
  it("doubles the output frequency: two humps per input cycle", () => {
    let humps = 0;
    const n = 4000;
    for (let k = 1; k + 1 < n; k++) {
      const [a, b, c] = [w.rect((k - 1) * (w.span / n)), w.rect(k * (w.span / n)), w.rect((k + 1) * (w.span / n))];
      if (b > a! && b >= c!) humps++;
    }
    expect(humps).toBe(2 * w.cycles);
  });
  it("smooths to a ripple of the size I_L/(f C) predicts, a little under it", () => {
    expect(w.ripple).toBeGreaterThan(0);
    expect(w.formulaRipple).toBeCloseTo(w.IL / (w.fRipple * w.C), 9);
    // The estimate assumes the capacitor discharges for the whole half cycle; it really
    // discharges for about seven of the eight milliseconds, so it always runs high.
    expect(w.ripple).toBeLessThan(w.formulaRipple);
    expect(Math.abs(w.ripple - w.formulaRipple) / w.formulaRipple, `measured ${w.ripple} vs formula ${w.formulaRipple}`).toBeLessThan(0.3);
  });
  it("really is an exponential of time constant R_L·C between the peaks", () => {
    // Two instants inside the last discharge, 2.5 ms and 5 ms of real time past the peak.
    // Peaks of the rectified input fall at odd multiples of a quarter period.
    const peakAt = w.span - (3 * w.period) / 4;
    const at = (ms: number) => peakAt + ms / 1000 / w.timeScale;
    const ratio = w.smooth(at(5)) / w.smooth(at(2.5));
    expect(ratio).toBeCloseTo(Math.exp(-0.0025 / w.tau), 6);
  });
  it("decays from each peak with the load time constant, and never below the rectified input", () => {
    for (let k = 0; k < 400; k++) {
      const t = (k / 400) * w.span;
      expect(w.smooth(t) + 1e-9, `t=${t}`).toBeGreaterThanOrEqual(w.rect(t));
    }
    expect(w.tau).toBeCloseTo(w.RL * w.C, 12);
  });
  it("holds the smoothed output near the peak, far above the rectified average", () => {
    const peak = w.Vp - 2 * V_CVD;
    const late = w.span * 0.9;
    expect(w.smooth(late)).toBeGreaterThan(peak - w.ripple - 1e-6);
    expect(w.smooth(late)).toBeLessThan(peak + 1e-6);
  });

  const lesson = buildFullWaveAndSmoothing();
  it("reads the ripple live, peaking at the value the curve shows", () => {
    const ctr = find(root(lesson), "fw-ctr-ripple");
    const track = ctr.tracks.find((t: any) => t.property === "value");
    const peak = Math.max(...track.keyframes.map((k: any) => k.value));
    expect(peak).toBeCloseTo(w.ripple, 1);
    expect(ctr.suffix).toBe(" V");
  });
  it("draws the bridge, both traces, and the transfer characteristic", () => {
    const ids = all(root(lesson)).map((n) => String(n?.id));
    for (const id of ["fw-scope-in", "fw-scope-rect", "fw-scope-smooth", "fw-vtc-rect", "fw-vtc-dot", "fw-vtc-loop"])
      expect(ids).toContain(id);
  });
});

describe("the ee.fullWaveAndSmoothing schematic", () => {
  it("is a connected circuit as a bare bridge", () => {
    const check = checkConductorConnectivity(schematicScene(bridgeSchematic({ id: "b", x: 50, y: 100 }).node));
    expect(check.stranded, JSON.stringify(check.stranded)).toEqual([]);
    expect(check.status).toBe("passed");
  });
  it("is still connected once the smoothing capacitor is across the load", () => {
    const sch = bridgeSchematic({ id: "b", x: 50, y: 100, capAt: 2, cLabel: "C = 47 µF" });
    const check = checkConductorConnectivity(schematicScene(sch.node));
    expect(check.stranded, JSON.stringify(check.stranded)).toEqual([]);
    expect(check.status).toBe("passed");
  });
  it("joins four diodes at four shared nodes", () => {
    const ids = all(root(schematicScene(bridgeSchematic({ id: "b", x: 50, y: 100 }).node))).map((n) => String(n?.id));
    for (const d of ["b-d1", "b-d2", "b-d3", "b-d4"]) expect(ids).toContain(d);
  });
});

/* ---------------------------------------------------------------- routing */

describe("tier 5 registration", () => {
  it("registers all three lessons as scene tools with examples that build", () => {
    const reg = createDefaultRegistry();
    for (const name of ["ee.diodeIV", "ee.halfWaveRectifier", "ee.fullWaveAndSmoothing"]) {
      const tool = reg.get(name);
      expect(tool, name).toBeDefined();
      expect(tool!.level).toBe("scene");
      expect(tool!.keywords!.length).toBeGreaterThan(3);
      expect(validateScene(reg.invokeScene(name, tool!.example ?? {})).errors, name).toEqual([]);
    }
  });
});
