# S2.3 in progress — handoff

**Branch:** `s2-s2`. Last commit: `cb7736b` "S2.3 WIP: entries.add/update/remove, validation, and the
span rollup". Working tree clean at handoff time.

**Verified green at handoff time:** `tsc --noEmit`, `eslint src harness --max-warnings 0`, `depcruise
--config .dependency-cruiser.cjs src harness`, `pnpm vitest run --project pure --project dom` (295
tests, 0 failures). Have **not** re-run the full `pnpm verify` (format/build/vendor-names/disables
steps) or `pnpm test:e2e` since this commit — do that first thing before writing more code, and before
trusting this handoff's "green" claim past this point.

Read `plans/s2-data-core/s2.3-mutation-api.md` in full before continuing — this file only tracks
what's done, what's left, and one design decision made along the way that isn't in that step file.

## What's implemented (§1.1–§1.5 of the step file)

- **`model/errors.ts`**: `DuplicateEntryIdError`, `ParentCycleError`, `UnknownFieldError` added;
  `EntryNotFoundError` now takes `(entryId, operation)` — `reveal`'s call site in
  `view/gantt-shell.ts` updated to pass `'reveal'`. All exported from `model/index.ts` and
  `api/index.ts`.
- **`model/entry.ts`**: `EntryInput.start`/`end` are now optional. `EntryEdit` already existed (landed
  in an earlier session before this handoff was written — nothing to do there).
- **`model/dataset.ts`**: new `EntryStore` interface (`extends EntryStoreView`, adds
  `add`/`update`/`remove`) — this is the **public**, model-level contract for `dataset.entries`, not
  to be confused with `data/entry-store.ts`'s concrete class of the same name (imported under the
  alias `EntryStoreContract` wherever both are needed in one file — see that file's imports).
  `Dataset.entries` is now typed `EntryStore`, not `EntryStoreView`. Exported from `model/index.ts` and
  `api/index.ts`.
- **`data/entry-reader.ts`**: `EntryReadContext` gained `referenceDate: Instant` and
  `derivedSpanKinds: ReadonlySet<EntryKind>`. `readEntry` (singular) is now exported — `entries.add()`
  and construction's `readEntries` share it. New `readEdit(edit, context): StoredEdit` for `update()` —
  deliberately **not** the same "both start and end, or neither" rule `readEntry` enforces, since an
  edit patches one field of an already-complete `Entry` rather than constructing a new one.
- **`data/change-set.ts`**: exports `CORE_FIELD_KEYS: ReadonlySet<string>`, derived from the existing
  `coreComparators` table — what `entries.update()` validates an edit's keys against
  (`UnknownFieldError`).
- **`data/span-rollup.ts`** (new file): `rollUpDerivedSpans(entries, proposed, kinds)`. Bottom-up
  (deepest deriving-kind entry first), min/max aggregation over children's effective spans (own
  proposed edit, else committed value, else — for a child that is itself a deriving kind this same
  pass already computed — the freshly computed value). A field the merged `proposed` map already has
  for that entry is left alone (see "One simplification" below). Childless deriving-kind entries are
  skipped (no row emitted) — they keep whatever span they have.
- **`data/entry-store.ts`**: `EntryStore` now also implements the public `EntryStore` contract.
  Constructor takes `(entries, context: EntryReadContext)`. New `bindTransactions(runner:
  TransactionData)` — called once by `DatasetState` right after both exist (see "One simplification"
  below for why this two-phase wiring exists). Public `add`/`update`/`remove`:
  - All three auto-wrap via `runTransaction` (`#mutate` private helper) — joins an already-open
    transaction, opens one if not (D-S2-8).
  - `add`: `DuplicateEntryIdError` on an id already in the write-set-aware store; validates
    `parentId` (existence + cycle, self-parenting included) before calling `readEntry`; stages via the
    existing `stageAdd`; returns the write-set-aware read of the new entry.
  - `update`: `EntryNotFoundError` if the id is unknown; every key in the edit object checked against
    `CORE_FIELD_KEYS` (`UnknownFieldError` on a miss); `parentId` validated the same way as `add`;
    converts via `readEdit`; stages via `stageUpdate`.
  - `remove`: `EntryNotFoundError` if unknown; walks `childrenOf` recursively (`#subtreeOf`, computed
    *before* any removal in this call is staged) and stages every descendant plus the id itself
    (cascading remove, §1.4).
  - `#assertParentValid(id, parentId, operation)`: existence check first (`EntryNotFoundError`), then
    walks the parent chain via the write-set-aware `get` looking for `id` itself (`ParentCycleError`).
- **`data/transaction.ts`**: `TransactionData.rollUp` field replaced with `derivedSpanKinds:
  ReadonlySet<EntryKind>`; `noRollUp` removed entirely; the commit sequence's step 5 now calls
  `rollUpDerivedSpans(snapshot, mergeEdits(proposed, extenderEdits), data.derivedSpanKinds)` directly
  — `transaction.ts` is the **only** file that imports `span-rollup.ts` (see the dependency-cruiser
  rule below).
- **`data/dataset-state.ts`**: `DatasetStateOptions.derivedSpanKinds?: readonly EntryKind[]` (default
  `['group']`), stored as `this.derivedSpanKinds: ReadonlySet<EntryKind>` — satisfies
  `TransactionData`. Builds one `EntryReadContext` at construction, passes it to both `readEntries`
  and `new EntryStore(entries, context)`, then calls `this.entries.bindTransactions(this)`.
- **`api/dataset.ts`**: `DatasetOptions.derivedSpanKinds?: readonly EntryKind[]` (public, passed
  straight through to `DatasetState`). `entries` getter retyped to the public `EntryStore` contract.
- **`.dependency-cruiser.cjs`**: new `removable(name, modulePath, allowedImporterPath)` helper plus
  the first leaf rule, `span-rollup-is-removable` — only `src/data/transaction.ts` may import
  `src/data/span-rollup.ts`. **This file is under the `protect-spec.sh` PreToolUse hook** (same as
  S2.1's `time` edge) — editing it required an explicit human confirmation mid-session (granted) and
  was applied via `Write` (whole-file), not `Edit`, for the same false-positive-heuristic reason S2.1
  hit. If you need to touch this file again, expect the same prompt.
- Fixed up test fixtures across the codebase that construct `EntryStore` or an `EntryReadContext`
  directly: `src/data/entry-reader.test.ts`, `src/data/entry-store.test.ts`,
  `src/view/gantt-shell.test.ts`, `src/view/styles.test.ts`. `view/`'s two fixtures use a bare `0 as
  Instant` for `referenceDate` rather than `time/`'s `instant()`, since `view/` may not import `time/`
  (I1) — same pattern the file's own existing `Entry['start']`/`end` casts already used.

## One simplification made along the way (read before touching span-rollup precedence)

The step file's prose (§1.5, and `plans/s2-data-core/README.md` D-S2-22) says the rollup "yields to a
field the **body** proposed and wins over one the **extender** proposed." But `transaction.ts`'s
existing commit sequence (written in S2.2, unchanged here) merges the body's and the extender's edits
into one `EntryEdits` map *before* the rollup ever runs (`mergeEdits(proposed, extenderEdits)`), and
the merge is only safe because the dev-mode I4 assert already forbids the two producers from touching
the same `(id, field)` pair. So by the time `rollUpDerivedSpans` sees `proposed`, body-vs-extender
provenance is already lost — there's no way to implement "wins over the extender" as written without
changing `runTransaction`'s call site to pass the two edit sets separately.

**What's actually implemented:** the rollup skips a field if the merged `proposed` map already has a
value for it, full stop — it doesn't distinguish which producer supplied it. In S2 this is
unobservable: nothing occupies the extension hook with real edits (`identityExtender` is the only one
in play), so "already proposed" only ever means "the body proposed it." The divergence from the spec's
literal words is real but dormant. `src/data/span-rollup.ts`'s own doc comment says this in full,
including what would need to change (`runTransaction` passing body-only and extender-only edits
separately) when S3 lands a real extender. **Flag this to the user if S3 work starts touching the
commit sequence** — it's the kind of thing that's easy to forget once S2 ships and everything passes.

## Known gap: rollup does not run at construction

`plans/01` §2.6 and `README.md`'s own D-S2-22 discussion say "`fromJSON` goes through construction like
any other `Dataset`, so the span rollup runs on read" — implying `new Dataset({ entries })` itself
should run the rollup once, so a `{ id: 'p1', kind: 'group' }` with children declared in the same
initial array (exactly `plans/02` §2's own example) gets a real span immediately, not just after the
first later transaction touches one of its children.

An earlier version of this session's work *did* implement that (a local `applyInitialRollUp` helper
in `dataset-state.ts` calling `rollUpDerivedSpans` directly), but it was reverted: `dataset-state.ts`
importing `span-rollup.ts` directly violates the `span-rollup-is-removable` rule just added (only
`transaction.ts` may import it). Rather than loosen the rule right after adding it, this was left as an
open gap — noted inline in `dataset-state.ts`'s constructor (search `NOTE (left for the next step`).

**This is not in S2.3's own `§2` test list** (which only tests rollup-on-move, not rollup-at-construction),
so it may be intentionally S2.6's job (`fromJSON`) rather than S2.3's — check `s2.6-serialization.md`
before assuming it belongs here. If it does belong in S2.3, the clean fix is probably a small
`data/`-internal helper `transaction.ts` also exposes (or a one-off transaction-shaped call
`dataset-state.ts` can make through `runTransaction`/`transaction.ts`'s public surface) rather than a
second file importing `span-rollup.ts` directly.

## What's left (from the step file's own §4 TODO)

- [ ] `src/data/entry-store.mutation.test.ts` (§2) — **not started**. This is the bulk of the
      remaining work; the step file's §2 lists ~15 required cases (add/update/remove validation,
      auto-wrap, cascading remove, read-your-own-writes validation, rollup behavior including the
      childless/derivedSpanKinds:[]/same-transaction-proposed cases, removability-by-injected-extender).
- [ ] `plans/02` §2 — the three new typed errors; `derivedSpanKinds`; `EntryInput.start`/`end`
      optional (which is what makes §2's own `{ id: 'p1', kind: 'group' }` example typecheck without
      `start`/`end`) — **not yet written up**.
- [ ] `plans/01` §2.5 — state that the rollup is `data/`'s own commit step, configured by
      `derivedSpanKinds`, displaceable by nothing (D-S2-22; closes OQ7) — **not yet written up**.
- [ ] `plans/03` §S3 — delete the engine's *"parent/`group` rollup as a second pass"* line; the
      engine moves children and nothing else now — **not yet written up**.
- [ ] `CONTEXT.md` — **Entry** gains "an id is identity, never editable"; new **Span rollup** entry;
      **Kind** gains a `derivedSpanKinds` mention — **not yet written up**.
- [ ] Re-run full `pnpm verify` (not just the four checks done ad hoc above) and `pnpm test:e2e`
      before calling S2.3 done.
- [ ] Decide and close the construction-time-rollup gap above (or explicitly confirm with the user
      it's deferred to S2.6).

## Suggested next step

Start with `src/data/entry-store.mutation.test.ts` — it's the largest remaining chunk and writing it
will likely surface any remaining behavioral gaps (e.g. it may make the construction-time-rollup
question unavoidable, if a test fixture needs a group-with-children-at-construction). Do the four doc
updates last, once the code and tests are settled, the same order S2.2 followed.
