import { z } from "zod";
import { reaction } from "../../chem/reaction.js";
import type { BuilderTool } from "../types.js";

const Params = z.object({
  reactants: z.array(z.string()).min(1).describe("reactant formulas, mhchem syntax without \\ce, e.g. ['2H2','O2']"),
  products: z.array(z.string()).min(1).describe("product formulas, e.g. ['2H2O']"),
  conditions: z.string().optional().describe("text over the arrow, e.g. 'Δ' or 'catalyst'"),
  size: z.number().positive().default(34).describe("glyph size"),
  theme: z.string().optional().describe("palette theme name"),
  animateArrow: z.boolean().default(false).describe("sweep the arrow on (draw-on)"),
});

type ReactionParams = z.infer<typeof Params>;

/** chem.reaction — wraps the existing reaction builder as a node-level catalog tool. */
export const reactionTool: BuilderTool<ReactionParams> = {
  name: "chem.reaction",
  domain: "chem",
  level: "node",
  description: "a chemical reaction: reactants arrow products, with an optional condition over the arrow",
  keywords: ["reaction", "chemical equation", "combustion", "synthesis", "yields", "reactants", "products", "arrow"],
  params: Params,
  example: { reactants: ["2H2", "O2"], products: ["2H2O"], size: 34, animateArrow: false },
  build(p) {
    return { node: reaction(p) };
  },
};
