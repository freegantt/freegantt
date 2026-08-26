# S2 — Open questions

Decisions this slice needs and does **not** yet have. Everything settled lives in
[`README.md`](./README.md) §2 as a `D-S2-*` decision; nothing settled is repeated here.

**Do not start the step that depends on an open question below until it is closed.** Each entry names
that step.

---

## OQ1 — Does `data/`'s resolve hook carry `diagnostics`, and who owns the word `patch`?

**Blocks:** S2.2 · **Touches:** `plans/01` §6, `CONTEXT.md`, `docs/adr/`

`data/resolve-hook.ts` is specified with `ProposalResolution = { patch, diagnostics }`. Two separate
questions sit inside that shape and only one of them is really about `data/`.

**`patch`** — "here are additional fields to change, on top of what the consumer asked". It is not
scheduling vocabulary: D-S2-22's span rollup produces one, `autoGroup` (S5) would produce one, and a
consumer plugin that clears a flag when a date moves would produce one. But `CONTEXT.md`'s
**ChangeSet** entry currently reads *"Patch is reserved for `ScheduleResult.patch`"*, which assigns the
word to a type that does not exist yet and that `data/` cannot import.

**`diagnostics`** — "I could not do what you asked, and here is why, naming the entries". `CONTEXT.md`
defines **Diagnostic** as a report *the scheduling engine* attaches. In S2 nothing produces one: a span
rollup always succeeds, and `scheduleDiagnostics` on `DatasetEventMap` is already deferred to S3
(D-S2-5). A field nothing fills and nobody reads is the I11 shape §0 Q1 and Q2 reject elsewhere.

Options for `diagnostics`:

| | Option | Cost |
|---|---|---|
| a | Drop it in S2. `ProposalResolution` is `{ patch }`; `diagnostics` and the term `Diagnostic` arrive in S3 with the engine that fills them and the event that carries them. | S3 widens an interface it already owns. |
| b | Ship it empty in S2. | A declared field with no producer for one whole slice. |
| c | Ship it, and give `data/` its own word (`ResolutionNote`) so scheduling keeps `Diagnostic`. | Two words for one idea the day S3 lands. |

Options for `patch`: generalize `CONTEXT.md`'s reservation to the resolve hook and retire
`ScheduleResult` in favour of `ProposalResolution` (one name, and `ScheduleResult` exists only in prose
today) — or keep both names and accept the pair.

**Open because:** the standing worry is that scheduling concepts are being pulled into core through
this hook. Settle what the hook is allowed to say before S2.2 writes the file. Whichever way it lands
is ADR-shaped: hard to reverse once S3's engine is written, and there was a real alternative.

---

## OQ2 — Is the mutation core the right size for core, or should parts of it be installable?

**Blocks:** the shape of S2.5 and S2.6 · **Touches:** `plans/01` §1/§6, `plans/00` D4, ADR 0002

The concern: S2 is the largest slice in the plan, and a state system this size sitting in the mandatory
core looks like the thing ADR 0002 already decided *not* to do for scheduling.

What the renderer actually requires in order to work at all is two things: a way to read entries
(`EntryStoreView`), and a way to know they changed (`change` carrying a delta). Everything else in S2
is a consumer of those two.

The nine pieces, split by whether anything else depends on them:

| Piece | Depended on by |
|---|---|
| stores + indexes | `layout/`, `view/`, every plugin |
| reactivity façade | the stores |
| event bus | the `change` event |
| transaction | every mutation path, including gestures and plugins |
| changeset | undo, serialization, sync, the view binding |
| resolve hook | cascades landing in one changeset |
| span rollup (D-S2-22) | the resolve hook |
| **history (undo/redo)** | **nothing** |
| **serialization** | **nothing** |
| **`apply()` / sync** | **nothing** (see OQ3) |

The last three are already separate files in the plan (`data/history.ts`, `data/serialization/**`).

The argument against making them plugins: undo can only promise "one gesture, one undo step, engine
cascades included" (D10, I7) if **every** mutation — from `interaction/`, from other plugins, from the
public API — flows through a transaction producing a complete changeset. That forces the transaction
and the changeset into core. Once they are there, history is a stack, a cursor and an inverse; a
plugin API to install that is more surface than the thing it installs, and designing, documenting,
versioning and gating that API is the I11 defect §0 Q1 rejected for `DatasetOptions.plugins`.

Options:

| | Option | Consequence |
|---|---|---|
| a | Keep all nine in `data/`, and add a dependency rule proving the separation: `data/history.ts` and `data/serialization/**` may import the store and the changeset, and **nothing may import them**. Checkable by dependency-cruiser, the same trick ADR 0002 used. | Removability becomes a CI fact instead of a claim; no new public surface. |
| b | Make history and serialization first-party installable plugins. | A plugin-installation API in S2 — the thing §0 Q1 deferred to S3 — plus a public store-enumeration surface, because a serialization plugin must read stores it does not own. |
| c | Keep as planned, prove nothing. | The status quo the concern is about. |

**Recommendation on the table: (a).** It delivers the removability and the low coupling without
inventing an API, and it makes the claim falsifiable. But (b) is a real option and the call is not made.

---

## OQ3 — Does `apply(changeSet)` ship in S2 at all?

**Blocks:** S2.6 · **Touches:** `plans/03` §S2, `plans/02` §6, README §1 U6, §3, D-S2-11

`apply` is the largest block of public surface in the slice with **no consumer inside it**: no harness
button calls it, no acceptance id covers it, and it carries four public types (`ApplyReport`,
`Rejection`, `RejectionReason`, plus the `'stale-from'` semantics) and a whole design axis —
optimistic-concurrency detection, which D-S2-7's equality table already shows is subtle for `meta`.

`plans/02` §6 asks that a future sync adapter be *"an extension, not a core change."* That promise is
discharged by the changeset contract — `on('change')` carrying `{from, to}` — which S2 ships either
way. `apply` is the thing such an extension **writes**, not the thing core must provide first.

| | Option | Consequence |
|---|---|---|
| a | Defer `apply` to the slice with a sync caller. S2.6 becomes serialization only; the slice drops to six steps. | `plans/03` §S2's scope line and README U6 need correcting; `plans/00` §4's S2 → S3 condition does not mention `apply`, so the gate is unaffected. |
| b | Ship it as planned. | Four public types and a staleness contract, frozen into the S2 `api-report` baseline, with the first real caller a slice or more away. |

**Recommendation on the table: (a)**, as the cheapest honest reduction in the slice's size.

---

## OQ4 — Does `layout/` bind to a `Dataset` or to a snapshot?

**Blocks:** S2.1 · **Touches:** D-S2-2, S2.1 §3, S2.4 §1

D-S2-2 puts `EntryStoreView` — four members, three of them methods — in `model/`, so `Viewport.bind`
receives a behavioural contract and calls `dataset.entries.snapshot()`. The plan states in the same
paragraph that *"`layout/` takes a snapshot and has no interest in a store."*

After S2.4, `ScaleBinding.entries` is push-to and the shell pushes `entries.snapshot()` on every
change. `Viewport.bind` reading the dataset *and* the shell pushing entries are then two paths to one
value — a small instance of #1's R4.

| | Option | Consequence |
|---|---|---|
| a | `Viewport.bind` takes `{ entries: readonly Entry[]; timeZone: string }`. | Removes a read site instead of migrating it; kills the double path before S2.4 creates it; changes a `layout/` signature inside a step that otherwise promises no behaviour change. |
| b | As planned — `layout/` binds to `model/Dataset`. | `layout/` depends on a method contract, and the double path stands. |

**Recommendation on the table: (a).**

---

## OQ5 — Is `DatasetData` the right name?

**Blocks:** S2.1 · **Touches:** `plans/01` §6, `CONTEXT.md`

`plans/01` §6 names the class `DatasetData`, written when `api/dataset.ts` did the real work. After
S2.1 it is inverted: `DatasetData` holds the stores, the zone, the reference date, the resolver, the
history and the bus, and `api/Dataset` is a façade that delegates.

Read the call site: `new DatasetData({ entries, timeZone })` — "a new dataset data". `Data` is a
generic word covering more than one concept in this codebase (`data/` the layer, `DatasetData` the
class, the dataset itself), which CLAUDE.md calls a bug rather than a style nit, and it is the failure
#7 records verbatim.

Candidates: keep `DatasetData` (spec'd, and renaming costs a `plans/01` §6 edit); `DatasetCore`;
`DatasetStores`; or invert the pair so `data/` owns the name `Dataset` and `api/` re-exports it.

**No recommendation yet** — run it through the naming skill when S2.1 starts.

---

## OQ6 — Two stale lines in `plans/03` §S2 that the ledger does not correct

**Blocks:** nothing · **Fix in:** S2.7 · **Touches:** README §7

`README.md` §7 lists one `plans/03` §S2 edit (the four boxes get ids; "invalidate incrementally"
corrected). Two more lines are stale and are not in the table:

- **Line 67** — *"S2 **replaces** `GanttShellOptions.entries`"*. That key does not exist:
  `GanttShellOptions` (`src/view/gantt-shell.ts:41`) has `dataset`, and never had `entries`. The
  sentence's *intent* — never add a `setEntries()` beside the changeset — is live and is D-S2-20; only
  the "replaces" clause is wrong.
- **Line 72** — lists `dataset.dependencies.*` in S2's public mutation API. §0 Q2 defers plugin stores
  to S3, so the line contradicts a settled scope call.

Add both to §7's `plans/03` row.
