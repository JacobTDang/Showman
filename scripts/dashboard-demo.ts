/**
 * Dashboard demo — simulate a learner answering across several skills, then write the mastery
 * dashboard + the xAPI statement log into out/demo-dashboard/ and drop the dashboard view beside
 * them. Run: npm run dashboard-demo  ->  serve out/demo-dashboard and open showman-dashboard.html
 */

import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { emptyModel, applyResult } from "../src/learning/model.js";
import { buildDashboard } from "../src/telemetry/dashboard.js";
import { learnerActor, answeredStatement, lessonStatement, masteredStatements, type EmitContext } from "../src/telemetry/xapi.js";
import { InMemoryLrs } from "../src/telemetry/sink.js";
import { mcq } from "../src/interaction/builders.js";
import { gradeCue } from "../src/interaction/runtime.js";

const NOW = Date.UTC(2026, 5, 28, 14, 0, 0); // fixed for a reproducible demo
const ctx: EmitContext = { actor: learnerActor("learner-7f3a"), lessonId: "https://showman.app/lessons/grade2-math", now: NOW };

const labels = {
  "add-within-20": { label: "Add within 20", standard: "2.OA.B.2" },
  "subtract-within-20": { label: "Subtract within 20", standard: "2.OA.B.2" },
  "place-value": { label: "Place value (hundreds)", standard: "2.NBT.A.1" },
  "skip-count": { label: "Skip-count by 5s", standard: "2.NBT.A.2" },
  regrouping: { label: "Regrouping", standard: "2.NBT.B.7" },
};

// A scripted session: each [kc, correct...] is a learner's answers on that skill.
const session: [keyof typeof labels, boolean[]][] = [
  ["add-within-20", [true, true, true, true, true, true]], // mastered
  ["skip-count", [true, true, true, true]], // strong
  ["subtract-within-20", [false, true, true]], // practicing
  ["place-value", [true, false, true]], // practicing
  ["regrouping", [false, false, false]], // struggling
];

const lrs = new InMemoryLrs();
lrs.send([lessonStatement(ctx, "initialized")]);

let model = emptyModel();
for (const [kc, answers] of session) {
  answers.forEach((correct, i) => {
    const cue = mcq({ id: `${kc}-${i}`, t: i, prompt: `Practice: ${labels[kc].label}`, choices: ["A", "B"], answer: 0, kc });
    const before = model;
    model = applyResult(model, kc, correct, NOW);
    const ans = answeredStatement(ctx, cue, gradeCue(cue, correct ? 0 : 1), correct ? 0 : 1);
    if (ans) lrs.send([ans]);
    lrs.send(masteredStatements(ctx, before, model));
  });
}
lrs.send([lessonStatement(ctx, "completed")]);

const dashboard = buildDashboard(model, { labels });
const dir = join("out", "demo-dashboard");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "dashboard.json"), JSON.stringify(dashboard, null, 2));
writeFileSync(join(dir, "xapi.json"), lrs.toJson());
copyFileSync(join("dashboard", "showman-dashboard.html"), join(dir, "showman-dashboard.html"));
console.log(
  `wrote out/demo-dashboard/ — ${dashboard.counts.total} skills, ${dashboard.counts.mastered} mastered, ${lrs.statements.length} xAPI statements`,
);
