/**
 * Chemical equations — a thin wrapper over the LaTeX pipeline's mhchem support. `\ce{…}` typesets
 * formulas, charges, states, and reaction arrows as first-class morphable glyph paths.
 */

import { texToNodes, type TexResult } from "../math/tex.js";
import type { Color } from "../spec/types.js";

export interface ChemEquationOptions {
  id?: string;
  /** An mhchem formula WITHOUT the surrounding \ce, e.g. "2H2 + O2 -> 2H2O" or "H2O". */
  formula: string;
  x?: number;
  y?: number;
  size?: number;
  color?: Color;
  theme?: string;
}

/** Typeset a chemical formula/equation (mhchem). Returns the group node plus its measured size.
 * Malformed input degrades to an empty group (consistent with the LaTeX pipeline): a stray `}` would
 * break out of `\ce{…}` and inject arbitrary LaTeX, and C0 control chars trip a MathJax internal bug. */
export function chemEquation(opts: ChemEquationOptions): TexResult {
  const id = opts.id ?? "tex";
  const x = opts.x ?? 0;
  const y = opts.y ?? 0;
  const empty: TexResult = { node: { id, type: "group", x, y, children: [] }, width: 0, height: 0 };

  // Drop control chars (charCode < 32) — avoids a control-char regex and the MathJax bug.
  const formula = [...opts.formula].filter((ch) => ch.charCodeAt(0) >= 32).join("");
  let depth = 0;
  for (const ch of formula) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return empty; // unbalanced → would escape \ce{…}
  }
  if (depth !== 0) return empty;

  return texToNodes({
    latex: `\\ce{${formula}}`,
    ...(opts.id !== undefined ? { id: opts.id } : {}),
    ...(opts.x !== undefined ? { x: opts.x } : {}),
    ...(opts.y !== undefined ? { y: opts.y } : {}),
    ...(opts.size !== undefined ? { size: opts.size } : {}),
    ...(opts.color !== undefined ? { color: opts.color } : {}),
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
  });
}
