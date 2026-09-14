// layout/ — the live `Entry` a layout test builds by hand (ADR 0017).
//
// **Test-only. No library file imports this one.**
//
// What question does it answer? `layout/` may not import `data/` (`.dependency-cruiser.cjs`,
// `layout-boundary`), so a layout test cannot call the real factory, and `model/` holds no runtime
// to give it one (`plans/01` §1.1). This file answers both at once: stored values plus a child list,
// closed over and handed back as an `Entry`.
//
// It also proves the seam by construction. `layout/` satisfies the whole interface out of `model/`
// and `time/` alone, so `layout/` never needed `data/` and the boundary rule stays untouched.
//
// **`duration()` here states the `'span'` measure, and only that one** (`F25`). The real answer is
// `measureEntryDuration`, which lives in `data/` and reads the Dataset's own `measureDuration`, so
// this double cannot call it. A green layout test therefore says nothing about a `'segments'`
// Dataset: a rule like `when: (entry) => entry.duration()?.value === 0` is exercised under one
// policy of the two.

import { entryId, segmentId } from '../model/index.js';
import type {
  Duration,
  Entry,
  EntryId,
  EntryInput,
  FieldKey,
  FieldValue,
  Instant,
  Segment,
} from '../model/index.js';
import { diffMs } from '../time/index.js';

/**
 * The stored values one double stands for. Ids are plain strings, so a test writes `'p'` and never
 * `entryId('p')`, and dates are plain numbers, the same loose input every other way in takes.
 */
export interface EntryDoubleValues {
  id: string;
  name?: string;
  parentId?: string;
  start?: number;
  end?: number;
  /** Defaults to one Segment covering `start`–`end`, which is what a stored row holds (#212). */
  segments?: readonly Segment[];
  props?: Readonly<Record<string, unknown>>;
}

/** What one double asks the set it belongs to. The set wires it; the row reads it. */
interface DoubleTree {
  childrenOf(id: EntryId): readonly Entry[];
  parentOf(id: EntryId): Entry | undefined;
}

const NO_ROWS: readonly Entry[] = Object.freeze([]);

/**
 * One row, as a layout test states it. Every question answers off the values it closed over and the
 * tree the set wired, so `hasChildren`, `parent()` and `depth` read the same shape a live row does.
 */
class EntryDouble implements Entry {
  readonly #tree: DoubleTree;
  readonly #values: EntryDoubleValues;
  readonly id: EntryId;
  readonly name: string;
  readonly start: Instant | undefined;
  readonly end: Instant | undefined;
  readonly segments: readonly Segment[];

  constructor(values: EntryDoubleValues, tree: DoubleTree) {
    this.#tree = tree;
    this.#values = values;
    this.id = entryId(values.id);
    this.name = values.name ?? values.id;
    this.start = values.start as Instant | undefined;
    this.end = values.end as Instant | undefined;
    this.segments = values.segments ?? defaultSegments(values);
  }

  get hasChildren(): boolean {
    return this.#tree.childrenOf(this.id).length > 0;
  }

  get depth(): number {
    let above = this.parent();
    let found = 0;
    while (above !== undefined) {
      found += 1;
      above = above.parent();
    }
    return found;
  }

  read<K extends FieldKey>(field: K): FieldValue<Record<string, unknown>, K> | undefined {
    const answer = this.#answer(field);
    return answer as FieldValue<Record<string, unknown>, K> | undefined;
  }

  #answer(field: FieldKey): unknown {
    // `read(key)` answers the stored value (ADR 0024); the tree has its own key, `hierarchyParentId`,
    // and its own method, `parent()`.
    if (field === 'parentId') {
      return this.#values.parentId === undefined ? undefined : entryId(this.#values.parentId);
    }
    if (field === 'hierarchyParentId') return this.parent()?.id;
    if (field === 'duration') return this.duration();
    if (field === 'id') return this.id;
    if (field === 'name') return this.name;
    if (field === 'start') return this.start;
    if (field === 'end') return this.end;
    if (field === 'segments') return this.segments;
    return this.#values.props?.[String(field)];
  }

  duration(): Duration | undefined {
    if (this.start === undefined || this.end === undefined) return undefined;
    return { value: diffMs(this.end, this.start), unit: 'millisecond' };
  }

  children(): readonly Entry[] {
    return this.#tree.childrenOf(this.id);
  }

  parent(): Entry | undefined {
    return this.#tree.parentOf(this.id);
  }

  /** A worklist, never recursion — the same shape the live row walks with. */
  descendants(): readonly Entry[] {
    const found: Entry[] = [];
    const pending: EntryId[] = [this.id];
    while (pending.length > 0) {
      for (const child of this.#tree.childrenOf(pending.pop()!)) {
        found.push(child);
        pending.push(child.id);
      }
    }
    return found;
  }

  /** The same platform hook the live row answers: a serialized row is its stored values. */
  toJSON(): EntryInput {
    return this.toInput();
  }

  toInput(): EntryInput {
    const values = this.#values;
    return {
      id: this.id,
      name: this.name,
      ...(values.parentId !== undefined ? { parentId: entryId(values.parentId) } : {}),
      ...(this.start !== undefined ? { start: this.start } : {}),
      ...(this.end !== undefined ? { end: this.end } : {}),
      segments: this.segments,
      props: { ...values.props },
    };
  }
}

function defaultSegments(values: EntryDoubleValues): readonly Segment[] {
  if (values.start === undefined || values.end === undefined) return [];
  return [
    {
      id: segmentId(`${values.id}-1`),
      start: values.start as Instant,
      end: values.end as Instant,
    },
  ];
}

/**
 * A wired set of rows: `entryDoubles([{ id: 'p' }, { id: 'c', parentId: 'p' }])`. Each row answers
 * `parent()`, `children()`, `hasChildren`, `depth` and `descendants()` about the others, in the
 * order they were written.
 */
export function entryDoubles(rows: readonly EntryDoubleValues[]): readonly Entry[] {
  const byId = new Map<EntryId, Entry>();
  const byParent = new Map<EntryId, Entry[]>();
  const parentIdOf = new Map<EntryId, EntryId>();
  const tree: DoubleTree = {
    childrenOf: (id) => byParent.get(id) ?? NO_ROWS,
    parentOf: (id) => {
      const parentId = parentIdOf.get(id);
      return parentId === undefined ? undefined : byId.get(parentId);
    },
  };
  const made = rows.map((values) => new EntryDouble(values, tree));
  for (const [index, row] of made.entries()) {
    byId.set(row.id, row);
    const parentId = rows[index]?.parentId;
    if (parentId === undefined) continue;
    parentIdOf.set(row.id, entryId(parentId));
    const siblings = byParent.get(entryId(parentId));
    if (siblings === undefined) byParent.set(entryId(parentId), [row]);
    else siblings.push(row);
  }
  return made;
}

/**
 * The values behind a row a fixture already built, so a test can restate one with a change:
 * `entryValuesOf(sampleEntries[0]!, { end: 0 })`.
 *
 * **A test never spreads a live `Entry`.** A spread copies own enumerable properties only, so it
 * drops every getter and every method and leaves an object that still typechecks (ADR 0017, finding
 * P2). This is what a test reaches for instead.
 */
export function entryValuesOf(base: Entry, overrides: Partial<EntryDoubleValues> = {}): EntryDoubleValues {
  const above = base.parent();
  return {
    id: String(base.id),
    name: base.name,
    ...(base.start !== undefined ? { start: base.start } : {}),
    ...(base.end !== undefined ? { end: base.end } : {}),
    ...(above !== undefined ? { parentId: String(above.id) } : {}),
    segments: base.segments,
    props: { ...base.toInput().props },
    ...overrides,
  };
}

/** The same row with a change, and no relatives: `entryDoubleLike(sampleEntries[0]!, { end: 0 })`. */
export function entryDoubleLike(base: Entry, overrides: Partial<EntryDoubleValues> = {}): Entry {
  return entryDouble(entryValuesOf(base, overrides));
}

/** One row with no relatives: `entryDouble({ id: 't1', start: 0, end: 10 })`. */
export function entryDouble(values: EntryDoubleValues): Entry {
  return entryDoubles([values])[0]!;
}

/** The `ReadonlyMap<EntryId, Entry>` every frame-shaped layout call takes. */
export function entryDoublesById(rows: readonly Entry[]): ReadonlyMap<EntryId, Entry> {
  return new Map(rows.map((row) => [row.id, row]));
}
