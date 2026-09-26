// data/ — the live `Entry` (ADR 0017). `model/` declares the interface, `data/` builds it, and
// `layout/` names the type and never this file, so the import graph stays `layout/ → model/`.
//
// One `Entry` per id, held in `LiveEntries` below. Every read is live: it goes back to the store on
// each call, so a row read inside an open transaction answers the committed index overlaid with the
// write set — what `childrenOf` answered before this ADR. The object allocates nothing per frame,
// which is what lets a hover or a drag hold it in a `Set` across frames.

import type {
  Duration,
  Entry,
  EntryId,
  EntryInput,
  FieldKey,
  FieldValue,
  Instant,
  StoredEntry,
} from '../model/index.js';
import { UnknownFieldError } from '../model/index.js';
import { leavesOf } from './fields/field-access.js';

/**
 * What a live row asks its store. The store implements it; a `LiveEntry` holds an id and this, so
 * one row costs one small object however many times it is read.
 */
export interface EntrySource {
  /** The row as this transaction leaves it, or `undefined` once it is removed. */
  storedEntry(id: EntryId): StoredEntry | undefined;
  storedChildrenOf(id: EntryId): readonly StoredEntry[];
  /** Which Entry the hierarchy source names as the parent of this row (ADR 0020). The store checks
   *  the answer; this row only asks. */
  parentIdOf(entry: StoredEntry): EntryId | undefined;
  hasChildren(id: EntryId): boolean;
  depthOf(id: EntryId): number;
  /** The one `Entry` this store holds for `id` — how `children()` and `parent()` hand back rows. */
  entryFor(id: EntryId): Entry;
  /** `key` on this row, through the Field registry. Throws `UnknownFieldError` on an undeclared key. */
  readField(entry: StoredEntry, key: FieldKey): unknown;
  durationOf(entry: StoredEntry): Duration | undefined;
}

/**
 * One row, as it stands now.
 *
 * **An `Entry` for a removed id keeps its last values** (ADR 0017). It reads the store first and
 * falls back to the last row it saw, so a gesture holding a row across a removal reads a sane name
 * rather than a hole. Existence has one door, and it is `entries.has(id)`.
 */
class LiveEntry implements Entry {
  readonly #source: EntrySource;
  readonly id: EntryId;
  /** The last row the store answered with. Seeded at construction; refreshed on every read. */
  #last: StoredEntry | undefined;

  constructor(source: EntrySource, id: EntryId) {
    this.#source = source;
    this.id = id;
    this.#last = source.storedEntry(id);
  }

  #stored(): StoredEntry | undefined {
    const current = this.#source.storedEntry(this.id);
    if (current !== undefined) this.#last = current;
    return current ?? this.#last;
  }

  get name(): string {
    // The one normalization (#421). Storage stays sparse — `#toJSON` below spreads `name` only
    // when it is set, so a round-trip never invents one — and `read('name')` still answers
    // `undefined`. A reader who only wants text gets text.
    return this.#stored()?.name ?? '';
  }

  get start(): Instant | undefined {
    return this.#stored()?.start;
  }

  get end(): Instant | undefined {
    return this.#stored()?.end;
  }

  get hasChildren(): boolean {
    return this.#source.hasChildren(this.id);
  }

  get depth(): number {
    return this.#source.depthOf(this.id);
  }

  // `read(key)` answers the value stored under `key`, for every declared Field (ADR 0024). The tree
  // has its own door, `parent()`, which follows the hierarchy source instead (ADR 0020) — the two
  // can disagree under a plugin-owned hierarchy, on purpose. `hierarchyParentId` reads the tree by
  // key, through this same door, for a caller that holds a key and not a member name.
  read<K extends FieldKey>(field: K): FieldValue<Record<string, unknown>, K> | undefined {
    const stored = this.#stored();
    if (stored === undefined) return undefined;
    return this.#source.readField(stored, field) as FieldValue<Record<string, unknown>, K> | undefined;
  }

  duration(): Duration | undefined {
    const stored = this.#stored();
    return stored === undefined ? undefined : this.#source.durationOf(stored);
  }

  children(): readonly Entry[] {
    return this.#source.storedChildrenOf(this.id).map((child) => this.#source.entryFor(child.id));
  }

  parent(): Entry | undefined {
    const stored = this.#stored();
    // The hierarchy source answers this, not `stored.parentId` (ADR 0020) — a plugin may own the
    // tree, and then `children()`, `depth` and `descendants()` all follow the same answer.
    const parentId = stored === undefined ? undefined : this.#source.parentIdOf(stored);
    if (parentId === undefined) return undefined;
    return this.#source.storedEntry(parentId) === undefined ? undefined : this.#source.entryFor(parentId);
  }

  /** A worklist, never recursion: how deep a tree goes is the consumer's to author, and a stack
   *  overflow answers no question.
   *
   *  `seen` is the same guard `#depthOf` carries in the store: inside an open transaction the tree
   *  is the raw source's answer, which core has not checked yet, so a source that loops would walk
   *  `b,a,b,a,…` forever. Each row is answered once, and the link that closes a loop is dropped. */
  descendants(): readonly Entry[] {
    const found: Entry[] = [];
    const seen = new Set<EntryId>([this.id]);
    const pending: EntryId[] = [this.id];
    while (pending.length > 0) {
      for (const child of this.#source.storedChildrenOf(pending.pop()!)) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        found.push(this.#source.entryFor(child.id));
        pending.push(child.id);
      }
    }
    return found;
  }

  /** Shares `leavesOf` with `ComputeContext`/`RollUpContext` (`fields/field-access.ts`) — one walk,
   *  not a second one re-derived here. A removed row has no subtree left to walk, so it answers
   *  no leaves. */
  leaves(): readonly Entry[] {
    const stored = this.#stored();
    if (stored === undefined) return [];
    return leavesOf(stored, (row) => this.#source.storedChildrenOf(row.id)).map((row) =>
      this.#source.entryFor(row.id),
    );
  }

  /**
   * `JSON.stringify(entry)` hands back the stored values, not `{"id": …}` alone.
   *
   * Every value on this row is a getter, and `JSON.stringify` reads own enumerable properties only,
   * so without this hook a consumer who serializes `entries.all` loses every name and date and is
   * told nothing. It is deliberately **not** on the `Entry` interface: `toInput()` is the one
   * copy door a caller names (ADR 0017), and this is the platform calling that same door.
   */
  toJSON(): EntryInput {
    return this.toInput();
  }

  toInput(): EntryInput {
    const stored = this.#stored();
    if (stored === undefined) return { id: this.id };
    return {
      id: stored.id,
      ...(stored.name !== undefined ? { name: stored.name } : {}),
      ...(stored.parentId !== undefined ? { parentId: stored.parentId } : {}),
      ...(stored.start !== undefined ? { start: stored.start } : {}),
      ...(stored.end !== undefined ? { end: stored.end } : {}),
      props: { ...stored.props },
    };
  }
}

/**
 * One `Entry` per id, for the lifetime of the store. Identity is stable across reads, which is what
 * `hasChildren` costing nothing and a `Set` of hovered rows both rest on.
 *
 * Nothing is evicted on removal: an `Entry` outlives its `StoredEntry` by design (ADR 0017), and a
 * re-added id is the same row under the same name.
 */
export class LiveEntries {
  readonly #source: EntrySource;
  readonly #byId = new Map<EntryId, Entry>();

  constructor(source: EntrySource) {
    this.#source = source;
  }

  for(id: EntryId): Entry {
    const held = this.#byId.get(id);
    if (held) return held;
    const made = new LiveEntry(this.#source, id);
    this.#byId.set(id, made);
    return made;
  }
}

/** The one refusal `entry.read` makes: a key no Field declares. Named here so the store and the row
 *  raise the same error from the same door. */
export function unknownFieldError(key: FieldKey): UnknownFieldError {
  return new UnknownFieldError(String(key), 'entry.read');
}
