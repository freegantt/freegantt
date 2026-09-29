// harness/plugins/ — written as if by a third party: everything below comes from 'freegantt', the
// package's own public entry, never a path inside 'freegantt/src'. Dogfoods a plugin's own lock rule
// and place rule — the same two seams the core lock is built on — so this harness keeps proving both
// are enough for a real job, not just for core's own use.

import { diffMs, now } from 'freegantt';
import type { DataPlugin, EntryId } from 'freegantt';

/** What the page holds after installing: the plugin itself, plus the toggle a checkbox flips. */
export interface FreezePastWorkPlugin extends DataPlugin {
  isFrozen(): boolean;
  freeze(): void;
  unfreeze(): void;
}

/**
 * Freezes every Entry whose work is already past: it closes that Entry's own `start`/`end` to a
 * user drag, and it refuses a drop that carries an Entry into a parent whose own work is past too.
 *
 * ```ts
 * const pastWork = freezePastWork();
 * const dataset = new Dataset({ entries, plugins: [pastWork] });
 * pastWork.unfreeze();
 * ```
 *
 * "Past" reads live off the clock, not off a stored flag — an Entry that ends today is still open
 * this morning and frozen by tonight, with no write of its own. That is what makes the freeze a view
 * policy the toggle owns, not a Field the dataset stores: turning it off is not an edit, so it raises
 * no `change` and leaves no undo step, only a fresh resolution the toggle announces itself.
 *
 * Two seams, two jobs:
 * - the **lock rule** narrows `start`/`end` to `'api'` for an Entry whose own `end` already sits
 *   before today, while frozen — the field a time drag or a resize writes, closed the same way the
 *   core lock narrows a locked Entry's cells (never widening a refusal another rule already made).
 * - the **place rule** narrows a cross-parent drop to `'api'` when the landing parent's own `end` —
 *   its rolled-up envelope over every child (`Entry.end`, ADR 0013) — sits before today: all of that
 *   parent's work is behind it, so nothing new lands there while frozen. A same-parent reorder is not
 *   a drop "into" a parent, so it passes through untouched.
 */
export function freezePastWork(): FreezePastWorkPlugin {
  let frozen = false;
  let announceRulesChanged: (() => void) | undefined;
  let endsBeforeToday: (id: EntryId | string) => boolean = () => false;

  return {
    id: 'demo.freezePastWork',

    data(ctx) {
      // Read on every ask, not cached: the clock is the outside state this whole plugin freezes
      // against, so "today" has to be this instant's today, never the instant `data()` ran.
      endsBeforeToday = (id) => {
        const end = ctx.dataset.entries.get(id)?.end;
        return end !== undefined && diffMs(end, ctx.dataset.time.startOfDay(now())) <= 0;
      };
      announceRulesChanged = () => ctx.edits.rulesChanged();

      ctx.edits.setLockRule((next) => (query, field) => {
        const answer = next(query, field);
        if ((field !== 'start' && field !== 'end') || !frozen || !endsBeforeToday(query.id)) return answer;
        return answer === 'anywhere' ? 'api' : answer;
      });

      ctx.edits.setPlaceRule((next) => (place) => {
        const answer = next(place);
        if (
          !frozen ||
          place.parentId === undefined ||
          place.parentId === place.currentParentId ||
          !endsBeforeToday(place.parentId)
        ) {
          return answer;
        }
        return answer === 'anywhere' ? 'api' : answer;
      });
    },

    isFrozen() {
      return frozen;
    },

    /** Flips the toggle and wakes every bound Gantt's affordances — the clock already read "past"
     *  before this call, only the freeze itself is new, so nothing here writes the dataset. */
    freeze() {
      frozen = true;
      announceRulesChanged?.();
    },

    unfreeze() {
      frozen = false;
      announceRulesChanged?.();
    },
  };
}
