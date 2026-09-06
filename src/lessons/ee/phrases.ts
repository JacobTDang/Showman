/**
 * A lesson and the topic phrases that name it in a brief. Each tier exports its own table
 * from its own file so the tiers can be built in parallel; `lessonRouting.ts` concatenates
 * them. Phrases are lower case with hyphens written as spaces, and are matched on word
 * boundaries — so name a TOPIC ("step response"), never a bare word a brief on something
 * else might contain ("response").
 */
export interface LessonPhrases {
  /** The catalog tool, e.g. "ee.invertingAmp". */
  name: string;
  phrases: string[];
}
