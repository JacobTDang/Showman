/**
 * Route a brief to a curated EE 230 lesson.
 *
 * The lessons in `src/lessons/ee/` are complete, tested, narrated scenes built around the
 * three views the course is organised on. When a brief names one of their topics, the
 * right answer is that lesson verbatim, not a model's freehand attempt at it. So the
 * decision is made here, in code, before the model is asked anything -- the same reasoning
 * that routes a schematic brief to a catalog builder.
 *
 * A phrase names a topic, not merely a word: "pole" and "sinusoid" are matched on word
 * boundaries so "dipole" and "sinusoidal steady state" do not misfire. The longest matching
 * phrase wins; a second, unrelated lesson also matching means the brief is about two things
 * and nothing is selected. Constraints (`forbid`) are never matched, or forbidding a topic
 * would select it.
 */
import type { PedagogyRequest } from "./semantic.js";

export interface LessonSelection {
  /** The catalog tool, e.g. "ee.rcFilters". */
  name: string;
  /** The phrase that selected it, for the repair log. */
  phrase: string;
}

/** Each lesson and the topic phrases that name it. Phrases are lower case, hyphens as spaces. */
const LESSONS: ReadonlyArray<{ name: string; phrases: string[] }> = [
  { name: "ee.theoremOne", phrases: ["theorem 1", "theorem one", "sinusoidal steady state"] },
  {
    name: "ee.rcFilters",
    phrases: [
      "lowpass",
      "low pass",
      "highpass",
      "high pass",
      "rc filter",
      "rc filters",
      "pass band",
      "passband",
      "stop band",
      "stopband",
      "cutoff frequency",
      "corner frequency",
      "frequency response",
    ],
  },
  {
    name: "ee.transferCharacteristic",
    phrases: ["transfer characteristic", "transfer characteristics", "clipping", "nonlinear system", "nonlinearity", "distortion"],
  },
  {
    name: "ee.polesStepResponse",
    phrases: ["step response", "time constant", "s plane", "pole location", "poles and zeros", "pole", "poles"],
  },
  {
    name: "ee.sinusoids",
    phrases: ["sinusoid", "sinusoids", "sine wave", "sinusoidal signal", "amplitude and phase", "amplitude, frequency"],
  },
  { name: "ee.impedancePhasors", phrases: ["phasor", "phasors", "impedance", "reactance", "resonance"] },
  {
    name: "ee.capacitorInductor",
    phrases: [
      "current leads",
      "current lags",
      "current lead",
      "current lag",
      "leads the voltage",
      "lags the voltage",
      "lead the voltage",
      "lag the voltage",
      "leads voltage",
      "lags voltage",
      "lead voltage",
      "lag voltage",
      "dv/dt",
      "di/dt",
      "eli the ice man",
      "capacitor and inductor",
      "inductor and capacitor",
      "capacitors and inductors",
      "inductors and capacitors",
    ],
  },
  { name: "ee.ohmKvlKcl", phrases: ["ohm's law", "ohms law", "ohm law", "kvl", "kcl", "kirchhoff", "voltage law", "current law"] },
];

/** The names every phrase can select -- exported so a test can prove each is registered. */
export const ROUTABLE_LESSONS: readonly string[] = LESSONS.map((l) => l.name);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‐-―-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

export function selectEeLesson(request: PedagogyRequest): LessonSelection | null {
  // Never the constraints: forbidding a topic must not select it.
  const text = normalize([request.brief, request.topic ?? "", ...(request.objectives ?? []), ...(request.mustShow ?? [])].join(" "));
  if (!text) return null;

  const hits: Array<{ name: string; phrase: string }> = [];
  for (const lesson of LESSONS) {
    for (const phrase of lesson.phrases) {
      if (new RegExp(`(?:^|[^a-z0-9])${escape(phrase)}(?:$|[^a-z0-9])`).test(text)) hits.push({ name: lesson.name, phrase });
    }
  }
  if (hits.length === 0) return null;

  hits.sort((a, b) => b.phrase.length - a.phrase.length);
  const best = hits[0]!;
  // Another lesson's hit that is not merely a fragment of the winning phrase means the
  // brief is about two topics, and one lesson cannot teach both.
  const rival = hits.find((h) => h.name !== best.name && !best.phrase.includes(h.phrase));
  return rival ? null : best;
}
