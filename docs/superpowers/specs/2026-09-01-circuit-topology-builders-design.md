# Topology-correct circuit builders

Issue: [#121](https://github.com/JacobTDang/Showman/issues/121) — schematics are drawn
freehand and come out disconnected.

## Problem

Two separate faults sit behind this issue, and the second is the one the proposed fix
misses.

**Connectivity.** `/generate` (`src/service/httpServer.ts:252`) routes a brief to
`AuthoringAgent.authorSpec`, where a model emits primitives by eye. `/assemble`
(`httpServer.ts:158`), the route that runs the catalog builders, is never touched by it.
Nothing guarantees a wire meets a component, and measured output shows 50px gaps on both
sides of every element and no closed loop at all.

**Topology.** The proposed fix — route schematic briefs to `physics.circuit` — cannot
carry the issue on its own. That builder declares a v1 scope cut of *series only*
(`src/catalog/physics/circuit.tool.ts:23`), and its Zod enum rejects `opamp` and `ground`
outright. Against the three reported failures:

| Reported brief | Topology required | Expressible today |
|---|---|---|
| Half-wave rectifier | source → diode → load, series | yes |
| Thevenin equivalent | R2 **shunt** across A–B | no — parallel branch |
| Op-amp integrator | C in the **feedback path** | no — no op-amp, no feedback net |

Routing the latter two to a series-only builder yields a schematic that is connected and
still wrong — the failure the issue itself calls worse than an unlabelled one
("a *confidently wrong* one teaches the wrong circuit"). Acceptance criterion 2, "the
drawn topology matches the relationship the equations state", cannot be met by routing
alone. This spec closes that gap.

## Scope

Add the builders that can draw the two missing topologies correctly, following the
`physics.rcCharging` precedent: one builder per lesson shape, composing the existing
symbol primitives, with topology correct by construction.

**Not in this slice:** routing briefs to these builders. They remain unreachable from
`/generate` until something selects them — the separate architectural change recorded on
the issue as too large to make unattended. This work makes that change worth making; it
does not make it.

Also out of scope: a general net-list builder with automatic placement and orthogonal
routing. That is a schematic auto-router, much larger than this issue and easy to get
subtly wrong.

## Design

### 1. `opAmp` symbol primitive

New export in `src/physics/circuit.ts`. None exists today, which is why the reported
integrator drew its op-amp as a plain rounded rectangle with a ground glyph floating
inside it.

An op-amp has three terminals, so it cannot use `CircuitSymbol`'s `a`/`b` pair:

```ts
export interface OpAmpSymbol {
  node: GroupNode;
  inMinus: Point;
  inPlus: Point;
  out: Point;
}
export function opAmp(opts: SymbolOptions): OpAmpSymbol;
```

Triangle body `(x, y) → (x, y + size) → (x + size, y + size/2)`, with `−` and `+` glyphs
drawn just inside the left edge at the input heights. Each terminal sits at the end of a
short lead, so a wire meets a lead end rather than an arbitrary point on a triangle edge:

- `inMinus` = `(x − lead, y + size/3)`
- `inPlus` = `(x − lead, y + 2·size/3)`
- `out` = `(x + size + lead, y + size/2)`

### 2. `physics.voltageDivider`

```
      ●────[R1]────●────────● A
      │            │
   (source)       [R2]
      │            │
      ●────────────●────────● B
```

R2 is a shunt branch from the junction after R1 down to the return rail. The builder has
no way to place it in series, so `V_Th = V·R2/(R1+R2)` describes the circuit that is
actually drawn.

Params:

```ts
{
  sourceKind: "battery" | "acSource"   // default "battery"
  sourceLabel?: string                 // e.g. "12 V"
  r1Label?: string                     // e.g. "R1 = 4 kΩ"
  r2Label?: string                     // e.g. "R2 = 2 kΩ"
  outputLabels?: [string, string]      // default ["A", "B"]
  theme?: string
}
```

Geometry, local coordinates, element size 70 to match `physics.circuit`:

| Feature | Position |
|---|---|
| top rail | `y = 30` |
| return rail | `y = 190` |
| vertical element lead | `(190 − 30 − 70) / 2 = 45`, so a vertical element runs `y = 75..145` |
| source | rotated at `x = 0`, terminals `(0,75)` and `(0,145)` |
| R1 | horizontal, terminals `(60,30)` and `(130,30)` |
| junction J | `(200, 30)` |
| R2 | rotated at `x = 200`, terminals `(200,75)` and `(200,145)` |
| terminals A / B | `(280, 30)` and `(280, 190)`, each a dot plus a label |

`bbox` = `{ w: 300, h: 210 }`.

### 3. `physics.opAmpStage`

```
          ┌──────[Zf]──────┐
          │                │
  Vin ●──[Zin]────●────────┤−╲
                           │  ╲──● Vout
                       ┌───┤+ ╱
                      GND  ╱
```

The feedback element sits on the feedback rail running over the top of the op-amp, from
the inverting node to the output node. It cannot be drawn in series on the input.

Params:

```ts
{
  inputKind: "resistor" | "capacitor"      // default "resistor"
  feedbackKind: "resistor" | "capacitor"   // default "capacitor"
  inputLabel?: string                      // e.g. "R = 10 kΩ"
  feedbackLabel?: string                   // e.g. "C = 100 nF"
  inputTerminalLabel?: string              // default "Vin"
  outputTerminalLabel?: string             // default "Vout"
  theme?: string
}
```

One builder therefore covers the inverting amplifier (R, R), the integrator (R, C) and
the differentiator (C, R). The reported brief is the integrator.

Geometry, local coordinates, op-amp size 90 and lead 20:

| Feature | Position |
|---|---|
| feedback rail | `y = 20` |
| input rail | `y = 90` |
| op-amp body | `(240, 60) → (240, 150) → (330, 105)` |
| `inMinus` / `inPlus` / `out` | `(220, 90)` / `(220, 120)` / `(350, 105)` |
| Vin terminal | `(0, 90)`, dot plus label |
| Zin | horizontal, terminals `(40, 90)` and `(110, 90)` |
| inverting junction J | `(150, 90)` |
| Zf | horizontal, terminals `(190, 20)` and `(260, 20)` |
| feedback drop | `(380, 20) → (380, 105)` |
| Vout terminal | `(440, 105)`, dot plus label |
| ground | below `inPlus`, wire `(220,120) → (220,170)`, symbol at `(220,170)` |

`bbox` = `{ w: 460, h: 220 }`.

### Vertical elements

Every symbol in `circuit.ts` is drawn horizontally, with terminal `a` on the left and `b`
on the right. The source and R2 in the divider are vertical.

Rather than add vertical symbol geometry, the horizontal symbol is wrapped in a group
carrying `rotation: 90` with `anchor` set to the symbol's own `a` point. The renderer
applies `translate(anchor) → rotate → translate(−anchor)`
(`src/engine/render.ts:151-154`), and a canvas rotation of +90° with y pointing down maps
the offset `(size, 0)` to `(0, size)`. So `a` stays put and `b` lands exactly at
`(a.x, a.y + size)` — analytically exact, and asserted by a test rather than assumed.

The symbol is built **without** its label and an upright text node is placed beside the
element instead, so the label does not rotate onto its side. A convenient consequence:
the #124 text-fit pass skips subtrees under a rotation, so it will not disturb these.

### Registration

Two imports and two array entries in `src/catalog/register.ts`, alongside `circuitTool`
and `rcChargingTool`.

## Testing

The connectivity assertions mirror those already in
`test/unit/builderPlacements.test.ts`, which measure the property this issue is about.

| Test | Asserts |
|---|---|
| rotation maps `b` below `a` | a rotated element's far terminal lands at `(a.x, a.y + size)` — the assumption the vertical layout rests on |
| divider: no stranded endpoint | every wire endpoint is within 15px of another endpoint, as `builderPlacements.test.ts` measures |
| **divider: R2 is shunt, not series** | R2's top terminal coincides with the junction between R1's right terminal and terminal A, and its bottom terminal sits on the return rail |
| divider: closed loop | wire extents span both rails, source rail to output rail |
| op-amp: three distinct terminals | `inMinus`, `inPlus`, `out` are distinct points, `out` on the opposite side from the inputs |
| op-amp: body is a triangle | the body node is a 3-point closed polyline, not a rect |
| **op-amp: feedback returns to the inverting input** | a wire path runs from the output node through Zf back to the inverting node — failing if Zf were placed on the input rail |
| op-amp: ground on the non-inverting input | a ground symbol connects to `inPlus`, and to nothing else |
| op-amp: element kinds | `inputKind`/`feedbackKind` select the drawn symbol; the integrator case (R, C) draws a resistor on the input and a capacitor on the feedback rail |
| both: spec validity | each builder's node passes `validateScene` when placed in a scene |
| both: determinism | the same params produce byte-identical output |

The two bolded tests are acceptance criterion 2 encoded as assertions: each fails if the
element is placed in the series position the freehand output chose.

## Acceptance criteria mapping

- [x] A circuits brief produces a schematic whose wires meet every component terminal —
  by construction in these builders, and asserted. Note this holds for output *from the
  builders*; freehand output is unaffected until routing lands.
- [x] The drawn topology matches the relationship the equations state — the divider draws
  a shunt, the op-amp stage draws a feedback path, and neither can draw the series
  alternative.
- [ ] A disconnected schematic fails rather than being published — **not addressed here.**
  That is a gate on freehand output, and it needs a definition of "component terminal"
  that a flat primitive list does not carry. Recorded on the issue.
