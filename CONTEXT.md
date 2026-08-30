# FreeGantt

A framework-free TypeScript Gantt library: layout and rendering of dated Entries over time. Scheduling — dependencies, propagation, constraints — is one optional first-party plugin (ADR 0002), not what the library is about. The core vocabulary is therefore domain-neutral (ADR 0003): a consumer charting shifts, bookings, machine uptime, or units sold per week is as much the intended user as one charting a project plan.

## Language

### Authored model

**Dataset**:
The body of authored data — its Entries, plus whatever scheduling-plugin-owned data (e.g. Dependencies) an installed scheduling plugin contributes — together with the settings that give it meaning, above all the IANA zone in which all zone-aware date arithmetic is performed. "The dataset's zone" and "the dataset's reference date" are properties of this, not of the runtime environment. A Dataset with no scheduling plugin installed has Entries and no Dependencies at all (ADR 0002). Renamed from Project in ADR 0004 — read every historical "Project" as "Dataset". `model/dataset.ts`'s `Dataset` is the structural contract `api/dataset.ts`'s `Dataset` class satisfies (`implements`) — the same structural/façade relationship the Gantt entry states, and the type `layout/` binds against without importing `view/` or `api/` (S1.7 §3.2; formerly `DatasetLike` in `view/gantt-shell.ts`).
_Avoid_: Project (retired in ADR 0004 — see that ADR for why; the word smuggled scheduling/PM assumptions into a domain-neutral concept the same way `Task` once did for `Entry`), Plan, schedule (a schedule is an output of scheduling a Dataset, not the Dataset itself)

**Document**:
The `toJSON()` / `fromJSON()` shape of a Dataset (`DatasetDocument`): `schema`, `timeZone`, `dateOnlyEnd`, `derivedSpanKinds`, and `entries`. A Document is a state, not a session — `fromJSON` constructs a fresh Dataset with an empty History. Top-level keys belong to the schema; anything of the consumer's goes in `meta` and survives byte for byte. Derived layout (`Row`, `Item`, `GeometryFrame`) never appears here.
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
The `Instant` captured once when a Dataset is constructed — the one `Date.now()` read `time/` performs for that Dataset (CLAUDE.md confines `Date.now()` to `time/`). It stays fixed for the Dataset's lifetime; it is not re-derived on every layout pass. Used to initialize the zero-length `start`/`end` span of a derived-span-kind Entry (e.g. a newly created `'group'`) before the Span rollup gives it a real span.
_Avoid_: Now, current time (both read as live/re-evaluated, which this isn't), wall clock (that's Plain time's vocabulary — a Reference date is an already-resolved `Instant`, not an unresolved zone-less reading)

**Entry**:
One authored, dated record: a name, a start, an end, and a `kind`. Entries are persisted; they are what a consumer creates, edits, and hands to the library. What an Entry _means_ is the consumer's business — a task, a shift, a delivery, a day's sales — and core never assumes. The word is the accountant's: a dated line in a ledger. Its `id` is identity, never editable — `EntryEdit` (the shape `entries.update()` takes) omits `id` from `EntryInput` for exactly this reason, so there is no way to write an id-changing edit that typechecks.
_Avoid_: **Task** (retired in ADR 0003 — it implies to-do work, and the whole point is that the record is domain-neutral), activity, event, bar (a bar is what an Item renders), record, row (a Row is a display track)

**Kind**:
The authored classification of an Entry (`'span' | 'group' | 'milestone'`, open to consumer-defined values) that selects its behavior at four seams: scheduling policy, item emission, rendering, and interaction capability. Kind is never derived from structure (e.g. from having children) — it is always explicitly set by whoever authored the Entry. `'span'` is the default: an Entry that simply occupies its start-to-end stretch, with no further meaning attached. `kind` is required on the stored Entry (issue #84) — every reader can trust it is present, since ingest applies the `'span'` default once, at the api/ boundary; it stays optional on Entry input, where a consumer may omit it. _Exception:_ `hierarchy.autoGroup` (`02` §2) promotes an entry to `'group'` in the same transaction it gains its first child — an automated edit, not a derivation the store computes on the fly; it only promotes, never demotes, so kind still can't silently flicker based on current structure. `derivedSpanKinds` (default `['group']`) names which Kinds get their `start`/`end` from the Span rollup instead of authoring them directly — a consumer's own Kind opts in the same way `'group'` does by default.
_Avoid_: Type (reserved for `DependencyType`), category; and `'task'` as the default kind's name (ADR 0003 — a kind literal is data, so leaving the old word there would have kept it in every authored Entry)

**Dependency**:
A first-class entity linking a predecessor Entry to a successor Entry with a type (`FS`/`SS`/`FF`/`SF`) and optional lag. Never embedded as an array on an Entry. Scheduling-plugin-owned data, not `model/` (ADR 0002) — it exists only when a scheduling plugin is installed and lives in that plugin's reserved store, not on `Entry` or in core.
_Avoid_: Link (reserved for the rendered geometry of a dependency, i.e. what appears in `GeometryFrame.links`), Relationship

**Segment**:
One contiguous stretch of an Entry's span, when that span is interrupted rather than continuous (`Entry.segments`). Segments are authored — an Entry without them is simply one unbroken stretch — and each one emits its own Item.
_Avoid_: Split, interval, piece

**Field**:
One named, addressable value on an Entry — declared once and used by every layer that needs it. Core ships `name`, `start`, `end`, `progress` and the computed `duration` as declarations of exactly the shape a consumer adds to, which is what lets a consumer's `cost` be edited, compared, rolled up and shown by the same code as `start` (ADR 0005, `01` §2.6). Fields belong to the Dataset (`fields`), because the Rollup writes stored, undoable, serialized values and runs at construction, before any Gantt exists. **A Field is what a value _is_; a Grid column is where a Gantt _shows_ it** — the one sentence that separates the pair. A Field also carries its own default column presentation, so declaring `cost` once covers both halves.
_Avoid_: Attribute, property (both read as "a key on an object", which is the storage detail rather than the declaration), column (a Grid column names a Field and carries presentation only)

**Field key**:
A Field's name, and the same string the changeset's `field` carries. One name for one concept: it retires `EntryField`, which meant exactly this in `FieldUpdated` and gave the idea a second name (the #7 precedent). `CoreFieldKey` is the shipped subset — the keys of `Entry` — and it is what the per-field comparison table stays exhaustive over.
_Avoid_: EntryField (retired), field name, column id

**Field source**:
Where a Field's value lives: `entry` (a core key), `meta` (a consumer key the consumer declared), or `compute` (no stored value — read from other Fields). The source is not bookkeeping: it decides whether a rolled-up parent value is **stored** (changeset, undo, Document) or **computed on read** and never written. A consumer who wants an aggregate without Document bytes declares a computed Field rather than setting a flag.
_Avoid_: Storage, backing, accessor; and note this is Row source's word applied to a different subject — say "field source" or "row source", never a bare "source"

**Field type**:
A named bundle of Field settings — a rollup, an equality rule, text formatting, and column presentation defaults — applied with `type: 'money'` so one declaration serves many Fields. The Field's own keys win over the bundle's. `api/` splits it: the data half reaches `data/`'s registry, the presentation half reaches `view/`, so the consumer writes it once and the layer boundary still holds.
_Avoid_: Column type (the bundle is broader than a column), Kind (Kind classifies an Entry, not a value)

**Aggregator**:
The function that turns a set of children's values into a parent's value for one Field — `min`, `max`, `sum`, `count`, a duration-weighted mean, or a consumer's own. Always referenced **by name**, never passed inline: a name is data that serializes into a Document and can be refused when it is not registered, and a function is neither. Returning `undefined` means "no opinion, leave the stored value alone". The Aggregator is the function; the Rollup is the pass that runs it.
_Avoid_: Aggregation (the noun for the pass is Rollup — one concept, one word), reducer, accumulator

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
_Avoid_: Draft (implies a persisted intermediate state this isn't), staging area, buffer

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
Whatever plugin occupies the extension hook, if any. FreeGantt ships an official bars + dependencies engine as its first-party default (D3) — described in §7 below — but core does not require it or any scheduling plugin to function (D4, ADR 0002).
_Avoid_: The scheduling engine (ambiguous between "the seam" and "FreeGantt's default implementation of it" — say "the extension hook" or "the default scheduling plugin" explicitly)

**SchedulingPolicy**:
The pluggable seam, within the default scheduling plugin, that resolves how a proposed edit interacts with an Entry's kind and existing schedule (e.g. whether the engine may move it, how a `'group'` Entry rolls up from children). Kind-specific scheduling semantics live in the policy, never in the engine itself.
_Avoid_: Rule, constraint (Diagnostics, not policy, is where constraint violations surface)

**Diagnostic**:
A non-authoritative report the scheduling engine attaches to a `ScheduleResult` when it cannot satisfy a request (e.g. a dependency cycle, naming the Entry ids involved). The engine never silently rewrites what the user asked for — a conflict becomes a Diagnostic, not a mutation.
_Avoid_: Error, warning

**Pinned**:
A whole-Entry boolean state, set by the user, that tells the scheduling engine never to move that Entry — an upstream change that would otherwise push it instead produces a Diagnostic reporting what the engine _would_ have done. It lives in the default scheduling plugin's own per-entry storage (exact contract tracked in issue #12), not on `Entry`/`model/`, the same way `Dependency` does — a Dataset with no scheduling plugin installed has no notion of "pinned" at all.
_Avoid_: Locked, frozen, fixed

**Working calendar**, **Constraint**, **Resource** / **Assignment**, **Baseline**:
Reserved, not yet implemented — named seams for later slices (`plans/01` §4). `Working calendar` (which days/hours count as workable), `Constraint` (date restrictions, defined by `SchedulingPolicy`'s own vocabulary), `Resource`/`Assignment` (staffing), and `Baseline` (schedule snapshots) all belong to the default scheduling plugin's domain, not `model/` — like `Dependency` and the pin flag (ADR 0002), a Dataset with no scheduling plugin installed has none of these.
_Avoid_: Calendar alone (ambiguous with a UI date picker or an imported ICS calendar — the qualifier is load-bearing)

### Derived layout

**Row**:
A horizontal track of a Gantt — the unit of vertical layout, and what the grid pane and the timeline pane both position against. Rows are derived on every layout pass and never persisted. A Row is not an Entry: one Row may carry the Items of many Entries, and a row source may produce Rows that correspond to no Entry at all.
_Avoid_: Line, track (a track is what a Lane is), record

**Row source**:
The configuration that decides what the Rows are for a given Gantt — the Entries themselves (optionally as a tree), one Row per value of some grouping function, or a consumer-supplied resolver. Alternative views (workload, resources) are new row sources, not new rendering or interaction code.
_Avoid_: Row provider, row model

**Item**:
A derived, renderable piece of geometry produced from an Entry for one Segment of its span — most entries produce exactly one Item, but an Entry with Segments produces one Item per Segment. Items are recomputed on every layout pass and never persisted. `Item.id` is deterministic: `${entryId}:${segmentIndex}`.
_Avoid_: Bar (an Item is what a bar renders; "bar" is a rendering detail, not the identity)

**Lane**:
A sub-track within a Row, assigned by the layout pass so that Items whose spans overlap on the same Row are stacked instead of drawn on top of each other. A Lane is a packing result — always derived, never authored.
_Avoid_: Sub-row, level, stack

**Grouping**:
The row-level nesting of the timeline grid (parent/child rows via `parentId`). Distinct from Kind: an Entry of kind `'group'` and an Entry with children are different things — a `'group'` Entry rolls up its schedule from children, while grouping is purely about row hierarchy in the grid and applies regardless of kind.
_Avoid_: Group (ambiguous with the `'group'` kind — say "row grouping" or "the `'group'` kind" explicitly)

**Rollup**:
The bottom-up pass in the commit path that derives a parent's value for a Field from its children's, using that Field's Aggregator. It is a core step, not a resolver: it runs whether or not a plugin is installed, and nothing installable can displace it (D-S2-22). It yields to a field the caller proposed in the same transaction and wins over one the extension hook proposed. One pass settles nested parents, because the walk is bottom-up. The **Span rollup** is the instance that ships first — `start` is `min`, `end` is `max` over the children of a derived-span Kind — and `derivedSpanKinds` says which Kinds derive at all. Once a group has children, the Rollup owns its span; it can't be set directly. A dependency attached to a `'group'` Entry resolves against its rolled-up span by default.
_Avoid_: Group rollup (the pass is not tied to the `'group'` Kind, nor to spans — it is per Field, over any derived-span Kind), rollup pass (says "when," not "what"), aggregation (Aggregator is the function; Rollup is the pass)

**Grid column**:
One vertical slice of the grid pane. A Grid column names the Field it shows and carries presentation only — header, width, alignment, cell renderer, editability. Grid columns belong to the Gantt (`gridColumns`), because which fields this view shows, and in what order, is a view question; the name carries `grid` because a bare "column" does not say whether it means data or display. Aggregation never lives on a Grid column: a stored value must not depend on whether a column is visible, and the Rollup has already run before any Gantt is built. Since a Field declares its own column defaults, `gridColumns` is usually names in display order plus per-Gantt overrides.
_Avoid_: Column on its own (says nothing about which side it is on), Field (a Grid column names one, it is not one), cell (a cell is one Grid column's value on one Row)

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
The `layout/` object that runs one Gantt's layout pass (`layout/frame-layout.ts`) and keeps what that pass must remember between renders — today the row-height index, tomorrow S5's finer-grained invalidation. `computeFrame` stays pure; FrameLayout is what makes the index O(log n) _across_ renders rather than per render. One instance per Gantt: the index describes that Gantt's rows and is not shareable, unlike a TimeScaleModel or a ScrollModel.
_Avoid_: Layout cache, frame builder (it computes the pass; the cache is how, not what)

**Gantt**:
The public entry point and a whole mounted instance: one `Gantt` wraps one `container` element, one Dataset, and everything needed to render and interact with it. This is the sense used everywhere the specs discuss the product as a whole — D9's "multi-Gantt sync", I2's "two Gantt instances coexist independently", a consumer page that mounts "two Gantts". A `Gantt` _is_ the class; it is also the name of the concept, so `new Gantt(...)` and "a Gantt" mean the same thing.
_Avoid_: Chart (see #7 — "chart" used to name both this and `GanttShell`, ambiguously, and is retired from the codebase entirely)

**GanttShell**:
The internal `view/` class a `Gantt` constructs and owns: the composition root that wires the Pane layout, the render backend, and the viewport attachments together (plans/01 §8.2-8.3, S1.8, "the chart shell" in older text). Never public — `exports` is sealed to `api/` and `model/`. A `Gantt` is a thin façade over one `GanttShell`; the shell _composes_ the Grid pane / Timeline pane / Splitter split, `PaneLayout` _holds_ it.
_Avoid_: Chart, ChartShell (rejected in #7 — "shell" alone doesn't say what it's a shell _of_; `GanttShell` reads correctly even far from its definition)

**Pane layout**:
The DOM skeleton one Gantt's container is split into: a Grid pane, a Splitter, and a Timeline pane, built and owned by `view/pane-layout.ts`'s `PaneLayout` class (plans/01 §8.3, S1.8). Structure and one number only — Grid width — no geometry, no scale, no data, no frame, no events. `GanttShell` composes a Pane layout; it does not build panes itself.
_Avoid_: Layout (Layout, unqualified, is the `layout/` source directory and its pure geometry types — a different concept)

**Grid pane**:
The left-hand pane of a Pane layout: row labels and, from S6, columns. It has no scrollbar of its own — its row layer follows the Timeline pane's native scroll by one `translateY` transform per frame instead of a second real scroller (D-S1.8-1), which is what keeps I9's pixel identity structural rather than something a caller maintains by hand.
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
A wiring between a DOM element and a pure model, living in `view/` and returned by an `attach*` function with a `detach()` method. An Attachment is the only thing on either side of the seam allowed to touch the element: `attachScroll` owns element scroll (I12), `attachPaneSize` owns measurement. Distinct from a Binding, which carries data and never sees the DOM.
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
Moving the shared viewport — `ScrollModel.panTo`, and the drag gesture that will call into it. Public verbs on Gantt are `panToDate` / `panToToday` (loose InstantInput, never `scrollTo*`). One concept at two layers, which is why they share the word. Distinct from **scroll**, which means one element's native offset and is confined to `view/scroll-attachment.ts` (I12): a Pan may result in no scroll at all when the chart is already at its end. `panToInstant` is the Viewport-internal twin that already holds a branded Instant.
_Avoid_: Scroll (an element's native offset), move (move is dragging an Entry — `entryMove`), seek

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
_Avoid_: Timeline, cursor, now-line

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

### Theming and accessibility

**Base stylesheet**:
The one stylesheet the library ever writes, injected once per document by `ensureBaseStyles` (`view/styles.ts`, S1.10). Idempotent per document via a `<style data-freegantt-styles>` marker — the document holds that state, not a module variable, so two Gantt instances in one document share one injected sheet without this being I2's kind of shared mutable state (the second call is a no-op precisely because the marker makes it safe to call twice). Ships every Token default and every Part's structural rule; there is no consumer-facing way to opt out (D-S1.10-8) — a consumer restyles it, it does not disable it.
_Avoid_: Default styles, styles.css (there is no separate package export — see D-S1.10-8)

**Token**:
A `--fg-*` CSS custom property — level 1 of the Customization ladder (`plans/02` §4). Metrics (`--fg-row-height`, `--fg-grid-pane-width`, `--fg-band-height`, `--fg-tick-box-floor`, …) are read once through `pixel-property.ts` or consumed as CSS `var()` fallbacks; colour Tokens (`--fg-bar-fill`, `--fg-pane-bg`, `--fg-date-line-color`, …) are consumed directly by Base stylesheet rules with no JS in between. A consumer overrides any Token by setting the same property on the container element; the shipped default is always the fallback in `var(--fg-x, default)`, never the winner once a consumer has authored a value. `--fg-header-height` retired at S1.12 in favour of `--fg-band-height` (one band, not the whole header).
_Avoid_: Variable, custom property (accurate but not this project's term of art — say Token), theme variable

**Part**:
One of the `fg-*` class names the library's DOM structure carries — level 2 of the Customization ladder. The vocabulary is closed and un-renamed (D-S1.10-1), with one exception before 1.0 (S1.13, D-S1.13-8): `fg-container`, `fg-grid-pane`, `fg-grid-spacer`, `fg-rows-clip`, `fg-rows`, `fg-splitter`, `fg-timeline-pane`, `fg-header`, `fg-band`, `fg-tick`, `fg-row`, `fg-row-label`, `fg-bars`, `fg-bar`, `fg-date-line`, `fg-date-line-label`. A consumer writes level-2 CSS against a Part directly (`.fg-bar { ... }`) or against a Part plus a State attribute (`.fg-bar[data-flag~="conflict"] { ... }`).
_Avoid_: Pane (Grid pane/Timeline pane/Splitter are specific Parts, already named in "Mounted instances" — Part is the general term for the whole class vocabulary), BEM block (rejected, Q2 — renaming shipped classes to a BEM shape was churn with no behavior change)

**State attribute**:
A `data-*` attribute a Part carries so a consumer can select on state without JS — `data-flag` (space-joined, generated from `BarFlags`'/`LinkFlags`' own keys, D-S1.10-2: `conflict`, `cycle`; on `.fg-date-line` the Today line wrapper writes `today`), `data-kind` (an Entry's Kind), `data-testid`/`data-row-id`/`data-item-id` (stable E2E hooks, U6). Distinct from a Token (a value) and a Part (a structural class): a State attribute is level 2's other half, the thing a consumer's selector matches against rather than reads.
_Avoid_: Data attribute (too generic — say State attribute when it's part of the level-2 vocabulary), modifier class (there is no modifier-class convention here — state lives in `data-*`, never a second class)

**a11y label**:
`FrameBar.a11yLabel` — the library-computed string a screen reader announces for one bar (`${entry.name}, ${formatDate(...)} – ${formatEndInclusive(...)}`), composed in `layout/` from the dataset zone and set as `.fg-bar`'s `aria-label` at sync time (D-S1.10-5). Not the same thing as `Gantt.a11yLabel` — the live option that sets the _container's_ `aria-label` (default `'Gantt'`). Two different things sharing a root word: say "the bar's a11y label" or "`Gantt.a11yLabel`" explicitly, never "a11y label" unqualified where both are in scope (#7's "chart" lesson applies).
_Avoid_: aria-label (that is the DOM attribute `render/dom` maps this to — `a11yLabel` is the backend-neutral field `layout/` produces, same relationship `kind` has to `data-kind`), accessible name (a browser/AT term of art, not this project's field name)

### Extension

**Capability**:
Whether a specific gesture (move, resize, select, link) is permitted on a given Entry, resolved once per Entry from its Kind and gating both the gesture itself and any affordance that hints at it (e.g. a resize handle only renders if resize is capable). `select` is a Capability with no visual affordance — I14's refuse half still applies (pointer and keyboard skip an incapable entry); the public `Gantt.selection` setter does not consult it (D-S3-9).
_Avoid_: Permission, ability

**GanttPlugin**:
The public extension contract: an `id` plus a `setup(ctx)` that returns a disposer. Built-in features (tooltips, context menu, editors) are themselves GanttPlugins using the same `PluginContext` a third party would use — no back-door capabilities reserved for first-party code.
_Avoid_: Extension (Extensions is the name of the source layer that runs plugins; GanttPlugin is the unit within it)

**PluginContext**:
The object `setup(ctx)` receives — a GanttPlugin's entire world: dataset access, the event bus (including cancelable `before*` events), registration for decorations/columns/renderers/item-emitters/interaction-controllers/keybindings, the command registry, and a disposable store. A plugin may not reach into anything outside it (enforced by the import-boundary lint).
_Avoid_: Treating this as settled — the plugin system (`GanttPlugin`/`DatasetPlugin`/`PluginContext`) is still design work in progress; the shape, and possibly this name, may change before it lands

**DatasetPlugin**, **EditExtender**, **PluginStore**:
Names from the extension hook's contract design (ADR 0002's consequences, issue #15, built on #12): a `DatasetPlugin` occupies the extension hook via an `EditExtender`, and per-plugin per-entry data (e.g. the scheduling plugin's pin flag, `Dependency`) lives in a reserved `PluginStore` rather than on `Entry` or in a consumer/plugin-shared field. Design proposals only — not yet implemented or landed in `src/`; do not treat as existing API until #15 lands. Named `ProjectPlugin` before ADR 0004.
_Avoid_: Treating these as settled — the exact shapes are still open design work

### Process

**Acceptance id**:
A `[Sn-Ax]` tag (e.g. `[S1-A2]`) linking one `plans/03-slices.md` acceptance box to the test that proves it — carried in that test's own title, fixed-string-searchable, and driven by `scripts/slice-gate.mjs`'s `tagged()` helper (S1.11, D-S1.11-1). Fixed-string, not a regex: `[S1-A2]` read as a regex is a character class matching one of `S`, `1`, `-`, `A`, `2`, which is how the gate's first design silently ran the wrong tests. An id is declarative about which runner(s) it lives in — the gate never infers a runner from a file path, because that would let an id silently migrate to the wrong kind of test (e.g. from e2e to unit) without the gate noticing.
_Avoid_: Test tag, test id (both read as generic testing infrastructure; Acceptance id is specifically the `plans/03` box <-> test link)
