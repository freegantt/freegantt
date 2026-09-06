# Fix plan — the Selection holds Segments (#212) branch review

**Source review:** [`2026-09-05-selection-holds-segments.html`](./2026-09-05-selection-holds-segments.html) — FreeGantt, 2026-09-05, branch `s5-212` against `s5-start`, commits `830800d..c305e3a`.
**Slice:** S5 ([`plans/s5-extensibility-and-editing/README.md`](../s5-extensibility-and-editing/README.md)) · **Status:** open — R1–R7 outstanding. **This plan blocks S5.11.**
**Gate state at review time:** every gate passed. `typecheck`, `lint`, `boundaries`, `guards`, `test:node` (621), `test:dom` (901), `sentence-length`, `vendor-names`, `api-report`, and the pre-push e2e run (76) are all green at `c305e3a`. Every finding below is invisible to CI.

> ## Delete the review when this plan closes
>
> The review HTML is a work item, not a record. Tick every box in this file first.
> Then delete `plans/reviews/2026-09-05-selection-holds-segments.html` in the same commit as the last fix.
> This plan file stays. It is the record of what the review asked and what landed.
> A finding you decide **not** to fix does not block the delete. Move it to §6 with the reason.

---

## 0. How to use this file

- Work one slice per session. The slices are ordered. Do not start R4 before R1 lands.
- Tick a box in the same change as the code, the way the S5 README requires.
- Run `pnpm gate` at the end of every slice. Run `pnpm api-report` after any public-surface change.
- Each slice ends with something you can see or run. That is the same vertical-slice rule S5 itself follows.

**Verification note.** Findings 1–5 are correctness defects, not opinions. Each one was re-run against
`c305e3a` before this plan was written, by driving `DatasetState` directly under Vitest. The observed
output is quoted in each slice below. Finding 2's original one-line summary was too strong and is
corrected here: a **supplied** Segment id survives an update. The defect is that the *documented*
move mints a new one.

---

## 1. Order, and why

R1 comes first because Segment identity is what ADR 0010 rests on. The Selection holds a `SegmentId`.
If that id is not stable and not unique, every later slice reasons about a thing that can change under
it. R2 and R3 are the other two `data/` correctness defects and stand on their own.

R4 publishes the Segment→Entry index. R5 and R6's finding 18 both need it, so it comes before them.

R5 is performance on the hover and drag path. It is behind R4 because the cheap fix uses the index.

R6 is the public surface. It is last of the blocking slices because R1–R5 change what the surface
should say.

R7 is the nits and the close-out.

---

## 2. Findings index

| # | Finding | Slice | Strength |
|---|---|---|---|
| 1 | A duplicate `SegmentId` is representable, and `removeSegments` then deletes the wrong Entry | R1 | Strong |
| 2 | The documented way to move a Segment mints a new id, so the bar leaves the Selection | R1 | Strong |
| 3 | `segmentsEqual` ignores `id`, so an id-only write is silently dropped | R1 | Strong |
| 4 | The envelope invariant has no owner, and `toJSON` writes the inconsistency out | R2 | Strong |
| 5 | `removeSegments` on a parent's last Segment deletes the whole subtree | R3 | Strong |
| 6 | No module owns Segment→Entry; nine bodies across four layers ask it | R4 | Strong |
| 7 | `selectedEntryIds` is O(dataset) on the hover path | R5 | Strong |
| 8 | The Selection prune ignores the `ChangeSet` it is handed | R5 | Strong |
| 9 | `#draftFor` rebuilds a Selection `Set` on every `pointermove` | R5 | Strong |
| 10 | No public way to select an Entry | R6 | Strong |
| 11 | `SegmentNotFoundError` is thrown publicly but not exported | R6 | Strong |
| 12 | `plans/02` has no `removeSegments` entry, no new bindings, and still says `schema: 2` | R6 | Strong |
| 13 | The row-order comparator returns `NaN` for two unplanned Entries | R6 | Strong |
| 19 | `selectionChange` fires with no `before*`, and `plans/02` states that rule with no exception | R6 | Waivable |
| 20 | Dead eslint allowlist entry `segmentIdFromDataset` | R7 | Nit |
| 21 | Dead `segments !== undefined` checks | R7 | Nit |
| 22 | Harness `window.__dataset` double cast; `attemptMutation` wraps a command that already swallows | R7 | Nit |
| 23 | The e2e suite works around the `Popup` focus/scroll defect | R7 | Nit |
| 14–18 | See §6 — recorded, not fixed | — | Worth exploring |

---

## 3. The slices

### R1 — a Segment id means one Segment, and keeps meaning it

Findings 1, 2, 3. All three are one story: the id is not yet an identity.

Observed at `c305e3a`:

```
F1  two Entries both authored 'sg1' — both accepted
    removeSegments(['sg1']) -> entry 'a' survives, entry 'b' is deleted
F2  update('a', { segments: [{ start, end }] })   (no id — the documented move)
    before= sg1   after= sg2
F3  update('a', { segments: [{ id: 'renamed', start, end }] })
    changeset rows= 0   segments now= ['sg1']      (the write vanished)
```

- [x] A duplicate `SegmentId` is rejected. Decide where: at ingest, at mint, or both. `DuplicateEntryIdError` is the precedent for the error name and the posture.
- [x] An `update` that supplies no `id` for a Segment no longer mints a new one. Decide the rule and write it down: positional match, or required id. `CONTEXT.md` names this call as how a consumer moves a Segment, so whatever the rule is, that entry must state it.
- [x] `segmentsEqual` compares `id`. An id-only write reaches the changeset and is undoable.
- [x] Tests at the `data/` layer for all three. Each test must fail on `c305e3a`.

**Visible at the end:** a consumer moves a Segment, and it stays selected.

**Caveat, recorded 2026-09-06.** "Rejected" above means every mutating call a consumer writes:
`entries.add`, `entries.update`, construction. `dataset.replay(changeSet)` is the one door this
plan never gated, and D-S2-14 says it stays that way on purpose — `replay` applies undo/redo rows
with no validation. `CONTEXT.md` and `plans/02` now say so where they state the rejection, so a
reader does not take "unrepresentable" as "unrepresentable on every path in".

### R2 — one owner computes the envelope

Finding 4. Three bodies compute the envelope. Neither ingest nor a plain `update({ segments })` is one
of them.

Observed at `c305e3a`:

```
update('a', { segments: [{ id: 'sgX', start: 2026-03-01, end: 2026-03-09 }] })
envelope start= 2026-01-01  end= 2026-01-05
segment  start= 2026-03-01  end= 2026-03-09      CONSISTENT? false
```

- [x] One function owns "the envelope of these Segments". Every write path calls it, ingest included.
- [x] `toJSON` can no longer write an Entry whose envelope disagrees with its Segments. Closed
  2026-09-06: the two write paths finding B1 left open now both hold the invariant. The Rollup
  (`data/rollup.ts`'s `widenSegmentsToEnvelope`) restores it on a roll-up-kind parent drawing several
  Segments by clamping every Segment into the newly rolled-up span and then widening whichever one
  still misses an edge — the earliest-starting Segment to the new `start`, the latest-ending one to
  the new `end` — rather than pairing onto a single Segment the way the one-Segment case does. The
  `EditExtender` seam gets the same proof a consumer's `entries.update()` already had:
  `data/entry-reader.ts`'s `reconcileEnvelope` is now the one function both call, so a plugin's
  `StoredEdit` is paired or read back off Segments before it reaches `diffEdit`, and a direct
  `start`/`end` write against a several-Segment Entry with none of its own Segments named is refused
  (`SegmentsOutOfSyncError`) exactly as it is from `entries.update()`. `plans/01` §6 states both rules.
- [x] A property test over arbitrary Segment sets, in the style `plans/01` §11 expects.

**Visible at the end:** a round trip through `toJSON`/`fromJSON` cannot produce a stale envelope.

### R3 — deleting a Segment never silently deletes a subtree

Finding 5.

Observed at `c305e3a`: `removeSegments(['ps'])` on a parent with one child left the dataset **empty**.

Removing an Entry's last Segment removes the Entry. That is intended and documented. Removing that
Entry's descendants is neither documented nor tested, and `Delete` is now a default key binding.

- [x] Decide the rule. Either the descendants survive and reparent, or the cascade is intended and gets documented in ADR 0010 and `CONTEXT.md`.
- [x] Whichever way it settles, a test pins it, and `plans/02` states it under `removeSegments`.

**Visible at the end:** pressing `Delete` on a parent bar in the harness does what the docs say.

### R4 — `data/` publishes Segment→Entry

Finding 6. Nine bodies across four layers ask this question. Six of them scan the whole dataset.

- [x] `data/` owns and publishes the index. It is maintained on write, not rebuilt per read.
- [x] `#groupSegmentsByOwner` uses it. So does `reveal` (finding 18). The R5 work has not started; it is not yet a consumer.
- [x] Delete the re-derivations the index replaces. Count them in the commit message.

**Visible at the end:** `git grep` for a full-dataset Segment scan returns the index and nothing else.

### R5 — the hot path pays only for what changed

Findings 7, 8, 9. Invariant I5 is the standard: class toggles and transforms only, O(what changed),
zero allocation.

- [ ] `#refreshAffordances` stops building a rank map over every row and sorting `entries.all` on every hover change. `projectAffordances` reads only `.length` and `[0]`.
- [ ] `#forgetSegmentsTheDatasetDropped` reads its `ChangeSet` instead of walking every Entry and Segment. It sits one line below `invalidateForChange(changeSet)`, which already uses it.
- [ ] `#draftFor` stops rebuilding a Selection `Set` on every `pointermove`. The Selection cannot change mid-drag.
- [ ] An allocation test guards each one, in the style of the existing "allocates nothing while it rests" test.

**Visible at the end:** the I5 perf job stops being `FUTURE_PLANNED` for these three paths.

### R6 — the public surface keeps its promises

Findings 10, 11, 12, 13, and the spec sentence for 19.

**Note, recorded 2026-09-06 (landed since this table's boxes were unticked, see R1's `d142557`).**
A shift-range now steps over **Segments** in draw order, not over rows. The anchor is a
`SegmentId`. `EntryGestureContext` gained `selectableSegmentsInRowOrder()`. `selectableEntriesOf`
is **deleted**. `selectableEntriesInRowOrder()` survives, for the keyboard row step only.
Re-read the "publish a way to select an Entry" box below against this before writing it: an
Entry-level select is now the odd one out next to a Segment-ranging shift-click, not the norm the
box's own wording assumes.

- [ ] Publish a way to select an Entry. `GanttShell.#segmentIdsOfEntries` is already that function. Three test files hand-roll it today. Run the `naming` skill on the call site before choosing the name.
- [ ] Export `SegmentNotFoundError`. A consumer cannot `instanceof` an error a public method throws, and every other error is exported.
- [ ] `plans/02`: add `removeSegments`, add the `Delete` and `Mod+Arrow` bindings, and correct §6 from `schema: 2` to `schema: 4`.
- [ ] Fix the row-order comparator. Two unplanned Entries give `Infinity - Infinity`, and the doc comment's ordering claim rests on V8 treating `NaN` as 0.
- [ ] **Finding 19.** The code comment argues the exception correctly and the code does not change. `plans/02` states "every mutating interaction gets a cancelable `before*`" with no exception. Add the sentence that carves out a change the Dataset already made. One sentence, not an ADR.

**Visible at the end:** `pnpm api-report` shows the new surface, and `plans/02` describes it.

### R7 — close out

- [ ] Finding 20: delete the eslint allowlist entry `segmentIdFromDataset`. No such function exists in `src/`.
- [ ] Finding 21: delete the dead `segments !== undefined` checks in `gesture-draft.ts:264` and `e2e/selection.spec.ts`. Making the field required was supposed to remove these.
- [ ] Finding 22: record the `window.__dataset` double cast as the `Dataset<TFields>` variance question it is. Do not tidy it — the cast is evidence. Remove the `attemptMutation` wrapper around a command that already swallows the veto.
- [ ] Finding 23: file the `Popup` defect as its own issue. `Popup.open()` must place focus before it arms `dismissOn: 'scroll'`, and `focusFirst()` needs `preventScroll`. The e2e helper's workaround comment stays until that issue closes, because it is honest about what it is.
- [ ] File the §6 findings as issues.
- [ ] Delete `plans/reviews/2026-09-05-selection-holds-segments.html` in this commit.
- [ ] Update this file's Status line to closed, and clear the blocking line in the S5 README.

---

## 4. Spec and doc edits this plan carries

| Edit | Slice | Where |
|---|---|---|
| How a consumer moves a Segment, and what happens to its id | R1 | `CONTEXT.md`, `plans/02` |
| The envelope has one owner | R2 | `plans/01` §6 |
| What removing a parent's last Segment does to its descendants | R3 | ADR 0010, `CONTEXT.md`, `plans/02` |
| `removeSegments`, the `Delete` binding, the `Mod+Arrow` binding, `schema: 4` | R6 | `plans/02` §6 and the bindings table |
| A change the Dataset already made fires the past-tense event alone | R6 | `plans/02` |

---

## 5. What each slice must not do

- Do not re-litigate the settled decisions. `CommandTarget` carries both id sets, `ActedOn` is approved, `Item.id` keeps its convention, `selectedIds` retires with no shim.
- ~~The demo fixture stays overlapping.~~ **Reversed by the user, 2026-09-05.** `fixtures/demo-dataset.ts` drew entry-16's three Segments over each other, covering 75% of the first with the second. Both clicks of a ctrl-click then reached the same top Segment, and the second toggled the first back off, so multi-select looked broken to anyone driving the demo. The Segments are separated now.
  This costs the generic demo its #215/#217 repro, because an overlap is what makes a covered Segment unreachable in the first place. The repro is not lost: `fixtures/hierarchy-dataset.ts` still authors three deliberately overlapping Segments, `harness/hierarchy.html` draws them, and `e2e/hierarchy.spec.ts` exercises them. Keep that fixture overlapping — it is now the only place either issue can be seen.
- Do not tidy `harness/` to hide an API gap. Close the gap in `src/`, then the harness follows.
- Do not grow `view/gantt-shell.ts`. It is 1,882 lines and 116 members. Every slice here shrinks it or leaves it alone.
- Do not add a runtime dependency. `plans/04` §1 budgets two, both confined.
- Do not fold #215, #216, #217 or #219 into this plan. They are filed and deferred on purpose.

---

## 6. Recorded, not fixed

| Finding | Why it stays |
|---|---|
| **14** — one rule, two Entry sources, three times. `render/dom` reads the live Dataset to paint, `FrameLayout` reads the frame, and `interaction/` re-implements the pane rule ADR 0010 gives to `targetUnder`. | Real, and the largest structural finding in the review. It is not blocking because the three readings agree today; R4's index removes one of them. File it, and take it as one refactor with 15 and 16. |
| **15** — `GanttShell` changes for selection reasons too. Six of eight new members are the Segment↔Entry projection. | The review is honest that extracting them is a divergent-change cut, not a depth win. That is a real reason to think before cutting. File it with 14. |
| **16** — `ContainerDomPorts` is flat; six of eight members are one collaborator's questions. | Same refactor as 14 and 15. Splitting the port bag before that refactor settles would be churn. |
| **17** — two names for one concept: `segmentIdsAnItemStandsFor` against `FrameLayout.segmentIdsForItem`. The call site passes a `FrameBar`, not an `Item`. | A genuine naming finding. It is a rename, and it should ride with the 14/15/16 refactor that decides where the function lives. Run the `naming` skill then, not twice. |
| **18** — `reveal()` scans every Segment and reports `EntryNotFoundError`. | The scan is fixed: R4's index removed it. The error type is not. R4 declined the error-type fix, reasoning that `reveal`'s id is untyped at runtime (branding is erased), so the intended type cannot be known and `EntryNotFoundError` is as good a guess as any. That reasoning is unsound: `reveal` itself calls `entryId(id)` on the very same id — forging an `EntryId` brand onto a value that, by its own argument, may be a `SegmentId` — and then reports `code: 'entry-not-found'`. `plans/02` already promises a consumer "`reveal(segmentId)` … does not throw this". `reveal`'s parameter type is `EntryId \| SegmentId`, so the honest error names the union, not one half of it. Declined for R4; the fix belongs with R6's already-planned "export `SegmentNotFoundError`" item — a `SegmentNotFoundError` export gives `reveal` a union-honest error to throw. Filed as a follow-up, not implemented here. |

Move any finding you decide not to fix into this table. Give the reason. Then §R7's delete is honest.
