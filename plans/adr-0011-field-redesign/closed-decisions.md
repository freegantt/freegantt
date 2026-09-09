# Closed decisions — ADR 0011

**Governing:** [`docs/adr/0011-…`](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md). Open decisions live there and only there. **This file is the only other place an ADR 0011 decision is written down**, and it holds the closed ones.

**A number never moves.** A closed decision keeps its number and leaves the ADR's list. Do not renumber the survivors to close the gaps — the plan, the conflict log and two reviews cite these numbers.

| Open in the ADR | Closed here |
|---|---|
| 1, 8, 9, 11, 12, 13, 16, 18, 19, 20 | 2, 3, 4, **5**, **6**, 7, 10, 14, 15, 17 |

Ten closed. Two were settled on 2026-09-08 and are kept for the record. Six closed on 2026-09-09: one by the author's ruling, one by the author's ruling on a review finding, and four by a consistency review that found them already answered. **Two more closed on 2026-09-09 by the author** — **5** and **6** — together with one ruling that was never numbered, on a `props` key naming a core key.

---

## 6 — an Entry that starts rolling up drops its authored values

**Closed 2026-09-09. Ruled by the author.** Was: *does a `rollUpKinds` flip refuse or destroy?*

**It drops and recalculates. The library never refuses, at any door.**

**The reason is the author's own story, and the draft had lost sight of it.** A person types `cost: 500` on a row. They then decide that row is a parent, and they give it children. A `cost` on a parent comes from its children, so `500` has no meaning any more and the Rollup replaces it. **Throwing there refuses an ordinary edit over a value the author is plainly finished with.** No product asks a person to empty a cell before they may indent a task under it.

Three doors reach the same state, and all three behave alike: autoGroup promotion, a `kind` write, and a `rollUpKinds` flip. Flipping a kind **out** of the set keeps the last derived answer, now authored (D-S4-6).

**This ruling follows the ADR's own rule rather than bending it.** *Name a Field and the library answers; change the structure and the library keeps what is yours.* `update('p', { props: { cost: 999 } })` on a parent that already rolls up **throws** `DerivedFieldNotWritableError` — the caller named `cost`. `add({ id: 'c', parentId: 'p' })` **drops** `p`'s authored `cost` — the caller named a parent, not a Field. Same split as *`update()` refuses; `add()` drops*, one level out.

**Undo was the draft's stated reason to refuse, and it does not hold.** The draft argued that replaying a step whose `from` is an authored parent value would restore a value the new setting refuses, and it wiped the whole history to escape that. It read the drop as a lone row. The drop is **one row of the transaction that caused it**:

```
  commit:  child 'a' gains parentId 'p'      ← the cause
           p.cost   500 → 40                 ← the drop, same ChangeSet

  undo:    child 'a' loses parentId 'p'      ← the cause reverses
           p.cost    40 → 500                ← so 500 is authored again, and legal
```

Nothing replays a value the new state refuses, because the new state goes back with it. **History is never cleared, and `RollUpKindsWouldDropValuesError` is not added.** `rollUpKinds` is not a destructive setter.

**One follow-up on one door, and it is not a re-opening.** Promotion and a `kind` write carry their cause in the same transaction. A `rollUpKinds` flip's cause is a **config assignment**, and `ChangeSet` has no row shape for one — `added`, `removed` and `updated` each name a store entity. So undoing that step restores the values while `rollUpKinds` still rolls them up, and the next commit that touches the subtree drops them again. **Two ways out, and the flip needs one:** the undo step reverses the config key beside the values, or the flip's drops stay out of history and the key's own documentation says so. The first matches the ruling's logic — undo reverses the user's action, and the action was *turn rolling-up on*.

**Still parked, and untouched by this ruling:** whether `rollUpKinds` is the right axis at all, or whether a per-entry flag should carry *"do my values derive?"*. Two comparable products put it on the record and neither ships a kind set. That question sits beside decision **20**. It is parked, not blocking.

---

## 5 — a plugin cascade's write to a derived cell is dropped, with a warning

**Closed 2026-09-09. Ruled by the author.**

A plugin cascade that writes a rolling-up Field on a rolling-up parent has that write **dropped**, and the library raises one warning through `raiseError` at `severity: 'warning'` (ADR 0009).

`entries.update()` throws `DerivedFieldNotWritableError` for the same write. A cascade does not, because the guard sits at the public door and the hook reads through a different one. That placement is deliberate — a plugin author learns no rule and checks no predicate. **Exempt from the throw was never the same as the write surviving**, and the honest end of that exemption is a drop the author can see.

**Why not let it stand.** `toJSON` omits a derived value in any case, so a cascade that won the pass would still lose at the next save. Letting it stand publishes a number whose whole lifetime is one transaction.

**Do not widen the proposed-Field test from `body` to `merged`.** That keeps the write for one pass and loses it at the next save — the worst of the three.

**One code defect to fix first, and the order matters.** Two call sites answer *did anyone propose this Field?* from two different edit sets: `rollup.ts:196` reads `body`, and `build-commit-change-set.ts:301` binds `body` to the transaction body alone, so a cascade's edits reach only `merged`. Today the cascade's write commits, enters the ChangeSet, enters undo — and the same pass overwrites it, leaving two rows for one Field in one undo step. **Unify the predicate into one function, and give both callers that function.** Then group C may delete the `body`/`merged` split with D-S2-22's precedence clause.

---

## A `props` key that names a core key — warning, and the core definition wins

**Closed 2026-09-09. Ruled by the author.** It was not a numbered decision. It sat as the fourth bullet of decision **12** (which recommended an **error**) and as a Consequences bullet (which stated a **warning**), marked *contested*.

**The ruling: a warning, the value is ignored, and core's own definition is used.** `props: { start: … }` never throws.

**The reason is where the data comes from.** A consumer feeds this Dataset from an API they do not own. A column added upstream, named `start` or `kind` or `name`, must not break their page. A warning names the key and the app keeps running.

The leak decision 12 worried about — *it stores a value no door can read back* — closes anyway, because the value is not stored.

**What stays open:** decision **12**'s other three bullets — the published closed reserved list, bare consumer keys, and a required plugin prefix. This ruling settles one bullet, not the decision.

**A question this raises for group A, and it is not ruled:** a consumer *declaration* on a core key (`fields: [{ key: 'start', … }]`) is set to throw `DuplicateFieldKeyError` after the override is deleted. The posture above — warn, ignore, core wins, never break the consumer — argues for the same treatment there. A declaration is hand-written code rather than API data, so the case for throwing is stronger. **Ask before group A implements the throw.** It is adjacent to decision **19**.

---

## 17 — the namespace is `props`

**Closed 2026-09-09. Ruled by the author.** Was: *should the namespace be called `props` rather than `data`?*

`props` it is. `Entry.props`, `EntryInput.props`, `EntryDocument.props`, the `props?:` key on `EntryEdit`, and `"props"` in every saved file.

**Why `data` lost.** `data/` is a core layer, so `data` would name a layer and a consumer's bag at once. The mitigation on offer was a prose convention — *write `data/` for the layer and `entry.data` for the bag, never the bare word*. `plans/02` rules that a generic word covering more than one concept is a bug rather than a style nit, and #7 is the cautionary case: "chart" named the public instance and an internal class, and the fix was to **retire the word**, not to write a disambiguation rule and trust context. `data` is the most generic word available.

**What it costs.** One inversion for a reader arriving from tldraw, where `props` is the library's own validated schema and `meta` is the consumer's free-form bag. That is one product's pairing, weighed against a collision on every page of this repo.

**What it deletes.** The plan's group F owed a glossary rule for the `data/`-against-`entry.data` collision. There is no collision, so there is no rule to write.

**Checked before ruling:** `props` and `TProps` appear nowhere in `src/`.

**Renames that follow:** `DataEdit` → `PropsEdit`, `TData` → `TProps`, `ConsumerEntryData` → `ConsumerEntryProps`, `PluginEntryData` → `PluginEntryProps`, `PlannerMeta` → `PlannerEntryProps`, `DemoMeta` → `DemoEntryProps`. The ADR file itself is renamed, which ADR 0006 permits while its status is `proposed`.

**Left open by this ruling:** decision **12**, whether a Field key carries an ownership marker. The ADR said 17 depended on 12. It ran the other way — the word is settled and the marker is not.

---

## The `editable` ruling — `editable: false` refuses `entries.update()`

**Closed 2026-09-09. Ruled by the author.** It was not a numbered decision. It sat in the ADR as an aside — *"one thing to check before the deletion lands"* — and in the plan as ordering constraint 7.

**The finding.** The two doors differ, and it is verified: `Field.editable` is read at exactly one place in `src/`, `view/capability.ts:120`, and nothing in `data/` consults it. So a Field a consumer declared unwritable is writable through `entries.update()` today.

**The ruling.** `editable: false` refuses the change at both doors. The write rule moves into `data/` with the derived-value rule, and `view/capability.ts` calls it rather than restating it. New error: `FieldNotEditableError`.

**Why it matters beyond the one gate.** The ADR refuses a *derived* write at `entries.update()` and claims I14 for it. Leaving the `editable` half split would give the library two answers to *"may this value change"* at two doors — the exact split I14 exists to close. Both halves move together or neither claim holds.

**What it opened.** Two new decisions, **18** and **19**, both live in the ADR. 18 asks what an *absent* `editable` does. 19 asks what replaces `{ key: 'start', editable: false }`, because `interactions.edit` is view-level and can no longer stand in for a data-level gate.

---

## 15 — `Duration` and the magic constant

**Closed 2026-09-09 by the code.** Was: *`FieldContext` owes a usable duration, or `time/` owes a public conversion.*

Neither is owed. `MS` is **already public** — exported at `api/index.ts:365`, defined at `time/instant.ts:45`, with `SECOND`, `MINUTE`, `HOUR` and `DAY`. The library divides by it itself at `core-fields.ts:46`.

**The ruling: it was a documentation defect, not a design question.** The published `compute` sample wrote `duration.value / 86_400_000` and taught every consumer to write what I10 refuses to write inside `src/`. The sample writes `duration.value / MS.DAY`. Never publish the raw constant.

---

## 14 — should `FieldContext` bind to the row?

**Closed 2026-09-09 as out of scope.** Was: *`compute(entry, ctx)` hands the row to a context that takes it back — `ctx.read(entry, 'cost')`.*

Its own recommendation was *"measure before deciding"*, which is work, not a ruling. Nothing in groups A–D gates on it, and the current unbound shape has a recorded reason: the context is built once per `resolveColumns` and reused for every cell, which is why `formatValue` gained a third `entry` parameter instead (#240).

**The ruling: it is an issue, not a blocking decision.** The question is real and it survives — it is folded into decision **13**, which now covers all four read doors rather than two. Measure there.

---

## 10 — what a `compute` Field shows on a rolling-up parent

**Closed 2026-09-09.** Its own recommendation ended *"take this off the blocking list"*, and nothing gated on it.

**The ruling: `compute` runs on every row, a rolling-up parent included.** The union closes storage, not reading. A `compute` Field reading `entry.props.cost` on a group sees what the Rollup put in the store — a stored read through a door the union never closed. Blanking it would put `{ key: 'ref', compute: (e) => rowNumber(e.id) }` at an empty cell on every group row, which a consumer reads as a bug. The real limit is that a `compute` Field cannot ask *am I a parent?* — that is [#214](../../issues/214). Folded into the ADR body beside the Field union.

---

## 7 — what an S7 plugin does with a `progress` value it did not write

**Closed 2026-09-09 as not independent.** Its entire body was *"Downstream of 9."* It has no question of its own.

A required plugin prefix on the Field key makes a consumer's `progress` and a plugin's `progress` different keys, which closes this at no cost. A shared bare key space leaves it open, and the answer is then an install-time duplicate-declaration error rather than a silent overwrite. **Both answers are decided by 9 and 12.** Folded there. Listing it separately inflated the count of what was open.

---

## 3 — the schema restart's release gate

**Closed 2026-09-09.** Its own text read *"and that stands"*, so only a one-line addition was ever in question.

**The ruling: no change to the numbering.** `5` now and `1` at release. One rule joins the release gate instead — **a released reader refuses a file it did not write.** That retires the pre-release-`3`-against-released-`3` hazard permanently. Nothing reads schema 3 today. Spending a public number, or shipping a `preRelease` flag, would solve a problem that ends the day the library goes public. Folded into the ADR's `schema: 5` consequence.

---

## 2 — `entries.add({ props })` emits one changeset row

**Settled 2026-09-08. Kept for the record.**

One `EntityAdded` row carries the whole Entry as stored. Per-Field rows would undo one user action in several steps. The row states what the store now holds rather than what the call passed — after a dropped derived value, and after ingest fills `props: {}` and the Segments.

---

## 4 — what `InvalidInstantError` refuses

**Settled 2026-09-08. Kept for the record.**

It refuses an unreadable date, and an Entry that authors one date without the other. It stops refusing an Entry that authors neither, because dates become optional on every kind (group D).

---

## What closing these changed elsewhere

| Where | Change |
|---|---|
| ADR frontmatter | *"Sixteen blocking decisions are unmade"* was wrong — the list held fifteen. Then nine, plus 18 and 19. **20** joined from 18's cost table, taking it to twelve. The author's 2026-09-09 rulings closed **5** and **6**, so the live count is **ten**. |
| ADR § Blocking decisions | Preamble rewritten. Mapping table holds open numbers only. Closed numbers point here. |
| ADR body, Field union | Decision 10's ruling folded in. |
| ADR body, `schema: 5` | Decision 3's release-gate rule folded in. |
| ADR body, `compute` arm | The decision-14 pointer now says *closed*. |
| ADR decision 12 | *"closes 7"* now says 7 is closed as downstream. |
| ADR decision 13 | Widened from two read doors to four. Absorbs 14. |
| `api.md` § Plugin | The `86_400_000` sample becomes `MS.DAY`. |
| `README.md` group F | `CONTEXT.md:127` added — it names `DataEdit` and the `data` key from this ADR. |
