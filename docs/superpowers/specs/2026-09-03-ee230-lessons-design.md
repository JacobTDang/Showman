# EE 230 animated circuit lessons — sub-project 1

Context: the user is taking EE 230 (Electronic Circuits and Systems, Iowa State; Geiger,
Sedra/Smith) after four semesters away from circuits. Existing circuit output is a static
schematic — the least informative of the three views the course is organised around.

## The three views

Geiger's review handout frames the whole course on *transfer characteristics* (output vs
input) and *transfer functions* T(s), with Theorem 1: a sinusoid in gives a sinusoid out
scaled by |T(jω)| and shifted by ∠T(jω). Understanding a circuit means holding three views
at once: the schematic, the waveforms vs time (the lab scope), and the transfer view (Bode
or V_out-vs-V_in). Every lesson shows all three, in one fixed layout, so the reader learns
to read it once.

## The kit — `src/lessons/ee/kit.ts`

- `scopePane` wraps `motionGraph`: input and output as two stacked `fn(t)` series traced on
  a shared time axis, so phase shift is a visible horizontal offset and gain a height.
- `bodePane` on `coordinatePlane` + `plotFunction` with x in decades, log10(ω/ω0), which
  makes a Bode plot linear; magnitude in dB and phase in degrees stacked; a `movingMarker`
  operating-point dot driven by the same ω(t) that drives the scope.
- `equationPane` wraps `texToNodes` with a fade at the beat that introduces it.
- `eeLesson({ title, beats })` sequences beats, computes duration, emits narration
  segments at beat starts, and returns a valid 1280×720 SceneSpec. Layout: schematic
  top-left, equation bottom-left, scope top-right, transfer view bottom-right.

The scope during a frequency sweep draws a chirp: φ(t) = ∫ω, so the trace's local
frequency rises left to right while the output shrinks and lags, and the Bode dot rides
the curve at the same instant. Sweep range is bounded by the scope's sampling so the
top frequency stays well above the Nyquist limit of the drawn polyline.

## Lessons

Tier 0 (foundations EE 230 assumes): `ee.ohmKvlKcl`, `ee.capacitorInductor`,
`ee.sinusoids`, `ee.impedancePhasors`.
Tier 1 (weeks 1–3): `ee.transferCharacteristic`, `ee.theoremOne` (flagship),
`ee.rcFilters`, `ee.polesStepResponse`.

Each is a scene-level catalog builder, reachable via `/assemble` and `npm run brief`, and
routed from `/generate` by topology-naming phrases.

## Testing

Panes are tested on the physics: the Bode dot lands at −3.01 dB and −45° at ω = 1/RC;
scope output amplitude equals |T(jω)|·V_in at sampled instants; schematics pass
`connectivityGaps`. Every lesson validates, is byte-deterministic, and has
non-overlapping narration.

## Not in this sub-project

Tiers 2–5: op-amps ideal and real, comparators and hysteresis, diodes and rectifiers.
