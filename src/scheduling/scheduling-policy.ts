// scheduling/ — the decisions where scheduling methods differ. The engine knows graphs and lag.
// The policy knows what an Entry may do.
import type { ScheduleEntry, ScheduleField } from './schedule-entry.js';

const SCHEDULE_FIELDS: readonly ScheduleField[] = Object.freeze(['start', 'end'] as const);

/** A rule that can win a conflict. */
export type ScheduleRuleKind = 'manuallyScheduled' | 'dependency';

/** Which dates the engine may move on one Entry. */
export interface EditResolution {
  readonly moves: readonly ScheduleField[];
}

export interface SchedulingPolicy {
  /**
   * Which dates may the engine move, given the dates the user touched?
   * It must never list a touched date. The engine throws when it does.
   */
  resolveEdit(touched: ReadonlySet<ScheduleField>, entry: ScheduleEntry): EditResolution;
  /** Which rule wins a conflict. The first kind wins. A kind that is absent loses. */
  readonly precedence: readonly ScheduleRuleKind[];
}

/**
 * The neutral policy. A user edit moves the dates the user did not touch. A parent never moves,
 * because its span comes from its children. A manually scheduled Entry beats a dependency.
 */
export const defaultPolicy: SchedulingPolicy = Object.freeze<SchedulingPolicy>({
  resolveEdit(touched, entry) {
    if (entry.hasChildren) return { moves: [] };
    return { moves: SCHEDULE_FIELDS.filter((field) => !touched.has(field)) };
  },
  precedence: ['manuallyScheduled', 'dependency'],
});
