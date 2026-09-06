// model/'s runtime carve-out widens here: id/brand helpers and this base class, zero dependencies
// (plans/01 §1.1, D-S1.7-8). A public error type is part of the API surface (only api/ and model/
// types are public), so it lives where the rest of the public surface lives.

import type { EntryId, SegmentId } from './ids.js';
import type { ChangeSet } from './change-set.js';
import type { PluginId } from './plugin.js';

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
  constructor(message: string) {
    super('unsupported-unit', message);
    this.name = 'UnsupportedUnitError';
  }
}

/** `code: 'container-not-found'` — a `container` selector string that matches no element (#38). */
export class ContainerNotFoundError extends FreeGanttError {
  constructor(container: string) {
    super('container-not-found', `Gantt: no element matches container selector "${container}"`);
    this.name = 'ContainerNotFoundError';
  }
}

/** `code: 'invalid-instant'` — a consumer wrote a value on an `InstantInput` field that names no instant
 * (an unparseable string, or a calendar date that does not exist such as `'2026-02-31'`). */
export class InvalidInstantError extends FreeGanttError {
  constructor(message: string) {
    super('invalid-instant', message);
    this.name = 'InvalidInstantError';
  }
}

/** `code: 'unknown-preset'` — a `PresetRef` string outside the shipped set, from `resolvePreset`
 * (S1.9, D-S1.9-3). */
export class UnknownPresetError extends FreeGanttError {
  constructor(id: string) {
    super('unknown-preset', `resolvePreset: "${id}" is not a shipped preset id`);
    this.name = 'UnknownPresetError';
  }
}

/** `code: 'invalid-preset'` — a `ViewPreset` whose `preferredTickWidthPx` is below its own
 * `minTickWidthPx`, from `resolvePreset` (header readability follow-up). The floor would then be
 * unreachable at the preset's own intended zoom, which is never a preset author's intent. */
export class InvalidPresetError extends FreeGanttError {
  constructor(message: string) {
    super('invalid-preset', message);
    this.name = 'InvalidPresetError';
  }
}

/** `code: 'entry-not-found'` — an id the Dataset has no entry for, from `reveal(entryId)` (S1.9,
 * D-S1.9-6), `entries.fieldValue`, or a mutator (`entries.update`/`remove`, or a `parentId` naming a
 * missing entry — S2.3 §1.3). `operation` names the call that failed, so the message points at what
 * the caller asked for rather than a generic "not found". */
export class EntryNotFoundError extends FreeGanttError {
  constructor(entryId: EntryId, operation: string) {
    super('entry-not-found', `${operation}: no entry with id "${entryId}"`);
    this.name = 'EntryNotFoundError';
  }
}

/** `code: 'segment-not-found'` — an id `entries.removeSegments()` is given that names no Segment on
 *  any Entry. This matches `EntryNotFoundError`'s posture for `entries.remove`: the call throws
 *  before it stages anything, and the transaction discards whatever it staged for other ids. */
export class SegmentNotFoundError extends FreeGanttError {
  constructor(segmentId: SegmentId, operation: string) {
    super('segment-not-found', `${operation}: no segment with id "${segmentId}"`);
    this.name = 'SegmentNotFoundError';
  }
}

/** `code: 'reveal-target-not-found'` — `reveal(id)` given an id the dataset reads as neither an
 *  Entry nor a Segment (#212, ADR 0010, issue #227). `reveal` alone takes `EntryId | SegmentId`; once
 *  neither reading resolves, nothing tells which one the caller meant, so the message names both
 *  rather than picking `EntryNotFoundError` or `SegmentNotFoundError` and forging the id's brand to
 *  match. */
export class RevealTargetNotFoundError extends FreeGanttError {
  constructor(id: string, operation: string) {
    super('reveal-target-not-found', `${operation}: no entry or segment with id "${id}"`);
    this.name = 'RevealTargetNotFoundError';
  }
}

/** `code: 'duplicate-entry-id'` — `entries.add()` given an id already in the store (S2.3 §1.3). */
export class DuplicateEntryIdError extends FreeGanttError {
  constructor(entryId: EntryId) {
    super('duplicate-entry-id', `entries.add: an entry with id "${entryId}" already exists`);
    this.name = 'DuplicateEntryIdError';
  }
}

/** `code: 'duplicate-segment-id'` — two Segments in the store share one `SegmentId`: authored twice
 *  in the same `segments` array, authored on two different Entries, or authored on construction
 *  (#212, ADR 0010). A `SegmentId` is the Selection's identity, so a duplicate is rejected the same
 *  way a duplicate `EntryId` is — before anything stages. `operation` names which of the three
 *  throwing calls it was (`entries.add`, `entries.update`, or `construction`), the same way
 *  `EntryNotFoundError`/`SegmentNotFoundError` name theirs. */
export class DuplicateSegmentIdError extends FreeGanttError {
  constructor(segmentId: SegmentId, operation: string) {
    super('duplicate-segment-id', `${operation}: a segment with id "${segmentId}" already exists`);
    this.name = 'DuplicateSegmentIdError';
  }
}

/** `code: 'parent-cycle'` — a `parentId` edit that would make an entry its own ancestor, self-parenting
 * included (S2.3 §1.3). */
export class ParentCycleError extends FreeGanttError {
  constructor(entryId: EntryId) {
    super('parent-cycle', `entries: setting "${entryId}"'s parentId would create a cycle`);
    this.name = 'ParentCycleError';
  }
}

/** `code: 'segments-out-of-sync'` — a `start`/`end` write and the entry's Segments disagree, either
 *  way (D-S4-30, narrowed by #212; widened by the #212 fix-plan review, finding S3):
 *  - `'ambiguous'`: the write names `start`/`end` and no Segments, on an entry that draws several.
 *    The envelope spans the Segments, so moving it alone says nothing about which stretch moved.
 *  - `'conflicting'`: the write names both `start`/`end` and `segments`, and the segments' own
 *    envelope is not the `start`/`end` named alongside them — one edit cannot mean both.
 *  An entry that draws one Segment never sees either: that Segment *is* the envelope, so the write
 *  updates it in the same transaction and the two halves can only agree. */
export class SegmentsOutOfSyncError extends FreeGanttError {
  constructor(entryId: EntryId, reason: 'ambiguous' | 'conflicting') {
    super(
      'segments-out-of-sync',
      reason === 'ambiguous'
        ? `entries.update: "${entryId}" draws several segments — write segments, not start/end alone`
        : `entries.update: "${entryId}" wrote start/end that disagrees with the segments in the same edit`,
    );
    this.name = 'SegmentsOutOfSyncError';
  }
}

/** `code: 'empty-segments'` — `entries.update(id, { segments: [] })`: every stored Entry keeps at
 *  least one Segment (#212), so an update cannot empty the list out from under it. `entries.add`
 *  reads `segments: []` differently and mints one Segment over the entry's own span (S2.3 §1.1) —
 *  there, `[]` means "the caller named none", and ingest has a whole span to fall back on. An update
 *  has no such span to invent one from without silently discarding the Segment ids already there, so
 *  it refuses instead. */
export class EmptySegmentsError extends FreeGanttError {
  constructor(entryId: EntryId) {
    super('empty-segments', `entries.update: "${entryId}" cannot write an empty segments array`);
    this.name = 'EmptySegmentsError';
  }
}

/** `code: 'unknown-field'` — an edit or `entries.fieldValue` naming a key that is not a declared
 *  Field. The registry is the legal set: core Fields plus the consumer's (D-S4-5, D-S2-26). */
export class UnknownFieldError extends FreeGanttError {
  constructor(field: string) {
    super('unknown-field', `entries: "${field}" is not a known field`);
    this.name = 'UnknownFieldError';
  }
}

/** `code: 'duplicate-field-key'` — two Field declarations share a `key`, or a declaration names a
 *  core Field (D-S4-5). */
export class DuplicateFieldKeyError extends FreeGanttError {
  readonly key: string;

  constructor(key: string) {
    super('duplicate-field-key', `fields: "${key}" is already declared`);
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
      `fields: "${key}" declares an invalid source — expected { from: 'entry' | 'meta' | 'compute' }, got ` +
        (typeof received === 'object' && received !== null
          ? `{ from: ${String((received as { from?: unknown }).from)} }`
          : typeof received === 'string'
            ? `the string "${received}"`
            : String(received)),
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
      `fields: two Fields read meta key "${metaKey}" — each Document slot belongs to one Field`,
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
    super('unknown-aggregator', `fields: aggregator "${aggregatorName}" is not registered`);
    this.name = 'UnknownAggregatorError';
    this.aggregatorName = aggregatorName;
  }
}

/** `code: 'unknown-field-type'` — `type` names a bundle that is not in `fieldTypes` (D-S4-5). */
export class UnknownFieldTypeError extends FreeGanttError {
  readonly typeName: string;

  constructor(typeName: string) {
    super('unknown-field-type', `fields: type "${typeName}" is not registered`);
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
        `rollup: aggregator "${aggregatorName}" failed on field "${fieldKey}" for entry "${String(entryId)}"`,
      );
    } else {
      super(
        'aggregator-failed',
        `rollup: aggregator "${aggregatorName}" failed on field "${fieldKey}" for entry "${String(entryId)}"`,
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
    super('field-not-columnable', `gridColumns: "${key}" is not a Grid column candidate`);
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
    super('unknown-grid-column', `gridColumns: no column names the field "${field}"`);
    this.name = 'UnknownGridColumnError';
    this.field = field;
  }
}

/** `code: 'mutation-during-notification'` — a mutator called while `beforeChange` or `change` handlers
 * are running (D-S2-9, D-S2-25). The write set is discarded; nothing about the notification in
 * progress is affected. */
export class MutationDuringNotificationError extends FreeGanttError {
  constructor(message: string) {
    super('mutation-during-notification', message);
    this.name = 'MutationDuringNotificationError';
  }
}

/** `code: 'mutation-cancelled'` — a `beforeChange` handler returned `false`, refusing the whole
 * changeset (D-S2-25). Thrown by the programmatic call that triggered the transaction, carrying the
 * changeset that was refused — `entries.update()`'s contract is to return the stored entry, and if
 * nothing was stored, returning one would be a lie. */
export class MutationCancelledError extends FreeGanttError {
  readonly changeSet: ChangeSet;

  constructor(changeSet: ChangeSet) {
    super('mutation-cancelled', 'transaction: a beforeChange handler refused this changeset');
    this.name = 'MutationCancelledError';
    this.changeSet = changeSet;
  }
}

/** `code: 'invalid-replay-origin'` — `replay(changeSet)` given a changeset whose `origin` is not
 * `'undo'` or `'redo'`. `'user'` is `apply`'s door (D-S2-11), not open yet
 * (`plans/s2-data-core/s2b-undo-replay-seam.md`). */
export class InvalidReplayOriginError extends FreeGanttError {
  constructor(origin: string) {
    super('invalid-replay-origin', `replay: origin "${origin}" is not "undo" or "redo"`);
    this.name = 'InvalidReplayOriginError';
  }
}

/** `code: 'duplicate-row-id'` — `{ source: 'custom' }` returned two `CustomRow`s with the same `id`. */
export class DuplicateRowIdError extends FreeGanttError {
  readonly rowId: string;

  constructor(rowId: string) {
    super('duplicate-row-id', `rows: custom source returned duplicate id "${rowId}"`);
    this.name = 'DuplicateRowIdError';
    this.rowId = rowId;
  }
}

/** `code: 'duplicate-plugin-id'` — two entries of a `plugins` list (a `GanttPlugin[]`, or a
 *  `DatasetPlugin[]` in S5.10) share one `PluginId` (D-S5-3). */
export class DuplicatePluginIdError extends FreeGanttError {
  readonly pluginId: PluginId;

  constructor(pluginId: PluginId) {
    super('duplicate-plugin-id', `plugins: "${pluginId}" is installed twice in one list`);
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
    super('plugin-not-installed', `uninstallPlugin: "${pluginId}" is not installed`);
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
      `plugins: "${pluginId}" requires "${requiredId}", which this Dataset does not install`,
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
      `plugins: ${pluginIds.map((id) => `"${id}"`).join(', ')} require each other, so no setup order works`,
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
      `plugins: "${pluginId}" tried to register after setup — registration is legal during setup only`,
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
    super('plugin-setup-failed', `plugins: "${pluginId}" threw during setup`, { cause });
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
      `view.registerRenderer: "${slot}" is already registered by plugin "${firstPluginId}" (attempted again by "${secondPluginId}")`,
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
    super('unknown-command', `commands: no command is registered with id "${commandId}"`);
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
      `fromJSON: schema ${schema} is not readable; this build reads ${supported.join(', ')}`,
    );
    this.name = 'UnsupportedSchemaError';
    this.schema = schema;
    this.supported = supported;
  }
}
