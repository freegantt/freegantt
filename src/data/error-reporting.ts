// data/ — where an Error report is stamped and raised (S5.12, D-S5-40/41, ADR 0009). One file,
// because `at` comes from `time/`'s `now()` and `data/` is the lowest layer allowed to reach `time/`
// (I10 forbids reading a clock anywhere else). `view/` and `api/` import this directly; `render/` and
// `extensions/` may not reach `data/` at all, so they take a `RaiseError` by injection instead.

import type {
  BuiltInReportCode,
  EntryId,
  ErrorReport,
  ErrorReportInput,
  FieldUpdated,
  GestureDroppedReason,
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

/** The gesture half of `RefusalEvent` — a `beforeChange` refusal has no gesture, so nothing dropped
 *  it either, which is why `GestureDroppedReportInit.event` and `GESTURE_DROPPED_CODE`'s key both
 *  narrow to this instead of the wider `RefusalEvent` (#377 "Decision taken"). Exported for
 *  `view/gesture-pipeline.ts`, the one file outside this one that names a gesture's `before*` event. */
export type BeforeGestureEvent = Exclude<RefusalEvent, 'beforeChange'>;

/** The English word for what one `before*` event refuses, keyed by the event itself so
 *  `buildRefusalReport` needs no separate "kind" from its caller. */
const REFUSAL_NOUN: Record<RefusalEvent, string> = Object.freeze({
  beforeChange: 'change',
  beforeEntryMove: 'move',
  beforeEntryResize: 'resize',
});

/** This report's own code, one per `before*` veto (#377 "Decision taken") — code and event are 1:1 at
 *  every caller (`data/transaction.ts` always pairs `beforeChange` with `'mutation-cancelled'`;
 *  `view/gesture-pipeline.ts` always pairs a gesture's event with its own cancelled code), so
 *  `buildRefusalReport` mints the code from `event` instead of a caller passing one that could
 *  disagree with it. `BuiltInReportCode`, not the open `ReportCode`: a typo here would otherwise
 *  compile silently (#333). */
const CANCELLED_CODE: Record<RefusalEvent, BuiltInReportCode> = Object.freeze({
  beforeChange: 'mutation-cancelled',
  beforeEntryMove: 'entry-move-cancelled',
  beforeEntryResize: 'entry-resize-cancelled',
});

export interface RefusalReportInit {
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
 *  builds the sentence itself from `event` and the words `note` collected.
 *
 *  `code` is minted from `event` (`CANCELLED_CODE`), never taken from the caller (#377 "Decision
 *  taken"): a `RefusalReportInit` cannot lend the wrong code to the wrong veto if it carries none. */
export function buildRefusalReport(init: RefusalReportInit): ErrorReportInput {
  const { event, note, entryId, cause } = init;
  const reason = note.reason;
  const message = cause instanceof FreeGanttError ? cause.message : refusalSentence(event, reason);
  return {
    code: CANCELLED_CODE[event],
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
 *  `GestureDroppedReason` itself lives in `model/` and is public (#377) — see its own doc there for
 *  what each member means. `buildGestureDroppedReport` reads no `RefusalNote` for any of them: this
 *  is never a consumer's own veto, so there are no words to quote.
 *
 *  `'data-changed'` and `'entry-gone'` only happen to a gesture a handler still holds. `'entry-gone'`
 *  also happens on a plain mouseup that commits in its own tick, so its sentence below says what
 *  happened and never when (#341). */
export interface GestureDroppedReportInit {
  /** Which of the two gesture events dropped — mints this report's own code (#377): a dropped
   *  gesture is not a refusal, so it must never carry `refusal.code`, which
   *  `entry-move-cancelled`/`entry-resize-cancelled` already claim for an actual `before*` veto
   *  (branch review F2). */
  readonly event: BeforeGestureEvent;
  readonly entryId: EntryId;
  readonly droppedReason: GestureDroppedReason;
  /** The refusal core raised, for the one reason that has one to hand (`'inverted-span'`). It gives
   *  a consumer the offending entry id and both instants without parsing `message`. */
  readonly cause?: unknown;
}

/** One sentence per reason, quoting no handler — core is the one talking. */
const GESTURE_DROPPED_SENTENCE: Record<GestureDroppedReason, string> = Object.freeze({
  'data-changed': 'the rows it was measured from changed while the handler was still deciding',
  'entry-gone': 'the entry it would have written was removed before the write',
  superseded: 'a new gesture took its place before the handler decided',
  discarded: 'the wait ended before the handler decided',
  'inverted-span': 'an installed extender asked for an end before its start, which core never stores',
});

/** This report's own code, one per gesture kind (#377) — never a refusal's code, which names an
 *  actual `before*` veto (see `CANCELLED_CODE` above). `BuiltInReportCode`, not the open
 *  `ReportCode`: a typo here would otherwise compile silently (#333). */
const GESTURE_DROPPED_CODE: Record<BeforeGestureEvent, BuiltInReportCode> = Object.freeze({
  beforeEntryMove: 'entry-move-dropped',
  beforeEntryResize: 'entry-resize-dropped',
});

/** The one builder for a gesture core dropped on its own, not a `before*` handler's `false`
 *  (#272, #273 fix). `by: 'core'` is the field that tells a consumer this was not their handler's
 *  veto — `buildRefusalReport`'s reports are always `by: 'consumer'`, and this is the reason the two
 *  builders sit apart instead of one taking an extra flag. `severity: 'warning'` for the two
 *  reasons where real work was lost (`'data-changed'`, `'entry-gone'`); `'info'`
 *  for the two the user caused on purpose (`'superseded'`, `'discarded'`). `droppedReason` rides onto
 *  the report itself (#377), so a consumer reads it instead of matching `message`'s English sentence. */
export function buildGestureDroppedReport(init: GestureDroppedReportInit): ErrorReportInput {
  const { event, entryId, droppedReason } = init;
  const noun = REFUSAL_NOUN[event];
  const severity: ErrorReportInput['severity'] =
    droppedReason === 'superseded' || droppedReason === 'discarded' ? 'info' : 'warning';
  // `severity` says what it cost, `by` says who asked for it — two fields, two questions, and
  // conflating them is the misreport this union already warns about above. An extender cascading an
  // impossible span costs the gesture and nothing else, so it stays a `'warning'` like the rest; it
  // is the plugin's own proposal, so `by` names the plugin, the way `buildCommitFaultReport` does.
  const by: ErrorReportInput['by'] = droppedReason === 'inverted-span' ? 'plugin' : 'core';
  return {
    code: GESTURE_DROPPED_CODE[event],
    message: `Nothing was saved. This ${noun} was dropped: ${GESTURE_DROPPED_SENTENCE[droppedReason]}.`,
    severity,
    by,
    entryId,
    droppedReason,
    ...(init.cause !== undefined ? { cause: init.cause } : {}),
  };
}

export interface CommitFaultReportInit {
  readonly event: RefusalEvent;
  readonly entryId: EntryId;
  /** The thrown value itself — a plugin's own bug, never a refusal core raised on purpose. */
  readonly cause: unknown;
}

/** The one builder for a gesture whose commit **threw** (#341), and the sibling of
 *  `buildGestureDroppedReport`: that one is core saying no on purpose, this one is somebody's bug.
 *  `view/gesture-pipeline.ts` catches it, because `session.commit()` runs from a native `pointerup`
 *  listener that discards the Promise — so the throw reaches no consumer code, and this report is
 *  the only way the failure surfaces.
 *
 *  `by: 'plugin'`, the same answer `#reportExtenderFault` gives for the preview half of one fault:
 *  the extension hook composes (D-S5-23), so the code that threw may be several plugins deep, and
 *  ADR 0020 settled on this literal for an identical composed source. `severity: 'error'`, where
 *  the preview's fault is a `'warning'`: that one loses a ghost for one frame, and this one loses
 *  the edit the user just made. A disposer that throws already reports at `'error'` on exactly that
 *  rule (`extensions/plugin-runtime.ts`).
 *
 *  The sentence matches nothing about the store. A `change` listener that throws *after* the rows
 *  applied lands here too, and "Nothing was saved" would be a lie for that one — so this says the
 *  one thing true of every fault on this path: the bars show the stored data, whatever it now is. */
export function buildCommitFaultReport(init: CommitFaultReportInit): ErrorReportInput {
  const { event, entryId, cause } = init;
  return {
    code: 'gesture-commit-failed',
    message: `A ${REFUSAL_NOUN[event]} broke while it saved. The bars show the stored data again.`,
    severity: 'error',
    by: 'plugin',
    entryId,
    cause,
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
