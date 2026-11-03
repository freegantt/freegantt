// scheduling/golden — a scenario states a schedule in whole days and the answer a person worked out by hand.
// The runner converts days to instants, calls `schedule()`, and compares with the expected answer.
import { entryId, type EntryId, type Instant } from '../../model/index.js';
import { MS, createZonedTime } from '../../time/index.js';
import type {
  ScheduleCalendar,
  ScheduleConstraint,
  ScheduleDependencyType,
  ScheduleField,
  ScheduleRequest,
  SuccessorMoves,
} from '../schedule-request.js';
import { workingCalendar, type WorkingCalendarOptions } from '../working-calendar.js';
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
  | {
      readonly code: 'constraint-violated';
      readonly constraint: 'finishNoLaterThan' | 'mustStartOn';
      readonly entryId: string;
      readonly dependencyIds: readonly string[];
    }
  | { readonly code: 'unknown-entry' | 'unsupported-lag-unit'; readonly dependencyId: string };

/**
 * Day 0 is Thursday 1970-01-01, so day 4 is the first Monday and day 11 the next one. A calendar
 * holiday reads as a `'YYYY-MM-DD'` date in that week.
 */
export interface GoldenCalendars {
  /** The named calendars. */
  readonly named: Readonly<Record<string, WorkingCalendarOptions>>;
  /** The calendar of every Entry that `ofEntry` does not name. */
  readonly calendar?: string;
  /** Per Entry id, the name of its calendar. */
  readonly ofEntry?: Readonly<Record<string, string>>;
}

export interface GoldenScenario {
  readonly name: string;
  readonly entries: readonly GoldenEntry[];
  readonly dependencies: readonly GoldenDependency[];
  /** What the user just set, per Entry id, in days. */
  readonly proposed?: Readonly<Record<string, Partial<Record<ScheduleField, number>>>>;
  readonly manuallyScheduled?: readonly string[];
  /** Per Entry id, the day before which the Entry may not start. */
  readonly startNoEarlierThan?: Readonly<Record<string, number>>;
  /** Per Entry id, the day by which the Entry should finish. */
  readonly finishNoLaterThan?: Readonly<Record<string, number>>;
  /** Per Entry id, the day on which the Entry must start. */
  readonly mustStartOn?: Readonly<Record<string, number>>;
  readonly successorMoves?: SuccessorMoves;
  /** Absent means 24-hour days. */
  readonly calendars?: GoldenCalendars;
  readonly expected: {
    readonly patch: readonly GoldenChange[];
    readonly diagnostics?: readonly GoldenDiagnostic[];
  };
}

export function day(count: number): Instant {
  return (count * MS.DAY) as Instant;
}

function toCalendar(calendars: GoldenCalendars): ScheduleCalendar {
  const built = new Map(
    Object.entries(calendars.named).map(([name, options]) => [name, workingCalendar(options)]),
  );
  const named = (name: string) => built.get(name);
  const calendar = calendars.calendar === undefined ? undefined : named(calendars.calendar);
  return {
    time: createZonedTime('UTC'),
    ...(calendar === undefined ? {} : { calendar }),
    ofEntry: new Map(
      Object.entries(calendars.ofEntry ?? {}).flatMap(([id, name]) => {
        const own = named(name);
        return own === undefined ? [] : [[entryId(id), own] as const];
      }),
    ),
  };
}

export function toRequest(scenario: GoldenScenario): ScheduleRequest {
  const proposed = new Map<EntryId, Partial<Record<ScheduleField, Instant>>>();
  for (const [id, fields] of Object.entries(scenario.proposed ?? {})) {
    proposed.set(entryId(id), {
      ...(fields.start === undefined ? {} : { start: day(fields.start) }),
      ...(fields.end === undefined ? {} : { end: day(fields.end) }),
    });
  }
  const constraints = new Map<EntryId, ScheduleConstraint>();
  const kinds = ['startNoEarlierThan', 'finishNoLaterThan', 'mustStartOn'] as const;
  for (const kind of kinds) {
    for (const [id, date] of Object.entries(scenario[kind] ?? {}))
      constraints.set(entryId(id), { kind, date: day(date) });
  }
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
    ...(scenario.calendars === undefined ? {} : { calendar: toCalendar(scenario.calendars) }),
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
    case 'constraint-violated':
      return { ...diagnostic, entryId: entryId(diagnostic.entryId) };
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
