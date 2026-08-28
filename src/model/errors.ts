// model/'s runtime carve-out widens here: id/brand helpers and this base class, zero dependencies
// (plans/01 §1.1, D-S1.7-8). A public error type is part of the API surface (only api/ and model/
// types are public), so it lives where the rest of the public surface lives.

import type { EntryId } from './ids.js';
import type { ChangeSet } from './change-set.js';

export class FreeGanttError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
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

/** `code: 'entry-not-found'` — an id the Dataset has no entry for, from `reveal(entryId)` (S1.9,
 * D-S1.9-6) or a mutator (`entries.update`/`remove`, or a `parentId` naming a missing entry — S2.3
 * §1.3). `operation` names the call that failed, so the message points at what the caller asked for
 * rather than a generic "not found". */
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

/** `code: 'unknown-field'` — an edit naming a key that is not a declared field. In S2 the legal set is
 * the core `Entry` fields; S5's field registry widens the set, not the check (D-S2-26, S2.3 §1.3). */
export class UnknownFieldError extends FreeGanttError {
  constructor(field: string) {
    super('unknown-field', `entries: "${field}" is not a known field`);
    this.name = 'UnknownFieldError';
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
