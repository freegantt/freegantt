# Closed decisions — ADR 0011

**Governing:** [`docs/adr/0011-…`](../../docs/adr/0011-consumer-values-live-in-props-and-a-derived-value-never-persists.md). Open decisions live there and only there. **This file is the only other place an ADR 0011 decision is written down**, and it holds the closed ones.

**A number never moves.** A closed decision keeps its number and leaves the ADR's list. Do not renumber the survivors to close the gaps — the plan, the conflict log and two reviews cite these numbers.

| Open in the ADR | Closed here |
|---|---|
| 1, 5, 6, 8, 9, 11, 12, 13, 16, 18, 19 | 2, 3, 4, 7, 10, 14, 15, 17 |

Eight closed. Two of the eight were settled on 2026-09-08 and are kept for the record. Six closed on 2026-09-09: one by the author's ruling, one by the author's ruling on a review finding, and four by a consistency review that found them already answered.

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
| ADR frontmatter | *"Sixteen blocking decisions are unmade"* was wrong — the list held fifteen. Now nine, plus 18 and 19. |
| ADR § Blocking decisions | Preamble rewritten. Mapping table holds open numbers only. Closed numbers point here. |
| ADR body, Field union | Decision 10's ruling folded in. |
| ADR body, `schema: 5` | Decision 3's release-gate rule folded in. |
| ADR body, `compute` arm | The decision-14 pointer now says *closed*. |
| ADR decision 12 | *"closes 7"* now says 7 is closed as downstream. |
| ADR decision 13 | Widened from two read doors to four. Absorbs 14. |
| `api.md` § Plugin | The `86_400_000` sample becomes `MS.DAY`. |
| `README.md` group F | `CONTEXT.md:127` added — it names `DataEdit` and the `data` key from this ADR. |
