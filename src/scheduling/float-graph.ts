// scheduling/ — the Dependency graph that the float analysis and the driving path both read.
// It keeps the dated leaf Entries and the Dependencies the engine can read, and it marks loops.
import type { EntryId, Instant } from '../model/index.js';
import { dayCountingFor } from './day-counting.js';
import type { DayCounting, ScheduleCalendar } from './day-counting.js';
import { orderByDependency } from './dependency-order.js';
import type { ScheduleEntry, ScheduleField } from './schedule-entry.js';
import type { ScheduleDependency, ScheduleDependencyType } from './schedule-request.js';

/** What the float analysis reads. The Entries hold the dates the schedule gives them now. */
export interface FloatRequest {
  readonly entries: readonly ScheduleEntry[];
  readonly dependencies: readonly ScheduleDependency[];
  /** Without it a day is 24 hours. With it, float counts workdays. */
  readonly calendar?: ScheduleCalendar;
}

/** One scheduled Entry. A summary Entry or an Entry with a missing date is not a node. */
export interface FloatNode {
  readonly id: EntryId;
  readonly days: DayCounting;
  readonly start: Instant;
  readonly end: Instant;
  /** True when the Entry sits in a loop of Dependencies. */
  readonly inLoop: boolean;
}

/** One Dependency between two nodes, by node index. */
export interface FloatEdge {
  readonly dependency: ScheduleDependency;
  readonly from: number;
  readonly to: number;
}

export interface FloatGraph {
  readonly nodes: readonly FloatNode[];
  readonly indexById: ReadonlyMap<EntryId, number>;
  /** Dependencies between nodes outside any loop. */
  readonly edges: readonly FloatEdge[];
  /** Node indexes with every predecessor before its successors. Loop members are absent. */
  readonly order: readonly number[];
}

/** Builds the graph. A loop skips its members, and a Dependency that touches a loop member is dropped. */
export function buildFloatGraph(request: FloatRequest): FloatGraph {
  const dated = request.entries.filter(
    (entry): entry is ScheduleEntry & { start: Instant; end: Instant } =>
      !entry.hasChildren && entry.start !== undefined && entry.end !== undefined,
  );
  const indexById = new Map(dated.map((entry, index) => [entry.id, index]));
  const readable = readableEdges(request, indexById);

  const successors = dated.map(() => [] as number[]);
  for (const edge of readable) successors[edge.from]?.push(edge.to);
  const steps = orderByDependency(dated.length, successors);
  const loopMembers = new Set(steps.filter((step) => step.isLoop).flatMap((step) => step.nodes));

  const nodes = dated.map<FloatNode>((entry, index) => ({
    id: entry.id,
    days: dayCountingFor(request.calendar, entry.id),
    start: entry.start,
    end: entry.end,
    inLoop: loopMembers.has(index),
  }));
  return {
    nodes,
    indexById,
    edges: readable.filter((edge) => !loopMembers.has(edge.from) && !loopMembers.has(edge.to)),
    order: steps.filter((step) => !step.isLoop).map((step) => step.nodes[0] as number),
  };
}

/** The Dependencies between two nodes whose lag the successor's calendar can count. */
function readableEdges(request: FloatRequest, indexById: ReadonlyMap<EntryId, number>): FloatEdge[] {
  const edges: FloatEdge[] = [];
  for (const dependency of request.dependencies) {
    const from = indexById.get(dependency.fromId);
    const to = indexById.get(dependency.toId);
    if (from === undefined || to === undefined) continue;
    if (!dayCountingFor(request.calendar, dependency.toId).supports(dependency.lag)) continue;
    edges.push({ dependency, from, to });
  }
  return edges;
}

/** The date of the successor that a Dependency of this type drives. */
export function drivenField(type: ScheduleDependencyType): ScheduleField {
  return type === 'FS' || type === 'SS' ? 'start' : 'end';
}

/** The date of the predecessor that a Dependency of this type reads. */
export function anchorField(type: ScheduleDependencyType): ScheduleField {
  return type === 'FS' || type === 'FF' ? 'end' : 'start';
}
