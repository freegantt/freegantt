# S2 — Open questions

Decisions this slice needs and does **not** yet have. Everything settled lives in
[`README.md`](./README.md) §2 as a `D-S2-*` decision; nothing settled is repeated here.

**Slice numbers after S2 (remap 2026-08-28):** S3 is direct manipulation. S4 is hierarchy. S5 is the plugin runtime. S6 is scale. S7 is the first-party scheduling plugin. Closed entries below that say "S3" for the engine mean **S7**.

**Do not start the step that depends on an open question below until it is closed.** Each entry names
that step.

---

## OQ1 — **CLOSED** — the hook is `EditRequest → EntryEdits` via an `EditExtender`; `diagnostics` waits for S7

**Current shape (see "Revised again" below, which supersedes the `EditAdjustment`/`FieldPatch` shape
this section originally closed on):** `EditExtender = (request: EditRequest) => EntryEdits`.

**Closed as diagnostics-option (a), patch-option (generalize).** `data/edit-extension.ts` was specified
with `ProposalResolution = { patch, diagnostics }`. Renamed and resolved:

- **`ProposalResolution` → `EditAdjustment`**, `{ patch }` only in S2. `ProposalResolutionRequest` →
  `EditRequest`, `{ entries, proposed }`. `ProposalResolver` → `EditExtender`. `Resolution`-suffixed
  names were rejected outright — they read as the whole before/after state of the edit, when the type
  only ever holds the extender's *additions*; `EditAdjustment` says that directly (naming pass recorded
  in `plans/s2-data-core/HANDOFF.md`, and `CONTEXT.md`'s **EditRequest**/**EditAdjustment**/
  **EditExtender** entries).
- **`diagnostics` — option (a).** Dropped from S2 entirely. `EditAdjustment` is `{ patch }`;
  `diagnostics` and the term `Diagnostic` arrive in S3 with the engine that fills them and the event
  that carries them (`scheduleDiagnostics` was already deferred there, D-S2-5). Nothing in S2 has a
  reason to produce one, so shipping it empty (b) or under a second word (c) would only have declared a
  field I11 rejects elsewhere.
- **`patch` — generalized.** `CONTEXT.md`'s **ChangeSet** entry now reserves `patch` for
  `EditAdjustment.patch`. `ScheduleResult` is retired as a name — it existed only in prose (§7 draft
  text) and never had a `src/` type to protect; S3's engine returns an `EditAdjustment` directly, no
  mapping step, so the two never had a reason to diverge in the first place.

`plans/s2-data-core/README.md` §2.2 and the S2.2/S2.3 step files carry the same rename.

**Revised again, 2026-08-27, at the user's explicit direction:** `EditAdjustment { patch: FieldPatch[] }`
is retired. `FieldPatch` was `FieldUpdated` with `store` removed, invented only so the extender had
something to return. An `EditExtender` now returns `EntryEdits` (`ReadonlyMap<EntryId, EntryEdit>`)
directly — the same shape a caller already writes to `dataset.entries.update()`. `EditRequest.entries`
is now `ReadonlyMap<EntryId, Entry>`, not an array (`EntryStore` already keeps one). This drops the
"structurally identical to `ScheduleResult`" guarantee the earlier shape carried — that guarantee
protected an S3 type that doesn't exist yet, for a slice with no design; a clean, usable S2 API took
priority over pre-matching a future spec. `data/change-set.ts` gains `diffEdit(entries, id, edit)`, run
once per id in `proposed` and once per id in the extender's `EntryEdits`, so both sides go through one
diffing function. Full detail: `CONTEXT.md`'s **EntryEdits**/**EditRequest**/**EditExtender** entries,
`plans/s2-data-core/README.md` §2.2 (D-S2-6), and the S2.2/S2.3 step files.

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

## OQ4 — **CLOSED** — `Viewport.bind` takes a snapshot, not a `Dataset`

**Closed as option (a).** `Viewport.bind` takes `{ entries: readonly Entry[]; timeZone: string }`,
not `model/Dataset`. This removes the read site instead of migrating it, so the double path option (b)
would have created against S2.4's push-to `ScaleBinding.entries` never opens. `layout/` keeps its
existing "no interest in a store" posture from S2.1 onward, with no signature it will need to widen
back later.

---

## OQ5 — **CLOSED** — the class is `DatasetState`, not `DatasetData`

Run through the naming skill at S2.1's start. `DatasetCore` was rejected: `core` already carries a
loaded, specific meaning throughout this slice's own decisions ("grouping is core", "a core step in
the commit path", "core behaviour must not live somewhere optional code can displace it") — naming a
class `DatasetCore` would give that word a second meaning next to every one of those sentences, which
is check 4 failing on its own turf. `DatasetStores` was rejected: the class holds more than stores —
`timeZone`, `dateOnlyEnd`, `referenceDate`, the extender, the history, the bus — so the name promises
less than the class holds, and the plural reads wrong at the call site. Inverting the pair (`data/`
owns the name `Dataset`) was rejected: `model/dataset.ts` already exports a structural `Dataset` that
`api/dataset.ts`'s class satisfies, and a second class also named `Dataset` one file down disambiguated
only by import path is worse, not better — check 4 again.

**`DatasetState`.** It names what the class actually is — the live, mutable state one `Dataset`
instance owns privately — and it does not collide: `CONTEXT.md`'s only existing use of the bare word is
the two-word compound *State attribute* (a CSS `data-*` concept), which reads as its own term and
creates no confusion with a class name one layer away in `data/`. Call site: `new DatasetState({
entries, timeZone })` — "construct a new dataset's state, given these entries and this time zone" —
reads true. `plans/01` §6 and `CONTEXT.md` get a **DatasetState** entry (_Avoid_: DatasetData — retired
here for the reason above; DatasetCore, DatasetStores — rejected candidates, see this entry).

---

## OQ6 — **CLOSED** — two stale lines in `plans/03` §S2 that the ledger did not correct

**Closed in S2.7.** Both lines are fixed: the `GanttShellOptions.entries` "replaces" clause now reads
as D-S2-20's live-binding intent, and `dataset.dependencies.*` is struck from S2's mutation API scope
with §0 Q2's deferral to S3 named alongside it.

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

The rollup stopped being an extender. It is step 5 of S2.2's commit sequence — after the extension hook,
unconditional, not displaceable by any install. The engine moves children; the rollup catches the
parents up in the same transaction, the same changeset, one undo step. So the question's option (a) is
the answer, and both of its stated costs are gone: there is no composition order for `data/` to invent
(the sequence is the order), and "what wins when both patch a field" is decided once, in D-S2-22 — the
rollup yields to the body and wins over the extender.

`scheduling-boundary` stays as ADR 0002 cut it, with no edge widened. `plans/03` §S3's *"parent/`group`
rollup as a second pass"* is deleted from the engine's job rather than re-homed, and the `plans/01` §2.5
ledger row can now be written.

---

## OQ8 — **CLOSED** — the slot is single-occupant; installing composes

**Closed as reading (b), in S5.10 (2026-09-04)** — `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md`
D-S5-23. `ctx.edits.setExtender(wrap)` takes an `ExtenderWrapper`, so a plugin receives the current
occupant and adds to it. D4's sentence now reads *"the hook has one occupant at a time; a scheduling
plugin is one candidate occupant, with no special claim on it"*, and the same correction landed in
`CLAUDE.md`, `plans/01` §7 and `plans/03` §S3, with a superseding note on ADR 0002.
`EditExtenderConflictError` was never written: there is no conflict to report when installing composes.
Wrapping order is the order `requires` resolves, never the `plugins` array's own order (D-S5-31) — the
one correction to the reasoning below, which assumed the install site's order.

The question as it stood:

**Blocks:** nothing in S2 — S2 ships the hook as one internal field with one call site (D-S2-6) and is
compatible with either answer · **Decides:** S3's installation API (#15), and the wording of a locked
decision · **Touches:** `plans/00` D4, `docs/adr/0002`, `plans/01` §7, `plans/03` §S3, `CLAUDE.md`

The phrase comes from **`plans/00` D4** — *"A scheduling plugin, when installed, occupies that hook
exclusively"* — and is repeated in `CLAUDE.md`, `plans/01` §7, `plans/03` §S3. ADR 0002 states it more
weakly: *"a plugin **may** occupy it exclusively"*.

Two readings, and the codebase currently inherits the wrong one:

| | Reading | What it implies |
|---|---|---|
| a | **Ownership.** The slot is scheduling's by right; other extenders are guests. | A scheduling-shaped hole in a hook whose whole point (D4) is that it is *generic*. `EditExtenderConflictError` exists to tell a second claimant it lost. |
| b | **Arity.** The hook has exactly **one occupant at a time**; scheduling has no more claim on it than a consumer's own rule does. | The exclusivity is about determinism, not ownership. Any extender may occupy it; the first-party engine is merely the one most consumers install. |

**(b) is what the rest of the design already assumes** — `data/` calls an `EditExtender`, not a
scheduler; the identity function occupies it when nothing else does; the S2 **default** occupant is
`data/`'s own span rollup, which is not scheduling at all (D-S2-22). Only the wording says (a).

**What exclusivity was actually protecting**, and what must survive any rewording: one extender means
one call per transaction, one patch to check against the body's edits (I4), one deterministic answer,
and no priority/registry machinery in `data/`. A free-for-all list of extenders loses all four.

**The mechanism that gives "tap into it or replace it" without losing them:** install an extender as a
**wrapper over the current one**, not as a value that displaces it.

```ts
// replace: ignore what was there
setExtender(() => myExtender);

// tap in: run the existing one, then adjust
setExtender((next) => (request) => {
  const adjustment = next(request);
  return { ...adjustment, patch: [...adjustment.patch, ...myExtraFields(request, adjustment)] };
});
```

`data/` still holds **one** field and calls it at **one** site — nothing about the commit path changes,
and S2's internal `DatasetDataOptions.editExtender` is already the composed result. Composition order
is written at the install site in the consumer's own config, which is readable, rather than inferred
from priority numbers. And a plugin that wants no part of the built-in rollup replaces it, which is the
freedom (a) denies.

**No longer carries the rollup.** OQ7 closed by taking the span rollup *out* of the slot entirely
(D-S2-22), so this question is now only about how one **policy** extender composes with another — not
about whether installing a plugin can switch off a core behaviour. It cannot.

**Open because:** it edits a **locked** decision (D4) and the ADR that carries it, so it is the user's
call, not a drafting fix. If it lands: D4's sentence becomes *"the hook has one occupant at a time; a
scheduling plugin is one candidate occupant, with no special claim on it"*, the same correction goes to
`CLAUDE.md`, `plans/01` §7 and `plans/03` §S3, ADR 0002 gets a superseding note, and
`EditExtenderConflictError` (README §9) loses its reason to exist — there is no conflict to report
when installing composes.

