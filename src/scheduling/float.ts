// scheduling/ — total float and the critical path. Pure: it reads the dates the schedule gives now and
// writes nothing. The forward pass is the schedule itself, because the engine already placed each Entry
// at its earliest date. The backward pass here finds the latest date each Entry can take without
// moving the project finish. This file contains no recursive call; chain depth is unbounded by design.
import type { EntryId, Instant } from '../model/index.js';
import { diffMs } from '../time/index.js';
import type { Span } from './day-counting.js';
import { anchorField, buildFloatGraph, drivenField } from './float-graph.js';
import type { FloatEdge, FloatGraph, FloatRequest } from './float-graph.js';

export type { FloatRequest } from './float-graph.js';

/** The float of one Entry. */
export interface EntryFloat {
  /** Days the Entry can start later without moving the project finish. Workdays with a calendar. Negative when the schedule is already late. */
  readonly totalFloat: number;
  /** True when `totalFloat` is zero or less. */
  readonly critical: boolean;
}

export interface FloatResult {
  /** The latest finish of all scheduled Entries, or `undefined` when none is scheduled. */
  readonly projectFinish: Instant | undefined;
  /** One answer for each scheduled leaf Entry outside a loop. Other Entries are absent. */
  readonly entries: ReadonlyMap<EntryId, EntryFloat>;
}

/**
 * Gives each scheduled Entry its total float and marks the critical ones.
 * A summary Entry, an Entry with a missing date and a member of a Dependency loop get no float.
 * This analysis ignores constraints in the backward pass: it is plain critical path method.
 */
export function calculateFloat(request: FloatRequest): FloatResult {
  const graph = buildFloatGraph(request);
  if (graph.order.length === 0) return { projectFinish: undefined, entries: new Map() };

  const projectFinish = latestFinish(graph);
  const late = latestSpans(graph, projectFinish);
  const entries = new Map<EntryId, EntryFloat>();
  for (const index of graph.order) {
    const node = graph.nodes[index];
    const span = late[index];
    if (!node || !span) continue;
    // Adding zero turns -0 into 0, so a consumer never reads a negative zero.
    const totalFloat = node.days.daysBetween(node.start, span.start) + 0;
    entries.set(node.id, { totalFloat, critical: totalFloat <= 0 });
  }
  return { projectFinish, entries };
}

function latestFinish(graph: FloatGraph): Instant {
  let latest = graph.nodes[graph.order[0] as number]?.end as Instant;
  for (const index of graph.order) {
    const end = graph.nodes[index]?.end as Instant;
    if (end > latest) latest = end;
  }
  return latest;
}

/** The latest span each node can take. Successors come first, so each node reads final dates. */
function latestSpans(graph: FloatGraph, projectFinish: Instant): (Span | undefined)[] {
  const ordered = new Set(graph.order);
  const late = graph.nodes.map((node, index) =>
    ordered.has(index) ? node.days.follow(node, 'end', projectFinish) : undefined,
  );
  const outgoing = graph.nodes.map(() => [] as FloatEdge[]);
  for (const edge of graph.edges) outgoing[edge.from]?.push(edge);
  for (const index of [...graph.order].reverse()) {
    for (const edge of outgoing[index] ?? []) tighten(graph, late, edge);
  }
  return late;
}

/** Pulls the predecessor's latest span back until the Dependency still holds for the successor's latest span. */
function tighten(graph: FloatGraph, late: (Span | undefined)[], edge: FloatEdge): void {
  const predecessor = graph.nodes[edge.from];
  const successor = graph.nodes[edge.to];
  const successorLate = late[edge.to];
  const current = late[edge.from];
  if (!predecessor || !successor || !successorLate || !current) return;
  const { type, lag } = edge.dependency;
  const driven = drivenField(type);
  const anchor = anchorField(type);
  // The lag runs backward from the successor, in the successor's own days.
  const anchorLate = successor.days.lagLanding(
    successorLate[driven],
    { value: -lag.value, unit: lag.unit },
    driven,
  );
  if (anchorLate === undefined) return;
  const candidate = predecessor.days.follow(predecessor, anchor, predecessor.days.settle(anchor, anchorLate));
  if (diffMs(candidate.start, current.start) < 0) late[edge.from] = candidate;
}
