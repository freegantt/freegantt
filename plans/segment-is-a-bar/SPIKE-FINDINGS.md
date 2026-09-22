# A Segment is a bar — spike findings (#421)

**This file holds spike S4, run 2026-09-17.** S1–S3 ran on 2026-09-16 and their findings were removed
on the author's word. Their rulings stand as J1, J2 and J3 in [ADR 0026's rulings appendix](../../docs/adr/0026-the-segment-retires.md#appendix--the-rulings-behind-the-retirement-q1q46), and the
README's spike table keeps their one-line answers.

**A spike reports. The author rules.** Nothing below closes a question.

---

## S4 — a bar is a child Entry

**What ran.** Branch `spike/421-s4-child-entry`, from `221770a`. Five commits: `7b0f138`, `d83d02c`,
`5020e05`, `544be0f`, and `ca4de5a` for the follow-up measurement. The probe is a real fold in
`src/layout/rows/entries-source.ts` and `src/layout/rows/row-source.ts`, the Rollup memo in
`src/data/` (`entry-store.ts`, `rollup.ts`, `transaction.ts`, `build-commit-change-set.ts`), and
three throwaway tests: `test/pure/spike-s4-bench.test.ts`, `spike-s4-q19.test.ts` and
`spike-s4-phases.test.ts`. The questions, the method and the pass rule are in
[`CHILD-ENTRY-DESIGN.md`](CHILD-ENTRY-DESIGN.md).

**Verdict: a partial pass. The author ruled on it the same day: Q17 passes, and the design ships.**
The cost objection falls. The `entryIds[0]` seam has a winner. Three questions were not reached, and
they become real tests in builds C1 and C3 rather than a second spike. **One claim in this file was
wrong and is struck through below** — the "tenth `entryIds[0]` site" under Q9.

| Question | Answer |
|---|---|
| Q1–Q3 cost | **Pass on the numbers.** A frame builds cheaper as child Entries than as Segments, and the two costs that grew halve once the Rollup stops re-deriving an index the store already holds |
| Q4/Q19 the subject seam | **Shape (a) wins.** Shape (b) breaks nine call sites in silence |
| Q7 two Gantts, one Dataset | **Pass**, in running code |
| Q5, Q6, Q9, Q12, Q13 | Answered by reading the code. Each has a written answer |
| Q8, Q10, Q11 | **Not reached.** A second pass of about 90 minutes closes them |

**Six questions wait on the author**, and none of them is the cost.

---

## The numbers

Fixture: 10,000 bars both ways — 200 rows of 50 Segments, against 200 parents of 50 children. One
machine, one run, three repeats, ±3 ms. Node microbenchmarks, because core is DOM-free.

| Measurement | Segments (today) | Child Entries, first fold | Child Entries, tuned | Delta now |
|---|---|---|---|---|
| Frame build (`computeFrame`, cold) | 142 ms | 111 ms | 113 ms | **−20%** |
| Rollup on one write | 1.9 ms | 8.6 ms | **4.9 ms** | +2.6× |
| `resolveRows` alone | 0.09 ms | 6.9 ms | **3.9 ms** | +43× |
| Hover-shaped rebuild (a proxy) | 121 ms | 109 ms | 104 ms | −14% |
| Items in the frame | 10,000 | 10,200 | 10,200 | +200 unsuppressed parent Items |

**The tuned column is the second measurement pass, 2026-09-17** (commit `ca4de5a`). The section
*The cost, and what cut it in half* below says what changed, and why the first numbers misled.

**The Q6 grill called 10,000 child Entries "the decisive objection".** The frame builds faster than
today at ten times the consumer brief's ceiling. The objection does not survive the measurement.

**`resolveRows` was never 69× slower — it walks 51× more Entries.** The baseline walks **200**
Entries; its 10,000 bars are `segments` array elements inside them, which `resolveRows` never
visits. The child fixture walks **10,200**. Per Entry the tuned fold costs 0.38 µs against the
baseline's 0.45 µs, so row resolution is now **cheaper per Entry** than today's path. The 51× is the
design's premise, and no cache removes it.

**Two honest limits on these numbers.**

1. The hover row is **not** the real `applyState` path. `applyState` is DOM-level, and a Node test
   cannot reach it. The proxy times a second full `computeFrame`. It bounds the cost of a forced
   rebuild; it says nothing about the shipped hot path. A browser measurement is still owed.
2. The +200 Items are open point 2, unbuilt: nothing suppresses a claimed parent's own Item yet.

**No numeric budget exists to hold either column against.** `plans/03-slices.md:265` — "All
§12-style budgets defined numerically from the spike and enforced in CI" — is still unchecked. I5's
shipped test (`render/dom/index.test.ts:1472`) is qualitative. Read against I5's words, the fold
touches nothing on the hot path: it changes which Items exist, not how a hover diffs them.

---

## The cost, and what cut it in half

**The first bench compared two different writes.** The baseline wrote `{ name }` against a Dataset
that declared no `fields` at all; the child fixture wrote `hours`, declared `rollUp: 'sum'`. Both
now declare and write `hours`. **The baseline stayed at ~2 ms, so the 4× was real** — the asymmetry
was not the cause, and only a fixed bench could show that.

**Where an 8.9 ms write goes**, measured in isolation at 10,200 entries:

| Piece | Cost | Share |
|---|---|---|
| `checkHierarchyAnswers` over the effective tree | 2.3 ms | 26% |
| `buildEffectiveEntries` — a full `Map` copy | 0.7 ms | 7% |
| `childIdsByParent`, twice | 0.6 ms | 7% |
| the diff, the apply, the signals, the live rows | ~5.3 ms | 60% |

**The store already holds the index the Rollup rebuilt.** `EntryStore.#byParent` is a `computed()`:
the committed children by parent, memoized per revision — the same `F6` guarantee
`committedParents()` gives. `rollUpFields` re-derived that answer on every commit, and re-checked
the effective tree on top of it. Three changes — publish it as `committedChildIds()`, carry it on
`RollUpTree`, and skip both the re-check and both index builds when a commit **moves no row** (no
adds, no removes, and no edit whose `proposedKeys` names `parentId`). **One write: 8.6 ms → 4.9 ms.**

**The fold also taxed the flat path for everyone.** With no rule configured at all, the first cut
still built the tree index, ran a claim pass and allocated a `Set` — today's shipped path went
0.09 ms → 0.24 ms. An early return gives it back. Two more constant-factor fixes: `claims()` ran
twice per Entry, and it ran on every Entry, including the 10,000 children that can never be claimed.
A parent must have children, so a `Map` lookup answers that before the Field read. **Row resolution:
6.9 ms → 3.9 ms**, and the field match's own share fell from 2.28 ms to 0.80 ms.

`pnpm typecheck`, `pnpm lint`, `pnpm test:node` (885) and `pnpm test:dom` (1239) stay green, and no
existing test changed behaviour. **This is still probe code on a spike branch.** It touches
`src/data/` and `src/layout/`, which a spike does not ship. It shows the cost is addressable. It is
not a pull request.

**A measurement trap worth keeping.** Five repeats of `update(id, { hours: 9 })` report ~4.9 ms
instead of ~8.9 ms, because runs 2–5 write the same value and the store exits early. The value must
change on every repeat.

**Still open:** about 60% of the write — the diff, the apply, the signal fan-out, the live-row cache
— is unprofiled. `buildEffectiveEntries` still copies the whole `Map` per commit, where
`effectiveEntriesFor` already sets a read-through precedent.

---

## Q4 / Q19 — where does a claimed row name its own Entry?

Both shapes were written, not argued.

**Shape (a) ships in the probe.** `entryIds[0]` stays the row's subject. The extra ids are the
claimed parent's children. All nine cited sites read the right answer with **no rewrite**.

**Shape (b) fails.** A `subjectEntryId` field names the subject, and `entryIds` becomes what the row
draws. The claimed parent is then absent from `entryIds`. Every one of the nine sites reads the
first child instead of the parent, **with no compile error**.

**The design doc's own claim about shape (b) is wrong.** `CHILD-ENTRY-DESIGN.md` says shape (b)
"looks like it dissolves the suppression, which makes the rail the question instead". The suppression
code does go away. The rail does not become the question — it becomes **unanswerable**.
`produceItemsForRow` resolves a variant only for ids in `entryIds`, and under (b) the parent is never
in that list. No rule a consumer writes can match it. A rail under (b) needs a second draw call keyed
off `subjectEntryId`, outside the producer loop. That is a new seam, not a variant claim. Shape (a)
keeps the parent reachable to a `when` rule.

**Shape (a) carries a cost the plan did not name.** The `childrenAsSegments` matcher cannot reuse
`layout/items/variants.ts`'s `compileRule`. That needs a `fieldFor` lookup for typed `equals`, and
the `reportUnknownFieldMatch` sink. `layout/rows/row-source.ts` states that the entries source is
Field-registry-free on purpose (D-S4-19, D-S4-21). The probe therefore matches with `Object.is` per
key: no typed `equals`, and no J59 unknown-key report. **Question 1 below.**

---

## The questions this spike answered by reading

**Q5 (Q20) — can a filter hide one bar on a shared row?** No, and this fold does not change it.
`applyFilter` (`layout/rows/filter.ts:57-78`) keeps or drops whole rows, and its read gate is
`entryIds[0]` (`:9`). A filter still tests the claimed parent, never a child. Refusing it costs
nothing new. An item-level knob costs a second predicate type, a second pass after
`produceItemsForRow`, and a ruling on whether a row with every bar filtered out still draws.

**Q6 — overlap.** Lane packing stays retired. `src/view/styles.ts:395` — "DOM order alone gives the
paint order". Two overlapping children draw at the shared band, and **the later id in `row.entryIds`
paints on top**. For a claimed row that is the children's order in the dataset, not date order. An
author who wants a later start on top sorts their own list. The hit test needs no new code:
`hitTest` (`render/dom/index.ts:1502`) uses `elementFromPoint`, which already answers the topmost
element.

**Q9 — what breaks when a row owns a parent and its children?** One finding, one gap.
- ~~**A tenth `entryIds[0]` site the design doc does not count.**~~ **Corrected 2026-09-17 against the
  code, when the ruling was written: this is a miscount.** `SegmentSelection.step()`
  (`view/segment-selection.ts:170`) is already in open point 13's list of nine. `grep -rn
  "entryIds\[0\]" src/` returns **nine reads in seven files**, and no tenth exists.
  **The finding under it stands, and it is sharper than the count was:** the nine are two different
  jobs. Seven read a **row's** list and mean "the row's subject" (`render/dom/index.ts:964,1039`,
  `roving-focus.ts:311`, `sort.ts:53-54`, `filter.ts:9`, `frame.ts:330`); two read the **Selection's**
  own list and mean "the first selected Entry" (`gantt-shell.ts:1480`, `segment-selection.ts:170`).
  With several child Entries selected on one claimed row, `Mod+ArrowRight` steps the first and
  ignores the rest.
- **Per-bar hit routing looks safe, unproven.** `produceItemsForRow`
  (`layout/items/produce-items.ts:36-45`) tags every Item with its own Entry from the loop. A click on
  one bar should resolve to that bar's Entry under either shape. That is a read, not a run.
- **Not audited:** the resize handle pair, keyboard order, `reveal`, and the a11y labels. Each is its
  own pass.
- **No fault needs a second type to fix.** Every problem found is a row or Selection rewrite, not
  evidence against the Entry as the unit.

**Q12 — an empty claimed parent.** A claimed parent with no children keeps its row, `expandable` is
false, and `entryIds` holds only its own id. It has no children, so it does not derive, so it falls
to `bar()`. A day-carrier row is authored with no `start`/`end`, so it draws **nothing**. A blank row
is today's answer, which matches the design doc's guess. Whether it is the right answer is the
author's call.

**Q13 — does a vertical drag reach `update('d1', { parentId: 'req-2' })` today?** No.
`src/interaction/entry-gestures.ts:300` has one row-aware call, `ctx.setHoveredRow(...)`, and it only
drives hover visuals. Nothing in `interaction/` reads the hovered row at commit time. The whole
gesture module moves a bar in time, never across rows. **What is missing:** a row-target resolution
step in the commit path, which folds the hovered row's subject into the proposed edit as `parentId`,
plus a ruling on whether that is default behaviour or a capability. Not built, by instruction.

---

## HEAD traps — where the plan's account of the code is wrong

1. **`render/dom/index.ts:963` is really `:964`.** Open point 13 cites 963 for
   `const subject = row.entryIds[0];`. Line 963 is the second line of the comment above it.
2. **The design doc's own worked example does not run.** `CHILD-ENTRY-DESIGN.md:20` and `:135`
   declare `{ key: 'showDaysOnRow', type: 'boolean' }`. No `boolean` Field type ships:
   `FieldTypeName` (`model/field.ts:14`) is `text`, `number`, `percent`, `date` and `duration`, and
   `(string & {})` lets any other string typecheck. An unregistered name then throws
   `UnknownFieldTypeError` at `data/fields/field-registry.ts:70`. A consumer who copies the example
   cannot build the Dataset. The probe substitutes `type: 'number'` with `1` for true.
3. **Every other cited line matched HEAD exactly**: `entries-source.ts:40,48-50`, `row-source.ts:107`,
   `filter.ts:9`, `sort.ts:53-54`, `frame.ts:330`, `render/dom/index.ts:1039`, `gantt-shell.ts:1480`,
   `segment-selection.ts:170`, `roving-focus.ts:311`.
4. **One citation undersells the code.** `entryTreeIndex` (`entries-source.ts:8`) needed no new tree
   walk. A filter over its output was the whole fold.

---

## Questions for the author

1. **The Field-registry gap.** Thread `fieldContext` into the entries-row-source pass, as `sort` and
   `filter` already do with `fieldCompares`? Or accept `Object.is` equality for
   `childrenAsSegments`, with no typed `equals` and no unknown-key report? Threading it changes
   `row-source.ts`'s stated architecture (D-S4-19, D-S4-21).
2. **The `boolean` Field type.** Does core ship one, or do the design's examples change to a type
   that exists?
3. **Shape (a) or shape (b)?** Shape (b) does not dissolve the rail question. The evidence favours
   shape (a), which the probe implements. Does (a) read as the shipped shape?
4. ~~**The tenth site.**~~ **Withdrawn 2026-09-17 — there is no tenth site** (see the correction
   under Q9). `SegmentSelection.step()` is one of the two Selection-side reads, and the Selection-unit
   ADR names both. Build C3 fixes all nine.
5. **The blank row.** Is a blank row right for an empty claimed parent, and for a row whose bars a
   filter all removed? Or does the rule stop applying when it would draw one?
6. **Does a hierarchy source declare the keys it reads?** The Rollup's new fast path applies only to
   core's own `storedParentSource`, because a plugin source is a function that may read any field,
   and nothing on the seam says which. A source that named its keys would let every source skip the
   re-check. That is a seam question, wider than #421.

---

## Not reached

- **Q8 — the README's user stories 1–5 and 10–12 in the harness.** This needs real `harness/main.ts`
  wiring: grid columns, `barLabels`, capabilities and drag. That is a build, not a probe. What the
  probe does prove: the row production and the Rollup both work over a plain child Entry with no
  Segment code path. The child fixture declares `hours` as an ordinary `rollUp: 'sum'` Field, and the
  unmodified Rollup totals it.
- **Q10 — the live per-Entry switch, one undo step, Selection intact.** The write itself is an
  ordinary field write. The re-fold and the undo round trip were not run. This needs a `dom` or `api`
  integration test, because Selection is a `view/` concern.
- **Q11 — a summary row above a claimed row, three levels.** The tree branch of the fold is written to
  compose this way, and the pure suites stay green. No three-level fixture asserts it.

**Do Q10 and Q11 first.** They are mechanical. Q8 is the largest.

---

## What a build takes from S4, and where the spike is wrong for its callers

**Added 2026-09-18, when the coordinator read this spike back against the
[`codebase-design`](../../.claude/skills/codebase-design/SKILL.md) skill before C1 was dispatched.**
The probe is reference material. It is not a patch to apply.

**The placement is right, and this is the reason.** The claim reads an **Entry**, not a row:
`childrenAsSegments` takes an `EntryRule`. A post-pass beside `applyCollapse` is tempting, because a
claim really is a collapse one level deeper (`J-plan-I`). It fails twice. Such a pass holds ids
alone, so it must look every Entry back up. And the flat branch has no `parentRowId` to walk. Put a
pass where its inputs live. The fold stays inside `resolveEntriesSource`.

**Take these three, which the spike measured.** A build that ignores them costs 2.7× on row
resolution:

1. Early-return before the tree index, when the rule is unset **and** `tree !== true`.
2. `childRowsOf.get(entry.id)` **before** the rule read. Only a parent can be claimed, and the rule
   reads a Field.
3. Ask the claim question once per Entry, not twice.

**Leave these three, which are wrong for the callers:**

| The spike does | A build does instead | Why |
|---|---|---|
| Restates the rule type as `ChildrenOnParentRowRule`, because `FieldMatch` looked too generic to import | Imports the real `EntryRule` | `EntryRule` carries a default type parameter, `FieldMatch` ends in `& { [key: string]: unknown }`, and `compileRule` is already non-generic. The spike's own comment names a blocker that does not exist |
| Matches with `Object.is` per key, with no typed `equals` and no unknown-key report | Uses the one shared compiler, through a `fieldFor` port | Q21 and Q29 rule this. The spike had no port, which is the only reason it matched narrowly |
| Would need a `fieldFor` **and** an unknown-key sink | **One** ports object, **one** new key on `RowPassInput`, **one** new optional parameter | Two flat keys put four field-ish keys on `RowPassInput` beside `fieldCompares` and `fieldContext`, and C2 and C6 would add more |
| Builds two Sets — claimed parents, and claimed children | **One** `Map<EntryId, readonly Entry[]>` of claimed parent to its children | It answers "claimed?" with `.has`, hands the row its children from the same read, and the flat skip becomes "is *my* parent claimed?" |
| Widens `entryIds` alone | Adds a real `claimed` field to the row | An **empty** claimed parent has one `entryId` and is still claimed. The marker cannot be derived |

**Also rejected: `resolveEntriesSource(input: RowPassInput)`**, which the `RowProducer` type already
declares. It is the smaller interface on paper. It loses twice: the producer must then narrow
`RowSource` internally, instead of at the one call site that knows it
(`resolve-rows.ts:29`); and it churns 20 positional test call sites in `entries-source.test.ts`,
`filter.test.ts` and `sort.test.ts`. One optional ports parameter costs those tests nothing.

**The spike's `src/data/` half shipped as C4** (`393d1bf`). Do not take it a second time.

**The spike's key name is the old one.** It says `childrenOnParentRow`, which was this plan's
placeholder. Q24 rules the key `childrenAsSegments` and rejects the placeholder by name: it says
*where*, not *what*.

---

## Carried forward, for C6 and C7

These left the coordinator's handoff when that file was deleted on 2026-09-18. Each one is owed.

- **`measureEntryDuration` sums `entry.segments`** (`data/fields/field-access.ts:211-222`), and ingest
  mints one Segment over every spanning Entry. So `'segments'` measures a childless leaf's **own**
  span today. A plain rename to `'children'` makes every childless leaf measure `0`. This is why C6
  ships a stopgap, and why **#428** exists.
- **`FieldType.inputType` is spelled twice** — `model/field.ts:232` and again at `:177`. A build that
  adds a value to one spelling and not the other typechecks and then fails at run time.
- **C6 renames `ignoreSegments` → `wholeSpan` (Q26).** After C2 that producer returns `[]` for a
  claimed subject, so a name promising "the whole span" fails the naming test. **Pick the name
  against the behaviour it has after C2, not today's.** Use the naming skill.
- **`CHILD-ENTRY-DESIGN.md` line ~69 carries a vendor survey with the names stripped out.** CLAUDE.md
  allows such a survey in an **ADR**, with names and links, and not in a plan. Move it into C6's ADR
  and delete the paragraph. Low priority.
- **A browser measurement of the hot path is still owed.** This spike's hover number is a Node proxy.
  No numeric I5 budget exists to hold it against — `plans/03-slices.md:265` is still unchecked.

---

## The acceptance boxes no build has covered yet — read this before C7

**Checked 2026-09-18 against #421's own Acceptance list, box by box.** C1–C6 cover most of the 30.
These five are **not** covered by any test that exists, and C7's gate is "every acceptance box in
#421 ticked". C7 must build them or say plainly why not.

1. **`dataset.entries.update('req-1', { showDaysOnRow: false })` opens one row into sub-rows, in one
   undo step, and undoes back.** This is the **live per-Entry switch through a data write**, and it is
   the spike's **Q10, which S4 never reached**. C1 pinned the live switch through `gantt.rowSource`,
   which is a different door: this one writes the Field the rule matches on. It needs the re-fold and
   the undo round trip, and Selection must survive both.
2. **`rollUp: 'sum'` on `hours` totals the day bars onto the claimed row.** The spike declared the
   unmodified Rollup does this, and C4 made it cheaper, but no test asserts the total on a *claimed*
   row.
3. **A write to a claimed row's `start`/`end` throws `DerivedFieldNotWritableError`, and a row drag
   moves every bar.** The throw is ADR 0013's existing behaviour; what is unproven is that a claimed
   row is an ordinary rolling-up parent to the write door. The row drag is the second half and is the
   riskier one.
4. **`dataset.entries.update('d1', { parentId: 'req-2' })` moves a bar to another row, keeping its id,
   its data and its place in the Selection, in one undo step.** Spike **Q13** found that no *gesture*
   reaches this — `interaction/` has no row-target resolution at commit — but the box asks only for
   the **data** door, which is an ordinary field write. Prove the data door; do not build the gesture,
   which #421 does not ask for.
5. **A test pins that a bar's printed value and its row total read the same at day, week and year
   zoom.** C5 pinned labels across zoom; the **row total** across zoom is not pinned.

Box 17 is already satisfied and recorded: C3 read all nine `entryIds[0]` sites once each and wrote a
verdict per site into `999f599`'s commit message. Note the box's own line numbers are stale — C3
re-derived them, which is the right move.

---

## How to re-run

```
git checkout spike/421-s4-child-entry
pnpm install
pnpm exec vitest run --project pure test/pure/spike-s4-bench.test.ts   # Q1-Q3, prints both fixtures
pnpm exec vitest run --project pure test/pure/spike-s4-q19.test.ts     # Q4/Q19 shapes, and Q7
pnpm exec vitest run --project pure test/pure/spike-s4-phases.test.ts  # where a write's cost goes
```

**Regression signal on the branch:** `pnpm typecheck`, `pnpm lint`, `pnpm test:node` (885 passed)
and `pnpm test:dom` (1239 passed). **No pre-existing test broke, before or after the tuning.**
`pnpm verify:full` did not run on the spike branch, by the coordinator's call: probe code trips the
format, lint and api-report gates, and that verdict answers nothing about this spike.
