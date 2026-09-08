// data/ — where an Error report is stamped and raised (S5.12, D-S5-40/41, ADR 0009). One file,
// because `at` comes from `time/`'s `now()` and `data/` is the lowest layer allowed to reach `time/`
// (I10 forbids reading a clock anywhere else). `view/` and `api/` import this directly; `render/` and
// `extensions/` may not reach `data/` at all, so they take a `RaiseError` by injection instead.

import type { EntryId, ErrorCode, ErrorReport, ErrorReportInput, RaiseError } from '../model/index.js';
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
  readonly code: ErrorCode;
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
