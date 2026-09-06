/**
 * The schematics the Tier 5 diode lessons draw.
 *
 * Same discipline as `schematics.ts`: compose the symbols in `physics/circuit.ts` and wire
 * only to the terminals they report, so connectivity holds by construction. Two things are
 * new here. A diode has a direction, so a vertical one has to be able to point either way —
 * `verticalSym` rotates ±90° about terminal `a`. And a rectifier's whole point is that
 * current flows only part of the time, so a conducting path is drawn twice: once as plain
 * wire, and once as an accent-coloured marching-ants overlay whose opacity is gated to the
 * half-cycles in which the diode is actually forward biased.
 */
import {
  acSource,
  battery,
  capacitor,
  diode,
  resistor,
  type CircuitSymbol,
  type Point,
  type SymbolOptions,
} from "../../physics/circuit.js";
import { getTheme } from "../../theme/themes.js";
import { LABEL_FONT } from "./kit.js";
import type { GroupNode, Node, Track } from "../../spec/types.js";

/** A window of lesson time in which a diode conducts. */
export interface Window {
  on: number;
  off: number;
}

export interface DiodeSchematic {
  node: GroupNode;
  bbox: { w: number; h: number };
}

/* ----------------------------------------------------------- primitives */

/**
 * Stand a horizontal symbol upright. Rotating the group 90° about terminal `a` maps the
 * offset (size, 0) to (0, size) — `b` below `a`; rotating −90° maps it to (0, −size) —
 * `b` above `a`, which is how a diode is drawn when its current must flow upward. Built
 * without a label: the group's rotation would turn the text on its side too.
 */
function verticalSym(
  make: (o: SymbolOptions) => CircuitSymbol,
  o: { id: string; x: number; y: number; size: number; color: string; up?: boolean },
): { node: Node; a: Point; b: Point } {
  const rotation = o.up === true ? -90 : 90;
  const sym = make({ id: o.id, x: o.x, y: o.y, size: o.size, color: o.color });
  return {
    node: { id: `${o.id}-v`, type: "group", x: 0, y: 0, rotation, anchor: { x: o.x, y: o.y }, children: [sym.node] },
    a: { x: o.x, y: o.y },
    b: { x: o.x, y: o.y + (o.up === true ? -o.size : o.size) },
  };
}

function caption(
  id: string,
  x: number,
  y: number,
  text: string,
  align: "left" | "center" | "right",
  fill: string,
  size = 15,
  weight = 600,
): Node {
  return { id, type: "text", x, y, text, fontFamily: LABEL_FONT, fontWeight: weight, fontSize: size, fill, align, baseline: "middle" };
}

function dot(id: string, p: Point, fill: string): Node {
  return { id, type: "ellipse", x: p.x - 4.5, y: p.y - 4.5, width: 9, height: 9, fill };
}

/**
 * Marching ants that keep marching. `wire({ current: true })` animates dashOffset only over
 * the first second, so on a thirty-second lesson the current freezes almost immediately;
 * this runs the offset over the whole scene at a steady 16 px per second.
 */
function currentWire(id: string, points: Point[], color: string, span: number): Node {
  return {
    id,
    type: "polyline",
    x: 0,
    y: 0,
    points,
    stroke: color,
    strokeWidth: 3,
    dash: [9, 7],
    dashOffset: 0,
    tracks: [
      {
        property: "dashOffset",
        keyframes: [
          { t: 0, value: 0 },
          { t: span, value: -16 * span },
        ],
      },
    ],
  } as Node;
}

function plainWire(id: string, points: Point[], color: string): Node {
  return { id, type: "polyline", x: 0, y: 0, points, stroke: color, strokeWidth: 2.5 };
}

/**
 * An opacity track that is 1 inside each window and 0 outside it, switching in a millisecond
 * so the transition reads as the diode turning on rather than as a fade.
 */
function gateTrack(windows: Window[], invert = false): Track {
  const lo = invert ? 1 : 0;
  const hi = invert ? 0 : 1;
  const keyframes: Array<{ t: number; value: number }> = [{ t: 0, value: lo }];
  const push = (t: number, value: number) => {
    const last = keyframes[keyframes.length - 1]!;
    keyframes.push({ t: Number(Math.max(t, last.t + 1e-3).toFixed(3)), value });
  };
  for (const w of windows) {
    push(w.on - 0.001, lo);
    push(w.on, hi);
    push(w.off, hi);
    push(w.off + 0.001, lo);
  }
  return { property: "opacity", keyframes };
}

/* ------------------------------------------------- the i–v test circuit */

export interface DiodeTestOptions {
  id: string;
  x: number;
  y: number;
  rLabel?: string;
  theme?: string;
}

/**
 * The curve tracer: a source, a series resistor to set the current, and the diode under
 * test. Sweep the source and the pair (v_D, i) traces the device's characteristic — which
 * is exactly what the lab does with a variable supply and a meter.
 */
export function diodeTestSchematic(o: DiodeTestOptions): DiodeSchematic {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const accent = theme.palette.accent;
  const EL = 70;
  const TOP = 30;
  const BOT = 190;
  const SRC_Y = 75;
  const D_X = 260;
  const children: Node[] = [];

  const src = verticalSym(battery, { id: `${o.id}-src`, x: 0, y: SRC_Y, size: EL, color: ink });
  const dio = verticalSym(diode, { id: `${o.id}-d1`, x: D_X, y: SRC_Y, size: EL, color: ink });
  const res = resistor({ id: `${o.id}-r`, x: 60, y: TOP, size: EL, color: ink, label: o.rLabel ?? "R = 1 kΩ" });

  // No marching ants here: the source is swept slowly through reverse bias, where no
  // current flows at all, so animating flow round the loop would be a lie for half of it.
  children.push(
    plainWire(`${o.id}-w-top-1`, [{ x: 0, y: TOP }, res.a], ink),
    res.node,
    plainWire(`${o.id}-w-top-2`, [res.b, { x: D_X, y: TOP }], ink),
    plainWire(`${o.id}-w-d-top`, [{ x: D_X, y: TOP }, dio.a], ink),
    dio.node,
    plainWire(`${o.id}-w-d-bot`, [dio.b, { x: D_X, y: BOT }], ink),
    plainWire(
      `${o.id}-w-bot`,
      [
        { x: D_X, y: BOT },
        { x: 0, y: BOT },
      ],
      ink,
    ),
    plainWire(`${o.id}-w-src-bot`, [{ x: 0, y: BOT }, src.b], ink),
    src.node,
    plainWire(`${o.id}-w-src-top`, [src.a, { x: 0, y: TOP }], ink),
  );

  children.push(caption(`${o.id}-vs`, -14, (SRC_Y + SRC_Y + EL) / 2, "v_S", "right", ink));
  children.push(caption(`${o.id}-d-lbl`, D_X + 20, SRC_Y + 12, "D1", "left", ink));
  children.push(caption(`${o.id}-vd`, D_X + 20, SRC_Y + EL - 12, "v_D", "left", theme.palette.primary));
  children.push(caption(`${o.id}-i`, 170, TOP - 22, "i →", "center", accent));

  return { node: { id: o.id, type: "group", x: o.x, y: o.y, children }, bbox: { w: 320, h: 220 } };
}

/* --------------------------------------------------------- half-wave */

export interface HalfWaveOptions {
  id: string;
  x: number;
  y: number;
  rLabel?: string;
  /** Lesson-time windows in which the diode is forward biased. Omit for a static drawing. */
  windows?: Window[];
  /** Seconds the marching ants run for. Default 40. */
  span?: number;
  theme?: string;
}

/**
 * The half-wave rectifier: source, one diode, one load. The loop is drawn twice — plain
 * wire underneath, and a lit marching-ants copy on top that exists only while the diode is
 * forward biased. Nothing else in the drawing moves, so "conducts only one way" is the one
 * thing the eye is left to notice.
 */
export function halfWaveSchematic(o: HalfWaveOptions): DiodeSchematic {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const accent = theme.palette.accent;
  const span = o.span ?? 40;
  const EL = 70;
  const TOP = 30;
  const BOT = 190;
  const SRC_Y = 75;
  const LOAD_X = 270;
  const OUT_X = 350;
  const children: Node[] = [];

  const src = verticalSym(acSource, { id: `${o.id}-src`, x: 0, y: SRC_Y, size: EL, color: ink });
  const load = verticalSym(resistor, { id: `${o.id}-rl`, x: LOAD_X, y: SRC_Y, size: EL, color: ink });
  const dio = diode({ id: `${o.id}-d1`, x: 70, y: TOP, size: EL, color: ink, label: "D1" });

  // The loop, as plain wire.
  const loop: Array<[string, Point[]]> = [
    [`${o.id}-w-src-top`, [{ x: 0, y: TOP }, dio.a]],
    [`${o.id}-w-top`, [dio.b, { x: LOAD_X, y: TOP }]],
    [`${o.id}-w-load-top`, [{ x: LOAD_X, y: TOP }, load.a]],
    [`${o.id}-w-load-bot`, [load.b, { x: LOAD_X, y: BOT }]],
    [
      `${o.id}-w-bot`,
      [
        { x: LOAD_X, y: BOT },
        { x: 0, y: BOT },
      ],
    ],
    [`${o.id}-w-src-bot`, [{ x: 0, y: BOT }, src.b]],
    [`${o.id}-w-src-lead`, [src.a, { x: 0, y: TOP }]],
  ];
  for (const [id, points] of loop) children.push(plainWire(id, points, ink));
  children.push(src.node, dio.node, load.node);

  // The output terminals, taken across the load.
  children.push(
    plainWire(
      `${o.id}-w-out-a`,
      [
        { x: LOAD_X, y: TOP },
        { x: OUT_X, y: TOP },
      ],
      ink,
    ),
    plainWire(
      `${o.id}-w-out-b`,
      [
        { x: LOAD_X, y: BOT },
        { x: OUT_X, y: BOT },
      ],
      ink,
    ),
    dot(`${o.id}-dot-a`, { x: OUT_X, y: TOP }, ink),
    dot(`${o.id}-dot-b`, { x: OUT_X, y: BOT }, ink),
  );

  children.push(caption(`${o.id}-vin`, -26, SRC_Y + EL / 2, "v_in", "right", theme.palette.primary));
  children.push(caption(`${o.id}-rl-lbl`, LOAD_X + 22, SRC_Y + EL / 2, o.rLabel ?? "R_L = 1 kΩ", "left", ink));
  children.push(caption(`${o.id}-vout`, OUT_X, TOP - 18, "v_out", "center", accent));

  // The lit copy: the same loop, marching, plus the diode redrawn in the accent colour.
  if (o.windows && o.windows.length > 0) {
    const litDiode = diode({ id: `${o.id}-d1-lit`, x: 70, y: TOP, size: EL, color: accent });
    const lit: Node = {
      id: `${o.id}-live`,
      type: "group",
      x: 0,
      y: 0,
      opacity: 0,
      tracks: [gateTrack(o.windows)],
      children: [...loop.map(([id, points]) => currentWire(`${id}-lit`, points, accent, span)), litDiode.node],
    };
    children.push(lit);
    // Below the loop, clear of the load resistor and its label.
    children.push({
      ...caption(`${o.id}-state-on`, 175, BOT + 34, "forward biased: current flows", "center", accent, 16, 700),
      opacity: 0,
      tracks: [gateTrack(o.windows)],
    } as Node);
    children.push({
      ...caption(`${o.id}-state-off`, 175, BOT + 34, "reverse biased: no current", "center", theme.palette.muted, 16, 700),
      opacity: 0,
      tracks: [gateTrack(o.windows, true)],
    } as Node);
  }

  return { node: { id: o.id, type: "group", x: o.x, y: o.y, children }, bbox: { w: 400, h: 220 } };
}

/* ------------------------------------------------------------- bridge */

export interface BridgeOptions {
  id: string;
  x: number;
  y: number;
  rLabel?: string;
  cLabel?: string;
  /** Lesson time the smoothing capacitor branch appears. Omit to leave it out entirely. */
  capAt?: number;
  /** Windows in which D1 and D4 conduct (the positive half-cycles). */
  posWindows?: Window[];
  /** Windows in which D2 and D3 conduct (the negative half-cycles). */
  negWindows?: Window[];
  span?: number;
  theme?: string;
}

/**
 * The bridge rectifier, drawn as a square rather than a diamond so every conductor is
 * axis-aligned: two columns of two diodes, all four pointing up toward the positive rail,
 * the source across the middle row and the load on the right. Four nodes where three
 * conductors meet, each an explicit shared endpoint.
 *
 * Both half-cycles reach the load, through a different diagonal pair each time, so the
 * pairs are lit in alternation: D1 and D4 while the source's left terminal is positive,
 * D2 and D3 while it is negative.
 */
export function bridgeSchematic(o: BridgeOptions): DiodeSchematic {
  const theme = getTheme(o.theme);
  const ink = theme.palette.text;
  const accent = theme.palette.accent;
  const span = o.span ?? 40;
  const LX = 60;
  const RX = 200;
  const P = 25;
  const M = 115;
  const N = 205;
  const LEG = M - P; // 90: each diode spans a whole row gap.
  const SRC_X = 100;
  const SRC_W = 80;
  const LOAD_X = 330;
  const CAP_X = 420;
  const EL = 90;
  const children: Node[] = [];

  const mk = (id: string, x: number, y: number, color: string) => verticalSym(diode, { id, x, y, size: LEG, color, up: true });
  const d1 = mk(`${o.id}-d1`, LX, M, ink);
  const d3 = mk(`${o.id}-d3`, LX, N, ink);
  const d2 = mk(`${o.id}-d2`, RX, M, ink);
  const d4 = mk(`${o.id}-d4`, RX, N, ink);
  const src = acSource({ id: `${o.id}-src`, x: SRC_X, y: M, size: SRC_W, color: ink });
  const load = verticalSym(resistor, { id: `${o.id}-rl`, x: LOAD_X, y: (P + N) / 2 - EL / 2, size: EL, color: ink });

  const rails: Array<[string, Point[]]> = [
    [
      `${o.id}-w-p-1`,
      [
        { x: LX, y: P },
        { x: RX, y: P },
      ],
    ],
    [
      `${o.id}-w-p-2`,
      [
        { x: RX, y: P },
        { x: LOAD_X, y: P },
      ],
    ],
    [
      `${o.id}-w-n-1`,
      [
        { x: LX, y: N },
        { x: RX, y: N },
      ],
    ],
    [
      `${o.id}-w-n-2`,
      [
        { x: RX, y: N },
        { x: LOAD_X, y: N },
      ],
    ],
    [`${o.id}-w-load-top`, [{ x: LOAD_X, y: P }, load.a]],
    [`${o.id}-w-load-bot`, [load.b, { x: LOAD_X, y: N }]],
  ];
  for (const [id, points] of rails) children.push(plainWire(id, points, ink));
  children.push(plainWire(`${o.id}-w-ac-l`, [{ x: LX, y: M }, src.a], ink), plainWire(`${o.id}-w-ac-r`, [src.b, { x: RX, y: M }], ink));
  children.push(d1.node, d2.node, d3.node, d4.node, src.node, load.node);
  for (const [id, p] of [
    [`${o.id}-n-p`, { x: RX, y: P }],
    [`${o.id}-n-n`, { x: RX, y: N }],
    [`${o.id}-n-a`, { x: LX, y: M }],
    [`${o.id}-n-b`, { x: RX, y: M }],
  ] as Array<[string, Point]>)
    children.push(dot(id, p, ink));

  children.push(
    caption(`${o.id}-d1-lbl`, LX - 22, (P + M) / 2, "D1", "right", ink, 14),
    caption(`${o.id}-d3-lbl`, LX - 22, (M + N) / 2, "D3", "right", ink, 14),
    caption(`${o.id}-d2-lbl`, RX + 22, (P + M) / 2, "D2", "left", ink, 14),
    caption(`${o.id}-d4-lbl`, RX + 22, (M + N) / 2, "D4", "left", ink, 14),
    caption(`${o.id}-vin`, SRC_X + SRC_W / 2, M + 32, "v_in", "center", theme.palette.primary),
    caption(`${o.id}-rl-lbl`, LOAD_X - 22, M, o.rLabel ?? "R_L = 1 kΩ", "right", ink),
    caption(`${o.id}-vout`, LOAD_X, P - 20, "v_out", "center", accent),
  );

  /**
   * The two conducting diagonals, lit in alternation — and only the rails each one's
   * current really takes. On the positive half the current climbs the left column and
   * crosses the whole positive rail; on the negative half it climbs the right column
   * straight into the load, and the far left of the positive rail carries nothing.
   */
  const railsByName = new Map(rails);
  const pair = (id: string, windows: Window[] | undefined, legs: Point[], carries: string[], label: string) => {
    if (!windows || windows.length === 0) return;
    children.push({
      id: `${o.id}-${id}`,
      type: "group",
      x: 0,
      y: 0,
      opacity: 0,
      tracks: [gateTrack(windows)],
      children: [
        ...carries.map((wid) => currentWire(`${wid}-${id}`, railsByName.get(wid)!, accent, span)),
        currentWire(`${o.id}-w-ac-l-${id}`, [{ x: LX, y: M }, src.a], accent, span),
        currentWire(`${o.id}-w-ac-r-${id}`, [src.b, { x: RX, y: M }], accent, span),
        ...legs.map((leg, k) => mk(`${o.id}-${id}-lit-${k}`, leg.x, leg.y, accent).node),
        caption(`${o.id}-${id}-lbl`, (LX + RX) / 2, P - 20, label, "center", accent, 15, 700),
      ],
    });
  };
  pair(
    "pair-a",
    o.posWindows,
    [
      { x: LX, y: M },
      { x: RX, y: N },
    ],
    [`${o.id}-w-p-1`, `${o.id}-w-p-2`, `${o.id}-w-load-top`, `${o.id}-w-load-bot`, `${o.id}-w-n-2`],
    "D1 and D4 conduct",
  );
  pair(
    "pair-b",
    o.negWindows,
    [
      { x: RX, y: M },
      { x: LX, y: N },
    ],
    [`${o.id}-w-p-2`, `${o.id}-w-load-top`, `${o.id}-w-load-bot`, `${o.id}-w-n-2`, `${o.id}-w-n-1`],
    "D2 and D3 conduct",
  );

  // The smoothing capacitor, across the load.
  if (o.capAt !== undefined) {
    const cap = verticalSym(capacitor, { id: `${o.id}-c`, x: CAP_X, y: (P + N) / 2 - EL / 2, size: EL, color: ink });
    children.push({
      id: `${o.id}-cap`,
      type: "group",
      x: 0,
      y: 0,
      opacity: 0,
      tracks: [
        {
          property: "opacity",
          keyframes: [
            { t: o.capAt, value: 0 },
            { t: o.capAt + 0.5, value: 1 },
          ],
        },
      ],
      children: [
        plainWire(
          `${o.id}-w-c-top`,
          [
            { x: LOAD_X, y: P },
            { x: CAP_X, y: P },
          ],
          ink,
        ),
        plainWire(`${o.id}-w-c-up`, [{ x: CAP_X, y: P }, cap.a], ink),
        cap.node,
        plainWire(`${o.id}-w-c-dn`, [cap.b, { x: CAP_X, y: N }], ink),
        plainWire(
          `${o.id}-w-c-bot`,
          [
            { x: LOAD_X, y: N },
            { x: CAP_X, y: N },
          ],
          ink,
        ),
        caption(`${o.id}-c-lbl`, CAP_X + 22, M, o.cLabel ?? "C = 47 µF", "left", theme.palette.secondary),
      ],
    });
  }

  return { node: { id: o.id, type: "group", x: o.x, y: o.y, children }, bbox: { w: 540, h: 230 } };
}
