import { describe, expect, it } from 'vitest';
import { createEditRequest } from './edit-request.js';
import { storedParentSource } from './hierarchy-source.js';
import { identityFieldLockRule, resolveWriteTarget } from './write-rule.js';
import { entryId } from '../model/index.js';
import type {
  Field,
  FieldLockRule,
  Instant,
  ProposedEdit,
  ProposedEdits,
  StoredEntry,
} from '../model/index.js';

/** No Field lookup is under test here — every request below asks nothing that reads one. */
const noFields = { get: () => undefined };

function entry(id: string, start: number, end: number, parentId?: string): StoredEntry {
  return {
    id: entryId(id),
    siblingIndex: 0,
    name: id,
    start: start as Instant,
    end: end as Instant,
    props: {},
    ...(parentId === undefined ? {} : { parentId: entryId(parentId) }),
  };
}

/** `Depot` with one child `Van 1`, plus the unrelated leaf `Crate A`. */
function depotTree(): ReadonlyMap<ReturnType<typeof entryId>, StoredEntry> {
  return new Map([
    [entryId('depot'), entry('depot', 0, 100)],
    [entryId('van-1'), entry('van-1', 0, 100, 'depot')],
    [entryId('crate-a'), entry('crate-a', 0, 100)],
  ]);
}

function lookupOf(...fields: readonly Field[]): { get: (key: string) => Field | undefined } {
  const byKey = new Map(fields.map((field) => [field.key, field] as const));
  return { get: (key) => byKey.get(key) };
}

function requestOver(
  entries: ReadonlyMap<ReturnType<typeof entryId>, StoredEntry>,
  fields: { get: (key: string) => Field | undefined },
  over: {
    added?: readonly StoredEntry[];
    removed?: readonly StoredEntry[];
    proposed?: ProposedEdits;
  } = {},
): ReturnType<typeof createEditRequest> {
  return createEditRequest({
    entries,
    proposed: over.proposed ?? (new Map() as ProposedEdits),
    added: over.added ?? [],
    removed: over.removed ?? [],
    hierarchySource: storedParentSource,
    committedChildIds: new Map([[entryId('depot'), [entryId('van-1')]]]),
    fields,
    lockRule: identityFieldLockRule,
  });
}

const cost: Field = { key: 'cost', rollUp: 'sum' };
const note: Field = { key: 'note' };

function proposedEdit(patch: Record<string, unknown>): ProposedEdit {
  return { __brand: 'ProposedEdit', props: {}, proposedKeys: new Set(Object.keys(patch)), ...patch };
}

describe('createEditRequest', () => {
  it('answers entryAfterEdits with one .get, never a walk of the committed entries (D-S5-45)', () => {
    // D-S5-45: a hook reads `entryAfterEdits` on every preview frame to see this transaction's own
    // body edit — that read must cost one lookup, not a copy or a walk of the roster, whether or not
    // this row has a proposed edit at all (`gesture-pipeline.test.ts` pins the other half of this
    // idea: wiring a hook at all must not force a roster copy).
    const roster = new Map([[entryId('a'), entry('a', 0, 100)]]);
    let walks = 0;
    const walk = roster[Symbol.iterator].bind(roster);
    roster[Symbol.iterator] = () => {
      walks += 1;
      return walk();
    };

    const proposed: ProposedEdits = new Map([[entryId('a'), proposedEdit({ start: 10 })]]);
    const request = createEditRequest({
      entries: roster,
      proposed,
      added: [],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map(),
      fields: noFields,
      lockRule: identityFieldLockRule,
    });

    const seen = request.entryAfterEdits(entryId('a'));

    expect(walks).toBe(0);
    expect(seen?.start).toBe(10);
  });

  it('answers entryAfterEdits for a row with no proposed edit at the same one-lookup cost', () => {
    const roster = new Map([[entryId('a'), entry('a', 0, 100)]]);
    let walks = 0;
    const walk = roster[Symbol.iterator].bind(roster);
    roster[Symbol.iterator] = () => {
      walks += 1;
      return walk();
    };

    const request = createEditRequest({
      entries: roster,
      proposed: new Map() as ProposedEdits,
      added: [],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map(),
      fields: noFields,
      lockRule: identityFieldLockRule,
    });

    const seen = request.entryAfterEdits(entryId('a'));

    expect(walks).toBe(0);
    expect(seen?.start).toBe(0);
  });

  it('sees a row added in this same transaction become a parent (hasChildren)', () => {
    // The committed index says `Crate A` is a leaf. This transaction hangs a row under it, so the
    // answer an extender reads must be the effective one, not the committed one.
    const request = requestOver(depotTree(), noFields, {
      added: [entry('crate-a-lid', 0, 100, 'crate-a')],
    });

    expect(request.hasChildren('crate-a')).toBe(true);
  });

  it('sees a parent lose its last child in this same transaction (hasChildren)', () => {
    const entries = depotTree();
    const request = requestOver(entries, noFields, {
      removed: [entries.get(entryId('van-1'))!],
    });

    expect(request.hasChildren('depot')).toBe(false);
  });
});

describe('createEditRequest writeTarget', () => {
  it('refuses a rolling-up Field on a row with children, and lands it on a leaf', () => {
    const request = requestOver(depotTree(), lookupOf(cost));

    expect(request.writeTarget('depot', 'cost')).toBe('refused');
    expect(request.writeTarget('van-1', 'cost')).toBe('entry');
  });

  it('lands a Field that does not roll up on the entry, children or not', () => {
    const request = requestOver(depotTree(), lookupOf(note));

    expect(request.writeTarget('depot', 'note')).toBe('entry');
    expect(request.writeTarget('van-1', 'note')).toBe('entry');
  });

  it('reads the tree this transaction leaves behind, not the committed one', () => {
    // `Crate A` is a committed leaf, so `cost` would land on it. Hanging a row under it inside this
    // same transaction makes it derive, and the refusal follows the structure (ADR 0013).
    const request = requestOver(depotTree(), lookupOf(cost), {
      added: [entry('crate-a-lid', 0, 100, 'crate-a')],
    });

    expect(request.writeTarget('crate-a', 'cost')).toBe('refused');
  });

  it('hands back the resolver\u2019s own answer for an undeclared key, never one of its own (#466)', () => {
    // An undeclared key is carried and opaque, so it owns no parent's cell and a write lands on the
    // entry. That rule is `resolveWriteTarget`'s, and this reader must not restate it — three
    // readers of one resolver, one answer (I14). Asserting against the resolver, not against the
    // literal `'entry'`, is what makes this test fail if a reader grows a fourth rule.
    const request = requestOver(depotTree(), noFields);

    expect(request.writeTarget('depot', 'nobodyDeclaredThis')).toBe(resolveWriteTarget(true, undefined));
    expect(request.writeTarget('van-1', 'nobodyDeclaredThis')).toBe(resolveWriteTarget(false, undefined));
    expect(request.writeTarget('depot', 'nobodyDeclaredThis')).toBe('entry');
  });
});

describe('createEditRequest editableOf (#473)', () => {
  /** Opens `cost` on `van-1` only — the same shape a plugin composes onto `identityFieldLockRule`. */
  const vanOnly: FieldLockRule = (query, field) =>
    query.id === entryId('van-1') && field === 'cost' ? 'anywhere' : undefined;

  it("answers a plugin's own per-entry lock over the Field's own editable", () => {
    const request = createEditRequest({
      entries: depotTree(),
      proposed: new Map() as ProposedEdits,
      added: [],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map([[entryId('depot'), [entryId('van-1')]]]),
      fields: lookupOf({ key: 'cost', editable: false }),
      lockRule: vanOnly,
    });

    expect(request.editableOf('van-1', 'cost')).toBe('anywhere');
    expect(request.editableOf('crate-a', 'cost')).toBe('never');
  });

  it('answers for an entry this same transaction adds, not only a committed one', () => {
    const added = entry('van-2', 0, 100, 'depot');
    const request = createEditRequest({
      entries: depotTree(),
      proposed: new Map() as ProposedEdits,
      added: [added],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map([[entryId('depot'), [entryId('van-1')]]]),
      fields: lookupOf({ key: 'cost', editable: false }),
      lockRule: ((query, field) =>
        query.id === entryId('van-2') && field === 'cost' ? 'anywhere' : undefined) satisfies FieldLockRule,
    });

    expect(request.editableOf('van-2', 'cost')).toBe('anywhere');
  });

  // #473's ocr finding: a compute Field owns no stored home, so `entries.update()` refuses it before
  // the lock ever runs (`ComputedFieldCannotBeWrittenError`) — `editableOf` must answer `'never'` too,
  // even when a lock rule would open every cell.
  it('answers never for a compute Field, even under a lock rule that opens everything', () => {
    const opensEverything: FieldLockRule = () => 'anywhere';
    const request = createEditRequest({
      entries: depotTree(),
      proposed: new Map() as ProposedEdits,
      added: [],
      removed: [],
      hierarchySource: storedParentSource,
      committedChildIds: new Map([[entryId('depot'), [entryId('van-1')]]]),
      fields: lookupOf({ key: 'derived', compute: () => 0 }),
      lockRule: opensEverything,
    });

    expect(request.editableOf('van-1', 'derived')).toBe('never');
  });
});
