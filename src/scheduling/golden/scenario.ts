// scheduling/golden — a scenario states a schedule in whole days and the answer a person worked out by hand.
// The runner converts days to instants, calls `schedule()`, and compares with the expected answer.
import { entryId, type EntryId, type Instant } from '../../model/index.js';
import { MS } from '../../time/index.js';
import type {
  ScheduleConstraint,
  ScheduleDependencyType,
  ScheduleField,
  ScheduleRequest,
  SuccessorMoves,
} from '../schedule-request.js';
import type { BlockReason, ScheduleChange, ScheduleDiagnostic, ScheduleResult } from '../schedule-result.js';

/** `[id, startDay, endDay]`, or `[id, startDay, endDay, 'parent']` for an Entry that has children. */
export type GoldenEntry = readonly [string, number, number] | readonly [string, number, number, 'parent'];
/** `[dependencyId, fromId, toId, type, lagInDays]`. */
export type GoldenDependency = readonly [string, string, string, ScheduleDependencyType, number];
/** `[id, field, fromDay, toDay]`. */
export type GoldenChange = readonly [string, ScheduleField, number, number];

export type GoldenDiagnostic =
  | { readonly code: 'cycle'; readonly entryIds: readonly string[] }
  | {
      readonly code: 'blocked-move';
      readonly reason: BlockReason;
      readonly entryId: string;
      readonly dependencyIds: readonly string[];
      readonly wouldChange: readonly GoldenChange[];
    }
  | { readonly code: 'unknown-entry' | 'unsupported-lag-unit'; readonly dependencyId: string };

export interface GoldenScenario {
  readonly name: string;
  readonly entries: readonly GoldenEntry[];
  readonly dependencies: readonly GoldenDependency[];
  /** What the user just set, per Entry id, in days. */
  readonly proposed?: Readonly<Record<string, Partial<Record<ScheduleField, number>>>>;
  readonly manuallyScheduled?: readonly string[];
  /** Per Entry id, the day before which the Entry may not start. */
  readonly startNoEarlierThan?: Readonly<Record<string, number>>;
  readonly successorMoves?: SuccessorMoves;
  readonly expected: {
    readonly patch: readonly GoldenChange[];
    readonly diagnostics?: readonly GoldenDiagnostic[];
  };
}

export function day(count: number): Instant {
  return (count * MS.DAY) as Instant;
}

export function toRequest(scenario: GoldenScenario): ScheduleRequest {
  const proposed = new Map<EntryId, Partial<Record<ScheduleField, Instant>>>();
  for (const [id, fields] of Object.entries(scenario.proposed ?? {})) {
    proposed.set(entryId(id), {
      ...(fields.start === undefined ? {} : { start: day(fields.start) }),
      ...(fields.end === undefined ? {} : { end: day(fields.end) }),
    });
  }
  const constraints = new Map<EntryId, ScheduleConstraint>(
    Object.entries(scenario.startNoEarlierThan ?? {}).map(([id, date]) => [
      entryId(id),
      { kind: 'startNoEarlierThan', date: day(date) },
    ]),
  );
  return {
    entries: scenario.entries.map(([id, start, end, parent]) => ({
      id: entryId(id),
      start: day(start),
      end: day(end),
      hasChildren: parent === 'parent',
    })),
    dependencies: scenario.dependencies.map(([id, fromId, toId, type, lagDays]) => ({
      id,
      fromId: entryId(fromId),
      toId: entryId(toId),
      type,
      lag: { value: lagDays, unit: 'day' },
    })),
    proposed,
    manuallyScheduled: new Set((scenario.manuallyScheduled ?? []).map(entryId)),
    constraints,
    ...(scenario.successorMoves === undefined ? {} : { successorMoves: scenario.successorMoves }),
  };
}

function toChange([id, field, from, to]: GoldenChange): ScheduleChange {
  return { id: entryId(id), field, from: day(from), to: day(to) };
}

function toDiagnostic(diagnostic: GoldenDiagnostic): ScheduleDiagnostic {
  switch (diagnostic.code) {
    case 'cycle':
      return { code: 'cycle', entryIds: diagnostic.entryIds.map(entryId) };
    case 'blocked-move':
      return {
        ...diagnostic,
        entryId: entryId(diagnostic.entryId),
        wouldChange: diagnostic.wouldChange.map(toChange),
      };
    default:
      return diagnostic;
  }
}

export function toExpectedResult(scenario: GoldenScenario): ScheduleResult {
  return {
    patch: scenario.expected.patch.map(toChange),
    diagnostics: (scenario.expected.diagnostics ?? []).map(toDiagnostic),
  };
}
