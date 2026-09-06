// model/ — the Error report: what the `error` event carries on the Dataset and on the Gantt alike
// (S5.12, D-S5-40/41/42, ADR 0009). Types only; the runtime carve-out next door in `errors.ts` does
// not widen here.
//
// A separate file from `errors.ts` on purpose, and the split says the thing CONTEXT.md stresses:
// `FreeGanttError` is the class a consumer **catches**, an `ErrorReport` is the record a consumer
// **subscribes to**, and they are two different things with near-identical names. The mechanical
// reason is the same distinction seen from the import graph: `errors.ts` names `ChangeSet`, and
// `change-set.ts` names `ErrorReport` for `DatasetEventMap`, so one file for both would close a
// cycle (`no-circular`).
//
// Core raises reports and retains none: the cap, the overflow rule and the dedupe are the consumer's
// policy, so there is no `gantt.errors` array. `api/watch-all-errors.ts` is the one subscription
// helper core does ship.

import type { EntryId } from './ids.js';
import type { FieldKey } from './field.js';
import type { Instant } from './time.js';
import type { PluginId } from './plugin.js';

/** How bad an Error report is (D-S5-41).
 *
 *  `'info'` — a Refusal: the library said no on purpose and nothing is broken.
 *  `'warning'` — degraded but recovered, such as a renderer that threw and fell back.
 *  `'error'` — something broke and nothing caught it.
 *
 *  Three levels rather than a `'refusal' | 'fault'` pair: those are two different things and not two
 *  levels, and a field named `severity` whose values are not severities would cover two concepts
 *  with one word. Telemetry routes on `severity !== 'info'`; a toast styles on all three. */
export type ErrorSeverity = 'error' | 'warning' | 'info';

/** The machine-readable half of an Error report — kebab-case, and open at the tail so a plugin can
 *  mint its own (which `ErrorReport.by`'s `PluginId` case requires). The shipped codes autocomplete;
 *  the `(string & {})` tail is the same shape `EntryKind` already uses.
 *
 *  A code that names a thrown `FreeGanttError` matches that class's own `code`, so a consumer that
 *  already switches on `error.code` reads the report the same way. */
export type ErrorCode =
  // A refusal core observed.
  | 'mutation-cancelled'
  | 'entry-move-cancelled'
  | 'entry-resize-cancelled'
  // A fault core recovered from.
  | 'renderer-failed'
  | 'disposer-failed'
  | 'plugin-reconfigure-dropped'
  | 'scale-options-ignored'
  | 'rollup-corrected'
  // The built-in cell editor's own refusals — one spelling, shared by `data-reason` and this code
  // (D-S5-40). `by` is that plugin's id, not `'core'`.
  | 'derived-value'
  | 'no-parse-value'
  | 'no-date-value'
  | 'time-of-day'
  | 'unsaved-value'
  | (string & {});

/** Who refused, or who broke. `'core'` is the library itself; `'consumer'` is a handler someone
 *  registered on `beforeChange`/`before*`; a `PluginId` is the plugin that raised it.
 *
 *  Named `by` because `origin` is taken (`ChangeOrigin`) and a bare `source` is barred (Field source,
 *  Row source). `PluginId` is a plain `string`, so it is intersected with `{}` here to keep the two
 *  literals in a reader's autocomplete — the same trick `ErrorCode` uses. */
export type ErrorReporter = 'core' | 'consumer' | (PluginId & {});

/** What the `error` event carries, on the Dataset and on the Gantt alike (D-S5-40).
 *
 *  Flat fields plus `cause`, not a wrapped error: every report renders and serializes with no type
 *  test, and nothing is lost — `cause` carries `MutationCancelledError.changeSet`,
 *  `PluginSetupError.pluginId`, and the chain. Not every raise site has an error object (a silent
 *  gesture veto has none), which is why `code`/`message` are the required pair. */
export interface ErrorReport {
  /** When core observed it — `time/`'s `now()`, stamped by the raiser so no other layer reads a
   *  clock (I10). */
  readonly at: Instant;
  readonly code: ErrorCode;
  /** One sentence, for a person. The console fallback prints exactly this. */
  readonly message: string;
  readonly severity: ErrorSeverity;
  readonly by: ErrorReporter;
  /** The entry the report is about, when it is about one. */
  readonly entryId?: EntryId;
  /** The Field key the report is about, when it is about one. */
  readonly field?: FieldKey;
  /** The `FreeGanttError` or thrown value behind it, when one exists. */
  readonly cause?: unknown;
}

/** An Error report before core stamps `at` — what a raise site writes, the same input/stored pairing
 *  `EntryInput` and `GridColumnInput` already name. */
export type ErrorReportInput = Omit<ErrorReport, 'at'>;

/** Raises one Error report on the emitter that observed it.
 *
 *  Core hands this to every layer that cannot reach an event bus of its own — `render/dom`'s backend
 *  options, `PluginRuntime`'s constructor, `PluginContext.raiseError` — so a raise site names no bus
 *  and reads no clock.
 *
 *  `fallback` runs **only when nothing is subscribed to `error`**, the way an `EventEmitter`'s
 *  unhandled `'error'` is treated as unhandled (D-S5-41). It is where a site keeps the `console` line
 *  it printed before this seam existed: a consumer who subscribes gets silence and full control, and
 *  a consumer who does not keeps exactly the output they have today. A refusal that was always silent
 *  passes none. */
export type RaiseError = (report: ErrorReportInput, fallback?: () => void) => void;

/** What a plugin raises through `PluginContext.raiseError` (S5.12, D-S5-40). Core fills `by` with
 *  that plugin's own id, so `by` is a fact the runtime knows and never a claim a plugin makes about
 *  itself — the same "core fills what core knows" split `plans/02` already draws. No `fallback`
 *  either: the fallback exists to preserve a `console` line core printed before this seam, and a
 *  plugin has none to preserve. */
export type PluginErrorReport = Omit<ErrorReportInput, 'by'>;
