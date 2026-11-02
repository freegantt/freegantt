// scheduling/ — the propagation engine. Pure and deterministic: it never mutates its input, reads
// no clock and holds no state, so a drag preview can call it every frame and drop the answer.
// The engine copies the request into working Nodes and leaves the request as it was.
import type { EntryId, Instant } from '../model/index.js';
import { addMs, diffMs } from '../time/index.js';
import { FIELDS, moveSuccessor, movableFields, type Edge, type Node, type Run } from './propagate.js';
import { applyLag } from './apply-lag.js';
import { orderByDependency } from './dependency-order.js';
import type {
  ProposedEntryDates,
  ScheduleDependency,
  ScheduleField,
  ScheduleRequest,
} from './schedule-request.js';
import type {
  CycleDiagnostic,
  ScheduleChange,
  ScheduleDiagnostic,
  ScheduleResult,
} from './schedule-result.js';
import { defaultPolicy } from './scheduling-policy.js';

/**
 * Moves each successor to the earliest date its dependencies and constraint allow, or only later
 * when the request asks for `pushOnly`. It reports what it cannot move.
 * It never writes a date the user proposed and never moves a manually scheduled Entry.
 */
export function schedule(request: ScheduleRequest): ScheduleResult {
  const policy = request.policy ?? defaultPolicy;
  const nodes = request.entries.map(toNode);
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const run: Run = {
    nodes,
    policy,
    manuallyScheduled: request.manuallyScheduled ?? new Set(),
    constraints: request.constraints ?? new Map(),
    successorMoves: request.successorMoves ?? 'pushAndPull',
    diagnostics: [],
  };

  const unreadable: ScheduleDiagnostic[] = [];
  const edges = readEdges(request.dependencies, indexById, unreadable);
  const proposed = request.proposed ?? new Map<EntryId, ProposedEntryDates>();
  applyProposals(run, proposed, indexById);

  const incoming = nodes.map(() => [] as Edge[]);
  const successors = nodes.map(() => [] as number[]);
  for (const edge of edges) {
    incoming[edge.to]?.push(edge);
    successors[edge.from]?.push(edge.to);
  }

  const fullRecompute = proposed.size === 0;
  const loops: CycleDiagnostic[] = [];
  for (const step of orderByDependency(nodes.length, successors)) {
    if (step.isLoop) {
      loops.push({ code: 'cycle', entryIds: step.nodes.map((index) => (nodes[index] as Node).id) });
      continue;
    }
    const target = step.nodes[0] as number;
    moveSuccessor(run, target, incoming[target] ?? [], fullRecompute);
  }

  return {
    patch: nodes.flatMap(changesOf),
    diagnostics: [...unreadable, ...inRequestOrder(loops, nodes), ...run.diagnostics],
  };
}

/** Lists loops by their first member's place in the request, so the answer does not depend on the walk order. */
function inRequestOrder(loops: readonly CycleDiagnostic[], nodes: readonly Node[]): CycleDiagnostic[] {
  const position = new Map(nodes.map((node, index) => [node.id, index]));
  const first = (loop: CycleDiagnostic): number => position.get(loop.entryIds[0] as EntryId) as number;
  return [...loops].sort((a, b) => first(a) - first(b));
}

function toNode(entry: ScheduleRequest['entries'][number]): Node {
  return {
    id: entry.id,
    hasChildren: entry.hasChildren,
    original: { start: entry.start, end: entry.end },
    start: entry.start,
    end: entry.end,
    proposedFields: new Set(),
    changed: false,
  };
}

function readEdges(
  dependencies: readonly ScheduleDependency[],
  indexById: ReadonlyMap<EntryId, number>,
  diagnostics: ScheduleDiagnostic[],
): Edge[] {
  const edges: Edge[] = [];
  for (const dependency of dependencies) {
    const from = indexById.get(dependency.fromId);
    const to = indexById.get(dependency.toId);
    if (from === undefined || to === undefined) {
      diagnostics.push({ code: 'unknown-entry', dependencyId: dependency.id });
    } else if (applyLag(0 as Instant, dependency.lag) === undefined) {
      diagnostics.push({ code: 'unsupported-lag-unit', dependencyId: dependency.id });
    } else {
      edges.push({ dependency, from, to });
    }
  }
  return edges;
}

/** Writes the user's dates into the working copy, then moves the dates the policy frees so the span keeps its length. */
function applyProposals(
  run: Run,
  proposed: ReadonlyMap<EntryId, ProposedEntryDates>,
  indexById: ReadonlyMap<EntryId, number>,
): void {
  for (const [id, dates] of proposed) {
    const index = indexById.get(id);
    if (index === undefined) continue;
    const node = run.nodes[index] as Node;
    const touched = FIELDS.filter((field) => dates[field] !== undefined);
    if (touched.length === 0) continue;
    for (const field of touched) node.proposedFields.add(field);
    const moves = movableFields(run.policy, node);
    const lead = touched[0] as ScheduleField;
    const before = node[lead];
    const after = dates[lead] as Instant;
    for (const field of touched) node[field] = dates[field];
    node.changed = true;
    if (before === undefined) continue;
    for (const field of moves) {
      const current = node[field];
      if (current !== undefined) node[field] = addMs(current, diffMs(after, before));
    }
  }
}

/** The engine's own dates, minus the ones the user proposed. */
function changesOf(node: Node): ScheduleChange[] {
  const changes: ScheduleChange[] = [];
  for (const field of FIELDS) {
    const from = node.original[field];
    const to = node[field];
    if (node.proposedFields.has(field) || from === undefined || to === undefined || from === to) continue;
    changes.push({ id: node.id, field, from, to });
  }
  return changes;
}
