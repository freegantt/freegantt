# #466 — a pass answers about any row it hands you

**Reported:** 2026-09-21. **Status:** planned, not built. Labels: `enhancement`, `api change`.

## What the issue is

A Field pass sees the tree one level deep, around the bound row only. The row an author *holds* —
a child out of `ctx.children()`, a row out of an `EditRequest` — answers nothing about its own
place in the tree. `StoredEntry` (`src/model/stored-entry.ts:17-37`) carries `id`, `parentId`,
`name`, `start`, `end`, `props`, and no structure. The pass contexts
(`src/model/field.ts:256-270`) answer for the bound row only, by design (ADR 0017).

Four cases bite. The first two are contract holes: a doc demands a check the types forbid. The
last two are missing capability.

| # | Case | Today | Evidence |
|---|---|---|---|
| 1 | A cascade cannot check a cell before it writes it | An `EditExtender` proposes a rolling-up parent's cell, the Rollup overwrites it, and the author learns after the fact from a `derived-values-dropped` report | `src/data/error-reporting.ts:244`, `plans/02-public-api.md:865`, ADR 0013 decision 5 |
| 2 | A `writeToChildren` cannot split among its leaf children | `FieldWriteToChildren`'s own doc names the case, and `ctx.children()` hands back rows that cannot answer it | `src/model/field.ts:305-318`, `harness/data.ts:53-67` |
| 3 | An Aggregator cannot prorate below depth 1 | At depth 2 a child is a parent whose value is already an aggregate over its subtree; prorating its span against a window double-counts | #459's nesting finding, the half of #465 that is not about where a value goes |
| 4 | A `compute` Field cannot walk its subtree | `ctx.children()` is one level (#214); `hierarchyParentId()` answers an id with no door to look a row up by | `src/model/field.ts:266-270` |

## What is already true, and must not be re-derived

- `EntryStore` already answers structure on the effective tree: `#hasChildren(id)`
  (`entry-store.ts:414`) reads the committed index first and reaches staged edits only through the
  `stagedParents` filter. `committedChildIds()` (`:243`) is memoized per revision.
- The Rollup already holds an effective child index for the whole pass (`rollup.ts:261`, `byParent`),
  and already rebinds the pass's tree through `readingChildrenFrom` / `readingParentFrom`.
- `write-rule.ts` already answers "does the Rollup own this cell": `resolveWriteTarget(hasChildren,
  field)`. Two readers ask it today (I14). The plugin author is the third, and holds no
  `hasChildren` to ask with.
- `Entry.descendants()` (`live-entry.ts:117-135`) is the worklist walk, with the `seen` guard a
  plugin-owned source needs. The pass version mirrors it; nobody writes a second walk.

## The decision

**A pass answers about the row it computes, and about any row it hands you. The answers go down.**

Two rules fall out of it, and both are new sentences in ADR 0017:

1. **Each surface keeps the door it already has.** A pass hands out rows, so a pass takes a row
   (`ctx.children(child)`). An `EditRequest` answers by id already (`entryAfterEdits(id)`), so it
   takes an id (`request.hasChildren(id)`).
2. **Structure goes down; values stay bound.** Structure is the same fact at every depth. A value
   is not: a bottom-up pass has written only what it has reached, so `read(key)` and `duration()`
   keep answering the bound row and nothing else.

### The pass surface

```ts
interface ComputeContext extends FieldContext {
  read<K extends FieldKey>(key: K): CoreFieldValue<K> | undefined; // unchanged — the bound row
  duration(): Duration | undefined;                                // unchanged — the bound row
  hierarchyParentId(): EntryId | undefined;                        // unchanged — the bound row
  children(row: StoredEntry): readonly StoredEntry[];              // CHANGED — takes the row
  hasChildren(row: StoredEntry): boolean;                          // NEW
  descendants(row: StoredEntry): readonly StoredEntry[];           // NEW
}
```

`RollUpContext` adds nothing. `field`, `values()`, `numericValues()` and `durations()` are about the
parent this pass is rolling up, and they stay bound.

Read the call sites:

```ts
compute: (entry, ctx) => ctx.descendants(entry).filter((row) => !ctx.hasChildren(row)).length,
writeToChildren: (total, parent, ctx) => split(total, ctx.children(parent), (child) => leaves(child, ctx)),
```

**`children()` takes a row, and does not gain a sibling.** `ctx.children()` plus `ctx.childrenOf(row)`
would be two names for one question, which is the bug #7 records. One name, one meaning: the
children this pass holds for that row. The migration is small — six call sites in `src/`, one in
`harness/data.ts`, and the doc blocks that quote them.

Inside the Rollup, `children(row)` answers the pass's own pre-built list when `row.id` is the
parent's, and `access.storedChildrenOf(row.id)` otherwise. Both read `effectiveEntry`, so the two
answers cannot disagree.

### The plugin-author surface

```ts
interface EditRequest {
  // … entries, proposed, entryAfterEdits, addedEntryIds, removedEntryIds
  /** Has this row a child, as this transaction's own body and adds leave it? Same tree
   *  `entryAfterEdits(id)` reads (D-S5-45). */
  hasChildren(id: EntryId | string): boolean;
  /** Will the Rollup overwrite this cell? A cascade that writes it anyway is dropped in silence
   *  (ADR 0013, decision 5). Reads `write-rule.ts`, the resolver the grid and `update()` read (I14). */
  rollUpOwns(id: EntryId | string, field: FieldKey): boolean;
}
```

Both ship. They are different questions: one is structure, one is cell ownership, and composing the
second out of the first means the author writes `resolveWriteTarget` by hand out of
`dataset.field(key).rollUp`. That is the re-derivation `write-rule.ts` exists to prevent.

`rollUpOwns` is the name to beat. `derives(id, field)` loses the actor, and `canWrite(id, field)`
promises a refusal that never comes — nothing throws on this edge. Run the naming skill once at
build time; do not re-open the shape.

### What this refuses, and why

| Refused | Reason |
|---|---|
| `hasChildren` on the `StoredEntry` record | Denormalizes the tree into every row. ADR 0020/0024 let a plugin-owned hierarchy disagree with the stored `parentId` on purpose, so the flag becomes a second source of truth. The issue names this one. |
| An `Entry`-shaped view over a hypothetical row | ADR 0017 refused it: two things implement `Entry`, and `entry.parent()` walks out of the pass into the store. Still refused. |
| An id door on the pass (`ctx.childrenOf(id)`, `ctx.entryFor(id)`) | An id reaches sideways and up. An Aggregator that reads an ancestor mid-pass reads a cell this pass has not written yet, and the result turns order-dependent. A row is the token of membership. |
| `ctx.read(key, row)` | Rule 2 above. When evidence arrives, this is the follow-up, not a shape to guess now. |
| Making the Rollup yield to a cascade | ADR 0013 decision 5 stands. This issue gives the extender the check that decision assumes it has. |

Core does **not** police membership. An author may capture an unrelated row and ask about it; the
pass then answers off its own tree, by id, which is a correct answer to a question nobody should
ask. Proving membership costs a walk per call on the commit path, and the doc costs nothing.

## Steps

Each step ends green (`pnpm verify:full`), and each is one commit.

**1 — `FieldAccess` learns structure.** `src/data/fields/field-access.ts`.
Add `hasChildrenOf(id): boolean` to `FieldAccess`, defaulting to `storedChildrenOf(id).length > 0`.
`readingChildrenFrom(access, { childrenOf, hasChildren })` binds both. `entry-store.ts:162` binds
`this.#hasChildren` — the allocation-free answer that already exists. `rollup.ts:274` binds
`(id) => (byParent.get(id)?.length ?? 0) > 0`. No public surface moves yet.

**2 — the three pass members.** `src/model/field.ts`, `src/data/fields/field-access.ts`.
`children` takes a row. `hasChildren(row)` reads `access.hasChildrenOf(row.id)`. `descendants(row)`
is a worklist with a `seen` guard, never recursion — `live-entry.ts:117-135` is the shape to copy.
`createRollUpContext`'s override keeps the pass's pre-built list for the parent's own id. Update
the six `ctx.children()` call sites and `harness/data.ts`.

**3 — one builder for the `EditRequest`.** New `src/data/edit-request.ts`.
`createEditRequest({ entries, proposed, added, removed, hierarchySource, committedChildIds, fields })`
returns the whole object, the two new members included. The effective child index is built on the
first call that needs it and never before — a preview frame that asks nothing allocates nothing
(I5). It reuses `checkHierarchyAnswers` + `childIdsByParent`, and takes `rollup.ts`'s own
"this commit moves no row" shortcut (#421 C4) through a helper both files call.
`build-commit-change-set.ts:147` and `gesture-pipeline.ts:712` both call it. The pipeline's dep
becomes `extraEditsFor(draft: ProposedEdits)`, wired in `api/gantt.ts:370`, so `view/` stops
hand-building a request.

**4 — `rollUpOwns`.** `src/data/edit-request.ts`, reading `resolveWriteTarget` from
`data/write-rule.ts`. Answers `true` when the row has children and the Field rolls up. It does not
report a `writeToChildren` policy — see the open question below.

**5 — the harness shows two of the four cases.** `harness/data.ts`.
Give the cost tree one more level. `writeToChildren` splits by each child's leaf count instead of
evenly, so a subtree with three leaves takes three shares. Declare a `compute` Field that counts
leaf descendants, and give it a grid column. Both are consumer-side policy written against the new
members, which is what the slice gate asks for.

**6 — docs and spec.** See the list below.

## Tests

| Case | Test | What it pins |
|---|---|---|
| — | `src/data/fields/field-access.test.ts` | `children(row)` for the bound row and for a child; `hasChildren` both ways; `descendants` order, and a source that loops terminates |
| 2 | `src/data/entry-store.mutation.test.ts` | A `writeToChildren` that splits by leaf count over a depth-2 tree; the Rollup reads back exactly the number the write asked for |
| 3 | `src/data/rollup.test.ts` | A depth-3 tree and an Aggregator that prorates leaf spans only; the parent's total equals the leaves' total at every depth |
| 3 | `src/data/rollup.property.test.ts` | fast-check over random trees: the root's prorated total equals the sum over its leaves |
| 4 | `src/data/rollup.test.ts` | A `compute` Field counting leaf descendants, read on a parent at depth 0 and depth 1 |
| 1 | `src/data/edit-extension.test.ts` | `hasChildren(id)` sees an add that promotes a row in the same transaction; `rollUpOwns` is `true` for `start` on a parent, `false` on a leaf, `false` for a Field with `rollUp: 'none'`; an extender that checks it first raises no `derived-values-dropped` report |
| 1 | `src/view/gesture-pipeline` tests | The preview path and the commit path answer `hasChildren` the same way for the same draft |

## Docs and spec

- **ADR 0017** — an amendment block, not a rewrite: the two rules above, and why the entry argument
  comes back for structure alone. Its *What a hypothetical row reads with* section (`:230-293`) and
  its refused-shapes list both need the new sentence.
- **`src/model/stored-entry.ts:5-16`** — the type's own doc says the pass "hands the answers beside
  it". Name the three answers.
- **`plans/01-domain-architecture.md:310-330`** — the context block there is stale since ADR 0017
  (it still shows `read(entry, key)` and a three-argument Aggregator). Refresh it to HEAD, then add
  the new members.
- **`plans/02-public-api.md:865`** — the paragraph that records "nothing throws on that edge" gains
  the pre-check that makes the edge avoidable.
- **`docs/edit-extension-flow.md:22`** — the `EditRequest` member table.
- **`CONTEXT.md`** — the *Rollup* and *Hierarchy source* entries; "leaf" already carries its meaning.
- **`etc/freegantt.api.md`** — regenerated (`pnpm api-report`). Adding required members to
  `ComputeContext` and `EditRequest` breaks a hand-written test double, the same trade #124 took.

## One question for you, and it blocks step 4 only

Raised on the issue for a ruling:
[#466 comment](https://github.com/freegantt/freegantt/issues/466#issuecomment-5760950516).


**An extender's write to a cell with a `writeToChildren` policy is dropped, where the same write through
`entries.update()` would be split.** `toEditsReading` (`entry-reader.ts:243-264`) checks that the
Field exists and nothing else; `#splitDerivedWrites` (`entry-store.ts:505`) runs on the consumer
door only. So today a `writeToChildren` policy is invisible to a cascade. That is defensible — a cascade
is not a user write — but ADR 0013's amendment says "each returned edit lands through the door it
would have come in by", and these two doors disagree.

- If the asymmetry is intended, `rollUpOwns` returns a boolean, as planned above.
- If it is not, this is a separate issue, and `rollUpOwns` should publish `WriteTarget`
  (`'entry' | 'children' | 'refused'`) so it never has to change shape later.

Steps 1, 2, 3, 5 and 6 do not wait on the answer.

## Acceptance

All four cases are writable by a consumer, and each one has a test written the way a consumer would
write it. The harness shows case 2 and case 4 with no re-derivation in `harness/main.ts` or
`harness/data.ts`. `ctx.children()` has no second name. The `EditRequest` is built in one place.
`verify:full PASS`, reported from the last line of the run.
