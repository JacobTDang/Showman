import { describe, it, expect } from "vitest";
import { learnerActor, answeredStatement, lessonStatement, masteredStatements, VERBS, type EmitContext } from "../../src/telemetry/xapi.js";
import { InMemoryLrs } from "../../src/telemetry/sink.js";
import { buildDashboard } from "../../src/telemetry/dashboard.js";
import { emptyModel, applyResult } from "../../src/learning/model.js";
import { mcq, pausePrompt } from "../../src/interaction/builders.js";
import { gradeCue } from "../../src/interaction/runtime.js";

const NOW = 1_700_000_000_000;
const ISO = new Date(NOW).toISOString();
const ctx: EmitContext = { actor: learnerActor("learner-7f3a"), lessonId: "https://showman.app/lessons/counting", now: NOW };

describe("xAPI statements", () => {
  it("uses a pseudonymous actor (opaque id, no PII)", () => {
    const a = learnerActor("learner-7f3a");
    expect(a.account.name).toBe("learner-7f3a");
    expect(JSON.stringify(a)).not.toMatch(/mbox|email|@/i);
  });

  it("emits passed/failed for graded answers and null for ungraded cues", () => {
    const cue = mcq({ id: "q1", t: 5, prompt: "2+2?", choices: ["3", "4"], answer: 1, kc: "add10" });
    const right = answeredStatement(ctx, cue, gradeCue(cue, 1), 1)!;
    expect(right.verb.id).toBe(VERBS.passed!.id);
    expect(right.result?.success).toBe(true);
    expect(right.result?.score?.scaled).toBe(1);
    expect(right.timestamp).toBe(ISO);
    expect(right.object.id).toBe("https://showman.app/lessons/counting/interactions/q1");

    const wrong = answeredStatement(ctx, cue, gradeCue(cue, 0), 0)!;
    expect(wrong.verb.id).toBe(VERBS.failed!.id);
    expect(wrong.result?.success).toBe(false);

    const pp = pausePrompt({ id: "p", t: 1, prompt: "predict" });
    expect(answeredStatement(ctx, pp, gradeCue(pp, null), null)).toBeNull();
  });

  it("emits initialized + completed for the lesson", () => {
    expect(lessonStatement(ctx, "initialized").verb.id).toBe(VERBS.initialized!.id);
    const done = lessonStatement(ctx, "completed");
    expect(done.verb.id).toBe(VERBS.completed!.id);
    expect(done.result?.completion).toBe(true);
  });

  it("emits a mastered statement only when a skill crosses the threshold", () => {
    let after = emptyModel();
    for (let i = 0; i < 6; i++) after = applyResult(after, "add10", true, NOW);
    const crossed = masteredStatements(ctx, emptyModel(), after);
    expect(crossed.map((s) => s.object.id)).toEqual(["https://showman.app/lessons/counting/skills/add10"]);
    expect(crossed[0]!.verb.id).toBe(VERBS.mastered!.id);
    // already mastered → no new statement
    const after2 = applyResult(after, "add10", true, NOW);
    expect(masteredStatements(ctx, after, after2)).toEqual([]);
  });
});

describe("InMemoryLrs", () => {
  it("collects statements and serializes a JSON array", () => {
    const lrs = new InMemoryLrs();
    lrs.send([lessonStatement(ctx, "initialized")]);
    lrs.send([lessonStatement(ctx, "completed")]);
    expect(lrs.statements.length).toBe(2);
    expect(JSON.parse(lrs.toJson())).toHaveLength(2);
  });
});

describe("mastery dashboard", () => {
  it("classifies skills, rolls up counts, and orders weakest-first", () => {
    let m = emptyModel();
    for (let i = 0; i < 6; i++) m = applyResult(m, "count", true, NOW); // mastered
    m = applyResult(m, "regroup", false, NOW); // struggling
    m = applyResult(m, "compare", true, NOW); // practicing-ish
    const d = buildDashboard(m, { labels: { count: { label: "Counting to 10", standard: "K.CC.B.4" } } });

    expect(d.counts.total).toBe(3);
    expect(d.counts.mastered).toBe(1);
    expect(d.skills[0]!.status).toBe("struggling"); // weakest first
    const count = d.skills.find((s) => s.kc === "count")!;
    expect(count.status).toBe("mastered");
    expect(count.label).toBe("Counting to 10");
    expect(count.standard).toBe("K.CC.B.4");
    expect(count.accuracy).toBe(1);
    expect(d.overallMastery).toBeGreaterThan(0);
  });

  it("is empty for a fresh learner", () => {
    const d = buildDashboard(emptyModel());
    expect(d.counts.total).toBe(0);
    expect(d.overallMastery).toBe(0);
  });
});
