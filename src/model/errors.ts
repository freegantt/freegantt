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

/** `code: 'entry-not-found'` — `reveal(entryId)` given an id the bound Dataset has no entry for
 * (S1.9, D-S1.9-6). */
export class EntryNotFoundError extends FreeGanttError {
  constructor(entryId: EntryId) {
    super('entry-not-found', `reveal: no entry with id "${entryId}"`);
    this.name = 'EntryNotFoundError';
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
