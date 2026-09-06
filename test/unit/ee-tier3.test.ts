import { describe, expect, it } from "vitest";
import { createDefaultRegistry, validateScene } from "../../src/index.js";
import type { SceneSpec } from "../../src/index.js";
import { checkConductorConnectivity } from "../../src/authoring/connectivity.js";
import { selectEeLesson } from "../../src/authoring/lessonRouting.js";
import { TIER3_PHRASES } from "../../src/lessons/ee/phrases.tier3.js";
import { invertingStage } from "../../src/lessons/ee/opAmpSchematics.js";
import { supplyRails } from "../../src/lessons/ee/realOpAmpSchematics.js";
import { SATURATION, buildSaturation, saturationModel } from "../../src/lessons/ee/saturation.js";
import { SLEW, buildSlewRate, slewCase } from "../../src/lessons/ee/slewRate.js";
import { GAIN_BW, buildGainBandwidth, closedLoop, openLoop } from "../../src/lessons/ee/gainBandwidth.js";

const find = (n: any, id: string): any => (n?.id === id ? n : (n?.children ?? []).map((c: any) => find(c, id)).find(Boolean));
const all = (n: any, out: any[] = []): any[] => {
  out.push(n);
  (n?.children ?? []).forEach((c: any) => all(c, out));
  return out;
};
const root = (s: SceneSpec) => ({ children: s.nodes });
const valueTrackOf = (n: any) => n.tracks.find((t: any) => t.property === "value").keyframes;
/** Local y of a trace polyline, in the plane's own pixels (screen-down). */
const ys = (n: any): number[] => n.points.map((p: any) => p.y);
const span = (v: number[]) => Math.max(...v) - Math.min(...v);
const texts = (s: SceneSpec) =>
  all(root(s))
    .filter((n) => n?.type === "text")
    .map((n) => String(n.text))
    .join(" ");

/** What every lesson must satisfy. Copied from the Tier 2 harness, which is the contract. */
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
    it("never emits an empty text node", () => {
      for (const n of all(root(lesson))) if (n?.type === "text") expect(String(n.text).length, n.id).toBeGreaterThan(0);
    });
    it("is reachable through the catalog as a scene-level tool", () => {
      const reg = createDefaultRegistry();
      expect(reg.get(name)?.level).toBe("scene");
      expect(validateScene(reg.invokeScene(name, {})).errors).toEqual([]);
    });
  });
}

isLesson("ee.saturation", () => buildSaturation(), [
  "sat-sch",
  "sat-rails",
  "sat-scope",
  "sat-vtc",
  "sat-eq-clip",
  "sat-ctr-vin",
  "sat-ctr-vout",
]);
isLesson("ee.slewRate", () => buildSlewRate(), ["sr-sch", "sr-rails", "sr-scope", "sr-fpb", "sr-eq-sr", "sr-ctr-need", "sr-ctr-act"]);
isLesson("ee.gainBandwidth", () => buildGainBandwidth(), [
  "gb-sch",
  "gb-scope",
  "gb-bode",
  "gb-eq-open",
  "gb-ctr-g",
  "gb-ctr-bw",
  "gb-ctr-gbw",
]);

/* ------------------------------------------------------ schematic contract */

const asScene = (nodes: unknown[]): unknown => ({ width: 1280, height: 720, nodes });

describe("realOpAmpSchematics — supply rails on a Tier 2 stage", () => {
  const stage = invertingStage({ id: "s", x: 120, y: 140 });
  const rails = supplyRails({ id: "s-rails", stage });

  it("keeps the railed stage a connected circuit", () => {
    const check = checkConductorConnectivity(asScene([stage.node, rails.node]));
    expect(check.status, JSON.stringify(check.stranded)).toBe("passed");
    expect(check.conductors).toBeGreaterThanOrEqual(6);
  });
  it("does not disturb the stage it decorates", () => {
    const bare = checkConductorConnectivity(asScene([stage.node]));
    expect(bare.status).toBe("passed");
  });
  it("puts the two rail terminals above and below the op-amp body", () => {
    const { x, y, size } = stage.opAmp;
    expect(rails.points.pos.y).toBeLessThan(y);
    expect(rails.points.neg.y).toBeGreaterThan(y + size);
    for (const p of [rails.points.pos, rails.points.neg]) {
      expect(p.x).toBeGreaterThan(x);
      expect(p.x).toBeLessThan(x + size);
    }
  });
});

/* --------------------------------------------------------------- routing */

describe("Tier 3 routing", () => {
  const pick = (brief: string) => selectEeLesson({ brief } as any)?.name ?? null;
  it("sends each lesson's own topic to that lesson", () => {
    expect(pick("what is the slew rate of an op amp")).toBe("ee.slewRate");
    expect(pick("explain op amp saturation")).toBe("ee.saturation");
    expect(pick("show the gain bandwidth product")).toBe("ee.gainBandwidth");
    expect(pick("what is the unity gain frequency")).toBe("ee.gainBandwidth");
    expect(pick("why does the output clip at the rails")).toBe("ee.saturation");
    expect(pick("explain the full power bandwidth")).toBe("ee.slewRate");
  });
  it("lets a longer Tier 3 topic beat the shorter phrase another tier owns", () => {
    // "clipping" is ee.transferCharacteristic's; it is a fragment of this one, so it does
    // not cancel, and the more specific lesson wins.
    expect(pick("show the clipping at the rails")).toBe("ee.saturation");
    // "pole" is ee.polesStepResponse's, for the same reason.
    expect(pick("what is the dominant pole of an op amp")).toBe("ee.gainBandwidth");
    expect(pick("op amp slew rate limiting")).toBe("ee.slewRate");
  });
  it("claims no phrase another tier already owns", () => {
    const mine = new Set(TIER3_PHRASES.flatMap((l) => l.phrases));
    for (const p of ["op amp", "operational amplifier", "amplifier", "open loop gain", "negative feedback", "clipping", "pole"])
      expect([...mine]).not.toContain(p);
  });
  it("registers every phrase against a lesson that exists", () => {
    const reg = createDefaultRegistry();
    for (const l of TIER3_PHRASES) expect(reg.get(l.name)?.level, l.name).toBe("scene");
  });
});

/* --------------------------------------------------------------- physics */

describe("ee.saturation physics", () => {
  const m = saturationModel();
  const lesson = buildSaturation();

  it("clips the output at V_sat and nowhere else", () => {
    for (let i = 0; i <= 4000; i++) {
      const t = (i / 4000) * m.scopeT;
      const ideal = m.gain * m.vin(t);
      const out = m.vout(t);
      expect(Math.abs(out)).toBeLessThanOrEqual(m.vSat + 1e-9);
      if (Math.abs(ideal) <= m.vSat) expect(out).toBeCloseTo(ideal, 9);
      else expect(out).toBeCloseTo(Math.sign(ideal) * m.vSat, 9);
    }
  });

  it("tracks V_out peak at |G| times V_in peak until the rail, then holds", () => {
    const vinKf = valueTrackOf(find(root(lesson), "sat-ctr-vin"));
    const voutKf = valueTrackOf(find(root(lesson), "sat-ctr-vout"));
    expect(vinKf.length).toBe(voutKf.length);
    let tracked = 0;
    let held = 0;
    for (let i = 0; i < vinKf.length; i++) {
      const vin = vinKf[i]!.value;
      const vout = voutKf[i]!.value;
      if (Math.abs(m.gain) * vin < m.vSat - 0.05) {
        expect(vout).toBeCloseTo(Math.abs(m.gain) * vin, 1);
        tracked++;
      } else if (Math.abs(m.gain) * vin > m.vSat + 0.05) {
        expect(vout).toBeCloseTo(m.vSat, 6);
        held++;
      }
    }
    expect(tracked).toBeGreaterThan(4);
    expect(held).toBeGreaterThan(4);
    // The input peak keeps climbing the whole time; only the output stops.
    expect(vinKf.at(-1)!.value).toBeGreaterThan(vinKf[0]!.value * 2);
  });

  it("draws an output whose peaks are flat-topped and never leave the rails", () => {
    const frame = find(root(lesson), "sat-scope-p1-frame");
    const out = ys(find(root(lesson), "sat-scope-out"));
    const top = Math.min(...out);
    const bottom = Math.max(...out);
    // Screen-down pixels; the extremes are the two rails, and many samples sit on each.
    const flatTop = out.filter((y) => y < top + 0.5).length;
    const flatBottom = out.filter((y) => y > bottom - 0.5).length;
    expect(flatTop).toBeGreaterThan(20);
    expect(flatBottom).toBeGreaterThan(20);
    // Height of the drawn swing, in volts: exactly 2 V_sat, not 2|G|V_max.
    const volts = (span(out) / frame.height) * 2 * SATURATION.vOutAxis;
    expect(volts).toBeCloseTo(2 * m.vSat, 1);
    expect(volts).toBeLessThan(2 * Math.abs(m.gain) * SATURATION.vTo);
  });

  it("bends the transfer line at the rail and leaves it flat beyond", () => {
    const pts = find(root(lesson), "sat-vtc-line").points as Array<{ x: number; y: number }>;
    const top = Math.min(...pts.map((p) => p.y));
    const bottom = Math.max(...pts.map((p) => p.y));
    const onRail = pts.filter((p) => p.y < top + 0.5 || p.y > bottom - 0.5);
    expect(onRail.length).toBeGreaterThan(0.2 * pts.length);
    // Between the rails it is a straight line: constant slope over the linear stretch.
    const linear = pts.filter((p) => p.y > top + 2 && p.y < bottom - 2);
    expect(linear.length).toBeGreaterThan(10);
    const slopes: number[] = [];
    for (let i = 1; i < linear.length; i++) slopes.push((linear[i]!.y - linear[i - 1]!.y) / (linear[i]!.x - linear[i - 1]!.x));
    const mean = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    for (const s of slopes) expect(Math.abs(s - mean)).toBeLessThan(0.02 * Math.abs(mean));
    expect(mean).toBeGreaterThan(0); // screen-down: a negative gain
  });

  it("names the rails and the saturation voltage in what it draws", () => {
    const t = texts(lesson);
    expect(t).toContain(`${SATURATION.vSupply} V`);
    expect(t).toContain(`${SATURATION.vSat} V`);
  });
});

describe("ee.slewRate physics", () => {
  const lesson = buildSlewRate();

  it("never lets the modelled output move faster than the slew rate", () => {
    for (const f of SLEW.freqs) {
      const c = slewCase(f);
      const n = 6000;
      let worst = 0;
      for (let i = 1; i <= n; i++) {
        const t0 = ((i - 1) / n) * c.window;
        const t1 = (i / n) * c.window;
        worst = Math.max(worst, Math.abs(c.out(t1) - c.out(t0)) / (t1 - t0));
      }
      expect(worst, `${f} Hz`).toBeLessThanOrEqual(SLEW.SR * (1 + 1e-6));
      // And it does use the whole of it once the edge is the limit.
      expect(worst).toBeGreaterThan(0.9 * Math.min(SLEW.SR, c.needed));
    }
  });

  it("degrades square, then trapezoid, then triangle as the frequency rises", () => {
    const [low, mid, high] = SLEW.freqs.map((f) => slewCase(f));
    // Peak-to-peak is the full swing until the half period is shorter than the ramp.
    expect(low!.pp).toBeCloseTo(2 * SLEW.Vp, 1);
    expect(mid!.pp).toBeCloseTo(2 * SLEW.Vp, 1);
    expect(high!.pp).toBeCloseTo((SLEW.SR * high!.period) / 2, 1);
    expect(high!.pp).toBeLessThan(2 * SLEW.Vp * 0.7);
    // Fraction of the half period spent ramping: 4%, 40%, then everything.
    const ramp = (c: ReturnType<typeof slewCase>) => Math.min(1, (2 * SLEW.Vp) / SLEW.SR / (c.period / 2));
    expect(ramp(low!)).toBeLessThan(0.1);
    expect(ramp(mid!)).toBeGreaterThan(0.3);
    expect(ramp(mid!)).toBeLessThan(0.6);
    expect(ramp(high!)).toBe(1);
  });

  it("reads the demanded slope and the achieved slope, which part company at the top frequency", () => {
    const need = valueTrackOf(find(root(lesson), "sr-ctr-need")).map((k: any) => k.value);
    const act = valueTrackOf(find(root(lesson), "sr-ctr-act")).map((k: any) => k.value);
    const held = (v: number[]) => v.filter((x, i) => i === 0 || x !== v[i - 1]);
    const needLevels = held(need);
    const actLevels = held(act);
    expect(needLevels.length).toBe(SLEW.freqs.length);
    expect(actLevels.length).toBe(SLEW.freqs.length);
    const perUs = SLEW.SR / 1e6;
    SLEW.freqs.forEach((f, i) => {
      const demanded = (4 * SLEW.Vp * f) / 1e6;
      expect(needLevels[i]).toBeCloseTo(demanded, 6);
      expect(actLevels[i]).toBeCloseTo(Math.min(demanded, perUs), 6);
    });
    expect(needLevels.at(-1)).toBeGreaterThan(actLevels.at(-1)!);
    expect(actLevels.at(-1)).toBeCloseTo(perUs, 9);
  });

  it("draws the top frequency at half the swing of the lowest", () => {
    const low = ys(find(root(lesson), "sr-scope-out0"));
    const high = ys(find(root(lesson), "sr-scope-out2"));
    expect(span(high) / span(low)).toBeCloseTo(0.5, 1);
  });

  it("names its device and its full-power bandwidth", () => {
    const t = texts(lesson);
    expect(t).toContain(SLEW.device);
    const fMax = SLEW.SR / (2 * Math.PI * SLEW.Vp) / 1e3;
    expect(t).toContain(fMax.toFixed(1));
  });
});

describe("ee.gainBandwidth physics", () => {
  const lesson = buildGainBandwidth();
  const gbwHz = GAIN_BW.A0 * GAIN_BW.fp;

  it("gives the open-loop gain one pole and a unity-gain frequency at the GBW", () => {
    const A = openLoop();
    expect(A.mag(1e-6)).toBeCloseTo(GAIN_BW.A0, 0);
    expect(A.omega0 / (2 * Math.PI)).toBeCloseTo(GAIN_BW.fp, 6);
    expect(A.dB(A.omega0)).toBeCloseTo(A.dB(1e-6) - 3.0103, 3);
    // A single pole: −20 dB per decade above it, and |A| = 1 at the GBW.
    const w = 2 * Math.PI * 1e4;
    expect(A.dB(10 * w) - A.dB(w)).toBeCloseTo(-20, 1);
    expect(A.mag(2 * Math.PI * gbwHz)).toBeCloseTo(1, 2);
  });

  it("keeps gain times bandwidth constant across all three closed-loop stages", () => {
    for (const G of GAIN_BW.gains) {
      const T = closedLoop(G);
      const bw = T.omega0 / (2 * Math.PI);
      const dc = T.mag(1e-9);
      expect(dc).toBeCloseTo(G, Math.max(0, 3 - String(G).length));
      expect(Math.abs(dc * bw - gbwHz) / gbwHz, `G = ${G}`).toBeLessThan(0.01);
      // It really is the −3 dB point.
      expect(T.dB(T.omega0)).toBeCloseTo(T.dB(1e-9) - 3.0103, 3);
    }
  });

  it("orders the three bandwidths a decade apart, in the opposite order to the gains", () => {
    const bws = GAIN_BW.gains.map((G) => closedLoop(G).omega0 / (2 * Math.PI));
    expect(bws[1]! / bws[0]!).toBeCloseTo(10, 0);
    expect(bws[2]! / bws[1]!).toBeCloseTo(10, 0);
    // The lesson walks the gains downward, so the bandwidths walk upward.
    expect(GAIN_BW.gains[0]).toBeGreaterThan(GAIN_BW.gains[2]!);
    expect(bws[0]!).toBeLessThan(bws[2]!);
  });

  it("reads the same gain-bandwidth product whichever gain is on screen", () => {
    const g = valueTrackOf(find(root(lesson), "gb-ctr-g")).map((k: any) => k.value);
    const bw = valueTrackOf(find(root(lesson), "gb-ctr-bw")).map((k: any) => k.value);
    const prod = valueTrackOf(find(root(lesson), "gb-ctr-gbw")).map((k: any) => k.value);
    const held = (v: number[]) => v.filter((x, i) => i === 0 || x !== v[i - 1]);
    expect(held(g).length).toBe(3);
    expect(held(bw).length).toBe(3);
    // The product counter never moves: that is the whole lesson.
    expect(held(prod).length).toBe(1);
    held(g).forEach((gain, i) => {
      // bandwidth counter is in kHz, product in MHz.
      expect((gain * held(bw)[i]! * 1e3) / 1e6).toBeCloseTo(held(prod)[0]!, 1);
    });
    expect(held(prod)[0]).toBeCloseTo(gbwHz / 1e6, 2);
  });

  it("puts every closed-loop curve under the open-loop one and flat below its own corner", () => {
    const A = openLoop();
    for (const G of GAIN_BW.gains) {
      const T = closedLoop(G);
      for (const f of [1, 10, 100, 1e3, 1e4, 1e5, 1e6]) {
        const w = 2 * Math.PI * f;
        expect(T.dB(w), `G=${G} at ${f} Hz`).toBeLessThanOrEqual(A.dB(w) + 1e-6);
      }
      // Flat a decade below its corner, riding the open-loop line a decade above it.
      const wc = T.omega0;
      expect(T.dB(wc / 10)).toBeCloseTo(T.dB(1e-9), 1);
      expect(T.dB(10 * wc)).toBeCloseTo(A.dB(10 * wc), 0);
    }
  });

  it("shrinks the highest-gain stage's output first as the frequency rises", () => {
    // Each plane carries the same input amplitude; the normalised outputs are drawn on one
    // axis, so the stage that quits earliest is the one with the most gain.
    const swings = GAIN_BW.gains.map((_, i) => span(ys(find(root(lesson), `gb-scope-out${i}`))));
    // The gains are drawn largest first, so the top plane is the one that quits earliest.
    expect(swings[0]!).toBeLessThan(swings.at(-1)!);
  });
});
