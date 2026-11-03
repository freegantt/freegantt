// api/ — the narrow slice of `scheduling/`'s public surface `extensions/features/scheduling.ts` needs
// directly (extensions/ may reach api/ and model/ only). Not `api/index.ts`'s own barrel: that
// file re-exports `scheduling` itself, so a feature file importing the barrel back would close a
// cycle (no-circular) — the same reason `time-facade.ts` exists.
export { schedule, workingCalendar, calculateFloat, findDrivingPath } from '../scheduling/index.js';
export type { WorkingCalendar } from '../scheduling/index.js';
export type {
  ScheduleConstraint,
  ScheduleDiagnostic,
  ScheduleEntry,
  ScheduleCalendar,
  ScheduleRequest,
  ScheduleResult,
  SuccessorMoves,
} from '../scheduling/index.js';
export type { FloatRequest, FloatResult, EntryFloat } from '../scheduling/index.js';
