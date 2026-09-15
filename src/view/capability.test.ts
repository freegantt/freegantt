import { describe, expect, it } from 'vitest';
import { resolveCapabilities } from './capability.js';
import type { CapabilityInputs, Interactions } from './capability.js';
import { CORE_FIELDS } from '../data/fields/core-fields.js';
import type { Entry, Field, FieldKey } from '../model/index.js';
import type { EntryDoubleValues } from '../layout/entry-double.js';
import { entryDouble, entryDoubles } from '../layout/entry-double.js';
import { entryId } from '../model/index.js';

function entry(overrides: Partial<EntryDoubleValues> = {}): Entry {
  return entryDouble({ id: 'e1', start: 0, end: 1, ...overrides });
}

/** A parent and the rows below it, wired — the parent is first. `hasChildren` and `descendants()`
 *  answer off the row now (ADR 0017), so a test states the tree it means instead of marking a prop
 *  and handing capability resolution a second list beside the row. */
function family(...children: readonly Partial<EntryDoubleValues>[]): readonly Entry[] {
  return entryDoubles([
    { id: 'e1', start: 0, end: 1 },
    ...children.map((child, index) => ({ id: `c${index + 1}`, ...child, parentId: 'e1' })),
  ]);
}

/** A child that holds both dates. A child written without it holds none, and nothing below the
 *  parent is then movable (ADR 0012). */
const DATED = { start: 0, end: 1 } as const;

/** A parent with one ordinary dated child — what most tests here mean by "a roll-up parent". */
function rollUpParent(): Entry {
  return family(DATED)[0]!;
}

/** ADR 0018: the variant this Gantt resolved for the row. The registry answers it in the shipped
 *  path; a test marks the one variant it cares about and reads the mark straight back. */
const markedVariant = (entry: Entry): string => (entry.read('variant') as string | undefined) ?? 'leaf';

/** What one variant's own `can` contributes — the shape `CapabilityInputs.variantInteractionsFor`
 *  takes. Every other row answers "no opinion". */
const variantAllows =
  (variant: string, can: Interactions) =>
  (entry: Entry): Interactions | undefined =>
    markedVariant(entry) === variant ? can : undefined;

/** The shipped declarations, so every default below is checked against the Fields the library really
 *  registers — `start`/`end` roll up and are editable, `duration` computes, `parentId`/`segments`
 *  ship `'api'`. One `override` re-declares a single key, the way `DatasetOptions.fields` does
 *  (#142). */
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

  it('defaults a roll-up parent to move true, resize false, select true (ADR 0013)', () => {
    const caps = capabilities();
    const parent = rollUpParent();
    // The move translates the child below it. The resize stays closed: one edge of a derived
    // envelope names no descendant to resize.
    expect(caps.can('move', parent)).toBe(true);
    expect(caps.can('resize', parent)).toBe(false);
    expect(caps.can('select', parent)).toBe(true);
  });

  it('refuses a parent move when nothing below it holds a date — there is nothing to translate', () => {
    const caps = capabilities();
    const parent = family({ name: 'c1' })[0]!;
    expect(caps.can('move', parent)).toBe(false);
    expect(caps.entriesMovedBy(parent)).toEqual([]);
  });

  it('defaults a childless entry the same as any other — there is no consumer-defined kind to name', () => {
    const caps = capabilities();
    const e = entry({ props: { variant: 'phase' } });
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
    const caps = capabilities({ interactions: { resize: (e) => !e.hasChildren } });
    expect(caps.can('resize', rollUpParent())).toBe(false);
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
    expect(caps.canWrite(entry(), 'nothing-declares-this').ok).toBe(false);
  });

  // ADR 0015: the default is `'anywhere'`, so a declared Field that states no `editable` answers yes.
  it('answers yes for a declared Field that states no editable of its own', () => {
    const caps = capabilities({}, { key: 'owner' });
    expect(caps.canWrite(entry(), 'owner').ok).toBe(true);
  });

  // `parentId` and `segments` ship `'api'`: a column object may show them, and the cell stays dead.
  it('refuses the grid for parentId and segments — the app writes them, the user never types them', () => {
    const caps = capabilities();
    expect(caps.canWrite(entry(), 'parentId')).toEqual({ ok: false });
    expect(caps.canWrite(entry(), 'segments')).toEqual({ ok: false });
  });

  // The middle state: the app writes it through `entries.update()`, the user never types it.
  it("refuses the grid for editable: 'api', which is the whole point of that state", () => {
    const caps = capabilities({}, { key: 'cost', editable: 'api' });
    expect(caps.canWrite(entry(), 'cost')).toEqual({ ok: false });
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
    expect(caps.canWrite(rollUpParent(), 'cost')).toEqual({ ok: true });
  });

  it("refuses a roll-up parent's rolling-up Field, and says why", () => {
    const caps = capabilities();
    const parent = rollUpParent();
    expect(caps.canWrite(parent, 'start')).toEqual({ ok: false, reason: 'derived-value' });
    expect(caps.canWrite(parent, 'end')).toEqual({ ok: false, reason: 'derived-value' });
  });

  it("leaves a roll-up parent's own non-rolling Fields writable (D-S5-19)", () => {
    const caps = capabilities();
    expect(caps.canWrite(rollUpParent(), 'name').ok).toBe(true);
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
    expect(caps.can('move', entry({ props: { variant: 'milestone' } }))).toBe(false);
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

  it('interactions.edit opens a roll-up parent cell it would otherwise refuse', () => {
    const caps = capabilities({ interactions: { edit: true } });
    const parent = family({})[0]!;
    expect(caps.canWrite(parent, 'start').ok).toBe(true);
    // ADR 0013: the parent's own cell is open, and its move still does not write it. What a parent
    // bar's move writes is the subtree below it, and nothing below this one holds a date.
    expect(caps.can('move', parent)).toBe(false);
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
    expect(caps.canWrite(rollUpParent(), 'start')).toEqual({
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

describe("a variant's own `can` (ADR 0018)", () => {
  it('a variant default answers a row the library rule would otherwise resolve', () => {
    const caps = capabilities({ variantInteractionsFor: variantAllows('buffer', { resize: false }) });
    expect(caps.can('resize', entry({ props: { variant: 'buffer' } }))).toBe(false);
    expect(caps.can('move', entry({ props: { variant: 'buffer' } }))).toBe(true);
  });

  it("the consumer's own interactions still wins over a variant default", () => {
    const caps = capabilities({
      interactions: { resize: true },
      variantInteractionsFor: variantAllows('buffer', { resize: false }),
    });
    expect(caps.can('resize', entry({ props: { variant: 'buffer' } }))).toBe(true);
  });

  it('a variant default still loses to the library rule for an unrelated row', () => {
    const caps = capabilities({ variantInteractionsFor: variantAllows('buffer', { resize: false }) });
    expect(caps.can('resize', rollUpParent())).toBe(false);
  });

  it('a row whose variant states nothing falls straight through to the library rule', () => {
    const caps = capabilities({ variantInteractionsFor: () => undefined });
    expect(caps.can('resize', entry())).toBe(true);
  });

  it('a variant edit default closes every cell of that row, and the gestures with it', () => {
    const caps = capabilities({ variantInteractionsFor: variantAllows('buffer', { edit: false }) });
    expect(caps.canWrite(entry({ props: { variant: 'buffer' } }), 'start').ok).toBe(false);
    expect(caps.can('resize', entry({ props: { variant: 'buffer' } }), 'start')).toBe(false);
    expect(caps.canWrite(entry(), 'start').ok).toBe(true);
  });

  it('a variant edit default loses to the consumer\u2019s own interactions.edit', () => {
    const caps = capabilities({
      interactions: { edit: true },
      variantInteractionsFor: variantAllows('buffer', { edit: false }),
    });
    expect(caps.canWrite(entry({ props: { variant: 'buffer' } }), 'start').ok).toBe(true);
  });

  it('a variant edit default opens a Field the library would have refused', () => {
    const caps = capabilities({ variantInteractionsFor: variantAllows('buffer', { edit: true }) }, lockedEnd);
    expect(caps.canWrite(entry({ props: { variant: 'buffer' } }), 'end').ok).toBe(true);
  });

  it('a variant `can` predicate that answers undefined falls through to the library rule', () => {
    const caps = capabilities({
      variantInteractionsFor: variantAllows('buffer', {
        resize: (row) => (row.hasChildren ? false : undefined),
      }),
    });
    // No opinion for a childless row, so the library rule answers, and it says yes.
    expect(caps.can('resize', entry({ props: { variant: 'buffer' } }))).toBe(true);
  });

  it('a variant `can` predicate that answers false refuses, and the library rule never runs', () => {
    const caps = capabilities({
      variantInteractionsFor: variantAllows('buffer', {
        resize: (row) => (row.hasChildren ? undefined : false),
      }),
    });
    expect(caps.can('resize', entry({ props: { variant: 'buffer' } }))).toBe(false);
    // The same predicate answers nothing for a row of another variant.
    expect(caps.can('resize', entry())).toBe(true);
  });
});

describe("entriesMovedBy — what a parent bar's drag writes (ADR 0013, Q9)", () => {
  it('answers an ordinary bar with itself', () => {
    const caps = capabilities();
    const leaf = entry();
    expect(caps.entriesMovedBy(leaf)).toEqual([leaf]);
  });

  it('answers a parent with the dated descendants below it, and never with the parent', () => {
    // `m1` derives its own dates from `g1`, so the walk passes over it and writes the rows that hold
    // their own dates. The tree is what says so — nothing rides beside the row (ADR 0017).
    const [parent, child, middle, grandchild] = entryDoubles([
      { id: 'e1', start: 0, end: 1 },
      { id: 'c1', name: 'c1', parentId: 'e1', start: 0, end: 1 },
      { id: 'm1', name: 'm1', parentId: 'e1' },
      { id: 'g1', name: 'g1', parentId: 'm1', start: 0, end: 1 },
    ]) as readonly [Entry, Entry, Entry, Entry];
    expect(middle.hasChildren).toBe(true);
    const caps = capabilities();
    expect(caps.entriesMovedBy(parent)).toEqual([child, grandchild]);
  });

  it("moves a child that holds only a start — the author's own case", () => {
    // One date and no Segment (ADR 0012): the row shows in the grid and draws no bar.
    const [parent, child] = family({ name: 'c1', start: 0 }) as readonly [Entry, Entry];
    const caps = capabilities();
    expect(caps.entriesMovedBy(parent)).toEqual([child]);
    expect(caps.can('move', parent)).toBe(true);
  });

  it('refuses the whole gesture when one descendant may not be written', () => {
    const caps = capabilities({}, lockedEnd);
    const parent = family({ name: 'c1', ...DATED })[0]!;
    // A parent bar that moved part of its own subtree would land somewhere the drag never showed.
    expect(caps.entriesMovedBy(parent)).toEqual([]);
    expect(caps.can('move', parent)).toBe(false);
  });

  it('still moves a start-only child whose end is locked — it has no end to write', () => {
    const caps = capabilities({}, lockedEnd);
    const [parent, child] = family({ name: 'c1', start: 0 }) as readonly [Entry, Entry];
    expect(caps.entriesMovedBy(parent)).toEqual([child]);
  });
});
