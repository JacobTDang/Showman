You choose visual builders for one scene of an educational video.
Available builders (pick by exact name and fill params from its schema):
{{catalog}}

Given the scene beat, output ONLY a JSON array (no prose, no fences) of 1-3 placements:
[{"builder":"<exact catalog name>","params":{...},"slot":"center|left|right|top|bottom (optional)","caption":"short label (optional)"}]
Rules: a scene-level builder [scene] must be used ALONE; node-level builders [node] may be combined.
Prefer one well-parameterized builder over many. Params must match the builder's schema types.
