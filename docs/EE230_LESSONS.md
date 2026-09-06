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
| 5 | `ee.diodeIV` | the i–v curve swept live on a log current axis, nanoamps to milliamps, with the 0.7 V model drawn over the exponential |
| 5 | `ee.halfWaveRectifier` | the brief that opened #121, done right: the loop lit only while forward biased, the missing half visible, the dot on the i–v curve |
| 5 | `ee.fullWaveAndSmoothing` | the bridge delivering both halves at twice the line frequency; then C across the load, ripple read live against I_L/(fC) |
| 3 | `ee.saturation` | the input climbs while the output follows at −R_f/R_in until it hits ±V_sat; the two peak counters part company at V_in = 3.25 V |
| 3 | `ee.slewRate` | a 741 at 0.5 V/µs: one square wave, three outputs — still square, trapezoid, triangle — and the peak-to-peak curve cornering at SR/4V_p |
| 3 | `ee.gainBandwidth` | the open-loop line and three closed-loop shelves; the counter reads G × bandwidth holding 1.000 MHz while the two trade |
| 4 | `ee.comparator` | no feedback: a noisy input crossing V_ref makes the output chatter, 14 edges for two crossings, the step drawn vertical |
| 4 | `ee.schmittTrigger` | positive feedback gives two thresholds at ±βV_sat; the same input now gives two clean edges; the hysteresis loop traced live |
| 4 | `ee.relaxationOscillator` | the Schmitt charging its own capacitor: the sawtooth between the thresholds, the square out, T = 2RC ln((1+β)/(1−β)) read off the scope |

All five tiers are built. The design is in `superpowers/specs/2026-09-03-ee230-lessons-design.md` and
`superpowers/specs/2026-09-05-ee230-tiers-2-5-design.md`.

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

**Tier 5 — diodes and rectifiers**

- **Diode model: I_S = 0.30 nA, n = 1.8, V_T = 25.9 mV.** n = 1.8 is a large-junction power
  rectifier like the lab's 1N4006; I_S was then solved so the knee sits at ~1 mA at 0.7 V. The
  constants are shown on screen.
- **The ripple formula disagrees with the drawn ripple by about 22 %** (1.18 V measured vs
  1.52 V from I_L/(fC) at 47 µF). That is correct physics — the textbook formula assumes
  discharge over the whole half-cycle when it lasts ~7.0 ms of 8.33 — and the lesson shows
  both numbers and says why. The test tolerance on that comparison is a loose 30 %; the tight
  assertion is that the decay is exactly exponential in R_L·C.
- **The smoothing model is ideal**: zero source resistance, zero diode resistance, instant
  recharge. Real recharge bursts are wider and lower. The bridge's conduction angle uses
  |v_in| > 1.4 V rather than the exponential the half-wave lesson solves exactly.
- **Time is scaled.** The physics runs at a real 60 Hz (τ, ripple frequency); the drawing is
  slowed, the axis says "N cycles of a 60 Hz input" and draws no time ticks, so nothing false
  is drawn — but a viewer who times the animation gets the wrong frequency.
- **Ripple is about 13 px tall** on the output plane. Legible with the dashed rules and the
  live counter, but small; a larger C would make it invisible.
- **The capacitor branch is not lit during recharge bursts**, only the bridge legs and the
  load. The equation v_out = |v_in| − 1.4 stays on screen through the smoothing beat, where
  it no longer describes the output.
- **`ee.diodeIV` sweeps v_D directly, as a curve tracer does**; the series R is drawn as the
  current limiter it is but the sweep is not computed through it.
- **Routing: bare "rectifier" is unclaimed.** "ripple on a rectifier with a filter capacitor"
  would match two lessons and select nothing, so a vague "animate a rectifier" brief authors
  freehand. "the diode during the positive half-cycle" routes to `ee.diodeIV`, not the
  half-wave lesson, and claiming half-cycle phrases for both would cancel both.
- **A lesson phrase can silently break another test's fixture.** Tier 5's phrases made the
  brief in `test/unit/textFit.test.ts` route to a lesson before the author ran, so that
  fixture never reached the pass it tested. Its brief was changed. Any new phrase that
  matches an existing test fixture's brief will do the same.
- **`\begin{cases}` and `\dfrac` render as empty groups** in this KaTeX path: an equation
  laid out, timed, narrated and invisible. Found by rendering; use `\frac` and stacked lines.
- **Pane nodes must be built inside their pane's group.** A `movingMarker` or rule created
  outside lands at the scene's top-left corner. Found by rendering.

**Tier 3 — real op-amps**

- **The three limits are modelled one at a time, never together.** Saturation has no slew
  limit and no pole; the slew lesson has no clipping and no roll-off; gain-bandwidth is purely
  linear. A real 741 does all three at once.
- **The slew model is a pure rate limiter**, not a two-pole op-amp: no overshoot, no
  asymmetry between rising and falling slew, and its initial condition is chosen as the
  symmetric steady state rather than converged to. The slew counters read the *mean* slope
  over a half period; the instantaneous edge slope is always exactly SR and is in the equation.
- **The slew transfer view mixes a square-wave result with a sine-wave name.** The curve is
  the square wave's achieved peak-to-peak, cornering at SR/4V_p = 25 kHz; the full-power
  bandwidth (15.9 kHz) is the sinusoidal limit and appears only as text. Both carry their
  formula; a hurried reader could conflate them.
- **The gain-bandwidth closed loop assumes an ideal feedback network** — no loading, no input
  capacitance, no second pole, so no peaking and no stability discussion. Phase is not plotted.
- **V_sat is a flat 13 V** regardless of load or supply. The supply pins are stubs, not
  busbars to the drawing's edge.
- **Two of three time axes are lesson clocks.** The slew scope draws four cycles of each
  frequency on one axis, so the drawn frequencies are equal while the real ones differ by 50×;
  the gain-bandwidth scope holds the drawn frequency fixed and shrinks the envelope while the
  real frequency sweeps seven decades. Both are stated on the axis and in the narration.
- **The gain-bandwidth scope is blank for the first 24 s** — the Bode plot has to be built
  first.
- **Only the default theme was rendered.** Two lessons index the theme's swatches for a
  third and fourth colour; contrast in the other themes is untested.
- **Bare "saturation" was a live false positive** — "increase the colour saturation of this
  photo" selected the lesson — and was removed at integration; only the qualified phrases
  route. Two-topic briefs still cancel by design: "op amp saturation and clipping" selects
  nothing, since `clipping` belongs to Tier 1.

**Tier 4 — comparators, hysteresis, waveform generation**

- **The op-amp is Tier 2's model unchanged**: pure gain, hard clip at ±13 V, no propagation
  delay. A real comparator's delay would smear the chatter edges; here they are vertical. The
  comparator's step is drawn exactly vertical and its 65 µV width is stated, never drawn.
- **The Schmitt is the inverting configuration** (v_in on −, feedback to + through R_2, R_1 to
  ground): V_TH = +βV_sat, V_TL = −βV_sat, β = R_1/(R_1+R_2). R_2 = 16 kΩ was chosen so V_TH
  lands on exactly the 5 V the comparator was asked about. The output is therefore inverted
  relative to the comparator lesson; the caption and narration say so.
- **The "noise" is three fixed sinusoids, not a random process** (the spec is
  byte-deterministic), totalling 11.7 % of the signal — more than "a few percent" — and its
  largest component is its fastest, unlike real broadband noise. That was needed for a legible
  chatter burst; with realistic weighting the input crosses once and no chatter shows.
- **The Schmitt and oscillator are the ideal two-state rule integrated on a grid**, not a
  solved loop: an edge can be up to one grid step late and the oscillator overshoots each
  threshold by ~0.5 mV, biasing the period +0.03 %. Both below one pixel.
- **Parameters are not validated.** A `vRef` ≥ 6.5 V or thresholds above ~5.7 V never trip
  and show a flat rail; an oscillator R, C far from 10 kΩ / 10 nF puts the period outside the
  fixed 480 µs window. R_1/R_2 are fixed in the oscillator's drawing.
- **Tier 4 draws a 78 px op-amp against Tier 2's 90 px.** Safe only because no lesson shows both.
- **Narration over-runs its beat** by roughly 30 % and `eeLesson` clips the caption duration,
  as in Tier 2. This affects captions, not the spoken narration.
- **Compound phrases are claimed by the lesson that teaches them** ("comparator with
  hysteresis" → Schmitt; "schmitt trigger oscillator" → oscillator), because the
  longest-match-then-cancel rule would otherwise route them to nothing. Interleaved phrasings
  still cancel: "relaxation oscillator using a schmitt trigger" selects nothing. "positive
  feedback" is unclaimed, so "explain positive feedback" routes nowhere.

**Across all tiers, from integration**

- **A phrase claimed by two lessons cancels both, silently.** Every tier that built in
  parallel worried about it; a test now checks the four tier tables against each other.
- **Two tiers appending to `kit.ts` conflict textually at the tail.** Concatenating the
  conflict hunks interleaves the two functions' bodies; the correct resolution is `main`'s
  file plus the other tier's appended lines verbatim. The typecheck catches a wrong merge.
