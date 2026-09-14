// data/ — where an Error report is stamped and raised (S5.12, D-S5-40/41, ADR 0009). One file,
// because `at` comes from `time/`'s `now()` and `data/` is the lowest layer allowed to reach `time/`
// (I10 forbids reading a clock anywhere else). `view/` and `api/` import this directly; `render/` and
// `extensions/` may not reach `data/` at all, so they take a `RaiseError` by injection instead.

import type {
  EntryId,
  ReportCode,
  ErrorReport,
  ErrorReportInput,
  FieldUpdated,
  RaiseError,
} from '../model/index.js';
import { FreeGanttError } from '../model/index.js';
import { now } from '../time/index.js';
import type { RefusalNote } from './event-bus.js';

/** The two members raising needs of an event bus, and nothing else. `EventBus<DatasetEventMap>` and
 *  `EventBus<GanttEventMap, AsyncCancelableEvent>` both satisfy it, which is what lets one raiser
 *  serve the Dataset feed and the Gantt feed without this file naming either event map. */
export interface ErrorBus {
  emit(name: 'error', report: ErrorReport): unknown;
  hasHandler(name: 'error'): boolean;
}

/** Raises one report on `bus`. `fallback` runs only when nothing is subscribed (D-S5-41) — the
 *  site's own `console` line, unchanged, so an unsubscribed consumer sees what they always saw. */
export function raiseErrorOn(bus: ErrorBus, report: ErrorReportInput, fallback?: () => void): void {
  if (!bus.hasHandler('error')) {
    fallback?.();
    return;
  }
  bus.emit('error', { at: now(), ...report });
}

/** The `RaiseError` for one bus, for a collaborator that cannot reach the bus itself — `render/dom`'s
 *  backend options, `PluginRuntime`'s constructor, `PluginContext.raiseError`. */
export function createErrorRaiser(bus: ErrorBus): RaiseError {
  return (report, fallback) => {
    raiseErrorOn(bus, report, fallback);
  };
}

/** The `before*` events that raise one Refusal report on veto (D-S5-40) — `beforeChange` at
 *  `data/transaction.ts`, and the gesture pair at `view/gesture-pipeline.ts`. */
export type RefusalEvent = 'beforeChange' | 'beforeEntryMove' | 'beforeEntryResize';

/** The English word for what one `before*` event refuses, keyed by the event itself so
 *  `buildRefusalReport` needs no separate "kind" from its caller. */
const REFUSAL_NOUN: Record<RefusalEvent, string> = Object.freeze({
  beforeChange: 'change',
  beforeEntryMove: 'move',
  beforeEntryResize: 'resize',
});

export interface RefusalReportInit {
  readonly code: ReportCode;
  readonly event: RefusalEvent;
  /** What the first refusing handler said, if anything (#210) — `buildRefusalReport` reads
   *  `note.reason` once, at report time, the same way `#reportRefusal` used to. */
  readonly note: RefusalNote;
  readonly entryId?: EntryId;
  readonly cause?: unknown;
}

/** The one builder for a refused `before*` veto's `ErrorReportInput` (ADR 0009, D-S5-40). Every
 *  Refusal shares one rule — `severity: 'info'` (the library said no on purpose, D-S5-41), `by:
 *  'consumer'` (the bus knows a registered handler returned `false`, never which one), and a message
 *  that quotes the handler's own words verbatim when it called `refuse(reason)` (#210) and says
 *  plainly that it did not when it returned a bare `false`. Before this, that rule was restated by
 *  hand at every raise site, and two of the restatements had already drifted (#240 branch review).
 *
 *  A veto that already threw an error (`data/transaction.ts`'s `MutationCancelledError`) quotes that
 *  error's own `message` rather than rebuilding it: `model/errors.ts` owns that wording, `model/` is
 *  types only and cannot import this file, and the thrown error already says exactly what the report
 *  should. A silent gesture veto (`view/gesture-pipeline.ts`) has no error object to read, so this
 *  builds the sentence itself from `event` and the words `note` collected. */
export function buildRefusalReport(init: RefusalReportInit): ErrorReportInput {
  const { code, event, note, entryId, cause } = init;
  const reason = note.reason;
  const message = cause instanceof FreeGanttError ? cause.message : refusalSentence(event, reason);
  return {
    code,
    message,
    severity: 'info',
    by: 'consumer',
    ...(reason === undefined ? {} : { reason }),
    ...(entryId === undefined ? {} : { entryId }),
    ...(cause === undefined ? {} : { cause }),
  };
}

function refusalSentence(event: RefusalEvent, reason: string | undefined): string {
  const noun = REFUSAL_NOUN[event];
  const said = reason === undefined ? '.' : ` and said: "${reason}".`;
  return `Nothing was saved. A ${event} handler refused this ${noun}${said}`;
}

/** Why core dropped a held gesture itself, instead of a `before*` handler saying no (#272, #273).
 *  Never a consumer's own veto, so `buildGestureDroppedReport` reads no `RefusalNote` — there are no
 *  words to quote.
 *
 *  `'data-changed'` — the rows the draft was measured from were replaced while the handler was still
 *  deciding (Part 3). `'entry-gone'` — the entry the settle would write was removed (Part 2's
 *  `EntryNotFoundError` fold). `'superseded'` — a new gesture armed before the handler decided
 *  (Part 1). `'discarded'` — the user pressed Escape, or the Gantt was destroyed, before the handler
 *  decided (Part 1). */
export type GestureDroppedReason = 'data-changed' | 'superseded' | 'discarded' | 'entry-gone';

export interface GestureDroppedReportInit {
  readonly code: ReportCode;
  readonly event: RefusalEvent;
  readonly entryId: EntryId;
  readonly because: GestureDroppedReason;
}

/** One sentence per reason, quoting no handler — core is the one talking. */
const GESTURE_DROPPED_SENTENCE: Record<GestureDroppedReason, string> = Object.freeze({
  'data-changed': 'the rows it was measured from changed while the handler was still deciding',
  'entry-gone': 'the entry it would have written was removed while the handler was still deciding',
  superseded: 'a new gesture took its place before the handler decided',
  discarded: 'the wait ended before the handler decided',
});

/** The one builder for a gesture core dropped on its own, not a `before*` handler's `false`
 *  (#272, #273 fix). `by: 'core'` is the field that tells a consumer this was not their handler's
 *  veto — `buildRefusalReport`'s reports are always `by: 'consumer'`, and this is the reason the two
 *  builders sit apart instead of one taking an extra flag. `severity: 'warning'` for the two reasons
 *  where real work was lost (`'data-changed'`, `'entry-gone'`); `'info'` for the two the user caused
 *  on purpose (`'superseded'`, `'discarded'`). */
export function buildGestureDroppedReport(init: GestureDroppedReportInit): ErrorReportInput {
  const { code, event, entryId, because } = init;
  const noun = REFUSAL_NOUN[event];
  const severity: ErrorReportInput['severity'] =
    because === 'data-changed' || because === 'entry-gone' ? 'warning' : 'info';
  return {
    code,
    message: `Nothing was saved. This ${noun} was dropped: ${GESTURE_DROPPED_SENTENCE[because]}.`,
    severity,
    by: 'core',
    entryId,
  };
}

/** Up to three of `dropped`'s distinct Entry ids, quoted, plus a count of the rest — the one shared
 *  shape `buildDerivedValuesDroppedReport` and `buildCascadeDroppedReport` both name their Entries
 *  with, so a 500-row drop still reads as one line (ADR 0013, decision 5/6). */
function shownEntryIds(dropped: readonly FieldUpdated[]): string {
  const ids = [...new Set(dropped.map((row) => String(row.id)))];
  const shown = ids.slice(0, 3);
  const more = ids.length > shown.length ? `, and ${ids.length - shown.length} more` : '';
  return `${shown.map((id) => `"${id}"`).join(', ')}${more}`;
}

/** ADR 0013, decision 6: an operation that gives one or more Entries children they did not have
 *  before — `new Dataset({ entries })`, or a batch of `entries.add()` calls in one transaction — and
 *  finds one of those new parents' rolling-up Fields with nothing to roll up to (every child
 *  dateless, or no cost among them) drops the authored value and raises **one** report, naming the
 *  count, the distinct Field keys, and up to three of the affected Entry ids — never one report per
 *  value, which a 500-parent batch would otherwise turn into 500 lines. `dropped` is the Rollup's own
 *  output, already narrowed to the rows this drop produced (`from` defined, `to` `undefined`).
 *  Always raised at `severity: 'warning'` — no `isDevMode()` gate (D-S5-41). Reparenting an *existing*
 *  Entry onto a new parent stays silent (decision 6: "the library never refuses this") — this report
 *  is for a value that never reaches anyone, not for the Rollup's ordinary recompute. */
export function buildDerivedValuesDroppedReport(dropped: readonly FieldUpdated[]): ErrorReportInput {
  const keys = [...new Set(dropped.map((row) => String(row.field)))];
  return {
    code: 'derived-values-dropped',
    severity: 'warning',
    by: 'core',
    message:
      `${dropped.length} authored value${dropped.length === 1 ? '' : 's'} on ` +
      `${keys.map((key) => `"${key}"`).join(', ')} ${keys.length === 1 ? 'was' : 'were'} dropped: ` +
      `${shownEntryIds(dropped)} already had children by the end of this operation, so the Rollup owns ` +
      `${keys.length === 1 ? 'that value' : 'those values'} now.`,
  };
}

/** ADR 0013, decision 5: an extension-hook cascade proposed a rolling-up Field on a parent, and the
 *  Rollup overwrote it in silence — `rollup.ts`'s `body`/`merged` split means only the transaction
 *  body's own proposal makes the Rollup yield (D-S2-22); a cascade's proposal never does. One report
 *  per commit, never one per row, naming the count, the distinct Field keys, and up to three of the
 *  affected Entry ids. Always raised at `severity: 'warning'` — no `isDevMode()` gate (D-S5-41). */
export function buildCascadeDroppedReport(dropped: readonly FieldUpdated[]): ErrorReportInput {
  const keys = [...new Set(dropped.map((row) => String(row.field)))];
  return {
    code: 'derived-values-dropped',
    severity: 'warning',
    by: 'core',
    message:
      `A plugin cascade's write to ${keys.length === 1 ? 'field' : 'fields'} ` +
      `${keys.map((key) => `"${key}"`).join(', ')} on ${dropped.length === 1 ? 'entry' : 'entries'} ` +
      `${shownEntryIds(dropped)} was dropped: that cell rolls up from children, and the Rollup owns it.`,
  };
}
