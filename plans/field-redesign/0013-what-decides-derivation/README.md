# ADR 0013 — what decides that a row derives its values

**The decision:** [`docs/adr/0013-…`](../../../docs/adr/0013-what-decides-that-a-row-derives-its-values.md)

A derived value lives in the store and never reaches the Document. A kind conversion promotes **and** demotes. Behind both sits one question that the single-ADR draft asked four separate times.

## Where it stands

**One decision is open — 26, the head.** Four numbers that used to stand as peers are now its branches: **8, 20, 21 and 24**. Two are closed — 5 and 6.

**It lands third**, after [0012](../0012-optional-dates/README.md) and [0011](../0011-consumer-values-in-props/README.md). 0012 is a hard gate: this ADR demotes an Entry to *"a normal Entry with no dates"*, and `model/entry.ts:31-33` makes `start` and `end` **required** today.

---

# 26. What are the inputs to the derivation predicate, and which of them are stored?

**Raised 2026-09-09 by the split, from a question that was already parked.** The old folder parked it as *"whether `rollUpKinds` is the right axis at all, or whether a per-entry flag should carry 'do my values derive?'"*. Parking it hid the fact that four open decisions were all editing the same predicate.

## The predicate is one line, and the code says so

Every question below changes `rollup.ts`:

```ts
// rollup.ts:69 and :75 — parentsToRecompute
if (kinds.has(entry.kind)) parents.add(entry.id);

// rollup.ts:184 — the childless guard
if (!childIds || childIds.length === 0) continue;
```

**Two stored inputs and one structural one.** `entry.kind` is stored on the record. `kinds` is the `rollUpKinds` config set. Having children is structure, and it already gates the pass at `:184`.

## The three answers

| | Where derivation comes from | What it costs |
|---|---|---|
| **(a)** | **Stored `kind` × the `rollUpKinds` config set** — today | Two inputs, one stored per row and one per Dataset. A config flip has no `ChangeSet` row (branch 24), and demotion has to write *some* kind (branch 8) |
| **(b)** | **Structure** — an Entry derives when it has children. `kind` becomes calculated | Deletes branches 8 and 24 outright. Takes `kind` away from the renderer registry, which is the half that does not fit here |
| **(c)** | **A stored per-entry flag** | Emits an ordinary Field row, so undo reverses flag and values in one step. Presupposes an opt-in unless it is a tri-state, and its layer answers to ADR 0002 |

## The four branches, and which answer keeps each one alive

| Branch | Question | Survives under |
|---|---|---|
| **8** | What kind does demotion write? | **(a)** and **(c)**. Under (b) there is no target kind to write |
| **20** | Is `kind` authored at all? | **This is the head question's first half.** Its *rendering* half does not fold in — see below |
| **21** | Which layer owns the per-entry flag? | **(c)** only. And that half answers to ADR 0002, not to this ADR |
| **24** | How does undo reverse a `rollUpKinds` flip? | **(a)** and **(b)**. Under (c)-in-core the flag emits an ordinary Field row and this dissolves |

**At most two branches survive any answer.** That is the whole reason to combine them: answered as four peers they read as sprawl, and three of the four answers are conditional on an unasked question.

## Two halves do not fold in, and both stay visible

- **20's rendering half.** `view/renderer-registry.ts:35` allocates one bar slot per kind (`bar:${kind}`), and `EntryKind` is open (`model/entry.ts:7`). Make `kind` calculated and bar-renderer selection loses its authored key. That reaches `view/`, and it is not a derivation question. **[0012](../0012-optional-dates/README.md) shrinks it**: a demoted Entry is dateless, so it draws no bar and the renderer choice goes quiet for exactly the row branch 8 argues about.
- **21's layer half.** Core `data/` or the plugin — ADR 0002 is the document it answers to.

## Parked beside it

**Let the consumer decide how a value rolls up, in the Rollup callback.** This ADR ships the blanket rule; a per-call Aggregator answer is a later ADR.

---

# The branches

## 8. What does demotion return an Entry to?

**Answer before this ADR's build.** Without a target kind, demotion cannot run, and a stale `'group'` under the omission rule is a rolling-up row with no dates rather than a normal Entry that can be dated later.

Two halves are already settled. The conversion runs **both ways** and stays automatic. The dates on demotion are **absent** — a normal Entry with no dates, which can be dated later. What is open is the **target kind**.

Promotion writes one kind, `'span'` → `'group'`. Demotion has no single answer:

- Returning every childless rolling-up Entry to `'span'` overwrites the kind of a group a consumer **authored** childless.
- Remembering that *we* promoted needs a stored marker, which is a fourth thing the Document carries.
- **The third answer deletes the question: stop storing parent-ness.** That takes `'group'` out of `EntryKind`, leaves `kind` naming only what a row *is*, and re-points `rollUpKinds`.

**Decision 20 subsumes this.** The third answer is the narrow form of 20's question, *should `kind` be authored at all?* If 20 lands on *calculated*, this decision dissolves rather than being answered. Do not settle 8 before 20 unless 20 is deferred on purpose.

---

## 20. Should `kind` be authored at all?

**Raised 2026-09-09 by the author, from decision 18's cost table. No recommendation — the question is being recorded, not answered.**

`kind` turned up in 18 as a core Field nothing declares editable, which put `update(id, { kind: 'milestone' })` on the list of calls that would start throwing.

**The question, in three parts.**

1. Should `kind` be a **calculated** Field rather than an authored one — derived from structure the way promotion and demotion already derive it?
2. If it is calculated, is a **milestone** then a custom column a consumer defines, rather than a built-in kind?
3. That assumes a custom column can change **the appearance of the bars on the chart**. If it cannot, that is a limit of our API, and the limit is the finding.

**Part 3's premise does not hold at HEAD, and it fails in a specific way.**

- Bar appearance is keyed by **`kind`**, not by a column. `barRenderer` takes `BarRenderer | RendererByKind`, and the renderer registry allocates one bar slot per kind (`view/renderer-registry.ts:34`, `bar:${kind}`, D-S5-12).
- A Grid column carries `cellRenderer`, which paints a **grid cell**. Nothing on a column reaches the timeline.
- So a consumer who wants a differently-drawn bar defines a **kind** and registers a renderer for it. Kinds are already open — `EntryKind` is `'span' | 'group' | 'milestone' | (string & {})` — and two plugins may each define their own and both install.

**Where it collides.** `plans/01` §2.5 rules *"`Entry.kind` is authored, never derived from having children"*, which default-on `autoGroup` already contradicts at HEAD. Decision **8**'s third answer is a narrower version of this question. If 20 is answered *calculated*, 8 dissolves. If *authored*, 8 still needs its own answer.

**This is larger than ADR 0011** and is recorded here because 18 surfaced it. It reaches `plans/01` §2.5, `EntryKind`, `rollUpKinds`, the renderer registry and the capability resolver.

**Parked beside it, from decision 6's surviving half:** whether `rollUpKinds` is the right axis at all, or whether a per-entry flag should carry *"do my values derive?"*. Two comparable products put it on the record and neither ships a kind set. Both questions ask whether structure or a stored value should decide how a row behaves. **Parked, not blocking.**

---

## 21. Which layer owns a per-entry *"do my values derive?"* flag?

**Raised 2026-09-09 by a review of a proposed `Entry.authoredValues`. Gates no group** — nothing schedules the flag. It gates the flag's design, and the answer is cheap now and expensive after release.

The flag turns the Rollup off for one Entry. That Entry's rolled-up values become authored: writable through the API, editable in the grid, written to the Document.

**The proposal put the flag on `Entry`, in `model/`, and in `CORE_FIELDS`.** ADR 0011's deferred row and [`evidence.md`](../shared/evidence.md) say the opposite — *the analogue is the per-entry pin flag, which is scheduling-plugin data (ADR 0002)*. ADR 0002 moved that flag out of the record on purpose.

**Neither placement is obviously right.**

- **Core.** The Rollup is `data/`'s own commit step, and `rollUpKinds` is a core `DatasetOptions` key. An opt-out from a core pass, gating a core config, is core data. A Gantt with no plugin installed still rolls up, and it has no way to say *stop*.
- **Plugin.** ADR 0002 pulled the pin flag out of the record because a host building a resource view paid for scheduling machinery it never used. A second per-Entry *"do not compute my dates"* flag, one layer away from the first, is the #7 failure: two concepts, near-identical names, and nothing says which.

**The two flags may be one flag. Answer that before answering the layer.** A consumer who pins an Entry and also opts it out of the Rollup holds two flags that say one thing.

**Verified against the code, and true whichever layer wins:**

- **A stored flag solves what a config cannot.** `ChangeSet.updated` is `FieldUpdated | StoreRowUpdated` (`model/change-set.ts`), and neither shape holds a config key. A flag emits an ordinary row. Decision 6's open follow-up does not arise.
- **The flip needs no new rule.** `collectTouchedIds` adds every edited id, so clearing the flag recalculates in the **same** transaction — one ChangeSet, one undo step, flag and values together. Flipping out is free, because rolled-up values already sit on the Entry (D-S4-6).
- **The Rollup skip is one predicate.** Per-Field, it sits beside `editProposesField` (`rollup.ts:196`). Whole-Entry, it sits in the kind filter (`rollup.ts:81`).
- **A leaf that carries the flag needs no warning.** `rollup.ts:184` skips a childless parent already. A warning would fire on every ordinary `remove()` of a last child, which decision 6's own reasoning refuses.
- **A core flag must be a `Field`.** `entryAfterEdit` (`fields/field-access.ts:163`) walks `CORE_FIELDS` as an allow-list, so an undeclared `Entry` key never survives an overlay. The flag then needs `editable: true` — see decision 18 — and no `column`.
- **An opt-out is not neutral about the axis.** It presupposes an opt-in, so shipping one fixes `rollUpKinds` as the base layer. If the flag is meant to **replace** the axis, the shape is a per-Entry tri-state — *derive / do not derive / follow the config* — not a boolean. That half stays in decision 20.

**Two keys, not one, whenever this ships.** `Entry.authoredValues` and `EntryDocument.authoredValues`. If decision 12 lands on a reserved list, both join it in the commit that writes the list.

**Widening the stored type later needs a schema bump.** Ship `true`, then write `['cost']` at the same schema, and a released build reads the array, tests `=== true`, and **silently re-derives the cell**. Decision 3's guard fires on the schema number alone. `readers` is a map, so the bump is one line (`serialization/read.ts`). A union-aware reader written today prevents nothing: the reader that will be wrong is the one already shipped.

**No recommendation.** The layer is a boundary question, and ADR 0002 is the document it answers to.

---

## 24. How does undo reverse a `rollUpKinds` flip?

**Raised 2026-09-09 inside decision 6's ruling. Blocks this ADR's build**, which implements the drop at all three doors.

Decision 6 is closed: an Entry that starts rolling up **drops** its authored values and the Rollup recalculates them, at all three doors, with no error. This is the one door where that ruling does not complete.

**Why the flip is different from the other two doors.** Promotion and a `kind` write carry their cause inside the transaction — a `parentId` write, a `kind` write — so undo reverses the cause and the drops together. A `rollUpKinds` flip's cause is a **config assignment**, and `ChangeSet` has no row shape for one: `added`, `removed` and `updated` each name a store entity. So undoing that step restores the values while `rollUpKinds` still rolls them up, and the next commit that touches the subtree drops them again.

**Two ways out, and the flip needs one.**

- **The undo step reverses the config key beside the values.** This matches decision 6's own logic — undo reverses the user's action, and the action was *turn rolling-up on*. `DatasetState.setRollUpKinds:289-293` swaps two references today, so the transaction is work this ruling already gives itself. The price is a `ChangeSet` that carries something that is not a store entity, or an undo step that holds a side effect the ChangeSet does not describe.
- **The flip's drops stay out of history, and `rollUpKinds`'s own documentation says so.** Cheapest, and honest as long as it is written down. The price is one config key whose edits are not undoable, against `plans/02`'s posture that every mutation is one transaction.

**Decision 21 would close this at no cost, and that is worth weighing before either option.** A stored per-entry derive-off flag emits an ordinary Field row, so undo reverses the flag and the values in one step and this decision does not arise. 21 gates no group, so it can be answered here or ignored here.

---


---

# Closed decisions

## 5 — a plugin cascade's write to a derived cell is dropped, with a warning

**Closed 2026-09-09. Ruled by the author.**

A plugin cascade that writes a rolling-up Field on a rolling-up parent has that write **dropped**, and the library raises one warning through `raiseError` at `severity: 'warning'` (ADR 0009).

`entries.update()` throws `DerivedFieldNotWritableError` for the same write. A cascade does not, because the guard sits at the public door and the hook reads through a different one. **That placement is deliberate** — a plugin author learns no rule and checks no predicate. **Exempt from the throw was never the same as the write surviving**, and the honest end of that exemption is a drop the author can see.

**Why not let it stand.** `toJSON` omits a derived value in any case, so a cascade that won the pass would still lose at the next save. Letting it stand publishes a number whose whole lifetime is one transaction.

**One code defect to fix first**, and the order matters: unify the proposed-Field predicate before this ADR deletes the `body`/`merged` split. See [`refuted.md`](../shared/refuted.md) item 8.

## 6 — an Entry that starts rolling up drops its authored values

**Closed 2026-09-09. Ruled by the author.** Was: *does a `rollUpKinds` flip refuse or destroy?*

**It drops and recalculates. The library never refuses, at any door.**

**The reason is the author's own story, and the draft had lost sight of it.** A person types `cost: 500` on a row. They then decide that row is a parent, and they give it children. A `cost` on a parent comes from its children, so `500` has no meaning any more and the Rollup replaces it. **Throwing there refuses an ordinary edit over a value the author is plainly finished with.** No product asks a person to empty a cell before they may indent a task under it.

Three doors reach the same state, and all three behave alike: autoGroup promotion, a `kind` write, and a `rollUpKinds` flip. Flipping a kind **out** of the set keeps the last derived answer, now authored (D-S4-6).

**This ruling follows the ADR's own rule rather than bending it.** *Name a Field and the library answers; change the structure and the library keeps what is yours.* `update('p', { props: { cost: 999 } })` on a parent that already rolls up **throws** — the caller named `cost`. `add({ id: 'c', parentId: 'p' })` **drops** `p`'s authored `cost` — the caller named a parent, not a Field. Same split as *`update()` refuses; `add()` drops*, one level out.

**Undo was the draft's stated reason to refuse, and it does not hold** — see [`refuted.md`](../shared/refuted.md) item 12. **History is never cleared, and `RollUpKindsWouldDropValuesError` is not added.**

**One follow-up on one door, and it is open as decision 24.** The flip is a transaction: it emits one ChangeSet, enters undo as one step, and `beforeChange` may veto it. Promotion and a `kind` write carry their cause in that transaction; a flip's cause is a **config assignment**, which `ChangeSet` has no row shape for. **This ruling does not answer that door**, and it is a follow-up rather than a re-opening — the drop-and-recalculate ruling above stands at all three doors either way. The two ways out are weighed in [`open-decisions.md`](README.md) under 24.

**Still parked, and untouched by this ruling:** whether `rollUpKinds` is the right axis at all. That sits beside decision 20, and the flag's layer is decision 21.


---

# The work

## The build

One structural question at every door: *is this a rolling-up kind, and is this a rolling-up Field?* I14 is the **write** half. `toJSON` is not a write.

**This ADR fills the resolver's derived arm.** [0011](../0011-consumer-values-in-props/README.md) moved the resolver into `data/` with HEAD's policies unchanged; the derived policy lands here, because it is written against the merged patch 0011 produces. [0015](../0015-write-door/README.md) owns the editable arm. `DerivedFieldNotWritableError` is 0011's error to declare and this ADR's to throw.

| Door | Answer | State |
|---|---|---|
| cell editor, bar drag | refused | already true (`view/capability.ts:119`) |
| `entries.update()` | refused | **the change** — move `rollsUp` into `data/` |
| `entries.add()`, `new Dataset({ entries })`, `fromJSON` | value **dropped**, report raised | **the change** |
| the extension hook | write **dropped**, warning raised | decision 5, closed — exempt from the throw only |
| autoGroup promotion | dates change owner mid-commit | **unowned until now** |
| `toJSON` | key **omitted** | **the change** |

- Promotion is the third door into a rolling-up kind. Conversion **promotes and demotes**, and stays automatic. What kind demotion returns to is **decision 8** — answer before this group. Dates on demotion are settled: a **normal Entry with no dates**, datable later.
- The report goes through `raiseError` at `severity: 'warning'`, **always**. Not `isDevMode()`-gated (D-S5-41).
- One report per operation, not per value.
- Delete `reportCorrectedRollUps`.
- On a rolling-up parent, an Aggregator's `undefined` means **no value**.
- **Unify the proposed-Field predicate before deleting the `body`/`merged` split** — decision 5's one code fix, see [`refuted.md`](../shared/refuted.md) item 8.

