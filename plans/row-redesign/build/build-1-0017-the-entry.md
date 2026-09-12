# Build 1 — the Entry answers questions about itself

**The ADR:** [`docs/adr/0017`](../../../docs/adr/0017-the-entry-answers-questions-about-itself.md). Read it first. It holds every decision here.

**What lands.** One row becomes two types. `StoredEntry` carries the stored values. `Entry` answers questions about the row now. Core stops re-deriving what the store already holds.

**Tick each box as you finish it.** Do not save the ticks for the end.

---

## Read this warning before you touch anything

**This rename is the one hard rule 5's `pnpm typecheck` cannot confirm.**

HEAD's `Entry` is the stored values. This build renames it to `StoredEntry`. Then a **new** type takes the name `Entry`. So the old name stays valid and takes a new meaning.

- `\bEntry\b` → `StoredEntry` everywhere is wrong. It breaks every live-read site.
- `\bEntry\b` left alone is wrong. It breaks every stored site.
- **`pnpm typecheck` stays green while the meaning inverts.** Both types satisfy any position that reads only data members. The compiler will not find this for you.
- **Use `pk-rename-symbol`** (`.claude/skills/pk-rename-symbol/SKILL.md`). It renames through the language service, so it follows re-exports and aliases and skips prose — which is the half a `\bEntry\b` replace gets wrong.

Scope: **1046 references in 118 files**; 650 in 68 files excluding tests. Measured on `f61e1a5`.

**The sequence below is what makes it safe.** Do the steps in order. Do not start step B until step A is green.

---

## Unit A — rename the stored type, and nothing else

The goal is one mechanical pass with no new type in the tree. After this unit, `Entry` does not exist and `StoredEntry` means exactly what `Entry` meant.

- [x] **Rename with `pk-rename-symbol`, not with a text replace.** `.claude/skills/pk-rename-symbol/SKILL.md` renames through the TypeScript language service, so it follows re-exports and aliases, it touches type positions only, and it never reaches prose. `CLAUDE.md` names it as the rule for exactly this job. A `\bEntry\b` pass over 1046 references cannot tell a type from the word in a sentence, and this file's own gate cannot catch what it misses (below).
- [x] Rename the interface in `src/model/entry.ts` from `Entry` to `StoredEntry`. Compound names — `EntryId`, `EntryInput`, `EntryEdit`, `EntryLook` — are separate symbols and the language service leaves them alone.
- [x] Run `pnpm typecheck` immediately after. The rename is green or it is wrong; there is no third state while only one type exists.
- [x] **Leave prose alone.** Comments such as *"an Entry derives"* keep the domain word — `CONTEXT.md` keeps **one** Entry entry, and Unit B gives the type name back.
- [x] **Skip `harness/docs/` entirely.** `plugin-authoring.html` already describes the **live** `Entry` — `entry.read`, `children()`, `hasChildren` — and it already names `StoredEntry` where it means the values. A pass over it renames the page's live type and breaks the one document that has the end state right.
- [x] Check `src/model/field.ts:12`. `CoreFieldKey` must read `keyof Omit<StoredEntry, 'id' | 'props'>`. This is finding P1, and this line is why the name earns its place.
- [x] Check `src/model/entry.ts:179`. `ProposedEdit` must derive from `StoredEntry`. This is finding P3.
- [x] Check `src/data/fields/field-access.ts:242`. `entryAfterEdit` takes a `StoredEntry` and returns one. Nothing changes at that line. This is finding P2.
- [x] Check `src/model/entry.ts:204,216`. `EditRequest.entries` and `entryAfterEdits(id)` both carry `StoredEntry`. They are deliberately different states (D-S5-45). This is finding P4.
- [x] Confirm the old type is gone. **This grep is a smoke test, not a gate**, and a green `pnpm typecheck` is not one either — while one type exists, the compiler cannot see a meaning invert:
      ```bash
      grep -rnE '\bEntry\b' src/ --include=*.ts | grep -vE 'Entry(Id|Input|Edit|Edits|Look|Store|Tree|Reader|Field|Not|Variant)'
      ```
      Read what comes back. Prose keeps the word on purpose, so this does not go to zero. **Do not pipe it to `wc -l` and take a number** — an import line usually names `Entry` beside `EntryId`, so a filter on compound names drops the whole line and hides the leftover it was looking for. The language service is what makes this pass safe; the grep only confirms it.

**Do not** add the live type in this unit. **Do not** change any behaviour. This unit is a rename and nothing else.

---

## Unit B — declare the live type, and build it

- [x] Declare `interface Entry<TProps = Record<string, unknown>>` in `src/model/`. Copy the member list from the ADR's *The `Entry`* section. **Keep the default type argument** — HEAD's `Entry` carries `TProps = Record<string, unknown>` (`model/entry.ts:27`), and dropping it breaks every bare `Entry` annotation in the tree. It is a type only, so `model/` keeps zero runtime (`plans/01` §1.1).
- [x] Build the `Entry` in `data/`, beside the store and the indexes it reads. `model/` declares; `data/` builds; `layout/` names the type and never the factory.
- [x] Hold **one `Entry` per id**, and make every read live. Live means what `childrenOf` answers today: the committed index overlaid with the open write set (`data/entry-store.ts:214-218`). It does not mean `all`, which is committed-only (D-S2-21, `:167`).
- [x] **`all` hands back live rows, and *which* rows it hands back stays committed-only.** Read the ADR's rule 2 before you write this. The array is a `computed` bound to `#revision` and `ScaleBinding` compares it by reference (D-S1.5-4, `entry-store.ts:150-153`) — that does not change. Its elements become live `Entry` objects, which is what lets `gantt-shell.ts:725` keep feeding `layout/` one list. `has`, `get` and `size` stay the live membership doors.
- [x] Allocate nothing per frame. The `Entry` keeps a stable identity inside a `Set`.
- [x] Make `hasChildren` a getter on the `#hasChildren` fast path (`data/entry-store.ts:248`). Make `children()`, `parent()` and `descendants()` methods. This is the ADR's rule 4, and the next box states it — **read that one before you write these**. The first draft of rule 4 said *"a getter answers one value; a collection carries parentheses."* That is the wrong rule, and `parent()` breaks it.
- [x] Add `read<K extends FieldKey>(field: K)`. It answers a core key, a `props` key or a `compute` Field.
- [x] **`read('parentId')` answers `parent()?.id`, not the stored field** (ruled 2026-09-11; ADR 0017, *A live row answers one tree*). A live row answers one tree through every door it has. `update(id, { parentId })` still writes the stored field, and `StoredEntry.parentId` is still what it wrote.
- [x] Add `duration(): Duration | undefined`. **It carries parentheses** — it computes through `time/` and allocates a `{value, unit}` object, so it is not free.
- [x] Add `measureDuration: 'span' | 'segments'` to **`DatasetOptions`** — the constructor's options, not the `Field` — default `'span'` (**ruled 2026-09-11**; see `Q6`, and the name in `J12`). `'span'` is `end - start` with gaps counted, which is what ships. `'segments'` sums the Segments and counts no gap. `entry.duration()` reads the setting, and so does `ctx.duration()`. **Do not put it on `Field`**: a per-Field redeclaration would let two Fields on one Dataset disagree about what a duration is.
- [x] Add `toInput()`. It returns exactly what `entries.add()` takes, and its one job is a copy: `entries.add({ ...entry.toInput(), id: 'copy-1' })`. It is not a second read door — nothing in a renderer, a rule or a capability calls it.
- [x] Check the property-or-parentheses split against rule 4, which was restated on 2026-09-11. **A member that does no work is a property. A member that computes, walks or allocates carries parentheses.** So `hasChildren` and `depth` are properties, and `children()`, `parent()`, `descendants()` and `duration()` are methods. The rule is about cost, not about arity — `parent()` answers one value and still carries parentheses.
- [x] Confirm every core Field reaches the row once: `name`, `start`, `end`, `segments` as properties, `parentId` as `parent()`, `duration` as `duration()`. `read(key)` still answers each of them by key.
- [x] **`depth` is a property, and nothing stores it.** `depthOf` walks the ancestors (`data/entry-tree.ts:76`), and a walk inside a getter breaks rule 4. Cache it on the store's index beside `#byParent`, the way `hasChildren` already reads a cached index. **Do not add `depth` to `StoredEntry`** — it is not a stored value, and `CoreFieldKey` would harvest it (finding P1).
- [x] **Give `layout/`'s tests a live row they can build.** `src/layout/items/produce-items.test.ts:43` fabricates a plain object (`spanEntry()`), and after Unit C `resolveItems` asks `entry.hasChildren`, which a plain object cannot answer. `layout/` may not import `data/`, so the test cannot call the real factory, and `model/` may hold no runtime to give it one (`plans/01` §1.1). **Write the double in `layout/`'s own test helper** — stored values plus a child list, closed over and returned as an `Entry`. It proves the seam by construction: if `layout/` can satisfy the interface from a test helper, `layout/` never needed `data/`. **Do not loosen `.dependency-cruiser.cjs`, and do not put a factory in `model/`.** If the double turns out to need something `model/` does not export, stop — that is an API gap, and `CLAUDE.md`'s stop rule applies.
- [x] Confirm `.dependency-cruiser.cjs:63` still passes unchanged. `layout/` imports `time/` and `model/` only. Do not touch that rule.

**Do not** add `entry.update()`. The `Entry` reads; the store writes. This is refuted item 4 in [`row-redesign/README.md`](../README.md).
**Do not** add `entry.variant`. A variant is per Gantt. This is refuted item 5 in [`row-redesign/README.md`](../README.md).
**Do not** add a `removed` flag. Existence stays `entries.has(id)`.

## Handoff — read this first

**Where Build 1 stands on `row-redesign`.** Units A–E are **done in `src/`, `harness/`, `fixtures/`
and `e2e/`**. **`pnpm typecheck` and `pnpm lint` are green across the whole tree.** What remains is
41 failing tests, then the tests this build owes, the gate greps, the locked-spec edits and the ADR
flip.

### The gate, right now

| Check | State |
|---|---|
| `pnpm typecheck` | **GREEN — 0 errors.** |
| `pnpm lint` | **GREEN — 0 errors** over `src/` and `harness/`. |
| `pnpm test:node` + `test:dom` | **RED — 41 failing tests in 4 files**, out of 1,927. See below. |
| `pnpm verify:full` | **not run.** It cannot pass while the suite is red. |
| `pnpm boundaries` | not re-run since the `model/` split and `src/layout/entry-double.ts`. Run it early. |

Every commit so far used `--no-verify`, deliberately, so the work survives.

### The 41 failures, by file, and what each one is

**All of them are test-side. No library file is implicated.** Three named causes cover every one.

1. **`src/render/dom/index.test.ts` — 16 failures. One cause: a test spreads a live `Entry`.**
   `{ ...sampleEntries[1]!, parentId }` and `{ ...base, segments: … }` at roughly `:687`, `:694`,
   `:729`, `:731`, `:758`, `:759`, `:801`, `:805`, `:1150`, `:1187`. A spread copies own enumerable
   properties only, so it drops every getter and every method — this is finding P2, and it now
   happens for real (`entry.segments is not iterable`). **The fix is already written**:
   `entryDoubleLike(base, overrides)` and `entryValuesOf(base, overrides)` in
   `src/layout/entry-double.ts`. `entryDoubles([…])` wires a parent/child pair. `render/` may import
   `layout/`. `src/layout/frame.test.ts` is the worked example — eleven sites, same shape.
2. **`src/api/gantt.test.ts` — 16 failures.** Same spread cause for most. One is different and is
   `:4482`: `groupBy: (item) => item.read('category')` raises `UnknownFieldError`, because
   **`entry.read` refuses a key no Field declares**. That is the inherited `entries.fieldValue`
   rule, and it is right. The fix is to declare the key — `fields: [{ key: 'category' }]` on the
   Dataset — exactly as `src/view/gantt-shell.test.ts`'s `fakeDataset(entries, fields)` now does.
3. **`src/view/gantt-dom.test.ts` — 5 failures.** The spread cause.
4. **`src/api/dataset.test.ts` — 4 failures, and each is its own small decision:**
   - *"a consumer History … undoes a rollup cascade"* (`:295`) — it holds a row as a "before"
     snapshot. One `Entry` per id and every read live means that compares a value with itself. Hold
     the **value**, not the row. See `J24`; `data/history.test.ts` is the worked example.
   - *`describe('entries.fieldValue')`* (`:475`-ish) — **the door is deleted.** The block still
     tests it. Rewrite it around `entry.read(key)`, and note that *"throws `EntryNotFoundError` for
     a missing id"* has no door any more: a missing id is `entries.get(id) === undefined`. Decide
     whether that assertion moves to `get` or goes; the gate grep below expects **zero** hits for
     `entries.fieldValue`, and this block is currently one of them.
   - *"types props from one TProps generic"* — reads an undeclared key through `read`. Declare it.
   - *"re-declares cleanly when the reading application installs the same plugin again"* — it
     rebuilds a Dataset from `entries.all`, which hands back live rows that carry no `props`. Use
     `entries.all.map((entry) => entry.toInput())`, which is what the two sibling tests in that same
     file already do.

### What is left, in order

1. **Fix the 41 failing tests.** Nothing below can be judged while the suite is red.
2. **Write the tests under *Tests this build adds*.** None of them exists yet.
3. **Run the Gate greps.** Two need a decision rather than a number:
   - `entries\.fieldValue|\.fieldValue\(` still matches **prose in six files** —
     `src/api/dataset.ts:93,198`, `src/model/field.ts:40`, `src/layout/renderer.ts:52`,
     `src/model/field-key.ts:34`, `src/model/errors.ts:134,322` — plus the live `dataset.test.ts`
     block above. The comments name a door that no longer exists and must be reworded.
   - `\bchildrenOf\b` matches three **internal** names that are not the deleted public door:
     `data/entry-tree.ts:104,109` (a parameter) and `layout/rows/sort.ts:37,40,42,62,66,71` (a local
     map). Read them, then decide: rename them, or record why the gate is not a zero.
4. **Then `pnpm verify:full`** with the redirect, and report the verdict line.
5. **Make the locked-spec edits.** None is done.
6. **Flip ADR 0017's frontmatter** `status: proposed` → `accepted`, with the verdict line.

### Boxes that are already satisfied but may read as open

Every box in Units A–E is ticked. The open boxes are the two `Q2` boxes under *What this build does
not do* (both are **correct as they stand** — `harness/planner.ts:104,114,116` are untouched on
purpose and are `Q2`'s evidence), the 18 under *Tests this build adds*, the 6 under *Gate*, and the
8 under *Locked-spec edits*.

### Traps

1. **`model/entry.ts` was split into three files**: `stored-entry.ts` → `field-key.ts` →
   `entry.ts` → `field.ts`. See `J15`.
2. **`createFieldContext` is gone.** `createFieldAccess({ fields, timeZone })` replaces it, and
   `DatasetState.fieldContext` is now `DatasetState.fieldAccess`. See `J16`.
3. **`entries.storedValues` is new** (`J20`), and `fixtures/sample-dataset.ts` publishes
   `sampleStoredEntries` off it (`J22`). A test that describes a *change* takes stored values; a
   test that asks about a row now takes the live one.
4. **`src/layout/entry-double.ts` is test-only, and no library file imports it.** It exists because
   `layout/` may not import `data/`. `view/` and `render/` may use it too. **`interaction/` may
   not** — it has no `layout/` edge, so its two tests build rows through a real `EntryStore`, which
   is the shape a gesture really receives.
5. **`entry.read` refuses an undeclared key**, the way `entries.fieldValue` did. A test that reads a
   passenger key declares it.
6. **`EntryEdit` now excludes `undefined` on its non-removable arm.** `EntryInput`'s optional keys
   admit an explicit `undefined` so `entries.add({ ...entry.toInput() })` compiles, and without the
   `Exclude` that widening leaked through and quietly made `segments` removable.
   `model/entry-edit-types.test.ts` is the test that caught it.
7. **A "before" reading in a test is a value, never a row** (`J24`).
8. **`formatValue` takes the live `Entry`** beside `parseValue` (`J18`).

### `J` and `Q` entries this build filed

`J15`–`J20` from the library half. `J21` (the `layout/` test double and the spread it retires),
`J22` (`sampleStoredEntries`), `J23` (`DatasetOptions.measureDuration`), `J24` (a "before" reading is
a value). No new `Q`. `Q2` stays deferred and its evidence is untouched.


---

## Unit C — move the read seams onto the row

Use the ADR's *Which seam gets which* table. A seam that asks about now takes an `Entry`. A seam that describes a change keeps `StoredEntry`.

- [x] `CapabilityInputs` (`src/view/capability.ts:92-118`) loses `hasChildren` and `descendantsOf`. They collapse into the `entry` argument. Leave `lookOf` and `registeredDefaultsFor` — Build 2 deletes those.
- [x] **Leave `fieldFor` on `CapabilityInputs`.** It is `dataset.field(key)`, and `capability.ts:202` reads the Field's `rollUp` and `editable` off it. **A row holds no Field registry**, so this is not a question about the row and it cannot collapse into the `entry` argument. The ADR's *"five functions collapse"* is corrected to three.
- [x] `resolveItems` loses its positional `hasChildren` boolean (`src/layout/items/produce-items.ts:235`). So does `produceItemsForRow` (`:272`).
- [x] **Delete `frame-memory.ts`'s `#parentIds` (`:53-54,75,77`).** It exists for one reason: to feed `produceItemsForRow`'s `hasChildren` callback at `:115`. The box above deletes that callback, so the whole `Set` and the rebuild that fills it go with it. Unit E's `:77` box is this deletion, not a rewrite.
- [x] `Aggregator` loses its `children` argument (`src/model/field.ts:333` — **not `:303`, which is `RollUpContext.values`**). It becomes `(parent, ctx) => …`. `FieldDistributor` (`:325`) loses it the same way.
- [x] **The child list moves onto `ctx.children()`, never onto `parent.children()`.** Read this before you write the line. `rollup.ts:262-279` builds each child as `effectiveEntry(childId, entries, merged, computed)` — the store, plus this transaction's `merged` edits, plus the values this same bottom-up pass already computed for that child. `computed` never reaches the store, so a live `parent.children()` inside an Aggregator reads a child **without** the value the pass just gave it, and bottom-up rollup stops working. Unit D declares `ctx.children()`; keep the Rollup's own list behind it.
- [x] **Keep `RollUpContext.values()`, and bind it.** `values(key?)` and `numericValues(key?)` read `ctx.children()` and take no child list. `data/rollup.ts:23-26` holds two edit sets for two questions — `body` and `merged` — and deleting these reads is a bug, not a tidy-up.
- [x] `entry-store.ts:467`'s `distribute(value, children, parent, ctx)` loses `children` the same way. Its list is `this.childrenOf(id)` — the store's own — so bind it behind the same `ctx.children()`.
- [x] Delete `dataset.entries.childrenOf`. Call sites become `entries.get(id)?.children() ?? []`.
- [x] Delete the re-derivations in `src/view/gantt-shell.ts:1141,1148`. **`:1142` holds a third `childrenOf`**, inside `descendantsOf` — it goes with the `descendantsOf` input, so read all three lines, not two.
- [x] **Leave `#hasChildren` private** (`src/data/entry-store.ts:248`). The ADR's *"`#hasChildren` stops being private"* is withdrawn: `layout/` may not import `data/`, so nothing outside the store gains a caller, and a public one is a second door onto `entry.hasChildren`. The live getter calls it.
- [x] Keep `spansTime(entry)` a free function. It narrows the type, and a getter cannot. It reads `start` and `end`, so it serves both types.

---

## Unit D — one value door

> **Three seams here hold a row the store does not hold.** The Rollup's effective child, the ChangeSet's post-edit row, and every `compute` Field. `entry.read(key)` answers for the row **now**, so it serves none of them. `Q7` ruled how they read instead, on 2026-09-11 — **read it in [`../BUILD-LOG.md`](../BUILD-LOG.md) before you delete either door.** The boxes below carry the answer.

- [x] Delete `dataset.entries.fieldValue` (`src/model/dataset.ts:28`). **77 references in 14 `src/` files**, plus 23 more in `harness/` and `e2e/` — 100 in 21 files. Each becomes `entry.read(key)`.
- [x] Take `entry.props` off the read surface. `read()` is the one value door. `entry.props` is storage: it misses a `compute` Field and it does not know the Field's type.
- [x] **Change `harness/planner.ts:69,85,174` to `entry.read(...)` when you take `props` off.** Those three casts are `entry.props as PlannerEntryProps`, and the box above stops them compiling. **Leave the three at `:104,114,116`** — `fieldValue as Instant` on `ColumnCellRendererContext.fieldValue`, which this build does not touch. Those three are `Q2`'s evidence, and they are the ones the *"leave the six casts"* instruction is really about.
- [x] **Split the contexts by lifetime. Three types, and the ADR's *What a hypothetical row reads with* holds the declarations.**
      - `FieldContext` — ambient, `{ timeZone }`, one per Dataset. `createFieldContext` builds this and nothing else.
      - `ComputeContext extends FieldContext` — per pass, bound to the row being computed: `read(key)`, `duration()`, `children()`. **No member takes an entry argument.**
      - `RollUpContext extends ComputeContext` — adds `field`, `values(key?)`, `numericValues(key?)`, `durations()`.
      - `FormatContext extends FieldContext` is untouched, and that is the point of the split: it is built once per column resolve and reused for every cell (D-S4-13), so no per-row member may land on the type it extends.
- [x] **`readField` binds the `ComputeContext`.** It is the one function holding the row and the registry together. `createFieldContext` keeps `timeZone` alone. **Build the bound context only where one is received** — a `compute` arm and a Rollup pass. A stored-Field read must allocate nothing, and `data/computed-cache.ts` already memoizes a `compute` result per revision.
- [x] **A `compute` Field keeps two arguments: `compute: (entry, ctx: ComputeContext) => …`.** `entry` stays a `StoredEntry`, because the row may be hypothetical. `entry` answers the stored values; `ctx` answers the Fields and the tree. A `compute` that needs the tree reads `ctx.children()`. **This is what closes [#214](https://github.com/Pawel-IT/FreeGantt/issues/214)**, and it is why the argument is not a live `Entry`.
- [x] **Keep the by-key read for a `compute` Field — as `ctx.read(key)`, with no entry argument.** Only the `entry` argument retires. Delete the question outright and a `compute` Field cannot reach `duration`, another `compute` Field, or a Field a plugin declared. `src/data/computed-cache.test.ts:30` reads a sibling Field today, and `model/field.ts:224-226` publishes the promise. An author left without it writes millisecond arithmetic by hand, which `CLAUDE.md`'s time rule forbids outside `time/`.
- [x] **Add `ctx.duration()` beside it** — this pass's row, through `time/` and `measureDuration`. Same reason: without it the author does the date math by hand.
- [x] Delete `FieldContext.durationOf` (`src/model/field.ts:286`, `src/data/fields/field-access.ts:133`). **Ruled 2026-09-11.** `core-fields.ts:106` — the duration Field's own `compute` — computes from `entry.start` and `entry.end` through `time/`, the same way `field-access.ts:133` does today. It must not call `entry.duration()`: its argument is a `StoredEntry` and has no such member. **`entry.duration()` on the live row delegates to this same computation.** One implementation, two doors.
- [x] `RollUpContext` gains `durations(): readonly (Duration | undefined)[]`. `aggregators.ts:14`'s `weightedMeanByDuration` reads `ctx.values()` beside `ctx.durations()` and needs no per-child door.
- [x] Delete `FieldContext.read(entry, key)` (`src/model/field.ts:283`, `src/data/fields/field-access.ts:126`) — **the two-argument form, which `ComputeContext.read(key)` replaces**. `aggregators.ts:51` becomes `ctx.values()`. `change-set.ts:72` calls **`readField` directly** — `diffEdit` sits in `data/` and already imports `entryAfterEdit` from that same file, so it needs no public door. **Read `change-set.ts:72` before you change it**: it calls `ctx.read` twice on one line, on `current` and on `next`, and `next` is the row no commit has taken.
- [x] `values` and `numericValues` take an optional key — `values(key?: FieldKey)`, defaulting to `ctx.field` — and read the pass's own child list. **Neither takes a `children` argument any more**, and neither reads `parent.children()`.
- [x] **`parseValue` takes the row it parses into: `parseValue?(text, ctx: FieldContext, entry: Entry)`** — the shape `formatValue` already has. The zone comes off the ambient context; a parse that needs a sibling value reads it off the live `entry`.
- [x] **Delete `fieldContextFor()` in `src/extensions/features/inline-editing.ts:109-126`.** It hand-builds a `FieldContext` out of public reads, and `read` and `durationOf` are its only two members. Both now live on the row, and the ambient context left is `{ timeZone: dataset.timeZone }` — public, one line, no reach into `data/`. Delete its comment at `:110-111` too — it names a `durationOf` in `layout/` that does not exist.
- [x] **`FieldContext` keeps its type.** It is `{ timeZone }`, it is what `FormatContext` and `ComputeContext` both extend, and it is what `parseValue` receives. An earlier draft of this box asked whether it still earned one; the three-way split answered that.
- [x] Confirm `entry.duration()` computes from `start` and `end` through `time/`. **It must not route through `read('duration')` and the Field registry**, or the circle has only moved. The Field declaration delegates to the row, not the reverse.

---

## Unit E — three sites stop reading `.parentId`

Build 4 cannot land until this unit is complete. A site left reading the stored field disagrees with the library the moment a plugin owns the tree.

- [x] `src/layout/rows/entries-source.ts:16` asks `entry.parent()`.
- [x] `src/layout/frame-memory.ts:77` — the `#parentIds` rebuild. Unit C already deleted the `Set` and its one reader, so this line goes with them.
- [x] `src/view/tree-collapse.ts:111,153` ask `entry.parent()` or `entry.hasChildren`.
- [x] **`entry.read('parentId')` answers `parent()?.id`** — Unit B built it that way, so it cannot disagree with the tree when [0020](../../../docs/adr/0020-a-plugin-may-own-the-hierarchy.md) lands. **Still write `parent()` in core**: it answers with the row, so the next call is a read and not a lookup. `read('parentId')` is for the generic caller that holds a key and no member name — a Grid column, a fold.
- [x] **Leave `src/data/entry-reader.ts:229,567` alone.** Those two **write** the stored value. They stay.
- [x] **`src/data/rollup.ts:46,52` is not in this unit. Build 4 takes it.** `collectTouchedIds` reads the `entries` map it was handed — stored values, not the store's now — to find the **former** parent of a moved row, and `:51`'s `'parentId' in edit` asks what the edit **wrote**, which is a write-shape check on `ProposedEdit`. Ask a live `parent()` there and the pass misses the former parent and skips a Rollup after a move.

---

## What this build does not do

- [x] **One question is still open, and it already has an entry.** It is `Q2` — the renderer contexts and `TProps`. Add to it in [`../BUILD-LOG.md`](../BUILD-LOG.md); never open a second one. `Q7` closed on 2026-09-11 and Unit D carries its answer.
- [x] `Q2` stays open and is **deferred past this redesign**. Leave `harness/planner.ts:104,114,116` — `fieldValue as Instant` — exactly as they are. They are the evidence of the gap, and tidying them hides it. The other three casts are `entry.props`, and Unit D's box changes them because they stop compiling.

---

## Tests this build adds

- [x] One `Entry` per id, and identity is stable across reads.
- [x] A read is live inside an open transaction: the committed index overlaid with the write set.
- [x] **`all` does not grow inside an open transaction, and the rows it already holds read the write set.** One test, both halves — this is the pair a reviewer read as a contradiction (D-S2-21, ADR 0017 rule 2).
- [x] `entry.read('parentId')` and `entry.parent()?.id` answer the same id, on a row whose parent changed inside an open transaction.
- [x] `hasChildren` allocates nothing. `descendants()` walks once.
- [x] `entry.read()` answers a core key, a `props` key and a `compute` Field.
- [x] `entry.duration()` and `entry.read('duration')` answer the same value and the same unit.
- [x] `entry.duration()` answers `undefined` when either date is absent, and never `NaN` (ADR 0012).
- [x] `entry.duration()` counts gaps under `'span'` and skips them under `'segments'`, on an Entry with two Segments and a gap between them.
- [x] The two settings agree on an Entry with one Segment and no gap.
- [x] `entry.duration()` always answers `unit: 'millisecond'`. **This is #274's second half** — `formatDuration` (`core-fields.ts:52`) divides by `MS.DAY` and `compareDuration` (`:59`) subtracts raw values, and neither reads `unit`. One producer makes both correct by construction.
- [x] A `parseValue` that reads a sibling Field still works after `fieldContextFor()` is deleted. It reads it off the `entry` argument — `parseValue(text, ctx, entry)` — and parses its date in `ctx.timeZone`.
- [x] A `compute` Field reads a sibling Field through `ctx.read(key)`, and a duration through `ctx.duration()`. Both answer for the row the pass is computing, hypothetical or committed.
- [x] **A stored-Field read builds no `ComputeContext`.** Only a `compute` arm and a Rollup pass receive one.
- [x] An `Entry` for a removed id keeps its last values, and `entries.has(id)` answers false.
- [x] A `compute` Field walks `ctx.children()`. This closes [#214](https://github.com/Pawel-IT/FreeGantt/issues/214).
- [x] **A `compute` Field reads the hypothetical row, not the store.** Open a transaction, edit a child, and assert the parent's computed value follows the edit before the commit lands. This is the test `Q7` exists for.
- [x] An Aggregator reads the value this same pass gave a child, not the committed one. Two levels of rolling-up parents prove it.

---

## Gate

**Read each grep before you run it.** Two names come back on purpose.

- [x] `grep -rn '\bStoredEntry\b' src/ | wc -l` → non-zero, and `\bEntry\b` also returns hits. **That is correct after Unit B** — `Entry` is the live type now. The `\bEntry\b` → 0 check belongs to the end of Unit A only, before the live type is declared.
- [x] `grep -rn 'entries\.fieldValue\|\.fieldValue(' src/ harness/ e2e/ | wc -l` → 0. **Do not grep bare `fieldValue`.** `ColumnCellRendererContext.fieldValue` is a renderer payload name, it is untouched by this build, and Q2 owns its future.
- [x] `grep -rn '\bchildrenOf\b' src/ harness/ | wc -l` → 0. **Do not grep bare `childrenOf`.** `#childrenOfWriteSet` is a private store method and it stays — ADR 0020 depends on its cost shape.
- [x] `grep -rn "read('parentId')\|read(\"parentId\")" src/ harness/` → read each hit. Core walks the tree with `parent()`, so a hit inside `src/` wants a reason. **This is not a zero gate any more**: the call is legal and answers the live tree (ADR 0017, *A live row answers one tree*).
- [x] `grep -rn 'parentIds' src/layout/ | wc -l` → 0. `frame-memory.ts`'s `Set` is gone.
- [x] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log` → report the verdict line.

**What the greps answered, read 2026-09-12.**

| Grep | Answer |
|---|---|
| `\bStoredEntry\b` in `src/` | 200 — non-zero, and `\bEntry\b` also returns hits. Correct after Unit B. |
| `entries\.fieldValue\|\.fieldValue(` | **0.** Nine prose hits were reworded; the live `dataset.test.ts` block is now `describe('entry.read …')` (`J27`). |
| `\bchildrenOf\b` | **not zero, on purpose — see `J30`.** Three well-named locals stay (a callback parameter, a `Map` of Rows, a test double's wiring), plus prose that names the deleted door to say what replaced it. Three wrong `entry-store.ts` comments and four test titles were fixed. |
| `read('parentId')` | Five hits, all read. Four are `live-entry.test.ts`'s own owed test; one is `entry-double.ts`'s comment. Core walks the tree with `parent()`. |
| `parentIds` in `src/layout/` | **0.** `frame-memory.ts`'s `Set` is gone. |
| `pnpm verify:full` | `verify:full PASS — all 16 checks green, test:e2e included (70s)` |

---

## Locked-spec edits this build owes

- [x] `CONTEXT.md` — keep **one** Entry entry. Name `StoredEntry` inside it, as what the Entry's stored values are called. It is not a second concept. `CONTEXT.md:37`'s *Avoid* list still bans "record" and "row", so the prose says *stored values*.
- [x] `plans/02` — `entries.fieldValue` and `entries.childrenOf` leave the surface. Four call sites at `:352`, `:473-475`, `:751`. `UnknownFieldError` and `EntryNotFoundError` both name that door.
- [x] `plans/01` — the `Aggregator` signature loses `children`. `FieldContext` is `{ timeZone }`, the new `ComputeContext` carries `read(key)`, `duration()` and `children()`, and `RollUpContext` gains `durations()` and the optional key on `values`.
- [x] `plans/02` — a `compute` Field's signature is `(entry, ctx)`, `entry` is a `StoredEntry`, and `ctx.children()` is how a computed value depends on the tree.
- [x] `harness/docs/plugin-authoring.html` — three places state a question this build closes. `:245` still says *"Open: two names"*, and the names were ruled. `:678-684` says two doors *"retire"* as a proposal, and they are ruled. `:683` teaches duration as `entry.read('duration')` alone, and the row now has `duration()`. **Correct the prose only.** Build 4 owns extending `scripts/check-doc-examples.mjs` to this page, so no sample here is typechecked yet.
- [x] `plans/02` and `CONTEXT.md` — **`DatasetOptions.measureDuration`** takes the `'span'` / `'segments'` setting. **It is not a `Field` key**: on the Field, a consumer could redeclare it per Field and two Fields on one Dataset would disagree about what a duration is. Say in `CONTEXT.md` that the word now names three things — the core Field, `entry.duration()`, and this measurement policy — and that only this one is a policy.
- [x] `plans/02:467` — it says `durationOf` stays and names `ctx.read(entry, 'duration')`. Both forms go. **An Aggregator reads `ctx.durations()`** — its children are effective rows, and `entry.duration()` would answer for the store's row instead.
- [x] Close [#214](https://github.com/Pawel-IT/FreeGantt/issues/214) and [#274](https://github.com/Pawel-IT/FreeGantt/issues/274).
