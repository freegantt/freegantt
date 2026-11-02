// scheduling/ — moves one Entry to satisfy the dependencies that reach it.
// This file contains no recursive call; chain depth is unbounded by design. The caller walks the
// Entries in dependency order, so each call sees final dates for every predecessor.
import type { EntryId, Instant } from '../model/index.js';
import { addMs, diffMs } from '../time/index.js';
import { applyLag } from './apply-lag.js';
import type { ScheduleDependency, ScheduleField } from './schedule-request.js';
import type { BlockedMoveDiagnostic, ScheduleDiagnostic } from './schedule-result.js';
import type { SchedulingPolicy } from './scheduling-policy.js';

export const FIELDS: readonly ScheduleField[] = Object.freeze(['start', 'end'] as const);

/** One Entry while the engine works. `start` and `end` hold the working dates, `original` the dates in the request. */
export interface Node {
  readonly id: EntryId;
  readonly hasChildren: boolean;
  readonly original: { readonly start: Instant | undefined; readonly end: Instant | undefined };
  start: Instant | undefined;
  end: Instant | undefined;
  /** The fields the user proposed. */
  readonly proposedFields: Set<ScheduleField>;
  /** Whether this Entry's dates changed in this run, by proposal or by move. */
  changed: boolean;
}

export interface Edge {
  readonly dependency: ScheduleDependency;
  readonly from: number;
  readonly to: number;
}

/** A dependency that asks its successor to move one field later. `delta` is always positive. */
interface Demand {
  readonly dependencyId: string;
  readonly field: ScheduleField;
  readonly delta: number;
}

/** Everything one run reads, resolved once. */
export interface Run {
  readonly nodes: readonly Node[];
  readonly policy: SchedulingPolicy;
  readonly pinned: ReadonlySet<EntryId>;
  readonly diagnostics: ScheduleDiagnostic[];
}

/** Asks the policy which dates may move, and refuses an answer that names a date the user proposed. */
export function movableFields(policy: SchedulingPolicy, node: Node): readonly ScheduleField[] {
  const { moves } = policy.resolveEdit(node.proposedFields, node);
  const overwritten = moves.find((field) => node.proposedFields.has(field));
  if (overwritten) {
    throw new Error(
      `The scheduling policy moved the proposed ${overwritten} of Entry "${node.id}". A policy must move only dates the user did not touch.`,
    );
  }
  return moves;
}

function isDated(node: Node): node is Node & { start: Instant; end: Instant } {
  return node.start !== undefined && node.end !== undefined;
}

/** What a predecessor asks of its successor, or `undefined` when the dependency holds or a date is missing. */
function demandOf(edge: Edge, nodes: readonly Node[]): Demand | undefined {
  const predecessor = nodes[edge.from] as Node;
  const successor = nodes[edge.to] as Node;
  if (!isDated(predecessor) || !isDated(successor)) return undefined;
  const { type, lag, id } = edge.dependency;
  const anchor = type === 'FS' || type === 'FF' ? predecessor.end : predecessor.start;
  const field: ScheduleField = type === 'FS' || type === 'SS' ? 'start' : 'end';
  const required = applyLag(anchor, lag);
  if (required === undefined) return undefined;
  const delta = diffMs(required, successor[field]);
  return delta > 0 ? { dependencyId: id, field, delta } : undefined;
}

/** Applies every demand that reaches one Entry, or reports why it cannot. */
export function moveSuccessor(
  run: Run,
  index: number,
  incoming: readonly Edge[],
  fullRecompute: boolean,
): void {
  const node = run.nodes[index] as Node;
  const demands: Demand[] = [];
  for (const edge of incoming) {
    if (!fullRecompute && !(run.nodes[edge.from] as Node).changed && node.proposedFields.size === 0) continue;
    const demand = demandOf(edge, run.nodes);
    if (demand) demands.push(demand);
  }
  if (demands.length === 0 || !isDated(node)) return;

  if (pinBeatsDependency(run, node)) {
    report(run, node, demands, 'pinned');
    return;
  }
  const moves = movableFields(run.policy, node);
  const deltas = deltasByField(demands);
  const shift = chooseShift(moves, deltas);
  const blockedField = FIELDS.find((field) => deltas[field] > 0 && shift[field] === 0);
  if (shift.start > 0 && node.start + shift.start > node.end + shift.end) {
    report(run, node, demands, 'inverted');
    return;
  }
  if (shift.start > 0 || shift.end > 0) {
    node.start = addMs(node.start, shift.start);
    node.end = addMs(node.end, shift.end);
    node.changed = true;
  }
  if (blockedField) report(run, node, demands, node.proposedFields.has(blockedField) ? 'proposed' : 'policy');
}

function pinBeatsDependency(run: Run, node: Node): boolean {
  if (!run.pinned.has(node.id)) return false;
  const rank = (kind: 'pinned' | 'dependency'): number => {
    const position = run.policy.precedence.indexOf(kind);
    return position < 0 ? Number.POSITIVE_INFINITY : position;
  };
  return rank('pinned') < rank('dependency');
}

function deltasByField(demands: readonly Demand[]): Record<ScheduleField, number> {
  const deltas = { start: 0, end: 0 };
  for (const demand of demands) deltas[demand.field] = Math.max(deltas[demand.field], demand.delta);
  return deltas;
}

/** A free span shifts whole by the largest demand. A half-free span shifts only its free date. */
function chooseShift(
  moves: readonly ScheduleField[],
  deltas: Record<ScheduleField, number>,
): Record<ScheduleField, number> {
  if (moves.includes('start') && moves.includes('end')) {
    const whole = Math.max(deltas.start, deltas.end);
    return { start: whole, end: whole };
  }
  return {
    start: moves.includes('start') ? deltas.start : 0,
    end: moves.includes('end') ? deltas.end : 0,
  };
}

function report(
  run: Run,
  node: Node & { start: Instant; end: Instant },
  demands: readonly Demand[],
  reason: BlockedMoveDiagnostic['reason'],
): void {
  const whole = Math.max(...demands.map((demand) => demand.delta));
  const diagnostic: BlockedMoveDiagnostic = {
    code: 'blocked-move',
    reason,
    entryId: node.id,
    dependencyIds: demands.map((demand) => demand.dependencyId),
    wouldChange: FIELDS.map((field) => ({
      id: node.id,
      field,
      from: node[field],
      to: addMs(node[field], whole),
    })),
  };
  run.diagnostics.push(diagnostic);
}
