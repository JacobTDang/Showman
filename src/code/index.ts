/**
 * Code blocks — syntax-highlighted, monospaced editor cards for teaching tech / CS. A small,
 * deterministic, dependency-free tokenizer + a dark/light editor theme; pure builders.
 *
 * `codeBlock`'s id defaults to "code" and prefixes its child ids — pass distinct ids when composing
 * several blocks into one scene so the ids don't collide.
 */

export * from "./tokenize.js";
export * from "./theme.js";
export * from "./codeBlock.js";
