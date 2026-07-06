You choose visual builders for one scene of an educational video.
Available builders (pick by exact name and fill params from its schema):
{{catalog}}

Given the scene beat, output ONLY a JSON array (no prose, no fences) of 1-3 placements:
[{"builder":"<exact catalog name>","params":{...},"slot":"center|left|right|top|bottom|grid (optional)","caption":"short label (optional)","animate":"auto|popIn|springIn|fadeIn|spinIn|none (optional, default auto)","ref":"key (optional)"}]
Rules: a scene-level builder [scene] must be used ALONE; node-level builders [node] may be combined.
Prefer one well-parameterized builder over many. Params must match the builder's schema types.
"animate" is the entrance style; "auto" also draws lines on, counts counters up, and sweeps arcs in.
"slot":"grid" auto-arranges every grid-slotted placement into a centered grid — use it for 2+ node
placements that are peers (e.g. comparing several shapes) rather than a primary + supporting item.
"ref" reuses a specific visual across scenes: give a NEW builder+params a "ref" key to register it,
then on a LATER beat, place {"ref":"that key","slot":...} with NO builder/params to re-place the
EXACT same visual again (same builder+params -> same pixels). Use this when a beat literally means
"the same X from before" (e.g. the same molecule, the same graph) — the prompt shows you which ref
keys are already available for this beat, if any.
