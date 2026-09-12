# Build 4 — a plugin may own the hierarchy

**The ADR:** [`docs/adr/0020`](../../../docs/adr/0020-a-plugin-may-own-the-hierarchy.md). Read it first. It holds every decision here.

**Lands after Builds 1, 2 and 3.** Build 1 gives every reader one door onto the tree. This build is what makes that door worth having.

**What lands.** A data plugin states the parent of an Entry. Core owns everything downstream of that answer.

**Tick each box as you finish it.** Do not save the ticks for the end.

---

## Precondition — check this before you start

**Build 1 Unit E must be complete.** Three sites outside the store must already ask the row, not the stored field:
`layout/rows/entries-source.ts:16`, `layout/frame-memory.ts:77`, `view/tree-collapse.ts:111,153`.

- [ ] Confirm none of those three reads `.parentId`. A site left reading the field disagrees with the library the moment a plugin installs.
- [ ] **The fourth site is yours** — `data/rollup.ts:46,52`. Unit D of this build takes it, and the reason is in Unit D. Do not expect Build 1 to have touched it.
- [ ] Confirm `data/entry-reader.ts:229,567` still **write** `parentId`. Those two stay.

---

## Unit A — the seam

- [ ] Declare `type HierarchySource<TProps> = (entry: StoredEntry<TProps>) => EntryId | undefined;`
- [ ] **The source takes a `StoredEntry`, never the live `Entry`.** This is the one hard rule in the seam. The live `Entry` answers `children()`, `parent()`, `depth` and `descendants()`, and every one of those is built **from** this source. A source that received a live `Entry` would ask the question it exists to answer. This is load-bearing, not style.
- [ ] Register core's own source as `(entry) => entry.parentId`, like any other, with no special claim on the seam (D-S5-23).
- [ ] A plugin composes, the same way an `EditExtender` composes: it receives the current occupant and may call it.
- [ ] Put the door on the `data` half of `definePlugin`, beside `setExtender`. **This is an expert door. An app author never meets it.**
- [ ] **The seam is `setHierarchySource`** — ruled 2026-09-11 (`Q3`). Write it. The call site is `ctx.setHierarchySource((entry) => …)`, beside `ctx.setExtender`.

---

## Unit B — what core keeps

- [ ] **Core inverts the answer.** A source states one parent per Entry. Core builds the child index from it. Nothing can produce two parents for one Entry, and sibling order stays the order the Entries are in.
- [ ] **Core keeps the cost shape.** `#childrenOfWriteSet` swaps one property read for one call and stays O(children + edits).
- [ ] **Core refuses a cycle.** `ParentCycleError` (`src/data/entry-store.ts:572`) guards a `parentId` write today. Move the same guard onto the walk, because a cycle can now arrive from a source instead of from a write. A cyclic answer raises a Fault with `by: 'plugin'`, and the Entry is read as a root.
- [ ] **An unknown parent id is a root.** The source may name an id no Entry holds. Report it **once per revision**, never per read.
- [ ] **`parentId` is still stored, and `update()` still writes it.** A source that ignores the field is a plugin taking the tree over on purpose. Do not delete the field to match. Do not warn on a write to it.
- [ ] `entry-tree.ts`'s four walks take the source: `childIdsByParent`, `childCountByParent`, `depthOf`, `ancestorsOf` (`src/data/entry-tree.ts:56,67,76,86`).

**Do not** plan a source that takes the whole dataset. That makes `#childrenOfWriteSet` O(dataset) per query — the O(n²) shape that finding S1 (#212) already killed once.
**Do not** add a second seam for the Rollup. Derivation follows children (ADR 0013), and the Rollup follows derivation. A plugin that changes the tree has changed the Rollup, and the two can never disagree. A second knob could let them.
**Do not** bring grouping here. `{ source: 'group', groupBy }` is a **row source** and stays one. A group header is not an Entry, it holds no values, and it does not roll up. A hierarchy source answers with an `EntryId`, so it can only name an Entry that exists — it cannot invent a row.

---

## Unit C — the Rollup follows the source when a row moves

**Handed here from Build 1 Unit E on 2026-09-11.** It could not be done there, and the reason is what makes it this build's work.

`collectTouchedIds` (`src/data/rollup.ts:38-56`) decides which parents a commit must roll up again. It asks two questions, and neither is "what is the tree now":

- `:46` and `:52` read the **`entries` map it was handed** — stored values at a point in time — to find the **former** parent of a row that moved or was removed. A live `parent()` answers the new parent, so the old one never gets recomputed and a move silently leaves a stale aggregate behind.
- `:51`'s `'parentId' in edit` asks what the **edit wrote**. That is a write-shape check on `ProposedEdit`, and it stays exactly as it is. `parentId` is still stored and `update()` still writes it (Unit B).

- [ ] Invalidate the former parent through the **hierarchy source**, applied to the pre-edit row, not through `entry.parentId`. Core's own source is `(entry) => entry.parentId`, so nothing changes with no plugin installed.
- [ ] Keep `'parentId' in edit` as a write-shape check. **Do not turn it into a tree read.**
- [ ] A plugin whose source reads a `props` key must invalidate the same way when that key changes. **Say what happens when it does not** — a source that answers a new parent with no `parentId` edit has changed the tree without telling the Rollup. Report it, or state why it cannot happen.
- [ ] Test: a plugin owns the tree, a row moves under it, and **both** the old parent and the new parent roll up again.

---

## Unit D — the demo that proves it

- [ ] Add a harness plugin that states the parent from a `props` key, the way the ADR's example does.
- [ ] Show that a named Entry becomes a parent **in fact**: it has children, it derives, it rolls up, and Build 2's `parent` variant paints it as a summary — because it **is** one, not because a stored word said so.
- [ ] Review `harness/main.ts` for an API gap, changed or not.

---

## Tests this build adds

- [ ] A plugin source overrides `parentId`, and `children()`, `parent()`, `depth` and `descendants()` all follow it.
- [ ] The Rollup follows the plugin's tree, with no second registration.
- [ ] Two sources compose: the second receives the first and may call it.
- [ ] A cyclic answer raises a Fault with `by: 'plugin'`, and the Entry reads as a root.
- [ ] An unknown parent id reads as a root, and reports once per revision.
- [ ] A write to `parentId` still works, and raises no warning, while a source ignores it.
- [ ] **A cost test.** `#childrenOfWriteSet` stays O(children + edits) with a source installed. This guards the O(n²) shape.

---

## Gate

- [ ] The three read sites named in the precondition still read no `.parentId`, and `rollup.ts:46,52` reads the source.
- [ ] The cost test passes with a source installed.
- [ ] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log` → report the verdict line.

---

## Locked-spec edits this build owes

- [ ] `CONTEXT.md:47` — the **Hierarchy** entry defines the tree as `parentId`. It needs an edit either way: the tree is what the hierarchy source answers, and `parentId` is core's own source. Build 2 already changed "the parent look" in the same entry.
- [ ] `CONTEXT.md` — add the seam's name once the author rules on it.
- [ ] `plans/01` — `data/`'s seam list gains the hierarchy source beside the extension hook.
- [ ] `plans/02` — the plugin-author surface gains the door.
- [ ] **Extend `scripts/check-doc-examples.mjs` to `harness/docs/plugin-authoring.html`.** This is the last build, so the page now describes `src/` and its samples can compile. Until this box is ticked, no sample on that page has ever been typechecked. Handed here from the planner brief on 2026-09-11.
