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

/** Typeset a chemical formula/equation (mhchem). Returns the group node plus its measured size. */
export function chemEquation(opts: ChemEquationOptions): TexResult {
  return texToNodes({
    latex: `\\ce{${opts.formula}}`,
    ...(opts.id !== undefined ? { id: opts.id } : {}),
    ...(opts.x !== undefined ? { x: opts.x } : {}),
    ...(opts.y !== undefined ? { y: opts.y } : {}),
    ...(opts.size !== undefined ? { size: opts.size } : {}),
    ...(opts.color !== undefined ? { color: opts.color } : {}),
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
  });
}
