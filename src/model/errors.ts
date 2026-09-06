// model/'s runtime carve-out widens here: id/brand helpers and this base class, zero dependencies
// (plans/01 §1.1, D-S1.7-8). A public error type is part of the API surface (only api/ and model/
// types are public), so it lives where the rest of the public surface lives.
//
// Every message follows one rule (#237). Say what happened in one plain sentence. Then say what to
// do in one plain sentence. Name the call the consumer made, and quote the value they wrote. List
// the legal values when the set is small and fixed. Two rules come with it. Every error exposes the
// values it names as readonly members, so a consumer can word their own message for their own users
// instead of parsing ours. And no message carries a decision id, a plan section or an issue number —
// those belong in the doc comment above the class, where they already are.
//
// `operation` is how the caller's own name reaches the message. An error class never asserts one:
// `reconcileEnvelope` alone is reached by `entries.update()` and by an `EditExtender` cascade
// (D-S5-44), so a baked-in prefix tells one of those two callers about a call it never made (#239).

import type { EntryId, SegmentId } from './ids.js';
import type { ChangeSet } from './change-set.js';
import type { PluginId } from './plugin.js';
import type { TimeSpan, TimeUnit } from './time.js';

export class FreeGanttError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'FreeGanttError';
    this.code = code;
  }
}

/** `code: 'unsupported-unit'` — a preset or a caller stepped by a unit `time/` has no stepper for. */
export class UnsupportedUnitError extends FreeGanttError {
  readonly unit: string;

  constructor(unit: string, operation: string) {
    super(
      'unsupported-unit',
      `${operation}: there is no time unit called "${unit}". Use one of: millisecond, minute, hour, day, week, month, year.`,
    );
    this.name = 'UnsupportedUnitError';
    this.unit = unit;
  }
}

/** `code: 'invalid-snap-increment'` — a snap `{ unit, increment }` whose `increment` is not a
 *  positive integer. `time/`'s stepping loops (`snapInstant`, `stepsBetween`) walk forward or
 *  backward one `increment` at a time until they pass the target; a `0` never advances and a negative
 *  value walks away from it, so either one loops forever (#201). Thrown by `Gantt.snap`'s setter, so
 *  the mistake names the assignment rather than the drag two gestures later, and again inside
 *  `time/` itself, because a custom `ViewPreset`'s own tick reaches the same loop without passing
 *  through that setter. */
export class InvalidSnapIncrementError extends FreeGanttError {
  readonly unit: TimeUnit;
  readonly increment: number;

  constructor(unit: TimeUnit, increment: number) {
    super(
      'invalid-snap-increment',
      `snap: the increment for the unit "${unit}" is ${increment}. Use a whole number of 1 or more.`,
    );
    this.name = 'InvalidSnapIncrementError';
    this.unit = unit;
    this.increment = increment;
  }
}

/** `code: 'container-not-found'` — a `container` selector string that matches no element (#38). */
export class ContainerNotFoundError extends FreeGanttError {
  readonly container: string;

  constructor(container: string) {
    super(
      'container-not-found',
      `Gantt: no element matches the container selector "${container}". Check the selector, or pass the element itself.`,
    );
    this.name = 'ContainerNotFoundError';
    this.container = container;
  }
}

/** `code: 'invalid-instant'` — a consumer wrote a value on an `InstantInput` field that names no instant
 * (an unparseable string, or a calendar date that does not exist such as `'2026-02-31'`). `value` is
 * the thing they wrote, so a bulk loader can name the row it came from. */
export class InvalidInstantError extends FreeGanttError {
  readonly value: unknown;

  constructor(message: string, value?: unknown) {
    super('invalid-instant', message);
    this.name = 'InvalidInstantError';
    this.value = value;
  }
}

/** `code: 'unknown-preset'` — a `PresetRef` string outside the shipped set, from `resolvePreset`
 * (S1.9, D-S1.9-3). The shipped set is small and fixed, so the message lists it. */
export class UnknownPresetError extends FreeGanttError {
  readonly presetId: string;
  readonly available: readonly string[];

  constructor(presetId: string, available: readonly string[]) {
    super(
      'unknown-preset',
      `gantt.preset: there is no preset called "${presetId}". The shipped presets are: ${available.join(', ')}.`,
    );
    this.name = 'UnknownPresetError';
    this.presetId = presetId;
    this.available = available;
  }
}

/** `code: 'invalid-preset'` — a `ViewPreset` whose `preferredTickWidthPx` is below its own
 * `minTickWidthPx`, from `resolvePreset` (header readability follow-up). The floor would then be
 * unreachable at the preset's own intended zoom, which is never a preset author's intent. */
export class InvalidPresetError extends FreeGanttError {
  readonly presetId: string;
  readonly minTickWidthPx: number;
  readonly preferredTickWidthPx: number;

  constructor(presetId: string, minTickWidthPx: number, preferredTickWidthPx: number) {
    super(
      'invalid-preset',
      `gantt.preset: the preset "${presetId}" sets minTickWidthPx to ${minTickWidthPx} and preferredTickWidthPx to ${preferredTickWidthPx}. ` +
        `Lower minTickWidthPx to ${preferredTickWidthPx} or less, so the preset can reach its own preferred zoom.`,
    );
    this.name = 'InvalidPresetError';
    this.presetId = presetId;
    this.minTickWidthPx = minTickWidthPx;
    this.preferredTickWidthPx = preferredTickWidthPx;
  }
}

/** `code: 'entry-not-found'` — an id the Dataset has no entry for, from `reveal(entryId)` (S1.9,
 * D-S1.9-6), `entries.fieldValue`, or a mutator (`entries.update`/`remove`, or a `parentId` naming a
 * missing entry — S2.3 §1.3). `operation` names the call that failed, so the message points at what
 * the caller asked for rather than a generic "not found". */
export class EntryNotFoundError extends FreeGanttError {
  readonly entryId: EntryId;
  readonly operation: string;

  constructor(entryId: EntryId, operation: string) {
    super(
      'entry-not-found',
      `${operation}: there is no entry with id "${entryId}". Check the id, or add the entry first.`,
    );
    this.name = 'EntryNotFoundError';
    this.entryId = entryId;
    this.operation = operation;
  }
}

/** `code: 'segment-not-found'` — an id `entries.removeSegments()` is given that names no Segment on
 *  any Entry. This matches `EntryNotFoundError`'s posture for `entries.remove`: the call throws
 *  before it stages anything, and the transaction discards whatever it staged for other ids. */
export class SegmentNotFoundError extends FreeGanttError {
  readonly segmentId: SegmentId;
  readonly operation: string;

  constructor(segmentId: SegmentId, operation: string) {
    super(
      'segment-not-found',
      `${operation}: there is no segment with id "${segmentId}". Check the id — nothing was removed.`,
    );
    this.name = 'SegmentNotFoundError';
    this.segmentId = segmentId;
    this.operation = operation;
  }
}

/** `code: 'reveal-target-not-found'` — `reveal(id)` given an id the dataset reads as neither an
 *  Entry nor a Segment (#212, ADR 0010, issue #227). `reveal` alone takes `EntryId | SegmentId`; once
 *  neither reading resolves, nothing tells which one the caller meant, so the message names both
 *  rather than picking `EntryNotFoundError` or `SegmentNotFoundError` and forging the id's brand to
 *  match. */
export class RevealTargetNotFoundError extends FreeGanttError {
  readonly targetId: string;
  readonly operation: string;

  constructor(targetId: string, operation: string) {
    super(
      'reveal-target-not-found',
      `${operation}: "${targetId}" names neither an entry nor a segment. Check the id — it must be one of the two.`,
    );
    this.name = 'RevealTargetNotFoundError';
    this.targetId = targetId;
    this.operation = operation;
  }
}

/** `code: 'duplicate-entry-id'` — `entries.add()` given an id already in the store (S2.3 §1.3). */
export class DuplicateEntryIdError extends FreeGanttError {
  readonly entryId: EntryId;

  constructor(entryId: EntryId) {
    super(
      'duplicate-entry-id',
      `entries.add: an entry with id "${entryId}" already exists. Give the new entry a different id, or call entries.update to change the one that is there.`,
    );
    this.name = 'DuplicateEntryIdError';
    this.entryId = entryId;
  }
}

/** `code: 'duplicate-segment-id'` — two Segments in the store share one `SegmentId`: authored twice
 *  in the same `segments` array, authored on two different Entries, or authored on construction
 *  (#212, ADR 0010). A `SegmentId` is the Selection's identity, so a duplicate is rejected the same
 *  way a duplicate `EntryId` is — before anything stages. `operation` names which of the three
 *  throwing calls it was (`entries.add`, `entries.update`, or `construction`), the same way
 *  `EntryNotFoundError`/`SegmentNotFoundError` name theirs. */
export class DuplicateSegmentIdError extends FreeGanttError {
  readonly segmentId: SegmentId;
  readonly operation: string;

  constructor(segmentId: SegmentId, operation: string) {
    super(
      'duplicate-segment-id',
      `${operation}: a segment with id "${segmentId}" already exists. Give this segment a different id, or leave its id out to move the one that is there.`,
    );
    this.name = 'DuplicateSegmentIdError';
    this.segmentId = segmentId;
    this.operation = operation;
  }
}

/** `code: 'parent-cycle'` — a `parentId` edit that would make an entry its own ancestor, self-parenting
 * included (S2.3 §1.3). */
export class ParentCycleError extends FreeGanttError {
  readonly entryId: EntryId;

  constructor(entryId: EntryId) {
    super(
      'parent-cycle',
      `entries: this parentId would make "${entryId}" its own ancestor. Pick a parent from outside the subtree of "${entryId}".`,
    );
    this.name = 'ParentCycleError';
    this.entryId = entryId;
  }
}

/** `code: 'segments-out-of-sync'` — a `start`/`end` write and the entry's Segments disagree, either
 *  way (D-S4-30, narrowed by #212; widened by the #212 fix-plan review, finding S3):
 *  - `'ambiguous'`: the write names `start`/`end` and no Segments, on an entry that draws several.
 *    The envelope spans the Segments, so moving it alone says nothing about which stretch moved.
 *  - `'conflicting'`: the write names both `start`/`end` and `segments`, and the segments' own
 *    envelope is not the `start`/`end` named alongside them — one edit cannot mean both.
 *  An entry that draws one Segment never sees either: that Segment *is* the envelope, so the write
 *  updates it in the same transaction and the two halves can only agree.
 *
 *  `operation` comes from the caller, because `reconcileEnvelope` serves two of them (D-S5-44). */
export class SegmentsOutOfSyncError extends FreeGanttError {
  readonly entryId: EntryId;
  readonly reason: 'ambiguous' | 'conflicting';
  readonly operation: string;

  constructor(entryId: EntryId, reason: 'ambiguous' | 'conflicting', operation: string) {
    super(
      'segments-out-of-sync',
      reason === 'ambiguous'
        ? `${operation}: "${entryId}" draws several segments, so start and end alone do not say which one moves. Write the segments instead.`
        : `${operation}: the start and end written for "${entryId}" do not match the segments in the same edit. Write the segments alone, and let the library work out the start and end.`,
    );
    this.name = 'SegmentsOutOfSyncError';
    this.entryId = entryId;
    this.reason = reason;
    this.operation = operation;
  }
}

/** `code: 'empty-segments'` — `entries.update(id, { segments: [] })`: every stored Entry keeps at
 *  least one Segment (#212), so an update cannot empty the list out from under it. `entries.add`
 *  reads `segments: []` differently and mints one Segment over the entry's own span (S2.3 §1.1) —
 *  there, `[]` means "the caller named none", and ingest has a whole span to fall back on. An update
 *  has no such span to invent one from without silently discarding the Segment ids already there, so
 *  it refuses instead. */
export class EmptySegmentsError extends FreeGanttError {
  readonly entryId: EntryId;
  readonly operation: string;

  constructor(entryId: EntryId, operation: string) {
    super(
      'empty-segments',
      `${operation}: "${entryId}" must keep at least one segment. To remove segments, call entries.removeSegments; to remove the whole entry, call entries.remove.`,
    );
    this.name = 'EmptySegmentsError';
    this.entryId = entryId;
    this.operation = operation;
  }
}

/** `code: 'inverted-span'` — a span whose `end` sits before its `start`. The repo owner refused this
 *  at the mutation boundary (2026-09-06 ruling, #143): the write is rejected, not stored and rendered,
 *  and not silently collapsed. A zero-length span (`start === end`) stays legal — it is the empty
 *  half-open interval `[t, t)`, a different question from an inverted one.
 *
 *  The constructor is structural for the reason `InvalidSnapIncrementError`'s is (s5-231 review, F4).
 *  It names the Entry the consumer wrote, names the Segment as well when the fault is a Segment's
 *  own, and prints both instants — a bulk load whose zone shifted by an hour is invisible without
 *  them. It takes `operation` from the caller, because an `EditExtender` cascade reaches the same
 *  check as `entries.update()` does. */
export class InvertedSpanError extends FreeGanttError {
  readonly entryId: EntryId;
  readonly span: TimeSpan;
  readonly operation: string;
  readonly segmentId?: SegmentId;

  constructor(entryId: EntryId, span: TimeSpan, operation: string, segmentId?: SegmentId) {
    super(
      'inverted-span',
      `${operation}: ` +
        (segmentId === undefined ? `"${entryId}"` : `segment "${segmentId}" of "${entryId}"`) +
        ` ends at ${span.end} and starts at ${span.start}, so it ends before it starts. ` +
        `Swap the two, or fix the value that is wrong.`,
    );
    this.name = 'InvertedSpanError';
    this.entryId = entryId;
    this.span = span;
    this.operation = operation;
    if (segmentId !== undefined) this.segmentId = segmentId;
  }
}

/** `code: 'unknown-field'` — an edit or `entries.fieldValue` naming a key that is not a declared
 *  Field. The registry is the legal set: core Fields plus the consumer's (D-S4-5, D-S2-26). */
export class UnknownFieldError extends FreeGanttError {
  readonly field: string;
  readonly operation: string;

  constructor(field: string, operation: string) {
    super(
      'unknown-field',
      `${operation}: there is no field called "${field}". Declare it in the Dataset's "fields" list, or put the value in "meta" if it needs no field.`,
    );
    this.name = 'UnknownFieldError';
    this.field = field;
    this.operation = operation;
  }
}

/** `code: 'duplicate-field-key'` — two Field declarations share a `key`, or a declaration names a
 *  core Field (D-S4-5). */
export class DuplicateFieldKeyError extends FreeGanttError {
  readonly key: string;

  constructor(key: string) {
    super(
      'duplicate-field-key',
      `fields: the key "${key}" is declared twice. Give one declaration a different key — the core fields are declared already.`,
    );
    this.name = 'DuplicateFieldKeyError';
    this.key = key;
  }
}

/** `code: 'invalid-field-source'` — a `Field.source` that names no known source (#196). TypeScript
 *  refuses the shape, so this reaches a JS caller: `source: 'meta'` where `{ from: 'meta' }` was
 *  meant, or a `from` outside `'entry' | 'meta' | 'compute'`. `ctx.fields.register(field)` is public
 *  surface (D-S5-21), so a plugin author writing plain JS is a supported caller and gets a
 *  `FreeGanttError` like every other library fault, not a bare `TypeError`.
 *
 *  The message says what the caller wrote, inline: `model/` may declare no helper function of its
 *  own (types-only carve-out), and this is the one thing the reader needs to see the typo. */
export class InvalidFieldSourceError extends FreeGanttError {
  readonly key: string;
  readonly received: unknown;

  constructor(key: string, received: unknown) {
    super(
      'invalid-field-source',
      `fields: the source of "${key}" is ` +
        (typeof received === 'object' && received !== null
          ? `{ from: ${String((received as { from?: unknown }).from)} }`
          : typeof received === 'string'
            ? `the string "${received}"`
            : String(received)) +
        `. Write { from: 'entry' }, { from: 'meta', key } or { from: 'compute', read }.`,
    );
    this.name = 'InvalidFieldSourceError';
    this.key = key;
    this.received = received;
  }
}

/** `code: 'duplicate-field-source'` — two Fields resolve to the same `{ from: 'meta', key }` (D-S4-5). */
export class DuplicateFieldSourceError extends FreeGanttError {
  readonly metaKey: string;

  constructor(metaKey: string) {
    super(
      'duplicate-field-source',
      `fields: two fields both read the meta key "${metaKey}". Point one of them at a different meta key — each slot in the document belongs to one field.`,
    );
    this.name = 'DuplicateFieldSourceError';
    this.metaKey = metaKey;
  }
}

/** `code: 'unknown-aggregator'` — `rollUp` names an Aggregator that is not shipped and not in
 *  `DatasetOptions.aggregators` (D-S4-5). */
export class UnknownAggregatorError extends FreeGanttError {
  readonly aggregatorName: string;

  constructor(aggregatorName: string) {
    super(
      'unknown-aggregator',
      `fields: there is no aggregator called "${aggregatorName}". Register it in the Dataset's "aggregators" option, or name a shipped one.`,
    );
    this.name = 'UnknownAggregatorError';
    this.aggregatorName = aggregatorName;
  }
}

/** `code: 'unknown-field-type'` — `type` names a bundle that is not in `fieldTypes` (D-S4-5). */
export class UnknownFieldTypeError extends FreeGanttError {
  readonly typeName: string;

  constructor(typeName: string) {
    super(
      'unknown-field-type',
      `fields: there is no field type called "${typeName}". Register it in the Dataset's "fieldTypes" option, or name a shipped one.`,
    );
    this.name = 'UnknownFieldTypeError';
    this.typeName = typeName;
  }
}

/** `code: 'aggregator-failed'` — a consumer Aggregator threw during the Rollup (D-S4-9). The
 *  transaction rolls back; nothing commits and no history entry is pushed. */
export class AggregatorFailedError extends FreeGanttError {
  readonly fieldKey: string;
  readonly aggregatorName: string;
  readonly entryId: EntryId;

  constructor(fieldKey: string, aggregatorName: string, entryId: EntryId, cause?: unknown) {
    if (cause === undefined) {
      super(
        'aggregator-failed',
        `rollup: the aggregator "${aggregatorName}" threw while it rolled up the field "${fieldKey}" for entry "${String(entryId)}". ` +
          `Nothing was saved. Read the "cause" of this error, and make the aggregator handle that value.`,
      );
    } else {
      super(
        'aggregator-failed',
        `rollup: the aggregator "${aggregatorName}" threw while it rolled up the field "${fieldKey}" for entry "${String(entryId)}". ` +
          `Nothing was saved. Read the "cause" of this error, and make the aggregator handle that value.`,
        { cause },
      );
    }
    this.name = 'AggregatorFailedError';
    this.fieldKey = fieldKey;
    this.aggregatorName = aggregatorName;
    this.entryId = entryId;
  }
}

/** `code: 'field-not-columnable'` — `gridColumns` named a Field that did not declare `column`
 *  (D-S4-12). Thrown when S4.3 resolves columns. */
export class FieldNotColumnableError extends FreeGanttError {
  readonly key: string;

  constructor(key: string) {
    super(
      'field-not-columnable',
      `gridColumns: the field "${key}" cannot be shown as a column. Add a "column" section to its field declaration.`,
    );
    this.name = 'FieldNotColumnableError';
    this.key = key;
  }
}

/** `code: 'unknown-grid-column'` — `gantt.hideGridColumn` or `gantt.showGridColumn` named a field
 *  that no declared column carries (D-S5-34). Both verbs act on a column this Gantt already
 *  declares. Neither one adds a column, so a name nothing declares is a mistake and says so. A
 *  hidden column stays declared, so `showGridColumn` always reaches what `hideGridColumn` hid. */
export class UnknownGridColumnError extends FreeGanttError {
  readonly field: string;

  constructor(field: string) {
    super(
      'unknown-grid-column',
      `gridColumns: no column shows the field "${field}". Add it to the Gantt's "gridColumns" list first — hiding a column leaves it declared.`,
    );
    this.name = 'UnknownGridColumnError';
    this.field = field;
  }
}

/** `code: 'mutation-during-notification'` — a mutator called while `beforeChange` or `change` handlers
 * are running (D-S2-9, D-S2-25). The write set is discarded; nothing about the notification in
 * progress is affected. */
export class MutationDuringNotificationError extends FreeGanttError {
  readonly operation: string;

  constructor(operation: string) {
    super(
      'mutation-during-notification',
      `${operation}: you cannot change the Dataset while a beforeChange or change handler runs. Nothing was saved. Make the change after the handler returns.`,
    );
    this.name = 'MutationDuringNotificationError';
    this.operation = operation;
  }
}

/** `code: 'mutation-cancelled'` — a `beforeChange` handler returned `false`, refusing the whole
 * changeset (D-S2-25). Thrown by the programmatic call that triggered the transaction, carrying the
 * changeset that was refused — `entries.update()`'s contract is to return the stored entry, and if
 * nothing was stored, returning one would be a lie.
 *
 * `reason` is what the vetoing handler said through `refuse(reason)` (#210), and `undefined` when it
 * returned a bare `false`. The message quotes it verbatim: the words are prose the consumer wrote
 * for their own user, so core frames them and never rewords them. */
export class MutationCancelledError extends FreeGanttError {
  readonly changeSet: ChangeSet;
  readonly reason: string | undefined;

  constructor(changeSet: ChangeSet, reason?: string) {
    super(
      'mutation-cancelled',
      reason === undefined
        ? 'Nothing was saved. A beforeChange handler refused this change. Read "changeSet" on this error to see what it refused.'
        : `Nothing was saved. A beforeChange handler refused this change and said: "${reason}". Read "changeSet" on this error to see what it refused.`,
    );
    this.name = 'MutationCancelledError';
    this.changeSet = changeSet;
    this.reason = reason;
  }
}

/** `code: 'unreadable-value'` — the built-in cell editor's control read no value back from the text
 * it holds, so nothing was written and the editor stayed open (#234). A `parseValue` that refused
 * the text is the usual cause; a date control with no date in it is the other.
 *
 * Never thrown: the editor raises it as the `cause` of its own Error report, the way
 * `MutationCancelledError` carries the refused `ChangeSet` for `data/transaction.ts`. It exists so
 * that the Field key and the text the user typed reach a consumer as readonly members, rather than
 * spliced into a message a consumer would have to parse. */
export class UnreadableCellValueError extends FreeGanttError {
  readonly entryId: EntryId;
  readonly field: string;
  /** What the control held. `undefined` when the control keeps no text of its own — a date control
   *  reads a date or nothing, and has no string to hand over. */
  readonly text: string | undefined;

  constructor(entryId: EntryId, field: string, text: string | undefined) {
    super(
      'unreadable-value',
      'The cell editor could not read a value from the text it holds. Read "text" on this error to see what the user typed, and "field" for the field they typed it into.',
    );
    this.name = 'UnreadableCellValueError';
    this.entryId = entryId;
    this.field = field;
    this.text = text;
  }
}

/** `code: 'invalid-replay-origin'` — `replay(changeSet)` given a changeset whose `origin` is not
 * `'undo'` or `'redo'`. `'user'` is `apply`'s door (D-S2-11), not open yet
 * (`plans/s2-data-core/s2b-undo-replay-seam.md`). */
export class InvalidReplayOriginError extends FreeGanttError {
  readonly origin: string;

  constructor(origin: string) {
    super(
      'invalid-replay-origin',
      `replay: the origin of this changeset is "${origin}". Set it to "undo" or "redo" — replay applies those two only.`,
    );
    this.name = 'InvalidReplayOriginError';
    this.origin = origin;
  }
}

/** `code: 'duplicate-row-id'` — `{ source: 'custom' }` returned two `CustomRow`s with the same `id`. */
export class DuplicateRowIdError extends FreeGanttError {
  readonly rowId: string;

  constructor(rowId: string) {
    super(
      'duplicate-row-id',
      `rows: the custom row source returned the id "${rowId}" twice. Give every row it returns its own id.`,
    );
    this.name = 'DuplicateRowIdError';
    this.rowId = rowId;
  }
}

/** `code: 'duplicate-plugin-id'` — two entries of a `plugins` list (a `GanttPlugin[]`, or a
 *  `DatasetPlugin[]` in S5.10) share one `PluginId` (D-S5-3). */
export class DuplicatePluginIdError extends FreeGanttError {
  readonly pluginId: PluginId;

  constructor(pluginId: PluginId) {
    super(
      'duplicate-plugin-id',
      `plugins: "${pluginId}" appears twice in one plugins list. Remove one copy, or give the second plugin its own id.`,
    );
    this.name = 'DuplicatePluginIdError';
    this.pluginId = pluginId;
  }
}

/** `code: 'plugin-not-installed'` — `gantt.uninstallPlugin` named a plugin this Gantt does not have
 *  installed (D-S5-36). The verb acts on the installed set, and it never adds to it, so a name
 *  nothing installs is a mistake rather than a silent no-op — the same call D-S5-34 made for
 *  `UnknownGridColumnError`. Distinct from `MissingPluginError`, which is a `requires` entry no
 *  `plugins` list supplies. */
export class PluginNotInstalledError extends FreeGanttError {
  readonly pluginId: PluginId;

  constructor(pluginId: PluginId) {
    super(
      'plugin-not-installed',
      `uninstallPlugin: the plugin "${pluginId}" is not installed. Check the id against gantt.plugins.`,
    );
    this.name = 'PluginNotInstalledError';
    this.pluginId = pluginId;
  }
}

/** `code: 'missing-plugin'` — a `DatasetPlugin` names a `requires` id that the same `plugins` list
 *  does not install (D-S5-31). Thrown at construction, naming both ids. `requires` is a check, never
 *  a supplier: a missing prerequisite is this error, not a quiet default. */
export class MissingPluginError extends FreeGanttError {
  readonly pluginId: PluginId;
  readonly requiredId: PluginId;

  constructor(pluginId: PluginId, requiredId: PluginId) {
    super(
      'missing-plugin',
      `plugins: "${pluginId}" requires "${requiredId}", and this plugins list does not install it. Add "${requiredId}" to the same list.`,
    );
    this.name = 'MissingPluginError';
    this.pluginId = pluginId;
    this.requiredId = requiredId;
  }
}

/** `code: 'plugin-requirement-cycle'` — two or more plugins require each other, so no setup order
 *  satisfies every `requires` (D-S5-31). This is not the `PluginOrderError` D-S5-31 refuses: installation
 *  computes the order, so a caller can no longer write a wrong one — but a cycle leaves no right one
 *  to compute. Thrown at construction, naming every plugin in the cycle. */
export class PluginRequirementCycleError extends FreeGanttError {
  readonly pluginIds: readonly PluginId[];

  constructor(pluginIds: readonly PluginId[]) {
    super(
      'plugin-requirement-cycle',
      `plugins: ${pluginIds.map((id) => `"${id}"`).join(', ')} require each other, so no setup order works. Drop one "requires" entry to break the ring.`,
    );
    this.name = 'PluginRequirementCycleError';
    this.pluginIds = pluginIds;
  }
}

/** `code: 'registration-closed'` — a `ctx.*.register*` call reached after that plugin's `setup()`
 *  already returned (D-S5-4). Registration is legal only while `setup` is running. */
export class RegistrationClosedError extends FreeGanttError {
  readonly pluginId: PluginId;

  constructor(pluginId: PluginId) {
    super(
      'registration-closed',
      `plugins: "${pluginId}" registered something after its setup returned. Move the register call inside setup.`,
    );
    this.name = 'RegistrationClosedError';
    this.pluginId = pluginId;
  }
}

/** `code: 'plugin-setup-failed'` — a plugin's `setup()` threw. Every plugin already set up in this
 *  install batch is disposed, in reverse order, before this is thrown (issue #137 F4). */
export class PluginSetupError extends FreeGanttError {
  readonly pluginId: PluginId;

  constructor(pluginId: PluginId, cause: unknown) {
    super(
      'plugin-setup-failed',
      `plugins: the setup of "${pluginId}" threw, so no plugin in this batch is installed. Read the "cause" of this error.`,
      { cause },
    );
    this.name = 'PluginSetupError';
    this.pluginId = pluginId;
  }
}

/** `code: 'renderer-already-registered'` — two plugins both call `ctx.view.registerRenderer` for the
 *  same slot (S5.4, D-S5-11). A consumer who wants a plugin's renderer to win removes its own
 *  `GanttOptions` renderer instead — this error is only for two *plugins* colliding.
 *  `slot` names what collided: a renderer point (`'cell'`), or one kind of the `bar` point's
 *  per-kind form (`'bar:buffer'`, D-S5-12, review P2). It stays a bare `string` here (not layout/'s
 *  `RendererPoint`) — model/ is a leaf and may import nothing (model-is-leaf). */
export class RendererAlreadyRegisteredError extends FreeGanttError {
  readonly slot: string;
  readonly firstPluginId: PluginId;
  readonly secondPluginId: PluginId;

  constructor(slot: string, firstPluginId: PluginId, secondPluginId: PluginId) {
    super(
      'renderer-already-registered',
      `view.registerRenderer: the plugin "${firstPluginId}" already draws "${slot}", and "${secondPluginId}" asked for it too. Uninstall one of the two plugins.`,
    );
    this.name = 'RendererAlreadyRegisteredError';
    this.slot = slot;
    this.firstPluginId = firstPluginId;
    this.secondPluginId = secondPluginId;
  }
}

/** `code: 'unknown-command'` — `CommandRegistry.run(id)` given an id nothing registered (D-S5-6). A
 *  binding whose `command` names an id nothing owns is not this: the keymap resolver treats an
 *  unresolved binding as a non-match and falls through, rather than surfacing the mistake mid-key-press. */
export class UnknownCommandError extends FreeGanttError {
  readonly commandId: string;

  constructor(commandId: string) {
    super(
      'unknown-command',
      `gantt.commands.run: there is no command called "${commandId}". Check the id, or register the command first.`,
    );
    this.name = 'UnknownCommandError';
    this.commandId = commandId;
  }
}

/** `code: 'unsupported-schema'` — `fromJSON` given a `schema` this build has no reader for
 *  (D-S2-12, `plans/s2-data-core/s2.6-serialization.md` §1.3). Names the version it found and the
 *  versions it reads, so a caller can tell a future document from a corrupt one. */
export class UnsupportedSchemaError extends FreeGanttError {
  readonly schema: number;
  readonly supported: readonly number[];

  constructor(schema: number, supported: readonly number[]) {
    super(
      'unsupported-schema',
      `fromJSON: this document says schema ${schema}, and this build reads ${supported.join(', ')}. Upgrade the library, or export the document again from the build that wrote it.`,
    );
    this.name = 'UnsupportedSchemaError';
    this.schema = schema;
    this.supported = supported;
  }
}
