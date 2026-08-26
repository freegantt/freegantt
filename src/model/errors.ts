// model/'s runtime carve-out widens here: id/brand helpers and this base class, zero dependencies
// (plans/01 §1.1, D-S1.7-8). A public error type is part of the API surface (only api/ and model/
// types are public), so it lives where the rest of the public surface lives.

import type { EntryId } from './ids.js';

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

/** `code: 'host-not-found'` — a `host` selector string that matches no element (#38). */
export class HostNotFoundError extends FreeGanttError {
  constructor(host: string) {
    super('host-not-found', `Gantt: no element matches host selector "${host}"`);
    this.name = 'HostNotFoundError';
  }
}

/** `code: 'invalid-instant'` — a host wrote a value on an `InstantInput` field that names no instant
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
