# Validated issues — S2.5 undo/redo and S2.6 serialization

**Range:** `d7f7a34` (S2.4 close) … working tree (S2.5 `f5f2691` / `29553cc`, S2.6 `ba1db86`…`344ffe0`, plus uncommitted history/store follow-ups)
**Date:** 2026-08-27
**Kind:** high-signal only — objective runtime bugs and cited instruction-file breaches. Not the Standards/Spec two-axis review ([code-review.md](./code-review.md)).

Reproduced on the working tree before recording. Example tests in `history.test.ts` and `[S2-A1]` still pass; they do not cover these paths.

S2.5 holds on the main contract: History is a `change` subscriber, undo/redo go through `commitChangeSet` (no second extension-hook or rollup pass), cascade undo restores user + rollup/extender rows, capacity eviction, and refused undo. The working tree moves the cursor on `change` (D-S2-25). Commit `29553cc` moved it on `undo()`; that is no longer open.

---

## 1. Undo-all after remove-then-re-add restores the wrong insertion order

**File:** `src/data/entry-store.ts`
**Flagged as:** bug (S2.5 undo + S2.6 tombstones)
**Severity:** high — breaks `[S2-A1]` / I7 for a legal public sequence

S2.5 undo of `remove` applied `Map.set` and appended. S2.6 added `#removedAtIndex` so a plain undo of remove puts the row back. A later **user** `add` of that same id deletes the tombstone and appends (new insertion). That is correct going forward.

Undo-all is not. On `[a, b, c]`:

1. `remove('a')`
2. `add('a')`
3. undo until `!canUndo`

Must restore `[a, b, c]`. Restores `[b, c, a]`. The invert of the original remove has the entity, not the index. The side table now holds the re-add position.

`toJSON()` after undo-all is not byte-identical to the start document. The property test never hits this path: `add` only uses `n1`/`n2`/`n3`, so it never re-adds a removed seed id.

**Reproduce:**

```ts
const state = new DatasetState({
  timeZone: 'UTC',
  entries: [
    { id: 'a', name: 'a', start: 0, end: 1 },
    { id: 'b', name: 'b', start: 0, end: 1 },
    { id: 'c', name: 'c', start: 0, end: 1 },
  ],
});
const before = JSON.stringify(toJSON(state));
state.entries.remove('a');
state.entries.add({ id: 'a', name: 'a', start: 0, end: 1 });
while (state.canUndo) state.undo();
// all ids are ['b', 'c', 'a']; JSON.stringify(toJSON(state)) !== before
```

---

## 2. Undo of an optional field writes `undefined` onto the Entry

**File:** `src/data/entry-store.ts` (`endTransaction` apply). `src/data/history.ts` invert produces `to: undefined`.
**Flagged as:** bug (S2.5)
**Severity:** high — violates the Entry “absent vs undefined” rule; `[S2-A1]` stays green

`update({ progress: 0.5 })` records `{ from: undefined, to: 0.5 }`. Invert sets `to: undefined`. Apply does `{ ...current, [row.field]: row.to }`, so the key exists with value `undefined`.

The same happens for `parentId`, `segments`, and `meta`. Construction refuses that shape: an Entry must not gain a key its input never had (`entry-reader.ts`, `exactOptionalPropertyTypes`). `update()` cannot unset these fields (`readEdit` skips `undefined`), so undo is the path that creates this.

`entry.progress` still reads as `undefined`, and `toJSON()` omits the key, so `[S2-A1]` stays green. `'progress' in entry` is `true` after undo and `false` before the edit.

**Reproduce:**

```ts
const state = new DatasetState({
  timeZone: 'UTC',
  entries: [{ id: 't1', name: 't1', start: 0, end: 1 }],
});
expect('progress' in state.entries.get('t1')!).toBe(false);
state.entries.update('t1', { progress: 0.5 });
state.undo();
expect('progress' in state.entries.get('t1')!).toBe(false); // fails; it is true
```

---

## 3. `fromJSON` throws `RangeError` instead of `FreeGanttError`

**File:** `src/data/serialization/read.ts`
**Flagged as:** AGENTS.md compliance (`plans/02` §7, `plans/04` §1.1)
**Severity:** high — public validation boundary, wrong error type

`readEntryDocument` calls `instant(row.start)` / `instant(row.end)` (and the same for segments). A zoneless or missing date throws a native `RangeError`. Mutation input already maps that to `InvalidInstantError` in `toInstant()`.

`Dataset.fromJSON` is a public validation boundary. The spec requires `FreeGanttError` subclasses with codes. A caller who catches `FreeGanttError` around `fromJSON` does not see a bad document date.

Absolute ISO reading is right (zone and `dateOnlyEnd` must not re-enter). The error type is not.

**Reproduce:**

```ts
Dataset.fromJSON({
  schema: 1,
  timeZone: 'UTC',
  dateOnlyEnd: 'inclusive',
  derivedSpanKinds: ['group'],
  entries: [{ id: 't1', name: 't1', start: '2026-09-01', end: '2026-09-11T00:00:00.000Z' }],
});
// throws RangeError, not InvalidInstantError / FreeGanttError
```

---

## 4. Span-correction warn compares ISO text, not Instants

**File:** `src/data/serialization/index.ts` (`warnIfDerivedSpansWereCorrected`)
**Flagged as:** bug (S2.6)
**Severity:** medium — false diagnostic in dev; data is not rewritten

The helper skips the warn only when `row.start === toISO(stored.start)`. `toISO` is always `Date.toISOString()` (`…sssZ`). `fromJSON` accepts any offset ISO of the same Instant (`2026-09-01T00:00:00Z`, `…+00:00`).

A hand-authored group whose span already matches its children still warns in dev: “corrected the derived span … to match its children” even though construction changed nothing. Compare resolved Instants, not strings.

**Reproduce:** group `start`/`end` as `'2026-09-01T00:00:00Z'` / `'2026-09-11T00:00:00Z'`, child as the canonical `…000Z` form of the same instants. `entries.get('p1').start === entries.get('t1').start`, but `warnIfDerivedSpansWereCorrected` still logs.

---

## Residual

- `[S2-A2]` and the three `[S2-A1]` generator runs pass. They do not cover issues 1 or 2.
- Uncommitted History-cursor-on-`change` and `syncKeyed` insert-before look consistent with D-S2-25 and DOM order. No further validated bugs there. See [simplify.md](./simplify.md) and [sync-keyed-undo-order.md](./sync-keyed-undo-order.md).
- D-S2-24 “a consumer writes History with `transaction()` only” vs `commitChangeSet` is recorded in [code-review.md](./code-review.md) and [architecture-review.html](./architecture-review.html). Not a runtime defect.
