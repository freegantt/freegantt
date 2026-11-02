// api/ — the narrow slice of `scheduling/`'s public surface `extensions/features/scheduling.ts` needs
// directly (extensions/ may reach api/ and model/ only). Not `api/index.ts`'s own barrel: that
// file re-exports `scheduling` itself, so a feature file importing the barrel back would close a
// cycle (no-circular) — the same reason `time-facade.ts` exists.
export { schedule } from '../scheduling/index.js';
export type {
  ScheduleConstraint,
  ScheduleDiagnostic,
  ScheduleEntry,
  ScheduleRequest,
  SuccessorMoves,
} from '../scheduling/index.js';
