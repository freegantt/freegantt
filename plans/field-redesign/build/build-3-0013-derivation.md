# Build 3 — ADR 0013, children decide derivation

**The one question it answers.** What makes a row derive its values? It has children.

**Read first.** [`docs/adr/0013`](../../../docs/adr/0013-what-decides-that-a-row-derives-its-values.md). Its *The build* section holds the door table — do not copy it here. Then [`README.md`](README.md) in this folder.

**Lands after.** Builds 1 and 2. Build 1 makes a dateless Entry representable, and demotion produces one. Build 2 produces the merged patch this policy is written against.

**Tick each box as you finish it.** Do not batch the ticks.

---

## Target state

**The rule, once.** An Entry derives when it has children. That is the whole predicate.

`kind` leaves `Entry`. There is no `update({ kind })`. `EntryKind` stops being an Entry classification.

**Defaults.** A parent with children draws the parent look. A childless row draws a bar. Core ships no diamond.

**Errors.** `DerivedFieldNotWritableError` is declared here and thrown at `entries.update()`. `RollUpKindsWouldDropValuesError` **never exists** — decision 6 closed as drop-and-recalculate.

**Reports.** One report per operation, not per value. It names the count, the Field keys, and up to three Entry ids. It goes through `raiseError` at `severity: 'warning'`, **always**.

**Parent bar drag.** It translates every descendant date that exists, in one transaction and one undo. It reuses `beforeEntryMove` / `entryMove`. `event.entry` is the parent. `event.entries` is each descendant that will move. One veto refuses the whole gesture. There is no new event pair, and no `isGroup` flag.

---

## Work

- [x] Delete `kind` from `Entry` (`src/model/entry.ts:29`) and from the core Field set.
- [x] Delete `rollUpKinds` and `hierarchy.autoGroup`.
- [x] Make `src/data/rollup.ts` ask structure only. Delete the three `kinds.has` reads.
- [x] Wire `src/view/capability.ts:119` to children, not to `isRollUpKind(entry.kind)`.
- [x] Re-home the four registries that keyed on `entry.kind` onto structure or a plugin store.
- [x] Delete the core diamond — `--fg-diamond-size` and the milestone producer.
- [x] Make the item producer ask structure, not `entry.kind`.
- [x] Declare `DerivedFieldNotWritableError`. Fill the resolver's **derived** arm.
- [ ] Wire `entries.update()` to the derived arm. Build the answers from **six** call sites — see *Six doors* below. **PARTIAL: `entries.update()` itself throws (done); the other five doors (cell editor, bar drag, `add()`, constructor, extension hook) are not individually verified — see BUILD-LOG J17 handoff.**
- [x] Refuse a mixed patch **whole, before any write**. `{ start, cost }` with a derived `cost` writes nothing. (in `EntryStore.update()`; not yet covered by a test)
- [x] Make `add()` and `new Dataset({ entries })` **drop** a derived value, and raise one report. Both tested: `rollup.test.ts` "construction drops…" and "a batch of add() calls…".
- [x] Drop a promoting Entry's authored values in the **same** ChangeSet as the `parentId` write. One undo reverses both. Test-verified: `hierarchy.test.ts` "one undo reverses both the parentId write and the dropped authored value it caused" passed unmodified — no `src/` change needed.
- [x] Demote on the last child leaving: keep the name, clear the dates, draw no bar.
- [x] Rewrite `src/data/hierarchy.test.ts:116`. *"Removing every child demotes nothing"* is **overruled**.
- [x] Write decision 5's warning. Wired at `data/build-commit-change-set.ts`: an extension-hook cascade's write to a rolling-up parent cell (reaches `merged`, never `body`) is dropped and raises one `derived-values-dropped` report per commit. Tested in `rollup.test.ts`.
- [x] Make an Aggregator's `undefined` clear the parent's value. Do not keep a stale envelope.
- [x] **Mint a Segment for a parent whose envelope the Rollup derived.** `widenSegmentsToEnvelope` (`src/data/rollup.ts`) widens an existing Segment set and returns early on an empty one, so it never mints from nothing. Build 1 retired the ingest-time fill, so a parent that spans only through its children now spans, draws a bar, and holds no Segment — and no click can select that bar. [ADR 0012](../../../docs/adr/0012-dates-are-optional-on-every-kind.md) assigns the repair here: *"ADR 0013 owns the Rollup pass; the biconditional pass must restore."* See [`../BUILD-LOG.md`](../BUILD-LOG.md) J3 and J9.
- [ ] Make a parent bar drag translate every descendant date through `beforeEntryMove` / `entryMove`. **NOT STARTED.**
- [x] Land [#270](https://github.com/Pawel-IT/FreeGantt/issues/270)'s fix **inside this build**. See *Issues* below. (same code change as the Aggregator-`undefined` fix above — not test-verified)
- [ ] Close the build — see [`README.md#close-every-build`](README.md). **NOT STARTED — verify:full has not been run this session.**

**Slices it touches.** S2 (the ChangeSet, undo), S3 (parent bar drag), S4 (the Rollup, the item producer, `autoGroup`, the tree), S5 (the capability resolver, the extension hook). **Re-run the S2, S3, S4 and S5 slice gates.**

---

## Six doors

Build the derived answer from **six** call sites. Reading four leaves two that **drop** instead of throwing.

1. `entries.update()`
2. The cell editor
3. The bar drag
4. `entries.add()`
5. `new Dataset({ entries })`
6. The extension hook

`fromJSON` was a seventh. Build 0 deleted it. **Do not re-add it.**

---

## Do not

- **Do not unify the `body` / `merged` predicate.** That instruction was withdrawn as a misread. The split is deliberate and documented at `src/data/rollup.ts:23-26`.
- **Do not look for `reportCorrectedRollUps`.** Build 0 deleted it. Decision 5's warning is a **different** thing, and it is still owed.
- **Do not open `isDevMode()` looking for a gate to remove.** The gate is already gone. Raise the new report unconditionally, at `severity: 'warning'`.
- **Do not publish a calculated `kind` Field.** It restates `childrenOf`.
- **Do not claim I14.** Build 5 claims it.
- **Do not treat the `kind` grep as a zero gate.** `kind` is a common English word, and `Row.kind` survives this ADR. Read the grep by hand.

---

## Gate

```bash
pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log

# Read this by hand. Row.kind and RowKind survive. Returns 273 today.
grep -rn --include='*.ts' 'entry\.kind\|EntryKind\|rollUpKinds\|autoGroup\|isRollUpKind' src/ harness/
```

Each assertion below gets a named test:

- `entries.update()` on a rolling-up parent's rolling-up Field throws `DerivedFieldNotWritableError`.
- A **mixed** patch is refused whole, before any write.
- `add()` and `new Dataset({ entries })` **drop** a derived value, and raise **one** report per operation.
- Losing the last child leaves a normal Entry: the name is kept, there are no dates, and there is no bar.
- Gaining a child drops the parent's authored values in the **same** ChangeSet as the `parentId` write, and one undo reverses both.
- A parent bar drag writes every descendant and never the parent. One veto refuses the whole gesture.
- A plugin cascade's write to a derived cell is dropped, and raises one warning at `severity: 'warning'`.
- A parent whose dates come only from its children holds a Segment, and a click on its bar selects it. Then delete the `.fg-bar-summary` exclusion Build 1 added to `selectFirstBar` in `e2e/data.spec.ts` — it exists only to step around this gap, and the test must select a summary bar again. **Read `e2e/selection.spec.ts:17` and `:101` before you touch them.** Those two exclusions predate Build 1 (`19dcd8d`) and were written for a different reason. Decide each on what the code does, not by symmetry.

---

## Issues

| Issue | What this build does to it |
|---|---|
| [#270](https://github.com/Pawel-IT/FreeGantt/issues/270) | **Land its fix inside this build.** A declining Aggregator leaves a stale rolled-up value with no changeset row. That is the same class of staleness as this ADR's *"when every child is dateless, the parent's dates clear"*. Two half-fixes to one rule in two commits is worse than one. If the author prefers a separate PR, land it **first**. Never after. |
