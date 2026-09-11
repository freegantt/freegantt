import { describe, expect, it } from 'vitest';
import { resolveCapabilities } from './capability.js';
import type { CapabilityInputs, Interactions, KindDefaults } from './capability.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import type { Entry, Field, FieldKey, Instant } from '../model/index.js';
import type { EntryLook } from '../layout/index.js';
import { entryId, segmentId } from '../model/index.js';

function entry(overrides: Partial<Entry> = {}): Entry {
  const start = 0 as Instant;
  const end = 1 as Instant;
  return {
    id: entryId('e1'),
    name: 'e1',
    start,
    end,
    segments: [{ id: segmentId('e1-1'), start, end }],
    props: {},
    ...overrides,
  };
}

// ADR 0013: neither structural fact below is a property of `Entry` any more — `GanttShell` normally
// derives `hasChildren` from `dataset.entries.childrenOf` and `lookOf` from `resolveLook`
// (`layout/items/produce-items.ts`). This file has no Dataset to ask, so it marks the one fact each
// test cares about on the Entry's own `props` and reads the mark straight back.
const isMarkedParent = (entry: Entry): boolean => entry.props['isParent'] === true;
const markedLook = (entry: Entry): EntryLook => (entry.props['look'] as EntryLook | undefined) ?? 'leaf';

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
    hasChildren: isMarkedParent,
    lookOf: markedLook,
    fieldFor: fieldsWith(...fieldOverrides),
    ...overrides,
  });
}

const lockedEnd: Partial<Field> = { key: 'end', editable: false };

describe('resolveCapabilities — gestures', () => {
  it('defaults a span entry to move/resize/select all true', () => {
    const caps = capabilities();
    const e = entry();
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(true);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a roll-up parent to move/resize false, select true', () => {
    const caps = capabilities();
    const e = entry({ props: { isParent: true } });
    expect(caps.can('move', e)).toBe(false);
    expect(caps.can('resize', e)).toBe(false);
    expect(caps.can('select', e)).toBe(true);
  });

  it('defaults a childless entry the same as any other — there is no consumer-defined kind to name', () => {
    const caps = capabilities();
    const e = entry({ props: { look: 'phase' } });
    expect(caps.can('move', e)).toBe(true);
    expect(caps.can('resize', e)).toBe(true);
    expect(caps.can('select', e)).toBe(true);
  });

  it('a boolean rule overrides every entry uniformly', () => {
    const caps = capabilities({ interactions: { resize: false } });
    expect(caps.can('resize', entry())).toBe(false);
    expect(caps.can('move', entry())).toBe(true);
  });

  it('a predicate rule is evaluated per entry (U4)', () => {
    const caps = capabilities({ interactions: { resize: (e) => !isMarkedParent(e) } });
    expect(caps.can('resize', entry({ props: { isParent: true } }))).toBe(false);
    expect(caps.can('resize', entry())).toBe(true);
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

  it('refuses an undeclared key', () => {
    const caps = capabilities();
    const e = entry();
    expect(caps.canWrite(e, 'parentId').ok).toBe(false);
    expect(caps.canWrite(e, 'nothing-declares-this').ok).toBe(false);
  });

  it('refuses a compute-sourced Field and an undeclared key — neither has a stored home', () => {
    const caps = capabilities();
    expect(caps.canWrite(entry(), 'duration').ok).toBe(false);
    expect(caps.canWrite(entry(), 'nothing-declares-this').ok).toBe(false);
  });

  // Structure, not policy: `interactions: { edit: true }` reads like "turn editing on", and it used
  // to open the Duration cell — the editor took a typed value and the write went nowhere.
  it('lets no rule at all open a cell with nowhere to write', () => {
    for (const inputs of [
      { interactions: { edit: true } },
      { registeredDefaultsFor: () => ({ edit: true }) },
      { interactions: { edit: () => true } },
    ]) {
      const caps = capabilities(inputs);
      expect(caps.canWrite(entry(), 'duration').ok).toBe(false);
      expect(caps.canWrite(entry(), 'nothing-declares-this').ok).toBe(false);
    }
  });

  // #256 review A1: `rollUp: 'none'` is a declared opt-out, so the Rollup pass skips the Field and
  // `canWrite` must skip it too. Two spellings of that test disagreed, and this cell claimed its
  // value came from the rows below it while nothing rolled it up.
  it("treats rollUp: 'none' as not rolling up, the same way the Rollup pass does", () => {
    const caps = capabilities({}, { key: 'cost', rollUp: 'none', editable: true });
    expect(caps.canWrite(entry({ props: { isParent: true } }), 'cost')).toEqual({ ok: true });
  });

  it("refuses a roll-up parent's rolling-up Field, and says why", () => {
    const caps = capabilities();
    const parent = entry({ props: { isParent: true } });
    expect(caps.canWrite(parent, 'start')).toEqual({ ok: false, reason: 'derived-value' });
    expect(caps.canWrite(parent, 'end')).toEqual({ ok: false, reason: 'derived-value' });
  });

  it("leaves a roll-up parent's own non-rolling Fields writable (D-S5-19)", () => {
    const caps = capabilities();
    expect(caps.canWrite(entry({ props: { isParent: true } }), 'name').ok).toBe(true);
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
    expect(caps.can('move', entry({ props: { look: 'milestone' } }))).toBe(false);
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
    const caps = capabilities({ interactions: { edit: true } });
    const parent = entry({ props: { isParent: true } });
    expect(caps.canWrite(parent, 'start').ok).toBe(true);
    expect(caps.can('move', parent)).toBe(true);
  });
});

describe('interactions.edit answers the cell, not the entry (#256)', () => {
  it('answers undefined for a cell it has no opinion about, and the library rules decide it', () => {
    const caps = capabilities(
      { interactions: { edit: (_entry, field) => (field === 'name' ? false : undefined) } },
      lockedEnd,
    );
    // The rule speaks for `name` and for nothing else, so every other cell keeps the answer it had.
    expect(caps.canWrite(entry(), 'name').ok).toBe(false);
    expect(caps.canWrite(entry(), 'start').ok).toBe(true);
    expect(caps.canWrite(entry(), 'end').ok).toBe(false);
    expect(caps.canWrite(entry({ props: { isParent: true } }), 'start')).toEqual({
      ok: false,
      reason: 'derived-value',
    });
  });

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
    // The exact shape `harness/main.ts` writes: name the one cell, say nothing about the rest.
    const caps = capabilities({
      interactions: { edit: (e, field) => (e.id === locked && field === 'end' ? false : undefined) },
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

describe('registered look defaults (S5.9, D-S5-22, ADR 0013)', () => {
  const registerFor = (look: EntryLook, defaults: KindDefaults) => (asked: EntryLook) =>
    asked === look ? defaults : undefined;

  it('a registered default answers a look the library rule would otherwise resolve', () => {
    const caps = capabilities({ registeredDefaultsFor: registerFor('buffer', { resize: false }) });
    expect(caps.can('resize', entry({ props: { look: 'buffer' } }))).toBe(false);
    expect(caps.can('move', entry({ props: { look: 'buffer' } }))).toBe(true);
  });

  it("the consumer's own interactions still wins over a registered default", () => {
    const caps = capabilities({
      interactions: { resize: true },
      registeredDefaultsFor: registerFor('buffer', { resize: false }),
    });
    expect(caps.can('resize', entry({ props: { look: 'buffer' } }))).toBe(true);
  });

  it('a registered default still loses to the library rule for an unrelated look', () => {
    const caps = capabilities({ registeredDefaultsFor: registerFor('buffer', { resize: false }) });
    expect(caps.can('resize', entry({ props: { isParent: true } }))).toBe(false);
  });

  it('an unregistered look falls straight through to the library rule', () => {
    const caps = capabilities({ registeredDefaultsFor: () => undefined });
    expect(caps.can('resize', entry())).toBe(true);
  });

  it('a registered edit default closes every cell of that look, and the gestures with it', () => {
    const caps = capabilities({ registeredDefaultsFor: registerFor('buffer', { edit: false }) });
    expect(caps.canWrite(entry({ props: { look: 'buffer' } }), 'start').ok).toBe(false);
    expect(caps.can('resize', entry({ props: { look: 'buffer' } }), 'start')).toBe(false);
    expect(caps.canWrite(entry(), 'start').ok).toBe(true);
  });

  it('a registered edit default loses to the consumer’s own interactions.edit', () => {
    const caps = capabilities({
      interactions: { edit: true },
      registeredDefaultsFor: registerFor('buffer', { edit: false }),
    });
    expect(caps.canWrite(entry({ props: { look: 'buffer' } }), 'start').ok).toBe(true);
  });

  it('a registered edit default opens a Field the library would have refused', () => {
    const caps = capabilities({ registeredDefaultsFor: registerFor('buffer', { edit: true }) }, lockedEnd);
    expect(caps.canWrite(entry({ props: { look: 'buffer' } }), 'end').ok).toBe(true);
  });
});
