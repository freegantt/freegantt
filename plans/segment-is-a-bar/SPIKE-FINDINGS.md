# A Segment is a bar — spike findings (#421)

**This file holds spike S4, run 2026-09-17.** S1–S3 ran on 2026-09-16 and their findings were removed
on the author's word. Their rulings stand as J1, J2 and J3 in [`BUILD-LOG.md`](BUILD-LOG.md), and the
README's spike table keeps their one-line answers.

**A spike reports. The author rules.** Nothing below closes a question.

---

## S4 — a bar is a child Entry

**What ran.** Branch `spike/421-s4-child-entry`, from `221770a`. Four commits: `7b0f138`, `d83d02c`,
`5020e05`, `544be0f`. The probe is a real fold in `src/layout/rows/entries-source.ts` and
`src/layout/rows/row-source.ts`, plus two throwaway tests, `test/pure/spike-s4-bench.test.ts` and
`test/pure/spike-s4-q19.test.ts`. The questions, the method and the pass rule are in
[`CHILD-ENTRY-DESIGN.md`](CHILD-ENTRY-DESIGN.md).

**Verdict: a partial pass.** The cost objection falls. The `entryIds[0]` seam has a winner. Three
questions were not reached, so the pass rule is not met in full.

| Question | Answer |
|---|---|
| Q1–Q3 cost | **Pass on the numbers.** A frame builds cheaper as child Entries than as Segments |
| Q4/Q19 the subject seam | **Shape (a) wins.** Shape (b) breaks nine call sites in silence |
| Q7 two Gantts, one Dataset | **Pass**, in running code |
| Q5, Q6, Q9, Q12, Q13 | Answered by reading the code. Each has a written answer |
| Q8, Q10, Q11 | **Not reached.** A second pass of about 90 minutes closes them |

---

## The numbers

Fixture: 10,000 bars both ways — 200 rows of 50 Segments, against 200 parents of 50 children. One
machine, one run, three repeats, ±3 ms. Node microbenchmarks, because core is DOM-free.

| Measurement | Segments (today) | Child Entries | Delta |
|---|---|---|---|
| Frame build (`computeFrame`, cold) | 137 ms | 111 ms | **−19%** |
| Rollup on one write | 2.1 ms | 8.6 ms | +4.1×, still under 10 ms |
| `resolveRows` alone | 0.10 ms | 6.9 ms | +69×, still under 10 ms |
| Hover-shaped rebuild (a proxy) | 121 ms | 109 ms | −10% |
| Items in the frame | 10,000 | **10,200** | +200 unsuppressed parent Items |

**The Q6 grill called 10,000 child Entries "the decisive objection".** The frame builds faster than
today at ten times the consumer brief's ceiling. The objection does not survive the measurement.

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

**Shape (a) carries a cost the plan did not name.** The `childrenOnParentRow` matcher cannot reuse
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
- **A tenth `entryIds[0]` site the design doc does not count.** `SegmentSelection.step()`
  (`view/segment-selection.ts:170`) reads `this.entryIds[0]` to mean the one selected Entry. That is
  Selection's own projection, not `PlannedRow.entryIds`, so open point 13's list of nine misses it.
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
   `childrenOnParentRow`, with no typed `equals` and no unknown-key report? Threading it changes
   `row-source.ts`'s stated architecture (D-S4-19, D-S4-21).
2. **The `boolean` Field type.** Does core ship one, or do the design's examples change to a type
   that exists?
3. **Shape (a) or shape (b)?** Shape (b) does not dissolve the rail question. The evidence favours
   shape (a), which the probe implements. Does (a) read as the shipped shape?
4. **The tenth site.** Does the Selection-unit ADR (open point 15) also name
   `SegmentSelection.step()`, or is that a smaller fix under either design?
5. **The blank row.** Is a blank row right for an empty claimed parent, and for a row whose bars a
   filter all removed? Or does the rule stop applying when it would draw one?

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

## How to re-run

```
git checkout spike/421-s4-child-entry
pnpm install
pnpm exec vitest run --project pure test/pure/spike-s4-bench.test.ts   # Q1-Q3, prints both fixtures
pnpm exec vitest run --project pure test/pure/spike-s4-q19.test.ts     # Q4/Q19 shapes, and Q7
```

**Regression signal on the branch:** `pnpm typecheck`, `pnpm lint`, `pnpm test:node` (884 passed, 878
before the probe's own 6) and `pnpm test:dom` (1239 passed). **No pre-existing test broke.**
`pnpm verify:full` did not run on the spike branch, by the coordinator's call: probe code trips the
format, lint and api-report gates, and that verdict answers nothing about this spike.
