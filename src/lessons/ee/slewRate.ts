/**
 * ee.slewRate — the second place the ideal op-amp stops being true, and a different one.
 *
 * Saturation is about how FAR the output can go. This is about how FAST. Inside the device
 * one compensation capacitor is charged by a current source that has a fixed maximum, and a
 * fixed current into a fixed capacitance is a fixed dv/dt. For a µA741 that number is about
 * 0.5 volts per microsecond, and no amount of feedback improves it: feedback can only ask
 * the output to move, and the output moves at 0.5 V/µs whatever it is asked.
 *
 * So the output is computed here the way the device behaves: at every step it moves toward
 * where the ideal formula says it should be, by at most SR·Δt. Feed a square wave in and
 * three things follow, in this order, as the frequency rises. At 1 kHz the edges take 20 µs
 * out of a 500 µs half period — 4%, and it still looks square. At 10 kHz they take 40% and
 * it is a trapezoid. At 50 kHz the half period is 10 µs and the edge needs 20, so the ramp
 * never arrives: the output is a triangle, and half the height is gone with the corners.
 *
 * The number to carry away is f_max = SR/(2πV_p), the full-power bandwidth: the highest
 * frequency at which a sinusoid of peak V_p can still be delivered without slewing.
 *
 * The three real frequencies differ by fifty times, so they cannot share a real time axis
 * and still be drawn. Each is drawn over the same number of cycles of its own input, which
 * makes the three shapes directly comparable and makes the time axis a lesson clock; the
 * real frequency and the two mean slopes go in counters beside it.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme, swatch } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, xyCurvePane, type Beat } from "./kit.js";
import { invertingStage } from "./opAmpSchematics.js";
import { supplyRails } from "./realOpAmpSchematics.js";
import { fade, fmtR, stepTrack, withTracks } from "./util.js";

/** The device this lesson models, and the test the EE 230 op-amp-parameters lab runs on it. */
export const SLEW = {
  /** The part. Its datasheet slew rate is the number every counter here is built on. */
  device: "µA741",
  /** Slew rate, volts per second: 0.5 V/µs. */
  SR: 0.5e6,
  /** Square-wave peak at the input, volts. The stage inverts at unity, so also at the output. */
  Vp: 5,
  Rin: 10e3,
  Rf: 10e3,
  vSupply: 15,
  /** The three input frequencies, Hz: square, trapezoid, triangle. */
  freqs: [1e3, 10e3, 50e3],
  /** Cycles drawn in the scope window, the same for every frequency. */
  cycles: 4,
} as const;

/** Integration steps per drawn window. dt stays under a microsecond even at the lowest frequency. */
const STEPS = 8000;

export interface SlewCase {
  f: number;
  /** Seconds. */
  period: number;
  /** Real seconds in the drawn window: `cycles` periods. */
  window: number;
  /** The output an infinitely fast op-amp would give, volts, at real time τ. */
  ideal(tau: number): number;
  /** The output a slew-limited one gives. */
  out(tau: number): number;
  /** Peak-to-peak the output actually reaches, volts. */
  pp: number;
  /** MEAN dv/dt the square wave asks of the output over a half period, 2V_p/(T/2), in V/s. */
  needed: number;
  /** Mean dv/dt the output achieves over a half period: `needed` or SR, whichever is smaller. */
  actual: number;
}

/**
 * One frequency's worth of the experiment.
 *
 * The output is integrated, not drawn from a formula: at each step it moves toward the
 * ideal by at most SR·Δt, which is the only statement of the physics there is.
 *
 * Two details keep the picture honest. The integration starts a quarter period before the
 * drawn window, at an edge, so the window opens in the middle of a flat stretch rather than
 * on a transition — otherwise the first sample shows input and output at the same voltage
 * and a unity-gain INVERTING stage looks, for one pixel, as if it were not inverting. And it
 * starts at −A rather than anywhere convenient: a purely rate-limited follower is an
 * integrator and never recovers a DC offset, so any other starting value would draw a
 * triangle riding on an offset a real closed loop would have removed.
 */
export function slewCase(f: number, o: { SR?: number; Vp?: number; cycles?: number } = {}): SlewCase {
  const SR = o.SR ?? SLEW.SR;
  const Vp = o.Vp ?? SLEW.Vp;
  const cycles = o.cycles ?? SLEW.cycles;
  const period = 1 / f;
  const window = cycles * period;

  // The stage inverts at unity gain, so the target is the input turned upside down. The
  // quarter-period shift puts the edges at T/4, 3T/4, ... instead of at the window's edge.
  const ideal = (tau: number) => ((((tau - period / 4) % period) + period) % period < period / 2 ? -Vp : Vp);

  const t0 = -period / 4;
  const dt = (window - t0) / STEPS;
  const maxStep = SR * dt;
  const v = new Float64Array(STEPS + 1);
  // t0 is an edge on which the target becomes +V_p, so the output is at its lowest point.
  v[0] = -Math.min(Vp, (SR * period) / 4);
  for (let i = 1; i <= STEPS; i++) {
    const d = ideal(t0 + i * dt) - v[i - 1]!;
    v[i] = v[i - 1]! + (Math.abs(d) <= maxStep ? d : Math.sign(d) * maxStep);
  }

  const out = (tau: number) => {
    const u = Math.min(STEPS, Math.max(0, (tau - t0) / dt));
    const i = Math.floor(u);
    const j = Math.min(STEPS, i + 1);
    return v[i]! + (v[j]! - v[i]!) * (u - i);
  };

  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 0; i <= STEPS; i++) {
    lo = Math.min(lo, v[i]!);
    hi = Math.max(hi, v[i]!);
  }

  const needed = 4 * Vp * f;
  return { f, period, window, ideal, out, pp: hi - lo, needed, actual: Math.min(needed, SR) };
}

/** Seconds on the scope's time axis. One window is `SLEW.cycles` cycles, whatever the frequency. */
const SCOPE_T = 4;

/** Lesson clock, seconds. */
const T_CIRCUIT = 0.5;
const T_MODEL = 6.5;
const T_LOW = 12;
const T_MID = 17.5;
const T_HIGH = 23;
const T_FPB = 29;
const DRAW = 4;

export interface SlewRateOptions {
  /** Slew rate, V/s. Default 0.5 V/µs. */
  SR?: number;
  /** Square-wave peak, volts. Default 5 V. */
  Vp?: number;
  theme?: string;
}

export function buildSlewRate(o: SlewRateOptions = {}): SceneSpec {
  const SR = o.SR ?? SLEW.SR;
  const Vp = o.Vp ?? SLEW.Vp;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const cases = SLEW.freqs.map((f) => slewCase(f, { SR, Vp }));
  const at = [T_LOW, T_MID, T_HIGH];
  const shape = ["still square", "trapezoid", "triangle"];
  const colors = [theme.palette.secondary, swatch(theme, 5), swatch(theme, 3)];
  const vAxis = Vp * 1.3;
  const srPerUs = SR / 1e6;
  /** The rise time an edge needs, the sinusoid limit, and where a square starts to shrink. */
  const tRise = (2 * Vp) / SR;
  const fMax = SR / (2 * Math.PI * Vp);
  const fSquare = SR / (4 * Vp);
  const fmtHz = (f: number) => (f >= 1e6 ? `${f / 1e6} MHz` : f >= 1e3 ? `${f / 1e3} kHz` : `${f} Hz`);

  /* ---------------------------------------------------------------- schematic */
  const stage = invertingStage({
    id: "sr-sch",
    x: LAYOUT.schematic.x + 50,
    y: LAYOUT.schematic.y + 44,
    current: true,
    inputLabel: `R_in = ${fmtR(SLEW.Rin)}`,
    feedbackLabel: `R_f = ${fmtR(SLEW.Rf)}`,
    ...th,
  });
  const rails = supplyRails({ id: "sr-rails", stage, vPos: SLEW.vSupply, vNeg: -SLEW.vSupply, ...th });

  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 6,
    say: "A unity-gain inverting stage with a square wave in. The rails are fifteen volts and the signal is five, so nothing here is near saturation. This is a different limit.",
    nodes: [
      withTracks(stage.node, fade(T_CIRCUIT)),
      withTracks(rails.node, fade(T_CIRCUIT)),
      {
        id: "sr-device",
        type: "text",
        x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
        y: LAYOUT.schematic.y + LAYOUT.schematic.h - 4,
        text: `${SLEW.device}: SR = ${srPerUs} V/µs on ±${SLEW.vSupply} V supplies`,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 17,
        fill: theme.palette.secondary,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.schematic.w,
        tracks: fade(T_CIRCUIT + 2.5),
      },
    ],
  };

  /* -------------------------------------------------------------------- scope */
  /** Scope time to real time for the case being drawn: one window is `cycles` cycles. */
  const real = (c: SlewCase) => (t: number) => (t * c.window) / SCOPE_T;
  const square = (t: number) => ((((t - 0.25) % 1) + 1) % 1 < 0.5 ? Vp : -Vp);

  const scope = scopePaneRaw({
    id: "sr-scope",
    x: LAYOUT.scope.x + 70,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 100,
    height: LAYOUT.scope.h - 30,
    tMax: SCOPE_T,
    samples: 1800,
    xLabel: `time — each window is ${SLEW.cycles} cycles of the input`,
    planes: [
      {
        label: "v_in",
        yMin: -vAxis,
        yMax: vAxis,
        yTicks: [-Vp, 0, Vp],
        yTickLabel: (v) => `${v} V`,
        traces: [{ id: "in", fn: square, color: theme.palette.primary, start: T_MODEL, duration: DRAW, strokeWidth: 2.5 }],
      },
      {
        label: "v_out",
        yMin: -vAxis,
        yMax: vAxis,
        yTicks: [-Vp, 0, Vp],
        yTickLabel: (v) => `${v} V`,
        traces: cases.map((c, i) => ({
          id: `out${i}`,
          fn: (t: number) => c.out(real(c)(t)),
          color: colors[i]!,
          start: at[i]!,
          duration: DRAW,
          strokeWidth: 2.6,
        })),
      },
    ],
    ...th,
  });

  /** Names for the three outputs, in a row above the scope where no trace can reach them. */
  const legend: Node[] = cases.map((c, i) => ({
    id: `sr-legend-${i}`,
    type: "text",
    x: LAYOUT.scope.x + 180 + i * 148,
    y: LAYOUT.scope.y - 16,
    text: `${fmtHz(c.f)}: ${shape[i]}`,
    fontFamily: LABEL_FONT,
    fontWeight: 700,
    fontSize: 15,
    fill: colors[i]!,
    align: "left",
    baseline: "middle",
    tracks: fade(at[i]!),
  }));

  /* ---------------------------------------------------------------- equations */
  const eqX = LAYOUT.equation.x;
  const eqY = LAYOUT.equation.y;
  const model: Beat = {
    at: T_MODEL,
    dur: 5,
    say: "Inside, one capacitor is charged by a current that has a maximum, and a fixed current into a fixed capacitance is a fixed rate. Crossing ten volts therefore takes twenty microseconds, always.",
    nodes: [
      equationPane({
        id: "sr-eq-sr",
        latex: `\\left|\\frac{dv_{out}}{dt}\\right|_{max}=SR=${srPerUs}\\ \\mathrm{V}/\\mu\\mathrm{s}`,
        x: eqX,
        y: eqY + 2,
        at: T_MODEL,
        size: 24,
        ...th,
      }).node,
      equationPane({
        id: "sr-eq-tr",
        latex: `t_r=\\frac{2V_p}{SR}=${(tRise * 1e6).toFixed(0)}\\ \\mu\\mathrm{s}`,
        x: eqX,
        y: eqY + 64,
        at: T_MODEL + 1.6,
        size: 24,
        color: theme.palette.accent,
        ...th,
      }).node,
      withTracks(scope.node, fade(T_MODEL - 0.5)),
    ],
  };

  /*
   * ------------------------------------------------------------------ counters
   *
   * MEAN slopes, over a half period, not the slope of an edge. A rate-limited output on an
   * edge always runs at exactly SR — that is the equation above, and it is the same 0.5 V/µs
   * at every frequency, so a counter of it would say nothing. What changes with frequency is
   * whether the half period is long enough for that ramp to arrive: 2V_p/(T/2) is the mean
   * rate the square wave asks for, and the output's mean rate is that or SR, whichever is
   * smaller. They part company exactly when the shape does.
   */
  const counterY = eqY + 136;
  const counter = (id: string, y: number, prefix: string, suffix: string, values: number[], decimals: number, fill: string): Node => ({
    id,
    type: "counter",
    x: eqX,
    y,
    value: Number(values[0]!.toFixed(6)),
    decimals,
    prefix,
    suffix,
    fontFamily: LABEL_FONT,
    fontSize: 23,
    fill,
    align: "left",
    baseline: "middle",
    tracks: [stepTrack(values.map((v, i) => ({ at: at[i]!, value: Number(v.toFixed(6)) }))), ...fade(T_LOW - 0.4)],
  });

  const counters: Node[] = [
    counter(
      "sr-ctr-f",
      counterY,
      "f = ",
      " kHz",
      cases.map((c) => c.f / 1e3),
      0,
      theme.palette.primary,
    ),
    counter(
      "sr-ctr-need",
      counterY + 42,
      "mean dv/dt needed = ",
      " V/µs",
      cases.map((c) => c.needed / 1e6),
      2,
      theme.palette.text,
    ),
    counter(
      "sr-ctr-act",
      counterY + 84,
      "mean dv/dt delivered = ",
      " V/µs",
      cases.map((c) => c.actual / 1e6),
      2,
      theme.palette.accent,
    ),
  ];

  /* ------------------------------------------------------------ transfer view */
  const dLo = 2;
  const dHi = 6;
  const ppAt = (f: number) => Math.min(2 * Vp, SR / (2 * f));
  const fpb = xyCurvePane({
    id: "sr-fpb",
    x: LAYOUT.transfer.x + 78,
    y: LAYOUT.transfer.y + 16,
    width: LAYOUT.transfer.w - 122,
    height: LAYOUT.transfer.h - 70,
    xMin: dLo,
    xMax: dHi,
    yMin: 0,
    yMax: 2 * vAxis,
    xTicks: [2, 3, 4, 5, 6],
    yTicks: [0, Vp, 2 * Vp],
    xTickLabel: (d) => fmtHz(10 ** d),
    yTickLabel: (v) => `${v} V`,
    xLabel: "input frequency (log scale)",
    yLabel: "output peak-to-peak",
    uMax: 1,
    samples: 500,
    legendAt: "bottom",
    traces: [
      {
        id: "want",
        at: (u) => ({ x: dLo + (dHi - dLo) * u, y: 2 * Vp }),
        color: theme.palette.muted,
        strokeWidth: 2,
        dash: [6, 5],
        start: T_MODEL,
        duration: 0.8,
        label: `asked for: ${2 * Vp} V peak-to-peak`,
      },
      {
        id: "curve",
        at: (u) => {
          const d = dLo + (dHi - dLo) * u;
          return { x: d, y: ppAt(10 ** d) };
        },
        color: theme.palette.primary,
        strokeWidth: 3.5,
        start: T_LOW - 0.5,
        duration: 1.2,
        label: "what the slew rate allows",
      },
      {
        id: "corner",
        at: (u) => ({ x: Math.log10(fSquare), y: 2 * vAxis * u }),
        color: theme.palette.secondary,
        strokeWidth: 1.5,
        dash: [5, 4],
        start: T_FPB,
        duration: 0.6,
      },
    ],
    dots: cases.map((c, i) => ({
      id: `dot${i}`,
      at: () => ({ x: Math.log10(c.f), y: c.pp }),
      color: colors[i]!,
      start: at[i]!,
      duration: 0.5,
      radius: 7,
    })),
    ...th,
  });

  const low: Beat = {
    at: T_LOW,
    dur: 5,
    say: "One kilohertz. Each half period is five hundred microseconds and the edge takes twenty, so four percent of it is ramp. It still looks like a square wave.",
    nodes: [withTracks(fpb.node, fade(T_MODEL - 0.5)), ...legend, ...counters],
  };

  const mid: Beat = {
    at: T_MID,
    dur: 5,
    say: "Ten kilohertz. The same twenty microsecond edge, but the half period is only fifty, so the ramp is forty percent of it. The corners are gone: this is a trapezoid.",
    nodes: [],
  };

  const high: Beat = {
    at: T_HIGH,
    dur: 5.5,
    say: "Fifty kilohertz. The half period is ten microseconds and the edge needs twenty, so the ramp never arrives. The output is a triangle, and it reaches only half the height it was asked for.",
    nodes: [
      {
        id: "sr-capped",
        type: "text",
        x: eqX + 400,
        y: counterY + 84,
        text: "capped by SR",
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 17,
        fill: colors[2]!,
        align: "left",
        baseline: "middle",
        tracks: fade(T_HIGH),
      },
    ],
  };

  const fpbBeat: Beat = {
    at: T_FPB,
    dur: 9.5,
    say: `For a sinusoid the same limit has a name: the full-power bandwidth, S R over two pi V p. Here, ${(fMax / 1e3).toFixed(1)} kilohertz.`,
    nodes: [
      {
        id: "sr-fmax",
        type: "text",
        x: eqX,
        y: eqY + 252,
        text: `full-power bandwidth  f_max = SR/(2πV_p) = ${(fMax / 1e3).toFixed(1)} kHz`,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 20,
        fill: theme.palette.secondary,
        align: "left",
        baseline: "middle",
        maxWidth: LAYOUT.equation.w,
        tracks: fade(T_FPB),
      },
      {
        id: "sr-corner-note",
        type: "text",
        x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
        y: LAYOUT.transfer.y + LAYOUT.transfer.h + 16,
        text: `A square wave keeps its full height only below SR/4V_p = ${fmtHz(fSquare)}.`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 17,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.transfer.w + 40,
        tracks: fade(T_FPB),
      },
    ],
  };

  return eeLesson({
    title: "Slew rate: how fast the output is allowed to move",
    beats: [circuit, model, low, mid, high, fpbBeat],
    ...th,
  });
}
