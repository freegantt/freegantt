# Closed decisions — ADR 0011

**Governing:** [ADR 0011](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md). Open decisions live in [`open-decisions.md`](open-decisions.md) and only there. **This file is the only other place an ADR 0011 decision is written down**, and it holds the closed ones.

**A number never moves.** A closed decision keeps its number and leaves the open list. Do not renumber the survivors to close the gaps — the plan, the conflict log and two reviews cite these numbers.

| # | Question | Ruling |
|---|---|---|
| **2** | What does `entries.add({ props })` emit? | One `EntityAdded` row, carrying the Entry **as stored** |
| **3** | Does the schema restart need a release gate? | No renumbering. `5` now, `1` at release. **A released reader refuses a file it did not write** |
| **4** | What does `InvalidInstantError` refuse? | An unreadable date, and one date without the other. Not an Entry that authors neither |
| **5** | A plugin cascade writes a derived cell | **Dropped, with one warning.** Exempt from the *throw* only |
| **6** | An Entry starts rolling up | **Drop and recalculate, no error, at all three doors.** Undo restores it. History is never cleared |
| **7** | What an S7 plugin does with a `progress` it did not write | Not independent. Downstream of 9 and 12 |
| **10** | What a `compute` Field shows on a rolling-up parent | It **runs**, like every other row. The union closes storage, not reading |
| **14** | Should `FieldContext` bind to the row? | Out of scope. A measurement task, folded into 13 |
| **15** | Does `FieldContext` owe a usable duration? | Neither it nor `time/` owes anything. `MS` is already public |
| **17** | Is the namespace `props` or `data`? | **`props`** |
| — | A `props` key that names a core key | **Warning.** The value is ignored and the core definition wins |
| — | Does `editable: false` refuse `entries.update()`? | **Yes.** It is one rule at two doors, not two rules |
| — | May a Field or a plugin arrive after construction? | **No, and that is deliberate.** Rebuilding through `fromJSON` is the answer for a late install |
| — | `ComputedFieldCannotBeWrittenError` at two doors | **One name.** The message names the door, says `compute`, and the resolver checks it first |

---

## 2 — `entries.add({ props })` emits one changeset row

**Settled 2026-09-08.**

One `EntityAdded` row carries the whole Entry as stored. Per-Field rows would undo one user action in several steps. The row states what the store now holds rather than what the call passed — after a dropped derived value, and after ingest fills `props: {}` and the Segments.

## 3 — the schema restart's release gate

**Closed 2026-09-09.** Its own text read *"and that stands"*, so only a one-line addition was ever in question.

**No change to the numbering.** `5` now and `1` at release. One rule joins the release gate instead — **a released reader refuses a file it did not write.** That retires the pre-release-`3`-against-released-`3` hazard permanently. Nothing reads schema 3 today. Spending a public number, or shipping a `preRelease` flag, would solve a problem that ends the day the library goes public.

## 4 — what `InvalidInstantError` refuses

**Settled 2026-09-08.**

It refuses an unreadable date, and an Entry that authors one date without the other. It stops refusing an Entry that authors neither, because dates become optional on every kind (group D).

## 5 — a plugin cascade's write to a derived cell is dropped, with a warning

**Closed 2026-09-09. Ruled by the author.**

A plugin cascade that writes a rolling-up Field on a rolling-up parent has that write **dropped**, and the library raises one warning through `raiseError` at `severity: 'warning'` (ADR 0009).

`entries.update()` throws `DerivedFieldNotWritableError` for the same write. A cascade does not, because the guard sits at the public door and the hook reads through a different one. **That placement is deliberate** — a plugin author learns no rule and checks no predicate. **Exempt from the throw was never the same as the write surviving**, and the honest end of that exemption is a drop the author can see.

**Why not let it stand.** `toJSON` omits a derived value in any case, so a cascade that won the pass would still lose at the next save. Letting it stand publishes a number whose whole lifetime is one transaction.

**One code defect to fix first**, and the order matters: unify the proposed-Field predicate before group C deletes the `body`/`merged` split. See [`refuted.md`](refuted.md) item 8.

## 6 — an Entry that starts rolling up drops its authored values

**Closed 2026-09-09. Ruled by the author.** Was: *does a `rollUpKinds` flip refuse or destroy?*

**It drops and recalculates. The library never refuses, at any door.**

**The reason is the author's own story, and the draft had lost sight of it.** A person types `cost: 500` on a row. They then decide that row is a parent, and they give it children. A `cost` on a parent comes from its children, so `500` has no meaning any more and the Rollup replaces it. **Throwing there refuses an ordinary edit over a value the author is plainly finished with.** No product asks a person to empty a cell before they may indent a task under it.

Three doors reach the same state, and all three behave alike: autoGroup promotion, a `kind` write, and a `rollUpKinds` flip. Flipping a kind **out** of the set keeps the last derived answer, now authored (D-S4-6).

**This ruling follows the ADR's own rule rather than bending it.** *Name a Field and the library answers; change the structure and the library keeps what is yours.* `update('p', { props: { cost: 999 } })` on a parent that already rolls up **throws** — the caller named `cost`. `add({ id: 'c', parentId: 'p' })` **drops** `p`'s authored `cost` — the caller named a parent, not a Field. Same split as *`update()` refuses; `add()` drops*, one level out.

**Undo was the draft's stated reason to refuse, and it does not hold** — see [`refuted.md`](refuted.md) item 12. **History is never cleared, and `RollUpKindsWouldDropValuesError` is not added.**

**One follow-up on one door, and it is open as decision 24.** The flip is a transaction: it emits one ChangeSet, enters undo as one step, and `beforeChange` may veto it. Promotion and a `kind` write carry their cause in that transaction. A `rollUpKinds` flip's cause is a **config assignment**, and `ChangeSet` has no row shape for one, so undo restores the values while `rollUpKinds` still rolls them up. **This ruling does not answer that door.** The two ways out, and what each costs, are in [`open-decisions.md`](open-decisions.md) under 24. It is a follow-up, not a re-opening: the drop-and-recalculate ruling above stands at all three doors either way.

**Still parked, and untouched by this ruling:** whether `rollUpKinds` is the right axis at all, or whether a per-entry flag should carry *"do my values derive?"*. That sits beside decision 20. **The flag's layer is decision 21**, and a stored flag would close decision 24: it emits an ordinary Field row, so undo reverses the flag and the values in one step.

## 7 — what an S7 plugin does with a `progress` value it did not write

**Closed 2026-09-09 as not independent.** Its entire body was *"Downstream of 9."*

A required plugin prefix on the Field key makes a consumer's `progress` and a plugin's `progress` different keys, which closes this at no cost. A shared bare key space leaves it open, and the answer is then an install-time duplicate-declaration error rather than a silent overwrite. **Both answers are decided by 9 and 12.** Listing it separately inflated the count of what was open.

## 10 — what a `compute` Field shows on a rolling-up parent

**Closed 2026-09-09.** Its own recommendation ended *"take this off the blocking list"*, and nothing gated on it.

**`compute` runs on every row, a rolling-up parent included.** The union closes storage, not reading. A `compute` Field reading `entry.props.cost` on a group sees what the Rollup put in the store — a stored read through a door the union never closed. Blanking it would put `{ key: 'ref', compute: (e) => rowNumber(e.id) }` at an empty cell on every group row, which a consumer reads as a bug. The real limit is that a `compute` Field cannot ask *am I a parent?* — that is [#214](https://github.com/Pawel-IT/FreeGantt/issues/214).

## 14 — should `FieldContext` bind to the row?

**Closed 2026-09-09 as out of scope.** Was: *`compute(entry, ctx)` hands the row to a context that takes it back — `ctx.read(entry, 'cost')`.*

Its own recommendation was *"measure before deciding"*, which is work, not a ruling. Nothing in groups A–D gates on it, and the current unbound shape has a recorded reason: the context is built once per `resolveColumns` and reused for every cell, which is why `formatValue` gained a third `entry` parameter instead (#240).

**It is an issue, not a blocking decision.** The question survives, folded into decision 13, which now covers all four read doors. Measure there.

## 15 — `Duration` and the magic constant

**Closed 2026-09-09 by the code.** Was: *`FieldContext` owes a usable duration, or `time/` owes a public conversion.*

Neither is owed. `MS` is **already public** — exported at `api/index.ts:365`, defined at `time/instant.ts:45`, with `SECOND`, `MINUTE`, `HOUR` and `DAY`. The library divides by it itself at `core-fields.ts:46`.

**It was a documentation defect, not a design question.** The published `compute` sample wrote `duration.value / 86_400_000` and taught every consumer to write what I10 refuses to write inside `src/`. The sample writes `duration.value / MS.DAY`. **Never publish the raw constant.**

## 17 — the namespace is `props`

**Closed 2026-09-09. Ruled by the author.** Was: *should the namespace be called `props` rather than `data`?*

`props` it is. `Entry.props`, `EntryInput.props`, `EntryDocument.props`, the `props?:` key on `EntryEdit`, and `"props"` in every saved file.

**Why `data` lost.** `data/` is a core layer, so `data` would name a layer and a consumer's bag at once. The mitigation on offer was a prose convention — *write `data/` for the layer and `entry.data` for the bag, never the bare word*. `plans/02` rules that a generic word covering more than one concept is a bug rather than a style nit, and #7 is the cautionary case: "chart" named the public instance and an internal class, and the fix was to **retire the word**, not to write a disambiguation rule and trust context. `data` is the most generic word available.

**What it costs.** One inversion for a reader arriving from tldraw, where `props` is the library's own validated schema and `meta` is the consumer's free-form bag. That is one product's pairing, weighed against a collision on every page of this repo.

**What it deletes.** The plan's group F owed a glossary rule for the `data/`-against-`entry.data` collision. There is no collision, so there is no rule to write.

**Checked before ruling:** `props` and `TProps` appear nowhere in `src/`.

**Renames that follow:** `DataEdit` → `PropsEdit`, `TData` → `TProps`, `ConsumerEntryData` → `ConsumerEntryProps`, `PluginEntryData` → `PluginEntryProps`, `PlannerMeta` → `PlannerEntryProps`, `DemoMeta` → `DemoEntryProps`. The ADR file itself is renamed, which ADR 0006 permits while its status is `proposed`.

**Left open by this ruling:** decision 12, whether a Field key carries an ownership marker. The ADR said 17 depended on 12. It ran the other way — the word is settled and the marker is not.

## A `props` key that names a core key — warning, and the core definition wins

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision. It sat as the fourth bullet of decision 12 (which recommended an **error**) and as a Consequences bullet (which stated a **warning**), marked *contested*.

**A warning, the value is ignored, and core's own definition is used.** `props: { start: … }` never throws.

**The reason is where the data comes from.** A consumer feeds this Dataset from an API they do not own. A column added upstream, named `start` or `kind` or `name`, must not break their page. A warning names the key and the app keeps running.

The leak decision 12 worried about — *it stores a value no door can read back* — closes anyway, because the value is not stored.

**What stays open:** decision 12's other three bullets — the published closed reserved list, bare consumer keys, and a required plugin prefix.

**This ruling covers a `props` _value_ only. The _declaration_ case is open as decision 23**, and it is weighed in [`open-decisions.md`](open-decisions.md), not here. `fields: [{ key: 'start', … }]` is set to throw `DuplicateFieldKeyError` after the override is deleted, and whether the posture above should reach it is the question. **Group A does not implement that throw until 23 closes.**

## The registration lock — `fields` and `plugins` are fixed at construction

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision, and nothing had written it down. Decision 11 argued against the flat shorthand on the opposite claim.

**The code already locks both, and no door reopens them.** `dataset.fields` is a read-only getter (`src/api/dataset.ts:240`) and `Dataset.plugins` is read-only (`src/api/dataset.ts:180-183`). Two doors add a Field, and both close inside the constructor: `DatasetOptions.fields`, and `ctx.fields.register` during a plugin's own `setup()`. A `register` call after that `setup()` returns throws `RegistrationClosedError` (`src/extensions/plugin-runtime.ts:54`). **This ruling states what ships; it adds no code.**

**Four things depend on the lock today.**

- `FieldRegistry.all` is **one array identity for the registry's whole life** (`field-registry.ts:137-139`). Readers cache by identity and carry no invalidation branch.
- `diffEdit` walks the registry for ChangeSet row order, so **row order cannot change mid-life**.
- `toJSON` output does not depend on **when** it is called, because `authored` filters a fixed set.
- The construction Rollup walks **once**, at the end of the constructor, after every plugin has declared.

**The payback is that a Field arriving mid-life reproduces decision 6's open follow-up on a second axis.** Declaring a Field on a Dataset that already holds Entries makes every rolling-up parent owe a new aggregate. That is a whole-dataset Rollup pass, outside any user action, writing stored values that enter undo. Decision 6 already wrote what happens next: *"undoing that step restores the values while `rollUpKinds` still rolls them up, and the next commit that touches the subtree drops them again."* A declaration is a **config assignment**, and `ChangeSet` has no row shape for one — `added`, `removed` and `updated` each name a store entity. **Unlocking `fields` makes that problem two problems.** Keeping the lock leaves it at one.

**A late install rebuilds, and the door already ships.** `Dataset.fromJSON(dataset.toJSON(), { fields, fieldTypes, aggregators, plugins })` — `src/api/dataset.ts:328`. **Say its price in the same sentence that offers it:** a new Dataset identity, so every subscriber rebinds and the undo History is lost. That price suits a *turn scheduling on* toggle. It does not suit an *add a custom column* feature, where losing undo on a column add would surprise anyone. **That is the hole this ruling accepts**, recorded the way the dateless-row hole is.

**Owed to `plans/02`, and not yet written.** `plans/02` rules that *every config key is live-reconfigurable*. `fields` and `plugins` are exceptions, and today the exception is undocumented — which is exactly how decision 11 came to argue from the opposite claim. Write both keys into `plans/02` as named exceptions, carrying the Rollup-and-undo reason above. **`plans/02` is a locked spec, so this edit needs the author.**

## The `editable` ruling — `editable: false` refuses `entries.update()`

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision. It sat in the ADR as an aside — *"one thing to check before the deletion lands"*.

**The finding.** The two doors differ, and it is verified: `Field.editable` is read at exactly one place in `src/`, `view/capability.ts:120`, and nothing in `data/` consults it. So a Field a consumer declared unwritable is writable through `entries.update()` today.

**The ruling.** `editable: false` refuses the change at both doors. The write rule moves into `data/` with the derived-value rule, and `view/capability.ts` calls it rather than restating it. New error: `FieldNotEditableError`.

**Why it matters beyond the one gate.** The ADR refuses a *derived* write at `entries.update()` and claims I14 for it. Leaving the `editable` half split would give the library two answers to *"may this value change"* at two doors — the exact split I14 exists to close. Both halves move together or neither claim holds.

**What it opened.** Decisions **18** and **19**, both open. 18 asks what an *absent* `editable` does. 19 asks what replaces `{ key: 'start', editable: false }`, because `interactions.edit` is view-level and can no longer stand in for a data-level gate.

## `ComputedFieldCannotBeWrittenError` — one name at two doors

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision.

**One concept: a `compute` Field cannot be written.** Two doors reach it. Registration is the first — `compute` beside `rollUp`, or `compute` beside `editable`. `entries.update()` is the second. **One error name covers both, and the message names the door.** A second error type would be two names for one concept, which is the failure `plans/02` records at #7.

**Do not reuse the name for a derived parent cell.** That is `DerivedFieldNotWritableError`. A rolling-up parent holds a stored value the Rollup owns. A `compute` Field holds no stored value at all. Two concepts, two names.

**The register door is what makes the update() door unambiguous, and that is the argument for one name.** The union is a declaration-site aid, so `FieldRegistry` enforces it at runtime ([`types.md`](types.md)). A registered Field therefore sits on the stored arm or the compute arm, never both. On any one Field exactly one of the two errors is reachable. The first door guarantees the second door's precondition, so a consumer never has to ask which name applies.

**Two rules follow, and both are load-bearing.**

**1. The update() door's message says `compute`. It never says *derived*.** This ADR uses *derived* for a rolled-up value **and** for a `compute` value. Decision 21's per-entry flag makes the overlap reachable: a consumer sets the flag, writes a `compute` Field on that Entry, and reads *this value is derived* as *I just turned derivation off*. Naming the door is not enough when the word is ambiguous. This is the same trap that ruled out `derivesValues` as a name for the flag.

**2. The write resolver checks `compute` before `editable`.** The union's compute arm declares `editable?: never`, and the register door throws for `compute` beside `editable`. So a `compute` Field can never carry `editable: true`. **If decision 18 lands on its first answer** — *`entries.update()` refuses unless a Field declares `editable: true`* — then every `compute` Field is refused twice, once by each rule. Whichever rule the resolver checks second never fires. Check `editable` first and the consumer reads *declare `editable: true`*, which the register door then rejects. That is a closed loop with no way out. **One name is not enough on its own; the wrong rule must not answer first.**

**What this does not decide.** Decision 18 stays open. This ruling fixes the order of the checks, not the answer to what an absent `editable` means.
