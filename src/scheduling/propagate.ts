// scheduling/ — moves one Entry to satisfy the dependencies that reach it.
// This file contains no recursive call; chain depth is unbounded by design. The caller walks the
// Entries in dependency order, so each call sees final dates for every predecessor.
import type { EntryId, Instant } from '../model/index.js';
import { addMs, diffMs } from '../time/index.js';
import type { DayCounting, Span } from './day-counting.js';
import type {
  ScheduleConstraint,
  ScheduleDependency,
  ScheduleField,
  SuccessorMoves,
} from './schedule-request.js';
import type { BlockedMoveDiagnostic, ScheduleDiagnostic } from './schedule-result.js';
import type { SchedulingPolicy, ScheduleRuleKind } from './scheduling-policy.js';

export const FIELDS: readonly ScheduleField[] = Object.freeze(['start', 'end'] as const);

/** One Entry while the engine works. `start` and `end` hold the working dates, `original` the dates in the request. */
export interface Node {
  readonly id: EntryId;
  readonly hasChildren: boolean;
  /** How this Entry counts days: in workdays when it has a working calendar, in 24-hour days when it has none. */
  readonly days: DayCounting;
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

/** What one dependency asks of its successor on one field. A negative `delta` means the successor could start or finish earlier. */
interface Demand {
  readonly dependencyId: string;
  readonly field: ScheduleField;
  readonly delta: number;
}

/** The distance each field must shift. A field that no rule reaches is absent. */
type FieldDeltas = Partial<Record<ScheduleField, number>>;

/** Everything one run reads, resolved once. */
export interface Run {
  readonly nodes: readonly Node[];
  readonly policy: SchedulingPolicy;
  readonly manuallyScheduled: ReadonlySet<EntryId>;
  readonly constraints: ReadonlyMap<EntryId, ScheduleConstraint>;
  readonly successorMoves: SuccessorMoves;
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

/** What a predecessor asks of its successor, or `undefined` when a date is missing. */
function demandOf(edge: Edge, nodes: readonly Node[]): Demand | undefined {
  const predecessor = nodes[edge.from] as Node;
  const successor = nodes[edge.to] as Node;
  if (!isDated(predecessor) || !isDated(successor)) return undefined;
  const { type, lag, id } = edge.dependency;
  const anchor = type === 'FS' || type === 'FF' ? predecessor.end : predecessor.start;
  const field: ScheduleField = type === 'FS' || type === 'SS' ? 'start' : 'end';
  // The successor's calendar counts the lag, as the default of Primavera P6 does.
  const required = successor.days.lagLanding(anchor, lag, field);
  if (required === undefined) return undefined;
  return { dependencyId: id, field, delta: diffMs(required, successor.days.settle(field, successor[field])) };
}

/** Whether this run lets the Entry move earlier. A user edit sets a floor, so an edited Entry never moves earlier. */
function mayPull(run: Run, node: Node): boolean {
  return run.successorMoves === 'pushAndPull' && node.proposedFields.size === 0;
}

/**
 * The dependencies worth reading for one Entry. A pull needs every incoming dependency once any
 * predecessor changed, because an unchanged predecessor may be the one that holds the Entry back.
 */
function edgesToRead(
  run: Run,
  node: Node,
  incoming: readonly Edge[],
  fullRecompute: boolean,
): readonly Edge[] {
  const predecessorChanged = (edge: Edge): boolean => (run.nodes[edge.from] as Node).changed;
  const readsAll =
    fullRecompute ||
    node.proposedFields.size > 0 ||
    (run.successorMoves === 'pushAndPull' && incoming.some(predecessorChanged));
  return readsAll ? incoming : incoming.filter(predecessorChanged);
}

/** Places one Entry by its dependencies and its constraint, then reports a constraint it breaks. */
export function moveSuccessor(
  run: Run,
  index: number,
  incoming: readonly Edge[],
  fullRecompute: boolean,
): void {
  const node = run.nodes[index] as Node;
  if (!isDated(node)) return;
  const constraint = run.constraints.get(node.id);
  if (constraint?.kind === 'mustStartOn' && holdsMustStart(run, node)) {
    holdStart(run, node, incoming, constraint.date);
  } else {
    followDependencies(run, node, incoming, fullRecompute, constraint);
  }
  if (constraint) reportBrokenConstraint(run, node, incoming, constraint);
}

/** Applies every demand that reaches one Entry, or reports why it cannot. */
function followDependencies(
  run: Run,
  node: Node & { start: Instant; end: Instant },
  incoming: readonly Edge[],
  fullRecompute: boolean,
  constraint: ScheduleConstraint | undefined,
): void {
  const demands: Demand[] = [];
  for (const edge of edgesToRead(run, node, incoming, fullRecompute)) {
    const demand = demandOf(edge, run.nodes);
    if (demand) demands.push(demand);
  }
  const violations = demands.filter((demand) => demand.delta > 0);
  if (manualBeatsDependency(run, node)) {
    if (violations.length > 0) report(run, node, violations, 'manuallyScheduled');
    return;
  }
  // A start floor moves an Entry later even when no dependency reaches it. It never moves it earlier alone.
  const floorDate = startFloorOf(constraint);
  const floorDelta =
    floorDate && diffMs(node.days.settle('start', floorDate), node.days.settle('start', node.start));
  if (demands.length === 0 && !(floorDelta && floorDelta > 0)) return;

  const moves = movableFields(run.policy, node);
  const dependencyDeltas = deltasByField(demands, undefined, true);
  const deltas = deltasByField(demands, floorDelta, mayPull(run, node));
  const shift = chooseShift(moves, deltas);
  const blockedField = FIELDS.find((field) => (dependencyDeltas[field] ?? 0) > 0 && shift[field] === 0);
  const placed = shiftedSpan(node, moves, shift);
  if ((shift.start > 0 || shift.end < 0) && placed.start > placed.end) {
    if (violations.length > 0) report(run, node, violations, 'inverted');
    return;
  }
  if (shift.start !== 0 || shift.end !== 0) {
    node.start = placed.start;
    node.end = placed.end;
    node.changed = true;
  }
  if (blockedField)
    report(run, node, violations, node.proposedFields.has(blockedField) ? 'proposed' : 'policy');
}

/** The date before which the constraint stops a start. A `mustStartOn` date that loses to a dependency stops the start too. */
function startFloorOf(constraint: ScheduleConstraint | undefined): Instant | undefined {
  return constraint?.kind === 'finishNoLaterThan' ? undefined : constraint?.date;
}

function manualBeatsDependency(run: Run, node: Node): boolean {
  return run.manuallyScheduled.has(node.id) && ranksAbove(run, 'manuallyScheduled', 'dependency');
}

/** Does a must-start-on date hold on this Entry? A manually scheduled Entry or a policy that ranks the dependency higher overrules it. */
function holdsMustStart(run: Run, node: Node): boolean {
  if (run.manuallyScheduled.has(node.id) && ranksAbove(run, 'manuallyScheduled', 'mustStartOn')) return false;
  return ranksAbove(run, 'mustStartOn', 'dependency');
}

function ranksAbove(run: Run, winner: ScheduleRuleKind, loser: ScheduleRuleKind): boolean {
  const rank = (kind: ScheduleRuleKind): number => {
    const position = run.policy.precedence.indexOf(kind);
    return position < 0 ? Number.POSITIVE_INFINITY : position;
  };
  return rank(winner) < rank(loser);
}

/** Puts the start on the constraint date, then reports each dependency that wants it later. */
function holdStart(
  run: Run,
  node: Node & { start: Instant; end: Instant },
  incoming: readonly Edge[],
  date: Instant,
): void {
  const moves = movableFields(run.policy, node);
  const delta = diffMs(node.days.settle('start', date), node.days.settle('start', node.start));
  const shift = chooseShift(moves, { start: delta });
  const placed = shiftedSpan(node, moves, shift);
  const inverted = (shift.start > 0 || shift.end < 0) && placed.start > placed.end;
  if (!inverted && (shift.start !== 0 || shift.end !== 0)) {
    node.start = placed.start;
    node.end = placed.end;
    node.changed = true;
  }
  const violations = demandsOf(incoming, run.nodes).filter((demand) => demand.delta > 0);
  if (violations.length > 0) report(run, node, violations, 'mustStartOn');
}

function demandsOf(incoming: readonly Edge[], nodes: readonly Node[]): Demand[] {
  return incoming.flatMap((edge) => demandOf(edge, nodes) ?? []);
}

/** Reports a ceiling the finish passes, or a must-start-on date the Entry could not reach. */
function reportBrokenConstraint(
  run: Run,
  node: Node,
  incoming: readonly Edge[],
  constraint: ScheduleConstraint,
): void {
  if (!isDated(node) || constraint.kind === 'startNoEarlierThan') return;
  const broken =
    constraint.kind === 'finishNoLaterThan'
      ? diffMs(node.days.settle('end', node.end), node.days.settle('end', constraint.date)) > 0
      : diffMs(node.days.settle('start', node.start), node.days.settle('start', constraint.date)) !== 0;
  if (!broken) return;
  // A dependency holds the finish when it asks for no earlier date than the Entry has.
  const holding =
    constraint.kind === 'finishNoLaterThan'
      ? demandsOf(incoming, run.nodes).filter((demand) => demand.delta >= 0)
      : [];
  run.diagnostics.push({
    code: 'constraint-violated',
    constraint: constraint.kind,
    entryId: node.id,
    dependencyIds: holding.map((demand) => demand.dependencyId),
  });
}

/**
 * The largest distance each field must shift to meet every dependency and the start floor.
 * Without `pull`, a distance below zero counts as zero, so the Entry only moves later.
 */
function deltasByField(
  demands: readonly Demand[],
  startFloorDelta: number | undefined,
  pull: boolean,
): FieldDeltas {
  const deltas: { start?: number; end?: number } = {};
  const raise = (field: ScheduleField, delta: number): void => {
    const wanted = pull ? delta : Math.max(0, delta);
    deltas[field] = deltas[field] === undefined ? wanted : Math.max(deltas[field], wanted);
  };
  for (const demand of demands) raise(demand.field, demand.delta);
  if (startFloorDelta !== undefined) raise('start', startFloorDelta);
  return deltas;
}

/** How far each date shifts. `anchor` is the date that meets the largest demand when the whole span shifts. */
interface Shift {
  readonly start: number;
  readonly end: number;
  readonly anchor: ScheduleField;
}

/** A free span shifts whole by the largest demand. A half-free span shifts only its free date. */
function chooseShift(moves: readonly ScheduleField[], deltas: FieldDeltas): Shift {
  if (moves.includes('start') && moves.includes('end')) {
    const startDelta = deltas.start ?? Number.NEGATIVE_INFINITY;
    const endDelta = deltas.end ?? Number.NEGATIVE_INFINITY;
    const whole = Math.max(startDelta, endDelta);
    return { start: whole, end: whole, anchor: startDelta >= endDelta ? 'start' : 'end' };
  }
  return {
    start: moves.includes('start') ? (deltas.start ?? 0) : 0,
    end: moves.includes('end') ? (deltas.end ?? 0) : 0,
    anchor: moves.includes('end') ? 'end' : 'start',
  };
}

/** The dates after a shift. A whole span keeps its length in the Entry's own days. */
function shiftedSpan(
  node: Node & { start: Instant; end: Instant },
  moves: readonly ScheduleField[],
  shift: Shift,
): Span {
  if (shift.start === 0 && shift.end === 0) return { start: node.start, end: node.end };
  if (moves.includes('start') && moves.includes('end'))
    return node.days.follow(
      node,
      shift.anchor,
      addMs(node.days.settle(shift.anchor, node[shift.anchor]), shift[shift.anchor]),
    );
  return {
    start: shift.start === 0 ? node.start : addMs(node.days.settle('start', node.start), shift.start),
    end: shift.end === 0 ? node.end : addMs(node.days.settle('end', node.end), shift.end),
  };
}

function report(
  run: Run,
  node: Node & { start: Instant; end: Instant },
  demands: readonly Demand[],
  reason: BlockedMoveDiagnostic['reason'],
): void {
  const driver = demands.reduce((most, demand) => (demand.delta > most.delta ? demand : most));
  const wouldMove = shiftedSpan(node, ['start', 'end'], {
    start: driver.delta,
    end: driver.delta,
    anchor: driver.field,
  });
  const diagnostic: BlockedMoveDiagnostic = {
    code: 'blocked-move',
    reason,
    entryId: node.id,
    dependencyIds: demands.map((demand) => demand.dependencyId),
    wouldChange: FIELDS.map((field) => ({
      id: node.id,
      field,
      from: node[field],
      to: wouldMove[field],
    })),
  };
  run.diagnostics.push(diagnostic);
}
