// data/ — the per-plugin per-entry stores (D-S5-24, D-S5-30). One `PluginStores` per DatasetState,
// holding every plugin's rows in one place, so a transaction stages, folds and applies plugin rows
// through the same three steps `EntryStore` already uses for entries.
//
// ADR 0002 named the problem this solves: per-plugin per-entry data must not live in `entry.props`,
// or an application and a plugin collide in one field.
//
// A store row is changeset content on its own. `pendingRows` is what makes a transaction whose only
// write is a plugin row build a changeset at all — without it `buildCommitChangeSet` finds nothing,
// `runTransaction` returns early, and the write silently no-ops: no `change` event, no undo record
// (breaking I7 for exactly the data this file adds), and no `datasetRevision` bump, so nothing
// repaints (#156).

import type {
  ChangeSet,
  EntryId,
  PluginId,
  PluginStore,
  PluginStoreName,
  PluginStoreView,
  StoreRowUpdated,
} from '../model/index.js';
import { MutationDuringExtensionHookError, entryId } from '../model/index.js';
import { runTransaction } from './transaction.js';
import type { TransactionData, TxToken } from './transaction.js';

/** The one place `PluginId` becomes a `StoreName`. `reserve()` and `read()` both go through it, which
 *  is what makes a reader find exactly the store its owner made (D-S5-30). */
export function pluginStoreName(pluginId: PluginId): PluginStoreName {
  return `plugin:${pluginId}`;
}

function pluginIdOf(name: PluginStoreName): PluginId {
  return name.slice('plugin:'.length);
}

type Rows = Map<EntryId, object>;
/** A staged row. `undefined` is a staged removal — distinct from "not staged", which is absence. */
type StagedRows = Map<EntryId, object | undefined>;

export class PluginStores {
  /** Every plugin's committed rows. A row enters one way only: written by a plugin that installed and
   *  reserved a store (D-S5-24). With no save format left to protect, a Dataset carries no row for a
   *  plugin it does not install — `#reserved` and `#committed` never disagree. */
  readonly #committed = new Map<PluginStoreName, Rows>();
  /** One handle per reserving plugin, so a second `reserve()` returns the same store (issue #137 F17). */
  readonly #reserved = new Map<PluginStoreName, PluginStore<never>>();
  #writeSet: Map<PluginStoreName, StagedRows> | null = null;
  readonly #runner: TransactionData | undefined;

  constructor(runner?: TransactionData) {
    this.#runner = runner;
  }

  /** Call: `ctx.store.reserve<LockRow>()`. Idempotent — the same plugin reserving twice gets the same
   *  handle, which is not an error. Two plugins never collide, because the name is the caller's own id. */
  reserve<T extends object>(pluginId: PluginId): PluginStore<T> {
    const name = pluginStoreName(pluginId);
    const existing = this.#reserved.get(name);
    if (existing) return existing;
    const store = this.#buildStore<T>(name);
    this.#reserved.set(name, store as unknown as PluginStore<never>);
    return store;
  }

  /** Call: `ctx.store.read<DependencyRow>('freegantt/dependencies')`. `undefined` when that plugin
   *  never reserved a store. */
  read<T extends object>(pluginId: PluginId): PluginStoreView<T> | undefined {
    const name = pluginStoreName(pluginId);
    if (!this.#reserved.has(name)) return undefined;
    return this.#buildView<T>(name);
  }

  /** Call: `dataset.pluginStore()`'s no-argument form. Every store an installed plugin has reserved,
   *  keyed by plugin id — the record `Object.entries` walks to save every plugin's rows in one loop. */
  readAll(): Readonly<Record<PluginId, PluginStoreView<object>>> {
    const stores: Record<PluginId, PluginStoreView<object>> = {};
    for (const name of this.#reserved.keys()) stores[pluginIdOf(name)] = this.#buildView(name);
    return stores;
  }

  // `all` is a getter on both handles below, so it must read the live rows at each call rather than
  // close over one map. Each reader is an arrow bound to this instance — a method shorthand inside the
  // returned literal would bind `this` to the literal instead, which reaches no store at all.
  #buildView<T extends object>(name: PluginStoreName): PluginStoreView<T> {
    const get = (id: EntryId | string): T | undefined => this.#read(name, entryId(id)) as T | undefined;
    const readAll = (): ReadonlyMap<EntryId, T> => this.#visibleRows(name) as ReadonlyMap<EntryId, T>;
    return {
      get,
      get all(): ReadonlyMap<EntryId, T> {
        return readAll();
      },
    };
  }

  #buildStore<T extends object>(name: PluginStoreName): PluginStore<T> {
    const view = this.#buildView<T>(name);
    return {
      get: (id: EntryId | string): T | undefined => view.get(id),
      get all(): ReadonlyMap<EntryId, T> {
        return view.all;
      },
      set: (id: EntryId | string, value: T): void => this.#write(name, entryId(id), value),
      remove: (id: EntryId | string): void => this.#write(name, entryId(id), undefined),
    };
  }

  /** Reads through an open write set first, so a plugin that writes and then reads inside one
   *  transaction sees its own row — the same rule `EntryStore.get` follows. */
  #read(name: PluginStoreName, id: EntryId): object | undefined {
    const staged = this.#writeSet?.get(name);
    if (staged?.has(id)) return staged.get(id);
    return this.#committed.get(name)?.get(id);
  }

  /** The committed map itself while no transaction is open — one identity per commit, no copy on a
   *  plain read. Merged only while a write set is open. */
  #visibleRows(name: PluginStoreName): ReadonlyMap<EntryId, object> {
    const committed = this.#committed.get(name) ?? new Map<EntryId, object>();
    const staged = this.#writeSet?.get(name);
    if (!staged || staged.size === 0) return committed;
    const merged = new Map(committed);
    for (const [id, row] of staged) {
      if (row === undefined) merged.delete(id);
      else merged.set(id, row);
    }
    return merged;
  }

  /** A write with a transaction already open joins it; a write with none wraps itself in one, the
   *  same rule `entries.add` follows outside a `transaction()` body (issue #137 F17). Those are the
   *  only two cases — a `setup`-time write and an event-handler write both take the second.
   *
   *  The extension hook's own transaction is still open while the hook runs (#323) — `runTransaction`
   *  has not reached `endStores` yet — so the "join the open transaction" branch below would otherwise
   *  stage a hook-time write straight into the write set it is already inside, silently, instead of
   *  refusing it the way a store bound through `runTransaction` does. The `runningExtensionHook` check
   *  must run before that branch, not inside `runTransaction`, for exactly that reason. */
  #write(name: PluginStoreName, id: EntryId, value: object | undefined): void {
    if (this.#runner?.runningExtensionHook) {
      throw new MutationDuringExtensionHookError('dataset.transaction');
    }
    if (this.#writeSet) {
      this.#stage(name, id, value);
      return;
    }
    if (!this.#runner) {
      throw new Error(
        'PluginStores: not bound to a transaction runner — data/dataset-state.ts always binds one',
      );
    }
    runTransaction(this.#runner, () => this.#stage(name, id, value), 'user');
  }

  #stage(name: PluginStoreName, id: EntryId, value: object | undefined): void {
    const writeSet = this.#writeSet;
    if (!writeSet) {
      throw new Error('PluginStores: no open transaction — data/transaction.ts always opens one first');
    }
    const staged = writeSet.get(name) ?? new Map<EntryId, object | undefined>();
    staged.set(id, value);
    writeSet.set(name, staged);
  }

  // ---- TxToken-gated: only data/transaction.ts holds a token (docs/02 §3.6) ----

  beginTransaction(_token: TxToken): void {
    this.#writeSet = new Map();
  }

  /**
   * Every row this transaction changed, plus one removal row per plugin row an entry removal orphans.
   * A staged write that matches what is already stored yields no row, the same equality rule
   * `diffEdit` applies to a Field — identity (`Object.is`), because a store row is an opaque object
   * this library never walks.
   */
  pendingRows(removedEntryIds: readonly EntryId[]): readonly StoreRowUpdated[] {
    const rows: StoreRowUpdated[] = [];

    for (const [name, stagedRows] of this.#writeSet ?? []) {
      const committed = this.#committed.get(name);
      for (const [id, to] of stagedRows) {
        const from = committed?.get(id);
        if (Object.is(from, to)) continue;
        rows.push({ store: name, id, from, to });
      }
    }

    // Removing an entry removes its plugin rows in the same changeset, exactly as descendants are
    // removed today (D-S5-24). A row this transaction already staged is left to the loop above.
    for (const [name, committed] of this.#committed) {
      for (const id of removedEntryIds) {
        const from = committed.get(id);
        if (from === undefined) continue;
        if (this.#writeSet?.get(name)?.has(id)) continue;
        rows.push({ store: name, id, from, to: undefined });
      }
    }

    return rows;
  }

  /** Applies the committed `ChangeSet`'s store rows and closes the write set. `undefined` — an empty
   *  net effect or a vetoed commit — discards the write set and writes nothing. */
  endTransaction(_token: TxToken, changeSet: ChangeSet | undefined): void {
    if (changeSet) {
      for (const row of changeSet.updated) {
        if (row.store === 'entries') continue;
        this.#apply(row);
      }
    }
    this.#writeSet = null;
  }

  #apply(row: StoreRowUpdated): void {
    if (row.to === undefined) {
      const rows = this.#committed.get(row.store);
      if (!rows) return;
      rows.delete(row.id);
      if (rows.size === 0) this.#committed.delete(row.store);
      return;
    }
    const rows = this.#committed.get(row.store) ?? new Map<EntryId, object>();
    rows.set(row.id, row.to as object);
    this.#committed.set(row.store, rows);
  }
}
