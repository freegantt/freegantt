// model/ — the Error report: what the `error` event carries on the Dataset and on the Gantt alike
// (S5.12, ADR 0009). Types only; the runtime carve-out next door in `errors.ts` does
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

/** How bad an Error report is.
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
 *  checks every one of those table keys against this union through a `Record<BuiltInReportCode,
 *  true>` literal — a code missing there fails to compile, and a code missing here fails that
 *  literal too, so the two tables cannot drift apart in either direction (I11). A `type`, not a
 *  runtime tuple: `model/` carries zero runtime beyond its id/brand helpers (`plans/01` §1). */
export type BuiltInReportCode =
  // A refusal core observed: a `before*` handler said no.
  | 'mutation-cancelled'
  | 'entry-move-cancelled'
  | 'entry-resize-cancelled'
  // A gesture core dropped on its own, never a handler's veto (#272, #273, #377) — the reason rides
  // on `ErrorReport.droppedReason` (`GestureDroppedReason`). Its own group, not the refusal group above:
  // `by: 'core'` here, always `by: 'consumer'` above, and conflating the two misreports which one
  // happened (branch review).
  | 'entry-move-dropped'
  | 'entry-resize-dropped'
  // A fault core recovered from.
  | 'renderer-failed'
  | 'disposer-failed'
  // #332: an EditExtender threw while `view/gesture-pipeline.ts`'s `#extraFor` computed a drag
  // preview. Recovered the same way a bad renderer is (`renderer-failed`): that frame paints with
  // no cascade ghost, same as no extender installed, and the drag itself carries on.
  | 'extender-preview-failed'
  // #425: the Rollup half of `extender-preview-failed` — a plugin's own aggregator (`rollUp: fn`)
  // threw while `view/gesture-pipeline.ts`'s `#rolledUpFor` computed a `place` drop's Rollup ghost.
  // Recovered the same way: that frame paints with no Rollup ghost, and the drag carries on.
  | 'rollup-preview-failed'
  // #341: the commit half of `extender-preview-failed`. Something threw while a gesture's commit
  // ran — an EditExtender's own bug, a `beforeChange` handler that threw instead of refusing, a
  // `change` listener. `view/gesture-pipeline.ts`'s `#settle` catches it, because a throw from
  // there escapes into a native `pointerup` listener and no caller can reach it. `severity:
  // 'error'`, not `'warning'`: the gesture is caught, but the edit the user made is gone.
  | 'gesture-commit-failed'
  | 'scale-options-ignored'
  | 'rollup-corrected'
  // ADR 0020: a hierarchy source answered with an id no Entry holds, or with a chain that loops
  // back on itself. Core refuses the answer, reads that Entry as a root and carries on. `by` names
  // whoever the **answer** came from: `'consumer'` when it is the row's own authored
  // `parentId` — which a composing plugin hands straight back when it falls through — and
  // `'plugin'` for any other answer. Raised after the commit's own `change` fans out, so a handler
  // that writes here starts a commit of its own — and a handler that writes on every report loops,
  // because each new commit still holds the refusal that raised it.
  | 'unknown-parent'
  | 'hierarchy-cycle'
  // ADR 0018: two rules from one source both matched one Entry's variant. The newest paints,
  // the other is ignored, and this names both. Raised in every build, not behind `isDevMode()` —
  // that flag resolves when this repo builds `dist/`, so gating it would delete the line from every
  // consumer. The cost is avoided by asking, not by building: with no report sink wired,
  // the rule walk stops at the first yes and never looks for a second.
  | 'variant-matched-twice'
  // #448: `barRenderer` is the catch-all a resolved variant with no `paint` falls through to. When
  // every Entry in the Dataset resolves to a variant that paints, `barRenderer` never runs and
  // nothing says why. Checked once per assignment, against the whole Dataset, not per frame — a
  // frame that shows only variant-painted rows while others sit off-window is not the same thing.
  | 'bar-renderer-shadowed'
  // ADR 0018: a variant's `when` names a Field key no Field declares, so the rule matches no
  // row. Reported once per rule and key, and never thrown — a typo must not take a layout pass
  // down, and a plugin whose key the Dataset never declared is the same case.
  | 'unknown-variant-field'
  // ADR 0026, rulings appendix: a row source's `childrenAsSegments` names a Field
  // key no Field declares, so the rule matches no row. `unknown-variant-field`'s own rule always
  // names a variant; `childrenAsSegments` is not one, so it gets its own code. Reported once per
  // rule and key, and never thrown, for the same reason `unknown-variant-field` is not thrown.
  | 'unknown-row-source-field'
  // #421: `barLabels.field` (on the Gantt, or on an `EntryVariant`) names a Field key no Field
  // declares. Both are live and reassignable, and the lookup runs inside `render()`'s own rAF
  // callback, where a throw reaches no consumer. The bar prints no label; reported once per field
  // key, never thrown, and never per bar per frame.
  | 'unknown-bar-label-field'
  // ADR 0013: a write to a rolling-up parent's rolling-up Field. `entries.update()` throws
  // `DerivedFieldNotWritableError`; `add()` and the Dataset constructor drop the value instead and
  // raise this code once per operation (decision 5) — never per value. Raised after the commit's own
  // `change` fans out, so a handler that writes here starts a commit of its own. (Construction still
  // raises it inside `new Dataset()`, before any handler exists.)
  | 'derived-values-dropped'
  // #528: construction and `load` set `siblingIndex` from list position, and an authored value that
  // differs from it is dropped rather than stored. Raised once per operation, naming every dropped
  // value, never once per value — the same aggregation `derived-values-dropped` uses, and a
  // different code because this Field's value is dropped for a different reason: list position wins,
  // not a rolling-up parent that owns the cell. `load` raises it after the commit's own `change`
  // fans out.
  | 'sibling-index-dropped'
  // The built-in cell editor's own refusals — one spelling, shared by `data-reason` and this code.
  // `by` is that plugin's id, not `'core'`.
  | 'derived-value'
  | 'no-parse-value'
  | 'no-date-value'
  | 'unsaved-value'
  | 'unreadable-value'
  | 'refused-write';

/** The machine-readable half of an Error report — kebab-case, and open at the tail so a plugin can
 *  mint its own (which `ErrorReport.by`'s `PluginId` case requires). The shipped codes autocomplete;
 *  the `(string & {})` tail is the same shape a `FieldKey` already uses.
 *
 *  A report code and a thrown code are two vocabularies, not one. This names what a fault *reports*;
 *  `errors.ts`'s `ThrownCode` names what an exception *carries*. Two codes sit in both —
 *  `'mutation-cancelled'` and `'unreadable-value'` — because those faults do both. `errors.test.ts`
 *  holds that overlap to exactly two, so a third one added on either side fails to compile until it
 *  is named there on purpose (#333; unchecked convention before). */
export type ReportCode = BuiltInReportCode | (string & {});

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
 *  literals in a reader's autocomplete — the same trick `ReportCode` uses. */
export type ErrorReporter = 'core' | 'consumer' | (PluginId & {});

/** Why core dropped a held gesture itself, instead of a `before*` handler saying no (#272, #273,
 *  #377). Never a consumer's own veto, so a dropped report carries no `reason` — there are no words
 *  to quote, only one of these.
 *
 *  `'data-changed'` — the rows the draft was measured from were replaced while a handler was still
 *  deciding. `'entry-gone'` — the entry the settle would write was removed. `'superseded'` — a new
 *  gesture armed before the handler decided. `'discarded'` — the user pressed Escape, or the Gantt
 *  was destroyed, before the handler decided.
 *
 *  `severity` alone already tells "the user did this on purpose" (`'superseded'`, `'discarded'`,
 *  `severity: 'info'`) from "real work was lost" (the other two, `severity: 'warning'`) — see
 *  `buildGestureDroppedReport`. What `severity` cannot do is tell `'data-changed'` apart from
 *  `'entry-gone'`: two different failures a consumer may want to handle two different ways.
 *  `droppedReason` carries that, without matching on `message`'s English sentence
 *  (`ErrorReport.droppedReason`, branch review).
 *
 *  `'inverted-span'` — an installed `EditExtender` cascaded an end that falls before its start.
 *  Core refuses to store that and drops the gesture. The entry keeps its stored dates, so nothing
 *  is lost but the gesture (#143, 2026-09-06: an inverted span is refused, never stored). This one
 *  reports `by: <the plugin>` and carries the `InvertedSpanError` as `cause`; every other reason
 *  reports `by: 'core'`.
 *
 *  A user gesture never raises it. `layout/gesture-draft.ts`'s `resizeEdit` clamps the dragged edge
 *  at zero length, and `nudge()` runs the same draft, so neither a drag nor a key can invert a span.
 *
 *  ADR 0026 retired `'write-refused'`, which this used to carry, on the premise that the store only
 *  ever refused an envelope-only cascade against a several-Segment Entry. Branch review
 *  disproved it by running the case: `isEnvelopeRefusal` named two errors, and only
 *  `SegmentsOutOfSyncError` died with the Segment. `InvertedSpanError` never was Segment-specific.
 *  `'inverted-span'` replaces the retired name rather than restoring it, because the envelope the
 *  old name described is gone and the condition it now reports is the one this name states. */
export type GestureDroppedReason =
  'data-changed' | 'superseded' | 'discarded' | 'entry-gone' | 'inverted-span';

/** What the `error` event carries, on the Dataset and on the Gantt alike.
 *
 *  Flat fields plus `cause`, not a wrapped error: every report renders and serializes with no type
 *  test, and nothing is lost — `cause` carries `MutationCancelledError.changeSet`,
 *  `PluginSetupError.pluginId`, and the chain. Not every raise site has an error object (a silent
 *  gesture veto has none), which is why `code`/`message` are the required pair. */
export interface ErrorReport {
  /** When core observed it — `time/`'s `now()`, stamped by the raiser so no other layer reads a
   *  clock (I10). */
  readonly at: Instant;
  readonly code: ReportCode;
  /** One sentence, for a person. The console fallback prints exactly this. */
  readonly message: string;
  readonly severity: ErrorSeverity;
  readonly by: ErrorReporter;
  /** Why the refusal happened, in the words of whoever refused — a `before*` handler's own sentence,
   *  verbatim (#210). Present only when a handler called `refuse(reason)`; a bare `false` leaves it
   *  `undefined`. `message` quotes it too, so a console fallback prints it; this member is here so a
   *  consumer can show their own words without core's framing around them. */
  readonly reason?: string;
  /** Why core dropped a gesture on its own — present only on `'entry-move-dropped'` and
   *  `'entry-resize-dropped'` (#377). One of four closed reasons, never prose: a consumer reads this
   *  instead of matching `message`'s English sentence.
   *
   *  ```ts
   *  gantt.on('error', (report) => {
   *    if (report.droppedReason === 'entry-gone') return; // the entry is gone, nothing to retry
   *    else if (report.droppedReason === 'data-changed') refreshDraftAndRetry();
   *  });
   *  ```
   *  `severity` alone already sorts `'superseded'`/`'discarded'` (`'info'`, the user's own doing) from
   *  the other two (`'warning'`, real work lost) — see `GestureDroppedReason`'s own doc. What
   *  `severity` cannot do is tell `'data-changed'` from `'entry-gone'`, and that is the distinction
   *  this field exists for. */
  readonly droppedReason?: GestureDroppedReason;
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
 *  unhandled `'error'` is treated as unhandled. It is where a site keeps the `console` line
 *  it printed before this seam existed: a consumer who subscribes gets silence and full control, and
 *  a consumer who does not keeps exactly the output they have today. A refusal that was always silent
 *  passes none. */
export type RaiseError = (report: ErrorReportInput, fallback?: () => void) => void;

/** What a plugin raises through `PluginContext.raiseError` (S5.12). Core fills `by` with
 *  that plugin's own id, so `by` is a fact the runtime knows and never a claim a plugin makes about
 *  itself — the same "core fills what core knows" split `plans/02` already draws. No `fallback`
 *  either: the fallback exists to preserve a `console` line core printed before this seam, and a
 *  plugin has none to preserve. */
export type PluginErrorReport = Omit<ErrorReportInput, 'by'>;
