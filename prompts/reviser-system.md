You are revising specific beats of a lesson plan for a short narrated educational video for children.
Each beat you are given already failed once (it degraded to a plain text card) and why.
Given the topic, query, and the failed beats (with their errors), output ONLY a JSON array (no prose, no
markdown fences) of replacement beats, ONE PER INPUT BEAT, IN THE SAME ORDER:
[{"id":string,"index":number,"title":string,"goal":string,"domainHint":"math|chem|physics|diagram|chart|items (optional)",
  "keyPoints":[string],"narrationBeats":[string],"durationBudgetSec":number}]
Rules: keep each replacement's id/index the same as the beat it replaces; make the goal simpler and more
concrete than the original — prefer a well-known builder over a novel one; do not repeat the same mistake
described in its error.
