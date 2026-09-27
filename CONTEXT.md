# FreeGantt

A framework-free TypeScript Gantt library: layout and rendering of dated Entries over time. Scheduling — dependencies, propagation, constraints — is one optional first-party plugin (ADR 0002), not what the library is about. The core vocabulary is therefore domain-neutral (ADR 0003): a consumer charting shifts, bookings, machine uptime, or units sold per week is as much the intended user as one charting a project plan.

## Language

### Authored model

**Dataset**:
The body of authored data — its Entries, plus whatever scheduling-plugin-owned data (e.g. Dependencies) an installed scheduling plugin contributes — together with the settings that give it meaning, above all the IANA zone in which all zone-aware date arithmetic is performed. "The dataset's zone" and "the dataset's reference date" are properties of this, not of the runtime environment. A Dataset with no scheduling plugin installed has Entries and no Dependencies at all (ADR 0002). Renamed from Project in ADR 0004 — read every historical "Project" as "Dataset". `model/dataset.ts`'s `Dataset` is the structural contract `api/dataset.ts`'s `Dataset` class satisfies (`implements`) — the same structural/façade relationship the Gantt entry states, and the type `layout/` binds against without importing `view/` or `api/` (S1.7 §3.2; formerly `DatasetLike` in `view/gantt-shell.ts`).

`timeZone` is optional on construction (#129). Omitted, the Dataset resolves the environment's own zone once, at construction, and stores that resolved string. The zone is still a property of the Dataset, read from `dataset.timeZone` like any explicit value. Omission is a one-time authoring convenience, not a live link to the runtime environment. The Dataset never re-reads the environment afterward.

`locale` is optional on construction too (#583), fixed the same way — `dataset.locale` reads it back, `undefined` when the consumer named none. Unlike `timeZone` it resolves nothing on its own: a caller's own locale beats it (`formatFieldValue`'s own argument), and it beats only the runtime's own.
_Avoid_: Project (retired in ADR 0004 — see that ADR for why; the word smuggled scheduling/PM assumptions into a domain-neutral concept the same way `Task` once did for `Entry`), Plan, schedule (a schedule is an output of scheduling a Dataset, not the Dataset itself)

**Document**:
The browser's `document`, and nothing else. **The library holds no save format** (ADR 0016): there is no `toJSON`, no `fromJSON`, no Document type and no `schema` integer. A consumer reads `entries.all`, `fields.all` and `dataset.pluginStore(id)`, and saves its own shape. Derived layout (`Row`, `Bar`, `GeometryFrame`) is recomputed and is saved by nobody.
_Avoid_: Document as a name for saved data. The word named two things at once — this shape and the DOM's `document` (#266) — and ADR 0016 deleted the half that could move

**Store**:
The normalized, mutable collection one kind of authored entity lives in inside `data/` — `EntryStore` for Entries, and each plugin's own reserved `PluginStore` for its own entities (ADR 0002). A Store is `data/`'s own, not a consumer-facing word: `dataset.entries` is the published call site (D-S2-2, `plans/s2-data-core`), and "Store" names the class behind it, the way "Signal" names the reactive cell behind `dataset.entries.all`'s cached identity.
_Avoid_: Collection (too generic — every array is a collection), Repository (implies a persistence-layer abstraction this isn't; a Store has no I/O of its own), Table (a relational-database word this schema-free normalized store isn't)

**Snapshot**:
The committed, cached `readonly Entry[]` a Store's `all` returns (D-S2-2, D-S2-3). Its identity changes only when a transaction commits — not on every read — so a caller comparing two reads of `all` by reference is asking "did anything change" correctly. It shows the Store's last **committed** state only: a transaction's own in-body writes are visible through `get`/`has`/`size`, never through `all` (D-S2-21). `EntryStore`'s own Snapshot walks the tree depth-first, each group in Sibling index order (ADR 0034) — a parent sits right before its own children, siblings in the order the Field states.
_Avoid_: View (View is a Row's rendering-facing sense, `plans/01` §2.3 — a different concept), Copy (implies a fresh array per call, which defeats the whole point of the cached identity), List (not a term this codebase uses elsewhere for a collection)

**DatasetState**:
The `data/` class holding one Dataset's live, private state — its Entry Store, its zone, its Reference date, and (from later S2 steps) its extension hook, undo history and event bus. `api/dataset.ts`'s `Dataset` class is a thin façade that constructs one `DatasetState` and delegates every read to it — the same structural/façade relationship `Gantt`/`GanttShell` already has, one layer up. Named after the naming skill's five checks ruled out the alternatives: `DatasetCore` collides with this slice's own loaded use of "core" (a core step, core behaviour); `DatasetStores` promises less than the class holds (it is not only stores); inverting the pair so `data/` owns the name `Dataset` collides with `model/dataset.ts`'s existing structural `Dataset`.
_Avoid_: DatasetData (retired — "Data" already named three things in this codebase: the `data/` layer, this class, and the dataset itself), DatasetCore, DatasetStores (both rejected candidates, see above)

**Reference date**:
The `Instant` captured once when a Dataset is constructed — the one `Date.now()` read `time/` performs for that Dataset (CLAUDE.md confines `Date.now()` to `time/`). It stays fixed for the Dataset's lifetime; it is not re-derived on every layout pass. It does not mint a fake span: a dateless Entry holds no dates (ADR 0012). The old `referenceDate` fill for empty groups is deleted.
_Avoid_: Now, current time (both read as live/re-evaluated, which this isn't), wall clock (that's Plain time's vocabulary — a Reference date is an already-resolved `Instant`, not an unresolved zone-less reading)

**Entry**:
One authored, dated record: a name, and optional dates. Entries are persisted; they are what a consumer creates, edits, and hands to the library. What an Entry _means_ is the consumer's business — a task, a shift, a delivery, a day's sales — and core never assumes. The word is the accountant's: a dated line in a ledger. Its `id` is identity, never editable — `EntryEdit` (the shape `entries.update()` takes) omits `id` from `EntryInput` for exactly this reason, so there is no way to write an id-changing edit that typechecks. An Entry that has children derives its rolling-up Fields from them (ADR 0013). It has no stored `kind`. **An Entry answers questions about itself** (ADR 0017): `entry.read(key)` is the one value door — `entry.read('duration')` states how long it runs — and `entry.hasChildren`, `entry.children()`, `entry.parent()` and `entry.descendants()` answer the tree. `StoredEntry` is what an Entry's stored values are called — the shape the edit pipeline carries, and what `entry.toInput()` copies. It is not a second concept.
_Avoid_: **Task** (retired in ADR 0003 — it implies to-do work, and the whole point is that the record is domain-neutral), activity, event, bar (a bar is what a Bar renders), record, row (a Row is a display track), **phase**, **grouped entry** (`{ source: 'group', groupBy }` is a row source, not a parent)

**`*Input` / `Resolved*`**:
Two suffixes for one question — what a consumer writes, and what the library stores — over two different gaps between the two forms (#253, `plans/02` §2.1). `*Input` names a pair whose stored form's _type_ differs from the authored form: a plain `string` id gains the `EntryId` brand (`EntryInput` → `Entry`), and a loose date resolves to an `Instant` (`InstantInput` → `Instant`). `Resolved*` names a pair whose stored form only fills in what the authored form left out, with no type change: an omitted `filterPolicy` gains its default (`RowSource` → `ResolvedRowSource`). Both suffixes stay — a rename would move the public API report and spend edits moving the inconsistency, not removing it, since `*Input` already carries a second meaning of its own (a parameter bag for one function: `LayoutInput`, `RowPassInput`, `CustomRowInput`). `ResolvedTheme` and `ResolvedBarLabel` are known misfits under this rule, kept open for the 1.0 API review (`plans/02` §2.1): each computes an answer shaped unlike its authored counterpart, not a filled-in one.
_Avoid_: guessing one suffix from the other family's presence; renaming either family outside a slice whose gate allows API movement

**Spans**:
An Entry **spans** if and only if both `start` and `end` are present (ADR 0012). `spansTime(entry)` in `model/stored-entry.ts` is the one place that rule is written, and every layer asks it there. A spanning Entry draws a Bar, unless it is a segmented parent (ADR 0027, `childrenAsSegments`) — its children draw the Bars on that row instead, as Segments. A row with one date, or with neither, does not span, shows in the grid, and draws no bar. Core ships a `diamond()` look for a zero-duration span; no row wears it until a rule matches it (ADR 0022).
_Avoid_: calling one date a span

**Kind** (retired, ADR 0013 decision 26):
Was the authored classification on Entry (`'span' | 'group' | 'milestone'`). An Entry has children or it does not. That structure decides derivation and the default bar look. Core does not store a classification, and it does not publish a calculated `kind` Field — that would restate `entry.hasChildren`. Core ships a `diamond()` look (ADR 0022), but a `when` rule must still match a row before it wears one. A plugin or a consumer that needs a shape that is not parent-or-bar declares a Variant, whose `when` rule matches the rows (ADR 0018) — nothing stores which ids it owns. `Row.kind` (`'entry' | 'header'`) and `TargetKind` are unrelated: they name what a row or a DOM target is, not a classification of an Entry.
_Avoid_: putting `kind` back on Entry; `'milestone'` in core; `rollUpKinds`; `hierarchy.autoGroup`; a calculated `kind` Field; a stored Variant

**Hierarchy**:
The tree of Entries, as the Hierarchy source answers it (ADR 0020). Core's own source reads `parentId`, so a Dataset with no plugin installed has the tree that field states. Core inverts the answer: it owns the child index, `depth`, `descendants()` and the Rollup, so nothing can give one Entry two parents. The Dataset option `hierarchy.autoGroup` is deleted (ADR 0013): nothing promotes a stored kind, because there is no stored kind. A child arriving is enough for the parent to derive and to draw core's own `parent` Variant. **`entry.read('parentId')` answers the authored field, not this tree** (ADR 0024) — `entry.parent()` and `entry.read('hierarchyParentId')` answer the tree instead, and the two can disagree on purpose under a plugin-owned source, a dangling id, or a cycle.
_Avoid_: `autoGroup`; a stored Kind or Variant derived from "has children"; "the tree is `parentId`" (it is what the source answers); "`read('parentId')` answers the tree" (ADR 0024 reversed this — it answers the stored field, like any other key)

**Hierarchy source**:
The function that answers which Entry is the parent of another — `(entry) => EntryId | string | undefined`, over every field an Entry carries except its Sibling index (ADR 0020, ADR 0034). It reads no order: a group's order is the Sibling index Field's own answer, never the source's, so a source cannot say who comes first among the siblings it names. Core's own is `(entry) => entry.parentId`, registered like any other with no special claim on the seam. A data plugin declares `hierarchySource` on itself (ADR 0031) — the one door onto the seam. Declared sources compose in setup order: the first plugin wraps core's own source, each later one wraps the one before it, and the last one answers first. It reads a `StoredEntry`, never the live `Entry`: the live row's `parent()`, `children()`, `depth` and `descendants()` are all built from this answer. One Entry in, one parent id out — never the whole dataset, which is what keeps a child query O(children + edits). An id no Entry holds reads as a root, and a chain that loops is broken at the link that closes it; both raise a Fault once per revision and neither throws. The Rollup follows the same source, so a plugin that changes the tree has changed the Rollup and the two can never disagree. This source's checked answer is what `hierarchyParentId` reads by key (ADR 0024). "Child," "descendant" and "leaf" carry one meaning across this source, `Entry` and a pass's `ComputeContext` — see **Child / Descendant / Leaf**. `new Dataset({ entries })` checks the raw `parentId` first, before any source runs (ADR 0031): a duplicate id, an unknown parent, or a loop throws — the same check `load` runs.
_Avoid_: a second seam for the Rollup; a source that takes the dataset; grouping (`{ source: 'group' }` is a Row source and stays one)

**`hierarchyParentId`**:
The core Field that reads the Hierarchy source's checked answer by key — `entry.read('hierarchyParentId')` equals `entry.parent()?.id` (ADR 0024). `compute`d, never stored, so it has no write door and never appears in a `ChangeSet` or `toInput()`. It exists because `parent()` has no by-key door: a Grid column, a serializer, or a `values()` fold holds a `FieldKey`, not a member name. Not to be confused with `parentId`, the stored field `entry.read('parentId')` answers — the two agree except under a plugin-owned Hierarchy source, a dangling `parentId`, or a cycle, where they disagree on purpose.
_Avoid_: reading it as a second `parentId`; writing it (`entries.update()` refuses a `compute` Field, `ComputedFieldCannotBeWrittenError`)

**Sibling index**:
The `siblingIndex` core Field: an Entry's rank among the Entries that share its group, where the group is the Hierarchy source's own checked tree — never a raw, unchecked `parentId` (ADR 0034). Stored on every Entry, required, dense within a group (`0` through one less than the group's size, no gap and no repeat). Construction and `load` set it from the input list's own order, one counter per group — `EntryInput.siblingIndex` is an advisory hint either checks against list order and drops with a warning if the two disagree, list order always winning. `entries.add()` and `entries.update()` write it directly (`editable: 'anywhere'`): a call names a target index, or names none and the entry goes to the end of its group, and every other sibling the move passes renumbers around it in the same transaction. `entries.all` walks the tree depth-first, each group already in this Field's order — that is what "depth-first" means here, not the order a caller happened to list rows in.
_Avoid_: order, sort, position, rank (all read as a general term; name the Field itself)

**Child / Descendant / Leaf**:
Three questions about one row's place in the tree, and one tree makes the difference legible (ADR 0017 amendment, #466):

```
Depot
├── Van 1
│   ├── Crate A
│   └── Crate B
└── Van 2
```

| Asked about `Depot`  | Answer                         | In one phrase        |
| -------------------- | ------------------------------ | -------------------- |
| `children(Depot)`    | Van 1, Van 2                   | one step down        |
| `descendants(Depot)` | Van 1, Van 2, Crate A, Crate B | all the way down     |
| `leaves(Depot)`      | Van 2, Crate A, Crate B        | the bottom rows only |

Van 1 is a descendant and is not a leaf, because Van 1 has children of its own. Van 2 is both. **`leaves(row)` includes `row` itself when `row` is a leaf, and `descendants(row)` never includes `row`** — `leaves(Van 2)` is `[Van 2]`, not `[]`, while `descendants(Van 2)` is `[]`. `descendants` names a relationship _to_ a row, so the row is not its own descendant; `leaves` names the bottom rows _of a subtree_, and a subtree of one leaf has one leaf. `Entry` (`children()`, `descendants()`) and a pass's `ComputeContext`/`RollUpContext` (`children(row)`, `descendants(row)`, `leaves(row)`) both answer these three questions, under these three words and no others.
_Avoid_: `descendants(row).filter(r => !hasChildren(r))` for "leaves" — that is the walk `leaves` exists so nobody writes twice; a second name for any of the three at any altitude (`childrenOf`, `hasChildrenOf`)

**Dependency**:
A first-class entity linking a predecessor Entry to a successor Entry with a type (`FS`/`SS`/`FF`/`SF`) and optional lag. Never embedded as an array on an Entry. Owned by the `entryDependencies()` plugin, not `model/` (ADR 0002; S5.0 grill, issue #111) — it exists only when that plugin is installed and lives in its reserved store, not on `Entry` or in core. The default scheduling plugin reads it through a read-only cross-plugin store view; it does not own it.
_Avoid_: Link (reserved for the rendered geometry of a dependency, i.e. what appears in `GeometryFrame.links`), Relationship

**`entryDependencies()`**:
The first-party plugin that owns the `Dependency` store, the link-create gesture, and dependency-arrow rendering. It runs standalone — installed with no scheduling plugin, it gives arrows with no auto-move. The default scheduling plugin `requires` it and reads its store one-way; `entryDependencies()` never names the scheduling plugin (S5.0 grill, issue #111; `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md` D-S5-31).
_Avoid_: `dependencies()` (collides with npm's "dependencies" at the call site), Link (see Dependency)

**Segment**:
A Bar on a row that draws more than one Bar. A row with one Bar draws a Bar; a row with several draws Segments, and that row is **segmented**. A Segment is a **reading of a Bar, never a type**: nothing stores one, no id names one, and `FrameBar` carries no field that says so — which is why the word costs the library nothing. A row draws several Bars two ways: a row source draws a parent's children on the parent's own row (`childrenAsSegments`, below), or a Variant's own `bars` producer answers with more than one Bar for one Entry.

**The `Segment` type stays retired** (#421, ADR 0026), and the word does not bring it back. What the type named — a drawn piece of one Entry's span, with an id of its own — is an ordinary child `Entry` now, dated and selected the way any Entry is. `Entry.segments`, `SegmentId`, `segmentIds`, `selectedSegmentIds`, `data-segment-id`, `EmptySegmentsError`, `DuplicateSegmentIdError` and `dataset.entries.removeSegments` are gone, with no legacy key and no migration path. So a Segment is what a reader **sees**, and a child `Entry` is what a caller **addresses**: one word for the picture, and every id, gesture and edit still names the Entry. An Entry with children holds no bar of its own **only when a row source matches it** (`childrenAsSegments`, below) — a parent the rule does not match keeps its own bar over its rolled-up span, the same as before ADR 0026 (ADR 0013 unchanged).

**`childrenAsSegments`**: an `EntriesRowSource` key (`layout/rows/row-source.ts`, `#421` C1), and the `Row` flag it sets (`Row.childrenAsSegments`) — one word for the knob and for its effect. `true` matches every parent with at least one child; a `FieldMatch` or `EntryPredicate` (`layout/entry-rule.ts`, the same `when` syntax a Variant already takes) matches only the parents the rule answers yes for. A matched parent keeps its own row; its children take none, and draw on the parent's row as Segments instead, each as its own Bar with its own name, Field values and capabilities. A parent the rule does not match is untouched — its own row, a row per child, roll-up exactly as today. A childless Entry never matches (Q34): the pass asks "has children?" before it reads the rule's Field, so an empty parent stays a blank row, the same way a dateless row already draws (`J-plan-D`). Orthogonal to `tree`: `tree` nests the children of a parent this rule does not match; `childrenAsSegments` decides whether a matched parent's children become rows at all. `data/` has no notion of a segmented row — a segmented parent is an ordinary rolling-up parent to `data/rollup.ts` and `entry-store.ts` (ADR 0013): its `start`/`end` are refused the same way any rolling-up parent's are, and its children move it only by rolling up, never by a direct write. There is no data-layer cascade for a segmented row's rail bar — a rail bar is a consumer's own Variant, since core draws no bar at all for a segmented parent (Q26, `wholeSpanUnlessSegments`).
_Avoid_: `SegmentId` or any second id space (a Segment is a Bar, and `Bar.id` already names it); Split, interval, piece; "sub-entry" for a child that draws as a Segment (it is an ordinary child `Entry` record, addressed and edited the same way as any other); "claimed" for a segmented row (retired with the code in the `claims` rename — a rule matches a row, and nothing stores a hold on it)

**Field**:
One named, addressable value on an Entry — declared once and used by every layer that needs it. The Field key is the whole address (ADR 0011): `{ key: 'cost' }` is `entry.props.cost`; `{ key: 'start' }` is `entry.start`; `{ key: 'duration', compute }` has no stored home. Core ships `name`, `start` (`min`), `end` (`max`), and the computed `duration` as declarations of exactly the shape a consumer adds to, which is what lets a consumer's `cost` be edited, compared, rolled up and shown by the same code as `start` (ADR 0005, `01` §2.6, ADR 0011). Resolved core Fields name the shipped types: `name` is `text`, `start` and `end` are `date`, and the computed `duration` (the row's own span, `end - start`) is `duration`. Format and compare come from that type table; `end` keeps its own inclusive `formatValue`. A consumer writes a Field with `dataset.entries.update('t1', { cost: 500 })` and reads it with `dataset.entries.get('t1')?.read('cost')` — one call for a core, consumer, plugin, or compute Field, with no reach into `entry.props` for a Field read. `dataset.field('cost')` is the resolved declaration; `dataset.fields.all` lists every declared Field, core Fields included. `parentId` is a Field too, so the changeset has one path. `Field.column` carries the bare-key shorthand's defaults; a column object shows any declared Field. They ship `editable: 'api'`, so the app writes them and the user never types them. There is no `kind` Field and no `props` Field. **`progress` is not a core Field** — it is scheduling-plugin data under `scheduling:progress` (ADR 0008). Fields belong to the Dataset (`fields`), because the Rollup writes stored, undoable values and runs at construction, before any Gantt exists. Nothing but the Rollup writes a rolling-up parent's cell (ADR 0013). **A Field is what a value _is_; a Grid column is where a Gantt _shows_ it** — the one sentence that separates the pair.
_Avoid_: Attribute, property (both read as "a key on an object", which is the storage detail rather than the declaration), column (a Grid column names a Field and carries presentation only)

**Field key**:
A Field's name, and the same string the changeset's `field` carries. One name for one concept: it retires `EntryField`, which meant exactly this in `FieldUpdated` and gave the idea a second name (the #7 precedent). `CoreFieldKey` is the shipped subset — the keys of `Entry` — and it is what the per-field comparison table stays exhaustive over.
_Avoid_: EntryField (retired), field name, column id

**Props**:
The consumer's bag on an Entry (`entry.props`). Always present; `{}` when empty. A declared key is a Field. An undeclared key is carried at ingest and never named at `update()` (ADR 0011). Plugin Field values share this bag under a prefix the plugin follows by convention (`scheduling:progress`, ADR 0008) — core enforces no prefix. Core keys stay on the Entry, never inside `props`. The library writes into `props` only at a declared `rollUp` key. A `compute` Field has no `props` key.
_Avoid_: the old consumer-bag name (retired, ADR 0011), data (the `data/` layer already owns that word), Field source (retired — the key is the address)

**Field type**:
A named bundle of Field settings — a rollup **name**, an equality rule, a sort `compare`, text formatting, and column presentation defaults — applied with `type: 'percent'` so one declaration serves many Fields. `type` also takes the bundle itself: `{ key: 'cost', type: currency({ code: 'EUR' }) }`. After merge, a string name stays on the Field; an inline bundle does not. The library ships `text`, `number`, `percent`, `date`, and `duration`. `currency({ code })` is a factory that returns a bundle — it is not a seeded name. Image is not a Field type: a URL rendered as text is noise, so `image()` paints it on the column. The bundle's `rollUp` is the default Aggregator name (shipped or a consumer name in `aggregators`) for Fields that name this type and omit `rollUp`; `formatValue` is the default display text; `compare` is the default sort order. The Field's own keys win, so `rollUp: 'none'` on the Field opts that Field out. The Aggregator function lives in `aggregators` under that name, never on the bundle. `api/` splits it: the data half reaches `data/`'s registry, the presentation half reaches `view/`, so the consumer writes it once and the layer boundary still holds.
_Avoid_: Column type (the bundle is broader than a column), Kind (retired for Entry, ADR 0013), putting a function on `rollUp` (ADR 0005 — a name is data, a function is not), seeding `'currency'` as a type name (it is a factory)

**Field registry**:
The one `data/` module that holds every declared Field — core Fields and consumer Fields on the same code path — resolves `type` merge, and is the legal set for `update()` and `entry.read`. The Field key decides the home. `layout/` never imports it: resolved `columns` and `fieldCompares` arrive on `LayoutInput` as plain data (D-S4-13).
_Avoid_: Field map, schema registry (this is not a persistence layer — the registry holds declarations, and the Store holds values)

**Aggregator**:
The function that turns a set of children's values into a parent's value for one Field — `min`, `max`, `sum`, `count`, `'none'`, a duration-weighted mean, or a consumer's own. Always referenced **by name**, never passed inline: a name is data the registry can refuse when it is not registered, and a function is not. Returning `undefined` means "no opinion, leave the stored value alone". `'none'` always returns `undefined`, so that Field keeps the parent's authored value. A shipped Aggregator skips holes (`undefined`, non-numeric for `sum`/`min`/`max`, zero-duration children for the weighted mean) and never throws; if every child is skipped it returns `undefined`. The Aggregator is the function; the Rollup is the pass that runs it.
_Avoid_: Aggregation (the noun for the pass is Rollup — one concept, one word), reducer, accumulator, closure on the Field (the function is registered under a name)

**WBS**:
The dotted position code an Entry has in the tree — `1`, `1.1`, `1.1.1`, then `2` for the next root. It is **derived, never authored**. The `wbs()` plugin computes it from `parentId` and the Sibling index Field. No consumer sends one, writes one, or reads one back as a stored Field. Moving an Entry changes its WBS; the `id` never moves. Depth is unbounded. The number counts the **authored** order — the consumer's `entries` array — not the rows a Gantt shows. A Gantt sorted by `start` therefore reads its WBS column out of sequence. A Gantt that filters half the tree reads it with gaps. Both are correct: order is the Dataset's, sort and filter are the Gantt's (D-S4-28). `wbs({ code })` replaces how a code is built, and `wbs({ compare })` how codes order. The column's header, width and alignment stay on the Gantt's `gridColumns`, like every other Field's.
_Deliberate vocabulary exception (ADR 0003)_: "work breakdown structure" is the PM word this glossary otherwise keeps out of core. A shift roster has no work to break down. It stays because it is the term every reader arrives with, and because it names the only such concept here. A neutral synonym would cost recognition and buy nothing. The exception covers this word alone.
_Avoid_: outline number, outline code (rejected synonyms — one name per concept), WBS code (reserved for the frozen, consumer-authored code this is not), id (a WBS changes on a move; an identity does not)

### Mutation

**Transaction**:
The unit of mutation: a batch of proposed edits that runs the extension hook once and commits as one ChangeSet. One transaction per user gesture, at commit — never per intermediate drag frame. A nested `transaction()` call joins the already-open one and returns its own body's value without committing a second time; only the outermost call runs the commit sequence. Inside an open transaction, `get`/`has`/`size` read through the Write set, and every Entry they hand back reads it too (ADR 0017), so a body can read its own not-yet-committed edits (read-your-own-writes) — `all` stays committed-only, since it is the cached Snapshot.
_Avoid_: Batch, operation

**ChangeSet**:
The single, atomic record of everything one transaction changed — added/removed/updated entities across stores, tagged with an `origin` (`'user' | 'undo' | 'redo' | 'load' | 'sync'`; `'engine'` arrives with its own producer). Every mutation produces exactly one ChangeSet, even when the extension hook's installed scheduling plugin triggers cascades. Folding is net-effect: a field written more than once inside one transaction appears at most once, `from` its pre-transaction value and `to` its final one; a field set back to its starting value, or an add immediately followed by a remove of the same id with no committed row ever behind it, is folded away entirely and never recorded. A remove then a re-add of an id that existed before the transaction records both rows, a replace — undo needs the old row back, not its absence. An empty ChangeSet — nothing left after folding — commits nothing, emits neither `beforeChange` nor `change`, and pushes no history entry; `syncAll` and `syncChanges` (#517, #527) lean on exactly this rule, since a call that already matches the store folds to nothing (see **Sync**). **One exception:** an `origin: 'load'` ChangeSet commits even when `added`/`removed`/`updated` are all empty — `entries.load([])` on an already-empty Dataset still moves the baseline, because History must still clear (see **Load**). While `beforeChange`/`change` are fanning out, the built ChangeSet is frozen (dev-mode assert) and no mutation may run — `MutationDuringNotificationError` catches a handler that tries.
_Avoid_: Diff; Transaction (the scope that produces one); Commit (the act that produces one, and S1.8's `gridWidth` sequence, which produces none) — ADR 0006

**Origin**:
The tag on a ChangeSet naming why the transaction ran (`'user' | 'undo' | 'redo' | 'load' | 'sync'`; `'engine'` lands with its own producer). Read by the undo History to decide what it does — a `'user'`-origin commit is undoable, a `'sync'`-origin one records no step and erases no Redo (see **Sync**), an `'undo'`/`'redo'`-origin one moves the History's cursor instead of pushing a new entry, and a `'load'`-origin one **clears** the stack (see **Load**). `'load'` was first reserved (S2) for the withdrawn `apply` door's skipped-write meaning (D-S2-11); #496 took the word for `entries.load()` instead, a different meaning — if `apply` ever returns, its origin needs its own word.
_Avoid_: Source (row source already owns that word), reason, cause

**History**:
The undo/redo stack (`data/history.ts`) — a subscriber to `change`, not a step in the commit path: it records a `'user'`-origin ChangeSet, records nothing and moves no cursor on a `'sync'`-origin one (see **Sync**), moves its cursor rather than recording on an `'undo'`/`'redo'`-origin one, and empties the stack on a `'load'`-origin one (`canUndo`/`canRedo` both read `false` right after). `undo()` replays the step at the cursor inverted (`to`→`from`, `added`↔`removed`), writing onto the store's current values rather than the ones recorded — a sync since the step was recorded can leave nothing for it to write (a settled value, or a **Foreign write** it keeps), and that step is forgotten in favor of the one before it, in the same call. `redo()` replays the step above the cursor as recorded, with the same forgetting rule. Each replaces the stack entry with what it actually wrote, not the step as first recorded, so a later undo or redo inverts the real landed values — undo then redo is neutral, even across a sync in between. `historyChange` fires when `canUndo` or `canRedo` changes, including after a click that only forgot steps and so fired no `change`. Deleting `data/history.ts` and its one construction line leaves the commit path unchanged, byte for byte (D-S2-23) — a consumer could write this file themselves, using only `on('change')`, `invertChangeSet`, and `replay`.
_Avoid_: Undo stack (names the data structure, not the subscriber that owns it), journal, log — Changeset log is the harness panel that renders a `ChangeSet`, a different thing entirely

**Load**:
`dataset.entries.load(rows)` (#496): a full fresh start for a live Dataset. It replaces every Entry — removes every one the Store holds and adds every input, with no diff and no merge. Each row's Sibling index comes from the list's own order, one counter per group (ADR 0034) — `entries.all` afterward is that tree, walked depth-first, not the flat list order the input named rows in. A child may list before its parent; `load` checks the whole batch first (duplicate id, unknown parent, a loop), so order never throws. It commits one ChangeSet with `origin: 'load'`, even when nothing changed, and History clears on it — the same posture a desktop app takes opening a file. It keeps no per-entry state (Selection, collapse, a plugin's Store row) for an id both the old data and the new list name. Its diffing, undoable counterpart, which keeps per-entry state for a kept id and records no undo step of its own, is **Sync**. `new Dataset({ entries })` checks its own batch the same way, before any plugin runs (ADR 0031).
_Avoid_: Replace, Import (the harness's own verb for the button that calls `load`, not a library concept), Restore (a save-format word; ADR 0016 stands — `load` takes `FlatEntryInput[]`, the same shape the constructor takes)

**Sync**:
Two doors that match a live Dataset to server data by diffing instead of replacing: `dataset.entries.syncAll(rows)` (#517) takes every row, and `dataset.entries.syncChanges(delta)` (#527) takes only the rows a server changed (an **Entry delta**). `syncAll`: an id `rows` omits is removed, a key a kept entry's input omits is cleared, and order comes from list position. `syncChanges`: an id the delta does not name is kept, a key an `upsert` row leaves out is kept, and a kept entry keeps its position unless its row names a `siblingIndex`, in which case it moves; an unknown `upsert` id adds an entry, and `remove` drops each named id with its subtree, ignoring an unknown one. Either way, a Field whose value did not change writes no row, and after the call every declared Field value (Sibling index included) and the tree agree with what a `load` of the same target list would leave — only History and per-entry state differ.

Both write through the door `load` uses (ignores a `'never'` Field lock, a derived parent cell re-rolls, no `EditExtender` cascade runs), and both commit one ChangeSet with `origin: 'sync'` — a server refresh is not the user's own edit, so neither records an undo step nor erases Redo; the user's own earlier steps stay undoable across any number of polls. A call that changes nothing commits nothing — no `beforeChange`, no `change`, no undo step — the common case for a poll that finds nothing new. A kept id keeps its Map slot, so its selection, collapse state and plugin store rows survive; a removed id loses them, and an undo brings a removed id's store rows back with it. A local edit the server has not seen is overwritten, last write wins; undoing that edit later keeps the server's value, because the sync's value is a **Foreign write** (`docs/11-server-data.md`).
_Avoid_: Refresh, Merge, Reconcile, Apply (the withdrawn `apply` door's reserved word)

**Entry delta**:
`{ upsert, remove }` (#527), the shape `dataset.entries.syncChanges()` takes: rows a server changed or added, and ids it removed. An `upsert` row for a known id is a partial edit — an omitted key keeps its value, and `undefined` clears it, the same as `update()`. An `upsert` row for an unknown id adds an entry, read the way `add()` reads one. `remove` drops each id with its subtree; an unknown id is ignored, so a retried delta is safe to apply again. An id in both lists throws `DuplicateEntryIdError`. See **Sync**.
_Avoid_: Patch (a pipeline word), Diff (a ChangeSet word), Changes (ChangeSet's lists), Partial

**Replay**:
Writing a recorded ChangeSet onto the store's current values, through `Dataset.replay(changeSet)` — no extension hook, so an engine whose behaviour changes between library versions cannot rewrite History. It re-rolls every parent it touches, construction shape, so a rolled-up cell stays sound after a foreign write moved a child since the step was recorded; the Rollup writes nothing when no foreign write happened. A row a sync has already settled writes nothing for it, and an entry with a **Foreign write** keeps its current values unless the caller passes `overwriteForeignWrites: true`; the rest of the changeset still lands. `changeSet.origin` must be `'undo'` or `'redo'`; `'user'` throws `InvalidReplayOriginError`. `undo()`/`redo()` are built on this; a consumer History uses the same door (`plans/s2-data-core/s2b-undo-replay-seam.md`).
_Avoid_: Apply (the withdrawn conflict-detecting write door's own job, D-S2-11, not open yet), Commit (the transaction's moment, ADR 0006)

**Foreign write**:
A Field value that changed after an undo step recorded it — through a sync, or any commit the replaying History did not record. Replay judges it by value, not by origin: a Field is a foreign write when its current value is neither the step's recorded value nor the value the replay would write. By default, a replay keeps the current values of every Field of that entry, so a step never lands half of a `start`/`end` pair; `dataset.replay(changeSet, { overwriteForeignWrites: true })` writes over it instead. `siblingIndex` and plugin store rows are never foreign writes (#549).
_Avoid_: Conflict (a scheduling Diagnostic and the `conflict` bar flag already own that word)

**Write set**:
The open Transaction's in-progress `{ before, after }` record per touched field, kept separate from the Store's committed indexes until commit. `get`/`has`/`size` read through it, and so does every Entry they hand back (read-your-own-writes, ADR 0017); `all` does not. Discarding it — on a thrown body or a `beforeChange` veto — is the whole of rollback; there is no undo-engine involved in an in-flight transaction.
_Avoid_: Draft (gesture-state prose, not this — see **Draft** under "Direct manipulation"), staging area, buffer

**Veto**:
A `beforeChange` handler returning `false`, refusing the whole ChangeSet before it commits. Fires after the extension hook and the Rollup, on the ChangeSet that would actually be written, and before the Store write — so a handler judges the real cascade-inclusive change and a refusal is an early return, never an undo of work already applied. Synchronous only, unlike gesture vetoes: a data commit has nothing to suspend an `await` into. A vetoed programmatic call (e.g. `entries.update()`) throws `MutationCancelledError` carrying the refused ChangeSet; a vetoed gesture stays silent, the way `beforeGridWidthChange` already behaves.
_Avoid_: Cancel, reject, block (the codebase's one word for this is Veto — ADR 0006)

**Subscription**:
A held registration on a Dataset or Gantt event, created with `on` and released with `off` — the same pair on both objects (plans/02 §3). `data/` owns the Dataset bus; `layout/`'s Bound value is a different mechanism. `view/dataset-change-subscription.ts`'s `subscribeToDatasetChanges` is the one built-in reaction: it calls `dataset.on('change', …)`, pushes the fresh `entries.all` snapshot into the bound viewport, and requests a frame — using nothing a consumer could not use (D-S2-20, D-S2-24). Its handle's `unsubscribe()` is that helper's own word for calling `off`.
_Avoid_: Attachment (that wires a DOM element; this touches no DOM), Binding (that is `layout/viewport/`'s word for a Gantt's own data contribution to a shared model)

**Edit**:
A value a caller passes to change stored data. It is not a control a user types into — that is the Cell editor. `EntryEdit` is what an app author passes to `entries.update()` — flat Field keys, no `props:` wrapper (ADR 0011). `add()` takes the same flat shape and refuses nested `props:`. `PropsEdit` is the nested bag on constructor `entries` (passengers) and on a complete `ProposedEdit`. `ProposedEdit` is the complete read shape a plugin author gets off `EditRequest.proposed`; it is branded so a spread is a type error. An app author meets `EntryEdit` and never `ProposedEdit` (`plans/02`, two callers, two surfaces).
_Avoid_: Editor (that is the Cell editor, a control over one Grid cell), Patch (see EntryEdit)

**EntryEdit**, **EntryEdits**:
The **write** shape. An `EntryEdit` is what a caller passes to `dataset.entries.update(id, edit)` — dates loose (`InstantInput`), Field keys beside core keys, no `id`. `EntryEdits` is a batch of them keyed by Entry: `ReadonlyMap<EntryId, EntryEdit>`. An `EditExtender` returns one, `mergeEntryEdits` composes two, and `moveEntryTo` builds a single value of one. **A plugin author names no other type to write a cascade** (#209): the extension hook writes exactly what `update()` takes, and core does the rest — the dataset's zone resolves the dates, a date-only `end` always means "through that day", and core derives both `proposedKeys` and the envelope. An extender that hand-builds a storage-shaped literal is an API gap, not a style choice.
_Avoid_: Patch, FieldPatch (retired 2026-08-27 — `data/` diffs an edit against the store into `FieldUpdated` rows itself, rather than asking every producer of edits to compute a diff)

**ProposedEdit**, **ProposedEdits**:
The **read** shape: the same edit after core read it, with every date an `Instant`, a complete `props`, and `proposedKeys` stated. The whole type is branded so `{ ...proposed }` is not an `EntryEdit` (ADR 0011 decision 22). `ProposedEdits` is the map of them. A plugin author reads these off `EditRequest.proposed` and never builds one; core builds them. A Draft (`layout/gesture-draft.ts`) and `entries.pendingEdits()` hold `ProposedEdits` for the same reason: they feed the `TimeScale`, which takes an `Instant`.

**EditRequest**:
What a transaction hands the extension hook, once per transaction: the current entries, the caller's proposed edits, and a lookup for post-body state (`{ entries, proposed, entryAfterEdits }`). `entries` is a `Map`, keyed by `EntryId`, not an array — `EntryStore` already keeps one internally — and it stays the pre-transaction snapshot, so a cascade can still read it to compute a delta. `entryAfterEdits(id)` answers what `id` looks like once this transaction's own body edits land, which is the state a cascade is actually reconciled against (D-S5-45); it is a per-id lookup, not a second map, because the drag preview calls it every rAF frame and must not copy the dataset to answer it (I5).

**EditExtender**:
The function type that may occupy the extension hook: `(request: EditRequest) => EntryEdits`. Returns extra writes only — the same shape the caller's own edit takes, not a wrapped or partial record of it. `data/` holds exactly one, calls it once per transaction, and defaults to `identityExtender`, which returns an empty `EntryEdits`. Its writes go in through the same reading `entries.update()` gets, so a Field no Dataset declares is refused (`UnknownFieldError`), a direct `start`/`end` write against a rolling-up parent is refused (`DerivedFieldNotWritableError`, ADR 0013), and `moveEntryTo` is what a cascade writes instead — the same refusal whether the parent draws its children as Segments or not, because `data/` never reads `childrenAsSegments` (#421). **One write is dropped in silence: a cascade onto an Entry this same transaction adds.** `diffEdit` finds no base Entry for that id in the committed store, so the cascade produces no changeset rows and the author gets no error. Ruled deferred to S7, tracked as #235 — a known hole, not an oversight to rediscover.
_Avoid_: ProposalResolver (superseded); EditAdjustment/`{ patch }` (retired 2026-08-27, along with `FieldPatch` — see EntryEdits. Chosen for a plain, usable API now over matching a scheduling-plugin contract that has not been designed yet; S7 makes its own return-shape call when it exists)

### Scheduling

**Extension hook**:
The generic, synchronous hook `data/` calls once per transaction, letting one installed extender add extra field writes to the proposed edit (D4, `plans/01` §1) — adding nothing when no scheduling plugin is installed, or whatever the installed plugin's `schedule()` returns otherwise. `data/` has no static, scheduling-specific dependency; this hook is the only seam. Exact contract (where per-plugin per-entry data lives, how preview and commit-time calls share one resolution) is design work tracked in issue #12.
_Avoid_: Scheduling hook (the hook itself is scheduling-agnostic — it's generic, and a non-scheduling plugin could occupy it)

**Scheduling plugin**:
Whatever plugin occupies the extension hook, if any. FreeGantt ships an official propagation-and-calendar engine as its first-party default (D3) — described in §7 below. It `requires` and reads the `entryDependencies()` plugin rather than owning `Dependency` data itself (S5.0 grill, issue #111) — the two ship as separate plugins so a consumer can keep FreeGantt's arrows and swap in their own engine. Core does not require either plugin to function (D4, ADR 0002).
_Avoid_: The scheduling engine (ambiguous between "the seam" and "FreeGantt's default implementation of it" — say "the extension hook" or "the default scheduling plugin" explicitly); calling this plugin the owner of `Dependency` (see `entryDependencies()`)

**SchedulingPolicy**:
The pluggable seam, within the default scheduling plugin, that resolves how a proposed edit interacts with an Entry's existing schedule (e.g. whether the engine may move it). Parent dates come from the Rollup in core, not from this policy. Semantics that are not structure live in the policy, never in the engine itself.
_Avoid_: Rule, constraint (Diagnostics, not policy, is where constraint violations surface)

**Diagnostic**:
A non-authoritative report the scheduling engine attaches to a `ScheduleResult` when it cannot satisfy a request (e.g. a dependency cycle, naming the Entry ids involved). The engine never silently rewrites what the user asked for — a conflict becomes a Diagnostic, not a mutation.
_Avoid_: Error, warning

**Pinned**:
A whole-Entry boolean state, set by the user, that tells the scheduling engine never to move that Entry — an upstream change that would otherwise push it instead produces a Diagnostic reporting what the engine _would_ have done. It lives in the default scheduling plugin's own per-entry storage (exact contract tracked in issue #12), not on `Entry`/`model/`, the same way `Dependency` does — a Dataset with no scheduling plugin installed has no notion of "pinned" at all.
_Avoid_: Locked, frozen, fixed

**Progress**:
How complete an Entry is, as a fraction `0..1`. Scheduling-plugin data, not a core Field and not a key on `Entry` (ADR 0008) — a Dataset with no scheduling plugin installed has no Progress, the same way it has no pin flag. The plugin declares it as a Field and may roll it up with `weightedMeanByDuration`.
_Avoid_: Percent complete as a core Entry key, treating Progress as shipped with `name`/`start`/`end`

**Working calendar**, **Constraint**, **Resource** / **Assignment**, **Baseline**:
Reserved, not yet implemented — named seams for later slices (`plans/01` §4). `Working calendar` (which days/hours count as workable), `Constraint` (date restrictions, defined by `SchedulingPolicy`'s own vocabulary), `Resource`/`Assignment` (staffing), and `Baseline` (schedule snapshots) all belong to the default scheduling plugin's domain, not `model/` — like `Dependency` and the pin flag (ADR 0002), a Dataset with no scheduling plugin installed has none of these.
_Avoid_: Calendar alone (ambiguous with a UI date picker or an imported ICS calendar — the qualifier is load-bearing)

### Derived layout

**Row plan**:
The internal list `resolveRows` produces before placement — `PlannedRow` values with `entryIds`, tree `depth`, collapse flags, and filter `matched`. Not public: consumers use `RowSource` and receive derived `Row`s in the frame. `CustomRow` is the public DTO for `{ source: 'custom' }`.
_Avoid_: PlannedRow as a glossary term (internal only), Row model (Row is what the frame carries after placement)

**Row**:
A horizontal track of a Gantt — the unit of vertical layout, and what the grid pane and the timeline pane both position against. Rows are derived on every layout pass and never persisted. A Row is not an Entry: one Row may carry the Bars of many Entries, and a row source may produce Rows that correspond to no Entry at all. `Row.kind: 'header'` is a grouping header that stands for no Entry (`entryIds` is empty). A parent Entry and a leaf Entry both produce a row of `Row.kind: 'entry'`. Collapse holds `RowId`s; for the entries source a `RowId` equals the `EntryId`. A grouping header uses a derived `RowId` from the group key. Its name cell is `headerLabel`; other cells are empty. Every Bar on a Row draws at the same vertical band, centred in the row (`singleLane`, D-S4-19) — Lane and Lane packing are retired (#298): the only row-packing behavior there ever was is the one every row already has.
_Avoid_: Line, track, record; reading `Row.kind: 'header'` as "a parent Entry"; using `'group'` as a Row kind (that literal is gone with `Entry.kind`); Lane, Lane packing, `heightMode: 'pack'` (retired, #298 — see above)

**Row source**:
The configuration that decides what the Rows are for a given Gantt — the Entries themselves (optionally as a tree), one Row per value of some grouping function, or a consumer-supplied resolver. Live on `gantt.rowSource` (and `GanttOptions.rowSource` at construction). Alternative views (workload, resources) are new row sources, not new rendering or interaction code. `{ source: 'custom', resolve }` returns `CustomRow` values (`id`, optional `entryIds`, optional `label`). Core adapts those to the internal row plan. This `custom` is the row-source occupant, not a custom ViewPreset object. `filter`, `sort`, and `filterPolicy` live here — never on the Store (D-S4-28).
_Avoid_: Row provider, row model; treating `PlannedRow` as public

**Custom row**:
One row a `{ source: 'custom', resolve }` resolver returns — `id`, optional `entryIds`, optional `label`. Core maps it to a `PlannedRow` and then a frame `Row`. Not an Entry. The resolver receives `CustomRowInput` (`{ entries }`).
_Avoid_: Custom RowSource (that is the config object; Custom row is one resolved row); `RowResolveInput` (retired — that name collided with the internal row pass input)

**Row filter**:
A predicate on `Entry` attached to a row source (`RowFilter`). Filtered-out children still count toward a parent's rollup; filter only affects which rows resolve (D-S4-11, D-S4-29).
_Avoid_: Dataset filter, store filter (sort and filter never touch `entries.all`)

**Row sort**:
Per-parent ordering on a row source (`RowSort`). `field` names a declared Field; comparers bind from `fieldCompares`, not from visible `gridColumns` (D-S4-13, D-S4-28).
_Avoid_: Column sort (sort is field-driven, not column-driven)

**Bar**:
A derived, renderable piece of geometry produced from an Entry — core's own producers draw exactly one Bar per Entry, over its whole span. Bars are recomputed on every layout pass and never persisted. `Bar.id` is deterministic (`barId(entry, partIndex)`, `model/ids.ts`), frame identity recomputed fresh on every layout pass, not a stored id. Renamed from Item in #421 C6 (ADR 0026) — read every historical "Item" as "Bar". A row that draws more than one Bar draws **Segments** (see Segment) — the commonest case is a segmented parent, whose children draw their own Bars on the parent's own row (`childrenAsSegments`, #421), each an ordinary Bar for its own child Entry. Nothing in the data distinguishes one of those Bars from a Bar on a row of its own; `FrameBar.entryId` names the Entry either way, and `FrameLayoutView.entryIdsForRow` is the one surface that answers "which Entries does this row own", segmented row included. **A Bar's boundaries come from the data, never from the visible axis**: its `start` and `end` are the Entry's own dates, and the `TimeScale` only maps those two Instants to pixels. Zoom, scroll and the viewport change where a Bar is drawn and how wide it looks, never what it spans — which is why the printed value and the row total read the same at day, week and year zoom (#421 box 19).
_Avoid_: Item (retired in #421 C6, ADR 0026 — the word collided with a generic word every consumer's own code already used for its own arrays), `segmentId`/`segmentIdsForBar`/`segmentIdsForRow` (retired in #421 C6 with the type they named — a Segment is a reading of a Bar, and `Bar.id` names it)

**Bar producer**:
The per-Entry seam that turns one Entry into its Bar(s) for a row (`BarProducer`). Core keys on structure: a parent (has children) or a leaf. A plugin that needs another look does not register against a stored `kind` — there is none (ADR 0013). `wholeEntryBar(entry)` is the public helper for the common case — one Bar over the entry's whole span — so a producer reads `(entry) => [wholeEntryBar(entry)]`. `wholeSpanUnlessSegments` is core's own producer for a parent: it returns `wholeEntryBar(entry)`'s one Bar when the row source has not matched the parent, and `[]` when it has (`childrenAsSegments`, #421 Q26/Q38) — a segmented parent draws no bar of its own unless a consumer's own producer says otherwise.
_Avoid_: Item producer (retired in #421 C6, ADR 0026), Item emitter (retired name — `registerItemEmitter` was renamed to `registerItemProducer`, Q16, itself retired by the Bar rename), `ignoreSegments`/`wholeSpan` (retired names for `wholeSpanUnlessSegments`, Q38), `unclaimedSpan` (retired in the `claims` rename — "unclaimed" named a hold nothing takes)

**Grouping**:
The row-level nesting of the timeline grid (parent/child rows via `parentId`). Distinct from a parent Entry (an Entry that has children). A grouping header is `Row.kind: 'header'` and stands for no Entry (`entryIds` empty, `headerLabel` in column 0, other cells blank — D-S4-23).
_Avoid_: Group (say "row grouping" or "a parent Entry"); reading `Row.kind: 'header'` as a parent Entry

**Rollup**:
The bottom-up pass in the commit path that derives a parent's value for a Field from its children's, using that Field's Aggregator. It is a core step, not a resolver: it runs whether or not a plugin is installed, and nothing installable can displace it (D-S2-22). It is a leaf with one importer (`data/transaction.ts`). Default is on. An Entry derives when it has children (ADR 0013) — a segmented parent (`childrenAsSegments`, #421) is an ordinary rolling-up parent to this pass; `data/` has no notion of a segmented row, so nothing here changes for one. `rollUpKinds` is deleted. A Field with `rollUp: 'none'` or with no `rollUp` skips that Field only. The pass walks the ancestor chains of touched entries only, deepest first (D-S4-8) — one path for shipped and consumer Aggregators alike. It owns every rolling-up Field of a parent, in a transaction or not: once an entry has children by commit, the pass wins over a field the transaction body proposed and over one the extension hook proposed alike, and reports the drop once per commit. An entry that loses its last child in the same transaction keeps the body's write instead — the field is an ordinary cell again by then. One pass settles nested parents, because the walk is bottom-up. The **Span rollup** is `start` as `min` and `end` as `max` over the children — not `sum` of Instants. A direct `start`/`end` write on a rolling-up parent is refused (`DerivedFieldNotWritableError`) — its span is never its own to set. A `RollUpContext`'s `children(row)`/`descendants(row)`/`leaves(row)` answer about any row the pass hands out, per **Child / Descendant / Leaf**.
_Avoid_: Group rollup (the pass is not tied to a stored kind, nor to spans — it is per Field, over any parent), rollup pass (says "when," not "what"), aggregation (Aggregator is the function; Rollup is the pass)

**Grid column**:
One vertical slice of the grid pane. A Grid column names a Field. `Field.column` is optional defaults for the bare-key shorthand. A column object supplies presentation — header, width, alignment, cell renderer, editability. A Field with no `column` defaults still rolls up and still appears in the changeset. A bare key with no defaults throws `FieldColumnNotDefinedError`. Grid columns belong to the Gantt (`gridColumns`), because which Fields this view shows, and in what order, is a view question. Aggregation never lives on a Grid column: a stored value must not depend on whether a column is visible, and the Rollup has already run before any Gantt is built. Default `gridColumns` is `['name']`; naming a Field does not add it to the grid by itself. A dateless row cannot be dated through that default: ship `start` in the default columns, or a timeline date gesture, with the first user-facing cut (ADR 0012). Plugin Field keys in `gridColumns` carry their prefix (`scheduling:progress`, ADR 0008). A cell renderer receives both readings of one cell: `value`, the string the library painted through the Field's own `formatValue`, and `fieldValue`, the same Field value before formatting (review H3) — so a renderer branches on the number and never parses its own output back. `fieldValue` is what `entry.read(field)` answers. Core ships two column renderers: `meter()` paints a percent as a track plus the Field's formatted text, and `image()` paints a stored URL as an img. Both take `()` like `diamond()`. `columnRenderer` stays on the Gantt column, never on the Field. Column `tooltip` defaults `false`. `tooltip: true` on an image column shows the stored URL unless the Field's `formatValue` returns a caption.
A **hidden** Grid column is declared but not painted (D-S5-34): `hidden: true` keeps it in `gridColumns`, keeps its width and keeps its place in the order, and takes it out of the grid, the pane width and `resolvedColumns`. `gantt.hideGridColumn(field)` and `gantt.showGridColumn(field)` write that one key, so hiding one column never restates the list and never drops what the user set on the others.
**A Field has a `key`; a Grid column carries the `field` it shows** (D-S5-37, #194). One name, on every surface a column reaches: `gridColumns`, the `gridColumnsChange` payload, `ctx.view.resolvedColumns()`, a renderer's `ctx.column.field`, and `CommandTarget.field`/`DomTarget.field`. `render/dom`'s own keyed-children key (`CellItem.key`) is a paint key, a different job with its own word.
_Avoid_: Column on its own (says nothing about which side it is on), Field (a Grid column names one, it is not one), Cell on its own (see **Cell** below — say Grid cell), invisible/collapsed for a hidden column (Visible is the culled region, and Collapse is the row tree's own state), `column.key` / `columnKey` for a column's identity (retired in #194 — the name is `field`)

**Cell**:
One Row's value at one position of a pane's own axis. The Grid pane's axis is its columns, so a **Grid cell** is one Row by one Grid column. Bare `cell` names no type, no key and no string literal (#411): the renderer point is `'gridCell'`, the `TargetKind` is `'gridCell'`, and `FrameRow.gridCells` holds the Grid pane's formatted strings.

**There is no Timeline cell.** The word named one Row by one Tick, for a design the author withdrew (#401, closed 2026-09-16). Nothing in the Timeline pane is addressed by a Tick. **A row of boxes is its Bars**, drawn at the span the data states (#421), so the Timeline pane's unit is the Bar and the Grid pane's is the cell.
_Avoid_: cell on its own in a type, a config key or a literal; Timeline cell, Bucket, Tile or Tick cell for anything the Timeline pane draws

**Column renderer**:
What one Grid column paints its own cells with (`ColumnRenderer`, `GridColumn.columnRenderer`). Declared once per column, so it needs no `column` or `row` argument. Distinct from the **Grid cell renderer** (`GridCellRenderer`, `GanttOptions.gridCellRenderer`, renderer point `'gridCell'`), which is Gantt-wide and receives both. A per-column renderer wins over the Gantt-wide one for its own column. Core ships two Column renderers: `meter()` and `image()`, both taking `()` like `diamond()`.
_Avoid_: `cellRenderer` / `CellRenderer` (retired — the per-column one is `columnRenderer`, the Gantt-wide one is `gridCellRenderer`), `meterCell()` / `imageCell()` (retired — `meter()` / `image()`)

**Column helper**:
What `createGridColumnHelper(dataset)` returns. Its `column(field, options)` writes a Grid column and types the Column renderer's `fieldValue` from that key, the same type `entry.read(field)` answers. It is optional: `column()` returns the plain column object, and a plain column object reads `fieldValue` as `unknown`. It knows the core keys and the Dataset's props keys. A plugin key or an undeclared computed key takes a plain column object.
_Avoid_: column builder (it holds no state and builds nothing up), column factory

**Variant**:
How one row is drawn, and what may be done to it — one object, one name, installed on a Gantt (ADR 0018). `EntryVariant` answers four questions about a row in one place: `when` says which rows wear it, `items` what shape it draws, `paint` how it looks, and `capabilities` what you can do to it — `can` is a Capability table, one level under the consumer's own `capabilities` and one over the library rule, never a second door that competes with it (see **Capability**). **A Variant is a rule, and nothing stores one.** It resolves per Gantt on every layout pass, so two Gantts on one Dataset may draw the same row differently (I2), and the Entry carries no classification of its own (ADR 0013). `when` takes a field match (`{ milestone: true }` — equality per Field, AND across keys, never "has a value") or a predicate (`(entry) => entry.read('duration')?.value === 0`). An app author installs one through `GanttOptions.variants`; a plugin installs the same object through `ctx.variants.add(variant)` — one type, two doors. The name is an identity, not a value: it keys the registry, `render/dom` stamps it as `data-variant`, and a command's `when` reads it off the command context. Resolution walks three ranks, newest-first inside each — the consumer's own, then every plugin's, then core's `summary` and `leaf` — and stops at the first rule that matches (`registration.matches(entry)`, `layout/bars/variants.ts`). Two rules of one rank that both match one row raise `'variant-matched-twice'`: the newest paints and the other is named, because core never arbitrates between plugins a consumer chose. Core registers first, so it is the floor every rule overrides; `leaf` carries no `when`, so every row resolves. To pin one named row, write the data: declare a Field, `update(id, { milestone: true })`, and let `when` read it back. A Variant's `paint` names the rows it covers, so it answers before `barRenderer`, which is the catch-all for every bar no Variant paints.
_Avoid_: Look (retired with `EntryLook`, ADR 0018), Kind (retired, ADR 0013), a stored Variant, a reserved Variant name, `data-kind`

**GeometryFrame**:
The complete, backend-neutral description of one rendered state: the visible Rows, the Bars' boxes, the Dependency paths, and decorations, all as plain numbers. It is what a render backend consumes and the only thing it consumes — no consumer render output, no hit-region index, no DOM.
_Avoid_: Scene, render tree, viewport model

### Mounted instances

**Consumer**:
The application or page that embeds FreeGantt and calls its public API — the audience meant whenever CONTEXT.md or a spec says what "a consumer" does, wants, or authors (an Entry, a stylesheet override, a plugin). Distinct from Container, the DOM element that consumer's page hands to a Gantt to mount into.
_Avoid_: Host (retired, #64 — the word named both this and Container, #7's "chart" failure repeated)

**Container**:
The DOM element (or a CSS selector naming one) a consumer hands to `new Gantt({ container })` to mount into — `GanttOptions.container`, `resolveContainer()`, `.fg-container`. One Gantt owns exactly one Container for its lifetime.
_Avoid_: Host (retired, see Consumer), Mount target (a Render surface — a different, lower-level concept the Container is split into, see Render surface)

**FrameLayout**:
The `layout/` object that runs one Gantt's layout pass (`layout/frame-layout.ts`) and keeps what that pass must remember between renders — the row-height index and `FrameMemory` (per-row item caches). `computeFrame` stays pure; `FrameLayout` is what makes the index O(log n) _across_ renders rather than per render. One instance per Gantt: the index describes that Gantt's rows and is not shareable, unlike a TimeScaleModel or a ScrollAxis.
_Avoid_: Layout cache, frame builder (it computes the pass; the cache is how, not what)

**Frame memory**:
What one `computeFrame` pass remembers when `FrameLayout` calls it again — today the `RowHeightIndex` and per-row produced-item results. Passed as the optional second argument to `computeFrame`; not public (D-S4-19).
_Avoid_: Frame cache as a consumer term (internal lifetime object only)

**Frame settings**:
The `view/` object holding every live setting that says what one Gantt's next frame draws (`view/frame-settings.ts`) — locale, today line, date lines, row source, the four renderer slots, and the four px sizes read from `--fg-*` custom properties. It owns the one invalidation table: what a changed setting costs is a row there, not a rule each `GanttShell` setter re-derives (#167). `toLayoutInput` is where these meet what a frame contributes fresh (entries, scale, viewport geometry, registries). DOM-free — pixels arrive through an injected reader — so the table is a Node unit test.
_Avoid_: Frame plan (Row plan is `resolveRows`'s output, and ADR 0004 retired "Plan"; one word, two meanings is #7), Frame options (options are what a constructor takes; these stay live for the Gantt's life)

**Gantt**:
The public entry point and a whole mounted instance: one `Gantt` wraps one `container` element, one Dataset, and everything needed to render and interact with it. This is the sense used everywhere the specs discuss the product as a whole — D9's "multi-Gantt sync", I2's "two Gantt instances coexist independently", a consumer page that mounts "two Gantts". A `Gantt` _is_ the class; it is also the name of the concept, so `new Gantt(...)` and "a Gantt" mean the same thing.
_Avoid_: Chart (see #7 — "chart" used to name both this and `GanttShell`, ambiguously, and is retired from the codebase entirely)

**GanttShell**:
The internal `view/` class a `Gantt` constructs and owns: the composition root that wires the Pane layout, the render backend, and the viewport attachments together (plans/01 §8.2-8.3, S1.8, "the chart shell" in older text). Never public — `exports` is sealed to `api/` and `model/`. A `Gantt` is a thin façade over one `GanttShell`; the shell _composes_ the Grid pane / Timeline pane / Splitter split, `PaneLayout` _holds_ it.
_Avoid_: Chart, ChartShell (rejected in #7 — "shell" alone doesn't say what it's a shell _of_; `GanttShell` reads correctly even far from its definition)

**Shell wiring**:
What `api/gantt.ts` hands a `GanttShell` across the layer boundary — `GanttShellOptions.wiring`, one required member holding seven seams (`entryGestures`, `keyboardEditing`, `columnGestures`, `commitEntryEdits`, `buildPluginContext`, `buildCommandContext`, `now`). Every one of them is a collaborator `view/` may not construct for itself: `interaction/` sits above `view/`, and so do the api `Dataset` and the public `Gantt` façade (D-S5-5). Each member stays optional inside `wiring`, so a test drives the shell with nothing wired by writing `wiring: {}` once. Added in 2026-09-04's review (P5): the seven seams sat loose among real configuration, each carrying its own "omitted only by tests" comment, and the contract "`api/gantt.ts` always supplies these" was nowhere in the type.
_Avoid_: Options, config (a `Gantt`'s own configuration is the rest of `GanttShellOptions` — `theme`, `locale`, `gridColumns`), dependencies (that word is the npm sense in `plans/04` §1 and the scheduling sense in `Dependency`), Ports (a `*Ports` interface is what a module borrows _from_ the shell; wiring is what the shell is _given_)

**Pane layout**:
The DOM skeleton one Gantt's container is split into: a Grid pane, a Splitter, and a Timeline pane, built and owned by `view/pane-layout.ts`'s `PaneLayout` class (plans/01 §8.3, S1.8). Structure and its own numbers only — Grid width and, since #126, the grid pane's content width (`contentWidth`, driving its horizontal scroller) — no geometry, no scale, no data, no frame, no events. `GanttShell` composes a Pane layout; it does not build panes itself.
_Avoid_: Layout (Layout, unqualified, is the `layout/` source directory and its pure geometry types — a different concept)

**Grid pane**:
The left-hand pane of a Pane layout: row labels and, from S4, Field-driven columns (`gridColumns`). It has no scrollbar of its own — its row layer follows the Timeline pane's native scroll by one `translateY` transform per frame instead of a second real scroller (D-S1.8-1), which is what keeps I9's pixel identity structural rather than something a caller maintains by hand.
_Avoid_: Label column, gutter (gutter was the pre-S1.8 shape, where the row-label width lived inside the render backend's paint layer instead of being a pane in its own right — D-S1.8-2 retired it)

**Timeline pane**:
The right-hand pane of a Pane layout and the single native scroller for both axes (D-D, D-S1.8-1): header bands, bars, links, and decorations all mount inside it. `attachScroll` and `attachPaneSize` both bind to this element, never to the container or the Grid pane.
_Avoid_: Chart area, canvas (canvas reads as the future canvas render backend, a different concept)

**Splitter**:
The draggable boundary between the Grid pane and the Timeline pane (`view/splitter.ts`'s `attachSplitter`). A pointer drag previews a candidate Grid width live and proposes the final value on release; it writes no state of its own; `GanttShell` decides whether a proposal becomes the committed Grid width.
_Avoid_: Resizer, drag handle (both describe the affordance, not the domain concept a consumer or reviewer needs to name)

**Grid width**:
The Grid pane's width in px — the one number `PaneLayout` owns and the one thing a Splitter drag changes. Public as `gantt.gridWidth`, with the cancelable `beforeGridWidthChange`/`gridWidthChange` pair (S1.8). Spelled two ways on purpose: `gridWidth` in code, where the object it hangs off disambiguates, but `--fg-grid-pane-width` as a CSS custom property, where there is no object to disambiguate and "grid width" alone would read as gridline spacing among other tick/gridline tokens. Both spellings name the same number.
_Avoid_: Grid pane width in code (too long once `gantt.` already says "grid pane"), gutter width (gutter is retired — see Grid pane)

**Row layer**:
The element the Grid pane's rows live in (`.fg-rows`, `PaneLayout.panes.rows`), and one of the two Mount layers over it (`PluginContext.view.rowLayer`, #158). The Grid pane owns no vertical scrollbar, so this layer follows the Timeline pane's native scroll by one `translateY` per frame (D-S1.8-1), while the pane scrolls horizontally around it (D-S1.8-13). Content presented here travels with the rows on both axes, in the same frame, with no scroll listener of its own — the whole difference from the Overlay, and why the Cell editor and its Refusal notice mount here and a Popup does not. The layer's own rect answers from the layer itself (`rowLayer.bounds`, #168). Beside the rows, never inside one: a row and its cells are `render/dom`'s reconciled DOM.
_Avoid_: Row container, Scroll layer (the layer is not the scroller — the Timeline pane is)

**Render surface**:
One of the two DOM elements (`grid`, `timeline`) a `RenderBackend.mount()` receives (`render/backend.ts`'s `RenderSurfaces<TSurface>`, S1.8). `render/dom` puts the row layer in the grid surface and the header/bar/sizer layers in the timeline surface; `render/null` ignores both. Replaces the pre-S1.8 single-container `mount()`, which reserved the row-label gutter inside the paint layer itself.
_Avoid_: Mount target, Container (Container is the Gantt's own DOM anchor — a different, higher-level concept a Render surface is carved out of)

**Navigation**:
The view-side motion of the timeline — Preset, Fit, Range, Pan, and Anchored zoom. Distinct from a Dataset `change` (data) and from `gridWidthChange` (Grid pane width). One Viewport Batch delivers at most one `navigationChange`. There is no `beforeNavigationChange`: assignment is reconfiguration, not a vetoable gesture (S1.9).
_Avoid_: change (Dataset), viewportChange (Viewport is not public)

**Event bus**:
The `view/event-bus.ts` class (`EventBus<TEvents>`) a `GanttShell` holds privately and `on`/`off` delegate to. `GanttEventMap` is the map: `beforeGridWidthChange` / `gridWidthChange`, and `navigationChange` (S1.12). Not exported from `api/`; a `Gantt`'s `on`/`off` are the only public surface onto it.
_Avoid_: Emitter, dispatcher (both are implementation-neutral; Event bus is this project's term for the specific `GanttShell`-owned instance)

### Time and viewport

**Plain time**:
A reading off a wall clock — year, month, day, hour, minute — with no zone attached, and therefore naming no single point on the timeline until a zone resolves it. The name is Temporal's (`PlainDate`, `PlainDateTime`), which is what `time/` is built on and what it becomes when native `Temporal` ships. Turning a Plain time into an Instant requires a zone and can be ambiguous (a DST fold) or impossible (a DST gap) — resolving those is exactly why `time/` exists.
_Avoid_: Civil time (the standard term of art elsewhere, including Temporal's own spec text and C++'s `<chrono>` — expect to meet it in external docs, but don't use it here), local time (reads as "the machine's zone", which this project never consults), wall time (means elapsed duration in performance contexts)

**Zone-aware date arithmetic**:
Any operation whose answer depends on a zone — the start of a day, the next Monday, how many days lie between two Instants. It is the arithmetic that DST makes non-obvious (a "day" is not always 86,400,000 ms) and it lives exclusively in `time/`, resolved through the Dataset's zone.
_Avoid_: Plain arithmetic (reads as "simple arithmetic" — say "zone-aware" for the operation and "plain" only for the value), date math, civil arithmetic

**Instant**:
An absolute point on the timeline, stored as epoch milliseconds and branded so it cannot be confused with an ordinary number. An Instant carries no zone; every zone-dependent reading of one (what day it falls on, what "add a day" means) resolves through the Dataset's zone.
_Avoid_: Date, timestamp, epoch

**Entry input**:
What a consumer writes where the library stores an Entry: ids as plain strings, dates as any Instant input. `Dataset` reads an Entry input into an Entry once, at construction — branding the ids and resolving the dates through its own zone. The distinction is the whole reason the core can stay strict about branded values without making a consumer construct them: looseness lives at the api/ boundary and nowhere behind it. An Entry is itself a valid Entry input, so a consumer already holding branded values passes them straight through.
_Avoid_: Raw entry, entry DTO, unvalidated entry (nothing here is a validation stage — it is a reading)

**Instant input**:
Any value a consumer may write where an Instant is stored: an Instant, a `Date`, epoch milliseconds, or a string. A string carrying an explicit `Z` or numeric offset is absolute; every other string is a Plain time and resolves through the Dataset's zone. `time/toInstant` is the single place that reading happens.
_Avoid_: Date input, raw date, loose instant

**Date-only end**:
An `end` written as a bare calendar date — `'2026-09-08'`, no time of day. Storage is half-open `[start, end)`, so `end` is the boundary after the entry rather than its last moment, but a consumer writing a bare date always means the last day it wants included: it stores the start of the next day. It applies to nothing else: an end that already carries a time of day is a boundary already. `lastCoveredInstant` reads a stored `end` back as the last moment it covers; `formatInclusiveDate` builds on it. `formatDateTime` shows the stored moment as-is, with clock time.
_Avoid_: Inclusive end, end date (an option named `endDate` should hold a date, not a rule)

**Formatter**:
A function turning one value into display text: `(value, ctx: FormatContext, entry) => string`, declaring only the parameters it reads. Zone and locale come only from `ctx`; a missing value gives `''`, never a throw. No options at the call — a factory builds a tailored one once (`dateFormatter(options)`, `currency({ code })`). A header band callback is a Formatter with no entry (`HeaderFormat`). Every shipped Field `formatValue` is one; `formatFieldValue` is the one path a Field's text takes to the grid, the bar label, and `gantt.formatFieldValue`. The Dataset owns the path (`dataset.formatFieldValue`), and the Dataset can own a locale of its own too; a Gantt's own locale beats it, and either beats the runtime's own.
_Avoid_: renderer (paints an element, not text), format function

**TimeUnit**:
The named grain a Duration or a tick step counts in: `'millisecond' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'`. Spelled out in full — the prior single-letter codes (`'m'` minute vs `'M'` month) collapsed two units onto case alone, a typo trap the review behind issue #84 flagged.
_Avoid_: `'m'`/`'M'`/`'d'`/`'w'`/`'y'`/`'ms'` (the retired short codes)

**TimeScale**:
The pure, DOM-free mapping between Instants and pixel positions, plus tick generation for a given ViewPreset. All time→pixel conversion in the codebase goes through a TimeScale — no inline pixel math.
_Avoid_: Viewport (Viewport is the fan-in object; the region is Visible)

**TimeScaleModel**:
The standalone, shareable object that owns a TimeScale and that a Gantt binds to. Passing the same TimeScaleModel instance to two Gantt instances synchronizes their horizontal axis by construction — the mechanism behind multi-Gantt sync. It is constructed from a `TimeScaleModelOptions`, never from resolved geometry. `bind`/`unbind` are not methods on the published type (issue #84) — `view/` reaches them through an internal, module-private seam, so a caller who constructs a TimeScaleModel to share between two Gantt instances sees only the options and the read side.
_Avoid_: Scale (Scale, unqualified, means the underlying `TimeScale` the model wraps — `TimeScaleModel.scale`)

**TimeScaleModelOptions**:
What a caller states about how time should be displayed to construct a TimeScaleModel — a Preset reference, a Range, and a Fit. This is all a caller ever supplies; the zone (which is the Dataset's, D6), the resolved span, and the pixels-per-millisecond factor are derived at bind time and are not a caller's to state. Named after the constructor call site (`new TimeScaleModel({ preset, range, fit })`), not after the pipeline stage it feeds (issue #84 retired the prior name, `TimeScaleIntent` — a caller states options, not "intent").
_Avoid_: Scale intent, TimeScaleIntent, scale options, scale config (the resolved geometry is the opposite of this)

**Binding**:
One Gantt's _data_ contribution to a shared pure model, supplied when it joins — plus the reaction to run when that model's resolved value changes. A Gantt binds on construction and unbinds on destroy, and both re-resolve the shared model. Binding is the vocabulary of the DOM-free models in `layout/viewport/`; the DOM side of the same seam is an Attachment.
_Avoid_: Attach (reserved for the DOM side), subscribe, register

**Bound value**:
The value a viewport model resolves from every current Binding, together with the contract for telling those bindings about it (`layout/viewport/bound-value.ts`, D-S1.5-4): bind always notifies the newcomer, every other notification fires iff the resolved value changed. One collection serves both jobs — the bindings and their reactions are the same map. TimeScaleModel's is `{timeZone, range, pxPerMs}`; each ScrollAxis's is `{position, max, bindingCount}` — the count is in the resolved value so that an arriving neighbour notifies the panes already bound (#440). Scoped to `layout/viewport/`'s models by decision (`plans/01` §8.2 D-A), not a general notify primitive.
_Avoid_: Observable, signal, store, subscription (those name `data/`'s reactivity, which is a different mechanism with a different owner)

**Scale binding**:
One Gantt's Binding to a TimeScaleModel: its Dataset's zone, its Entries, and its measured Pane size. This is how `'fitDataset'` spans every bound Dataset rather than whichever one was passed to the constructor.

**Attachment**:
A wiring between a DOM element and a pure model, living in `view/` and returned by an `attach*` function with a `detach()` method. An Attachment is the only thing on either side of the seam allowed to touch the element: `attachScroll` owns element scroll (I12), `attachPaneSize` owns measurement, `attachWheelNavigation` and `attachKeyboardNavigation` own the read-only viewport gestures (S3.7). Distinct from a Binding, which carries data and never sees the DOM.
_Avoid_: Binding (that is the pure-model side), adapter, connector

**Pane size**:
The measured drawable box of a pane, measured by `attachPaneSize`, pushed into the models by `view/`, and never stated by a caller. It is a measurement of a rendered box — unrelated to the resize gesture, which drags an Entry's edge.
_Avoid_: Viewport width/size (Viewport is the fan-in object, not a box)

**Viewport**:
The fan-in object (`layout/viewport/viewport.ts`) that owns one TimeScaleModel and two ScrollAxis instances — `x` and `y` — behind a single `bind`/handle/reaction, so `view/` never binds any of them more than once (S1.7, D-S1.7-1). One measurement — a pane resize — fans out through it to the scale's pane width, each axis's own pane size, and Visible's own width/height, coalesced to one consumer notification. Not exported from `api/`; `view/` is its only caller. One Viewport serves one Gantt — it holds that Gantt's pane and content extents, so a second `bind()` throws rather than replacing the reaction. Sharing is what TimeScaleModel and ScrollAxis are for.
_Avoid_: Viewport width/size (that measurement is Pane size), the rendered/visible region (that is Visible)

**Visible**:
The culled region a Viewport resolves, in timeline-content coordinates, from the **locally clamped** scroll position on each axis — this Gantt's own pushed `{content, pane}` extents, not either ScrollAxis's own loosest-bound-across-bindings `max` (D-S1.7-2). Feeds `LayoutInput.visible` directly and is what `attachScroll` writes back to the element.
_Avoid_: Viewport (Viewport is the object that resolves this, not the region itself), culling window (fine in prose as a synonym, but the type and field name are `visible`/`Rect`)

**Overscan**:
The live-reconfigurable culling buffer a Viewport applies before handing `visible` to `computeFrame`: `verticalRows` (through the row-height index, since row heights vary from S5) and `horizontalPx` (bars and header ticks only — rows stay vertical-only). Default `{ verticalRows: 2, horizontalPx: 128 }`; a zero value disables culling on that axis. Not exported from `api/` (issue #84) — an app author doesn't think in these units, and no real caller had asked for the knob; it stays live and internal to `layout/`/`view/` until one does.
_Avoid_: Buffer, padding, margin

**Visible span**:
What **Visible**'s pixels stand for in time — the window the reader has on screen, published as `gantt.visibleSpan` and on `navigationChange`'s payload under that same name (issue #461). Half-open, clamped to the content extent, pixel-derived and never tick-aligned. It **excludes Overscan**, which is what separates it from `DecorationContext.span`: that one is deliberately overscan-widened, because a decoration provider paints into the buffer and a reader does not see it. A zero-width pane, and the moment before the first pane measurement, both answer a degenerate span — no pixels stand for no time.
_Avoid_: Range (Range is the whole scrollable content extent — the confusion that made #459 unaskable), visible range, viewport span (Viewport is the object, and `viewport` was the retired name of Visible), Span on its own (`DecorationContext.span` already holds that word, and the two are different numbers)

**Header band**:
One row of the time-axis header, emitted per `ViewPreset.headers` entry, coarsest first (e.g. months over weeks). Each band carries its own `unit`/`increment` and Ticks; `render/dom` keys bands by index and ticks within a band, so a preset with one header renders one `.fg-band` wrapper.
_Avoid_: Header row (Header band is the term of art; "row" is reserved for grid Rows)

**ScrollAxis**:
The standalone, shareable object owning a scroll position on **one** direction, and the only route by which any view or interaction code may read or write it. A Gantt holds two — `x` and `y` — via `GanttOptions.scroll: { x?, y? }` (`ScrollAxes`); omitting a direction keeps it private. It resolves two things: the **position** — where the caller asked to be — and **max**, the loosest bound any bound Gantt needs, which is what a Pan clamps against. Max is not a claim about any one Gantt's scroller: each bound Gantt clamps the shared position to its own content, so a shorter chart stops at its last row while a taller one keeps going, and picks up where it stopped on the way back. Sharing the same instance as `x` (or `y`) between two Gantts syncs only that direction — the shared unit is one axis, never both at once (D-S6-1). `ScrollModel`, which fused both directions into one object, is retired.
_Avoid_: Scroll position, offset, viewport state, ScrollModel (retired S6, D-S6-1), `xOnly()` / `yOnly()` (withdrawn — a filtered view over a model is not what this is), scroll direction, axis view

**Pan**:
Moving the shared viewport — `ScrollAxis.panTo`, plus the wheel and keyboard viewport gestures that call it (shift+wheel, Page/Home/End, unselected arrows). Public verbs on Gantt are `panToDate` / `panToToday` (loose InstantInput, never `scrollTo*`). One concept at two layers, which is why they share the word. Distinct from **scroll**, which means one element's native offset and is confined to `view/scroll-attachment.ts` (I12): a Pan may result in no scroll at all when the chart is already at its end. `panToInstant` is the Viewport-internal twin that already holds a branded Instant.
_Avoid_: Scroll (an element's native offset), move (move is dragging an Entry — `entryMove`), seek

**Viewport gestures**:
The read-only wheel and keyboard motions that change the Viewport and write nothing to the Dataset: ctrl/⌘+wheel anchored zoom (`zoomIn`/`zoomOut`, one `zoomPresets` step per wheel notch), shift+wheel pan, and keyboard pan (Page/Home/End always; arrows when nothing is selected). They live in `view/` (`attachWheelNavigation`, `attachKeyboardNavigation`), not `interaction/`, and they are exempt from the arm-threshold, escape-cancel, and one-transaction-per-gesture invariants. Live config is `Gantt.viewportGestures` — a boolean shorthand or `{ wheelZoom, wheelPan, keyboardPan }`. The imperative `zoomBy` / `panToDate` / `zoomIn` surface does not consult this flag. Distinct from **Capability** / `capabilities`, which are per-entry and gate data gestures. Continuous density (`zoomBy`) is not a viewport gesture — it is an expert call.
_Avoid_: Navigation (that is the motion itself — Preset, Fit, Range, Pan, Anchored zoom — and the `navigationChange` event), capabilities (per-entry data gestures — a Capability gates a gesture, it does not move the Viewport)

**Reveal**:
Bringing what a named Entry draws into view — the intent-level verb a consumer uses (`gantt.reveal(entryId)`, #295). The `Segment` type retired (ADR 0026, #421): `reveal` takes only an `EntryId | string` now, so there is one id kind to resolve, not two. The target is painted, not authored (#295): an `EntryId` reveals every bar or marker that Entry paints right now, as one rectangle, so a `diamond()` row reveals its true glyph width and a segmented parent reveals every one of its children's bars. A summary paints one bar over the whole span, so that one bar is the target. When nothing paints the named target, its own dates are the target instead. An id the Dataset reads as neither throws `RevealTargetNotFoundError` (ADR 0010, #227). Envelope stays a data word (dates, resize, rollup) — Reveal names a painted target. The library resolves the pixel position from the row geometry it already computes; a consumer never converts an index or a row height into a scroll offset. Nearest-edge, not center: a no-op if the target is already inside Visible, otherwise the Pan moves exactly enough to align the nearest off-screen edge. Landed on both axes at S1.9 (D-S1.9-6) — the x half was a no-op before Fit existed, since content width equalled pane width.
_Avoid_: ScrollTo, scrollIntoView, goTo, center (Reveal is nearest-edge; centering is a deferred, separate policy). The verb was re-read against the painted-target contract and kept (#295): Reveal says the target ends up visible and says nothing about where it lands, which is what a nearest-edge move that also expands collapsed ancestors does. `goTo` promises a destination instead of a minimal move.

**Batch**:
Several writes to a viewport model delivering at most one notification, and only if the resolved value actually changed. No observer ever sees an intermediate state. A Batch is _not_ a Transaction: it has no changeset, no undo entry, and no extension hook — `layout/` has no edge to `data/`. The two words never substitute for each other.
_Avoid_: Transaction (that is `data/`'s unit of mutation), commit, freeze

**ViewPreset**:
The data description of one zoom level: what unit the ticks step in, how wide a tick _intends_ to be (`preferredTickWidthPx`) versus the density floor (`minTickWidthPx`), and one or more header bands sitting above them, coarsest first. A preset is a config object, so a new zoom level is never a library edit. `tickUnit` is never coarser than the finest header — a label must not claim a boundary no gridline draws. Each band's `format` is a Date format.
_Avoid_: Zoom level (a zoom level is what a preset expresses), timescale header

**Preset reference**:
What a caller states to name a ViewPreset: a PresetId (`ShippedPresetId` — autocompletes — or a custom string) or a full custom ViewPreset object. `resolvePreset` is the one place a Preset reference turns into a ViewPreset. `gantt.preset` searches this Gantt's own `zoomPresets` for a matching `id` before the shipped table (#489 owner ruling: the Gantt's own ladder wins on a shared id); `gantt.zoomPresets` and a shared `TimeScaleModel`'s own `preset` have no ladder and search only the shipped table. Either way, `UnknownPresetError` names every table the failed lookup checked. A ViewPreset object passes through unchanged, so a custom preset is never a library edit. `resolvePreset` and the individually named preset constants (`dayPreset`, `weekAndMonthPreset`, and their siblings) are not exported from `api/` (issue #84) — resolution is core's own job; a custom-preset author needs `ViewPreset` and the `presets` record, not the constants or the resolver.
_Avoid_: Preset id (that names only the shipped-id half), preset name

**Range**:
The full content span a TimeScale maps — `'fitDataset'`'s min/max over every bound Dataset, or a pinned TimeSpan. Distinct from Fit: Range says how much time the content covers; Fit says how many pixels each unit of that time gets. Never written by an anchored zoom (D-F′) — only a Dataset edit or a caller assigning `range` moves it.
_Avoid_: Span (Range is the caller-facing intent; span is used loosely elsewhere for a resolved interval), window, extent

**Fit**:
The density mode a TimeScale resolves `pxPerMs` from: `'pane'` (the default — content fills the measured pane width), `'preset'` (the preset's own density, ignoring pane width — the first mode where content can exceed the pane), or an explicit `number` of pixels per millisecond. Distinct from Range (what content is shown) and from Preset reference (which labels and tick unit are shown) — Fit answers only "how many pixels per unit of time." Every mode is floored by the current preset's `minTickWidthPx` and capped by a content-width ceiling in `layout/` (`MAX_CONTENT_PX`): when the pane is too narrow to give each tick a legible width, content becomes wider than the pane and the timeline scrolls. Renamed from `zoom`/`TimeScaleZoom` (issue #84): "zoom" was one word doing three jobs (this mode, the `zoomTo` density knob, the `zoomBy` gesture) — Fit keeps the word "zoom" for the gesture family only, named by `zoomTo`/`zoomBy` and Anchored zoom below.
_Avoid_: Zoom, TimeScaleZoom (retired names — see above), Scale (Scale is the resolved `TimeScale` object, not this mode), density (fine in prose, but the type and field name are `fit`/`TimeScaleFit`)

**Zoom presets**:
The ordered ViewPreset set `zoomIn`/`zoomOut` step through, finest first (`gantt.zoomPresets`). Default is the nine-rung shipped set. Live. Distinct from Preset reference (the _current_ labels) and from Fit (density). "ladder" already names the Customization ladder (Token / Part / renderer).
_Avoid_: ladder (taken), zoom levels (that is what a ViewPreset expresses)

**Date format**:
How a header band labels an Instant: an `Intl.DateTimeFormatOptions` object, or a `HeaderFormat` callback as the escape hatch (week numbers, unpadded hours) — a Formatter with no entry, since a header tick has no row. Resolved through `Intl.DateTimeFormat` in the Dataset's zone and this Gantt's effective locale (its own, then the Dataset's, then the runtime's own) — not through Temporal's `toLocaleString`. Year and month appear once, on the coarsest band that states them; finer bands drop those fields unless `repeatCoarserUnits` (`dropRepeatedGranularity`).
_Avoid_: HeaderFormat as the everyday name (that is the callback half only)

**Date line**:
A vertical marker at an Instant on the timeline. Geometry is a `DateLine` decoration. `gantt.todayLine` is the wrapper that emits the one at `now()`; a caller states any other Date line through `gantt.dateLines`, an array of `{ placeAt, label?, className? }`. `placeAt` carries the Instant — never `location`, which already names a pixel position (`model/geometry.ts`), and never `id`, since the list is index-keyed the same way Header bands are. Paint is `.fg-date-line` (S1.13, D-S1.13-8 — `.fg-today-line` is gone, no alias); the stroke is `border-left`, so a consumer's own `className` reaches `border-left-style`/`-width` with no new option (D-S1.13-5). The wrapper's stroke carries `data-flag="today"` (U5); authored list entries do not.
_Avoid_: Timeline (the pane, not this marker), cursor, now-line, location (that is a pixel position, not an Instant), id (`dateLines` has none — index-keyed like Header bands)

**Date line label**:
The text a Date line shows when it has a `label`. A sibling Part, `.fg-date-line-label`, mounted in `.fg-header` at the line's x — not the stroke's own `textContent`, which is unreadable at 1px wide (S1.13, D-S1.13-6). The `todayLine` wrapper's own line never gets one; give it a label by turning `todayLine` off and authoring the same Instant through `dateLines` instead. Where it paints relative to the header is `Gantt.dateLineLabelPlacement` (#318 follow-up): `'belowHeader'` (default) below the bands, `'inHeader'` inside them, or a `number` px offset from the header's own top edge.
_Avoid_: caption (used generically elsewhere), tooltip (this is always-visible, not hover-triggered)

**Today line**:
The Date line at `now()`. `gantt.todayLine` (default on) is the wrapper that emits it — `true`, `false`, or a pinned `InstantInput` (S1.13, D-S1.13-4), with no clock read once pinned. Updates on the next render, not on a clock tick (D-S1.12-14) — a plugin that wants a live line reassigns `gantt.todayLine` on its own timer, held in `ctx.disposables`. Paint marks it with `data-flag="today"` on `.fg-date-line`. `panToToday` pans to `now()`.
_Avoid_: Cursor (that is the pane's CSS cursor, or the Cursor line during a drag — never this Date line)

**Cursor line**:
A hot-path hairline at the Instant under the pointer during a pointer drag (S3.8, D-S3-15, issue #99 gap 5). Paint is `.fg-cursor-line` / `.fg-cursor-line-label`, singleton nodes moved by `applyState` via `InteractionState.cursorX` / `cursorLabel`. Reuses `--fg-date-line-color`. Never a `frame.decorations` Date line — those are authored markers; this one tracks the pointer and parks when the drag ends. The caption is `cursorLabelForX` in `layout/` (`instantForX` → `snapInstant` → `formatDate`).
_Avoid_: Date line (authored, in the frame), Today line, cursor (the CSS `cursor` property on a bar)

**Today line margin**:
How many of the current preset's Ticks `panToToday('start')` leaves between the timeline pane's left edge and the Today line. Live on `Gantt.todayLineMarginTicks` (default `2`; `0` lands flush). No effect on `align: 'center'`. The shell converts ticks to px at the Instant being panned to — calendar ticks vary (DST, month length), so this is not a cached pixel constant.
_Avoid_: leftMargin (a Viewport implementation parameter, not the public knob), gutter (that is the grid pane)

**Tick width**:
Two numbers on a ViewPreset: `preferredTickWidthPx` is the density the preset intends when nothing else decides; `minTickWidthPx` is the floor below which that preset's labels stop being legible (defaults to preferred, so a custom preset never compresses).
_Avoid_: tickWidthPx (retired — it read as a minimum when it sat beside `minTickWidthPx`)

**Anchored zoom**:
The read-before-write contract behind `Viewport.zoomTo`/`zoomBy` (D-S1.9-5): the Instant currently under the anchor pixel is read before anything is written, then Scale and Pan are updated together inside one Batch so that same Instant is back under the anchor pixel afterward. The anchor is always derived from a stated pixel position, never supplied as an Instant — a caller states _where_, not _what the pixel currently means_. Distinct from Fit: Fit is the mode (`'pane' | 'preset' | number`); `zoomTo`/`zoomBy` are the gesture that writes an explicit density into it, anchored so the content under the pointer doesn't jump.
_Avoid_: Pinned zoom, cursor zoom (the mechanism is not specific to a pointer — a caller can anchor anywhere)

**Tick**:
One step of the time axis at the current ViewPreset's resolution — the unit the header bands label and, when Snap is on, the default target a gesture snaps to (`snap: 'tick'`). Anchored on the calendar (#489): a stepped Tick (`tickIncrement > 1`) counts from the start of the next larger unit, d3 `every(n)`-style — 6-hour Ticks land on 00:00/06:00/12:00/18:00, 15-minute Ticks land on the hour — so the same instants draw during a pan or after a data change, and `tickIncrement: 1` never changes. `time/zone.ts`'s `tickFloor`/`nextTick` are the one walk `TimeScale.ticks`, `snapInstant` and `nextTickBoundary` all read for this, so a gridline and a drag snap can never disagree. Since S1.7 a Tick also carries its own cell `width` (px to the next boundary at its band's step), so a DST-shortened or -lengthened day draws at its true width instead of an assumed constant. Width is floored by the preset's Tick width (`minTickWidthPx`); a pane too narrow to honour that floor scrolls.
_Avoid_: Gridline (a gridline is one way a Tick is drawn), step

**Tick box floor**:
The smallest CSS border-box a painted Tick cell can occupy (`--fg-tick-box-floor`, default 9). Distinct from Tick width (density on the time axis). A sticky header label clamps to the pane edge only when the remaining cell is at least this wide; a thinner remainder keeps the Tick's true x.
_Avoid_: min-width (that is Tick width's `minTickWidthPx`), sticky min width, STICKY_LABEL_MIN_WIDTH_PX

### Direct manipulation

**Snap**:
The calendar grid a drag and a keyboard Nudge write onto: a named unit and increment (`{ unit: 'day', increment: 2 }`), `'tick'` for one Tick of the showing ViewPreset, a caller's own `SnapRule` function, or `'none'` for raw pixel placement. Opt-in (#489, reverses D-S3-24's fallback): a caller who states nothing gets `'none'`, free dragging — a ViewPreset no longer switches Snap on by itself, and `ViewPreset` carries no `snap` field. `gantt.snap` is the one place a caller states it, surviving a zoom (D-S3-24). `SnapSetting` is what a caller states; `SnapUnit` is what one gesture resolved that to, with `'tick'` already read as the showing preset's own Tick and Alt already read as `'none'` (D-S3-12). A `SnapRule` (`(zone, at) => Instant`) is the escape hatch for anything a plain unit/increment can't state, built from the same tick tools (`snapInstant`, `nextTickBoundary`) the library's own grid and Snap read. The live preview always tracks the pointer unsnapped; Snap applies to the value written on commit.
_Avoid_: snap unit for the stated setting (that is the resolved value), grid, magnet

**Selection**:
The set of Entry ids a `Gantt` currently highlights (ADR 0025, #421, supersedes ADR 0010's Segment-keyed reading). The `Segment` type retired, so there is one unit left to select: the Entry. The pane a click lands in decides which Entries enter it: a click on the timeline selects the Entry the clicked bar draws — a segmented parent's own bar and one of its Segments each select their own Entry, the same as any other bar — and a click in the grid pane selects every Entry the row owns, because the grid pane's unit is the row. Ctrl-click adds or removes the Entries one hit names. A shift-range steps over drawn bars, not over rows: it runs from the anchor bar's Entry to the Entry the pointer landed on, in the order the panes draw them. **The Selection owns the drag**: what a gesture moves or resizes is what is selected, and what paints as selected is what moves (#211, D-S4-30, `plans/s5-extensibility-and-editing/spec-211-gesture-units.md`) — this holds true by construction now, since paint and gesture both read the one Entry id set. Per-Gantt, not per-Dataset: two Gantts bound to one Dataset can select differently. Written on pointerup for a plain click, ctrl/⌘-click, shift-click, or a miss — never on pointerdown, and not again on the pointerup that follows a drag. The one exception (#211, D-S4-30): a move drag that arms (crosses the drag threshold) on a bar whose Entry the Selection does not already hold writes the Selection to that one Entry the moment it arms — before the drag previews anything — so the draft it moves reads the same set this write just made, rather than a stale or empty one. A primary button writes it; a right-click writes nothing, except on an empty timeline, where the clearing rule holds for either button (`plans/02`, D-S3-10 amendment). The event pair keeps the concept word (`beforeSelectionChange`/`selectionChange`). The public surface is one getter/setter pair now (#113, ADR 0010, ADR 0025): `Gantt.selectedEntryIds` is the Entry ids themselves (loose in, branded out, live, writable), and `Gantt.selectedEntries` re-reads the bound Dataset for each id in `selectedEntryIds`, in order, on every access — skipping an id the store no longer has (e.g. after a `remove`) rather than throwing. Internal holders of the id list keep the concept word (`GanttShell#selection`).
_Avoid_: highlight (paint detail, not the authored concept), `Gantt.selection` / `Gantt.selectionEntries` (retired in #113 — a public name with no axis word left the reader to learn from the types which side was ids), `selectedItemIds` (retired in #185 — paint keyed by Bar let the shell guess which bar an Entry drew), `gantt.selectedIds` (retired in #212, ADR 0010 — the name could not say which unit it held once two units, Segment and Entry, existed), `selectedSegmentIds` (retired in #421, ADR 0025 — `Segment` no longer exists, so there is one set again, not two)

**EntryGesture**:
The kind of data edit a drag is making — `{ kind: 'move' }` or `{ kind: 'resize', edge }` — the shape `view/entry-gesture-context.ts`'s `EntryGestureContext` carries through `draftFor`/`commit`. Distinct from the pointer machine itself (`createPointerGesture`, `pointer-gesture.ts`), which knows nothing about entries, drafts, or kinds — only threshold, capture, Escape, and long-press over plain `start`/`move`/`commit`/`cancel` callbacks.
_Avoid_: Gesture unqualified (collides with the pointer machine's own word — say "the pointer gesture" or "the EntryGesture" explicitly)

**Parent bar drag**:
Dragging a parent's bar translates every dated descendant below it, in one transaction and one undo (ADR 0013). A child with one date moves that date. A child with neither is skipped. A descendant that derives its own dates is passed over, and the rows below it move instead. One locked descendant refuses the whole gesture, because a half-translated subtree rolls up to an envelope the drag never painted. The event pair is `beforeEntryMove`/`entryMove`, unchanged: `event.entry` is the parent you grabbed, and `event.entries` is each descendant that moves, plus the parent itself, grabbed first, when it owns its own dates (`rollUp: 'none'`). `ProposedSpan` is the grabbed bar's own reading and keeps both dates; `ProposedDates` is each descendant's, where a date the gesture does not propose stays absent (Q9's ruling).

**While the parent's `start`/`end` roll up**, the drag never writes them. The Rollup moves the parent's own envelope from the rows that moved. The bar offers no resize, because one edge of a derived envelope names no descendant to resize. **When the parent owns its own dates instead** (`rollUp: 'none'`, #470), the drag also writes the parent's own cell. Its resize handle opens and writes the parent alone. The subtree still translates underneath it either way.
_Avoid_: group drag (there is no stored group), cascade (that is the extension hook's word)

**Owning parent**:
A row with children whose `start`/`end` Fields both declare `rollUp: 'none'` (#470). It keeps its own
dates instead of deriving them from its subtree. Its bar moves and resizes like an ordinary bar's, and
a direct write to its `start`/`end` cell succeeds instead of throwing `DerivedFieldNotWritableError`.
Its subtree still translates under a drag of its own bar, per **Parent bar drag** above. The opposite
is a **rolling-up parent**, the default for any row with children.
_Avoid_: group (there is no stored group — see **Parent bar drag**), locked parent (locking is
`editable`, a separate question from ownership)

**Draft**:
Prose for a gesture's in-flight edit while a drag previews — not a type of its own (D-S3-2). A Draft **is** `EntryEdits`, the same shape `dataset.entries.update()` takes; nothing new is declared for it. Distinct from Write set (a Transaction's own in-progress record, once a Draft actually commits).
_Avoid_: Draft as a type name (there is none — see Write set's own _Avoid_ line), staging area, buffer

**Ghost**:
Hot-path paint of an in-flight Draft (and any extra `EntryEdits` the extension hook returned) as transforms on existing bar nodes — `data-state~="ghost"` for an extender extra, `data-state~="dragging"` for the caller's own grabbed bars. Discarded on cancel; never written to the Dataset until commit.
_Avoid_: Preview as a type name (`BarPreview` is the internal pixel offset; Ghost is the user-visible paint)

**Nudge**:
One keyboard step of a selected entry, sized to one resolved snap unit, committed through the same `session().nudge()` pipeline a pointer `commit()` uses (D-S3-13, D-S3-23). One transaction per key press. Distinct from viewport pan (arrows pan only while the selection is empty).
_Avoid_: Step (that is Tick stepping), keyboard drag

**Interaction state**:
The one long-lived, mutable per-Gantt object `RenderBackend.applyState` diffs against (`hoveredBarId`, `selectedEntryIds`, `resizableEntryId`, `movableBarId`, `preview`, `pendingBarIds`, `cursorX`, `cursorLabel`). `selectedEntryIds` is the Selection itself (ADR 0025, #421), and a backend paints a bar whenever the Selection holds that bar's own Entry (the retired `selectedItemIds` made the shell guess that, and the retired `pickedItemId` is no longer needed once the Selection carries Entry ids directly). `resizableEntryId` reads the same way (#200): a resize acts on the Entry's envelope, so the backend puts the `start` handle on the Entry's leftmost bar and the `end` handle on its rightmost one. Hot path: class toggles and transforms only, no frame rebuild (I5, D-S3-6).
_Avoid_: Selection as this object's own word (the Selection is the public `Gantt.selectedEntryIds` Entry-id set, which this object carries; the rest of it is paint), `selectedSegmentIds` (retired in #421, ADR 0025)

**Picked Item** (retired):
Retired in #212 (ADR 0010). The Selection now holds the Entry the pointer picked (ADR 0025 re-settled this on the Entry, not the Segment, when the `Segment` type retired), so no second field is needed to say how far a click's paint reaches.

### Theming and accessibility

**Base stylesheet**:
The one stylesheet the library ever writes, injected once per document by `ensureBaseStyles` (`view/styles.ts`, S1.10). Idempotent per document via a `<style data-freegantt-styles>` marker — the document holds that state, not a module variable, so two Gantt instances in one document share one injected sheet without this being I2's kind of shared mutable state (the second call is a no-op precisely because the marker makes it safe to call twice). Ships every Token default and every Part's structural rule; there is no consumer-facing way to opt out (D-S1.10-8) — a consumer restyles it, it does not disable it.
_Avoid_: Default styles, styles.css (there is no separate package export — see D-S1.10-8)

**Theme**:
`Gantt.theme`'s own value — `'auto' | 'light' | 'dark'` (default `'auto'`, live, S1.10, D-S1.10-4). `'light'`/`'dark'` write `data-fg-theme` on the container, which wins over everything else; `'auto'` writes no attribute, letting the nearest ancestor's own pin decide, else `prefers-color-scheme`. ADR 0029: an app with its own dark-mode signal pushes the answer — `gantt.theme = isDark ? 'dark' : 'light'`, or pin `data-fg-theme` on an ancestor once — instead of the library asking the app for it.
_Avoid_: `resolvedTheme` (that is a different question — see Resolved theme, next)

**Resolved theme**:
`Gantt.resolvedTheme`'s own value — `'light' | 'dark'`, never `'auto'` (#330). It is what `theme` resolved to right now, through the walk `theme`'s own entry describes, ending at the OS when nothing up the tree pins one. Computed on every read, never cached (#375): an ancestor's own pin can move this answer with no write of this Gantt's own, so a cached copy would go stale under exactly that case. `themeChange` fires when this answer moves, for any of three causes the library can see — a `theme` write, the OS flipping under `'auto'` with no ancestor pin in the way, or an ancestor's own pin changing (#375). The `theme`-write and OS causes fire synchronously; the ancestor-pin cause fires on a later task (the `MutationObserver` watching `data-fg-theme` under the root node). Re-parenting under a differently-pinned wrapper moves this answer with no `data-fg-theme` write of its own, so none of the three causes above notices. `checkResolvedTheme()` (#394) is the consumer's own door for exactly that case: it re-resolves on demand, fires `themeChange` if the answer moved, and returns the answer either way. No `themeChange` — or any other event — fires before `new Gantt()` returns (#376): the constructor's own `theme` write, applying the config a consumer passed, is construction finishing, not a change for a constructor-supplied plugin's subscription to hear. Same precedent as `range`/`dateLines`: a getter returns what the library resolved (#248), not the loose config a consumer wrote.
_Avoid_: Theme (that is the config value, `'auto'` included — see Theme, above)

**Token**:
A `--fg-*` CSS custom property — level 1 of the Customization ladder (`plans/02` §4). Metrics (`--fg-row-height`, `--fg-grid-pane-width`, `--fg-band-height`, `--fg-tick-box-floor`, `--fg-bar-min-width`, …) are read once through `pixel-property.ts` or consumed as CSS `var()` fallbacks; colour Tokens (`--fg-bar-fill`, `--fg-pane-bg`, `--fg-date-line-color`, `--fg-selection-color`, …) are consumed directly by Base stylesheet rules with no JS in between. A consumer overrides any Token by setting the same property on the container element; the shipped default is always the fallback in `var(--fg-x, default)`, never the winner once a consumer has authored a value. `--fg-header-height` retired at S1.12 in favour of `--fg-band-height` (one band, not the whole header). `--fg-bar-min-width` (default `DEFAULT_MIN_BAR_WIDTH_PX`, 12) is every bar's painted-span floor — `barSpan` widens a bar narrower than this and centres it on its own span, closing the unclickable-bar defect (#212 follow-up). `FrameBar.span: 'minimum'` states whether this floor touched a bar; `render/` stamps it `data-span="minimum"`. A Bar that carries its own `box` (ADR 0022) skips this floor and states `FrameBar.span: 'fixed'` / `data-span="fixed"` instead.
_Avoid_: Variable, custom property (accurate but not this project's term of art — say Token), theme variable

**Part**:
One of the `fg-*` class names the library's DOM structure carries — level 2 of the Customization ladder. The vocabulary is closed and un-renamed (D-S1.10-1), with additions before 1.0 for a real structural gap. The complete list — public Parts and internal plumbing — lives in `docs/05-consumer-api.md` (issue #334), guarded against `styles.ts` and the shipped variant CSS. `fg-header-bands` (#225) is `.fg-header`'s inner bands-and-clip wrapper — added so `.fg-header` itself could go back to `overflow: visible`, letting the Date line label sit at `top: 100%` of `.fg-header`'s own height, below the bands, instead of clipped on top of them. `fg-bar-label` (#220) is `.fg-bar`'s own text child — it ellipsizes when the label sits inside the bar and clips when `barLabels` places it outside, so a consumer that clips `.fg-bar` itself (`overflow: hidden`) also clips an outside label away, because the label stays a child of the bar it names. A consumer writes level-2 CSS against a public Part directly (`.fg-bar { ... }`) or against a Part plus a State attribute (`.fg-bar[data-flag~="conflict"] { ... }`).
_Avoid_: Pane (Grid pane/Timeline pane/Splitter are specific Parts, already named in "Mounted instances" — Part is the general term for the whole class vocabulary), BEM block (rejected, Q2 — renaming shipped classes to a BEM shape was churn with no behavior change)

**State attribute**:
A `data-*` attribute a Part carries so a consumer can select on state without JS — `data-flag` (space-joined, generated from `BAR_FLAG_KEYS`, D-S1.10-2: `conflict`, `cycle` — link tokens are named but nothing generates them yet, `layout/frame.ts` always emits `links: []`; on `.fg-date-line` the Today line wrapper writes `today`), `data-variant` (the Variant this Gantt resolved for the row — `summary`, `leaf`, or a consumer's or a plugin's own — never a stored Entry classification, ADR 0018), `data-state` on `.fg-bar` (`hovered`, `selected`, `pending`, `dragging`, `ghost`) and, since the bug hunt ("grid row highlight and row click"), on `.fg-row` as well (`selected` only — a row has no hover/pending/drag/ghost paint of its own; its own `--fg-row-selected-bg` Token, a flat background so it does not fight cell layout and so axe reads one opaque colour), `data-movable` (grab cursor), `aria-expanded` on `.fg-row-twisty` (collapsed vs expanded), `data-matched` on `.fg-row` (`false` when a filter kept the ancestor only), `data-placement` on `.fg-date-line-label` (`'belowHeader'` when `Gantt.dateLineLabelPlacement` resolves to it, absent otherwise — #318), `data-testid`/`data-row-id`/`data-bar-id` (stable E2E hooks, U6). Distinct from a Token (a value) and a Part (a structural class): a State attribute is level 2's other half, the thing a consumer's selector matches against rather than reads.
_Avoid_: Data attribute (too generic — say State attribute when it's part of the level-2 vocabulary), modifier class (there is no modifier-class convention here — state lives in `data-*`, never a second class)

**a11y label**:
`FrameBar.a11yLabel` — the library-computed string a screen reader announces for one bar (`${entry.name}, ${formatDate(...)} – ${formatInclusiveDate(...)}`), composed in `layout/` from the dataset zone and set as `.fg-bar`'s `aria-label` at sync time. Not the same thing as `Gantt.a11yLabel` — the live option that sets the _container's_ `aria-label` (default `'Gantt'`). Two different things sharing a root word: say "the bar's a11y label" or "`Gantt.a11yLabel`" explicitly, never "a11y label" unqualified where both are in scope (#7's "chart" lesson applies).
_Avoid_: aria-label (that is the DOM attribute `render/dom` maps this to — `a11yLabel` is the backend-neutral field `layout/` produces, same relationship `variant` has to `data-variant`), accessible name (a browser/AT term of art, not this project's field name)

### Extension

**Capability**:
What the user may do to a given Entry, resolved once and gating both the act itself and any affordance that hints at it. It answers two questions, and each writer needs the ones that apply to it: whether a gesture (move, resize, select, link) is **offered** for that Entry, and whether the values that gesture would write **may change** — the second is **Writability** (#256). `select` Capability has no visual affordance, and I14's refuse half still applies (pointer and keyboard skip an incapable entry); the public `Gantt.selectedEntryIds` setter does not consult it (D-S3-9). A **Capability rule** is one entry in an `Capabilities` table, and **two doors carry that table** (ADR 0018): the consumer's own `capabilities` config on the Gantt, and the resolved Variant's own `capabilities`. They do not compete — they are one chain, resolved in `view/capability.ts`: the consumer's `capabilities` wins over the variant's own `capabilities`, which wins over the library rule. A gesture rule is a boolean or a per-entry predicate (`CapabilityRule`); the write rule (`edit`) takes the cell and may answer "no opinion" (`WriteRule`). A predicate at **either** level answers `undefined` for "no opinion" and the answer falls to the next level, so a variant that speaks for one look does not also answer for every other row (`J13`); a bare boolean pins every row it reaches. Pick the door by who owns the rule: `can` when it belongs to the look (a milestone never resizes, wherever it is drawn), `capabilities` when it belongs to this Gantt (a read-only board resizes nothing, whatever a row looks like) — and only `capabilities` is live and Gantt-wide, which is why the variant level cannot replace it. `gantt.setCapabilityRule(name, rule)` and `gantt.clearCapabilityRule(name)` write one; assigning `gantt.capabilities` replaces them all (D-S5-35, #195). **One word carries this concept, at every level.** It used to take three — `Capability` in `setCapabilityRule`/`CapabilityRule`, `Interactions` as the type and the Gantt key, and `can` on a Variant — and `setCapabilityRule(capability: keyof Interactions)` showed the cost in one line: a parameter named for one concept, typed by another. `interactions` also collided with the `interaction/` layer, which is the #7 "chart" shape. So `Interactions` became `Capabilities`, `GanttOptions.interactions` and `gantt.interactions` became `capabilities`, and `EntryVariant.can` became `capabilities` too. The word **interactions** is now free, and it means the `interaction/` layer and nothing else. `ResolvedCapabilities` (`view/capability.ts`, internal) is the separate thing this ladder _produces_ — `can`/`canWrite`/`entriesMovedBy`, the answers — and it stands to `Capabilities` as `ResolvedVariant` stands to `EntryVariant`.
_Avoid_: Permission, ability

**Writability**:
Whether one Entry's one Field may change. That pair is the unit a write names, and the changeset's own shape. `Field.editable` is `'never' | 'api' | 'anywhere'` (default `'anywhere'`; `true`/`false` alias `'anywhere'`/`'never'`, ADR 0015). Gestures ask `canWrite` — writable iff `'anywhere'`. `entries.update()` refuses only `'never'`. `capabilities.edit` states which Entries an `'anywhere'` Field is writable on (#256, amended by ADR 0033): it narrows that Field's own answer, and it never reopens `'api'` or `'never'`. A Field with no stored home is writable by nobody, whatever the rules say.
_Avoid_: Editability (reads as "the cell editor only", and drag-resize asks the same answer), permission, read-only

**KindDefaults**:
The middle precedence layer `resolveCapabilities` reads between the consumer's own `capabilities` config and the library's built-in table. It was a plugin's per-Kind gesture defaults (`ctx.interaction.registerKindDefaults`). ADR 0013 deletes `Entry.kind`, so that join is gone. The seam is re-homed in that ADR's work: a plugin that owns ids sets defaults on those ids, or on the two structural looks (summary vs leaf).
_Avoid_: Capabilities unqualified (that name is the rule table itself, and this is one layer of the ladder that resolves it)

**Registration table**:
The one mechanism behind every `register*` seam a plugin reaches (`layout/registration-table.ts`,
#154/#155). A key holds a **stack** of live registrations, not one remembered value: the newest
registration answers `get`, and the `Disposer` a registration hands back removes exactly that
registration — never a sibling on the same key, in any disposal order. What answers next is the
newest registration left, and where the table was built with initial pairs (the shipped item
producers, the core command catalog) that floor is what a key falls back to. It is what lets
`gantt.plugins` drop one plugin without disturbing another that claimed the same key. The **initial
pairs** are the floor nothing disposes; **`active()`** is one value per key — the winning ones — in
first-registration order, which is why it is not called `values()`.
_Avoid_: Registry (a Registry is a named seam a plugin registers _into_ — `CommandRegistry`,
`RendererRegistry`, `BarProducerRegistry`; the table is the mechanism each of them holds), Map,
Stack (one key holds a stack; the table holds many)

**Renderer slot**:
What one `ctx.view.registerRenderer` call claims, and the key `RendererRegistry` refuses a second
claim on. A `cell`, `header` or `tooltip` registration claims its whole point: those three have no
key to merge on. The `bar` point's per-kind map (D-S5-12) claims one slot **per kind** — `bar:buffer`
— so a plugin that defines one kind and a plugin that defines another both install (review P2). Two
plugins that name the same kind still collide, and `RendererAlreadyRegisteredError.slot` names what
collided. The whole-point form (`registerRenderer('bar', fn)`) stays exclusive: one function answers
every kind, so it refuses, and is refused by, any per-kind claim.
_Avoid_: Renderer point as a synonym (a point is `bar`/`cell`/`header`/`tooltip`; a slot is what one
registration holds, and the `bar` point holds many)

**Decoration**:
A pure paint a plugin adds without owning a Bar or a Renderer slot — a weekend band, a row
stripe (`layout/decoration.ts`'s `DecorationInput`, D-S5-15). `ctx.view.registerDecoration(layer,
provider)` registers a `DecorationProvider`, a function of the visible span and rows that states
time or a `RowId`, never pixels; `layout/decorations.ts` converts through the bound `TimeScale`
(I12), so a shared axis keeps every Decoration in step. `layer` picks `underBars` or `overBars`,
and several providers on one layer all paint, in registration order.
_Avoid_: Overlay, band (both name one _kind_ of Decoration's shape, not the registration mechanism)

**Time shading**:
Regions of the time axis, painted under the bars by the shipped `timeShading()` built-in (#404) — a
`ChromePlugin`, id `freegantt.timeShading`, layer `underBars`. What a shaded region _means_ is the
consumer's: a weekend, a holiday, a closed shift. The library names only what it is. Each
`ShadingRule` pairs a `covers` with an optional `class`. A **`TimeCover`** answers
`coveredSpans(window, time)`; five builders ship — `daysOfWeek()`, `hours()`, `dates()`, `spans()`
and `notCovered()`. A list of covers means their union. `{ every, covers }` takes a `CoverPredicate`
instead, asked once per `every` step. A rule hides when the tick is too coarse to read it, and
`hideWhenCoarserThan` overrides that floor. Every band carries the `.fg-time-shading` Part. The
`--fg-time-shading-fill` Token themes it (level 1 of the Customization ladder), so a zero-CSS
install is already visible. A rule's own `class` themes one rule (level 2), as `harness/planner.ts`
shows.
_Avoid_: non-working time (what a consumer's shading _means_, never what the library names it),
`weekendShading()` (the retired harness demo), shading band (a band is one Decoration's shape — see
**Decoration**)

**Plugin**, **ChromePlugin**, **DataPlugin**:
The public extension contract (ADR 0019): an `id`, an optional `requires`, and one or both halves.
`data(ctx)` declares Fields, claims the edit hook and reserves the store; it is DOM-free and runs
once, on the finished Dataset. `view(ctx)` registers variants, renderers, commands and keys, and runs
once the Gantt is built, before its first frame (ADR 0032) — `ctx.gantt` already answers real state,
but the DOM has not painted yet. A **ChromePlugin** has a `view` half and no `data` half, and installs on the
`Gantt`. A **DataPlugin** has a `data` half, and installs on the `Dataset` — the install site is
where the state lives: a `data` half declares what shapes the Dataset's own construction, and a
Dataset installs its plugins once. **Plugin** is either. `definePlugin`
is the door, and it narrows to the arm the object fills. Either half may return a `Disposer`, and
only for a resource the plugin owns itself — a timer, a socket, a subscription of its own. Every
`register*` and every `onDomEvent` already files its removal in `ctx.disposables`, so most plugins
return nothing at all (review P4). Built-in features (tooltips, context menu, editors) are themselves
ChromePlugins using the same `PluginContext` a third party would use — no back-door capabilities
reserved for first-party code. A plugin's type argument names the keys it reads and writes, not the
consumer's props. Every key in its `fields` must be one of them.
_Avoid_: GanttPlugin, DatasetPlugin (the retired pair, one install site each — ADR 0019 replaced both with one type), Extension (Extensions is the name of the source layer that runs plugins; a Plugin is the unit within it)

**PluginContext**:
The object a `view(ctx)` half receives — its entire world: dataset access, the event bus (including cancelable `before*` events), registration for decorations/columns/renderers/bar-producers/interaction-controllers/keybindings, the command registry, and a disposable store. A plugin may not reach into anything outside it (enforced by the import-boundary lint). Every `register*` on it returns a `Disposer` and lives exactly as long as the plugin does; collisions resolve by one policy per seam shape (`plans/02` §4.4, and the Registration table entry above). `view/plugin-ports.ts` declares the whole shape, grouped the way a plugin reads it (`ctx.commands`, `ctx.interaction.*`, `ctx.view.*`, `ctx.layout.*`); `api/gantt.ts` adds `dataset` and `gantt` and nothing else, so a new seam is one edit in one file.
**Plugin ports**:
What `view/plugin-ports.ts` builds for one installed plugin (`buildPluginPorts(shellPorts, pluginId)`): the grouped `PluginContext` members `GanttShell` owns — the **`PluginContextParts`** — plus that plugin's own `RegistrationGate` and `DisposableStore`. `GanttShellPorts` is the seam back — the registries, the frame loop and the event bus the ports write into — the same named-ports idiom `CoreCommandPorts` and `ColumnChromePorts` already set. `registerWhileOpen` is the one gated shape inside it: it asserts the gate, registers, invalidates, files the `Disposer` with the plugin's store, and returns it. A new seam names what registers and what must run again; it transcribes nothing.
_Avoid_: `PluginContextPorts` (renamed 2026-09-05, issue #183 — `api/index.ts` exports that member
list so `etc/freegantt.api.md` keeps the plugin surface member by member (#166), which put the one
public `*Ports` name on the surface. Every other `*Ports` here names one collaborator's seam back into
its owner and stays private; the plugin's own context is not that. `Parts` names the pieces a
composite is made of, the way `PlainParts` already does); a flat bag (retired 2026-09-04 — a flat list
made `api/gantt.ts` re-group every member by hand, so a seam cost three edits in three layers)

**Declarer** (and **authored**):
Who made a declaration: the library, the consumer, or one named plugin (D-S5-33, issues #162/#181).
A plugin's own `fields`/`fieldTypes`/`aggregators` (#496 grill round 3, R1) or its
`ctx.view.registerGridColumn` call records the calling plugin's id. **Authored** is the consumer's half
of that answer, and it is what the consumer's own surfaces report: `gantt.gridColumns` and both halves
of a `gridColumnsChange` payload carry the columns the consumer wrote, before and after a resize or a
reorder. **For a Field the answer is recorded and not published**: its one reader was
`FieldRegistry.authored`, which told a Document which Fields to write, and ADR 0016 removed it. A
plugin's declaration is code, and the plugin makes it again on its next install, so a consumer never
saves one. A `PluginStore`'s rows go the other way on purpose: they are data the plugin cannot
rebuild, so the Dataset keeps them under their owner's id for as long as it lives (D-S5-24), and an
application reads them out with `dataset.pluginStore(id)`. Data outlives its plugin; a declaration
does not.
_Avoid_: Owner (a `PluginStore` has an owner, which is who may _write_ it; a declarer is who _made_
one declaration), provenance as a public word (it names the rule, not an API member)

**Propose / Announce**:
The two verbs a plugin uses to raise the one event pair it owns (`ctx.interaction.proposeEntryEdit`, `ctx.interaction.announceEntryEdit`). **Propose** asks, and the answer is a Veto: `true`/`undefined`, `false`, or an unsettled `Promise` (D-S3-17). The caller must read it. **Announce** tells, after the commit, and returns `void`. `GanttShell#proposeChange` uses Propose in the same sense for every cancelable Gantt-state change.
_Avoid_: Emit (retired on the plugin surface 2026-09-04 — "emit" says a thing went out, and says nothing about whether a decision comes back; `EventBus.emit` keeps the word for the bus's own mechanism)

**EditExtender**, **PluginStore**:
Names from the extension hook's contract design (ADR 0002's consequences, issue #15, built on #12): a plugin's `data` half occupies the extension hook via an `EditExtender`, and per-plugin per-entry data (e.g. the scheduling plugin's pin flag, `Dependency`) lives in a reserved `PluginStore` rather than on `Entry` or in a consumer/plugin-shared field — one row per Entry, keyed by its id; a write for an id with no Entry throws. Landed in S5.10 (#15, #156). The plugin shapes live in `api/plugin.ts` and the `data` half's context in `api/dataset-plugin.ts`, `PluginStore` in `data/plugin-store.ts`, and `EditExtender` in `model/entry.ts`. A store's rows serialize under `plugins: { [id]: … }` at `schema: 3`. Named `ProjectPlugin` before ADR 0004.

**PluginRuntime**:
The `extensions/plugin-runtime.ts` class that installs, diffs (by `id`) and disposes one Gantt's `view` halves (S5.1, D-S5-1/D-S5-3). That list is the Dataset's own plugins plus this Gantt's chrome, sorted under one `requires` graph (ADR 0019). One instance per `GanttShell`, never shared across Gantt instances (I2). Owns each plugin's `RegistrationGate` — closed the moment that plugin's own `view()` returns, so a `register*` call reached afterward throws `RegistrationClosedError` (D-S5-4) — and commits an `install()` atomically: a `view()` throw unwinds only the batch just added, leaving the previously installed set untouched.
_Avoid_: PluginHost (retired — "Host" is repo-wide retired vocabulary, see Consumer)

**Command**:
One named, invokable action a `CommandRegistry` holds — `id`, an optional `label`, an optional
`when(ctx)` that gates whether it runs right now, and `run(ctx)` (`api/command.ts`'s `CommandOf`,
S5.2, D-S5-6). The library's own core catalog and a plugin's own commands are both just Commands;
a context menu item and a keybinding both resolve to one, so either can invoke the same action.
_Avoid_: Action (too generic — this repo's own word for one is Command), Menu item (a context menu
item is one _use_ of a Command, not the Command itself)

**Command registry**:
The `extensions/commands.ts` class (`CommandRegistry`) a `GanttShell` builds once and holds privately: `register`/`run`/`available`, keyed by a command's own `id` under the `freegantt.*`-namespaced core catalog (`view/core-commands.ts`) or a plugin's own id (D-S5-6). Public as `Gantt.commands`, typed against the api-level `CommandRegistryOf`. `run()` on a command whose `when` declines is a silent no-op, the same posture a disabled menu item takes; `run()` on an unknown id throws.
_Avoid_: Command palette (a UI a consumer could build on top of `available()`; no such UI ships)

**Keymap**:
The `extensions/keymap.ts` class that resolves a `KeyboardEvent` against every registered chord, newest-first (D-S5-7): the innermost, most-recently-registered binding wins, which is why a plugin's binding beats core's and a popup's own Escape dismissal beats an outer binding (D-S5-9). Chords are parsed once at registration, never per event. Holds two kinds of entry — a `KeyBinding` naming a Command registry id, and a command-less `registerHandler` callback (C3) — resolved by the same pass and gated by the same editable-target/IME rule either way.
_Avoid_: Key handler (that names one registered entry, not the resolver that owns all of them)

**Convenience chord** / **Obligation chord** (#262):
The split every default chord `view/gantt-shell.ts` binds falls into, one or the other, never both. A **Convenience chord** does a job that has another door too — a button, a menu item, or a public method — so an app author who wants the chord for something else may turn it off: `Gantt.convenienceChords`, `false` for all of them or a per-command map for one at a time (`api/command.ts`'s `ConvenienceCommandId`, `view/convenience-chords.ts`'s `resolveConvenienceChords`). Turning the chord off never removes the command — `gantt.commands.run(id)` and a menu item still reach it. An **Obligation chord** is the only keyboard path to what it does, so `[S5-A4]` and WCAG 2.1.1 keep it bound regardless: the plain arrows, `Home`/`End`, `Page Up`/`Page Down`, the splitter's arrows, `Shift+Arrow` column resize, `Alt+Arrow` column reorder, `Mod+Arrow` per-Entry reach, `Escape`, and `Enter` (`entryActivate`, #434 — the only keyboard path to click activation). `plans/02` §4.1 states the full split beside the chord table.
_Avoid_: Keyboard shortcut (this repo's own word for the concept is Chord — see Keymap); treating every chord as negotiable (an Obligation chord is not a config surface)

**Mount layer**:
The one shape a plugin mounts content into (`view/mount-layer.ts`'s `MountLayer`, #168): `present(node)`, `onResize(callback)`, and the layer's own `bounds`. A Gantt has exactly two — the Overlay and the Row layer — and the difference is the instance, never the interface. Reposition-on-resize belongs to whatever you mounted into, so both carry `onResize`, over one shared `ResizeObserver` per Gantt (`ContainerResize`, issue #137 F9). Before #168 there were two interfaces and only one had `onResize`, so the Cell editor mounted in one layer and borrowed the resize signal from the other.
_Avoid_: Overlay handle (retired — a one-field wrapper is the inner type, so `present` returns a plain Disposer), Host, Portal

**Overlay**:
One absolutely positioned layer over the Gantt's Container, owning its own stacking order and lifetime (S5.3, D-S5-8). It is the Mount layer that **escapes the pane box**, which is the whole difference from the Row layer. `PluginContext.view.overlay` hands a third-party plugin the exact same seam a built-in Popup is built over. Geometry and identity are the Gantt DOM's, not the Overlay's: `bounds`, `paneBounds`, `contains` and `elementForEntry` moved to `ctx.view.dom` in 2026-09-04's review (N1), because `overlay.elementForEntry(id)` returned a timeline bar that was never in the overlay — one word covering two concepts, the #7 failure. The layer's _own_ rect is the exception, and stayed with it (`overlay.bounds`, #168).
_Avoid_: Layer (too generic — Overlay is this one specific layer, not the render/dom layer stack); reading `Overlay` as "everything positioned about the Gantt" (that is the Gantt DOM)

**OverlayHost** (retired name):
The plan-stage name for this layer, before S5.3 shipped it (`plans/s5-extensibility-and-editing/s5.3-overlay-and-popup.md`). It shipped as the **Overlay** instance of the shared **Mount layer** shape instead, so a plugin author names `MountLayer`/`ctx.view.overlay`, never `OverlayHost`.
_Avoid_: Treating this as the shipped name — see Overlay, Mount layer

**Gantt DOM**:
This Gantt's own rendered DOM, read as questions (`view/gantt-dom.ts`'s `GanttDom`, `ContainerDom`; public as `ctx.view.dom`). Three of them: `owns(node)` — is this event mine (I2); `targetUnder(node)` — what is this node; `barFor(id)` / `cellFor(id, field)` — where is this entry's element. It also carries `bounds`, `paneBounds` and `cellText(cell)`. It exists because `extensions/` may not import `render/` (D-S5-5), so every class name crossing that boundary is a contract: `render/dom/dom-contract.ts` declares them, `view/gantt-dom.ts` is the only reader, and `view/gantt-dom.test.ts` paints a real frame and asserts the two still agree. Before it, a plugin retyped eight `.fg-*` selectors and three `data-*` keys, and a rename broke every plugin with a green build.
_Avoid_: Overlay (that is the mount layer only — see above), DOM helper, selectors

**Pane of a node**:
`GanttDom.paneOf(node)` (#177): which Pane holds a node — `'grid'`, `'timeline'`, or neither. It answers by element identity, so it is a `contains` check and reads no layout. Pair it against Pane bounds, which answers the _geometric_ question: an ownership question ("whose scroll was that", "which pane did the user act in") goes to `paneOf`; a placement question ("where do I flip and clamp this box") goes to `paneBounds`. Asking geometry about ownership is what kept a Popup's scroll dismissal unscoped, and cost it three `getBoundingClientRect` calls per scroll event anywhere in the document.

**DOM target**:
What one node in a Gantt's own DOM stands for — `{ kind, element, entry?, entryIds, field? }`, returned by `ctx.view.dom.targetUnder(node)`. The `Segment` type retired (ADR 0026, #421): there is one id set on this type now, not two. `kind` is `model/`'s **TargetKind** (`'row' | 'cell' | 'bar' | 'header' | 'splitter'`), the same union `CommandTarget.kind` uses: one vocabulary for "what did this land on", so a resolved right-click fills a `CommandContext.target` with no translation. The object is frozen and memoized on the element it came from, so a pointer resting on one bar allocates nothing (I5).
It answers two questions about Entries, because a Row may own several (#185, #199). The **subject** is `entry` — the one Entry whose Fields this node's content shows, which a tooltip describes and the Cell editor anchors on, and which `data-entry-id` names on a row. `entryIds` is everything the node stands for, and is what an action on the node acts on: for a bar the two agree, and for a row (and every cell of that row) the subject is the row's first Entry while `entryIds` names every Entry the row owns — a segmented parent's row owns its own Entry only, its children's bars living on the same row draw as their own nodes. The set comes from one read surface, `FrameLayoutView.entryIdsForRow` (`layout/frame-layout.ts`, #230 R3). `ContainerDom` holds that surface rather than a closure per question, so a reader never re-derives it, and the pointer path and the gesture path can never answer differently. `CommandTarget` carries the same word, and has no `rowId`: that name said Row and meant Entry. Its `entryIds` is the same word but not always the same set (#199): a `DomTarget` states a DOM fact, and a `CommandTarget` states what the command acts on. A right-click resolves the second from the first and the Selection — the Selection when the thing you clicked is part of it, and the thing you clicked when it is not.
_Avoid_: HitResult (that is `render/backend.ts`'s own point-based answer, `{ itemId, edge? }` — a different question), a second `*Target` union, `rowId` for an Entry id (retired in #199 — this repo has a real `RowId` brand), `segmentIds` (retired in #421, ADR 0026 — `Segment` no longer exists, so there is one id set to name, not two)

**Acted-on** (ADR 0010, ADR 0025, issue #212):
What one invocation acts on — `CommandTarget`'s `{ entryIds }`, resolved once and read by every path (pointer, context menu, keyboard chord). The `Segment` type retired (ADR 0026, #421), so `entryIds` is the whole answer now, not a projection of a second, Segment-keyed set: every command reads the same one set, and two commands can never disagree about what a gesture reached.
_Avoid_: `actsOn` as a per-command declaration (considered and rejected, ADR 0010 — a declaration adds a state to describe, a default to argue about, and a way for two commands to disagree)

**A `CommandContext` names three different Entries, and they can disagree on a segmented row** (Q35, `#421` C9a):
**Subject** is `ctx.entry` — the Selection's first Entry, read unconditionally, regardless of how the command fired. **Acted-on** is `ctx.target.entryIds` (above) — DOM focus, resolved through `ctx.view.dom.targetUnder`. **Focused** is whichever node carries real DOM focus (`view/roving-focus.ts`), which `target` is built from but a command never reads directly. On an ordinary row all three agree. On a segmented row (`childrenAsSegments`) they can split: a right-click _inside_ a multi-bar Selection, and every keyboard path (`Shift+F10`, the Menu key, `Mod+Arrow`), never replace the Selection first, so `entry` can name one bar while focus — and `target` — names another. A command meaning "the Selection's subject" reads `entry`; a command meaning "the node the user just acted on" reads `target`.
_Avoid_: treating `ctx.entry` as "the clicked bar" (true only on the one path where a right-click lands outside the Selection and replaces it, `plans/02` §4.6)

**Scoped DOM listener**:
`ctx.view.onDomEvent(type, handler, options?)` — one `document` listener, kept to the events this Gantt owns, handing the handler the resolved DOM target and filing its own removal (capture flag included) in `ctx.disposables`. Added in 2026-09-04's review (A4): eleven hand-written `document` listeners each wrote the "is this my Gantt?" guard themselves, and `inlineEditing()`'s `scroll` listener had no guard at all. A listener that must hear events _outside_ its Gantt — a dismiss-on-outside-pointer — is the one exception, and `extensions/popup.ts` is the only place that takes it.
_Avoid_: `on`/`off` (those name the Gantt event bus — a different mechanism with a different vocabulary)

**Cell editor**:
The in-place editing control `inlineEditing()` opens over one Grid cell (S5.8, D-S5-19/D-S5-20; `CellEditorSession`, `.fg-cell-editor`). One open at a time. Not a Popup: it owns a live `<input>` end to end, it mounts in the Row layer so the pane's own scroll carries it (#158), and a refused commit keeps it open in the invalid state instead of dismissing it (#137 F5). In the invalid state the editor shows a discard button and names its reason on the wrapper, so Escape is not the only exit (D-S5-47).
_Avoid_: Inline editor (names the feature — `inlineEditing()` — not the one control it opens), Field editor (a Field is what a value is; this edits one cell of one entry)

**Discard**:
Closing an open Cell editor and writing nothing (`inlineEditing()`, S5.8, D-S5-47). Escape discards, and so does the `freegantt.discardCellEdit` command and the button the editor shows in the invalid state. The stored value never changed, so a discard restores nothing and produces no ChangeSet, no event and no undo step.
_Avoid_: Cancel (the library refusing a ChangeSet is a Veto — ADR 0006; the pointer machine's own `cancel` abandons a drag), Revert (that is what undo does to a value already written — see `data/`), Close (an editor closes on a commit too, which writes)

**Popup**:
The `extensions/popup.ts` anchoring/flipping/clamping/dismissal primitive (S5.3, D-S5-8/D-S5-9) built on `ctx.view` alone — the Overlay it mounts in, plus the Gantt DOM's rects it places against. One implementation serves the tooltip and the context menu. Each caller holds its own instance: `open()` replaces only that instance, so a hover tooltip and a context menu may both show. The Cell editor is deliberately not a consumer: it needs a live, listener-attachable control rather than a static Element description, and it follows a scroll rather than dismissing on one (#158). Dismisses on Escape (folded into the shared Keymap, C3), an outside pointer, a scroll of the anchor's own pane, or blur, per its `dismissOn` option.
_Avoid_: Tooltip, Menu (both are one consumer of this shared primitive, not the primitive itself), Open popup (rejected on #224 — the Gantt does not hold one popup at a time)

**Dismiss trigger**:
Why a Popup closed _itself_: `'escape' | 'outsidePointer' | 'scroll' | 'blur'`. `PopupOptions.dismissOn` names which ones apply; `PopupOptions.onDismiss(trigger)` tells the owner which one fired, after the close. A `close()` the owner called is not a dismissal and never fires it — the owner already knows. Added in 2026-09-04's review (C3): without it an owner either leaked its listeners or polled `isOpen` on every click in the page, and `createPopup` is public, so every third-party plugin inherited that choice.
_Avoid_: Close reason, dismissal cause (the type is `DismissTrigger` — one name)

**DisposableStore**:
The `extensions/disposables.ts` collection of cleanup callbacks a `PluginRuntime` or a Popup accumulates and frees together with one `disposeAll()` call; latches after disposal (cannot be reused — a fresh instance replaces it instead, e.g. `Popup.close()`). Deliberately reuses "Store" outside `data/`'s own sense (a normalized entity collection like `Dataset.entries`) — spec-mandated name (S5.1); the two senses do not overlap in any one file, so no rename is planned.
_Avoid_: Confusing with `data/`'s Store sense — see above

**ElementDescription**:
The plain, DOM-free data shape (`layout/` — `render/dom/element-description.ts`'s `buildElement` is its one-shot build function, S5.3/D-S5-10) describing a node's tag, attrs/class/style, and text-or-`html`-or-keyed-children content. The one seam `extensions/` has into the reconciler, since it may not import `render/dom` itself (D-S5-5): a Popup or a plugin builds one and hands it to `ctx.view.renderElement()`. Raw `html` is explicit opt-in only (I13); `text` is always `textContent`.
_Avoid_: Vnode, template (both imply a framework-shaped diffing/compilation step this plain data shape does not have)

### Errors

**Refusal**:
The library saying no on purpose — a `beforeChange` veto, a capability that resolved false, a value a Field cannot read back, a gesture a plugin declined. A Refusal is the library working correctly, so it reports at `severity: 'info'` and is never a Fault. Core is the only thing that can observe one: `transaction.ts` throws `MutationCancelledError` after `beforeChange` returns false, and a plugin's own handler ran beside the vetoing one and never learns the outcome (ADR 0009). Three type families carry one, at three layers, and no single type joins them. `RefusalNote` (`data/event-bus.ts`, re-exported by `view/event-bus.ts`) holds the words a `before*` handler wrote through `refuse(reason)`. `GestureRefusal` (`view/gesture-pipeline.ts`) is what one refused move or resize reports. `CellEditorCommitRefusal` (`extensions/features/inline-editing.ts`) names why a cell editor's commit left the editor invalid; "Commit" names the act there, the one sense ADR 0006 keeps the word for. `buildRefusalReport` (`data/error-reporting.ts`) is the one builder that turns a refused `before*` veto into an `ErrorReport`, so `severity: 'info'` and `by: 'consumer'` are stated once and no raise site restates them. All four are internal — none of them reaches `etc/freegantt.api.md`.
_Avoid_: Error (the concept is not an error, even though it travels on the `error` event — see Severity), rejection, denial, failure (nothing failed)

**Error report**:
One `ErrorReport` — what the `error` event carries on both the Dataset and the Gantt: `at`, `code`, `message`, `severity`, `by`, and the optional `entryId`, `field`, `cause`, `reason` and `droppedReason`. It is a notification record, never something a consumer catches — the thrown class is `FreeGanttError`, a different thing with a near-identical name. Core raises reports and retains none: there is no `gantt.errors` array, because the cap, the overflow rule and the dedupe are the consumer's policy (ADR 0009). `by` names who refused — `'core'`, `'consumer'`, or a `PluginId` — because `origin` and `source` are both already spoken for. `reason` and `droppedReason` both answer "why", for two different raisers: `reason` is the free-text words a `before*` handler wrote through `refuse(reason)`, verbatim (#210); `droppedReason` is the closed `GestureDroppedReason` a `before*` handler never sees, set only when core drops a held gesture on its own (#377). A report carries at most one of the two.
_Avoid_: Problem, diagnostic (Diagnostic is the scheduling engine's own word — see above), log entry (nothing is logged), GanttError (one letter from `FreeGanttError`, which is the class you catch)

**Severity**:
How bad an Error report is: `'info'` — a Refusal, so nothing is broken; `'warning'` — degraded but recovered, such as a renderer that threw and fell back to the default output, or an ingest key dropped; `'error'` — something broke and nothing caught it. Three levels rather than a `'refusal' | 'fault'` pair, because those are two different things and not two levels, and a field named `severity` whose values are not severities would cover two concepts with one word. Telemetry routes on `severity !== 'info'`; a toast styles on all three.
_Avoid_: Level, kind (`TargetKind` and similar still claim it; Entry no longer does), category, `'fault'` as a stored value (it is the shape of `'warning'` and `'error'`, not a level of its own)

**Error feed**:
`ErrorFeed` (`api/watch-all-errors.ts`) — the structural shape a Dataset and a Gantt both satisfy: an `on`/`off` pair for the `error` event. `watchAllErrors(feeds, handler)` subscribes `handler` to every feed once and returns one `Disposer` that unsubscribes all of them. It de-duplicates by emitter identity, so `[dataset, gantt1, gantt2]` sharing one Dataset object subscribes that Dataset once. `gantt1` and `gantt2` still each report through their own feed.
_Avoid_: Listener, subscription (both name the mechanism, not the thing subscribed to), error stream (nothing streams — each feed raises discrete reports)

**Refusal notice**:
What a cell mounts when it will not open an editor and owes the user a reason (`inlineEditing()`, S5.8). It is the same `.fg-cell-editor` wrapper the editor itself mounts, in the same Row layer (#158), carrying `data-state="invalid"`, `data-reason="<key>"`, the reason as its text and the same words as its `title`. It mounts no control, takes no focus, and sets `pointer-events: none`, so the next double-click reaches the cell below it. Five things clear it: the next pointer press in this Gantt, Escape, a scroll, a Dataset change, and the next open. `inline-editing.ts`'s `REFUSAL_TEXT` holds every message, so no call site spells one. Which refusals speak and which stay silent is one seven-row table in [`s5.8-inline-editing.md`](plans/s5-extensibility-and-editing/s5.8-inline-editing.md) §1, under one rule: a cell that offers no editor refuses in silence, and a cell that offers one and cannot open it here names the reason. Added in 2026-09-04's review (SP1): four different refusals all looked like a dead double-click.
_Avoid_: Error for the notice itself (nothing is broken — the cell is stating a rule), warning, tooltip (a Tooltip is a hover affordance built on Popup; a refusal notice answers one action and is not a Popup at all). A Refusal does travel on the `error` event, at `severity: 'info'` — the payload carries the distinction this line protects (ADR 0009).

### Process

**Acceptance id**:
A `[Sn-Ax]` tag (e.g. `[S1-A2]`) linking one `plans/03-slices.md` acceptance box to the test that proves it — carried in that test's own title, fixed-string-searchable, and driven by `scripts/slice-gate.mjs`'s `tagged()` helper (S1.11, D-S1.11-1). Fixed-string, not a regex: `[S1-A2]` read as a regex is a character class matching one of `S`, `1`, `-`, `A`, `2`, which is how the gate's first design silently ran the wrong tests. An id is declarative about which runner(s) it lives in — the gate never infers a runner from a file path, because that would let an id silently migrate to the wrong kind of test (e.g. from e2e to unit) without the gate noticing.
_Avoid_: Test tag, test id (both read as generic testing infrastructure; Acceptance id is specifically the `plans/03` box <-> test link)
