# Science & Physics — Deep-Dive Roadmap

Output of a PM deep-research pass (chemistry + physics), grounded in PhET, manim-physics /
manim-chemistry, and standard textbook figure sets. Everything below is a **pure build-time builder**
over existing primitives unless flagged — so it is deterministic + golden-safe by construction. Goldens
**avoid shadow blur**; use radial gradients for glow/intensity instead.

## Where we are

- **Physics** (`src/physics/`): `forceDiagram` (free-body) + DC circuit symbols (resistor/battery/
  capacitor/lamp/ground + animated-current wire). Statics only — ~10% of an intro curriculum.
- **Chemistry** (`src/chem/`): `chemEquation` (mhchem typeset), 2D ball-and-stick `molecule` (4 presets),
  `reaction`, CPK colors. No geometry model, graphs, periodic table, or apparatus.

## Highest-leverage additions

- **Physics — kinematics motion substrate.** `plotParametric((t)→{x,y})` + a `movingMarker` that rides
  uniform-Δt samples through `followPath` (whose even-time spacing makes on-screen speed = dx/dt for
  free — slows at a projectile's apex, no engine change) + a synced `motionGraph` (x-t/v-t/a-t drawing
  in lockstep with the moving object). One substrate → projectile, inclined-plane slide, SHM,
  collisions, circular motion, energy-vs-time all compose on it.
- **Chemistry — `energyDiagram` (reaction-coordinate).** Cheapest big win: `coordinatePlane` +
  `plotFunction` (plateau→Gaussian bump→plateau) + dashed Eₐ/ΔH labels + optional catalyst curve. Ships
  first while the molecule layout engine (the chemistry keystone, large) is built later.

## Roadmap (impact-per-effort order)

### Batch P1 — physics motion substrate (the keystone)
- `plotParametric(plane, fn, {tMin,tMax,samples}, style)` — build-time sampled trajectory polyline.
- `movingMarker(plane, traj, {window, easing})` — a body whose x/y tracks ride uniform-Δt samples.
- `projectile({origin, speed, angle, g, showTrajectory/Velocity/Components})`.
- `motionGraph({series:[{kind:'x'|'v'|'a', fn}], window, trace})` — synced drawing graphs.
- `energyBars`/`energyPie` — KE↔PE conservation (cheap, central).
- `inclinedPlane({angle, length, body, forces, slide?})` — reuses `forceDiagram`.

### Batch P2 — E&M / waves / circuits
- `vectorField({cols, rows, field:(x,y)→{vx,vy}, colorByMagnitude})` — one primitive → E/B/gravity.
- `fieldLines({charges})` + charges with radial-gradient glow.
- Circuit symbol expansion: switch, inductor, AC source, diode, meter; RC-curve via `plotFunction`.
- `emSpectrum` gradient bar; `energyLevels` diagram; `bohrAtom`.
- Oscillators: `spring` (coil polyline) + `pendulum` (rotation `easeInOutSine`) → feed `motionGraph`.
- `rayDiagram` + `lens`/`mirror` (principal rays, exact build-time geometry); `snell` refraction.

### Batch C1 — chemistry graphs + fixes
- `energyDiagram` (reaction-coordinate) — **ship first**.
- `phScale` (gradient bar + marker) + `titrationCurve` (logistic on `coordinatePlane`).
- `heatingCurve` / `phaseDiagram`.
- Fix two defects: (1) reaction arrow strikes through its condition label — gap the stroke or place the
  label above; (2) `molecule` uses `shadow.blur:6` (not golden-safe) — add a flat gradient + hard
  offset-shadow styling path.

### Batch C2 — chemistry structure + reference
- `lewisStructure` (dots + bonds + lone pairs + formal charge).
- Shared `elements` data table (Z, symbol, group/period, block, EN, radius, shells) — feeds the rest.
- `periodicTable` + trend overlays (`box()` grid + `clip` highlight sweep).
- `vseprShape` (reuses `buildAngle`; wedge/dash stereo bonds).
- `electronConfig` / orbital boxes; `bohrModel`.
- **Keystone (large):** molecule layout engine + named/formula library (curated connection tables +
  a 2D layout pass; optional SMILES-lite) → unlocks skeletal organic, isomers, VSEPR projections.

## One deferred engine gap
Continuously *traveling* waves / swirling fields need per-frame phase, but `plotFunction`/`plotParametric`
sample at build time. Standing waves + SHM work today via `polyline.morph` between phase extremes driven
by a sine easing. Only if traveling waves become core: a small deterministic render-time `wave` node
(phase = f(time)) — a later, scoped engine RFC. Ship everything else first.
