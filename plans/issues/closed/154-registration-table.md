# #154 — one registration table behind the plugin `register*` seams

**Issues:** [#154](https://github.com/Pawel-IT/FreeGantt/issues/154) (the refactor),
[#146](https://github.com/Pawel-IT/FreeGantt/issues/146) (kind-defaults dispose),
[#147](https://github.com/Pawel-IT/FreeGantt/issues/147) (duplicate plugin columns), and the
remaining half of [#152](https://github.com/Pawel-IT/FreeGantt/issues/152) (two-plugin tests).
Parent: [#145](https://github.com/Pawel-IT/FreeGantt/issues/145) (S5.9 review).
**Slice:** S5.9 follow-up. **Written:** 2026-09-04. **Supersedes** the two plan comments on #154.

## 1. What is actually broken (verified on `s5-start` @ `dc4d670`)

Three seams stack a plugin registration over an earlier one, and all three record the wrong thing to
undo. Each keeps a single remembered slot — "what did this key hold before me?" — and writes that
slot back on disposal. A slot is only correct when plugins dispose in strict reverse-registration
order. `Gantt.plugins` diffs by id and imposes no such order, so `gantt.plugins = [b]` (drop `a`,
keep `b`) is a legal call that makes each seam destroy a live registration it never owned.

Three probes, run against the current tree, all fail:

| Probe | Expected | Actual |
|---|---|---|
| A and B both `registerKindDefaults('buffer', …)`; `gantt.plugins = [B]` | B's defaults still resolve | B's registration is deleted; the library default resolves (#146) |
| A and B both `registerGridColumn({ field: 'risk' })`; `gantt.plugins = [B]` | one `risk` column, B's content | **no** `risk` column at all (#147) |
| Same two, then a `gridColumns` commit bakes `risk` at `width: 200`; `gantt.plugins = [B]` | one `risk` column, 200px | **no** `risk` column at all (#147, second face) |

The third probe is new — it is not in either issue. `registerPluginColumn`'s disposer strips the
field from `#gridColumnInput` as well (the `7d5cd96` fix, correct on its own: a commit bakes plugin
columns into the consumer's own list, so disposal has to reach in there too). Filtering by field key
removes the committed column even when a *surviving* plugin is the reason that field is on screen.

`ItemProducerRegistry.register` (`src/layout/items/produce-items.ts:84`) has the identical defect by
inspection — it is the implementation the other two were copied from — and no test covers
out-of-order producer disposal.

## 2. Fix: one table, three adapters

### 2.1 The table — `src/layout/registration-table.ts` (new)

A key holds a **stack** of live registrations, not one remembered value. The newest wins; a disposer
removes exactly its own registration, by identity, whenever it runs.

```ts
// layout/ — the one table behind every plugin `register*` seam (S5.9, #154). A key holds a stack of
// live registrations: the newest one wins, and disposing one removes exactly that registration, so
// dropping an early plugin never disturbs a later one on the same key.

import type { Disposer } from '../model/index.js';

export interface RegistrationTable<K, V> {
  /** The winning registration for `key` — the newest one still live — or `undefined`. */
  get(key: K): V | undefined;
  /** Every key's winning registration, in first-registration order. Deliberately not `values()`:
   *  it answers one value per key, not every value ever registered. */
  active(): readonly V[];
  /** Adds `value` as the newest registration for `key`. The returned `Disposer` removes exactly
   *  this registration — never a sibling on the same key, in any disposal order — and is
   *  idempotent. `get(key)` then falls back to the newest registration left, or to the initial
   *  value, or to `undefined`. */
  register(key: K, value: V): Disposer;
}

interface Registration<V> {
  readonly value: V;
}

function winner<V>(stack: Registration<V>[] | undefined): Registration<V> | undefined {
  return stack?.[stack.length - 1];
}

/** Call: `createRegistrationTable<EntryKind, ItemProducer>([['span', produceSpanItems]])`. Initial
 *  pairs are the floor nothing disposes; a later pair for the same key replaces an earlier one. */
export function createRegistrationTable<K, V>(
  initial: Iterable<readonly [K, V]> = [],
): RegistrationTable<K, V> {
  const stacks = new Map<K, Registration<V>[]>();
  for (const [key, value] of initial) stacks.set(key, [{ value }]);

  return {
    get(key) {
      return winner(stacks.get(key))?.value;
    },
    active() {
      const values: V[] = [];
      for (const stack of stacks.values()) {
        const top = winner(stack);
        if (top !== undefined) values.push(top.value);
      }
      return values;
    },
    register(key, value) {
      const stack = stacks.get(key) ?? [];
      stacks.set(key, stack);
      const registration: Registration<V> = { value };
      stack.push(registration);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        const index = stack.indexOf(registration);
        if (index !== -1) stack.splice(index, 1);
        if (stack.length === 0) stacks.delete(key);
      };
    },
  };
}
```

Three notes on the shape:

- **A per-registration cell, not `lastIndexOf(value)`.** Two plugins may legitimately register the
  same object reference (a shared `const BUFFER_DEFAULTS`), and a value-identity search would then
  remove whichever copy it found. A fresh `{ value }` cell per call makes "this registration" a
  thing the disposer can point at, and makes the `disposed` guard exact.
- **`active()`, not `values()`.** `Map.values()` semantics would be a lie: the table holds several
  values per key and this method returns one. `ColumnChrome` is the only caller.
- **Key order is first-registration order.** A key enters the map on its first registration and
  leaves only when its stack empties, so `active()` keeps "the later registration's content wins, at
  the earlier registration's position" — the behaviour `effectiveInput()` already documents — with
  no ordering code of its own.

**Why `layout/`:** `layout/` may import `model/` (the `Disposer` type is its only dependency), and
`view/` may import `layout/` — it is the lowest layer both callers can reach (`.dependency-cruiser.cjs`,
`layout-boundary` / `view-boundary`). `layout/pick-defined.ts` is the precedent for a generic helper
living there. `model/` is not an option: `eslint/rules/model-is-types-only.cjs` fails any runtime
declaration outside the id/brand and `FreeGanttError` allowlist. Export it from `src/layout/index.ts`
next to `createItemProducerRegistry`, the same way every other cross-layer import resolves.

`src/layout/registration-table.test.ts` runs in the **pure** Vitest project (no DOM), which is the
right home for the one place the mechanism itself is tested.

### 2.2 Adapter 1 — `ItemProducerRegistry` (`src/layout/items/produce-items.ts`)

The registry becomes a thin wrapper; the built-ins and the test-only `extras` become the table's
initial pairs.

```ts
export function createItemProducerRegistry(
  extras: Readonly<Partial<Record<EntryKind, ItemProducer>>> = {},
): ItemProducerRegistry {
  const producers = createRegistrationTable<EntryKind, ItemProducer>([
    ['span', produceSpanItems],
    ['group', produceGroupItems],
    ['milestone', produceMilestoneItems],
    ...definedProducers(extras),
  ]);
  return {
    producerFor: (kind) => producers.get(kind) ?? produceSpanItems,
    register: (kind, producer) => producers.register(kind, producer),
  };
}
```

`definedProducers` is the `Object.entries` filter `noUncheckedIndexedAccess`/
`exactOptionalPropertyTypes` require (`Object.entries` types the value as `ItemProducer | undefined`),
replacing today's `if (producer !== undefined)` loop. Behaviour is unchanged except that out-of-order
disposal now works.

`ItemProducerRegistry.register`'s doc comment says the disposer "restores that prior producer" —
reword to "restores whichever registration is newest among the rest".

### 2.3 Adapter 2 — kind defaults (`src/view/gantt-shell.ts`)

`#kindDefaults = createRegistrationTable<EntryKind, KindDefaults>()`. The only read site
(`#resolveCapabilities`, `gantt-shell.ts:1197`) already calls `.get(kind)` and does not change.

```ts
const registerKindDefaults = (kind: EntryKind, defaults: KindDefaults): void => {
  gate.assertOpen();
  const remove = this.#kindDefaults.register(kind, defaults);
  this.#refreshCapabilities();
  disposables.add(() => {
    remove();
    this.#refreshCapabilities();
  });
};
```

`#refreshCapabilities()` is a new two-line private (`this.#capabilities = this.#resolveCapabilities();
this.#refreshAffordances();`) that `set interactions` calls too — today that pair is written out three
times, for the same reason `#resolveCapabilities` was extracted.

### 2.4 Adapter 3 — plugin columns (`src/view/column-chrome.ts`)

`#pluginColumns = createRegistrationTable<FieldKey, GridColumnInput>()` replaces the append-only
array, so storage — not just the read-time dedupe `3729419` added — is one column per field.

```ts
effectiveInput(): readonly GridColumnInput[] {
  const baseKeys = new Set(this.#gridColumnInput.map(ColumnChrome.#fieldOf));
  const extras = this.#pluginColumns
    .active()
    .filter((column) => !baseKeys.has(ColumnChrome.#fieldOf(column)));
  return [...this.#gridColumnInput, ...extras];
}
```

That is the whole of `3729419`'s dedupe, deleted: the `#asGridColumns` round-trip existed only to
read `field` off each input, and `#fieldOf` already does that.

```ts
registerPluginColumn(column: GridColumnInput): Disposer {
  const field = ColumnChrome.#fieldOf(column);
  const remove = this.#pluginColumns.register(field, column);
  this.#ports.rebindFields();
  this.#ports.requestFrame();
  return () => {
    // A commit (resize, reorder, or a plain `gridColumns` assignment) writes the whole of
    // `effectiveInput()` — plugin columns included — into `#gridColumnInput` (D-S5-18: one commit
    // sequence, one write), so disposal has to reach the baked-in copy too, by field key: a
    // resize rewrites the object itself, so identity no longer matches once baked in. Strip it only
    // when *this* registration is the one on screen. Another plugin's registration winning the field
    // means the baked column is that plugin's, and stripping it would delete a live plugin's column
    // (and the consumer's committed width) on a plugin removal that never owned it.
    const wasOnScreen = this.#pluginColumns.get(field) === column;
    remove();
    if (wasOnScreen) {
      this.#gridColumnInput = this.#gridColumnInput.filter(
        (c) => ColumnChrome.#fieldOf(c) !== field,
      );
    }
    this.#ports.rebindFields();
    this.#ports.requestFrame();
  };
}
```

The four cases this rule has to answer, after a commit has baked the column in:

| Disposed | Still registered | Baked copy | Result |
|---|---|---|---|
| the only plugin | — | that plugin's | stripped — column goes, as `api/plugin.ts` promises |
| the winner (B) | A | B's | stripped — A's own registration re-supplies the column at A's position |
| a loser (A) | B | B's | kept — B's column and the consumer's committed width both survive |
| B, then A | — | B's | B strips it; A's later disposal finds nothing left to strip |

Row 2 loses a committed width, and that is the right trade: the baked column *is* the departing
plugin's content, and "removed automatically when this plugin is disposed" outranks keeping its
geometry. Row 3 is the probe that fails today.

### 2.5 What deliberately does not change

The three `register*` closures in `GanttShell`'s constructor stay three closures. Each runs a
genuinely different side effect — `invalidateFrom(0)` + a frame for a producer, a capability
re-resolve for kind defaults, `ColumnChrome`'s own rebind for a column — and folding them together
would be the wrong deepening (the review's own ISP note). What leaves is the duplicated stack/restore
bookkeeping inside them: each closure becomes "register through the table, run my own side effect,
undo the same two on the way out".

## 3. Correction to #154's stated motivation

#154 says the constructor "grows every slice" and names S5.10's Dataset-side registration as the next
`register*` to arrive in the same shape. That is not what S5.10 does, and the plan should not promise
a reuse it cannot deliver:

- S5.10's `fields.register` / `registerType` / `registerAggregator` hang off `DatasetPluginContext`,
  built by `src/extensions/dataset-plugin-host.ts` against `src/data/` state
  (`plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md` §2). They never touch
  `GanttShell`'s constructor.
- They could not import this table anyway: `data-boundary` lets `data/` import only `time/` and
  `model/`, never `layout/`.
- Their collision policy is the opposite one. `Dataset.plugins` is read-only by design (a Field must
  exist before the first Rollup), so a Dataset registration never disposes and never stacks, and
  `FieldRegistry` already answers a duplicate key with `DuplicateFieldKeyError` rather than an
  override.

So this refactor is justified by the two live bugs and the duplicated bookkeeping, not by a fourth
adapter arriving next slice. The next Gantt-side `register*` (S5.11, or S7's link-emission seam,
#136) is the one that inherits the table.

## 4. Tests

**`src/layout/registration-table.test.ts`** (pure) — the mechanism, tested once:

- `get` returns the newest registration; `undefined` for an unknown key.
- Dispose the newest → the previous one wins.
- **Dispose the oldest while a newer one is live → the newer one still wins, and its key is untouched.**
- Dispose every registration → `get` is `undefined` and the key leaves `active()`.
- An initial pair survives disposal of everything registered over it.
- `active()` returns one value per key, in first-registration order.
- The same value registered twice yields two disposers, each removing one registration.
- A disposer called twice removes nothing the second time.

**`src/layout/items/produce-items.test.ts`** — out-of-order producer disposal: two producers on one
kind, dispose the first, the second still produces.

**`src/api/gantt.test.ts`** (public surface, per #152's own note) — the three probes from §1, plus the
row-2 case:

- Two plugins on one kind; `gantt.plugins = [B]` (drop A) → B's defaults still resolve. (#146)
- Two plugins on one field; `gantt.plugins = [B]` → one `risk` column, B's header. (#147)
- Same, after a commit at `width: 200`; drop A → the column is still there at 200px. (#147)
- Same, after a commit; drop **B** → the column is still there, with A's header. (#147)

The two existing regression tests (`gantt.test.ts:1484` and `:1610`) exercise behaviour, not
bookkeeping, and pass unchanged. These four close the "two-plugin dispose/collision" half of #152;
its late-register half landed in `88bd701`.

## 5. Docs in the same change

- `src/api/plugin.ts` — `registerItemProducer`'s "restoring the prior producer" is wrong for
  out-of-order disposal; `registerKindDefaults` and `registerGridColumn` say nothing about two
  plugins claiming the same key. One sentence each: the newest registration wins, and disposing one
  plugin never disturbs another's.
- `CONTEXT.md:486` (`KindDefaults`) — "disposing one restores whichever registration held that Kind
  before it" describes the single-slot behaviour this change replaces.
- `src/layout/items/produce-items.ts` (`ItemProducerRegistry.register`) and
  `src/view/column-chrome.ts` (`#pluginColumns`, `effectiveInput`) — same correction.
- No `etc/freegantt.api.md` change: no signature moves, and the report carries no TSDoc bodies.

## 6. Order

One change: table, three adapters, tests, docs. It closes #146, #147, #154, and #152's remaining
half. Splitting it does not help — each adapter is a few lines and the tests are the point.
