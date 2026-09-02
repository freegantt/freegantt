// model/'s runtime carve-out widens here: id/brand helpers and this base class, zero dependencies
// (plans/01 §1.1, D-S1.7-8). A public error type is part of the API surface (only api/ and model/
// types are public), so it lives where the rest of the public surface lives.

import type { EntryId } from './ids.js';
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

/** `code: 'duplicate-entry-id'` — `entries.add()` given an id already in the store (S2.3 §1.3). */
export class DuplicateEntryIdError extends FreeGanttError {
  constructor(entryId: EntryId) {
    super('duplicate-entry-id', `entries.add: an entry with id "${entryId}" already exists`);
    this.name = 'DuplicateEntryIdError';
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

/** `code: 'segments-out-of-sync'` — a `start`/`end` write on an entry that stores `segments` (D-S4-30).
 *  Write `segments` instead; the envelope updates in the same transaction. */
export class SegmentsOutOfSyncError extends FreeGanttError {
  constructor(entryId: EntryId) {
    super(
      'segments-out-of-sync',
      `entries.update: "${entryId}" has segments — write segments, not start/end alone`,
    );
    this.name = 'SegmentsOutOfSyncError';
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
