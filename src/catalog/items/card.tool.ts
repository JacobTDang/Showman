import { z } from "zod";
import type { Node } from "../../spec/types.js";
import { getTheme } from "../../theme/themes.js";
import { fillRamp, elevation } from "../../theme/depth.js";
import type { BuilderTool } from "../types.js";

/**
 * items.card — a clean text card: a heading + up to four short lines on a themed,
 * golden-safe surface. Two jobs: (1) the general "state an idea plainly" visual the
 * selector may choose; (2) the DETERMINISTIC FALLBACK the orchestrator's failure
 * ladder drops to when a scene can't be built — it must always validate, so it uses
 * only text + a rect with the proven-safe gradient/crisp-shadow helpers.
 */

const Params = z.object({
  title: z.string().min(1).describe("card heading"),
  lines: z.array(z.string()).max(4).default([]).describe("up to 4 short body lines"),
  width: z.number().positive().max(1200).default(640).describe("card pixel width"),
  theme: z.string().optional().describe("palette theme name"),
});

type CardParams = z.infer<typeof Params>;

const PAD = 28;
const TITLE_SIZE = 34;
const LINE_SIZE = 24;
const LINE_GAP = 38;

export const cardTool: BuilderTool<CardParams> = {
  name: "items.card",
  domain: "items",
  level: "node",
  description: "a text card: heading plus up to 4 short lines, for stating an idea plainly",
  keywords: ["card", "summary", "definition", "key idea", "note", "takeaway"],
  params: Params,
  example: { title: "Key idea", lines: ["Fractions name parts of a whole."], width: 640 },
  build(p) {
    const theme = getTheme(p.theme);
    const lines = p.lines.map((l) => l.trim()).filter(Boolean);
    const height = PAD * 2 + TITLE_SIZE + (lines.length > 0 ? 16 + lines.length * LINE_GAP : 0);

    const children: Node[] = [
      {
        id: "card-bg",
        type: "rect",
        x: 0,
        y: 0,
        width: p.width,
        height,
        radius: 18,
        fill: "#ffffff",
        gradient: fillRamp("#ffffff", height, "soft"),
        shadow: elevation("soft"),
      },
      {
        id: "card-title",
        type: "text",
        x: p.width / 2,
        y: PAD + TITLE_SIZE / 2,
        text: p.title,
        fontFamily: theme.headingFont,
        fontWeight: theme.headingWeight,
        fontSize: TITLE_SIZE,
        fill: theme.palette.primary,
        align: "center",
        baseline: "middle",
        maxWidth: p.width - PAD * 2,
      },
    ];
    lines.forEach((text, i) => {
      children.push({
        id: `card-line-${i}`,
        type: "text",
        x: p.width / 2,
        y: PAD + TITLE_SIZE + 16 + i * LINE_GAP + LINE_SIZE / 2,
        text,
        fontFamily: theme.bodyFont,
        fontWeight: theme.bodyWeight,
        fontSize: LINE_SIZE,
        fill: theme.palette.text,
        align: "center",
        baseline: "middle",
        maxWidth: p.width - PAD * 2,
      });
    });

    return {
      node: { id: "card", type: "group", x: 0, y: 0, children },
      bbox: { w: p.width, h: height },
    };
  },
};
