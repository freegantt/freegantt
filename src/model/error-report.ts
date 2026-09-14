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

/** Every built-in code an Error report's `code` can carry, one closed union (T1-3, #247 S3-4). The
 *  built-in cell editor owns the last eight — its own `REFUSAL_TEXT`/`COMMIT_REFUSAL_TEXT` tables
 *  (`extensions/features/inline-editing.ts`) hold the words the user reads for each one.
 *  `error-code-drift.test.ts`, on the `extensions/` side of the boundary `model/` may not cross,
 *  checks every one of those table keys against this union through a `Record<BuiltInErrorCode,
 *  true>` literal — a code missing there fails to compile, and a code missing here fails that
 *  literal too, so the two tables cannot drift apart in either direction (I11). A `type`, not a
 *  runtime tuple: `model/` carries zero runtime beyond its id/brand helpers (`plans/01` §1). */
export type BuiltInErrorCode =
  // A refusal core observed.
  | 'mutation-cancelled'
  | 'entry-move-cancelled'
  | 'entry-resize-cancelled'
  // A fault core recovered from.
  | 'renderer-failed'
  | 'disposer-failed'
  // #332: an EditExtender threw while `view/gesture-pipeline.ts`'s `#extraFor` computed a drag
  // preview. Recovered the same way a bad renderer is (`renderer-failed`): that frame paints with
  // no cascade ghost, same as no extender installed, and the drag itself carries on.
  | 'extender-preview-failed'
  | 'plugin-reconfigure-dropped'
  | 'scale-options-ignored'
  | 'rollup-corrected'
  // ADR 0020: a hierarchy source answered with an id no Entry holds, or with a chain that loops
  // back on itself. Core refuses the answer, reads that Entry as a root and carries on. `by` names
  // whoever the **answer** came from (`F4`): `'consumer'` when it is the row's own authored
  // `parentId` — which a composing plugin hands straight back when it falls through — and
  // `'plugin'` for any other answer.
  | 'unknown-parent'
  | 'hierarchy-cycle'
  // Q10, ADR 0018: two rules from one source both claimed one Entry's variant. The newest paints,
  // the other is ignored, and this names both. Raised in every build, not behind `isDevMode()` —
  // that flag resolves when this repo builds `dist/`, so gating it would delete the line from every
  // consumer (D-S5-41). The cost is avoided by asking, not by building: with no report sink wired,
  // the rule walk stops at the first yes and never looks for a second.
  | 'variant-claimed-twice'
  // ADR 0018, `J59`: a variant's `when` names a Field key no Field declares, so the rule claims no
  // row. Reported once per rule and key, and never thrown — a typo must not take a layout pass
  // down, and a plugin whose key the Dataset never declared is the same case.
  | 'unknown-variant-field'
  // ADR 0013: a write to a rolling-up parent's rolling-up Field. `entries.update()` throws
  // `DerivedFieldNotWritableError`; `add()` and the Dataset constructor drop the value instead and
  // raise this code once per operation (decision 5) — never per value.
  | 'derived-values-dropped'
  // The built-in cell editor's own refusals — one spelling, shared by `data-reason` and this code
  // (D-S5-40). `by` is that plugin's id, not `'core'`.
  | 'derived-value'
  | 'no-parse-value'
  | 'no-date-value'
  | 'time-of-day'
  | 'unsaved-value'
  | 'segmented-entry'
  | 'unreadable-value'
  | 'refused-write';

/** The machine-readable half of an Error report — kebab-case, and open at the tail so a plugin can
 *  mint its own (which `ErrorReport.by`'s `PluginId` case requires). The shipped codes autocomplete;
 *  the `(string & {})` tail is the same shape a `FieldKey` already uses.
 *
 *  Two of these codes also name a thrown `FreeGanttError` — `'mutation-cancelled'` and
 *  `'unreadable-value'` — and each one matches that class's own `code`. This match is a convention
 *  the two files keep by hand. Nothing checks it (#259), because `model/errors.ts` writes its codes
 *  as literals in `super(…)` calls. Read the class before you assume a third code matches. */
export type ErrorCode = BuiltInErrorCode | (string & {});

/** The one call a `before*` handler makes to say **why** it refuses (#210).
 *
 *  ```ts
 *  gantt.on('beforeEntryMove', (move) =>
 *    move.start < mobilization ? move.refuse('The drop is before mobilization.') : undefined,
 *  );
 *  ```
 *
 *  `refuse` returns `false`, so a handler states its reason and vetoes in one line, and `false` keeps
 *  meaning exactly what it meant before — the words ride beside the boolean rather than replacing it.
 *  A handler that returns a bare `false` still refuses, with no reason, exactly as it always did.
 *
 *  Core puts this on the `before*` payload of the three vetoes it reports (`beforeChange`,
 *  `beforeEntryMove`, `beforeEntryResize`) and reads the words back onto `ErrorReport.reason` and the
 *  report's `message`. The other `before*` events raise no report, so they take no reason: an event
 *  that cannot carry the words anywhere must not ask for them.
 *
 *  A reason is prose a consumer wrote for their own user. Core quotes it into `message` verbatim and
 *  never rewords it. */
export interface Refusable {
  /** A property, not a method: core binds it, so `({ refuse }) => refuse('…')` destructures safely. */
  readonly refuse: (reason: string) => false;
}

/** Who refused, or who broke. `'core'` is the library itself; `'consumer'` is the consumer's own
 *  code — a handler they registered on `beforeChange`/`before*`, or data they authored, as
 *  `'unknown-parent'` reports; a `PluginId` is the plugin that raised it.
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
  /** Why the refusal happened, in the words of whoever refused — a `before*` handler's own sentence,
   *  verbatim (#210). Present only when a handler called `refuse(reason)`; a bare `false` leaves it
   *  `undefined`. `message` quotes it too, so a console fallback prints it; this member is here so a
   *  consumer can show their own words without core's framing around them. */
  readonly reason?: string;
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
