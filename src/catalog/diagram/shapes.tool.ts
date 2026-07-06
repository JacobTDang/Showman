import { z } from "zod";
import { box } from "../../diagram/shapes.js";
import { table } from "../../diagram/table.js";
import { connector } from "../../diagram/connector.js";
import { flowchart } from "../../diagram/flowchart.js";
import type { BuilderTool } from "../types.js";

const SHAPES = ["rect", "rounded", "ellipse", "diamond", "parallelogram", "hexagon", "cylinder"] as const;
const ARROWS = ["none", "arrow", "open", "diamond", "circle"] as const;
const ROUTINGS = ["straight", "elbow", "curved"] as const;

/** diagram.box — a single labeled shape (rect/rounded/ellipse/diamond/parallelogram/hexagon/cylinder). */
const BoxParams = z.object({
  width: z.number().positive().max(1000).default(160),
  height: z.number().positive().max(1000).default(80),
  shape: z.enum(SHAPES).default("rounded"),
  label: z.string().optional(),
  depth: z.enum(["soft", "flat"]).default("soft"),
});
type BoxParams = z.infer<typeof BoxParams>;

export const boxTool: BuilderTool<BoxParams> = {
  name: "diagram.box",
  domain: "diagram",
  level: "node",
  description: "a single labeled shape: rect, rounded, ellipse, diamond, parallelogram, hexagon, or cylinder",
  keywords: ["box", "shape", "rectangle", "diamond", "hexagon", "cylinder", "label", "node"],
  params: BoxParams,
  example: { width: 160, height: 80, shape: "rounded", label: "Start", depth: "soft" },
  build(p) {
    const b = box({ x: 0, y: 0, ...p });
    return { node: b.node, bbox: { w: p.width, h: p.height } };
  },
};

/** diagram.table — a data table with an optional header row and zebra striping. */
const TableParams = z.object({
  rows: z.array(z.array(z.string())).min(1).max(20).describe("row-major cells; the first row is the header when headerRow is true"),
  headerRow: z.boolean().default(true),
  zebra: z.boolean().default(true).describe("alternate row background colors"),
  width: z.number().positive().max(1200).optional().describe("force a total width; omit to size from content"),
});
type TableParams = z.infer<typeof TableParams>;

export const tableTool: BuilderTool<TableParams> = {
  name: "diagram.table",
  domain: "diagram",
  level: "node",
  description: "a data table with an optional header row and zebra striping",
  keywords: ["table", "grid", "rows", "columns", "data table", "spreadsheet"],
  params: TableParams,
  example: {
    rows: [
      ["Name", "Score"],
      ["Alice", "92"],
      ["Bob", "85"],
    ],
    headerRow: true,
    zebra: true,
  },
  build(p) {
    const t = table({
      x: 0,
      y: 0,
      rows: p.rows,
      headerRow: p.headerRow,
      zebra: p.zebra ? undefined : false,
      ...(p.width !== undefined ? { width: p.width } : {}),
    });
    return { node: t.node, bbox: { w: t.width, h: t.height } };
  },
};

/** diagram.connector — a single arrow/line between two points, with an optional label. */
const ConnectorParams = z.object({
  from: z.object({ x: z.number(), y: z.number() }),
  to: z.object({ x: z.number(), y: z.number() }),
  routing: z.enum(ROUTINGS).default("straight"),
  endArrow: z.enum(ARROWS).default("arrow"),
  startArrow: z.enum(ARROWS).default("none"),
  label: z.string().optional(),
});
type ConnectorParams = z.infer<typeof ConnectorParams>;

export const connectorTool: BuilderTool<ConnectorParams> = {
  name: "diagram.connector",
  domain: "diagram",
  level: "node",
  description: "an arrow or line between two points, with an optional label — for annotating other visuals",
  keywords: ["arrow", "line", "connector", "annotate", "point to", "link", "edge"],
  params: ConnectorParams,
  example: { from: { x: 0, y: 0 }, to: { x: 160, y: 0 }, routing: "straight", endArrow: "arrow", startArrow: "none" },
  build(p) {
    const xs = [p.from.x, p.to.x];
    const ys = [p.from.y, p.to.y];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const w = Math.max(...xs) - minX;
    const h = Math.max(...ys) - minY;
    const shift = (pt: { x: number; y: number }) => ({ x: pt.x - minX, y: pt.y - minY });
    const node = connector({ ...p, from: shift(p.from), to: shift(p.to) });
    return { node, bbox: { w: Math.max(w, 40), h: Math.max(h, 40) } };
  },
};

/** diagram.flowchart — boxes wired together by labeled connectors (a full flowchart). */
const FlowNodeParams = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().max(1000).default(140),
  height: z.number().positive().max(1000).default(70),
  shape: z.enum(SHAPES).default("rounded"),
  label: z.string().optional(),
});
const FlowEdgeParams = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  routing: z.enum(ROUTINGS).default("elbow"),
  endArrow: z.enum(ARROWS).default("arrow"),
});
const FlowchartParams = z.object({
  nodes: z.array(FlowNodeParams).min(1).max(12),
  edges: z.array(FlowEdgeParams).max(20).default([]),
});
type FlowchartParams = z.infer<typeof FlowchartParams>;

export const flowchartTool: BuilderTool<FlowchartParams> = {
  name: "diagram.flowchart",
  domain: "diagram",
  level: "node",
  description: "a flowchart: labeled boxes at explicit positions, wired together by labeled arrows",
  keywords: ["flowchart", "flow chart", "process diagram", "steps", "boxes and arrows", "workflow"],
  params: FlowchartParams,
  example: {
    nodes: [
      { id: "a", x: 0, y: 0, width: 140, height: 70, shape: "rounded", label: "Start" },
      { id: "b", x: 220, y: 0, width: 140, height: 70, shape: "rounded", label: "End" },
    ],
    edges: [{ from: "a", to: "b", routing: "elbow", endArrow: "arrow" }],
  },
  build(p) {
    const node = flowchart(p);
    const xs = p.nodes.flatMap((n) => [n.x, n.x + n.width]);
    const ys = p.nodes.flatMap((n) => [n.y, n.y + n.height]);
    return { node, bbox: { w: Math.max(...xs) - Math.min(...xs, 0), h: Math.max(...ys) - Math.min(...ys, 0) } };
  },
};
