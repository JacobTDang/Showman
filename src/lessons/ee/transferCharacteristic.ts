/**
 * ee.transferCharacteristic — Geiger's Fig. 3, animated.
 *
 * The transfer characteristic is the pseudo-static relationship between input and output,
 * V_out = f(V_in). A linear one is a straight line and a sinusoid in gives a sinusoid out.
 * Bend the line and the peaks of the output bend with it; clip it and the output is
 * flattened at the rails. Three characteristics side by side, each with a dot at the live
 * operating point while the same sinusoid drives all three.
 */
import type { Node, SceneSpec } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT, LAYOUT, eeLesson, equationPane, scopePaneRaw, transferCurvePane, type Beat } from "./kit.js";
import { fade, withTracks } from "./util.js";

export interface TransferCharacteristicOptions {
  /** Small-signal gain of all three characteristics. Default 1.5. */
  gain?: number;
  theme?: string;
}

const T_BLOCK = 0.5;
const T_LINEAR = 4;
const T_SOFT = 9;
const T_HARD = 14;
const BEAT = 4;
const T_NOTE = T_HARD + BEAT + 1;
const V_IN = 1;
const V_SAT = 1;
const V_MAX = 1.8;
const F_DRIVE = 0.5; // Hz on the lesson clock: two cycles per beat

export function buildTransferCharacteristic(o: TransferCharacteristicOptions = {}): SceneSpec {
  const K = o.gain ?? 1.5;
  const theme = getTheme(o.theme);
  const th = o.theme ? { theme: o.theme } : {};
  const linear = (v: number) => K * v;
  const soft = (v: number) => K * v - K * 0.3 * v ** 3;
  const hard = (v: number) => Math.max(-V_SAT, Math.min(V_SAT, K * 2 * v));
  const drive = (t: number) => V_IN * Math.sin(2 * Math.PI * F_DRIVE * t);

  // A system block: v_in → [ f ] → v_out.
  const bx = LAYOUT.schematic.x + 170;
  const by = LAYOUT.schematic.y + 70;
  const ink = theme.palette.text;
  const block: Node = {
    id: "tc-block",
    type: "group",
    x: 0,
    y: 0,
    tracks: fade(T_BLOCK),
    children: [
      {
        id: "tc-in-w",
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: bx - 120, y: by + 55 },
          { x: bx, y: by + 55 },
        ],
        stroke: ink,
        strokeWidth: 3,
      },
      {
        id: "tc-in-h",
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: bx - 12, y: by + 47 },
          { x: bx, y: by + 55 },
          { x: bx - 12, y: by + 63 },
        ],
        stroke: ink,
        strokeWidth: 3,
      },
      {
        id: "tc-box",
        type: "rect",
        x: bx,
        y: by,
        width: 220,
        height: 110,
        radius: 10,
        fill: theme.palette.bg,
        stroke: ink,
        strokeWidth: 3,
      },
      {
        id: "tc-box-l",
        type: "text",
        x: bx + 110,
        y: by + 42,
        text: "system",
        fontFamily: LABEL_FONT,
        fontWeight: 700,
        fontSize: 20,
        fill: ink,
        align: "center",
        baseline: "middle",
      },
      {
        id: "tc-box-f",
        type: "text",
        x: bx + 110,
        y: by + 74,
        text: "v_out = f(v_in)",
        fontFamily: LABEL_FONT,
        fontSize: 17,
        fill: theme.palette.muted,
        align: "center",
        baseline: "middle",
      },
      {
        id: "tc-out-w",
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: bx + 220, y: by + 55 },
          { x: bx + 340, y: by + 55 },
        ],
        stroke: ink,
        strokeWidth: 3,
      },
      {
        id: "tc-out-h",
        type: "polyline",
        x: 0,
        y: 0,
        points: [
          { x: bx + 328, y: by + 47 },
          { x: bx + 340, y: by + 55 },
          { x: bx + 328, y: by + 63 },
        ],
        stroke: ink,
        strokeWidth: 3,
      },
      {
        id: "tc-vin",
        type: "text",
        x: bx - 60,
        y: by + 35,
        text: "v_in",
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 16,
        fill: theme.palette.primary,
        align: "center",
        baseline: "middle",
      },
      {
        id: "tc-vout",
        type: "text",
        x: bx + 280,
        y: by + 35,
        text: "v_out",
        fontFamily: LABEL_FONT,
        fontWeight: 600,
        fontSize: 16,
        fill: theme.palette.accent,
        align: "center",
        baseline: "middle",
      },
    ],
  };
  const blockBeat: Beat = {
    at: T_BLOCK,
    dur: 3,
    say: "Any system, circuit or not, has a transfer characteristic: the pseudo-static relationship between what goes in and what comes out. Draw v out against v in and you have it.",
    nodes: [block],
  };

  // Three characteristics side by side in the transfer slot, each dot alive during its beat.
  const paneW = 160;
  const paneGap = 40;
  const px0 = LAYOUT.transfer.x + 50;
  const py = LAYOUT.transfer.y + 20;
  const paneH = LAYOUT.transfer.h - 70;
  const curves = [
    { id: "tc-lin", fn: linear, at: T_LINEAR, title: "linear", color: theme.palette.primary },
    { id: "tc-soft", fn: soft, at: T_SOFT, title: "weakly nonlinear", color: theme.palette.accent },
    { id: "tc-hard", fn: hard, at: T_HARD, title: "highly nonlinear", color: theme.palette.secondary },
  ] as const;
  const panes = curves.map((c, i) => {
    const pane = transferCurvePane({
      id: c.id,
      x: px0 + i * (paneW + paneGap),
      y: py,
      width: paneW,
      height: paneH,
      fn: c.fn,
      vMax: V_MAX,
      drive,
      tMax: BEAT,
      start: c.at,
      duration: BEAT,
      ...th,
    });
    const title: Node = {
      id: `${c.id}-t`,
      type: "text",
      x: px0 + i * (paneW + paneGap) + paneW / 2,
      y: py - 12,
      text: c.title,
      fontFamily: LABEL_FONT,
      fontWeight: 700,
      fontSize: 14,
      fill: c.color,
      align: "center",
      baseline: "middle",
    };
    return { node: withTracks(pane.node, fade(c.at - 0.3)), title: withTracks(title, fade(c.at - 0.3)) };
  });

  // One scope: the same input drives every beat; each output draws on in its own beat.
  const yT = [-V_MAX, 0, V_MAX];
  const fmtV = (v: number) => `${v.toFixed(1)} V`;
  const scope = scopePaneRaw({
    id: "tc-scope",
    x: LAYOUT.scope.x + 60,
    y: LAYOUT.scope.y + 8,
    width: LAYOUT.scope.w - 80,
    height: LAYOUT.scope.h - 26,
    tMax: BEAT,
    xLabel: "time",
    planes: [
      {
        label: "v_in",
        yMin: -V_MAX,
        yMax: V_MAX,
        yTicks: yT,
        yTickLabel: fmtV,
        traces: [{ id: "in", fn: drive, color: theme.palette.primary, start: T_LINEAR, duration: BEAT, marker: true }],
      },
      {
        label: "v_out",
        yMin: -V_MAX,
        yMax: V_MAX,
        yTicks: yT,
        yTickLabel: fmtV,
        traces: curves.map((c) => ({
          id: `${c.id}-out`,
          fn: (t: number) => c.fn(drive(t)),
          color: c.color,
          start: c.at,
          duration: BEAT,
          marker: true,
          strokeWidth: 2.5,
        })),
      },
    ],
    ...th,
  });

  const eqX = LAYOUT.equation.x;
  const eqs = [
    equationPane({
      id: "tc-eq-lin",
      latex: `v_{out}=${K}\\,v_{in}`,
      x: eqX,
      y: LAYOUT.equation.y + 10,
      at: T_LINEAR,
      size: 24,
      color: theme.palette.primary,
      ...th,
    }),
    equationPane({
      id: "tc-eq-soft",
      latex: `v_{out}=${K}\\,v_{in}-${(K * 0.3).toFixed(2)}\\,v_{in}^{3}`,
      x: eqX,
      y: LAYOUT.equation.y + 75,
      at: T_SOFT,
      size: 24,
      color: theme.palette.accent,
      ...th,
    }),
    equationPane({
      id: "tc-eq-hard",
      latex: `v_{out}=\\mathrm{clip}\\big(${K * 2}\\,v_{in},\\;\\pm ${V_SAT}\\,\\mathrm{V}\\big)`,
      x: eqX,
      y: LAYOUT.equation.y + 140,
      at: T_HARD,
      size: 24,
      color: theme.palette.secondary,
      ...th,
    }),
  ];

  const linearBeat: Beat = {
    at: T_LINEAR,
    dur: BEAT,
    say: "Linear first. The characteristic is a straight line through the origin. Drive it with a sinusoid and the dot slides up and down the line; the output is the same sinusoid, just taller. Only a linear system has a transfer function.",
    nodes: [withTracks(scope.node, fade(T_LINEAR - 0.5)), panes[0]!.node, panes[0]!.title, eqs[0]!.node],
  };
  const softBeat: Beat = {
    at: T_SOFT,
    dur: BEAT,
    say: "Now bend the line a little: a cubic term pulls the ends down. The same sinusoid goes in, but watch the peaks of the output flatten where the dot reaches the bend. That is distortion, and it is what a real amplifier does near its limits.",
    nodes: [panes[1]!.node, panes[1]!.title, eqs[1]!.node],
  };
  const hardBeat: Beat = {
    at: T_HARD,
    dur: BEAT,
    say: "Now a hard limit: the output cannot exceed plus or minus one volt. The dot runs into the rail and stops. The output is chopped flat at the top and bottom. This is clipping — an op amp hitting its supply rails looks exactly like this.",
    nodes: [panes[2]!.node, panes[2]!.title, eqs[2]!.node],
  };
  const note: Node = {
    id: "tc-note",
    type: "text",
    x: LAYOUT.transfer.x + LAYOUT.transfer.w / 2,
    y: LAYOUT.transfer.y + LAYOUT.transfer.h + 18,
    text: "Straight line: a transfer function exists.  Any bend: no transfer function, and the waveform tells you so.",
    fontFamily: LABEL_FONT,
    fontWeight: 600,
    fontSize: 16,
    fill: theme.palette.text,
    align: "center",
    baseline: "middle",
    maxWidth: LAYOUT.transfer.w + 40,
    tracks: fade(T_NOTE),
  };
  const noteBeat: Beat = {
    at: T_NOTE,
    dur: 4,
    say: "The test is simple. If the characteristic is a straight line, the system is linear and has a transfer function. Any bend at all, and it does not — and the shape of the output waveform is how you can tell.",
    nodes: [note],
  };

  return eeLesson({
    title: "Transfer characteristics: linear, bent, and clipped",
    beats: [blockBeat, linearBeat, softBeat, hardBeat, noteBeat],
    ...th,
  });
}
