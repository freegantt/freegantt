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

## OQ2 — **CLOSED** · OQ3 — **CLOSED**

Both are answered in [`README.md`](./README.md): §0 Q7 and Q8, with the reasoning in §2 D-S2-23
(removable by construction — history, serialization and the span rollup stay in `data/` as leaves with
one importer each and a dependency-cruiser rule per leaf), D-S2-24 (one public change channel; the
history and the view's live binding are ordinary subscribers to it) and D-S2-11 (`apply` ships with the
sync adapter that calls it, and `ChangeOrigin` loses the two arms that had no producer).

Nothing settled is repeated here. Delete this heading when the next question closes.

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

---

## OQ7 — **CLOSED** — the engine never reaches the span rollup, because it does not need to

Answered in [`README.md`](./README.md) §2 **D-S2-22**, on the rule that grouping is core and scheduling
is optional, so the rollup cannot sit in anything an optional plugin occupies.

The rollup stopped being a resolver. It is step 5 of S2.2's commit sequence — after the resolve hook,
unconditional, not displaceable by any install. The engine moves children; the rollup catches the
parents up in the same transaction, the same changeset, one undo step. So the question's option (a) is
the answer, and both of its stated costs are gone: there is no composition order for `data/` to invent
(the sequence is the order), and "what wins when both patch a field" is decided once, in D-S2-22 — the
rollup yields to the body and wins over the resolver.

`scheduling-boundary` stays as ADR 0002 cut it, with no edge widened. `plans/03` §S3's *"parent/`group`
rollup as a second pass"* is deleted from the engine's job rather than re-homed, and the `plans/01` §2.5
ledger row can now be written.

---

## OQ8 — "Occupies the hook **exclusively**" — does the scheduling plugin *own* the slot, or is the slot simply *single-occupant*?

**Blocks:** nothing in S2 — S2 ships the hook as one internal field with one call site (D-S2-6) and is
compatible with either answer · **Decides:** S3's installation API (#15), and the wording of a locked
decision · **Touches:** `plans/00` D4, `docs/adr/0002`, `plans/01` §7, `plans/03` §S3, `CLAUDE.md`

The phrase comes from **`plans/00` D4** — *"A scheduling plugin, when installed, occupies that hook
exclusively"* — and is repeated in `CLAUDE.md`, `plans/01` §7, `plans/03` §S3. ADR 0002 states it more
weakly: *"a plugin **may** occupy it exclusively"*.

Two readings, and the codebase currently inherits the wrong one:

| | Reading | What it implies |
|---|---|---|
| a | **Ownership.** The slot is scheduling's by right; other resolvers are guests. | A scheduling-shaped hole in a hook whose whole point (D4) is that it is *generic*. `ProposalResolverConflictError` exists to tell a second claimant it lost. |
| b | **Arity.** The hook has exactly **one occupant at a time**; scheduling has no more claim on it than a consumer's own rule does. | The exclusivity is about determinism, not ownership. Any resolver may occupy it; the first-party engine is merely the one most consumers install. |

**(b) is what the rest of the design already assumes** — `data/` calls a `ProposalResolver`, not a
scheduler; the identity function occupies it when nothing else does; the S2 **default** occupant is
`data/`'s own span rollup, which is not scheduling at all (D-S2-22). Only the wording says (a).

**What exclusivity was actually protecting**, and what must survive any rewording: one resolver means
one call per transaction, one patch to check against the body's edits (I4), one deterministic answer,
and no priority/registry machinery in `data/`. A free-for-all list of resolvers loses all four.

**The mechanism that gives "tap into it or replace it" without losing them:** install a resolver as a
**wrapper over the current one**, not as a value that displaces it.

```ts
// replace: ignore what was there
setResolver(() => myResolver);

// tap in: run the existing one, then adjust
setResolver((next) => (request) => {
  const resolution = next(request);
  return { ...resolution, patch: [...resolution.patch, ...myExtraFields(request, resolution)] };
});
```

`data/` still holds **one** field and calls it at **one** site — nothing about the commit path changes,
and S2's internal `DatasetDataOptions.resolveProposal` is already the composed result. Composition order
is written at the install site in the consumer's own config, which is readable, rather than inferred
from priority numbers. And a plugin that wants no part of the built-in rollup replaces it, which is the
freedom (a) denies.

**No longer carries the rollup.** OQ7 closed by taking the span rollup *out* of the slot entirely
(D-S2-22), so this question is now only about how one **policy** resolver composes with another — not
about whether installing a plugin can switch off a core behaviour. It cannot.

**Open because:** it edits a **locked** decision (D4) and the ADR that carries it, so it is the user's
call, not a drafting fix. If it lands: D4's sentence becomes *"the hook has one occupant at a time; a
scheduling plugin is one candidate occupant, with no special claim on it"*, the same correction goes to
`CLAUDE.md`, `plans/01` §7 and `plans/03` §S3, ADR 0002 gets a superseding note, and
`ProposalResolverConflictError` (README §9) loses its reason to exist — there is no conflict to report
when installing composes.

