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
  Segment,
  StoredEntry,
} from '../model/index.js';
import { UnknownFieldError } from '../model/index.js';

/**
 * What a live row asks its store. The store implements it; a `LiveEntry` holds an id and this, so
 * one row costs one small object however many times it is read.
 */
export interface EntrySource {
  /** The row as this transaction leaves it, or `undefined` once it is removed. */
  storedEntry(id: EntryId): StoredEntry | undefined;
  storedChildrenOf(id: EntryId): readonly StoredEntry[];
  hasChildren(id: EntryId): boolean;
  depthOf(id: EntryId): number;
  /** The one `Entry` this store holds for `id` — how `children()` and `parent()` hand back rows. */
  entryFor(id: EntryId): Entry;
  /** `key` on this row, through the Field registry. Throws `UnknownFieldError` on an undeclared key. */
  readField(entry: StoredEntry, key: FieldKey): unknown;
  durationOf(entry: StoredEntry): Duration | undefined;
}

const NO_SEGMENTS: readonly Segment[] = Object.freeze([]);

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
    return this.#stored()?.name ?? '';
  }

  get start(): Instant | undefined {
    return this.#stored()?.start;
  }

  get end(): Instant | undefined {
    return this.#stored()?.end;
  }

  get segments(): readonly Segment[] {
    return this.#stored()?.segments ?? NO_SEGMENTS;
  }

  get hasChildren(): boolean {
    return this.#source.hasChildren(this.id);
  }

  get depth(): number {
    return this.#source.depthOf(this.id);
  }

  read<K extends FieldKey>(field: K): FieldValue<Record<string, unknown>, K> | undefined {
    // One row answers one tree through every door it has (ADR 0017): a Grid column on `parentId`
    // must not print a stale id beside live indentation. `update(id, { parentId })` still writes the
    // stored field, and `StoredEntry.parentId` is still what it wrote.
    if (field === 'parentId') {
      return this.parent()?.id as FieldValue<Record<string, unknown>, K> | undefined;
    }
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
    const parentId = this.#stored()?.parentId;
    if (parentId === undefined) return undefined;
    return this.#source.storedEntry(parentId) === undefined ? undefined : this.#source.entryFor(parentId);
  }

  /** A worklist, never recursion: how deep a tree goes is the consumer's to author, and a stack
   *  overflow answers no question. */
  descendants(): readonly Entry[] {
    const found: Entry[] = [];
    const pending: EntryId[] = [this.id];
    while (pending.length > 0) {
      for (const child of this.#source.storedChildrenOf(pending.pop()!)) {
        found.push(this.#source.entryFor(child.id));
        pending.push(child.id);
      }
    }
    return found;
  }

  /**
   * `JSON.stringify(entry)` hands back the stored values, not `{"id": …}` alone.
   *
   * Every value on this row is a getter, and `JSON.stringify` reads own enumerable properties only,
   * so without this hook a consumer who serializes `entries.all` loses every name, date and Segment
   * and is told nothing. It is deliberately **not** on the `Entry` interface: `toInput()` is the one
   * copy door a caller names (ADR 0017), and this is the platform calling that same door.
   */
  toJSON(): EntryInput {
    return this.toInput();
  }

  toInput(): EntryInput {
    const stored = this.#stored();
    if (stored === undefined) return { id: this.id, name: '' };
    return {
      id: stored.id,
      name: stored.name,
      ...(stored.parentId !== undefined ? { parentId: stored.parentId } : {}),
      ...(stored.start !== undefined ? { start: stored.start } : {}),
      ...(stored.end !== undefined ? { end: stored.end } : {}),
      segments: stored.segments,
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
