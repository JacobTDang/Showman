# Showman

A deterministic animation engine for **beautiful, narrated, pedagogically-structured
learning videos for children** — authored by AI agents.

This repo currently implements **M0: the spec contract + deterministic engine** (see
[MILESTONES.md](./MILESTONES.md) for the full roadmap and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)
for the product vision).

## What's here (M0)

- **The Scene Spec** — a serializable JSON contract describing a scene: dimensions,
  fps, duration, seed, background, and a tree of nodes (`rect`, `ellipse`, `text`,
  `group`) with base transforms and keyframed animation tracks.
- **A structured validator** — returns actionable `{path, nodeId, property, code,
  message}` errors (with "did you mean…" hints) instead of throwing. This is what an
  authoring agent self-corrects against.
- **A pure, deterministic renderer** — `renderFrame(spec, frameIndex) → pixels`.
  Same input → byte-identical output, always. No wall-clock, no `Math.random`
  (enforced by a test), Skia-backed text with a pinned font.

```ts
import { renderFrame, validateScene, assertValidScene } from "showman";

const spec = {
  specVersion: 1,
  width: 640, height: 360, fps: 30, duration: 3, seed: 7,
  background: "#fdf6e3",
  nodes: [
    { id: "title", type: "text", x: 320, y: 46, text: "Count to 3!",
      fontSize: 46, fontWeight: 800, fill: "#1d6f72", align: "center", baseline: "middle" },
    { id: "apple", type: "ellipse", x: 125, y: 150, width: 70, height: 70, fill: "#e63946",
      anchor: { x: 35, y: 35 },
      tracks: [
        { property: "opacity", keyframes: [{ t: 0.3, value: 0 }, { t: 0.9, value: 1, easing: "easeOutQuad" }] },
        { property: "scale",   keyframes: [{ t: 0.3, value: 0.6 }, { t: 0.9, value: 1, easing: "easeOutBack" }] },
      ] },
  ],
};

const { valid, errors } = validateScene(spec);   // structured errors, never throws
const frame = renderFrame(assertValidScene(spec), 60);
frame.pixels;   // Uint8ClampedArray RGBA (fed to FFmpeg in M1)
frame.toPNG();  // Buffer (preview)
```

## Key design decisions

| Decision | Choice | Why |
|---|---|---|
| Render backend | `@napi-rs/canvas` (Skia, prebuilt) | Skia-backed, no system deps, deterministic |
| Keyframe time unit | **seconds** (not frame index) | fps-independent timing; sets up M5 narration sync |
| Validation | hand-written structured validator | agent-actionable errors > mapped Ajv output |
| Fonts | **pinned** Nunito in `assets/fonts/` | font drift is the top cause of cross-machine pixel differences |
| Randomness | seeded `mulberry32` only | purity = determinism = safe parallelism + retry |

## Develop

```bash
npm install
npm test              # all tests (unit + integration + golden + purity)
npm run test:watch    # watch mode
npm run typecheck     # tsc --noEmit
npm run golden:update # regenerate golden PNGs after an intentional visual change
```

### Test layout
- `test/unit/` — rng, color, easing, interpolation, resolve, validator.
- `test/integration/` — end-to-end render, determinism, **animation-correctness via
  pixel sampling**, group cascade, opacity, transparent bg, text; plus an engine
  **purity** scan (no clock / `Math.random`).
- `test/golden/` — blessed reference frames compared byte-for-byte.

Golden images are pinned to this machine + engine + font version; that's intentional.
M1 bakes those into a container so they hold across machines.
