import { describe, expect, it } from 'vitest';
import { EXTENDER_OPERATION, moveEntryTo, toEditReading, toEditsReading, toEntries } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import {
  ComputedFieldCannotBeWrittenError,
  entryId,
  FieldNotEditableError,
  InvertedSpanError,
  UnknownFieldError,
} from '../model/index.js';
import type { StoredEntry, EntryEdit, EntryInput } from '../model/index.js';
import { instant, toInstant } from '../time/index.js';
import type { EntryEdits, ProposedEdit } from './edit-extension.js';
import { FieldRegistry } from './fields/field-registry.js';
import { storedParentSource } from './hierarchy-source.js';
import { identityFieldLockRule } from './write-rule.js';

const registry = new FieldRegistry({ fields: [] });

const utc = (iso: string): number => Date.parse(iso);

function createContext(): EntryReadContext {
  return { timeZone: 'UTC', dateOnlyEnd: 'inclusive' as const };
}

// F18: production reads `toEditReading(...).stored` directly. This test-only wrapper keeps every
// assertion below reading `toProposedEdit(edit, ...)` rather than unwrapping at each call site.
function toProposedEdit(
  edit: EntryEdit,
  context: EntryReadContext,
  entry: StoredEntry,
  fieldRegistry: FieldRegistry,
  operation: string,
): ProposedEdit {
  return toEditReading(edit, context, entry, fieldRegistry, operation).stored;
}

describe('toEntries', () => {
  it('brands a plain string id and reads a date-only end inclusively', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.id).toBe(entryId('t1'));
    expect(entry?.start).toBe(utc('2026-09-01T00:00:00Z'));
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(entry?.end).toBe(utc('2026-09-09T00:00:00Z'));
  });

  it('leaves an optional field absent when the input never had it (ADR 0013: no stored kind)', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = toEntries([input], createContext(), registry);
    expect(Object.keys(entry ?? {}).sort()).toEqual(['end', 'id', 'name', 'props', 'start'].sort());
  });

  it('carries parentId and props through when present', () => {
    const input: EntryInput = {
      id: 'child',
      parentId: 'root',
      name: 'Review',
      start: '2026-09-01',
      end: '2026-09-02',
      props: { team: 'A' },
    };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.parentId).toBe(entryId('root'));
    expect(entry?.props).toEqual({ team: 'A' });
  });

  // 2026-09-06 ruling, #143: an inverted span is refused at ingest, not stored and rendered honestly.
  it('refuses a construction-time entry whose end sits before its start', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-08', end: '2026-09-01' };
    expect(() => toEntries([input], createContext(), registry)).toThrow(InvertedSpanError);
  });

  // The zero-length span stays legal (D-S3-4) — the regression guard the reject ruling names
  // alongside the refusal itself. A full timestamp, not a date-only string, keeps `toEndInstant`'s
  // inclusive rule from bumping `end` forward a day.
  it('still accepts a zero-length construction-time entry', () => {
    const input: EntryInput = {
      id: 't1',
      name: 'Milestone',
      start: '2026-09-01T09:00:00Z',
      end: '2026-09-01T09:00:00Z',
    };
    const [entry] = toEntries([input], createContext(), registry);
    expect(entry?.start).toBe(entry?.end);
  });

  it('leaves start and end absent when the input names neither (ADR 0012)', () => {
    const [entry] = toEntries([{ id: 't1', name: 'Unscheduled' }], createContext(), registry);
    expect(entry?.start).toBeUndefined();
    expect(entry?.end).toBeUndefined();
  });
});

describe('toProposedEdit (S4.10)', () => {
  function oneEntry(context: EntryReadContext): StoredEntry {
    const [entry] = toEntries(
      [{ id: 'e1', name: 'Design', start: '2026-09-01', end: '2026-09-05' }],
      context,
      registry,
    );
    return { ...entry!, siblingIndex: 0 };
  }

  it('writes start and end as ordinary Fields, independent of one another (ADR 0026)', () => {
    const context = createContext();
    const entry = oneEntry(context);
    const edit = toProposedEdit({ start: '2026-09-02' }, context, entry, registry, 'entries.update');
    expect(edit.start).toBe(utc('2026-09-02T00:00:00Z'));
    expect(edit.end).toBeUndefined();
  });

  it('refuses update(id, { start }) when the new start would end after the entry ends', () => {
    const context = createContext();
    const entry = oneEntry(context);
    expect(() => toProposedEdit({ start: '2026-09-10' }, context, entry, registry, 'entries.update')).toThrow(
      InvertedSpanError,
    );
  });

  it('refuses update(id, { end }) when the new end would sit before the entry starts', () => {
    const context = createContext();
    const entry = oneEntry(context);
    expect(() => toProposedEdit({ end: '2026-08-01' }, context, entry, registry, 'entries.update')).toThrow(
      InvertedSpanError,
    );
  });

  // The zero-length write stays legal (D-S3-4) — the regression guard the reject ruling names
  // alongside the refusal itself, so a resize gesture's own clamp keeps working (#143). A full
  // timestamp, not a date-only string, keeps `toEndInstant`'s inclusive rule from bumping `end`
  // forward a day.
  it('still accepts update(id, { end }) writing a zero-length span', () => {
    const context = createContext();
    const [entry] = toEntries(
      [{ id: 'e1', name: 'Design', start: '2026-09-01T09:00:00Z', end: '2026-09-05T09:00:00Z' }],
      context,
      registry,
    );
    const edit = toProposedEdit(
      { end: '2026-09-01T09:00:00Z' },
      context,
      { ...entry!, siblingIndex: 0 },
      registry,
      'entries.update',
    );
    // `end` alone is written now (ADR 0026 retired the pairing that used to derive `start` too), so
    // the check is against the entry's own, untouched `start`, not against `edit.start`.
    expect(edit.end).toBe(entry!.start);
  });

  it('un-dates a field: update(id, { start: undefined }) writes an explicit removal, not "untouched"', () => {
    const context = createContext();
    const entry = oneEntry(context);
    const edit = toProposedEdit({ start: undefined }, context, entry, registry, 'entries.update');
    expect('start' in edit).toBe(true);
    expect(edit.start).toBeUndefined();
  });

  it('update(id, { parentId: undefined }) roots the entry, an explicit removal, not "untouched" (#542)', () => {
    const context = createContext();
    const entry = { ...oneEntry(context), parentId: entryId('parent') };
    const edit = toProposedEdit({ parentId: undefined }, context, entry, registry, 'entries.update');
    expect('parentId' in edit).toBe(true);
    expect(edit.parentId).toBeUndefined();
  });

  it('update(id, { name: undefined }) clears the name, an explicit removal, not "untouched" (#542)', () => {
    const context = createContext();
    const entry = oneEntry(context);
    const edit = toProposedEdit({ name: undefined }, context, entry, registry, 'entries.update');
    expect('name' in edit).toBe(true);
    expect(edit.name).toBeUndefined();
  });
});

describe('moveEntryTo writes a rigid start/end translate (D-S5-50, #239, ADR 0026)', () => {
  function twoDayEntry(context: EntryReadContext): StoredEntry {
    const [entry] = toEntries(
      [{ id: 't1', name: 'Design', start: '2026-01-01T00:00:00Z', end: '2026-01-03T00:00:00Z' }],
      context,
      registry,
    );
    return { ...entry!, siblingIndex: 0 };
  }

  it('names start and end and nothing else', () => {
    const entry = twoDayEntry(createContext());
    const edit = moveEntryTo(entry, instant(utc('2026-01-05T00:00:00Z')));
    expect(Object.keys(edit).sort()).toEqual(['end', 'start']);
  });

  it('translates both edges by the same delta', () => {
    const context = createContext();
    const entry = twoDayEntry(context);
    const edit = moveEntryTo(entry, instant(utc('2026-01-05T00:00:00Z')));
    expect(edit.start).toBe(utc('2026-01-05T00:00:00Z'));
    expect(edit.end).toBe(utc('2026-01-07T00:00:00Z'));
  });

  it('takes an Instant, so a caller holding a loose date reads it through the zone first', () => {
    const context = createContext();
    const entry = twoDayEntry(context);
    // The zone stays the caller's to apply, because `moveEntryTo` builds an edit and is not a way in
    // (D-S5-50). 'America/New_York' puts the start of 2026-01-05 five hours after the UTC one, and
    // the whole Entry moves by that much more.
    const edit = moveEntryTo(entry, toInstant('America/New_York', '2026-01-05', 'test'));
    expect(edit.start).toBe(utc('2026-01-05T05:00:00Z'));
  });

  // Q5: this call site read `entry.start as Instant` until the span invariant got one home. The
  // cast produced a `NaN` delta. `spansTime` now asks the question, and this pins that a caller
  // holding a start-only Entry sees nothing to translate.
  it('names no field for a start-only Entry, which holds nothing to translate', () => {
    const context = createContext();
    const [startOnly] = toEntries([{ id: 'o1', name: 'Open', start: '2026-01-01' }], context, registry);

    const edit = moveEntryTo({ ...startOnly!, siblingIndex: 0 }, instant(utc('2026-01-03T00:00:00Z')));

    expect(startOnly!.end).toBeUndefined();
    expect(edit).toEqual({});
  });

  it('the moved edit reads back through toProposedEdit the same as any other update', () => {
    const context = createContext();
    const entry = twoDayEntry(context);
    const stored = toProposedEdit(
      moveEntryTo(entry, instant(utc('2026-01-05T00:00:00Z'))),
      context,
      entry,
      registry,
      'entries.update',
    );
    expect(stored.start).toBe(utc('2026-01-05T00:00:00Z'));
    expect(stored.end).toBe(utc('2026-01-07T00:00:00Z'));
  });
});

// #237 / s5-231 review F4. The error used to take a bare string, and the string was wrong: it named
// `entries.update` to a cascade that never called it, and it exposed nothing to catch on.
describe('InvertedSpanError names the caller, the entry id, and both instants', () => {
  function invertedSpanErrorFrom(run: () => unknown): InvertedSpanError {
    try {
      run();
    } catch (error) {
      if (error instanceof InvertedSpanError) return error;
      throw error;
    }
    throw new Error('expected an InvertedSpanError');
  }

  it('names the entry the consumer wrote, and both instants', () => {
    // Full timestamps, not date-only strings, keep `toEndInstant`'s inclusive rule from bumping
    // `end` forward a day before the inversion check reads it.
    const error = invertedSpanErrorFrom(() =>
      toEntries(
        [{ id: 't1', name: 'Design', start: '2026-01-09T00:00:00Z', end: '2026-01-02T00:00:00Z' }],
        createContext(),
        registry,
      ),
    );

    expect(error.entryId).toBe(entryId('t1'));
    expect(error.message).toContain('"t1"');
    expect(error.span).toEqual({
      start: utc('2026-01-09T00:00:00Z'),
      end: utc('2026-01-02T00:00:00Z'),
    });
    expect(error.message).toContain(String(utc('2026-01-09T00:00:00Z')));
    expect(error.message).toContain(String(utc('2026-01-02T00:00:00Z')));
  });

  it('an unreadable date names the caller too, not toInstant (#237)', () => {
    const context = createContext();
    const [unplaced] = toEntries(
      [{ id: 't1', name: 'Design', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const entry: StoredEntry = { ...unplaced!, siblingIndex: 0 };

    expect(() =>
      toEntries([{ id: 't2', name: 'Build', start: 'next tuesday', end: '2026-01-05' }], context, registry),
    ).toThrow('construction: "next tuesday" is not a date this library reads.');
    expect(() =>
      toProposedEdit({ start: 'next tuesday' }, context, entry, registry, 'entries.update'),
    ).toThrow('entries.update: "next tuesday" is not a date this library reads.');
  });

  it('names entries.update for an update, and the edit extender for a cascade', () => {
    const context = createContext();
    const [unplaced] = toEntries(
      [{ id: 't1', name: 'Design', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const entry: StoredEntry = { ...unplaced!, siblingIndex: 0 };
    const inverting = { start: instant(utc('2026-06-01T00:00:00Z')) };

    const fromUpdate = invertedSpanErrorFrom(() =>
      toProposedEdit(inverting, context, entry, registry, 'entries.update'),
    );
    expect(fromUpdate.operation).toBe('entries.update');

    const cascade: EntryEdits = new Map([[entry.id, inverting]]);
    const fromCascade = invertedSpanErrorFrom(() =>
      toEditsReading(
        cascade,
        context,
        (id) => (id === entry.id ? entry : undefined),
        registry,
        identityFieldLockRule,
        storedParentSource,
      ),
    );
    expect(fromCascade.operation).toBe(EXTENDER_OPERATION);
    // The plugin author is not sent to a call they never made (#239).
    expect(fromCascade.message).not.toContain('entries.update');
  });

  // D-S5-46, and it is load-bearing: `gesture-draft.ts`'s resize clamp produces a zero-length span
  // as its own way of refusing an inversion (ADR 0012 does not touch this rule).
  it('leaves a zero-length span legal', () => {
    const context = createContext();
    const [unplaced] = toEntries(
      [{ id: 't1', name: 'Design', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    const entry: StoredEntry = { ...unplaced!, siblingIndex: 0 };
    const zeroLength = instant(entry.start!);

    const stored = toProposedEdit({ end: zeroLength }, context, entry, registry, 'entries.update');
    expect(stored.end).toBe(entry.start);
  });
});

describe('toEditsReading reads a cascade the same way entries.update() reads a body edit (#209)', () => {
  function oneEntry(context: EntryReadContext): StoredEntry {
    const [entry] = toEntries(
      [{ id: 'e1', name: 'Design', start: '2026-01-01', end: '2026-01-05' }],
      context,
      registry,
    );
    return { ...entry!, siblingIndex: 0 };
  }

  it('reads every edit in the map through the extension hook operation name', () => {
    const context = createContext();
    const entry = oneEntry(context);
    const edits: EntryEdits = new Map([[entry.id, { start: instant(utc('2026-01-02T00:00:00Z')) }]]);

    const reading = toEditsReading(
      edits,
      context,
      () => entry,
      registry,
      identityFieldLockRule,
      storedParentSource,
    );

    expect(reading.stored.get(entry.id)?.start).toBe(utc('2026-01-02T00:00:00Z'));
  });

  // An id nothing knows is skipped — there is no Entry to read the edit against (#209 Q3, #235).
  it('skips an edit naming an id no lookup answers for', () => {
    const context = createContext();
    const entry = oneEntry(context);
    const edits: EntryEdits = new Map([[entryId('ghost'), { start: instant(utc('2026-01-02T00:00:00Z')) }]]);

    const reading = toEditsReading(
      edits,
      context,
      (id) => (id === entry.id ? entry : undefined),
      registry,
      identityFieldLockRule,
      storedParentSource,
    );

    expect(reading.stored.size).toBe(0);
  });

  it('refuses an undeclared Field key the same way entries.update() does (#209 Q2)', () => {
    const context = createContext();
    const entry = oneEntry(context);
    const edits: EntryEdits = new Map([[entry.id, { notAField: 'x' }]]);

    expect(() =>
      toEditsReading(edits, context, () => entry, registry, identityFieldLockRule, storedParentSource),
    ).toThrow(UnknownFieldError);
  });

  // #473's ocr finding: this door and `entries.update()`'s `#assertFieldTakesThisWrite` used to be
  // two copies, and this one skipped the `compute` arm — a cascade writing a `compute` Field passed
  // in silence instead of throwing. Both now run `write-rule.ts`'s one shared `assertFieldTakesWrite`.
  it('refuses a cascade onto a compute Field the same way entries.update() does', () => {
    const context = createContext();
    const computeRegistry = new FieldRegistry({
      fields: [{ key: 'derived', compute: () => 0 }],
    });
    const entry = oneEntry(context);
    const edits: EntryEdits = new Map([[entry.id, { derived: 5 }]]);

    expect(() =>
      toEditsReading(edits, context, () => entry, computeRegistry, identityFieldLockRule, storedParentSource),
    ).toThrow(ComputedFieldCannotBeWrittenError);
  });
});

// #473: a cascade is a caller-side write, so it meets the same lock `entries.update()` meets
// (ADR 0015, "a third door"). Only `'never'` is in question — `'api'` was always admitted.
describe('toEditsReading honours the editable lock (#473, ADR 0015)', () => {
  const lockedRegistry = new FieldRegistry({
    fields: [
      { key: 'start', editable: 'never' },
      { key: 'owner', editable: 'api' },
    ],
  });

  function lockedEntry(context: EntryReadContext): StoredEntry {
    const [entry] = toEntries(
      [{ id: 'e1', name: 'Design', start: '2026-01-01', end: '2026-01-05', props: { owner: 'ana' } }],
      context,
      lockedRegistry,
    );
    return { ...entry!, siblingIndex: 0 };
  }

  it("refuses a cascade onto a 'never' Field, and commits nothing", () => {
    const context = createContext();
    const entry = lockedEntry(context);
    const edits: EntryEdits = new Map([[entry.id, { start: '2026-02-01' }]]);

    expect(() =>
      toEditsReading(edits, context, () => entry, lockedRegistry, identityFieldLockRule, storedParentSource),
    ).toThrow(FieldNotEditableError);
  });

  it("still admits a cascade onto an 'api' Field", () => {
    const context = createContext();
    const entry = lockedEntry(context);
    const edits: EntryEdits = new Map([[entry.id, { owner: 'bo' }]]);

    const reading = toEditsReading(
      edits,
      context,
      () => entry,
      lockedRegistry,
      identityFieldLockRule,
      storedParentSource,
    );

    expect(reading.stored.get(entry.id)?.props?.['owner']).toBe('bo');
  });
});
