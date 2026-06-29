/**
 * Flowchart — compose positioned boxes and auto-routed connectors into one diagram. Each edge picks
 * the facing ports of its endpoints and routes between them (elbow by default). Pure; layout is
 * caller-positioned (no auto-layout engine), which keeps it deterministic and predictable.
 */

import type { Node, GroupNode, Color } from "../spec/types.js";
import { box, type BoxOptions, type Box } from "./shapes.js";
import { connector, type ArrowHead, type Routing } from "./connector.js";

export interface FlowNode extends Omit<BoxOptions, "id"> {
  id: string;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  routing?: Routing;
  dash?: number[];
  endArrow?: ArrowHead;
  stroke?: Color;
}

export interface FlowchartOptions {
  id?: string;
  nodes: FlowNode[];
  edges?: FlowEdge[];
}

/** Pick the facing port pair for an edge from box `a` to box `b`. */
function pickPorts(a: Box, b: Box): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const dx = b.ports.center.x - a.ports.center.x;
  const dy = b.ports.center.y - a.ports.center.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: a.ports.right, to: b.ports.left } : { from: a.ports.left, to: b.ports.right };
  }
  return dy >= 0 ? { from: a.ports.bottom, to: b.ports.top } : { from: a.ports.top, to: b.ports.bottom };
}

export function flowchart(opts: FlowchartOptions): GroupNode {
  const id = opts.id ?? "flow";
  const boxes = new Map<string, Box>();
  const boxNodes: Node[] = [];
  for (const n of opts.nodes) {
    const b = box(n);
    boxes.set(n.id, b);
    boxNodes.push(b.node);
  }

  const edgeNodes: Node[] = [];
  (opts.edges ?? []).forEach((e, i) => {
    const a = boxes.get(e.from);
    const b = boxes.get(e.to);
    if (!a || !b) return;
    const { from, to } = pickPorts(a, b);
    edgeNodes.push(
      connector({
        id: `${id}-edge-${i}`,
        from,
        to,
        routing: e.routing ?? "elbow",
        ...(e.label !== undefined ? { label: e.label, labelBg: "#ffffff" } : {}),
        ...(e.dash ? { dash: e.dash } : {}),
        ...(e.endArrow ? { endArrow: e.endArrow } : {}),
        ...(e.stroke ? { stroke: e.stroke } : {}),
      }),
    );
  });

  // Edges under boxes so arrowheads tuck beneath the node shapes.
  return { id, type: "group", x: 0, y: 0, children: [...edgeNodes, ...boxNodes] };
}
