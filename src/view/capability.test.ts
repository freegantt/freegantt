import { describe, expect, it } from 'vitest';
import { resolveCapabilities } from './capability.js';
import type { CapabilityInputs, Interactions, KindDefaults } from './capability.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import type { Entry, EntryKind, Field, FieldKey } from '../model/index.js';
import { entryId, segmentId } from '../model/index.js';

function entry(overrides: Partial<Entry> = {}): Entry {
  const start = 0 as Entry['start'];
  const end = 1 as Entry['end'];
  return {
    id: entryId('e1'),
    kind: 'span',
    name: 'e1',
    start,
    end,
    segments: [{ id: segmentId('e1-1'), start, end }],
    ...overrides,
  };
}

const isGroup = (kind: string): boolean => kind === 'group';
const isNeverDerived = (): boolean => false;

/** The shipped declarations, so every default below is checked against the Fields the library really
 *  registers — `start`/`end` roll up and are editable, `duration` computes, `kind` is neither. One
 *  `override` re-declares a single key, the way `DatasetOptions.fields` does (#142). */
function fieldsWith(...overrides: readonly Partial<Field>[]): (key: FieldKey) => Field | undefined {
  const byKey = new Map<FieldKey, Field>(CORE_FIELDS.map((field) => [field.key, field]));
  for (const override of overrides) {
    const core = byKey.get(override.key as FieldKey);
    byKey.set(override.key as FieldKey, { ...core, ...override } as Field);
  }
  return (key) => byKey.get(key);
}

function capabilities(
  overrides: Partial<CapabilityInputs> = {},
  ...fieldOverrides: readonly Partial<Field>[]
): ReturnType<typeof resolveCapabilities> {
  return resolveCapabilities({
    isRollUpKind: isNeverDerived,
    fieldFor: fieldsWith(...fieldOverrides),
    ...overrides,
  });
}

const lockedEnd: Partial<Field> = { key: 'end', editable: false };

describe('resolveCapabilities — gestures', () => {
  it('defaults a span entry to move/resize/select all true', () => {
    const caps = capabilities();
    const e = entry({ kind: 'span' });
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(true);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a milestone to move/select true, resize false — it has no edge to drag', () => {
    const caps = capabilities();
    const e = entry({ kind: 'milestone' });
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(false);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a rollUpKinds kind to move/resize false, select true', () => {
    const caps = capabilities({ isRollUpKind: isGroup });
    const e = entry({ kind: 'group' });
    expect(caps.can('move', e)).toBe(false);
    expect(caps.can('resize', e)).toBe(false);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a consumer-defined kind the same as span', () => {
    const caps = capabilities({ isRollUpKind: isGroup });
    const e = entry({ kind: 'phase' });
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(true);
    expect(caps.can('select', e)).toBe(true);
  });

  it('a boolean rule overrides every kind uniformly', () => {
    const caps = capabilities({ interactions: { resize: false } });
    expect(caps.can('resize', entry({ kind: 'span' }))).toBe(false);
    expect(caps.can('move', entry({ kind: 'span' }))).toBe(true);
  });

  it('a predicate rule is evaluated per entry (U4)', () => {
    const caps = capabilities({ interactions: { resize: (e) => e.kind !== 'group' } });
    expect(caps.can('resize', entry({ kind: 'group' }))).toBe(false);
    expect(caps.can('resize', entry({ kind: 'span' }))).toBe(true);
  });

  it('re-resolves live: a fresh call with new interactions sees the new rule', () => {
    let caps = capabilities();
    expect(caps.can('select', entry())).toBe(true);
    caps = capabilities({ interactions: { select: false } });
    expect(caps.can('select', entry())).toBe(false);
  });

  it('select never asks whether anything is writable — it writes nothing', () => {
    let asked = 0;
    const caps = capabilities({
      fieldFor: (key) => {
        asked += 1;
        return fieldsWith()(key);
      },
    });
    expect(caps.can('select', entry())).toBe(true);
    expect(asked).toBe(0);
  });
});

describe('resolveCapabilities — canWrite is the one answer (#256)', () => {
  it("answers a span's own stored Fields from the Field's own editable key", () => {
    const caps = capabilities();
    const e = entry();
    expect(caps.canWrite(e, 'name').ok).toBe(true);
    expect(caps.canWrite(e, 'start').ok).toBe(true);
    expect(caps.canWrite(e, 'end').ok).toBe(true);
  });

  it('refuses a Field that never declared itself editable, and an undeclared key', () => {
    const caps = capabilities();
    const e = entry();
    expect(caps.canWrite(e, 'kind').ok).toBe(false);
    expect(caps.canWrite(e, 'parentId').ok).toBe(false);
    expect(caps.canWrite(e, 'nothing-declares-this').ok).toBe(false);
  });

  it('refuses a compute-sourced Field with no editable key of its own — it has no stored home', () => {
    const caps = capabilities();
    expect(caps.canWrite(entry(), 'duration').ok).toBe(false);
  });

  it("refuses a roll-up parent's rolling-up Field, and says why", () => {
    const caps = capabilities({ isRollUpKind: isGroup });
    const parent = entry({ kind: 'group' });
    expect(caps.canWrite(parent, 'start')).toEqual({ ok: false, reason: 'derived-value' });
    expect(caps.canWrite(parent, 'end')).toEqual({ ok: false, reason: 'derived-value' });
  });

  it("leaves a roll-up parent's own non-rolling Fields writable (D-S5-19)", () => {
    const caps = capabilities({ isRollUpKind: isGroup });
    expect(caps.canWrite(entry({ kind: 'group' }), 'name').ok).toBe(true);
  });

  it('a refusal with no reason is one the UI already shows, so it carries no words', () => {
    const caps = capabilities({}, lockedEnd);
    expect(caps.canWrite(entry(), 'end')).toEqual({ ok: false });
  });
});

describe('a locked Field closes every gesture that writes it (#256)', () => {
  it('closes the end handle and leaves the start handle open', () => {
    const caps = capabilities({}, lockedEnd);
    const e = entry();
    expect(caps.can('resize', e, 'start')).toBe(true);
    expect(caps.can('resize', e, 'end')).toBe(false);
  });

  it('closes the bar move too, because a move writes both dates', () => {
    const caps = capabilities({}, lockedEnd);
    expect(caps.can('move', entry())).toBe(false);
    expect(caps.can('move', entry({ kind: 'milestone' }))).toBe(false);
  });

  it('asked with no edge, resize answers whether either handle may resize', () => {
    const caps = capabilities({}, lockedEnd);
    expect(caps.can('resize', entry())).toBe(true);
    const bothLocked = capabilities({}, lockedEnd, { key: 'start', editable: false });
    expect(bothLocked.can('resize', entry())).toBe(false);
  });

  it('an explicit interactions.resize offers the handle and still cannot write the locked Field', () => {
    const caps = capabilities({ interactions: { resize: true } }, lockedEnd);
    expect(caps.can('resize', entry(), 'end')).toBe(false);
    expect(caps.can('resize', entry(), 'start')).toBe(true);
  });

  it('interactions.edit is the one override that opens a locked Field', () => {
    const caps = capabilities({ interactions: { edit: true } }, lockedEnd);
    expect(caps.canWrite(entry(), 'end').ok).toBe(true);
    expect(caps.can('resize', entry(), 'end')).toBe(true);
    expect(caps.can('move', entry())).toBe(true);
  });

  it('interactions.edit opens a roll-up parent it would otherwise refuse', () => {
    const caps = capabilities({ interactions: { edit: true }, isRollUpKind: isGroup });
    const parent = entry({ kind: 'group' });
    expect(caps.canWrite(parent, 'start').ok).toBe(true);
    expect(caps.can('move', parent)).toBe(true);
  });
});

describe('interactions.edit answers the cell, not the entry (#256)', () => {
  it('a predicate sees both the entry and the field', () => {
    const seen: Array<[string, FieldKey]> = [];
    const edit: Interactions['edit'] = (e, field) => {
      seen.push([String(e.id), field]);
      return field !== 'end';
    };
    const caps = capabilities({ interactions: { edit } });
    const e = entry();
    expect(caps.canWrite(e, 'start').ok).toBe(true);
    expect(caps.canWrite(e, 'end').ok).toBe(false);
    expect(seen).toEqual([
      ['e1', 'start'],
      ['e1', 'end'],
    ]);
  });

  it('locks one Entry’s end and leaves every other Entry alone — the harness lock #256 asked for', () => {
    const locked = entryId('locked');
    const caps = capabilities({
      interactions: { edit: (e, field) => !(e.id === locked && field === 'end') },
    });
    expect(caps.can('resize', entry({ id: locked }), 'end')).toBe(false);
    expect(caps.can('resize', entry({ id: locked }), 'start')).toBe(true);
    expect(caps.can('resize', entry({ id: entryId('free') }), 'end')).toBe(true);
  });

  it('a boolean false closes every cell, and closes move and resize with them', () => {
    const caps = capabilities({ interactions: { edit: false } });
    expect(caps.canWrite(entry(), 'name').ok).toBe(false);
    expect(caps.can('move', entry())).toBe(false);
    expect(caps.can('resize', entry(), 'start')).toBe(false);
    expect(caps.can('select', entry())).toBe(true);
  });
});

describe('registered kind defaults (S5.9, D-S5-22)', () => {
  const registerFor = (kind: EntryKind, defaults: KindDefaults) => (asked: EntryKind) =>
    asked === kind ? defaults : undefined;

  it('a registered default answers a kind the library rule would otherwise resolve', () => {
    const caps = capabilities({ registeredDefaultsFor: registerFor('buffer', { resize: false }) });
    expect(caps.can('resize', entry({ kind: 'buffer' }))).toBe(false);
    expect(caps.can('move', entry({ kind: 'buffer' }))).toBe(true);
  });

  it("the consumer's own interactions still wins over a registered default", () => {
    const caps = capabilities({
      interactions: { resize: true },
      registeredDefaultsFor: registerFor('buffer', { resize: false }),
    });
    expect(caps.can('resize', entry({ kind: 'buffer' }))).toBe(true);
  });

  it('a registered default still loses to the library rule for an unrelated kind', () => {
    const caps = capabilities({
      isRollUpKind: isGroup,
      registeredDefaultsFor: registerFor('buffer', { resize: false }),
    });
    expect(caps.can('resize', entry({ kind: 'group' }))).toBe(false);
  });

  it('an unregistered kind falls straight through to the library rule', () => {
    const caps = capabilities({ registeredDefaultsFor: () => undefined });
    expect(caps.can('resize', entry({ kind: 'span' }))).toBe(true);
  });

  it('a registered edit default closes every cell of that kind, and the gestures with it', () => {
    const caps = capabilities({ registeredDefaultsFor: registerFor('buffer', { edit: false }) });
    expect(caps.canWrite(entry({ kind: 'buffer' }), 'start').ok).toBe(false);
    expect(caps.can('resize', entry({ kind: 'buffer' }), 'start')).toBe(false);
    expect(caps.canWrite(entry({ kind: 'span' }), 'start').ok).toBe(true);
  });

  it('a registered edit default loses to the consumer’s own interactions.edit', () => {
    const caps = capabilities({
      interactions: { edit: true },
      registeredDefaultsFor: registerFor('buffer', { edit: false }),
    });
    expect(caps.canWrite(entry({ kind: 'buffer' }), 'start').ok).toBe(true);
  });

  it('a registered edit default opens a Field the library would have refused', () => {
    const caps = capabilities({ registeredDefaultsFor: registerFor('buffer', { edit: true }) }, lockedEnd);
    expect(caps.canWrite(entry({ kind: 'buffer' }), 'end').ok).toBe(true);
  });
});
