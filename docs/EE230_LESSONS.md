# EE 230 animated lessons

Narrated, animated lessons for Electronic Circuits and Systems (EE 230, Iowa State;
Geiger, Sedra/Smith), built for a student four semesters away from circuits. Every lesson
shows the three views the course is organised around, in one fixed layout, driven from one
clock: the schematic (top-left), the waveforms against time as a lab scope would show them
(top-right), the transfer view — Bode plot or V_out against V_in — (bottom-right), and the
equations arriving as they are needed (bottom-left).

## Watching one

A brief that names the topic is enough. The lesson is used verbatim and no model is called:

```
npm run brief -- "explain the frequency response of an RC lowpass"
npm run brief -- "why does current lead voltage in a capacitor"
```

Any brief that names no lesson topic authors freehand as before. The lessons are also
catalog tools reachable through `/assemble` by name, and `/generate` reports which lesson
answered a brief in `provenance.validation.lesson`.

## Lessons

| tier | lesson | shows |
|---|---|---|
| 0 | `ee.ohmKvlKcl` | one loop with V = IR read live; a branch appears and the current splits at the node |
| 0 | `ee.capacitorInductor` | v and i on one axis: the capacitor's current a quarter cycle early, the inductor's a quarter cycle late |
| 0 | `ee.sinusoids` | amplitude, frequency, phase turned one at a time against a dashed reference |
| 0 | `ee.impedancePhasors` | the spinning arrow whose shadow is the sine wave; Z_C falling and Z_L rising to cross at resonance |
| 1 | `ee.transferCharacteristic` | one sinusoid through linear, bent, and clipped characteristics; the output peaks bend where the curve does |
| 1 | `ee.theoremOne` | RC lowpass, two-decade sweep: output shrinks and lags while a dot rides the Bode plot to −3 dB and −45° |
| 1 | `ee.rcFilters` | lowpass and highpass side by side; outputs trade places; both Bode dots meet at the corner |
| 1 | `ee.polesStepResponse` | one pole, a step, 63% at exactly τ; the pole slides left and the step is answered faster |
| 2 | `ee.opAmpRules` | the bare op-amp's gain climbing to 200 000 and slamming the rails; the loop closes and drags v− onto v+; the characteristic on a ±10 mV axis |
| 2 | `ee.invertingAmp` | gain −R_f/R_in read live; R_f doubles and the transfer line tips while the output grows, both on one voltage scale |
| 2 | `ee.nonInvertingSumming` | gain 1 + R_f/R_g in phase; then two inputs on their own planes and their weighted sum on a third |
| 2 | `ee.integrator` | the brief that started this: square in, triangle out, slope −V_in/(RC) read live; then the swap to the differentiator |

Tiers 3 to 5 (real op-amps, comparators and waveform generation, diodes)
are specified in `superpowers/specs/2026-09-05-ee230-tiers-2-5-design.md` and appear here
as they land.

## Known caveats

Honest limits of what exists. Each tier's build appends its own.

**Kit and all tiers**

- **The scope's timebase is scaled to fit the screen.** During a frequency sweep the real
  ω is far too fast to draw, so the drawn waveform's frequency is the real one times a
  constant. Gain and phase shift are evaluated at the real ω, and the counters show the
  real ω, but the time axis of the drawn trace is qualitative.
- **Frames were checked, playback was not.** Two or three frames of every lesson were
  rendered and looked at. Nobody has watched a full lesson or heard its narration; the
  narration timing uses the assembler's speech-length estimate.
- **A brief's component values are not extracted for lessons.** Asking for a 2.2 kΩ
  lesson gets the 1 kΩ default. Schematic routing does extract values; lesson routing
  does not yet.
- **Plain-text labels are pinned to Inter.** The theme font lacks ω, θ, φ and subscripts,
  and no pinned font has ∠. ∠ appears only inside KaTeX; plain text writes `arg T`.
- **The lesson phrase table is hand-maintained.** A brief phrased in a way the table does
  not anticipate authors freehand instead. Every phrase in the table is proven to select a
  registered lesson, but coverage of ways to ask is not measured.
- **Text-fit and connectivity passes do not run on lessons.** A lesson is returned
  verbatim from the catalog with its connectivity and accessibility audit attached; the
  freehand repairs are not applied, on the grounds that a lesson is placed deliberately.

**Tier 0–1 specifics**

- `ee.impedancePhasors` draws |Z| on log axes as the length of the phasor; the quarter
  turn from the `j` is narrated and shown in the equation, not animated on the arrow.
- `ee.ohmKvlKcl` shows DC as flat lines on the scope by design; a student may find a
  scope of constants odd until the narration says why.
- `ee.polesStepResponse` plots time in units of τ₁ so both responses share an axis; the
  counter gives τ in microseconds.

**Tier 2 — ideal op-amps**

- **The op-amp is a pure DC gain with hard clipping**: v_out = clip(A·(v+ − v−), ±13 V). No
  pole, no slew limit, no offset. Tier 3 is where each of those breaks, by design.
- **Closed-loop traces come from the ideal-rule formula, not a solved loop.** Self-consistent
  and numerically right, but not a circuit simulation.
- **`ee.opAmpRules` drives the bare op-amp with a 5 V differential input**, beyond most
  devices' rating. A deliberate exaggeration so the rail-slamming is legible.
- **The integrator has no DC-blocking resistor across C**; a real one drifts into a rail on
  offset alone. The differentiator's edges are drawn analytically vertical; a real one rings.
- **Only `ee.integrator` carries real time units** (ms), because only there must a real number
  (1 V/ms) be readable. The other three time axes are unitless, like Tiers 0–1.
- **`nonInvertingStage` has one wire crossing without a dot** — standard drafting, but a
  beginner may misread it. The symbol set has no mirrored op-amp to avoid it.
- **`opAmpStage.bbox` is advisory**: content extends about 32 px above the group origin (the
  feedback element's label). Place a stage about 30 px below the top of its slot.
- **Routing deliberately does not claim "op amp", "operational amplifier", or "negative
  feedback."** A second lesson matching an unrelated phrase cancels selection, and those
  words appear in almost every Tier 3–4 brief. Consequence: a bare "explain an op amp" routes
  to no lesson. "voltage follower" and "unity gain buffer" are also unclaimed, since the
  non-inverting lesson shows a gain of 2, not 1.
- **The connectivity gate is geometric, not electrical.** It proves no conductor is stranded;
  it cannot tell a feedback resistor wired to the wrong node from a right one. Topology is
  guaranteed only by wiring to reported terminals.
- **No test asserts that labels do not overlap parts.** Every layout defect in this tier was
  found by rendering and looking; a future edit could reintroduce one silently.
