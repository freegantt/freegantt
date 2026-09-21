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
| 3 | Nothing can total the working time below a row with the gaps taken out | A parent's span is an envelope. Two children on Jan 1–2 and Jan 8–10 give a 9-day span holding 3 days of work, and no scalar on the parent recovers the 3. The leaf intervals themselves are the only answer | `measureEntryDuration`'s own comment (`field-access.ts`): `measureDuration: 'children'` sums one level and hands nesting to #428. #459's nesting finding |
| 4 | A `compute` Field cannot walk its subtree | `ctx.children()` is one level (#214); `hierarchyParentId()` answers an id with no door to look a row up by | `src/model/field.ts:266-270` |

### The non-case, written down so nobody builds for it

**A rolling-up Aggregator needs none of this.** Direct children are sufficient at every depth,
because the pass is bottom-up: Van 1's total is already correct when Depot reads it, and
`ctx.numericValues('cost')` hands Depot exactly that. No walk. No leaves. Whatever composes —
a parent's answer being a function of its children's answers to the same question — the pass already
recurses for you, and a `leaves` walk there is slower and no more correct.

An earlier draft of this issue claimed an Aggregator "double-counts below depth 1". That describes a
different mistake: prorating over `descendants`, which counts Van 1's 300 **and** Crate A's 100
**and** Crate B's 200. That is a bug in a walk nobody should write, and it argues against nothing.

So the three walking members stand on two legs, not three:

- **`writeToChildren` has no pass to lean on.** One call must weigh every child at once, with no
  bottom-up accumulation to borrow. The weights have to be walked.
- **A `compute` Field cannot recurse at all.** `ctx.read(key)` reads the bound row, and
  `ComputeContext` has no `values()` — only `RollUpContext` does. So a `compute` Field on Depot
  holds four `StoredEntry` records with no way to evaluate any Field on one of them.

Case 3 is the aggregate that does **not** compose, which is why it needs the leaf intervals and not
a scalar.

## The three words, with one tree

Every member below is one of three questions. One tree answers all three, and this tree belongs in
the doc blocks too (see *Docs and spec*). It names no project plan on purpose: core names what the
data *is*, and a depot of vans rolls up the same way a work breakdown does.

```
Depot
├── Van 1
│   ├── Crate A
│   └── Crate B
└── Van 2
```

| Asked about `Depot` | Answer | In one phrase |
|---|---|---|
| `children(Depot)` | Van 1, Van 2 | one step down |
| `descendants(Depot)` | Van 1, Van 2, Crate A, Crate B | all the way down |
| `leaves(Depot)` | Van 2, Crate A, Crate B | the bottom rows only |

Van 1 is a descendant and is not a leaf, because Van 1 has children of its own. Van 2 is both.

**`leaves(row)` includes `row` when `row` is a leaf, and `descendants(row)` never includes `row`.**
That asymmetry is deliberate, and it is the one thing about these three words a reader must be told
rather than guess. `leaves(Van 2)` is `[Van 2]`, not `[]`. The two members ask differently shaped
questions: `descendants` names a relationship *to* a row, so the row is not its own descendant;
`leaves` names the bottom rows *of a subtree*, and a subtree of one leaf has one leaf. Every doc
block and the glossary entry state this, and a test pins it.

**Why the cost split needs two of them, and why that asymmetry is load-bearing.** Split 300 over
`children(Depot)`, and weigh each share by `leaves(child).length`: Van 1 counts 2 and Van 2 counts
1, so Van 1 takes 200 and Van 2 takes 100. Van 1 then splits its own 200 over its own children,
because each returned edit lands through the door it would have come in by (ADR 0013 amendment).
Were `leaves(Van 2)` empty, Van 2's weight would be 0 and the split would pay it nothing — and the
consumer would write `leaves(child).length || 1`, which is re-derivation in the one place this issue
exists to remove. Pay a share to Van 1 *and* to Crate A and Crate B in one pass, and the tree spends
300 twice.

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
  plugin-owned source needs. The pass version mirrors it; nobody writes a second walk. `leaves` is
  that walk with a keep test inside it, never a filter over its result.
- `EntrySource.hasChildren(id)` (`live-entry.ts:32`) already names this question by id, on this
  tree, in this layer — which is why `FieldAccess` takes the same name and not a second one.

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
  descendants(row: StoredEntry): readonly StoredEntry[];           // NEW — mirrors Entry.descendants
  leaves(row: StoredEntry): readonly StoredEntry[];                // NEW — the subtree's leaf rows
  hasChildren(row: StoredEntry): boolean;                          // NEW — mirrors Entry.hasChildren
}
```

`RollUpContext` adds nothing. `field`, `values()`, `numericValues()` and `durations()` are about the
parent this pass is rolling up, and they stay bound.

Read the call sites:

```ts
compute: (entry, ctx) => ctx.leaves(entry).length,
writeToChildren: (total, parent, ctx) =>
  split(total, ctx.children(parent), (child) => ctx.leaves(child).length),
```

**`leaves(row)` ships for the two legs in *The non-case*: a `writeToChildren` with no pass to lean
on, and a `compute` Field that cannot recurse.** Both ask for leaves, and neither asks for a flag. The
first draft of this plan wrote each one as `descendants(row)` with a `!hasChildren(row)` filter, and
step 5 then put that filter in `harness/data.ts` twice. A walk the harness writes to reach an answer
the library holds is an API gap, and this plan's own Acceptance forbids one. `leaf` is core's word
already: `CONTEXT.md` carries it under **Bar producer** ("a parent (has children) or a leaf"), and
core registers a `leaf` Variant beside `summary`.

**`hasChildren(row)` and `descendants(row)` are mirrors, not new capabilities.** `hasChildren(row)`
reads `children(row).length > 0` and allocates nothing either way, and `leaves` took both of
`descendants`'s call sites. Each ships because `Entry` teaches the word on the live row
(`live-entry.ts`), and a consumer meets both surfaces in one file — `entry.children()` in a row
source, `ctx.children(row)` in an Aggregator. One word, two answers, is bug #7 verbatim. If a later
reviewer wants the pass surface cut to what a case demands, `descendants` is the member to argue
about, and the mirror is the argument against.

**`children(row)` is exactly one level, and that is load-bearing.** The Rollup is bottom-up: a
parent's value already aggregates its subtree when the pass reaches it, so `sum` over a subtree
would add each leaf twice. The `writeToChildren` split above would pay a share to a child *and* to
each of its grandchildren, and the parent's cell would read back more than the button asked for.
Each returned edit lands through the door it would have come in by (ADR 0013 amendment), so a child
that is itself a parent splits again on its own level. `descendants` and `leaves` are how a consumer
reaches past one level, under their own names.

**No question on this surface gains a sibling name.** `ctx.children()` plus `ctx.childrenOf(row)`
would be two names for one question, which is the bug #7 records. The same holds down the stack:
this plan writes `hasChildren` at every altitude that answers it, and `hasChildrenOf` at none. One
name, one meaning.

**The migration is smaller than it looks, and one lookalike is not part of it.** `ComputeContext`'s
`children` is called in four places: `harness/data.ts:58`, `entry-store.mutation.test.ts:378` and
`:394`, and `rollup.test.ts:464`. Its two definition sites are `createComputeContext` and
`createRollUpContext`'s override. Five more mentions in `src/` are prose inside doc blocks
(`entry-store.ts:160`, `rollup.ts:270`, `stored-entry.ts:11`, `field.ts:201`, `field.ts:287`) and
they need rewording, not a signature.

**`Entry.children()` does not change.** It is the live row's own method, it stays zero-argument, and
`harness/dense-tile-grid.ts:59` and `harness/plugins/phase-hierarchy.ts` call that one. A migration
that touches them has confused the two surfaces.

**Rule 4 stops speaking on this surface.** ADR 0017 rule 4 reads cost off the parentheses: a member
that does no work is a property, and a member that computes, walks or allocates carries them. That
is why `Entry.hasChildren` is a property. Here every member takes a row, so every member carries
parentheses, and `hasChildren(row)` (one index read) looks as costly as `leaves(row)` (a subtree
walk). Each member's own doc block states its cost instead, and the ADR amendment says so.

Inside the Rollup, `children(row)` answers the pass's own pre-built list when `row.id` is the
parent's, and `access.storedChildrenOf(row.id)` otherwise. Both read `effectiveEntry`, so the two
answers cannot disagree. `descendants` and `leaves` walk with `children`, so all three read one
tree.

### The plugin-author surface

```ts
interface EditRequest {
  // … entries, proposed, entryAfterEdits, addedEntryIds, removedEntryIds
  /** Has this row a child, as this transaction's own body and adds leave it? Same tree
   *  `entryAfterEdits(id)` reads (D-S5-45). */
  hasChildren(id: EntryId | string): boolean;
  /** Where does a write to this cell land — on the row, split across its children, or nowhere?
   *  A cascade that writes a cell it does not own is dropped in silence (ADR 0013, decision 5).
   *  Reads `write-rule.ts`, the resolver the grid and `update()` read (I14). */
  writeTarget(id: EntryId | string, field: FieldKey): WriteTarget;
}
```

Both ship. They are different questions: one is structure, one is cell ownership, and composing the
second out of the first means the author writes `resolveWriteTarget` by hand out of
`dataset.field(key).rollUp`. That is the re-derivation `write-rule.ts` exists to prevent.

**Structure stops at the boolean here, and that is a decision.** An extender holds no pass tree. It
holds `entries`, so today it can only find a row's children by scanning the whole map — O(n) per
call, on the commit path, which is the re-derivation this issue closes everywhere else.
`hasChildren(id)` answers the one structural question case 1 asks of a cascade: is this row a
parent, so does the Rollup reach it. A cascade that must walk a subtree is a case nobody has shown
yet. When one arrives it gets `descendants(id)` and `leaves(id)` off the same effective index this
builder already holds, so the addition costs no new index — only the two members.

**`writeTarget` publishes `WriteTarget`, ruled 2026-09-21.** The three values are the three outcomes
of one resolution: `'entry'` lands where the cascade aimed, `'children'` is refused at the row and
redirected to its children through their `writeToChildren` policy, and `'refused'` lands nothing.
Today `'children'` and `'refused'` both mean "dropped" for a cascade, so a boolean would be truthful
— and lossy the moment the asymmetry below is closed, on a published surface. The wider return costs
nothing now and cannot break later.

`WriteTarget` already exists at `write-rule.ts:31` and is internal. It moves to
`src/model/write-verdict.ts`, which already holds `WriteVerdict` and `WriteRefusalReason` for this
exact reason, with `write-rule.ts` keeping its local `Field`-prefixed alias the way it already does
for that pair. Same dance, third type.

`writeTarget` is the name. `rollUpOwns(id, field)` asked a yes/no and cannot carry three values;
`derives(id, field)` loses the actor; `canWrite(id, field)` promises a refusal that never comes —
nothing throws on this edge. Read the call site: `const target = request.writeTarget(id, 'cost')`.
Do not re-open the shape.

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
Add `hasChildren(id): boolean` to `FieldAccess` — the name `EntrySource.hasChildren` already carries
for the same question on the same tree (`live-entry.ts:32`).

**The trap, and it is why this step is first.** `readingChildrenFrom` returns `{ ...access,
storedChildrenOf }` (`field-access.ts:182`). Add `hasChildren` as a plain sibling member and the
Rollup's own call (`rollup.ts:275`) replaces the tree and **keeps the store's `hasChildren`** — so
`ctx.children(row)` would answer off the pass's effective tree while `ctx.hasChildren(row)` answered
off the store's, on exactly the commits the Rollup exists for. Two answers to one question, and this
plan states they cannot disagree. So the rebinder derives the default from the **new** tree:

```ts
export function readingChildrenFrom(
  access: FieldAccess,
  childrenOf: (id: EntryId) => readonly StoredEntry[],
  hasChildren: (id: EntryId) => boolean = (id) => childrenOf(id).length > 0,
): FieldAccess {
  return { ...access, storedChildrenOf: childrenOf, hasChildren };
}
```

`createFieldAccess`'s own default reads the **resolved** `storedChildrenOf`, never
`options.storedChildrenOf`, for the same reason: a caller that names no tree must not get a
`hasChildren` that reads a different one.

`entry-store.ts:163` now passes the third argument, `(id) => this.#hasChildren(id)`. That one
binding is what the slot is for: the store's own answer reads the committed index and skips building
an overlay Entry per staged edit, which `storedChildrenOf` cannot (`entry-store.ts:410`), and the
consumer door asks it on every write. **The Rollup passes two arguments and keeps the default.** It
keeps it for agreement, not for cost: `byParent` (`rollup.ts:261`) holds child *ids*, and the pass's
`childrenOf` maps them through `effectiveEntry` and filters the misses (`rollup.ts:277-281`), so the
default allocates two arrays per call. Reading `byParent`'s own `length` instead would be cheaper and
wrong — the filter drops a removed child, so a parent whose last child went away would answer
`hasChildren: true` while `children(row)` answered `[]`, which is the disagreement `rollup.ts:272`
exists to prevent. Cost is stated on the member's own doc, not assumed away. No public surface moves
yet.

**2 — the four pass members.** `src/model/field.ts`, `src/data/fields/field-access.ts`.
`children` takes a row. `hasChildren(row)` reads `access.hasChildren(row.id)`. `descendants(row)` is
a worklist with a `seen` guard, never recursion — `live-entry.ts:117-135` is the shape to copy.
`leaves(row)` is that same walk, and it asks `hasChildren` nowhere: the walk already fetches each
node's children, so a node whose fetched list is empty **is** the leaf. One tree read per node, one
question per node, and never `descendants` with a filter over its result.

`createRollUpContext`'s override keeps the pass's pre-built list for the parent's own id. **Both
walks go through the context's own `children`, not through `access.storedChildrenOf`**, so all four
members read one list at depth 1 and one tree below it. Reach past the override and depth 1 answers
from a second list — the values agree, because both map `effectiveEntry`, but a reader then has to
prove that, and a later change to either side breaks the proof silently.

Each member's doc block states its own cost, because the parentheses no longer state it. Carry the
tree from *The three words* into the shared doc block above the four members. Update the six
`ctx.children()` call sites and `harness/data.ts`.

**3 — one builder for the `EditRequest`.** New `src/data/edit-request.ts`.
`createEditRequest({ entries, proposed, added, removed, hierarchySource, committedChildIds, fields })`
returns the whole object, the two new members included. The effective child index is built on the
first call that needs it and never before — a preview frame that asks nothing allocates nothing
(I5). It reuses `checkHierarchyAnswers` + `childIdsByParent`, and takes `rollup.ts`'s own
"this commit moves no row" shortcut (#421 C4) through a helper both files call.
`build-commit-change-set.ts:147` and `gesture-pipeline.ts:711` both call it. The pipeline's dep
becomes `extraEditsFor(draft: ProposedEdits)`, wired in `api/gantt.ts:370`, so `view/` stops
hand-building a request.

**Keep `#extraFor`'s `try`/`catch` and its `#reportExtenderFault` call exactly where they are**
(`gesture-pipeline.ts:711-726`, #332). A bug inside the extender still throws out of `extraEditsFor`
on the rAF path, and that catch is the one place that can recover it: the frame paints with no
cascade ghost and the drag carries on. Narrowing the dep's arguments does not narrow what it throws.

**4 — `writeTarget`.** `src/data/edit-request.ts`, reading `resolveWriteTarget` from
`data/write-rule.ts`. Move `WriteTarget` to `src/model/write-verdict.ts` first, and keep
`write-rule.ts`'s local alias. The member returns the resolver's own answer unchanged — it adds no
fourth value and no reinterpretation, because two readers already ask that resolver and a third must
not disagree with them (I14). **No longer blocked:** the ruling is above.

**5 — the harness shows two of the four cases.** `harness/data.ts`.
Give the cost tree one more level. `writeToChildren` splits by each child's leaf count instead of
evenly, so a subtree with three leaves takes three shares. Declare a `compute` Field that counts
leaf descendants, and give it a grid column. Both read `ctx.leaves(row).length` and neither walks
the tree: a `descendants` call with a `!hasChildren` filter beside it is the gap step 2 closes, and
review rejects one in `harness/data.ts`. Both are consumer-side policy written against the new
members, which is what the slice gate asks for.

**6 — docs and spec.** See the list below.

## Tests

| Case | Test | What it pins |
|---|---|---|
| — | `src/data/fields/field-access.test.ts` | The `Depot` tree from *The three words*, asserted row by row: `children`, `descendants` and `leaves` each answer exactly the table's list; `descendants` order; a source that loops terminates; `hasChildren(row)` agrees with `children(row).length > 0` on every row — the mirror, pinned |
| — | `src/data/fields/field-access.test.ts` | **The self-inclusion rule.** `leaves(Van 2)` is `[Van 2]` and `descendants(Van 2)` is `[]`. Without this the weighted split pays a leaf child nothing |
| — | `src/data/rollup.test.ts` | **The rebinding trap (step 1).** A commit that moves a row: inside the pass, `ctx.hasChildren(row)` and `ctx.children(row).length > 0` agree for every row, so the Rollup's tree cannot answer one question two ways |
| 2 | `src/data/entry-store.mutation.test.ts` | A `writeToChildren` that splits by leaf count over a depth-2 tree; the Rollup reads back exactly the number the write asked for |
| 3 | `src/data/rollup.test.ts` | A depth-3 tree with a gap between two leaves. A `compute` Field totals each row in `ctx.leaves(entry)` by its own duration, and answers the work — strictly less than the row's own span, which the same test asserts |
| 3 | `src/data/rollup.property.test.ts` | fast-check over random trees: the total over `leaves(root)` equals the sum of every leaf's own duration, and never the root's span |
| — | `src/data/rollup.test.ts` | **The non-case, pinned.** A consumer Aggregator reading `ctx.numericValues(key)` alone totals a depth-3 tree correctly — no walk, no leaves. The bottom-up pass does that recursion, and this test exists so nobody adds API for it |
| 4 | `src/data/rollup.test.ts` | A `compute` Field reading `ctx.leaves(entry).length`, on a parent at depth 0 and depth 1 |
| 1 | `src/data/edit-extension.test.ts` | `hasChildren(id)` sees an add that promotes a row in the same transaction; `writeTarget` is `'refused'` for `start` and `cost` on a parent, `'entry'` on a leaf, `'entry'` for a Field with `rollUp: 'none'`; an extender that writes blind raises one `derived-values-dropped` report, and the same cascade aimed by `writeTarget` raises none |
| 4 | `src/data/edit-request.test.ts` | `writeTarget` over the `Depot` tree: `'refused'`, `'children'`, `'entry'`; the effective tree, not the committed one; and an **undeclared key** takes `resolveWriteTarget`'s own answer rather than one this reader invented |
| 1 | `src/api/dataset.test.ts` | The preview path (`extraEditsFor`) and the commit path (`entries.update`) hand one extender the same six tree answers, on a draft that moves no row and on a draft that moves one |
| 1 | `src/view/gesture-pipeline` tests | The preview path and the commit path answer `hasChildren` the same way for the same draft |

## Docs and spec

- **ADR 0017** — an amendment block, not a rewrite: the two rules above, why the entry argument
  comes back for structure alone, and a third sentence on **rule 4**. Rule 4 (`:134`) reads cost off
  the parentheses, and that is why `Entry.hasChildren` is a property. Every pass member takes a row,
  so on the pass surface the parentheses say nothing about cost, and each member's doc block says it
  instead. The rule keeps its full force on `Entry`, which is where it was written for. Its *What a
  hypothetical row reads with* section (`:230-293`) and its refused-shapes list both need the new
  sentence.
- **`src/model/field.ts`** — the shared doc block above the four pass members carries the tree from
  *The three words*, once, with the three-row table. A consumer choosing between `children`,
  `descendants` and `leaves` reads it at the surface they are typing against, not in an issue.
- **`CONTEXT.md`** — one new glossary entry, **Child / Descendant / Leaf**, with the same tree. It
  is one entry, not three: the three words are only legible next to each other.
- **`src/model/stored-entry.ts:5-16`** — the type's own doc says the pass "hands the answers beside
  it". Name the four answers.
- **`plans/01-domain-architecture.md:310-330`** — the context block there is stale since ADR 0017
  (it still shows `read(entry, key)` and a three-argument Aggregator). Refresh it to HEAD, then add
  the new members.
- **`plans/02-public-api.md:865`** — the paragraph that records "nothing throws on that edge" gains
  the pre-check that makes the edge avoidable.
- **`docs/edit-extension-flow.md:22`** — the `EditRequest` member table.
- **`CONTEXT.md`** — the *Rollup* and *Hierarchy source* entries too; "leaf" already carries its
  meaning under *Bar producer*, so the new entry states it once and those two link to it.
- **`etc/freegantt.api.md`** — regenerated (`pnpm api-report`). Adding required members to
  `ComputeContext` and `EditRequest` breaks a hand-written test double, the same trade #124 took.

## The asymmetry this issue does not fix

**An extender's write to a cell with a `writeToChildren` policy is dropped, where the same write
through `entries.update()` would be split.** `toEditsReading` (`entry-reader.ts:243-264`) checks that
the Field exists and nothing else; `#splitDerivedWrites` (`entry-store.ts:505`) runs on the consumer
door only. So today a `writeToChildren` policy is invisible to a cascade. That is defensible — a
cascade is not a user write — but ADR 0013's amendment says "each returned edit lands through the
door it would have come in by", and these two doors disagree.

**Ruled 2026-09-21: out of scope here, and `writeTarget` publishes `WriteTarget` so this issue's
surface survives whichever way it goes.** Open it as its own issue, and link it from ADR 0013's
amendment. Nothing in these six steps depends on the answer: `writeTarget` reports the resolver's
verdict, and the resolver is right either way — only what the commit path *does* with `'children'`
is in question.

## Acceptance

All four cases are writable by a consumer, and each one has a test written the way a consumer would
write it. The harness shows case 2 and case 4 with no re-derivation in `harness/main.ts` or
`harness/data.ts` — no tree walk there, and no leaf filter. One word per question at every altitude:
`hasChildren` everywhere, `hasChildrenOf` nowhere, and `ctx.children()` has no second name. The
`EditRequest` is built in one place. `verify:full PASS`, reported from the last line of the run.
