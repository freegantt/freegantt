// scheduling/ — first-party default scheduling plugin: pure propagation engine + policy seam
// (plans/01 §7, ADR 0002). DOM-free, but not mandatory core — occupies data/'s extension hook
// only when installed. schedule() is pure and deterministic; propagation is a
// worklist loop — no recursion, ever.
export { workingCalendar, InvalidWorkingCalendarError } from './working-calendar.js';
export type { WorkingCalendar, WorkingCalendarOptions, OffTimeCover, Workday } from './working-calendar.js';
export { schedule } from './schedule.js';
export { defaultPolicy } from './scheduling-policy.js';
export type { SchedulingPolicy, EditResolution, ScheduleRuleKind } from './scheduling-policy.js';
export type {
  ScheduleRequest,
  ScheduleDependency,
  ScheduleConstraint,
  ScheduleConstraintKind,
  ScheduleDependencyType,
  ScheduleCalendar,
  SuccessorMoves,
  ScheduleEntry,
  ScheduleField,
  ProposedEntryDates,
} from './schedule-request.js';
export type {
  ScheduleResult,
  ScheduleChange,
  ScheduleDiagnostic,
  CycleDiagnostic,
  BlockedMoveDiagnostic,
  ConstraintViolationDiagnostic,
  BlockReason,
  InvalidDependencyDiagnostic,
} from './schedule-result.js';
