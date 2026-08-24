# FreeGantt

A framework-free TypeScript Gantt library: layout and rendering of dated Entries over time. Scheduling — dependencies, propagation, constraints — is one optional first-party plugin (ADR 0002), not what the library is about. The core vocabulary is therefore domain-neutral (ADR 0003): a host charting shifts, bookings, machine uptime, or units sold per week is as much the intended user as one charting a project plan.

## Language

### Authored model

**Dataset**:
The body of authored data — its Entries, plus whatever scheduling-plugin-owned data (e.g. Dependencies) an installed scheduling plugin contributes — together with the settings that give it meaning, above all the IANA zone in which all zone-aware date arithmetic is performed. "The dataset's zone" and "the dataset's reference date" are properties of this, not of the host environment. A Dataset with no scheduling plugin installed has Entries and no Dependencies at all (ADR 0002). Renamed from Project in ADR 0004 — read every historical "Project" as "Dataset".
_Avoid_: Project (retired in ADR 0004 — see that ADR for why; the word smuggled scheduling/PM assumptions into a domain-neutral concept the same way `Task` once did for `Entry`), Plan, schedule (a schedule is an output of scheduling a Dataset, not the Dataset itself)

**Reference date**:
The `Instant` captured once when a Dataset is constructed — the one `Date.now()` read `time/` performs for that Dataset (CLAUDE.md confines `Date.now()` to `time/`). It stays fixed for the Dataset's lifetime; it is not re-derived on every layout pass. Used to initialize the zero-length `start`/`end` span of a derived-span-kind Entry (e.g. a newly created `'group'`) before the Group rollup gives it a real span.
_Avoid_: Now, current time (both read as live/re-evaluated, which this isn't), wall clock (that's Plain time's vocabulary — a Reference date is an already-resolved `Instant`, not an unresolved zone-less reading)

**Entry**:
One authored, dated record: a name, a start, an end, and a `kind`. Entries are persisted; they are what a host creates, edits, and hands to the library. What an Entry _means_ is the host's business — a task, a shift, a delivery, a day's sales — and core never assumes. The word is the accountant's: a dated line in a ledger.
_Avoid_: **Task** (retired in ADR 0003 — it implies to-do work, and the whole point is that the record is domain-neutral), activity, event, bar (a bar is what an Item renders), record, row (a Row is a display track)

**Kind**:
The authored classification of an Entry (`'span' | 'group' | 'milestone'`, open to host-defined values) that selects its behavior at four seams: scheduling policy, item emission, rendering, and interaction capability. Kind is never derived from structure (e.g. from having children) — it is always explicitly set by whoever authored the Entry. `'span'` is the default: an Entry that simply occupies its start-to-end stretch, with no further meaning attached. _Exception:_ `hierarchy.autoGroup` (`02` §2) promotes an entry to `'group'` in the same transaction it gains its first child — an automated edit, not a derivation the store computes on the fly; it only promotes, never demotes, so kind still can't silently flicker based on current structure.
_Avoid_: Type (reserved for `DependencyType`), category; and `'task'` as the default kind's name (ADR 0003 — a kind literal is data, so leaving the old word there would have kept it in every authored Entry)

**Dependency**:
A first-class entity linking a predecessor Entry to a successor Entry with a type (`FS`/`SS`/`FF`/`SF`) and optional lag. Never embedded as an array on an Entry. Scheduling-plugin-owned data, not `model/` (ADR 0002) — it exists only when a scheduling plugin is installed and lives in that plugin's reserved store, not on `Entry` or in core.
_Avoid_: Link (reserved for the rendered geometry of a dependency, i.e. what appears in `GeometryFrame.links`), Relationship

**Segment**:
One contiguous stretch of an Entry's span, when that span is interrupted rather than continuous (`Entry.segments`). Segments are authored — an Entry without them is simply one unbroken stretch — and each one emits its own Item.
_Avoid_: Split, interval, piece

### Mutation

**Transaction**:
The unit of mutation: a batch of proposed edits that runs the resolve hook once and commits as one ChangeSet. One transaction per user gesture, at commit — never per intermediate drag frame.
_Avoid_: Batch, operation

**ChangeSet**:
The single, atomic record of everything one transaction changed — added/removed/updated entities across stores, tagged with an `origin` (`'user' | 'engine' | 'undo' | 'redo' | 'load'`). Every mutation produces exactly one ChangeSet, even when the resolve hook's installed scheduling plugin triggers cascades.
_Avoid_: Diff, patch (Patch is reserved for `ScheduleResult.patch`, the scheduler's proposed field changes before they're committed as a ChangeSet)

### Scheduling

**Resolve hook**:
The generic, synchronous hook `data/` calls once per transaction to turn a proposed edit into a committed one (D4, `plans/01` §1) — the identity function when no scheduling plugin is installed, or the installed plugin's `schedule()` otherwise. `data/` has no static, scheduling-specific dependency; this hook is the only seam. Exact contract (where per-plugin per-entry data lives, how preview and commit-time calls share one resolution) is design work tracked in issue #12.
_Avoid_: Scheduling hook (the hook itself is scheduling-agnostic — it's generic, and a non-scheduling plugin could occupy it)

**Scheduling plugin**:
Whatever plugin occupies the resolve hook, if any. FreeGantt ships an official bars + dependencies engine as its first-party default (D3) — described in §7 below — but core does not require it or any scheduling plugin to function (D4, ADR 0002).
_Avoid_: The scheduling engine (ambiguous between "the seam" and "FreeGantt's default implementation of it" — say "the resolve hook" or "the default scheduling plugin" explicitly)

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
The configuration that decides what the Rows are for a given Gantt — the Entries themselves (optionally as a tree), one Row per value of some grouping function, or a host-supplied resolver. Alternative views (workload, resources) are new row sources, not new rendering or interaction code.
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

**Group rollup**:
The bottom-up pass, run after dependency propagation settles, that derives a `kind: 'group'` Entry's `start`/`end` from the span of its children (earliest child start to latest child end). Once a group has children, the Group rollup owns its span from then on — it can't be set directly. A dependency attached to a `'group'` Entry resolves against its rolled-up span by default.
_Avoid_: Rollup pass (says "when," not "what" — Group rollup names the mechanism, not just its place in the pipeline)

**GeometryFrame**:
The complete, backend-neutral description of one rendered state: the visible Rows, the Items' boxes, the Dependency paths, and decorations, all as plain numbers. It is what a render backend consumes and the only thing it consumes — no host render output, no hit-region index, no DOM.
_Avoid_: Scene, render tree, viewport model

### Mounted instances

**Gantt**:
The public entry point and a whole mounted instance: one `Gantt` wraps one `host` element, one Dataset, and everything needed to render and interact with it. This is the sense used everywhere the specs discuss the product as a whole — D9's "multi-Gantt sync", I2's "two Gantt instances coexist independently", a host page that mounts "two Gantts". A `Gantt` _is_ the class; it is also the name of the concept, so `new Gantt(...)` and "a Gantt" mean the same thing.
_Avoid_: Chart (see #7 — "chart" used to name both this and `GanttShell`, ambiguously, and is retired from the codebase entirely)

**GanttShell**:
The internal `view/` class a `Gantt` constructs and owns: the DOM shell that holds the header band and the bars host (plans/01 §8.2-8.3, "the chart shell" in older text). Never public — `exports` is sealed to `api/` and `model/`. A `Gantt` is a thin façade over one `GanttShell`; the shell is where the grid pane / timeline pane / splitter split (S1) actually lives.
_Avoid_: Chart, ChartShell (rejected in #7 — "shell" alone doesn't say what it's a shell _of_; `GanttShell` reads correctly even far from its definition)

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

**TimeScale**:
The pure, DOM-free mapping between Instants and pixel positions, plus tick generation for a given ViewPreset. All time→pixel conversion in the codebase goes through a TimeScale — no inline pixel math.
_Avoid_: Viewport (Viewport is the rendered/visible region; TimeScale is the coordinate mapping a Viewport uses)

**TimeScaleModel**:
The standalone, shareable object that owns a TimeScale and that a Gantt binds to. Passing the same TimeScaleModel instance to two Gantt instances synchronizes their horizontal axis by construction — the mechanism behind multi-Gantt sync. It is constructed from Scale intent, never from resolved geometry.
_Avoid_: Scale (Scale, unqualified, means the underlying `TimeScale` the model wraps — `TimeScaleModel.scale`)

**Scale intent**:
What a caller states about how time should be displayed — a ViewPreset and a range that is either `'fitDataset'` or a pinned TimeSpan. Intent is all a caller ever supplies to a TimeScaleModel; the zone (which is the Dataset's, D6), the resolved span, and the pixels-per-millisecond factor are derived at bind time and are not a caller's to state.
_Avoid_: Scale options, scale config (both read as the resolved geometry, which is the opposite of intent)

**Binding**:
One Gantt's _data_ contribution to a shared pure model, supplied when it joins — plus the reaction to run when that model's resolved value changes. A Gantt binds on construction and unbinds on destroy, and both re-resolve the shared model. Binding is the vocabulary of the DOM-free models in `layout/viewport/`; the DOM side of the same seam is an Attachment.
_Avoid_: Attach (reserved for the DOM side), subscribe, register

**Scale binding**:
One Gantt's Binding to a TimeScaleModel: its Dataset's zone, its Entries, and its measured Pane size. This is how `'fitDataset'` spans every bound Dataset rather than whichever one was passed to the constructor.

**Attachment**:
A wiring between a DOM element and a pure model, living in `view/` and returned by an `attach*` function with a `detach()` method. An Attachment is the only thing on either side of the seam allowed to touch the element: `attachScroll` owns element scroll (I12), `attachSize` owns measurement. Distinct from a Binding, which carries data and never sees the DOM.
_Avoid_: Binding (that is the pure-model side), adapter, connector

**Pane size**:
The measured drawable box of a pane, pushed into the models by `view/` and never stated by a caller. It is a measurement of a rendered box — unrelated to the resize gesture, which drags an Entry's edge.
_Avoid_: Viewport width/size (Viewport is the fan-in object, not a box)

**ScrollModel**:
The standalone, shareable object owning a scroll position on both axes, and the only route by which any view or interaction code may read or write it. It resolves two things: the **position** — where the caller asked to be — and **max**, the loosest bound any bound Gantt needs, which is what a Pan clamps against. Max is not a claim about any one Gantt's scroller: each bound Gantt clamps the shared position to its own content, so a shorter chart stops at its last row while a taller one keeps going, and picks up where it stopped on the way back. Shared between Gantt instances the same way a TimeScaleModel is.
_Avoid_: Scroll position, offset, viewport state

**Pan**:
Moving the shared viewport — `ScrollModel.panTo`, and the drag gesture that will call into it. One concept at two layers, which is why they share the word. Distinct from **scroll**, which means one element's native offset and is confined to `view/scroll-attachment.ts` (I12): a Pan may result in no scroll at all when the chart is already at its end.
_Avoid_: Scroll (an element's native offset), move (move is dragging an Entry — `entryMove`), seek

**Reveal**:
Bringing a named Entry into view — the intent-level verb a host uses (`gantt.reveal(entryId)`). The library resolves the pixel position from the row geometry it already computes; a host never converts an index or a row height into a scroll offset.
_Avoid_: ScrollTo, scrollIntoView, goTo

**Batch**:
Several writes to a viewport model delivering at most one notification, and only if the resolved value actually changed. No observer ever sees an intermediate state. A Batch is _not_ a Transaction: it has no changeset, no undo entry, and no resolve hook — `layout/` has no edge to `data/`. The two words never substitute for each other.
_Avoid_: Transaction (that is `data/`'s unit of mutation), commit, freeze

**ViewPreset**:
The data description of one zoom level: what unit the ticks step in, how wide a tick is, and what header bands sit above them. A preset is a config object, so a new zoom level is never a library edit.
_Avoid_: Zoom level (a zoom level is what a preset expresses), timescale header

**Tick**:
One step of the time axis at the current ViewPreset's resolution — the unit the header bands label and the unit a gesture snaps to by default.
_Avoid_: Gridline (a gridline is one way a Tick is drawn), step

### Extension

**Capability**:
Whether a specific gesture (move, resize, link) is permitted on a given Entry, resolved once per Entry from its Kind and gating both the gesture itself and any affordance that hints at it (e.g. a resize handle only renders if resize is capable).
_Avoid_: Permission, ability

**GanttPlugin**:
The public extension contract: an `id` plus a `setup(ctx)` that returns a disposer. Built-in features (tooltips, context menu, editors) are themselves GanttPlugins using the same `PluginContext` a third party would use — no back-door capabilities reserved for first-party code.
_Avoid_: Extension (Extensions is the name of the source layer that hosts plugins; GanttPlugin is the unit within it)

**PluginContext**:
The object `setup(ctx)` receives — a GanttPlugin's entire world: dataset access, the event bus (including cancelable `before*` events), registration for decorations/columns/renderers/item-emitters/interaction-controllers/keybindings, the command registry, and a disposable store. A plugin may not reach into anything outside it (enforced by the import-boundary lint).
_Avoid_: Treating this as settled — the plugin system (`GanttPlugin`/`DatasetPlugin`/`PluginContext`) is still design work in progress; the shape, and possibly this name, may change before it lands

**DatasetPlugin**, **ProposalResolver**, **PluginStore**:
Names from the resolve hook's contract design (ADR 0002's consequences, issue #15, built on #12): a `DatasetPlugin` occupies the resolve hook via a `ProposalResolver`, and per-plugin per-entry data (e.g. the scheduling plugin's pin flag, `Dependency`) lives in a reserved `PluginStore` rather than on `Entry` or in a host/plugin-shared field. Design proposals only — not yet implemented or landed in `src/`; do not treat as existing API until #15 lands. Named `ProjectPlugin` before ADR 0004.
_Avoid_: Treating these as settled — the exact shapes are still open design work
