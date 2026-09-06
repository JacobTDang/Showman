/**
 * ee.gainBandwidth — the third place the ideal op-amp stops being true, and the one that
 * decides what you can actually build.
 *
 * Tier 2's open-loop gain was a single number, two hundred thousand. It is not a number, it
 * is a curve. The internal compensation capacitor puts one dominant pole at about 5 Hz, and
 * above it the gain falls at twenty decibels a decade — a factor of ten less gain for every
 * factor of ten more frequency. The product of the two is therefore constant, and it has a
 * name: the gain-bandwidth product, A0·f_p, which for this device is 1 MHz. It is also the
 * frequency at which the open-loop gain has fallen to one, so it is also called the
 * unity-gain frequency.
 *
 * Close the loop for a gain of G and the algebra is short:
 *
 *   A_CL = A/(1 + A/G) = [A0/(1+A0/G)] / [1 + jω/(ω_p(1+A0/G))]
 *
 * Still one pole. The DC gain has dropped from A0 to about G, and the corner has risen by
 * exactly the same factor — so the product survives untouched. That is the whole lesson,
 * and it is the reason a gain of a hundred costs you a bandwidth of ten kilohertz while a
 * gain of one buys you a megahertz.
 *
 * The Bode plot shows all four curves at once, the closed-loop ones flat until they meet the
 * open-loop line and then riding down it. The scope shows what that means: the same input
 * frequency rising, and the highest-gain stage giving up first.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme, swatch } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, logSweep, scopePaneRaw, xyCurvePane, type Beat, type Transfer } from "./kit.js";
import { nonInvertingStage } from "./opAmpSchematics.js";
import { fade, stepTrack, withTracks } from "./util.js";

/** The device: Tier 2's open-loop gain, given the single pole a compensated op-amp has. */
export const GAIN_BW = {
  /** Open-loop DC gain, V/V. The same number `ee.opAmpRules` counts up to. */
  A0: 200_000,
  /** The dominant pole, Hz. A0 · fp is the gain-bandwidth product. */
  fp: 5,
  /** The three closed-loop gains, in the order the lesson walks them. */
  gains: [100, 10, 1],
  /** The non-inverting stage drawn: 1 + R_f/R_g = 100. */
  Rf: 99e3,
  Rg: 1e3,
} as const;

const RAD2DEG = 180 / Math.PI;

function onePole(dc: number, omegaC: number, latex: string): Transfer {
  const mag = (w: number) => dc / Math.sqrt(1 + (w / omegaC) ** 2);
  const phaseRad = (w: number) => -Math.atan(w / omegaC);
  return {
    omega0: omegaC,
    mag,
    dB: (w) => 20 * Math.log10(Math.max(mag(w), 1e-12)),
    phaseRad,
    phaseDeg: (w) => phaseRad(w) * RAD2DEG,
    latex,
  };
}

/** A(jω) = A0/(1 + jω/ω_p): the whole open-loop response, from one number and one pole. */
export function openLoop(A0: number = GAIN_BW.A0, fp: number = GAIN_BW.fp): Transfer {
  return onePole(A0, 2 * Math.PI * fp, "A(j\\omega)=\\frac{A_0}{1+j\\omega/\\omega_p}");
}

/**
 * The closed-loop response of a non-inverting stage of ideal gain G, solved rather than
 * asserted: A_CL = A/(1 + A/G), which is again one pole, with the DC gain divided by
 * (1 + A0/G) and the corner multiplied by it. The product is therefore exactly A0·f_p,
 * whatever G is — which is the claim the lesson makes and the one the test checks.
 */
export function closedLoop(G: number, A0: number = GAIN_BW.A0, fp: number = GAIN_BW.fp): Transfer {
  const loop = 1 + A0 / G;
  return onePole(A0 / loop, 2 * Math.PI * fp * loop, "A_{CL}(j\\omega)=\\frac{A}{1+A/G}");
}

/** Seconds on the scope's time axis, and the drawn frequency across them. */
const SCOPE_T = 4;
const F_DRAW = 2;
/** The sweep: 1 Hz to 10 MHz, which is where everything in this lesson happens. */
const D_LO = 0;
const D_HI = 7;

/** Lesson clock, seconds. */
const T_CIRCUIT = 0.5;
const T_OPEN = 6;
const T_CLOSED = 12.5;
const T_TRADE = 19;
const T_SWEEP = 24;
const SWEEP_DUR = 10;
const T_NOTE = 34.5;
/** When each closed-loop curve and its counter reading arrive. */
const T_STEP = [T_CLOSED, T_CLOSED + 3, T_CLOSED + 6];

export interface GainBandwidthOptions {
  /** Open-loop DC gain. Default 200 000. */
  A0?: number;
  /** Dominant pole, Hz. Default 5 Hz, which puts the GBW at 1 MHz. */
  fp?: number;
  theme?: string;
}

export function buildGainBandwidth(o: GainBandwidthOptions = {}): SceneSpec {
  const A0 = o.A0 ?? GAIN_BW.A0;
  const fp = o.fp ?? GAIN_BW.fp;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const gains = GAIN_BW.gains;
  const A = openLoop(A0, fp);
  const closed = gains.map((G) => closedLoop(G, A0, fp));
  const fT = A0 * fp;
  const colors = gains.map((_, i) => [theme.palette.accent, swatch(theme, 5), theme.palette.secondary][i]!);
  const bwHz = closed.map((T) => T.omega0 / (2 * Math.PI));
  const fmtHz = (f: number) =>
    f >= 1e6 ? `${(f / 1e6).toFixed(f < 1e7 ? 1 : 0)} MHz` : f >= 1e3 ? `${Math.round(f / 1e3)} kHz` : `${f} Hz`;

  const sweep = logSweep({ omega0: 2 * Math.PI, fromDecade: D_LO, toDecade: D_HI, duration: SWEEP_DUR });

  /* ---------------------------------------------------------------- schematic */
  const stage = nonInvertingStage({
    id: "gb-sch",
    x: LAYOUT.schematic.x + 50,
    y: LAYOUT.schematic.y + 44,
    current: true,
    rfLabel: `R_f = ${GAIN_BW.Rf / 1000} kΩ`,
    rgLabel: `R_g = ${GAIN_BW.Rg / 1000} kΩ`,
    ...th,
  });

  const circuit: Beat = {
    at: T_CIRCUIT,
    dur: 5.5,
    say: "A non-inverting stage, gain one plus R f over R g: a hundred. Tier two said the op-amp's own gain never appears in that answer. It does — as soon as you ask for the answer at speed.",
    nodes: [
      withTracks(stage.node, fade(T_CIRCUIT)),
      {
        id: "gb-gain-note",
        type: "text",
        x: LAYOUT.schematic.x + LAYOUT.schematic.w / 2,
        y: LAYOUT.schematic.y + LAYOUT.schematic.h - 4,
        text: `G = 1 + R_f/R_g = ${1 + GAIN_BW.Rf / GAIN_BW.Rg}`,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 18,
        fill: theme.palette.primary,
        align: "center",
        baseline: "middle",
        tracks: fade(T_CIRCUIT + 2),
      },
    ],
  };

  /* ------------------------------------------------------------ transfer view */
  const paneX = LAYOUT.transfer.x + 78;
  const paneY = LAYOUT.transfer.y + 8;
  const paneW = LAYOUT.transfer.w - 122;
  const paneH = LAYOUT.transfer.h - 62;
  const dB_LO = -30;
  const dB_HI = 120;
  const decade = (u: number) => D_LO + ((D_HI - D_LO) * u) / SWEEP_DUR;
  const curve = (T: Transfer) => (u: number) => {
    const d = decade(u);
    return { x: d, y: T.dB(2 * Math.PI * 10 ** d) };
  };
  const bode = xyCurvePane({
    id: "gb-bode",
    x: paneX,
    y: paneY,
    width: paneW,
    height: paneH,
    xMin: D_LO,
    xMax: D_HI,
    yMin: dB_LO,
    yMax: dB_HI,
    xTicks: [0, 1, 2, 3, 4, 5, 6, 7],
    yTicks: [0, 20, 40, 60, 80, 100, 120],
    xTickLabel: (d) => (d % 2 === 0 ? fmtHz(10 ** d) : ""),
    yTickLabel: (v) => `${v} dB`,
    xLabel: "frequency (log scale)",
    yLabel: "|gain|",
    uMax: SWEEP_DUR,
    samples: 400,
    traces: [
      {
        id: "pole",
        at: (u) => ({ x: Math.log10(fp), y: dB_LO + ((dB_HI - dB_LO) * u) / SWEEP_DUR }),
        color: theme.palette.muted,
        strokeWidth: 1.5,
        dash: [5, 4],
        start: T_OPEN + 1.2,
        duration: 0.6,
      },
      {
        id: "unity",
        at: (u) => ({ x: Math.log10(fT), y: dB_LO + ((dB_HI - dB_LO) * u) / SWEEP_DUR }),
        color: theme.palette.muted,
        strokeWidth: 1.5,
        dash: [5, 4],
        start: T_OPEN + 2.2,
        duration: 0.6,
      },
      { id: "open", at: curve(A), color: theme.palette.primary, strokeWidth: 3.5, start: T_OPEN, duration: 1.6 },
      ...closed.map((T, i) => ({
        id: `cl${i}`,
        at: curve(T),
        color: colors[i]!,
        strokeWidth: 3,
        start: T_STEP[i]!,
        duration: 1.4,
      })),
    ],
    dots: [
      {
        id: "dot-open",
        at: (u) => ({ x: sweep.decadeAt(u), y: A.dB(sweep.omega(u)) }),
        color: theme.palette.primary,
        start: T_SWEEP,
        duration: SWEEP_DUR,
      },
      ...closed.map((T, i) => ({
        id: `dot-cl${i}`,
        at: (u: number) => ({ x: sweep.decadeAt(u), y: T.dB(sweep.omega(u)) }),
        color: colors[i]!,
        start: T_SWEEP,
        duration: SWEEP_DUR,
      })),
    ],
    ...th,
  });

  /**
   * A name written just above its own curve, one decade in — far enough left that the four
   * curves are still an order of magnitude apart, far enough right to clear the dashed
   * marker standing on the pole.
   */
  const NAME_AT = 1.1;
  const curveLabel = (id: string, T: Transfer, text: string, fill: string, at: number): Node => {
    const p = bode.plane.toLocal(NAME_AT, T.dB(2 * Math.PI * 10 ** NAME_AT));
    return {
      id,
      type: "text",
      x: paneX + p.x + 6,
      y: paneY + p.y - 13,
      text,
      fontFamily: LABEL_FONT,
      fontWeight: 700,
      fontSize: 14,
      fill,
      align: "left",
      baseline: "middle",
      tracks: fade(at),
    };
  };
  /** A dashed vertical's name, beside the line rather than struck through by it. */
  const marker = (id: string, d: number, text: string, side: "left" | "right", at: number): Node => {
    const p = bode.plane.toLocal(d, dB_LO + 12);
    return {
      id,
      type: "text",
      x: paneX + p.x + (side === "right" ? 6 : -6),
      y: paneY + p.y,
      text,
      fontFamily: LABEL_FONT,
      fontWeight: 700,
      fontSize: 13,
      fill: theme.palette.muted,
      align: side === "right" ? "left" : "right",
      baseline: "middle",
      tracks: fade(at),
    };
  };

  const bodeLabels: Node[] = [
    curveLabel("gb-lbl-open", A, "open loop", theme.palette.primary, T_OPEN + 0.6),
    ...closed.map((T, i) => curveLabel(`gb-lbl-cl${i}`, T, `G = ${gains[i]}`, colors[i]!, T_STEP[i]! + 0.6)),
    marker("gb-mark-fp", Math.log10(fp), `f_p = ${fp} Hz`, "right", T_OPEN + 1.4),
    marker("gb-mark-ft", Math.log10(fT), `f_T = ${fmtHz(fT)}`, "left", T_OPEN + 2.4),
  ];

  /* ---------------------------------------------------------------- equations */
  const eqX = LAYOUT.equation.x;
  const eqY = LAYOUT.equation.y;
  const open: Beat = {
    at: T_OPEN,
    dur: 6,
    say: "The open-loop gain is not a number, it is a curve. One pole at five hertz, then twenty decibels down per decade — ten times less gain for ten times the frequency — until it reaches one, at a megahertz.",
    nodes: [
      equationPane({
        id: "gb-eq-open",
        latex: A.latex,
        x: eqX,
        y: eqY + 2,
        at: T_OPEN,
        size: 26,
        ...th,
      }).node,
      withTracks(bode.node, fade(T_OPEN - 0.5)),
      ...bodeLabels,
    ],
  };

  const counterY = eqY + 140;
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
    fontSize: 24,
    fill,
    align: "left",
    baseline: "middle",
    tracks: [stepTrack(values.map((v, i) => ({ at: T_STEP[i]!, value: Number(v.toFixed(6)) }))), ...fade(T_CLOSED - 0.4)],
  });

  const closedBeat: Beat = {
    at: T_CLOSED,
    dur: 6,
    say: "Close the loop for a gain of a hundred and the answer is flat to ten kilohertz, then it joins the open-loop line and falls with it. Ask for ten instead and the corner moves out to a hundred kilohertz.",
    nodes: [
      equationPane({
        id: "gb-eq-closed",
        latex: "A_{CL}=\\frac{A}{1+A/G}=\\frac{A_0/(1+A_0/G)}{1+j\\omega/\\omega_p(1+A_0/G)}",
        x: eqX,
        y: eqY + 62,
        at: T_CLOSED,
        size: 19,
        color: theme.palette.accent,
        ...th,
      }).node,
      counter("gb-ctr-g", counterY, "G = ", " V/V", [...gains], 0, theme.palette.primary),
      counter(
        "gb-ctr-bw",
        counterY + 42,
        "bandwidth = ",
        " kHz",
        bwHz.map((f) => f / 1e3),
        1,
        theme.palette.accent,
      ),
      counter(
        "gb-ctr-gbw",
        counterY + 88,
        "G × bandwidth = ",
        " MHz",
        gains.map(() => fT / 1e6),
        3,
        theme.palette.secondary,
      ),
    ],
  };

  const trade: Beat = {
    at: T_TRADE,
    dur: 4.5,
    say: "And a gain of one gets the whole megahertz. Every time the gain drops by ten the bandwidth rises by ten. The third counter is their product, and it has not moved.",
    nodes: [
      {
        id: "gb-trade-note",
        type: "text",
        x: eqX,
        y: eqY + 262,
        text: `gain × bandwidth = A_0 f_p = f_T = ${fmtHz(fT)}`,
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 20,
        fill: theme.palette.secondary,
        align: "left",
        baseline: "middle",
        maxWidth: LAYOUT.equation.w,
        tracks: fade(T_TRADE),
      },
    ],
  };

  /* -------------------------------------------------------------------- scope */
  const toSweep = (t: number) => (t * SWEEP_DUR) / SCOPE_T;
  const envelope = (T: Transfer, i: number) => (t: number) => T.mag(sweep.omega(toSweep(t))) / closed[i]!.mag(0);
  const vAxis = 1.4;
  const scope = scopePaneRaw({
    id: "gb-scope",
    x: LAYOUT.scope.x + 78,
    y: LAYOUT.scope.y + 6,
    width: LAYOUT.scope.w - 108,
    height: LAYOUT.scope.h - 30,
    tMax: SCOPE_T,
    samples: 1600,
    xLabel: "time — the drawn frequency is fixed; the real one sweeps 1 Hz to 10 MHz",
    planes: closed.map((T, i) => ({
      label: `G = ${gains[i]}`,
      yMin: -vAxis,
      yMax: vAxis,
      yTicks: [-1, 0, 1],
      yTickLabel: (v: number) => `${v}`,
      traces: [
        {
          id: `ref${i}`,
          fn: (t: number) => Math.sin(2 * Math.PI * F_DRAW * t),
          color: theme.palette.muted,
          start: T_SWEEP,
          duration: SWEEP_DUR,
          strokeWidth: 1.5,
          dash: [5, 4],
        },
        {
          id: `out${i}`,
          fn: (t: number) => envelope(T, i)(t) * Math.sin(2 * Math.PI * F_DRAW * t),
          color: colors[i]!,
          start: T_SWEEP,
          duration: SWEEP_DUR,
          strokeWidth: 2.6,
        },
      ],
    })),
    ...th,
  });

  const sweepBeat: Beat = {
    at: T_SWEEP,
    dur: SWEEP_DUR,
    say: "Now sweep the input from one hertz to ten megahertz, with all three stages driven together. Each trace is divided by its own low-frequency gain, so all three start at one. Watch which one gives up first.",
    nodes: [withTracks(scope.node, fade(T_SWEEP - 0.5))],
  };

  const note: Beat = {
    at: T_NOTE,
    dur: 9,
    say: "Gain is not free. The device gives you a megahertz to spend, and what you take in gain you give back in bandwidth.",
    nodes: [
      {
        id: "gb-note",
        type: "text",
        x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
        y: LAYOUT.transfer.y + LAYOUT.transfer.h + 22,
        text: `Gain ${gains[0]} buys ${fmtHz(bwHz[0]!)}; gain ${gains[2]} buys ${fmtHz(bwHz[2]!)}. The product is the device.`,
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 17,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: LAYOUT.transfer.w + 40,
        tracks: fade(T_NOTE),
      },
    ],
  };

  return eeLesson({
    title: "Gain-bandwidth: what a gain of 100 costs you",
    beats: [circuit, open, closedBeat, trade, sweepBeat, note],
    ...th,
  });
}
