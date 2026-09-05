# FreeGantt

A framework-free TypeScript Gantt library: layout and rendering of dated Entries over time. Scheduling — dependencies, propagation, constraints — is one optional first-party plugin (ADR 0002), not what the library is about. The core vocabulary is therefore domain-neutral (ADR 0003): a consumer charting shifts, bookings, machine uptime, or units sold per week is as much the intended user as one charting a project plan.

## Language

### Authored model

**Dataset**:
The body of authored data — its Entries, plus whatever scheduling-plugin-owned data (e.g. Dependencies) an installed scheduling plugin contributes — together with the settings that give it meaning, above all the IANA zone in which all zone-aware date arithmetic is performed. "The dataset's zone" and "the dataset's reference date" are properties of this, not of the runtime environment. A Dataset with no scheduling plugin installed has Entries and no Dependencies at all (ADR 0002). Renamed from Project in ADR 0004 — read every historical "Project" as "Dataset". `model/dataset.ts`'s `Dataset` is the structural contract `api/dataset.ts`'s `Dataset` class satisfies (`implements`) — the same structural/façade relationship the Gantt entry states, and the type `layout/` binds against without importing `view/` or `api/` (S1.7 §3.2; formerly `DatasetLike` in `view/gantt-shell.ts`).

`timeZone` is optional on construction (#129). Omitted, the Dataset resolves the environment's own zone once, at construction, and stores that resolved string. The zone is still a property of the Dataset, read from `dataset.timeZone` like any explicit value. Omission is a one-time authoring convenience, not a live link to the runtime environment. The Dataset never re-reads the environment afterward.
_Avoid_: Project (retired in ADR 0004 — see that ADR for why; the word smuggled scheduling/PM assumptions into a domain-neutral concept the same way `Task` once did for `Entry`), Plan, schedule (a schedule is an output of scheduling a Dataset, not the Dataset itself)

**Document**:
The `toJSON()` / `fromJSON()` shape of a Dataset (`DatasetDocument`): `schema`, `timeZone`, `dateOnlyEnd`, `rollUpKinds`, `fields`, and `entries`. A Document is a state, not a session — `fromJSON` constructs a fresh Dataset with an empty History. Function-valued keys (`aggregators`, `equals`, `compare`, `formatValue`) travel with the reading application, not in the Document. Top-level keys belong to the schema; anything of the consumer's goes in `meta` and survives byte for byte. Derived layout (`Row`, `Item`, `GeometryFrame`) never appears here.
_Avoid_: file, payload, snapshot — Snapshot is the committed array `entries.all` returns

**Store**:
The normalized, mutable collection one kind of authored entity lives in inside `data/` — `EntryStore` for Entries, and each plugin's own reserved `PluginStore` for its own entities (ADR 0002). A Store is `data/`'s own, not a consumer-facing word: `dataset.entries` is the published call site (D-S2-2, `plans/s2-data-core`), and "Store" names the class behind it, the way "Signal" names the reactive cell behind `dataset.entries.all`'s cached identity.
_Avoid_: Collection (too generic — every array is a collection), Repository (implies a persistence-layer abstraction this isn't; a Store has no I/O of its own), Table (a relational-database word this schema-free normalized store isn't)

**Snapshot**:
The committed, cached `readonly Entry[]` a Store's `all` returns (D-S2-2, D-S2-3). Its identity changes only when a transaction commits — not on every read — so a caller comparing two reads of `all` by reference is asking "did anything change" correctly. It shows the Store's last **committed** state only: a transaction's own in-body writes are visible through `get`/`has`/`size`, never through `all` (D-S2-21).
_Avoid_: View (View is a Row's rendering-facing sense, `plans/01` §2.3 — a different concept), Copy (implies a fresh array per call, which defeats the whole point of the cached identity), List (not a term this codebase uses elsewhere for a collection)

**DatasetState**:
The `data/` class holding one Dataset's live, private state — its Entry Store, its zone, its `dateOnlyEnd` rule, its Reference date, and (from later S2 steps) its extension hook, undo history and event bus. `api/dataset.ts`'s `Dataset` class is a thin façade that constructs one `DatasetState` and delegates every read to it — the same structural/façade relationship `Gantt`/`GanttShell` already has, one layer up. Named after the naming skill's five checks ruled out the alternatives: `DatasetCore` collides with this slice's own loaded use of "core" (a core step, core behaviour — `plans/s2-data-core` D-S2-22); `DatasetStores` promises less than the class holds (it is not only stores); inverting the pair so `data/` owns the name `Dataset` collides with `model/dataset.ts`'s existing structural `Dataset`.
_Avoid_: DatasetData (retired — "Data" already named three things in this codebase: the `data/` layer, this class, and the dataset itself), DatasetCore, DatasetStores (both rejected candidates, see above)

**Reference date**:
The `Instant` captured once when a Dataset is constructed — the one `Date.now()` read `time/` performs for that Dataset (CLAUDE.md confines `Date.now()` to `time/`). It stays fixed for the Dataset's lifetime; it is not re-derived on every layout pass. Used to initialize the zero-length `start`/`end` span of a `rollUpKinds` Entry (e.g. a newly created `'group'`) before the Span rollup gives it a real span.
_Avoid_: Now, current time (both read as live/re-evaluated, which this isn't), wall clock (that's Plain time's vocabulary — a Reference date is an already-resolved `Instant`, not an unresolved zone-less reading)

**Entry**:
One authored, dated record: a name, a start, an end, and a `kind`. Entries are persisted; they are what a consumer creates, edits, and hands to the library. What an Entry _means_ is the consumer's business — a task, a shift, a delivery, a day's sales — and core never assumes. The word is the accountant's: a dated line in a ledger. Its `id` is identity, never editable — `EntryEdit` (the shape `entries.update()` takes) omits `id` from `EntryInput` for exactly this reason, so there is no way to write an id-changing edit that typechecks.
_Avoid_: **Task** (retired in ADR 0003 — it implies to-do work, and the whole point is that the record is domain-neutral), activity, event, bar (a bar is what an Item renders), record, row (a Row is a display track)

**Kind**:
The authored classification of an Entry (`'span' | 'group' | 'milestone'`, open to consumer-defined values) that selects its behavior at four seams: scheduling policy, item emission, rendering, and interaction capability. Kind is never derived from structure (e.g. from having children) — it is always explicitly set by whoever authored the Entry. `'span'` is the default: an Entry that simply occupies its start-to-end stretch, with no further meaning attached. `kind` is required on the stored Entry (issue #84) — every reader can trust it is present, since ingest applies the `'span'` default once, at the api/ boundary; it stays optional on Entry input, where a consumer may omit it. _Exception:_ `hierarchy.autoGroup` (`02` §2, on by default) promotes a `'span'` entry to `'group'` in the same transaction it gains its first child — an automated edit, not a derivation the store computes on the fly. It promotes `'span'` only; any other Kind stays as authored. It never demotes, so kind still can't silently flicker based on current structure. `rollUpKinds` (default `['group']`) names which Kinds get their values from the Rollup instead of authoring them directly — a consumer's own Kind opts in the same way `'group'` does by default. `rollUpKinds: 'none'` (stored as `[]`) opts every Kind out: the parent keeps the values the caller assigned.
_Avoid_: Type (reserved for `DependencyType`), category; and `'task'` as the default kind's name (ADR 0003 — a kind literal is data, so leaving the old word there would have kept it in every authored Entry)

**Hierarchy**:
The Dataset setting that governs first-child Kind promotion. Default is `{ autoGroup: true }`. Call: `new Dataset({ hierarchy: { autoGroup: false }, entries })` to opt out. When it is on, a `'span'` parent becomes `'group'` in the same transaction that gives it its first child — one changeset, one undo step. Construction promotes too, silently. It never demotes, and it never promotes a Kind that is not `'span'`.
_Avoid_: deriving Kind from "has children" (that is the identity problem `01` §2.5 forbids)

**Dependency**:
A first-class entity linking a predecessor Entry to a successor Entry with a type (`FS`/`SS`/`FF`/`SF`) and optional lag. Never embedded as an array on an Entry. Owned by the `entryDependencies()` plugin, not `model/` (ADR 0002; S5.0 grill, issue #111) — it exists only when that plugin is installed and lives in its reserved store, not on `Entry` or in core. The default scheduling plugin reads it through a read-only cross-plugin store view; it does not own it.
_Avoid_: Link (reserved for the rendered geometry of a dependency, i.e. what appears in `GeometryFrame.links`), Relationship

**`entryDependencies()`**:
The first-party plugin that owns the `Dependency` store, the link-create gesture, and dependency-arrow rendering. It runs standalone — installed with no scheduling plugin, it gives arrows with no auto-move. The default scheduling plugin `requires` it and reads its store one-way; `entryDependencies()` never names the scheduling plugin (S5.0 grill, issue #111; `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md` D-S5-31).
_Avoid_: `dependencies()` (collides with npm's "dependencies" at the call site), Link (see Dependency)

**Segment**:
One contiguous stretch of an Entry's span, when that span is interrupted rather than continuous (`Entry.segments`). Segments are authored — an Entry without them is simply one unbroken stretch — and each one emits its own Item. When Segments are present, `start`/`end` are the envelope of those Segments and stay in the same transaction as any Segment write. A direct `start`/`end` write on an entry that has Segments is refused; the consumer writes `segments` instead.
_Avoid_: Split, interval, piece

**Field**:
One named, addressable value on an Entry — declared once and used by every layer that needs it. Core ships `name`, `start` (`min`), `end` (`max`), and the computed `duration` as declarations of exactly the shape a consumer adds to, which is what lets a consumer's `cost` be edited, compared, rolled up and shown by the same code as `start` (ADR 0005, `01` §2.6). A consumer writes a Field with `dataset.entries.update('t1', { cost: 500 })` and reads it with `dataset.entries.fieldValue('t1', 'cost')` — one call for an entry-sourced, meta-sourced, or compute-sourced Field, with no reach into `entry.meta`. `dataset.field('cost')` is the resolved declaration (type merge applied, `source` filled); `dataset.fields.all` lists every declared Field, core Fields included. `kind`, `parentId`, `segments` and `meta` are Fields too, so the changeset has one path, but only a Field that declares `column` is a Grid column candidate. **`progress` is not a core Field** — it is scheduling-plugin data (ADR 0008). Fields belong to the Dataset (`fields`), because the Rollup writes stored, undoable, serialized values and runs at construction, before any Gantt exists. **A Field is what a value _is_; a Grid column is where a Gantt _shows_ it** — the one sentence that separates the pair.
_Avoid_: Attribute, property (both read as "a key on an object", which is the storage detail rather than the declaration), column (a Grid column names a Field and carries presentation only)

**Field key**:
A Field's name, and the same string the changeset's `field` carries. One name for one concept: it retires `EntryField`, which meant exactly this in `FieldUpdated` and gave the idea a second name (the #7 precedent). `CoreFieldKey` is the shipped subset — the keys of `Entry` — and it is what the per-field comparison table stays exhaustive over.
_Avoid_: EntryField (retired), field name, column id

**Field source**:
Where a Field's value lives: `entry` (a core key), `meta` (a consumer key the consumer declared), or `compute` (no stored value — read from other Fields). A Field that omits `source` lives in `meta` under the Field key. Write `{ from: 'meta', key }` only when the Document key differs. The source decides whether a rolled-up parent value is **stored** (changeset, undo, Document) or **computed on read** and never written.
_Avoid_: Storage, backing, accessor; and note this is Row source's word applied to a different subject — say "field source" or "row source", never a bare "source"

**Field type**:
A named bundle of Field settings — a rollup **name**, an equality rule, a sort `compare`, text formatting, and column presentation defaults — applied with `type: 'money'` so one declaration serves many Fields. The bundle's `rollUp` is the default Aggregator name (shipped or a consumer name in `aggregators`) for Fields that name this type and omit `rollUp`; `formatValue` is the default display text; `compare` is the default sort order. The Field's own keys win, so `rollUp: 'none'` on the Field opts that Field out. The Aggregator function lives in `aggregators` under that name, never on the bundle. Core ships no primitive Field types. `api/` splits it: the data half reaches `data/`'s registry, the presentation half reaches `view/`, so the consumer writes it once and the layer boundary still holds.
_Avoid_: Column type (the bundle is broader than a column), Kind (Kind classifies an Entry, not a value), putting a function on `rollUp` (ADR 0005 — a name serializes, a function does not)

**Field registry**:
The one `data/` module that holds every declared Field — core Fields and consumer Fields on the same code path — resolves `type` merge and `source`, and is the legal set for `update()` and `fieldValue`. `readField`/`writeField` are the only switch over `FieldSource`. `layout/` never imports it: resolved `columns` and `fieldCompares` arrive on `LayoutInput` as plain data (D-S4-13).
_Avoid_: Field map, schema registry (this is not a separate persistence layer — the Document carries the data half of each Field)

**Aggregator**:
The function that turns a set of children's values into a parent's value for one Field — `min`, `max`, `sum`, `count`, `'none'`, a duration-weighted mean, or a consumer's own. Always referenced **by name**, never passed inline: a name is data that serializes into a Document and can be refused when it is not registered, and a function is neither. Returning `undefined` means "no opinion, leave the stored value alone". `'none'` always returns `undefined`, so that Field keeps the parent's authored value. A shipped Aggregator skips holes (`undefined`, non-numeric for `sum`/`min`/`max`, zero-duration children for the weighted mean) and never throws; if every child is skipped it returns `undefined`. The Aggregator is the function; the Rollup is the pass that runs it.
_Avoid_: Aggregation (the noun for the pass is Rollup — one concept, one word), reducer, accumulator, closure on the Field (the function is registered under a name)

### Mutation

**Transaction**:
The unit of mutation: a batch of proposed edits that runs the extension hook once and commits as one ChangeSet. One transaction per user gesture, at commit — never per intermediate drag frame. A nested `transaction()` call joins the already-open one and returns its own body's value without committing a second time; only the outermost call runs the commit sequence. Inside an open transaction, `get`/`has`/`size`/`childrenOf` read through the Write set, so a body can read its own not-yet-committed edits (read-your-own-writes) — `all` stays committed-only, since it is the cached Snapshot.
_Avoid_: Batch, operation

**ChangeSet**:
The single, atomic record of everything one transaction changed — added/removed/updated entities across stores, tagged with an `origin` (`'user' | 'undo' | 'redo'`; `'engine'`/`'load'` arrive with their producers). Every mutation produces exactly one ChangeSet, even when the extension hook's installed scheduling plugin triggers cascades. Folding is net-effect: a field written more than once inside one transaction appears at most once, `from` its pre-transaction value and `to` its final one; a field set back to its starting value, or an add immediately followed by a remove of the same id, is folded away entirely and never recorded. An empty ChangeSet — nothing left after folding — commits nothing, emits neither `beforeChange` nor `change`, and pushes no history entry. While `beforeChange`/`change` are fanning out, the built ChangeSet is frozen (dev-mode assert) and no mutation may run — `MutationDuringNotificationError` catches a handler that tries.
_Avoid_: Diff; Transaction (the scope that produces one); Commit (the act that produces one, and S1.8's `gridWidth` sequence, which produces none) — ADR 0006

**Origin**:
The tag on a ChangeSet naming why the transaction ran (`'user' | 'undo' | 'redo'` in S2; `'engine'`/`'load'` land with the producers that need them). Read by the undo History to decide what it records — a `'user'`-origin commit is undoable, an `'undo'`/`'redo'`-origin one moves the History's cursor instead of pushing a new entry.
_Avoid_: Source (Field source already owns that word), reason, cause

**History**:
The undo/redo stack (`data/history.ts`) — a subscriber to `change`, not a step in the commit path: it records a `'user'`-origin ChangeSet, and moves its cursor rather than recording on an `'undo'`/`'redo'`-origin one. `undo()` Replays the ChangeSet at the cursor inverted (`to`→`from`, `added`↔`removed`), `redo()` Replays it exactly as recorded. Deleting `data/history.ts` and its one construction line leaves the commit path unchanged, byte for byte (D-S2-23) — a consumer could write this file themselves, using only `on('change')`, `invertChangeSet`, and `replay`.
_Avoid_: Undo stack (names the data structure, not the subscriber that owns it), journal, log — Changeset log is the harness panel that renders a `ChangeSet`, a different thing entirely

**Replay**:
Applying a recorded ChangeSet exactly, through `Dataset.replay(changeSet)` — no extension hook, no Rollup (D-S2-14), so an engine whose behaviour changes between library versions cannot rewrite History. `changeSet.origin` must be `'undo'` or `'redo'`; `'user'` throws `InvalidReplayOriginError`. `undo()`/`redo()` are built on this; a consumer History uses the same door (`plans/s2-data-core/s2b-undo-replay-seam.md`).
_Avoid_: Apply (the sync adapter's own job, D-S2-11, not open yet), Commit (the transaction's moment, ADR 0006)

**Write set**:
The open Transaction's in-progress `{ before, after }` record per touched field, kept separate from the Store's committed indexes until commit. `get`/`has`/`size`/`childrenOf` read through it (read-your-own-writes); `all` does not. Discarding it — on a thrown body or a `beforeChange` veto — is the whole of rollback; there is no undo-engine involved in an in-flight transaction.
_Avoid_: Draft (gesture-state prose, not this — see **Draft** under "Direct manipulation"), staging area, buffer

**Veto**:
A `beforeChange` handler returning `false`, refusing the whole ChangeSet before it commits. Fires after the extension hook and the Rollup, on the ChangeSet that would actually be written, and before the Store write — so a handler judges the real cascade-inclusive change and a refusal is an early return, never an undo of work already applied. Sync-only, unlike gesture vetoes: a data commit has nothing to suspend an `await` into. A vetoed programmatic call (e.g. `entries.update()`) throws `MutationCancelledError` carrying the refused ChangeSet; a vetoed gesture stays silent, the way `beforeGridWidthChange` already behaves.
_Avoid_: Cancel, reject, block (the codebase's one word for this is Veto — ADR 0006)

**Subscription**:
A held registration on a Dataset or Gantt event, created with `on` and released with `off` — the same pair on both objects (plans/02 §3). `data/` owns the Dataset bus; `layout/`'s Bound value is a different mechanism. `view/dataset-change-subscription.ts`'s `subscribeToDatasetChanges` is the one built-in reaction: it calls `dataset.on('change', …)`, pushes the fresh `entries.all` snapshot into the bound viewport, and requests a frame — using nothing a consumer could not use (D-S2-20, D-S2-24). Its handle's `unsubscribe()` is that helper's own word for calling `off`.
_Avoid_: Attachment (that wires a DOM element; this touches no DOM), Binding (that is `layout/viewport/`'s word for a Gantt's own data contribution to a shared model)

**EntryEdits**:
A batch of proposed field changes, keyed by Entry: `ReadonlyMap<EntryId, EntryEdit>`. The shape a caller writes to `dataset.entries.update()`, a transaction hands to the extension hook as `EditRequest.proposed`, and an extender returns as its own extra writes — one shape for "an edit" wherever one appears, rather than a second type per producer.
_Avoid_: Patch, FieldPatch (retired 2026-08-27 — `data/` diffs an `EntryEdits` against the store into `FieldUpdated` rows itself, rather than asking every producer of edits to compute a diff)

**EditRequest**:
What a transaction hands the extension hook, once per transaction: the current entries plus the caller's proposed edits (`{ entries, proposed }`). `entries` is a `Map`, keyed by `EntryId`, not an array — `EntryStore` already keeps one internally.

**EditExtender**:
The function type that may occupy the extension hook: `(request: EditRequest) => EntryEdits`. Returns extra writes only — the same shape the caller's own edit takes, not a wrapped or partial record of it. `data/` holds exactly one, calls it once per transaction, and defaults to `identityExtender`, which returns an empty `EntryEdits`.
_Avoid_: ProposalResolver (superseded); EditAdjustment/`{ patch }` (retired 2026-08-27, along with `FieldPatch` — see EntryEdits. Chosen for a plain, usable API now over matching a scheduling-plugin contract that has not been designed yet; S7 makes its own return-shape call when it exists)

### Scheduling

**Extension hook**:
The generic, synchronous hook `data/` calls once per transaction, letting one installed extender add extra field writes to the proposed edit (D4, `plans/01` §1) — adding nothing when no scheduling plugin is installed, or whatever the installed plugin's `schedule()` returns otherwise. `data/` has no static, scheduling-specific dependency; this hook is the only seam. Exact contract (where per-plugin per-entry data lives, how preview and commit-time calls share one resolution) is design work tracked in issue #12.
_Avoid_: Scheduling hook (the hook itself is scheduling-agnostic — it's generic, and a non-scheduling plugin could occupy it)

**Scheduling plugin**:
Whatever plugin occupies the extension hook, if any. FreeGantt ships an official propagation-and-calendar engine as its first-party default (D3) — described in §7 below. It `requires` and reads the `entryDependencies()` plugin rather than owning `Dependency` data itself (S5.0 grill, issue #111) — the two ship as separate plugins so a consumer can keep FreeGantt's arrows and swap in their own engine. Core does not require either plugin to function (D4, ADR 0002).
_Avoid_: The scheduling engine (ambiguous between "the seam" and "FreeGantt's default implementation of it" — say "the extension hook" or "the default scheduling plugin" explicitly); calling this plugin the owner of `Dependency` (see `entryDependencies()`)

**SchedulingPolicy**:
The pluggable seam, within the default scheduling plugin, that resolves how a proposed edit interacts with an Entry's kind and existing schedule (e.g. whether the engine may move it, how a `'group'` Entry rolls up from children). Kind-specific scheduling semantics live in the policy, never in the engine itself.
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
A horizontal track of a Gantt — the unit of vertical layout, and what the grid pane and the timeline pane both position against. Rows are derived on every layout pass and never persisted. A Row is not an Entry: one Row may carry the Items of many Entries, and a row source may produce Rows that correspond to no Entry at all. `Row.kind: 'header'` is a grouping header that stands for no Entry (`entryIds` is empty). An Entry of kind `'group'` produces a row of `Row.kind: 'entry'`. Collapse holds `RowId`s; for the entries source a `RowId` equals the `EntryId`. A grouping header uses a derived `RowId` from the group key. Its name cell is `headerLabel`; other cells are empty.
_Avoid_: Line, track (a track is what a Lane is), record; reading `Row.kind: 'header'` as "a `'group'` Entry"; using `'group'` as a Row kind (that literal is `Entry.kind` only)

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

**Item**:
A derived, renderable piece of geometry produced from an Entry for one Segment of its span — most entries produce exactly one Item, but an Entry with Segments produces one Item per Segment. Items are recomputed on every layout pass and never persisted. `Item.id` is deterministic: `${entryId}:${segmentIndex}`.
_Avoid_: Bar (an Item is what a bar renders; "bar" is a rendering detail, not the identity)

**Item producer**:
The per-Kind seam that turns one Entry into its Item(s) for a row (`ItemProducer`). Shipped occupants cover `'span'`, `'group'`, and `'milestone'`; a plugin adds one for a consumer-defined kind via `ctx.layout.registerItemProducer` (S5.9, D-S5-22). `wholeEntryItem(entry)` is the public helper for the common case — one Item over the entry's whole span — so a producer reads `(entry) => [wholeEntryItem(entry)]` and no plugin restates the `${entryId}:${segmentIndex}` id convention (review P3).
_Avoid_: Item emitter (retired name — `registerItemEmitter` was renamed to `registerItemProducer`, Q16)

**Lane**:
A sub-track within a Row, assigned by the layout pass so that Items whose spans overlap on the same Row are stacked instead of drawn on top of each other. A Lane is a packing result — always derived, never authored.
_Avoid_: Sub-row, level, stack

**Lane packing**:
The pass that assigns each Item on a row to a lane index and computes `laneCount` and row height under `heightMode: 'pack'` (`packRow`). Memoized per row per dataset revision (D-S4-26).
_Avoid_: Stack layout, sub-row layout

**Grouping**:
The row-level nesting of the timeline grid (parent/child rows via `parentId`). Distinct from Kind: an Entry of kind `'group'` produces a `Row.kind: 'entry'` row; a grouping header is `Row.kind: 'header'` and stands for no Entry (`entryIds` empty, `headerLabel` in column 0, other cells blank — D-S4-23).
_Avoid_: Group (ambiguous with the `'group'` kind — say "row grouping" or "the `'group'` kind" explicitly); reading `Row.kind: 'header'` as "a `'group'` Entry"

**Rollup**:
The bottom-up pass in the commit path that derives a parent's value for a Field from its children's, using that Field's Aggregator. It is a core step, not a resolver: it runs whether or not a plugin is installed, and nothing installable can displace it (D-S2-22). It is a leaf with one importer (`data/transaction.ts`). Default is on. `rollUpKinds: 'none'` (or `[]`) skips derivation so every parent keeps the values the caller assigned. After Field-type merge, a Field with `rollUp: 'none'` or with no `rollUp` skips that Field only. The pass walks the ancestor chains of touched entries only, deepest first (D-S4-8) — one path for shipped and consumer Aggregators alike. It yields to a field the caller proposed in the same transaction and wins over one the extension hook proposed. One pass settles nested parents, because the walk is bottom-up. The **Span rollup** is `start` as `min` and `end` as `max` over the children of a rolling-up Kind — not `sum` of Instants.
_Avoid_: Group rollup (the pass is not tied to the `'group'` Kind, nor to spans — it is per Field, over any rolling-up Kind), rollup pass (says "when," not "what"), aggregation (Aggregator is the function; Rollup is the pass)

**Grid column**:
One vertical slice of the grid pane. A Grid column names a Field that declared `column` and carries presentation only — header, width, alignment, cell renderer, editability. A Field with no `column` key is data only: it rolls up and appears in the changeset, and `gridColumns` may not name it. Grid columns belong to the Gantt (`gridColumns`), because which of the columnable Fields this view shows, and in what order, is a view question. Aggregation never lives on a Grid column: a stored value must not depend on whether a column is visible, and the Rollup has already run before any Gantt is built. Default `gridColumns` is `['name']`; naming a Field does not add it to the grid by itself. A cell renderer receives both readings of one cell: `value`, the string the library painted, and `fieldValue`, the same Field value before formatting (review H3) — so a renderer branches on the number and never parses its own output back.
A **hidden** Grid column is declared but not painted (D-S5-34): `hidden: true` keeps it in `gridColumns`, keeps its width and keeps its place in the order, and takes it out of the grid, the pane width and `resolvedColumns`. `gantt.hideGridColumn(field)` and `gantt.showGridColumn(field)` write that one key, so hiding one column never restates the list and never drops what the user set on the others.
_Avoid_: Column on its own (says nothing about which side it is on), Field (a Grid column names one, it is not one), cell (a cell is one Grid column's value on one Row), invisible/collapsed for a hidden column (Visible is the culled region, and Collapse is the row tree's own state)

**GeometryFrame**:
The complete, backend-neutral description of one rendered state: the visible Rows, the Items' boxes, the Dependency paths, and decorations, all as plain numbers. It is what a render backend consumes and the only thing it consumes — no consumer render output, no hit-region index, no DOM.
_Avoid_: Scene, render tree, viewport model

### Mounted instances

**Consumer**:
The application or page that embeds FreeGantt and calls its public API — the audience meant whenever CONTEXT.md or a spec says what "a consumer" does, wants, or authors (an Entry, a stylesheet override, a plugin). Distinct from Container, the DOM element that consumer's page hands to a Gantt to mount into.
_Avoid_: Host (retired, #64 — the word named both this and Container, #7's "chart" failure repeated)

**Container**:
The DOM element (or a CSS selector naming one) a consumer hands to `new Gantt({ container })` to mount into — `GanttOptions.container`, `resolveContainer()`, `.fg-container`. One Gantt owns exactly one Container for its lifetime.
_Avoid_: Host (retired, see Consumer), Mount target (a Render surface — a different, lower-level concept the Container is split into, see Render surface)

**FrameLayout**:
The `layout/` object that runs one Gantt's layout pass (`layout/frame-layout.ts`) and keeps what that pass must remember between renders — the row-height index and `FrameMemory` (lane-pack caches). `computeFrame` stays pure; `FrameLayout` is what makes the index O(log n) _across_ renders rather than per render. One instance per Gantt: the index describes that Gantt's rows and is not shareable, unlike a TimeScaleModel or a ScrollModel.
_Avoid_: Layout cache, frame builder (it computes the pass; the cache is how, not what)

**Frame memory**:
What one `computeFrame` pass remembers when `FrameLayout` calls it again — today the `RowHeightIndex` and per-row lane-pack results. Passed as the optional second argument to `computeFrame`; not public (D-S4-19).
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
An `end` written as a bare calendar date — `'2026-09-08'`, no time of day. Storage is half-open `[start, end)`, so `end` is the boundary after the entry rather than its last moment, but a consumer writing a bare date means the last day it wants included. The `dateOnlyEnd` option names which of the two readings applies, and it applies to nothing else: an end that already carries a time of day is a boundary already.
_Avoid_: Inclusive end, end date (an option named `endDate` should hold a date, not a rule)

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
The value a viewport model resolves from every current Binding, together with the contract for telling those bindings about it (`layout/viewport/bound-value.ts`, D-S1.5-4): bind always notifies the newcomer, every other notification fires iff the resolved value changed. One collection serves both jobs — the bindings and their reactions are the same map. TimeScaleModel's is `{timeZone, range, pxPerMs}`; ScrollModel's is `{position, max}`. Scoped to `layout/viewport/`'s models by decision (`plans/01` §8.2 D-A), not a general notify primitive.
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
The fan-in object (`layout/viewport/viewport.ts`) that owns one TimeScaleModel and one ScrollModel behind a single `bind`/handle/reaction, so `view/` never holds more than one of either (S1.7, D-S1.7-1). One measurement — a pane resize — fans out through it to the scale's pane width, the scroll model's pane size, and Visible's own width/height, coalesced to one consumer notification. Not exported from `api/`; `view/` is its only caller. One Viewport serves one Gantt — it holds that Gantt's pane and content extents, so a second `bind()` throws rather than replacing the reaction. Sharing is what the models are for.
_Avoid_: Viewport width/size (that measurement is Pane size), the rendered/visible region (that is Visible)

**Visible**:
The culled region a Viewport resolves, in timeline-content coordinates, from the **locally clamped** scroll position — this Gantt's own pushed `{content, pane}` extents, not ScrollModel's loosest-bound-across-bindings `max` (D-S1.7-2). Feeds `LayoutInput.visible` directly and is what `attachScroll` writes back to the element.
_Avoid_: Viewport (Viewport is the object that resolves this, not the region itself), culling window (fine in prose as a synonym, but the type and field name are `visible`/`Rect`)

**Overscan**:
The live-reconfigurable culling buffer a Viewport applies before handing `visible` to `computeFrame`: `verticalRows` (through the row-height index, since row heights vary from S5) and `horizontalPx` (bars and header ticks only — rows stay vertical-only). Default `{ verticalRows: 2, horizontalPx: 128 }`; a zero value disables culling on that axis. Not exported from `api/` (issue #84) — an app author doesn't think in these units, and no real caller had asked for the knob; it stays live and internal to `layout/`/`view/` until one does.
_Avoid_: Buffer, padding, margin

**Header band**:
One row of the time-axis header, emitted per `ViewPreset.headers` entry, coarsest first (e.g. months over weeks). Each band carries its own `unit`/`increment` and Ticks; `render/dom` keys bands by index and ticks within a band, so a preset with one header renders one `.fg-band` wrapper.
_Avoid_: Header row (Header band is the term of art; "row" is reserved for grid Rows)

**ScrollModel**:
The standalone, shareable object owning a scroll position on both axes, and the only route by which any view or interaction code may read or write it. It resolves two things: the **position** — where the caller asked to be — and **max**, the loosest bound any bound Gantt needs, which is what a Pan clamps against. Max is not a claim about any one Gantt's scroller: each bound Gantt clamps the shared position to its own content, so a shorter chart stops at its last row while a taller one keeps going, and picks up where it stopped on the way back. Shared between Gantt instances the same way a TimeScaleModel is.
_Avoid_: Scroll position, offset, viewport state

**Pan**:
Moving the shared viewport — `ScrollModel.panTo`, plus the wheel and keyboard viewport gestures that call it (shift+wheel, Page/Home/End, unselected arrows). Public verbs on Gantt are `panToDate` / `panToToday` (loose InstantInput, never `scrollTo*`). One concept at two layers, which is why they share the word. Distinct from **scroll**, which means one element's native offset and is confined to `view/scroll-attachment.ts` (I12): a Pan may result in no scroll at all when the chart is already at its end. `panToInstant` is the Viewport-internal twin that already holds a branded Instant.
_Avoid_: Scroll (an element's native offset), move (move is dragging an Entry — `entryMove`), seek

**Viewport gestures**:
The read-only wheel and keyboard motions that change the Viewport and write nothing to the Dataset: ctrl/⌘+wheel anchored zoom (`zoomIn`/`zoomOut`, one `zoomPresets` step per wheel notch), shift+wheel pan, and keyboard pan (Page/Home/End always; arrows when nothing is selected). They live in `view/` (`attachWheelNavigation`, `attachKeyboardNavigation`), not `interaction/`, and they are exempt from the arm-threshold, escape-cancel, and one-transaction-per-gesture invariants. Live config is `Gantt.viewportGestures` — a boolean shorthand or `{ wheelZoom, wheelPan, keyboardPan }`. The imperative `zoomBy` / `panToDate` / `zoomIn` surface does not consult this flag. Distinct from **Capability** / `interactions`, which are per-entry and gate data gestures. Continuous density (`zoomBy`) is not a viewport gesture — it is an expert call.
_Avoid_: Navigation (that is the motion itself — Preset, Fit, Range, Pan, Anchored zoom — and the `navigationChange` event), interactions (per-entry data gestures)

**Reveal**:
Bringing a named Entry into view — the intent-level verb a consumer uses (`gantt.reveal(entryId)`). The library resolves the pixel position from the row geometry it already computes; a consumer never converts an index or a row height into a scroll offset. Nearest-edge, not center: a no-op if the Entry is already inside Visible, otherwise the Pan moves exactly enough to align the nearest off-screen edge. Landed on both axes at S1.9 (D-S1.9-6) — the x half was a no-op before Fit existed, since content width equalled pane width.
_Avoid_: ScrollTo, scrollIntoView, goTo, center (Reveal is nearest-edge; centering is a deferred, separate policy)

**Batch**:
Several writes to a viewport model delivering at most one notification, and only if the resolved value actually changed. No observer ever sees an intermediate state. A Batch is _not_ a Transaction: it has no changeset, no undo entry, and no extension hook — `layout/` has no edge to `data/`. The two words never substitute for each other.
_Avoid_: Transaction (that is `data/`'s unit of mutation), commit, freeze

**ViewPreset**:
The data description of one zoom level: what unit the ticks step in, how wide a tick _intends_ to be (`preferredTickWidthPx`) versus the density floor (`minTickWidthPx`), and one or more header bands sitting above them, coarsest first. A preset is a config object, so a new zoom level is never a library edit. `tickUnit` is never coarser than the finest header — a label must not claim a boundary no gridline draws. Each band's `format` is a Date format.
_Avoid_: Zoom level (a zoom level is what a preset expresses), timescale header

**Preset reference**:
What a caller states to name a ViewPreset: a shipped preset id (autocompletes against the closed `ShippedPresetId` union) or a full custom ViewPreset object. `resolvePreset` is the one place a Preset reference turns into a ViewPreset — a shipped id resolves against the built-in table and throws `UnknownPresetError` for anything outside it; a ViewPreset object passes through unchanged, so a custom preset is never a library edit. `resolvePreset` and the individually named preset constants (`dayPreset`, `weekAndMonthPreset`, and their siblings) are not exported from `api/` (issue #84) — resolution is core's own job; a custom-preset author needs `ViewPreset` and the `presets` record, not the constants or the resolver.
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
How a header band labels an Instant: an `Intl.DateTimeFormatOptions` object, or a `HeaderFormat` callback as the escape hatch (week numbers, unpadded hours). Resolved through `Intl.DateTimeFormat` in the Dataset's zone and the Gantt's locale — not through Temporal's `toLocaleString`. Year and month appear once, on the coarsest band that states them; finer bands drop those fields unless `repeatCoarserUnits` (`dedupeHeaderFormats`).
_Avoid_: HeaderFormat as the everyday name (that is the callback half only)

**Date line**:
A vertical marker at an Instant on the timeline. Geometry is a `DateLine` decoration. `gantt.todayLine` is the wrapper that emits the one at `now()`; a caller states any other Date line through `gantt.dateLines`, an array of `{ placeAt, label?, className? }`. `placeAt` carries the Instant — never `location`, which already names a pixel position (`model/geometry.ts`), and never `id`, since the list is index-keyed the same way Header bands are. Paint is `.fg-date-line` (S1.13, D-S1.13-8 — `.fg-today-line` is gone, no alias); the stroke is `border-left`, so a consumer's own `className` reaches `border-left-style`/`-width` with no new option (D-S1.13-5). The wrapper's stroke carries `data-flag="today"` (U5); authored list entries do not.
_Avoid_: Timeline (the pane, not this marker), cursor, now-line, location (that is a pixel position, not an Instant), id (`dateLines` has none — index-keyed like Header bands)

**Date line label**:
The text a Date line shows when it has a `label`. A sibling Part, `.fg-date-line-label`, mounted in `.fg-header` at the line's x — not the stroke's own `textContent`, which is unreadable at 1px wide (S1.13, D-S1.13-6). The `todayLine` wrapper's own line never gets one; give it a label by turning `todayLine` off and authoring the same Instant through `dateLines` instead.
_Avoid_: caption (used generically elsewhere), tooltip (this is always-visible, not hover-triggered)

**Today line**:
The Date line at `now()`. `gantt.todayLine` (default on) is the wrapper that emits it — `true`, `false`, or a pinned `InstantInput` (S1.13, D-S1.13-4), with no clock read once pinned. Updates on the next render, not on a clock tick. Paint marks it with `data-flag="today"` on `.fg-date-line`. `panToToday` pans to `now()`.
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
One step of the time axis at the current ViewPreset's resolution — the unit the header bands label and the unit a gesture snaps to by default. Since S1.7 a Tick also carries its own cell `width` (px to the next boundary at its band's step), so a DST-shortened or -lengthened day draws at its true width instead of an assumed constant. Width is floored by the preset's Tick width (`minTickWidthPx`); a pane too narrow to honour that floor scrolls.
_Avoid_: Gridline (a gridline is one way a Tick is drawn), step

**Tick box floor**:
The smallest CSS border-box a painted Tick cell can occupy (`--fg-tick-box-floor`, default 9). Distinct from Tick width (density on the axis). A sticky header label clamps to the pane edge only when the remaining cell is at least this wide; a thinner remainder keeps the Tick's true x.
_Avoid_: min-width (that is Tick width's `minTickWidthPx`), sticky min width, STICKY_LABEL_MIN_WIDTH_PX

### Direct manipulation

**Selection**:
The set of Entry ids a `Gantt` currently highlights — never Item ids, since "this Segment is selected but its siblings are not" means nothing yet (S3, D-S3-10). Per-Gantt, not per-Dataset: two Gantts bound to one Dataset can select differently. Written on pointerup, never pointerdown, and not at all when the gesture armed into a drag. The event pair keeps the concept word (`beforeSelectionChange`/`selectionChange`); the two public getters name the two readings of it, and the suffix is the only difference between them (#113): `Gantt.selectedIds` is the ids (loose in, branded out, live, writable), and `Gantt.selectedEntries` re-reads the bound Dataset for each id in `selectedIds`, in order, on every access — skipping an id the store no longer has (e.g. after a `remove`) rather than throwing. Internal holders of the id list keep the concept word (`GanttShell#selection`), because no second reading exists there to tell apart.
_Avoid_: highlight (paint detail, not the authored concept), `Gantt.selection` / `Gantt.selectionEntries` (retired in #113 — a public name with no axis word left the reader to learn from the types which side was ids), `selectedItemIds` (retired in #185 — paint keyed by Item made an Entry with Segments paint one bar of the several it drew; `InteractionState.selectedEntryIds` carries the same Entry ids the public word does)

**EntryGesture**:
The kind of data edit a drag is making — `{ kind: 'move' }` or `{ kind: 'resize', edge }` — the shape `interaction/entry-gesture-context.ts`'s `EntryGestureContext` carries through `draftFor`/`commit`. Distinct from the pointer machine itself (`createPointerGesture`, `pointer-gesture.ts`), which knows nothing about entries, drafts, or kinds — only threshold, capture, Escape, and long-press over plain `start`/`move`/`commit`/`cancel` callbacks.
_Avoid_: Gesture unqualified (collides with the pointer machine's own word — say "the pointer gesture" or "the EntryGesture" explicitly)

**Draft**:
Prose for a gesture's in-flight edit while a drag previews — not a type of its own (D-S3-2). A Draft **is** `EntryEdits`, the same shape `dataset.entries.update()` takes; nothing new is declared for it. Distinct from Write set (a Transaction's own in-progress record, once a Draft actually commits).
_Avoid_: Draft as a type name (there is none — see Write set's own _Avoid_ line), staging area, buffer

**Ghost**:
Hot-path paint of an in-flight Draft (and any extra `EntryEdits` the extension hook returned) as transforms on existing bar nodes — `data-state~="ghost"` for an extender extra, `data-state~="dragging"` for the caller's own grabbed bars. Discarded on cancel; never written to the Dataset until commit.
_Avoid_: Preview as a type name (`ItemPreview` is the internal pixel offset; Ghost is the user-visible paint)

**Nudge**:
One keyboard step of a selected entry, sized to one resolved snap unit, committed through the same `session().nudge()` pipeline a pointer `commit()` uses (D-S3-13, D-S3-23). One transaction per key press. Distinct from viewport pan (arrows pan only while the selection is empty).
_Avoid_: Step (that is Tick stepping), keyboard drag

**Interaction state**:
The one long-lived, mutable per-Gantt object `RenderBackend.applyState` diffs against (`hoveredItemId`, `selectedEntryIds`, `pickedItemId`, `resizableItemId`, `movableItemId`, `preview`, `pendingItemIds`, `cursorX`, `cursorLabel`). `selectedEntryIds` is the Selection itself, and a backend resolves which bars those Entries drew from the frame it synced (#185 — the retired `selectedItemIds` made the shell guess that). Hot path: class toggles and transforms only, no frame rebuild (I5, D-S3-6).
_Avoid_: Selection as this object's own word (the Selection is the public `Gantt.selectedIds` Entry-id set, which this object carries; the rest of it is paint)

**Picked Item**:
The one Item the pointer last picked — the bar a click landed on (`InteractionState.pickedItemId`, #185). It is an input to the shared resize-handle pair, never a paint of its own: the handles park on the picked bar while nothing is hovered. It clears once the Selection drops the Entry that drew it. A grid-row click picks no Item, so a segmented Entry selected from the grid shows no handles until a bar is hovered.
_Avoid_: focused Item ("focused" is DOM focus in `extensions/focus-trap.ts` and the focused row in `context-menu.ts`), hit Item (a hover is a hit too — `hitTest` answers both)

### Theming and accessibility

**Base stylesheet**:
The one stylesheet the library ever writes, injected once per document by `ensureBaseStyles` (`view/styles.ts`, S1.10). Idempotent per document via a `<style data-freegantt-styles>` marker — the document holds that state, not a module variable, so two Gantt instances in one document share one injected sheet without this being I2's kind of shared mutable state (the second call is a no-op precisely because the marker makes it safe to call twice). Ships every Token default and every Part's structural rule; there is no consumer-facing way to opt out (D-S1.10-8) — a consumer restyles it, it does not disable it.
_Avoid_: Default styles, styles.css (there is no separate package export — see D-S1.10-8)

**Token**:
A `--fg-*` CSS custom property — level 1 of the Customization ladder (`plans/02` §4). Metrics (`--fg-row-height`, `--fg-grid-pane-width`, `--fg-band-height`, `--fg-tick-box-floor`, `--fg-diamond-size`, …) are read once through `pixel-property.ts` or consumed as CSS `var()` fallbacks; colour Tokens (`--fg-bar-fill`, `--fg-pane-bg`, `--fg-date-line-color`, `--fg-selection-color`, …) are consumed directly by Base stylesheet rules with no JS in between. A consumer overrides any Token by setting the same property on the container element; the shipped default is always the fallback in `var(--fg-x, default)`, never the winner once a consumer has authored a value. `--fg-header-height` retired at S1.12 in favour of `--fg-band-height` (one band, not the whole header). `--fg-diamond-size` (bug hunt, S5 fixes) is a milestone bar's unrotated diamond side — `layout/frame.ts`'s `barSpan` floors a milestone's painted span to this Token's rotated bounding box (`size × √2`), so a consumer resize moves the bar's own hit box and selection outline along with the glyph, never just the glyph alone.
_Avoid_: Variable, custom property (accurate but not this project's term of art — say Token), theme variable

**Part**:
One of the `fg-*` class names the library's DOM structure carries — level 2 of the Customization ladder. The vocabulary is closed and un-renamed (D-S1.10-1), with one exception before 1.0 (S1.13, D-S1.13-8): `fg-container`, `fg-grid-pane`, `fg-grid-spacer`, `fg-grid-header`, `fg-col-header`, `fg-rows-clip`, `fg-rows`, `fg-splitter`, `fg-timeline-pane`, `fg-header`, `fg-band`, `fg-tick`, `fg-row`, `fg-row-label`, `fg-row-label-text`, `fg-row-twisty`, `fg-bars`, `fg-bar`, `fg-bar-bracket`, `fg-bar-diamond`, `fg-bar-handle`, `fg-date-line`, `fg-date-line-label`, `fg-cursor-line`, `fg-cursor-line-label`. A consumer writes level-2 CSS against a Part directly (`.fg-bar { ... }`) or against a Part plus a State attribute (`.fg-bar[data-flag~="conflict"] { ... }`).
_Avoid_: Pane (Grid pane/Timeline pane/Splitter are specific Parts, already named in "Mounted instances" — Part is the general term for the whole class vocabulary), BEM block (rejected, Q2 — renaming shipped classes to a BEM shape was churn with no behavior change)

**State attribute**:
A `data-*` attribute a Part carries so a consumer can select on state without JS — `data-flag` (space-joined, generated from `BarFlags`'/`LinkFlags`' own keys, D-S1.10-2: `conflict`, `cycle`; on `.fg-date-line` the Today line wrapper writes `today`), `data-kind` (an Entry's Kind), `data-state` on `.fg-bar` (`hovered`, `selected`, `pending`, `dragging`, `ghost`) and, since the bug hunt ("grid row highlight and row click"), on `.fg-row` as well (`selected` only — a row has no hover/pending/drag/ghost paint of its own; the same `--fg-selection-color` Token as the bar's own outline, painted as a background instead so it does not fight cell layout), `data-movable` (grab cursor), `aria-expanded` on `.fg-row-twisty` (collapsed vs expanded), `data-matched` on `.fg-row` (`false` when a filter kept the ancestor only), `data-testid`/`data-row-id`/`data-item-id` (stable E2E hooks, U6). Distinct from a Token (a value) and a Part (a structural class): a State attribute is level 2's other half, the thing a consumer's selector matches against rather than reads.
_Avoid_: Data attribute (too generic — say State attribute when it's part of the level-2 vocabulary), modifier class (there is no modifier-class convention here — state lives in `data-*`, never a second class)

**a11y label**:
`FrameBar.a11yLabel` — the library-computed string a screen reader announces for one bar (`${entry.name}, ${formatDate(...)} – ${formatEndInclusive(...)}`), composed in `layout/` from the dataset zone and set as `.fg-bar`'s `aria-label` at sync time (D-S1.10-5). Not the same thing as `Gantt.a11yLabel` — the live option that sets the _container's_ `aria-label` (default `'Gantt'`). Two different things sharing a root word: say "the bar's a11y label" or "`Gantt.a11yLabel`" explicitly, never "a11y label" unqualified where both are in scope (#7's "chart" lesson applies).
_Avoid_: aria-label (that is the DOM attribute `render/dom` maps this to — `a11yLabel` is the backend-neutral field `layout/` produces, same relationship `kind` has to `data-kind`), accessible name (a browser/AT term of art, not this project's field name)

### Extension

**Capability**:
Whether a specific gesture (move, resize, select, link) is permitted on a given Entry, resolved once per Entry from its Kind and gating both the gesture itself and any affordance that hints at it (e.g. a resize handle only renders if resize is capable). `select` is a Capability with no visual affordance — I14's refuse half still applies (pointer and keyboard skip an incapable entry); the public `Gantt.selectedIds` setter does not consult it (D-S3-9).
_Avoid_: Permission, ability

**KindDefaults**:
The middle precedence layer `resolveCapabilities` reads between the consumer's own `interactions` config and the library's built-in table — a plugin's per-Kind gesture defaults, registered via `ctx.interaction.registerKindDefaults` (S5.9, D-S5-22). A second registration for the same Kind overrides the first while both plugins stay installed. Disposing one removes exactly that registration, in any order. The newest registration still standing then wins.
_Avoid_: Interactions (that is the consumer's own per-entry config, one precedence layer above this)

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
`RendererRegistry`, `ItemProducerRegistry`; the table is the mechanism each of them holds), Map,
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

**GanttPlugin**:
The public extension contract: an `id` plus a `setup(ctx)` that returns a `Disposer`, or nothing.
A plugin returns one only for a resource it owns itself — a timer, a socket, a subscription of its
own. Every `register*` and every `onDomEvent` already files its removal in `ctx.disposables`, so
most plugins return nothing at all (review P4). Built-in features (tooltips, context menu, editors) are themselves GanttPlugins using the same `PluginContext` a third party would use — no back-door capabilities reserved for first-party code.
_Avoid_: Extension (Extensions is the name of the source layer that runs plugins; GanttPlugin is the unit within it)

**PluginContext**:
The object `setup(ctx)` receives — a GanttPlugin's entire world: dataset access, the event bus (including cancelable `before*` events), registration for decorations/columns/renderers/item-producers/interaction-controllers/keybindings, the command registry, and a disposable store. A plugin may not reach into anything outside it (enforced by the import-boundary lint). Every `register*` on it returns a `Disposer` and lives exactly as long as the plugin does; collisions resolve by one policy per seam shape (`plans/02` §4.4, and the Registration table entry above). `view/plugin-ports.ts` declares the whole shape, grouped the way a plugin reads it (`ctx.commands`, `ctx.interaction.*`, `ctx.view.*`, `ctx.layout.*`); `api/gantt.ts` adds `dataset` and `gantt` and nothing else, so a new seam is one edit in one file.
_Avoid_: Treating this as settled — the plugin system (`GanttPlugin`/`DatasetPlugin`/`PluginContext`) is still design work in progress; the shape, and possibly this name, may change before it lands

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
Every `register*` that declares a Field (`ctx.fields.register`) or a Grid column
(`ctx.view.registerGridColumn`) records the calling plugin's id. **Authored** is the consumer's half
of that answer, and it is what the consumer's own surfaces report: `gantt.gridColumns` and both halves
of a `gridColumnsChange` payload carry the columns the consumer wrote, before and after a resize or a
reorder; `toJSON` writes the Fields the consumer declared. A plugin's declaration is code, and the
plugin makes it again on its next install, so a Document never carries one. A `PluginStore`'s rows go
the other way on purpose: they are data the plugin cannot rebuild, so the Document keeps them under
their owner's id as passenger data (D-S5-24). Data outlives its plugin; a declaration does not.
_Avoid_: Owner (a `PluginStore` has an owner, which is who may _write_ it; a declarer is who _made_
one declaration), provenance as a public word (it names the rule, not an API member)

**Propose / Announce**:
The two verbs a plugin uses to raise the one event pair it owns (`ctx.interaction.proposeEntryEdit`, `ctx.interaction.announceEntryEdit`). **Propose** asks, and the answer is a Veto: `true`/`undefined`, `false`, or an unsettled `Promise` (D-S3-17). The caller must read it. **Announce** tells, after the commit, and returns `void`. `GanttShell#proposeChange` uses Propose in the same sense for every cancelable Gantt-state change.
_Avoid_: Emit (retired on the plugin surface 2026-09-04 — "emit" says a thing went out, and says nothing about whether a decision comes back; `EventBus.emit` keeps the word for the bus's own mechanism)

**DatasetPlugin**, **EditExtender**, **PluginStore**:
Names from the extension hook's contract design (ADR 0002's consequences, issue #15, built on #12): a `DatasetPlugin` occupies the extension hook via an `EditExtender`, and per-plugin per-entry data (e.g. the scheduling plugin's pin flag, `Dependency`) lives in a reserved `PluginStore` rather than on `Entry` or in a consumer/plugin-shared field. Landed in S5.10 (#15, #156). `DatasetPlugin` and its context live in `api/dataset-plugin.ts`, `PluginStore` in `data/plugin-store.ts`, and `EditExtender` in `model/entry.ts`. A store's rows serialize under `plugins: { [id]: … }` at `schema: 3`. Named `ProjectPlugin` before ADR 0004.
_Avoid_: Treating these as settled — the exact shapes are still open design work

**PluginRuntime**:
The `extensions/plugin-runtime.ts` class that installs, diffs (by `id`) and disposes one Gantt's `GanttPlugin` list (S5.1, D-S5-1/D-S5-3). One instance per `GanttShell`, never shared across Gantt instances (I2). Owns each plugin's `RegistrationGate` — closed the moment that plugin's own `setup()` returns, so a `register*` call reached afterward throws `RegistrationClosedError` (D-S5-4) — and commits an `install()` atomically: a `setup()` throw unwinds only the batch just added, leaving the previously installed set untouched.
_Avoid_: PluginHost (retired — "Host" is repo-wide retired vocabulary, see Consumer)

**Command registry**:
The `extensions/commands.ts` class (`CommandRegistry`) a `GanttShell` builds once and holds privately: `register`/`run`/`available`, keyed by a command's own `id` under the `freegantt.*`-namespaced core catalog (`view/core-commands.ts`) or a plugin's own id (D-S5-6). Public as `Gantt.commands`, typed against the api-level `CommandRegistryOf`. `run()` on a command whose `when` declines is a silent no-op, the same posture a disabled menu item takes; `run()` on an unknown id throws.
_Avoid_: Command palette (a UI a consumer could build on top of `available()`; no such UI ships)

**Keymap**:
The `extensions/keymap.ts` class that resolves a `KeyboardEvent` against every registered chord, newest-first (D-S5-7): the innermost, most-recently-registered binding wins, which is why a plugin's binding beats core's and a popup's own Escape dismissal beats an outer binding (D-S5-9). Chords are parsed once at registration, never per event. Holds two kinds of entry — a `KeyBinding` naming a Command registry id, and a command-less `registerHandler` callback (C3) — resolved by the same pass and gated by the same editable-target/IME rule either way.
_Avoid_: Key handler (that names one registered entry, not the resolver that owns all of them)

**Mount layer**:
The one shape a plugin mounts content into (`view/mount-layer.ts`'s `MountLayer`, #168): `present(node)`, `onResize(callback)`, and the layer's own `bounds`. A Gantt has exactly two — the Overlay and the Row layer — and the difference is the instance, never the interface. Reposition-on-resize belongs to whatever you mounted into, so both carry `onResize`, over one shared `ResizeObserver` per Gantt (`ContainerResize`, issue #137 F9). Before #168 there were two interfaces and only one had `onResize`, so the Cell editor mounted in one layer and borrowed the resize signal from the other.
_Avoid_: Overlay handle (retired — a one-field wrapper is the inner type, so `present` returns a plain Disposer), Host, Portal

**Overlay**:
One absolutely positioned layer over the Gantt's Container, owning its own stacking order and lifetime (S5.3, D-S5-8). It is the Mount layer that **escapes the pane box**, which is the whole difference from the Row layer. `PluginContext.view.overlay` hands a third-party plugin the exact same seam a built-in Popup is built over. Geometry and identity are the Gantt DOM's, not the Overlay's: `bounds`, `paneBounds`, `contains` and `elementForEntry` moved to `ctx.view.dom` in 2026-09-04's review (N1), because `overlay.elementForEntry(id)` returned a timeline bar that was never in the overlay — one word covering two concepts, the #7 failure. The layer's _own_ rect is the exception, and stayed with it (`overlay.bounds`, #168).
_Avoid_: Layer (too generic — Overlay is this one specific layer, not the render/dom layer stack); reading `Overlay` as "everything positioned about the Gantt" (that is the Gantt DOM)

**Gantt DOM**:
This Gantt's own rendered DOM, read as questions (`view/gantt-dom.ts`'s `GanttDom`, `ContainerDom`; public as `ctx.view.dom`). Three of them: `owns(node)` — is this event mine (I2); `targetUnder(node)` — what is this node; `barFor(id)` / `cellFor(id, field)` — where is this entry's element. It also carries `bounds`, `paneBounds` and `cellText(cell)`. It exists because `extensions/` may not import `render/` (D-S5-5), so every class name crossing that boundary is a contract: `render/dom/dom-contract.ts` declares them, `view/gantt-dom.ts` is the only reader, and `view/gantt-dom.test.ts` paints a real frame and asserts the two still agree. Before it, a plugin retyped eight `.fg-*` selectors and three `data-*` keys, and a rename broke every plugin with a green build.
_Avoid_: Overlay (that is the mount layer only — see above), DOM helper, selectors

**Pane of a node**:
`GanttDom.paneOf(node)` (#177): which Pane holds a node — `'grid'`, `'timeline'`, or neither. It answers by element identity, so it is a `contains` check and reads no layout. Pair it against Pane bounds, which answers the _geometric_ question: an ownership question ("whose scroll was that", "which pane did the user act in") goes to `paneOf`; a placement question ("where do I flip and clamp this box") goes to `paneBounds`. Asking geometry about ownership is what kept a Popup's scroll dismissal unscoped, and cost it three `getBoundingClientRect` calls per scroll event anywhere in the document.

**DOM target**:
What one node in a Gantt's own DOM stands for — `{ kind, element, entry?, field? }`, returned by `ctx.view.dom.targetUnder(node)`. `kind` is `model/`'s **TargetKind** (`'row' | 'cell' | 'bar' | 'header' | 'splitter'`), the same union `CommandTarget.kind` uses: one vocabulary for "what did this land on", so a resolved right-click fills a `CommandContext.target` with no translation. The object is frozen and memoized on the element it came from, so a pointer resting on one bar allocates nothing (I5).
_Avoid_: HitResult (that is `render/backend.ts`'s own point-based answer, `{ itemId, edge? }` — a different question), a second `*Target` union

**Scoped DOM listener**:
`ctx.view.onDomEvent(type, handler, options?)` — one `document` listener, kept to the events this Gantt owns, handing the handler the resolved DOM target and filing its own removal (capture flag included) in `ctx.disposables`. Added in 2026-09-04's review (A4): eleven hand-written `document` listeners each wrote the "is this my Gantt?" guard themselves, and `inlineEditing()`'s `scroll` listener had no guard at all. A listener that must hear events _outside_ its Gantt — a dismiss-on-outside-pointer — is the one exception, and `extensions/popup.ts` is the only place that takes it.
_Avoid_: `on`/`off` (those name the Gantt event bus — a different mechanism with a different vocabulary)

**Cell editor**:
The in-place editing control `inlineEditing()` opens over one Grid cell (S5.8, D-S5-19/D-S5-20; `CellEditorSession`, `.fg-cell-editor`). One open at a time. Not a Popup: it owns a live `<input>` end to end, it mounts in the Row layer so the pane's own scroll carries it (#158), and a refused commit keeps it open in the invalid state instead of dismissing it (#137 F5).
_Avoid_: Inline editor (names the feature — `inlineEditing()` — not the one control it opens), Field editor (a Field is what a value is; this edits one cell of one entry)

**Popup**:
The `extensions/popup.ts` anchoring/flipping/clamping/dismissal primitive (S5.3, D-S5-8/D-S5-9) built on `ctx.view` alone — the Overlay it mounts in, plus the Gantt DOM's rects it places against. One implementation serves the tooltip and the context menu. The Cell editor is deliberately not a consumer: it needs a live, listener-attachable control rather than a static Element description, and it follows a scroll rather than dismissing on one (#158). `open()` while already open replaces the current popup (closes it first). Dismisses on Escape (folded into the shared Keymap, C3), an outside pointer, a scroll of the anchor's own pane, or blur, per its `dismissOn` option.
_Avoid_: Tooltip, Menu (both are one consumer of this shared primitive, not the primitive itself)

**Dismiss trigger**:
Why a Popup closed _itself_: `'escape' | 'outsidePointer' | 'scroll' | 'blur'`. `PopupOptions.dismissOn` names which ones apply; `PopupOptions.onDismiss(trigger)` tells the owner which one fired, after the close. A `close()` the owner called is not a dismissal and never fires it — the owner already knows. Added in 2026-09-04's review (C3): without it an owner either leaked its listeners or polled `isOpen` on every click in the page, and `createPopup` is public, so every third-party plugin inherited that choice.
_Avoid_: Close reason, dismissal cause (the type is `DismissTrigger` — one name)

**Refusal notice**:
What a cell mounts when it will not open an editor and owes the user a reason (`inlineEditing()`, S5.8). It is the same `.fg-cell-editor` wrapper the editor itself mounts, in the same Row layer (#158), carrying `data-state="invalid"`, `data-reason="<key>"`, the reason as its text and the same words as its `title`. It mounts no control, takes no focus, and sets `pointer-events: none`, so the next double-click reaches the cell below it. Five things clear it: the next pointer press in this Gantt, Escape, a scroll, a Dataset change, and the next open. `inline-editing.ts`'s `REFUSAL_TEXT` holds every message, so no call site spells one. Which refusals speak and which stay silent is one seven-row table in [`s5.8-inline-editing.md`](plans/s5-extensibility-and-editing/s5.8-inline-editing.md) §1, under one rule: a cell that offers no editor refuses in silence, and a cell that offers one and cannot open it here names the reason. Added in 2026-09-04's review (SP1): four different refusals all looked like a dead double-click.
_Avoid_: Error (nothing is broken — the cell is stating a rule), warning, tooltip (a Tooltip is a hover affordance built on Popup; a refusal notice answers one action and is not a Popup at all)

**DisposableStore**:
The `extensions/disposables.ts` collection of cleanup callbacks a `PluginRuntime` or a Popup accumulates and frees together with one `disposeAll()` call; latches after disposal (cannot be reused — a fresh instance replaces it instead, e.g. `Popup.close()`). Deliberately reuses "Store" outside `data/`'s own sense (a normalized entity collection like `Dataset.entries`) — spec-mandated name (S5.1); the two senses do not overlap in any one file, so no rename is planned.
_Avoid_: Confusing with `data/`'s Store sense — see above

**ElementDescription**:
The plain, DOM-free data shape (`layout/` — `render/dom/element-description.ts`'s `buildElement` is its one-shot build function, S5.3/D-S5-10) describing a node's tag, attrs/class/style, and text-or-`html`-or-keyed-children content. The one seam `extensions/` has into the reconciler, since it may not import `render/dom` itself (D-S5-5): a Popup or a plugin builds one and hands it to `ctx.view.renderElement()`. Raw `html` is explicit opt-in only (I13); `text` is always `textContent`.
_Avoid_: Vnode, template (both imply a framework-shaped diffing/compilation step this plain data shape does not have)

### Process

**Acceptance id**:
A `[Sn-Ax]` tag (e.g. `[S1-A2]`) linking one `plans/03-slices.md` acceptance box to the test that proves it — carried in that test's own title, fixed-string-searchable, and driven by `scripts/slice-gate.mjs`'s `tagged()` helper (S1.11, D-S1.11-1). Fixed-string, not a regex: `[S1-A2]` read as a regex is a character class matching one of `S`, `1`, `-`, `A`, `2`, which is how the gate's first design silently ran the wrong tests. An id is declarative about which runner(s) it lives in — the gate never infers a runner from a file path, because that would let an id silently migrate to the wrong kind of test (e.g. from e2e to unit) without the gate noticing.
_Avoid_: Test tag, test id (both read as generic testing infrastructure; Acceptance id is specifically the `plans/03` box <-> test link)
