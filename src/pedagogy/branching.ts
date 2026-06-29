/**
 * Branching lesson graph — a lesson is a graph of segments; the next segment depends on the learner's
 * outcome (correct → advance, incorrect → remediate, …). Pure transition logic + a structural
 * validator (dangling refs, unreachable segments, duplicate ids) so a graph can be checked before it
 * ever runs. The runtime player is elsewhere; this is the deterministic core.
 */

/** A response outcome. The common three plus any custom tag. */
export type Outcome = "correct" | "incorrect" | "partial" | (string & {});

export interface Branch {
  /** Take this edge when the segment's outcome equals `when`. */
  when: Outcome;
  to: string;
}

export interface Segment {
  id: string;
  /** Default next segment when no branch matches. Omit to mark a terminal segment. */
  next?: string;
  /** Outcome-specific edges, checked in order before `next`. */
  branches?: Branch[];
}

export interface LessonGraph {
  start: string;
  segments: Segment[];
}

/** The next segment id given the current segment + its outcome, or null at a terminal. */
export function nextSegment(graph: LessonGraph, fromId: string, outcome: Outcome): string | null {
  const seg = graph.segments.find((s) => s.id === fromId);
  if (!seg) return null;
  const branch = seg.branches?.find((b) => b.when === outcome);
  if (branch) return branch.to;
  return seg.next ?? null;
}

/** Walk the graph from `start`, applying outcomes in order; returns the visited segment ids. */
export function walk(graph: LessonGraph, outcomes: Outcome[]): string[] {
  const path: string[] = [];
  let cur: string | null = graph.start;
  if (!graph.segments.some((s) => s.id === cur)) return path; // bad start → empty
  path.push(cur);
  for (const o of outcomes) {
    cur = nextSegment(graph, cur, o);
    if (cur === null) break;
    path.push(cur);
  }
  return path;
}

export interface GraphProblem {
  code: "DUPLICATE_ID" | "MISSING_START" | "DANGLING_REF" | "UNREACHABLE";
  segmentId?: string;
  message: string;
}

/** Structural check: duplicate ids, a missing start, edges to unknown segments, unreachable segments. */
export function validateGraph(graph: LessonGraph): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const ids = new Set<string>();
  for (const s of graph.segments) {
    if (ids.has(s.id)) problems.push({ code: "DUPLICATE_ID", segmentId: s.id, message: `duplicate segment id "${s.id}".` });
    ids.add(s.id);
  }
  if (!ids.has(graph.start)) problems.push({ code: "MISSING_START", message: `start "${graph.start}" is not a segment.` });

  const edges = (s: Segment): string[] => [...(s.next !== undefined ? [s.next] : []), ...(s.branches?.map((b) => b.to) ?? [])];
  for (const s of graph.segments) {
    for (const to of edges(s)) {
      if (!ids.has(to))
        problems.push({ code: "DANGLING_REF", segmentId: s.id, message: `segment "${s.id}" points to unknown segment "${to}".` });
    }
  }

  // Reachability (BFS from start, following only valid edges).
  if (ids.has(graph.start)) {
    const byId = new Map(graph.segments.map((s) => [s.id, s]));
    const seen = new Set<string>([graph.start]);
    const queue = [graph.start];
    while (queue.length) {
      const cur = queue.shift()!;
      const seg = byId.get(cur);
      if (!seg) continue;
      for (const to of edges(seg)) {
        if (ids.has(to) && !seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
    for (const s of graph.segments) {
      if (!seen.has(s.id)) problems.push({ code: "UNREACHABLE", segmentId: s.id, message: `segment "${s.id}" is unreachable from start.` });
    }
  }

  return problems;
}
