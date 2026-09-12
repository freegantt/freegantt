# Build 1 — the Entry answers questions about itself

**The ADR:** [`docs/adr/0017`](../../../docs/adr/0017-the-entry-answers-questions-about-itself.md). Read it first. It holds every decision here.

**What lands.** One row becomes two types. `StoredEntry` carries the stored values. `Entry` answers questions about the row now. Core stops re-deriving what the store already holds.

**Tick each box as you finish it.** Do not save the ticks for the end.

---

## Read this warning before you touch anything

**The `Entry` rename is not a word-boundary rename. Hard rule 5 does not protect it.**

HEAD's `Entry` is the stored values. This build renames it to `StoredEntry`. Then a **new** type takes the name `Entry`. So the old name stays valid and takes a new meaning.

- `\bEntry\b` → `StoredEntry` everywhere is wrong. It breaks every live-read site.
- `\bEntry\b` left alone is wrong. It breaks every stored site.
- **`pnpm typecheck` stays green while the meaning inverts.** Both types satisfy any position that reads only data members. The compiler will not find this for you.

Scope: **1046 references in 118 files**; 650 in 68 files excluding tests. Measured on `f61e1a5`.

**The sequence below is what makes it safe.** Do the steps in order. Do not start step B until step A is green.

---

## Unit A — rename the stored type, and nothing else

The goal is one mechanical pass with no new type in the tree. After this unit, `Entry` does not exist and `StoredEntry` means exactly what `Entry` meant.

- [ ] Rename the interface in `src/model/entry.ts` from `Entry` to `StoredEntry`.
- [ ] Run `\bEntry\b` → `StoredEntry` across `src/`, `harness/` and `e2e/`. Read every hit. Leave `EntryId`, `EntryInput`, `EntryEdit`, `EntryLook` and every other compound name alone — the word boundary already protects them.
- [ ] **Rename type positions only.** A declaration, an import, an annotation, a type argument. **Leave prose alone.** `\bEntry\b` hits comments such as *"an Entry derives"*, and the domain word there is Entry — `CONTEXT.md` keeps **one** Entry entry, and Unit B gives the name back.
- [ ] **Skip `harness/docs/` entirely.** `plugin-authoring.html` already describes the **live** `Entry` — `entry.read`, `children()`, `hasChildren` — and it already names `StoredEntry` where it means the values. A pass over it renames the page's live type and breaks the one document that has the end state right.
- [ ] Check `src/model/field.ts:12`. `CoreFieldKey` must read `keyof Omit<StoredEntry, 'id' | 'props'>`. This is finding P1, and this line is why the name earns its place.
- [ ] Check `src/model/entry.ts:179`. `ProposedEdit` must derive from `StoredEntry`. This is finding P3.
- [ ] Check `src/data/fields/field-access.ts:242`. `entryAfterEdit` takes a `StoredEntry` and returns one. Nothing changes at that line. This is finding P2.
- [ ] Check `src/model/entry.ts:204,216`. `EditRequest.entries` and `entryAfterEdits(id)` both carry `StoredEntry`. They are deliberately different states (D-S5-45). This is finding P4.
- [ ] Run `pnpm typecheck`. Fix every hit you missed.
- [ ] Confirm no **declaration or import** of the old name is left: `grep -rnE '(export|import).*\bEntry\b' src/ | grep -vE 'Entry(Id|Input|Edit|Edits|Look|Store|Tree|Reader|Field|Not|Variant)' | wc -l` → 0. **Do not grep bare `\bEntry\b` for a zero.** Prose keeps the word on purpose, and Unit B puts the type back.

**Do not** add the live type in this unit. **Do not** change any behaviour. This unit is a rename and nothing else.

---

## Unit B — declare the live type, and build it

- [ ] Declare `interface Entry<TProps>` in `src/model/`. Copy the member list from the ADR's *The `Entry`* section. It is a type only, so `model/` keeps zero runtime (`plans/01` §1.1).
- [ ] Build the `Entry` in `data/`, beside the store and the indexes it reads. `model/` declares; `data/` builds; `layout/` names the type and never the factory.
- [ ] Hold **one `Entry` per id**, and make every read live. Live means what `childrenOf` answers today: the committed index overlaid with the open write set (`data/entry-store.ts:214-218`). It does not mean `all`, which is committed-only (D-S2-21, `:167`).
- [ ] Allocate nothing per frame. The `Entry` keeps a stable identity inside a `Set`.
- [ ] Make `hasChildren` a getter on the `#hasChildren` fast path (`data/entry-store.ts:248`). Make `children()`, `parent()` and `descendants()` methods. This is the ADR's rule 4, and the next box states it — **read that one before you write these**. The first draft of rule 4 said *"a getter answers one value; a collection carries parentheses."* That is the wrong rule, and `parent()` breaks it.
- [ ] Add `read<K extends FieldKey>(field: K)`. It answers a core key, a `props` key or a `compute` Field.
- [ ] Add `duration(): Duration | undefined`. **It carries parentheses** — it computes through `time/` and allocates a `{value, unit}` object, so it is not free.
- [ ] Add the `duration: 'span' | 'segments'` option to the `Dataset`, default `'span'` (**ruled 2026-09-11**; see `Q6`). `'span'` is `end - start` with gaps counted, which is what ships. `'segments'` sums the Segments and counts no gap. `entry.duration()` reads the setting.
- [ ] Add `toInput()`. It returns exactly what `entries.add()` takes.
- [ ] Check the property-or-parentheses split against rule 4, which was restated on 2026-09-11. **A member that does no work is a property. A member that computes, walks or allocates carries parentheses.** So `hasChildren` and `depth` are properties, and `children()`, `parent()`, `descendants()` and `duration()` are methods. The rule is about cost, not about arity — `parent()` answers one value and still carries parentheses.
- [ ] Confirm every core Field reaches the row once: `name`, `start`, `end`, `segments` as properties, `parentId` as `parent()`, `duration` as `duration()`. `read(key)` still answers each of them by key.
- [ ] **`depth` is a property, and nothing stores it.** `depthOf` walks the ancestors (`data/entry-tree.ts:76`), and a walk inside a getter breaks rule 4. Cache it on the store's index beside `#byParent`, the way `hasChildren` already reads a cached index. **Do not add `depth` to `StoredEntry`** — it is not a stored value, and `CoreFieldKey` would harvest it (finding P1).
- [ ] **Give `layout/`'s tests a live row they can build.** `src/layout/items/produce-items.test.ts:43` fabricates a plain object (`spanEntry()`), and after Unit C `resolveItems` asks `entry.hasChildren`, which a plain object cannot answer. `layout/` may not import `data/`, so the test cannot call the real factory, and `model/` may hold no runtime to give it one (`plans/01` §1.1). **Write the double in `layout/`'s own test helper** — stored values plus a child list, closed over and returned as an `Entry`. It proves the seam by construction: if `layout/` can satisfy the interface from a test helper, `layout/` never needed `data/`. **Do not loosen `.dependency-cruiser.cjs`, and do not put a factory in `model/`.** If the double turns out to need something `model/` does not export, stop — that is an API gap, and `CLAUDE.md`'s stop rule applies.
- [ ] Confirm `.dependency-cruiser.cjs:63` still passes unchanged. `layout/` imports `time/` and `model/` only. Do not touch that rule.

**Do not** add `entry.update()`. The `Entry` reads; the store writes. This is refuted item 4 in [`row-redesign/README.md`](../README.md).
**Do not** add `entry.variant`. A variant is per Gantt. This is refuted item 5 in [`row-redesign/README.md`](../README.md).
**Do not** add a `removed` flag. Existence stays `entries.has(id)`.

---

## Unit C — move the read seams onto the row

Use the ADR's *Which seam gets which* table. A seam that asks about now takes an `Entry`. A seam that describes a change keeps `StoredEntry`.

- [ ] `CapabilityInputs` (`src/view/capability.ts:92-118`) loses `hasChildren` and `descendantsOf`. They collapse into the `entry` argument. Leave `lookOf` and `registeredDefaultsFor` — Build 2 deletes those.
- [ ] **Leave `fieldFor` on `CapabilityInputs`.** It is `dataset.field(key)`, and `capability.ts:202` reads the Field's `rollUp` and `editable` off it. **A row holds no Field registry**, so this is not a question about the row and it cannot collapse into the `entry` argument. The ADR's *"five functions collapse"* is corrected to three.
- [ ] `resolveItems` loses its positional `hasChildren` boolean (`src/layout/items/produce-items.ts:235`). So does `produceItemsForRow` (`:272`).
- [ ] **Delete `frame-memory.ts`'s `#parentIds` (`:53-54,75,77`).** It exists for one reason: to feed `produceItemsForRow`'s `hasChildren` callback at `:115`. The box above deletes that callback, so the whole `Set` and the rebuild that fills it go with it. Unit E's `:77` box is this deletion, not a rewrite.
- [ ] `Aggregator` loses its `children` argument (`src/model/field.ts:333` — **not `:303`, which is `RollUpContext.values`**). It becomes `(parent, ctx) => …`. `FieldDistributor` (`:325`) loses it the same way.
- [ ] **The child list moves onto `ctx`, never onto `parent.children()`.** Read this before you write the line. `rollup.ts:262-279` builds each child as `effectiveEntry(childId, entries, merged, computed)` — the store, plus this transaction's `merged` edits, plus the values this same bottom-up pass already computed for that child. `computed` never reaches the store, so a live `parent.children()` inside an Aggregator reads a child **without** the value the pass just gave it, and bottom-up rollup stops working. Add `ctx.children` and keep the Rollup's own list in it.
- [ ] **Keep `RollUpContext.values()`, and bind it.** `values()` and `numericValues()` read `ctx.children` and take no argument. `data/rollup.ts:23-26` holds two edit sets for two questions — `body` and `merged` — and deleting these reads is a bug, not a tidy-up.
- [ ] `entry-store.ts:467`'s `distribute(value, children, parent, ctx)` loses `children` the same way. Its list is `this.childrenOf(id)` — the store's own — so bind it into the same `ctx.children`.
- [ ] Delete `dataset.entries.childrenOf`. Call sites become `entries.get(id)?.children() ?? []`.
- [ ] Delete the re-derivations in `src/view/gantt-shell.ts:1141,1148`. **`:1142` holds a third `childrenOf`**, inside `descendantsOf` — it goes with the `descendantsOf` input, so read all three lines, not two.
- [ ] **Leave `#hasChildren` private** (`src/data/entry-store.ts:248`). The ADR's *"`#hasChildren` stops being private"* is withdrawn: `layout/` may not import `data/`, so nothing outside the store gains a caller, and a public one is a second door onto `entry.hasChildren`. The live getter calls it.
- [ ] Keep `spansTime(entry)` a free function. It narrows the type, and a getter cannot. It reads `start` and `end`, so it serves both types.

---

## Unit D — one value door

> **`Q7` blocks the second half of this unit. Read it in [`../BUILD-LOG.md`](../BUILD-LOG.md) before you start.**
>
> The first two boxes are decided and unblocked. The four boxes that delete `FieldContext.read` and `FieldContext.durationOf` are not: three of their callers read a row the store does not hold — the Rollup's effective child, the ChangeSet's post-edit row, and every `compute` Field. `entry.read(key)` answers for the row **now**, so it cannot serve them. **Do the first two boxes, stop at the third, and report.** Do not invent the replacement.

- [ ] Delete `dataset.entries.fieldValue` (`src/model/dataset.ts:28`). **77 references in 14 `src/` files**, plus 23 more in `harness/` and `e2e/` — 100 in 21 files. Each becomes `entry.read(key)`.
- [ ] Take `entry.props` off the read surface. `read()` is the one value door. `entry.props` is storage: it misses a `compute` Field and it does not know the Field's type.
- [ ] **Change `harness/planner.ts:69,85,174` to `entry.read(...)` when you take `props` off.** Those three casts are `entry.props as PlannerEntryProps`, and the box above stops them compiling. **Leave the three at `:104,114,116`** — `fieldValue as Instant` on `ColumnCellRendererContext.fieldValue`, which this build does not touch. Those three are `Q2`'s evidence, and they are the ones the *"leave the six casts"* instruction is really about.
- [ ] Delete `FieldContext.durationOf` (`src/model/field.ts:286`, `src/data/fields/field-access.ts:133`). **Ruled 2026-09-11.** Callers: `core-fields.ts:106` becomes `compute: (entry) => entry.duration()`; `aggregators.ts:14` becomes `entry.duration()`.
- [ ] Delete `FieldContext.read` (`src/model/field.ts:283`, `src/data/fields/field-access.ts:126`). Callers: `aggregators.ts:51` becomes `child.read(ctx.field)`; `change-set.ts:72` becomes `current.read(key)`.
- [ ] **Delete `fieldContextFor()` in `src/extensions/features/inline-editing.ts:109-126`.** It hand-builds a `FieldContext` out of public reads, and `read` and `durationOf` are its only two members. Both now live on the row, so the function has nothing left to build. Delete its comment at `:110-111` too — it names a `durationOf` in `layout/` that does not exist.
- [ ] Check what `FieldContext` has left. With `read` and `durationOf` gone it holds `timeZone` alone. **Ask whether it still earns a type** before you keep it. `RollUpContext` extends it and keeps `field`, `values()` and `numericValues()`.
- [ ] Confirm `entry.duration()` computes from `start` and `end` through `time/`. **It must not route through `read('duration')` and the Field registry**, or the circle has only moved. The Field declaration delegates to the row, not the reverse.

---

## Unit E — three sites stop reading `.parentId`

Build 4 cannot land until this unit is complete. A site left reading the stored field disagrees with the library the moment a plugin owns the tree.

- [ ] `src/layout/rows/entries-source.ts:16` asks `entry.parent()`.
- [ ] `src/layout/frame-memory.ts:77` — the `#parentIds` rebuild. Unit C already deleted the `Set` and its one reader, so this line goes with them.
- [ ] `src/view/tree-collapse.ts:111,153` ask `entry.parent()` or `entry.hasChildren`.
- [ ] **Never write `entry.read('parentId')` for the tree.** It reads the stored field, so the moment [0020](../../../docs/adr/0020-a-plugin-may-own-the-hierarchy.md) lands it disagrees with `entry.parent()` on the same row. The tree has one door and it is `parent()`, `children()`, `hasChildren` and `descendants()`.
- [ ] **Leave `src/data/entry-reader.ts:229,567` alone.** Those two **write** the stored value. They stay.
- [ ] **`src/data/rollup.ts:46,52` is not in this unit. Build 4 takes it.** `collectTouchedIds` reads the `entries` map it was handed — stored values, not the store's now — to find the **former** parent of a moved row, and `:51`'s `'parentId' in edit` asks what the edit **wrote**, which is a write-shape check on `ProposedEdit`. Ask a live `parent()` there and the pass misses the former parent and skips a Rollup after a move.

---

## What this build does not do

- [ ] **Do not file a `Q` for either open question. Both already exist** — `Q2` (the renderer contexts and `TProps`) and `Q7` (what reads a Field off a row the store does not hold). Add to the entry in [`../BUILD-LOG.md`](../BUILD-LOG.md); never open a second one.
- [ ] `Q2` stays open and is **deferred past this redesign**. Leave `harness/planner.ts:104,114,116` — `fieldValue as Instant` — exactly as they are. They are the evidence of the gap, and tidying them hides it. The other three casts are `entry.props`, and Unit D's box changes them because they stop compiling.

---

## Tests this build adds

- [ ] One `Entry` per id, and identity is stable across reads.
- [ ] A read is live inside an open transaction: the committed index overlaid with the write set.
- [ ] `all` stays committed-only, and does not follow the write set (D-S2-21).
- [ ] `hasChildren` allocates nothing. `descendants()` walks once.
- [ ] `entry.read()` answers a core key, a `props` key and a `compute` Field.
- [ ] `entry.duration()` and `entry.read('duration')` answer the same value and the same unit.
- [ ] `entry.duration()` answers `undefined` when either date is absent, and never `NaN` (ADR 0012).
- [ ] `entry.duration()` counts gaps under `'span'` and skips them under `'segments'`, on an Entry with two Segments and a gap between them.
- [ ] The two settings agree on an Entry with one Segment and no gap.
- [ ] `entry.duration()` always answers `unit: 'millisecond'`. **This is #274's second half** — `formatDuration` (`core-fields.ts:52`) divides by `MS.DAY` and `compareDuration` (`:59`) subtracts raw values, and neither reads `unit`. One producer makes both correct by construction.
- [ ] A `parseValue` that reads a sibling Field still works after `fieldContextFor()` is deleted.
- [ ] An `Entry` for a removed id keeps its last values, and `entries.has(id)` answers false.
- [ ] A `compute` Field walks `entry.children()`. This closes [#214](https://github.com/Pawel-IT/FreeGantt/issues/214).

---

## Gate

**Read each grep before you run it.** Two names come back on purpose.

- [ ] `grep -rn '\bStoredEntry\b' src/ | wc -l` → non-zero, and `\bEntry\b` also returns hits. **That is correct after Unit B** — `Entry` is the live type now. The `\bEntry\b` → 0 check belongs to the end of Unit A only, before the live type is declared.
- [ ] `grep -rn 'entries\.fieldValue\|\.fieldValue(' src/ harness/ e2e/ | wc -l` → 0. **Do not grep bare `fieldValue`.** `ColumnCellRendererContext.fieldValue` is a renderer payload name, it is untouched by this build, and Q2 owns its future.
- [ ] `grep -rn '\bchildrenOf\b' src/ harness/ | wc -l` → 0. **Do not grep bare `childrenOf`.** `#childrenOfWriteSet` is a private store method and it stays — ADR 0020 depends on its cost shape.
- [ ] `grep -rn "read('parentId')\|read(\"parentId\")" src/ harness/ | wc -l` → 0. The tree is never a by-key read.
- [ ] `grep -rn 'parentIds' src/layout/ | wc -l` → 0. `frame-memory.ts`'s `Set` is gone.
- [ ] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log` → report the verdict line.

---

## Locked-spec edits this build owes

- [ ] `CONTEXT.md` — keep **one** Entry entry. Name `StoredEntry` inside it, as what the Entry's stored values are called. It is not a second concept. `CONTEXT.md:37`'s *Avoid* list still bans "record" and "row", so the prose says *stored values*.
- [ ] `plans/02` — `entries.fieldValue` and `entries.childrenOf` leave the surface. Four call sites at `:352`, `:473-475`, `:751`. `UnknownFieldError` and `EntryNotFoundError` both name that door.
- [ ] `plans/01` — the `Aggregator` signature loses `children`, and `RollUpContext` gains `ctx.children`.
- [ ] `harness/docs/plugin-authoring.html` — three places state a question this build closes. `:245` still says *"Open: two names"*, and the names were ruled. `:678-684` says two doors *"retire"* as a proposal, and they are ruled. `:683` teaches duration as `entry.read('duration')` alone, and the row now has `duration()`. **Correct the prose only.** Build 4 owns extending `scripts/check-doc-examples.mjs` to this page, so no sample here is typechecked yet.
- [ ] `plans/02` and `CONTEXT.md` — the `duration` Field gains the `'span'` / `'segments'` setting.
- [ ] `plans/02:467` — it says `durationOf` stays and names `ctx.read(entry, 'duration')`. Both go. Aggregators read `entry.duration()`.
- [ ] Close [#214](https://github.com/Pawel-IT/FreeGantt/issues/214) and [#274](https://github.com/Pawel-IT/FreeGantt/issues/274).
