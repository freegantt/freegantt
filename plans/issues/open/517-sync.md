# #517 — `entries.sync()`: make a live Dataset match a full list, and record one undo step

**Reported:** 2026-09-23. **Status:** grill in progress, no code. Labels: `needs grill`, `api change`.
Split out of [#496](https://github.com/freegantt/freegantt/issues/496) (`load`). Plan for `load`:
[496-order-tolerant-bulk-write.md](./496-order-tolerant-bulk-write.md).

## Why this is planned now

`load` and `sync` do the same write — "make the entries match this list" — with different history
and state rules. The owner ran this grill before `load` is built, so `load`'s shared functions fit
sync with no rework.

| | `load` (#496) | `sync` (#517) |
|---|---|---|
| History | clears | records one undo step |
| Per-entry state (selection, collapse, plugin store rows) | reset | kept for a kept id |
| Diff | none: remove all, add all | by id: add, remove, field edits |
| Commit when nothing changed | yes, History must clear | no, nothing fires |
| Origin | `'load'` | `'sync'` |
| List order | applied, not undoable (History clears) | applied, undoable (S2, S12) |

**Shared functions, built with `load`:** read the list, check the batch (no duplicate id, known
parents, no loop), put `entries.all` in list order, and refuse an open transaction.
**Sync adds:** the diff. It writes the order Field (S12).

## Owner rulings (grill, 2026-09-23)

- **Undo: record.** A server refresh records one undo step, and it covers only the rows that
  changed. A consumer who wants no undo calls `load`. This reverses the #517 comment that said sync
  skips undo.
- **S1 — Match the list. Closed.** An entry not in the list is removed. A key a kept entry omits is
  cleared. Contract: after `sync(list)`, the data equals `load(list)`. Only undo and per-entry
  state differ.
- **S2 — Sync applies the list's order, and the reorder is undoable. Closed.** It needs an order
  record (S12: the order Field).
- **S3 — Ingest rules, the same as `load`. Closed.** A broken tree throws. A `'never'` lock does
  not refuse it. A derived parent cell re-rolls. No `EditExtender` cascade runs. `beforeChange` can
  refuse it.
- **S4 — Origin `'sync'`. Closed.** History records it like `'user'`. Plugins read it on
  `ctx.events.on('change')`, the same as `'load'`. No separate event name.
- **S5 — A local edit the server has not seen. Closed: last write wins.** Undo of the sync brings
  the local edit back. Conflict detection is the withdrawn `apply` door (D-S2-11), out of scope.
- **S6 — A kept entry keeps its selection, collapse state and plugin store rows. Closed.** A
  removed entry loses them. An undo restores its store rows.
- **S7 — The name is `sync`. Closed.** Call site: `dataset.entries.sync(serverRows)`.
- **S8 — Stays separate from #419. Closed.** Sync records undo, so it does not need #419's skip
  rule.
- **S9 — Refuse inside `dataset.transaction()`. Closed.** The same typed error as `load`.
- **S10 — A sync with no changes commits nothing. Closed.** No `change` fires, no undo step. This
  is the common poll, so it costs nothing.
- **S11 — A sync with changes erases Redo, like a user edit. Closed.**
- **S13 — Frequent syncs fill the undo history. Closed: accept and document.** History keeps 100
  steps. The consumer raises the capacity, or uses `load`. #419 may add a skip rule later.
- **Undo notification (owner question):** already works. An undo fires `change` with
  `origin: 'undo'` and the exact rows it reverted.
- **Partial update: filed for later as [#527](https://github.com/freegantt/freegantt/issues/527)**
  (owner ruling, after the gaps below). See "Out of scope".

- **S12 — What records the list order. Closed: (b), an order Field** (owner, 2026-09-23). The
  authored order Field from D-S4-31, an ordinary Field on each entry. A reorder is ordinary field
  edits, so undo, `change`, plugins and the sync diff need no new code. WBS reads it and never holds
  it: WBS also encodes the parent (a second source for `parentId`), a custom `code` such as `ENG-01`
  holds no position, and WBS is an optional plugin. The server's intended order arrives as the
  list's own order. A consumer whose server stores WBS codes sorts by them before `sync` (W8 ships
  the comparator). Rejected: (a), a snapshot row of all ids in the ChangeSet.

## Open — round 3: the order Field

- **O1 — Who writes it.** (a) The library, from list position; the array stays the one way to
  author order (W3, constructor), and a future move verb writes it. (b) The consumer, as a column
  from their database; the library sorts siblings by it. Recommended: (a).
- **O2 — Value.** Integer index among siblings, or a fractional key. Recommended: integer.
- **O3 — Name.** Recommended: `siblingIndex`. `order` and `sort` collide with the Gantt's view sort
  (D-S4-28); `position` is used 13 times in `CONTEXT.md` for pixels and WBS.
- **O4 — Does `toInput()` carry it?** Recommended: no, under O1 (a).
- **O5 — Scope and build order.** Recommended: its own issue. Build `load` (#496), then the order
  Field, then `sync` (#517). `load`'s "put the list in order" helper is written so the order Field
  can store its result.

## Facts found

- The Gantt redraws from row 0 on any ChangeSet with no field rows
  (`src/layout/frame-layout.ts:276`). An order row needs no new redraw code.
- Undo of a removed entry restores its old index today (`#removedAtIndex`,
  `src/data/entry-store.ts:160`). A kept entry has no order record.

## Out of scope

- **Partial update** ([#527](https://github.com/freegantt/freegantt/issues/527)). The consumer can already write a delta with
  `add`/`update`/`remove` inside one `transaction()`. Two gaps: `add()` still needs a new parent
  before its new child, and `update()` refuses a locked field and runs cascades, which a server
  write should not do.
- **Skip undo.** That is #419.
- **Conflict detection.** That is `apply` (D-S2-11).
