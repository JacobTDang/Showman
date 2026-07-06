import { z } from "zod";
import { beaker, testTube, erlenmeyerFlask, roundFlask, graduatedCylinder, funnel, bunsenBurner } from "../../chem/apparatus.js";
import type { Node } from "../../spec/types.js";
import type { BuilderTool } from "../types.js";

/**
 * chem.apparatus — a macro placing several lab glassware items left-to-right on a
 * shared benchtop line, each with its own optional liquid fill + label.
 */

type Kind = "beaker" | "testTube" | "erlenmeyerFlask" | "roundFlask" | "graduatedCylinder" | "funnel" | "bunsenBurner";

const GLASSWARE: Record<
  Exclude<Kind, "bunsenBurner">,
  (opts: { id: string; x: number; y: number; width?: number; height?: number; liquid?: number; label?: string }) => Node
> = {
  beaker,
  testTube,
  erlenmeyerFlask,
  roundFlask,
  graduatedCylinder,
  funnel,
};

const ITEM_SPACING = 110;
const BASE_HEIGHT = 130;

const Params = z.object({
  items: z
    .array(
      z.object({
        kind: z.enum(["beaker", "testTube", "erlenmeyerFlask", "roundFlask", "graduatedCylinder", "funnel", "bunsenBurner"]),
        fillLevel: z.number().min(0).max(1).optional().describe("liquid fill level, 0-1 (glassware only)"),
        label: z.string().optional(),
      }),
    )
    .min(1)
    .max(6),
  theme: z.string().optional(),
});
type ApparatusParams = z.infer<typeof Params>;

export const apparatusTool: BuilderTool<ApparatusParams> = {
  name: "chem.apparatus",
  domain: "chem",
  level: "node",
  description: "lab glassware (beakers, flasks, test tubes, a burner) placed left-to-right on a benchtop",
  keywords: ["beaker", "flask", "test tube", "graduated cylinder", "funnel", "bunsen burner", "glassware", "lab equipment", "apparatus"],
  params: Params,
  example: { items: [{ kind: "erlenmeyerFlask", fillLevel: 0.4, label: "reagent" }, { kind: "bunsenBurner" }] },
  build(p) {
    const n = p.items.length;
    const totalWidth = n * ITEM_SPACING;
    const children: Node[] = p.items.map((item, i) => {
      const x = i * ITEM_SPACING + ITEM_SPACING / 2;
      const y = BASE_HEIGHT;
      if (item.kind === "bunsenBurner") {
        return bunsenBurner({ id: `apparatus-${i}`, x, y });
      }
      return GLASSWARE[item.kind]({
        id: `apparatus-${i}`,
        x,
        y,
        ...(item.fillLevel !== undefined ? { liquid: item.fillLevel } : {}),
        ...(item.label ? { label: item.label } : {}),
      });
    });
    return { node: { id: "apparatus", type: "group", x: 0, y: 0, children }, bbox: { w: totalWidth, h: BASE_HEIGHT + 40 } };
  },
};
