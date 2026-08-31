# S4 — Hierarchy, grouping, multi-item rows

**Slice:** S4 (`plans/03` §S4) · **Position:** after S3, before S5 · **Status:** specified, not started
**Form:** the same settled-spec form as [`plans/s3-direct-manipulation/README.md`](../s3-direct-manipulation/README.md) — this file is the tracker and the shared context; each step file holds the decisions it implements and its TODO boxes.
**Governed by:** `plans/00` D2/D7/D8, `plans/01` §2.3/§2.5/§2.6/§4/§6, `plans/02` §2/§4.1/§4.2/§6, ADR [0005](../../docs/adr/0005-fields-are-declared-and-grid-columns-reference-them.md).
**Builds on:** S2 data core (transactions, changesets, undo, JSON), S3 gestures, S1's height index and `FrameLayout`.
**Closes:** issue #80 (per-field rollup), #81 (row cells), ADR 0005's two open questions, `plans/03` §S4's three known gaps (#91 §9-B, §9-E, §9-G).

> **What this slice is not.** No plugin runtime and no public registration API — a consumer cannot register a field, a column, an item emitter or a renderer from outside yet. That is S5. No `cellRenderer`, no inline editing, no column resize or reorder — also S5. No `Dependency`, no `schedule()`, no link geometry — S7. `layout/` never imports `data/`; `data/` never imports `view/`.

---

## 0. Scope calls — confirmed

| # | Question | Answer |
|---|---|---|
| **Q1** | Does S4 ship the **public** way to register a Field, a Grid column or an Item emitter? | **No — only the registries and the shipped occupants.** A consumer declares Fields through `DatasetOptions.fields` (data, not code registration) and orders columns through `Gantt.gridColumns`. Registering an *emitter* or a *renderer* needs `PluginContext`, which is S5's. S4 ships `ItemEmitter` with three occupants and no way in from outside; tests inject through an internal option. Same posture S2 took for the extender slot (D-S2-6). §S4.7, D-S4-24. |
| **Q2** | Does the Rollup gate stay `derivedSpanKinds`? | **No — it widens and it is renamed `rollUpKinds`.** Once `cost` rolls up, a gate whose name says "span" governs values that are not spans. Widening the meaning under the old name is the drift CLAUDE.md's naming rule forbids (#7). The rule itself is the one that reads correctly: a parent of a rolling-up Kind derives **every** rolling-up Field; a parent of any other Kind keeps its authored values. §S4.2, D-S4-6. |
| **Q3** | Does the Document carry Field declarations? | **The data half, yes; the code half, no.** Without them, `fromJSON(toJSON(d))` returns a Dataset that still holds rolled-up values but no longer maintains them — a silent corruption on the next edit. `fields` joins the Document; `equals`, `formatValue`, `fieldTypes`, `aggregators` and `rollUp` are code the reading application supplies, through a second `fromJSON` parameter. `schema` goes to 2. §S4.4, D-S4-15, D-S4-16, D-S4-7. |
| **Q4** | Where do sort and filter live? `plans/03` §S4 says "store-level view specs". | **On the row source, not on the Store.** Sorting the Store would reorder `entries.all`, and that order is what makes `toJSON` byte-stable (D-S2-12). A view knob must not rewrite the Document. `rows: { source: 'entries', tree: true, sort, filter }` is one config tree for one job (`plans/02` §1). `plans/03` §S4 is edited to match. §S4.9, D-S4-28. |
| **Q5** | Does an Aggregator that throws roll the transaction back, or keep the stored value? (ADR 0005's open question) | **It rolls the transaction back**, with a named `AggregatorFailedError`. Keeping the stored value leaves a parent whose value no longer follows its children, with nothing said — principle 6 ("diagnostics over silent fixes") forbids exactly that, and a diagnostics channel does not exist before S7. §S4.2, D-S4-9. |
| **Q6** | Are shipped Aggregators maintained incrementally while consumer ones force a full walk? (ADR 0005's other open question) | **No — one path for both.** Every Aggregator recomputes the ancestor chains of the touched entries. A two-speed design would give a consumer field different commit semantics from `start`, which is the second code path ADR 0005 exists to remove. §S4.2, D-S4-8. |
| **Q7** | Does `computeFrame` grow row sources, trees, emitters and packing inside its current loop? | **No.** It becomes composition over four named stages, each its own module with one reason to change. The function is 293 lines and already carries culling, header bands and decorations; four more concerns inside it is the ball of mud this slice is most likely to produce. §S4.6, D-S4-19. |
| **Q8** | Is `hierarchy: { autoGroup: true }` the default? | **No — the default is `false`.** Promotion writes `kind` into the Document, and `kind` is authored (`01` §2.5). A library that rewrites an authored field nobody asked it to touch is not honest. The harness turns it on; the demo is the argument for it. §S4.5, D-S4-17. |
| **Q9** | Is `progress` a core Field? | **No — it is scheduling-plugin data (ADR 0008).** It is not on `Entry`. `weightedMeanByDuration` still ships as an Aggregator. |
| **Q10** | How does a Field become a Grid column? | **It declares `column`.** Same split AG Grid uses (row data vs `columnDefs`), except aggregation stays on the Field, not on the column. `gridColumns` lists which columnable Fields this Gantt shows. Default is still `['name']`. `parentId` / `segments` / `meta` have no `column`. Naming them throws `FieldNotColumnableError`. §S4.3, D-S4-12. |
| **Q11** | What does a shipped Aggregator do with holes? | **It skips them** and never throws. All skipped → `undefined` (keep stored). §S4.1, D-S4-3. |
| **Q12** | After a Segment write, who owns `start`/`end`? | **The envelope, in the same transaction.** A `start`/`end` write on a segmented entry throws `SegmentsOutOfSyncError`. §S4.10, D-S4-30. |
| **Q13** | Does `autoGroup` promote a `'milestone'`? | **No.** `'span'` only. Already-`'group'` is a no-op. No throw. §S4.5, D-S4-17. |
| **Q14** | What is in `gantt.collapsed`, and what does a grouping-header cell show? | **`RowId`s.** Entries-source ids equal `EntryId`. Header `cells[0]` is `headerLabel`; the rest are empty. §S4.6, D-S4-22, D-S4-23. |
| **Q15** | Does `transaction.ts` keep a static import of the Rollup? | **No.** Default is `identityRollUp`. The consumer passes `rollUp: rollUpFields`. The bundler drops `rollup.ts` when that name is not imported. `rollUpKinds: []` still disables work when the function is installed. §S4.2, D-S4-7. |

---

## 1. User stories

Each story names the step that owns it. Acceptance boxes live in the step files.

- **U1.** (consumer) I pass `rollUp: rollUpFields` and declare `{ key: 'cost', source: { from: 'meta', key: 'cost' }, rollUp: 'sum' }`. Each parent shows the sum of its children. I wrote no aggregation code. → S4.1, S4.2
- **U2.** (consumer) I call `dataset.entries.update('t1', { start: X, cost: 500 })`. That is one transaction, one changeset, one undo step — across a core Field and my own. → S4.1, S4.3
- **U3.** (consumer) I misspell a Field key. The call throws `UnknownFieldError` and writes nothing. → S4.1
- **U4.** (consumer) I set `gantt.gridColumns = ['name', 'start', 'duration', 'cost']`. Four columns appear, each formatted by its Field. → S4.3
- **U5.** (consumer) I save `toJSON()`, reload with `fromJSON(doc, { aggregators })`, and my parents keep summing. → S4.4
- **U6.** (consumer) I see a tree in the grid pane. I click a twisty and the subtree collapses. The data does not change. → S4.6
- **U7.** (consumer) I switch `gantt.rows` from the tree to `{ source: 'group', groupBy }`. The same Gantt re-resolves rows and keeps its scroll position. → S4.6
- **U8.** (consumer) An entry with `segments` draws several bars on one row. I drag one of them and only that segment moves. → S4.7, S4.10
- **U9.** (consumer) I turn on `heightMode: 'pack'`. Overlapping items stack into lanes and the row grows to fit them. → S4.8
- **U10.** (consumer) I filter to one team. A matching deep child still appears under its chain of parents. → S4.9
- **U11.** (consumer) I turn on `autoGroup`. Reparenting an entry promotes its new parent to `'group'` in the same undo step. Removing the last child demotes nothing. → S4.5
- **U12.** (reviewer) I run `pnpm gate` on `.slice` = `S4` and read nine lines, each naming an acceptance box from `plans/03` and each backed by a test that ran. → S4.11

---

## 2. The two contexts this slice adds

S4 is the largest slice, so it is split into two contexts that meet at exactly one place. Keeping them apart is what stops the slice from becoming one change.

```mermaid
flowchart TB
  subgraph fieldctx["FIELD context — what a value IS (data/, api/)"]
    direction TB
    F1["FieldRegistry<br/>declarations, resolved against field types"]
    F2["field access<br/>the only switch over FieldSource"]
    F3["Rollup<br/>bottom-up, per field, ancestor chains only"]
    F1 --> F2 --> F3
  end

  subgraph rowctx["ROW context — what a Gantt DRAWS (layout/, view/)"]
    direction TB
    R1["resolveRows<br/>row source: entries | group | custom"]
    R2["emitItems<br/>per-kind ItemEmitter"]
    R3["packLanes<br/>lane per item, laneCount per row"]
    R4["placeGeometry<br/>x/y/width/height, cells"]
    R1 --> R2 --> R3 --> R4
  end

  fieldctx -->|"resolved columns<br/>on LayoutInput"| rowctx

  classDef f fill:#eef1f8,stroke:#5a6a9a,color:#1c2230
  classDef r fill:#eaf3ec,stroke:#4a7a58,color:#1c2b20
  class F1,F2,F3 f
  class R1,R2,R3,R4 r
```

**The one meeting point is `LayoutInput.columns`** — a resolved, plain-data list that `view/` assembles from `gantt.gridColumns` and the Dataset's Fields. `layout/` never imports `data/`, and `data/` never learns that a Gantt exists. Everything else in the two contexts is independent, which is why the step order can interleave them freely.

---

## 3. Step map

Eleven steps, in order. The Field context lands first, because the row cells and the grid columns read from it. Open the step file for decisions, files, tests and checkboxes.

| Step | Plan | Ends with |
|---|---|---|
| S4.1 | [`s4.1-field-registry.md`](./s4.1-field-registry.md) | `update('t1', { cost: 500 })` commits one changeset row keyed `cost` |
| S4.2 | [`s4.2-rollup.md`](./s4.2-rollup.md) | a parent's `cost` is the sum of its children, undoably |
| S4.3 | [`s4.3-grid-columns-and-cells.md`](./s4.3-grid-columns-and-cells.md) | four columns in the grid pane, live-reconfigurable |
| S4.4 | [`s4.4-serialization.md`](./s4.4-serialization.md) | `schema: 2` round-trips a declared Field |
| S4.5 | [`s4.5-autogroup-and-hierarchy-edits.md`](./s4.5-autogroup-and-hierarchy-edits.md) | reparenting promotes a parent in one undo step |
| S4.6 | [`s4.6-row-sources.md`](./s4.6-row-sources.md) | a tree with twisties; `gantt.rows` switches sources live |
| S4.7 | [`s4.7-item-emission.md`](./s4.7-item-emission.md) | brackets, diamonds, and N bars for N segments |
| S4.8 | [`s4.8-lane-packing-and-heights.md`](./s4.8-lane-packing-and-heights.md) | pack-mode rows grow to fit their lanes |
| S4.9 | [`s4.9-sort-and-filter.md`](./s4.9-sort-and-filter.md) | filter keeps ancestors; sort stays within a parent |
| S4.10 | [`s4.10-tree-and-lane-interaction.md`](./s4.10-tree-and-lane-interaction.md) | drag one segment; collapse from the keyboard |
| S4.11 | [`s4.11-harness-and-gate.md`](./s4.11-harness-and-gate.md) | `hierarchy.html`, e2e, spec edits, gate green |

---

## 4. Acceptance ids

`plans/03` §S4's nine boxes become `[S4-A1]`–`[S4-A9]` when S4.11's spec edits land.

| Id | Box | Owning step | Primary tests |
|---|---|---|---|
| `[S4-A1]` | A declared `meta` Field sums up the tree, shows beside `start`, edits in the same `update()` and undo step as a core Field, and round-trips | S4.1–S4.4 | `data/rollup.test.ts`, `data/serialization/*.test.ts`, `api/dataset.test.ts` |
| `[S4-A2]` | An edit naming an unregistered key throws `UnknownFieldError` — never a silent write | S4.1 | `data/entry-store.test.ts` |
| `[S4-A3]` | Switching `gantt.rows` re-resolves rows with no remount; scroll survives | S4.6 | `api/gantt.test.ts`, `layout/rows/*.test.ts` |
| `[S4-A4]` | A segmented entry renders N bars on one row; one segment drags transactionally | S4.7, S4.10 | `layout/items/*.test.ts`, `interaction/entry-gestures.test.ts` |
| `[S4-A5]` | Pack-mode rows change height as overlaps come and go; scroll stays stable | S4.8 | `layout/lanes/*.test.ts`, `layout/frame-layout.test.ts` |
| `[S4-A6]` | Collapse state survives data edits and is independent per Gantt | S4.6 | `view/collapse-state.test.ts`, `api/gantt.test.ts` |
| `[S4-A7]` | Filter with keep-ancestors shows a matching deep child under its parents | S4.9 | `layout/rows/filter.test.ts` |
| `[S4-A8]` | An empty `'group'` renders as a group, accepts children, and gains a span — no special-casing | S4.7 | `layout/items/*.test.ts`, `data/rollup.test.ts` |
| `[S4-A9]` | `autoGroup` promotes in the same undo step; losing the last child demotes nothing | S4.5 | `data/hierarchy.test.ts`, `data/history.property.test.ts` |

**Gate S4 → S5** (`plans/00` §4): field registry live; tree and grouped row sources; pack-mode row heights; item identity deterministic.

---

## 5. Public surface (app author)

What an app author gains. No registry handle. The Rollup is one named function the consumer opts into.

```ts
import { Dataset, Gantt, rollUpFields } from 'freegantt';

const dataset = new Dataset({
  timeZone: 'America/Chicago',
  rollUp: rollUpFields,                       // omit this and parents keep authored values
  rollUpKinds: ['group'],                     // was derivedSpanKinds
  hierarchy: { autoGroup: true },             // default false
  fieldTypes: { money: { rollUp: 'sum', formatValue: asCurrency, column: { align: 'end' } } },
  aggregators: { riskWeighted: (children, parent, ctx) => /* … */ },
  fields: [{ key: 'cost', type: 'money', source: { from: 'meta', key: 'cost' } }],
  entries,
});

dataset.entries.update('t1', { start: '2026-10-05', cost: 12_000 });   // one changeset, one undo step

const gantt = new Gantt({
  container, dataset,
  gridColumns: ['name', 'start', 'duration', { field: 'cost', header: 'Budget' }],
  rows: { source: 'entries', tree: true, heightMode: 'pack', filter: byTeam, sort: { field: 'start' } },
});

gantt.rows = { source: 'group', groupBy: (entry) => entry.meta.team };
gantt.collapse('p1');
gantt.on('collapseChange', ({ to }) => save(to));
```

| Export | Step |
|---|---|
| `Field`, `FieldSource`, `FieldType`, `FieldKey`, `Aggregator`, `AggregatorName`, `FieldContext`, `RollUpContext` | S4.1 |
| `DatasetOptions.fields` / `.fieldTypes` / `.aggregators` / `.rollUpKinds` / `.rollUp`, `Dataset.fields` (read view), `rollUpFields` | S4.1, S4.2 |
| `AggregatorFailedError`, `DuplicateFieldKeyError`, `UnknownAggregatorError` | S4.1, S4.2 |
| `DatasetOptions.hierarchy`, `Dataset.hierarchy` | S4.5 |
| `GridColumn`, `GridColumnInput`, `Gantt.gridColumns` | S4.3 |
| `Dataset.fromJSON(doc, options?)`, `schema: 2` | S4.4 |
| `RowSource`, `EntriesRowSource`, `GroupRowSource`, `CustomRowSource`, `Gantt.rows` | S4.6 |
| `Gantt.collapsed`, `collapse`, `expand`, `toggleCollapse`, `beforeCollapseChange`/`collapseChange`, `CollapseChange` | S4.6 |
| `RowFilter`, `RowSort` | S4.9 |
| Parts: `fg-row-cell`, `fg-row-twisty`, `fg-bar-bracket`, `fg-bar-diamond`; tokens `--fg-indent-width`, `--fg-lane-gap` | S4.3, S4.6, S4.7, S4.8 |

**Not public:** `FieldRegistry`, `readField`/`writeField`, `ItemEmitter` registration, `PlannedRow`, `LanePacking`, `FrameMemory` — internal registry and pipeline shapes.

**Retired by this slice:** `DatasetOptions.derivedSpanKinds`, `Dataset.derivedSpanKinds`, `Dataset.isDerivedSpanKind` (→ `rollUpKinds`, `isRollUpKind`). Pre-1.0, no released consumers, so the rename ships with no alias — ADR 0003's own precedent.

---

## 6. Decisions index

Full prose lives in the step file that implements each decision.

| Decision | Topic | Step |
|---|---|---|
| D-S4-1 | Types in `model/`, one registry in `data/`, whole declaration stored | S4.1 |
| D-S4-2 | One `FieldSource` adapter | S4.1 |
| D-S4-3 | Aggregators by name; skip holes; no function on the Field | S4.1 |
| D-S4-4 | Core Fields are ordinary declarations; no `progress` | S4.1 |
| D-S4-5 | Declaration errors at construction | S4.1 |
| D-S4-6 | `derivedSpanKinds` → `rollUpKinds`, gate widens | S4.2 |
| D-S4-7 | `rollup.ts` is a leaf; commit path never imports it; `identityRollUp` default | S4.2 |
| D-S4-8 | Ancestor chains only; one path for every Aggregator | S4.2 |
| D-S4-9 | `AggregatorFailedError` fails the transaction | S4.2 |
| D-S4-10 | Computed Fields memoized on dataset revision | S4.2 |
| D-S4-11 | View state never changes a stored value | S4.2 |
| D-S4-12 | `gridColumns` is names plus overrides; `column` means columnable | S4.3 |
| D-S4-13 | `LayoutInput.columns` is the one meeting point | S4.3 |
| D-S4-14 | `formatValue` is text; renderers stay out of `data/` | S4.3 |
| D-S4-15 | The Document carries the data half of a Field | S4.4 |
| D-S4-16 | `schema: 2`, and `schema: 1` still reads | S4.4 |
| D-S4-17 | `autoGroup` defaults to `false`; promotes `'span'` only | S4.5 |
| D-S4-18 | Promote only, never demote | S4.5 |
| D-S4-19 | `computeFrame` becomes four stages | S4.6 |
| D-S4-20 | Rows resolve whole-dataset; the rest is windowed | S4.6 |
| D-S4-21 | One `RowSource` interface, three occupants | S4.6 |
| D-S4-22 | Collapse is Gantt state; ids are `RowId`s | S4.6 |
| D-S4-23 | `Row.kind: 'group'` stands for no Entry; `headerLabel` | S4.6 |
| D-S4-24 | `ItemEmitter` seam, three occupants, no public registration | S4.7 |
| D-S4-25 | One Item per Segment; one id builder | S4.7 |
| D-S4-26 | Lane packing memoized; the height index forces it | S4.8 |
| D-S4-27 | `heightMode` on the row source; scroll is a pixel position | S4.8 |
| D-S4-28 | Sort and filter belong to the row source | S4.9 |
| D-S4-29 | Filter keeps ancestors; sort stays within a parent | S4.9 |
| D-S4-30 | A Segment drag writes `segments` and the envelope | S4.10 |
| D-S4-31 | Row reorder and reparent **by drag** are not S4's | S4.10 |
| D-S4-32 | `rowOrder()` retires | S4.10 |
| D-S4-33 | Keyboard collapse and expand | S4.10 |
| D-S4-34 | One harness page, one Gantt, one `rows` switch | S4.11 |

---

## 7. Agent gotchas

Read these before you touch `src/`.

1. **`layout/` must not import `data/`.** The Field registry lives in `data/`; the resolved columns reach `layout/` as plain data on `LayoutInput`. `depcruise` catches a direct import; `LayoutInput.columns` is the fix.
2. **`data/` must not import `view/` or `layout/`.** A `Field.column` sub-object is plain data that `data/` carries and never interprets. A renderer is code that `data/` must never hold — keep it on the Gantt (S5).
3. **One `switch` over `FieldSource`, in `data/fields/field-access.ts`.** A second one anywhere is the finding, not a style nit.
4. **`computeFrame` is composition after S4.6.** Do not add a branch to it. Add a stage, or change the stage that owns the concern.
5. **Never split an `ItemId` inline.** Use `model/ids.ts`'s builder and its new reader. S3's `entryFor(itemId)` already depends on this.
6. **Collapse, filter and sort are view state.** None of them may reach the Rollup, the changeset, or the Document. `[S4-A6]` and D-S4-11 both test this.
7. **`kind` stays authored.** The only automated write to it is `autoGroup`'s promotion, and only when the consumer turned it on.
8. **Review `harness/main.ts` on every commit**, changed or not (CLAUDE.md). Code there that re-derives what the library computes is an API gap to close in `src/`.
9. **Run the full check sequence** after each step: `pnpm vitest run`, `tsc --noEmit`, `eslint src harness`, `depcruise`, `node scripts/guard-red-test.mjs`.
10. **`.slice` bumps only at S4.11** — not before the gate is green.
11. **`data/transaction.ts` must not import `data/rollup.ts`.** Call `data.rollUp`. The only importer is `api/roll-up.ts`.

---

## 8. Foot-guns

| Foot-gun | Answer |
|---|---|
| A consumer field is written but never rolls up | `rollUp: rollUpFields` was omitted (identity is the default), or the parent's Kind is not in `rollUpKinds` (D-S4-6, D-S4-7) |
| `update('t1', { meta: {...} })` loses a declared value | Whole-`meta` write emits the `meta` row **and** one row per changed declared key; apply order is `meta` first (D-S4-2) |
| An aggregate appears in the Document that the consumer did not want | The Field is `entry`- or `meta`-sourced. A `compute` source never reaches the Document (ADR 0005) |
| A consumer Aggregator reads the zoom level | Forbidden. A computed Field reads the Dataset only; its cache key assumes it (D-S4-10) |
| A drag reverts with no message | It does not: an Aggregator that throws raises `AggregatorFailedError` out of the commit (D-S4-9) |
| Collapsing a parent changes its rolled-up value | It cannot. Collapse is `view/` state and never reaches `data/` (D-S4-11) |
| A filtered-out child stops counting toward its parent's sum | It still counts. Filter is a row-resolution question (D-S4-11, D-S4-29) |
| Pack mode makes `contentHeight` cost O(n) per render | It costs one pack per row per revision, memoized. The height index is the only forcing caller (D-S4-26) |
| Switching `rows` scrolls the user to the top | Scroll is a pixel position, clamped against the new content height (D-S4-27) |
| Two Gantts on one Dataset fight over collapse | Collapse is per Gantt, like selection (D-S4-22) |
| `Row.kind: 'group'` is read as "a `'group'` Entry" | It is not. A `'group'` Entry produces a `Row.kind: 'entry'` row (D-S4-23) |
| A segment drag moves the whole entry | The grabbed `ItemId` carries the segment index and the draft writes `segments` (D-S4-30) |
| `derivedSpanKinds` still works | It does not. The option is renamed with no alias; a `schema: 1` Document still reads (D-S4-6, D-S4-16) |

---

## 9. Tests (overview)

`pure` (Node) unless noted. Per-step detail lives in each step file §3.

| Area | Files |
|---|---|
| Field registry | `data/fields/field-registry.test.ts`, `field-access.test.ts`, `aggregators.test.ts` |
| Rollup | `data/rollup.test.ts`, `data/rollup.property.test.ts` |
| Edits and changesets | `data/entry-store.test.ts`, `data/change-set.test.ts` |
| Undo | `data/history.property.test.ts` (widened to declared Fields) |
| Serialization | `data/serialization/read.test.ts`, `write.test.ts` |
| Hierarchy | `data/hierarchy.test.ts` |
| Row resolution | `layout/rows/entries-source.test.ts`, `group-source.test.ts`, `custom-source.test.ts`, `filter.test.ts`, `sort.test.ts` |
| Item emission | `layout/items/emit-items.test.ts` |
| Lanes and heights | `layout/lanes/pack-lanes.test.ts`, `layout/frame-layout.test.ts` |
| Frame composition | `layout/frame.test.ts` |
| Columns and paint | `view/grid-columns.test.ts`, `render/dom/index.test.ts` (dom) |
| Collapse | `view/collapse-state.test.ts` |
| Gestures | `interaction/entry-gestures.test.ts`, `keyboard-editing.test.ts` |
| Integration | `api/dataset.test.ts`, `api/gantt.test.ts` |
| E2E | `e2e/hierarchy.spec.ts` |
| Guard | `scripts/guard-red-test.mjs` — `layout/` must not import `data/`; `rollup-is-removable` |

---

## 10. Known gaps this slice closes (issue #91 §9)

| Gap | What it asks | Step |
|---|---|---|
| §9-B | `GanttShell`'s `#wiring` boolean, revisited now that construction wires more | S4.6 |
| §9-E | `RowHeightIndex.heightAt` / `invalidateFrom` finally get production callers — or come out | S4.8 |
| §9-G | `RenderBackend.hitTest(x, y)` names its coordinate space before lane hit-testing lands | S4.10 |

---

## 11. Deferred

| Deferred | Returns at | Needs |
|---|---|---|
| `PluginContext.data.registerField` / `view.registerGridColumn` / `layout.registerItemEmitter` | S5 | Plugin runtime |
| `cellRenderer`, inline cell editing, `beforeEntryEdit` | S5 | Editor host and overlay |
| Column resize and reorder | S5 | Grid chrome |
| Consumer-defined Kind end-to-end (`[S5]` box) | S5 | Public registration at all four seams |
| Full grid a11y (roving tabindex, axe in CI) | S5 | `plans/03` §S5 a11y block |
| Subtree-revision cache key for computed Fields | S6 | The measured spike (D-S4-10) |
| Log-time height index | S6 | The measured spike (D2) |
| Row reorder and reparent **by drag** | when an authored order Field exists | That Field, plus a drop-target vocabulary (D-S4-31). S4 ships the data half: `update(id, { parentId })` |
| Moving a `'group'` moves its subtree | S7 | The extension hook writes children |
| Link endpoints on a multi-item row (`links.endpoints`) | S7 | Link emission (#16) |

---

## 12. Spec edits

Landed in the step that proves each one, except the batch at S4.11. Full list in [`s4.11-harness-and-gate.md`](./s4.11-harness-and-gate.md) §4. The four that change settled text rather than adding to it:

1. `plans/03` §S4 — "Sort and filter as store-level view specs" becomes row-source-level (Q4).
2. `plans/00`–`04`, `CONTEXT.md`, `README.md` — `derivedSpanKinds` → `rollUpKinds`, and its meaning widens (Q2).
3. `plans/02` §6 and `CONTEXT.md` "Document" — `schema: 2`, `fields` in the Document, `fromJSON`'s second parameter (Q3).
4. Stale slice pointers in shipped comments: `src/model/errors.ts` and `src/data/change-set.ts` say "S5's field registry" (it is S4); `src/layout/row-height-index.ts` says "S5's pack-mode" (S4) and "S7 spike" (S6).
