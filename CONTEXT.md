# FreeGantt

A framework-free TypeScript Gantt library: layout and rendering of dated Entries over time. Scheduling — dependencies, propagation, constraints — is one optional first-party plugin (ADR 0002), not what the library is about. The core vocabulary is therefore domain-neutral (ADR 0003): a host charting shifts, bookings, machine uptime, or units sold per week is as much the intended user as one charting a project plan.

## Language

### Authored model

**Dataset**:
The body of authored data — its Entries, plus whatever scheduling-plugin-owned data (e.g. Dependencies) an installed scheduling plugin contributes — together with the settings that give it meaning, above all the IANA zone in which all zone-aware date arithmetic is performed. "The dataset's zone" and "the dataset's reference date" are properties of this, not of the host environment. A Dataset with no scheduling plugin installed has Entries and no Dependencies at all (ADR 0002). Renamed from Project in ADR 0004 — read every historical "Project" as "Dataset". `model/dataset.ts`'s `Dataset` is the structural contract `api/dataset.ts`'s `Dataset` class satisfies (`implements`) — the same host/façade relationship the Gantt entry states, and the type `layout/` binds against without importing `view/` or `api/` (S1.7 §3.2; formerly `DatasetLike` in `view/gantt-shell.ts`).
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

**FrameLayout**:
The `layout/` object that runs one Gantt's layout pass (`layout/frame-layout.ts`) and keeps what that pass must remember between renders — today the row-height index, tomorrow S5's finer-grained invalidation. `computeFrame` stays pure; FrameLayout is what makes the index O(log n) _across_ renders rather than per render. One instance per Gantt: the index describes that Gantt's rows and is not shareable, unlike a TimeScaleModel or a ScrollModel.
_Avoid_: Layout cache, frame builder (it computes the pass; the cache is how, not what)

**Gantt**:
The public entry point and a whole mounted instance: one `Gantt` wraps one `host` element, one Dataset, and everything needed to render and interact with it. This is the sense used everywhere the specs discuss the product as a whole — D9's "multi-Gantt sync", I2's "two Gantt instances coexist independently", a host page that mounts "two Gantts". A `Gantt` _is_ the class; it is also the name of the concept, so `new Gantt(...)` and "a Gantt" mean the same thing.
_Avoid_: Chart (see #7 — "chart" used to name both this and `GanttShell`, ambiguously, and is retired from the codebase entirely)

**GanttShell**:
The internal `view/` class a `Gantt` constructs and owns: the composition root that wires the Pane layout, the render backend, and the viewport attachments together (plans/01 §8.2-8.3, S1.8, "the chart shell" in older text). Never public — `exports` is sealed to `api/` and `model/`. A `Gantt` is a thin façade over one `GanttShell`; the shell _composes_ the Grid pane / Timeline pane / Splitter split, `PaneLayout` _holds_ it.
_Avoid_: Chart, ChartShell (rejected in #7 — "shell" alone doesn't say what it's a shell _of_; `GanttShell` reads correctly even far from its definition)

**Pane layout**:
The DOM skeleton one Gantt's host is split into: a Grid pane, a Splitter, and a Timeline pane, built and owned by `view/pane-layout.ts`'s `PaneLayout` class (plans/01 §8.3, S1.8). Structure and one number only — Grid width — no geometry, no scale, no data, no frame, no events. `GanttShell` composes a Pane layout; it does not build panes itself.
_Avoid_: Layout (Layout, unqualified, is the `layout/` source directory and its pure geometry types — a different concept)

**Grid pane**:
The left-hand pane of a Pane layout: row labels and, from S6, columns. It has no scrollbar of its own — its row layer follows the Timeline pane's native scroll by one `translateY` transform per frame instead of a second real scroller (D-S1.8-1), which is what keeps I9's pixel identity structural rather than something a caller maintains by hand.
_Avoid_: Label column, gutter (gutter was the pre-S1.8 shape, where the row-label width lived inside the render backend's paint layer instead of being a pane in its own right — D-S1.8-2 retired it)

**Timeline pane**:
The right-hand pane of a Pane layout and the single native scroller for both axes (D-D, D-S1.8-1): header bands, bars, links, and decorations all mount inside it. `attachScroll` and `attachPaneSize` both bind to this element, never to the host or the Grid pane.
_Avoid_: Chart area, canvas (canvas reads as the future canvas render backend, a different concept)

**Splitter**:
The draggable boundary between the Grid pane and the Timeline pane (`view/splitter.ts`'s `attachSplitter`). A pointer drag previews a candidate Grid width live and proposes the final value on release; it writes no state of its own; `GanttShell` decides whether a proposal becomes the committed Grid width.
_Avoid_: Resizer, drag handle (both describe the affordance, not the domain concept a host or reviewer needs to name)

**Grid width**:
The Grid pane's width in px — the one number `PaneLayout` owns and the one thing a Splitter drag changes. Public as `gantt.gridWidth`, with the cancelable `beforeGridWidthChange`/`gridWidthChange` pair (S1.8). Spelled two ways on purpose: `gridWidth` in code, where the object it hangs off disambiguates, but `--fg-grid-pane-width` as a CSS custom property, where there is no object to disambiguate and "grid width" alone would read as gridline spacing among other tick/gridline tokens. Both spellings name the same number.
_Avoid_: Grid pane width in code (too long once `gantt.` already says "grid pane"), gutter width (gutter is retired — see Grid pane)

**Render surface**:
One of the two DOM elements (`grid`, `timeline`) a `RenderBackend.mount()` receives (`render/backend.ts`'s `RenderSurfaces<THost>`, S1.8). `render/dom` puts the row layer in the grid surface and the header/bar/sizer layers in the timeline surface; `render/null` ignores both. Replaces the pre-S1.8 single-`host` `mount()`, which reserved the row-label gutter inside the paint layer itself.
_Avoid_: Mount target, host (host is the Gantt's own DOM anchor — a different, higher-level concept)

**Event bus**:
The `view/event-bus.ts` class (`EventBus<TEvents>`) a `GanttShell` holds privately and `on`/`off` delegate to. Two events exist as of S1.8 — `beforeGridWidthChange` (cancelable) and `gridWidthChange` (notification) — and `GanttEventMap` is the map new event pairs join as later slices add gestures. Not exported from `api/`; a `Gantt`'s `on`/`off` are the only public surface onto it.
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
What a host writes where the library stores an Entry: ids as plain strings, dates as any Instant input. `Dataset` reads an Entry input into an Entry once, at construction — branding the ids and resolving the dates through its own zone. The distinction is the whole reason the core can stay strict about branded values without making a host construct them: looseness lives at the api/ boundary and nowhere behind it. An Entry is itself a valid Entry input, so a host already holding branded values passes them straight through.
_Avoid_: Raw entry, entry DTO, unvalidated entry (nothing here is a validation stage — it is a reading)

**Instant input**:
Any value a host may write where an Instant is stored: an Instant, a `Date`, epoch milliseconds, or a string. A string carrying an explicit `Z` or numeric offset is absolute; every other string is a Plain time and resolves through the Dataset's zone. `time/toInstant` is the single place that reading happens.
_Avoid_: Date input, raw date, loose instant

**Date-only end**:
An `end` written as a bare calendar date — `'2026-09-08'`, no time of day. Storage is half-open `[start, end)`, so `end` is the boundary after the entry rather than its last moment, but a host writing a bare date means the last day it wants included. The `dateOnlyEnd` option names which of the two readings applies, and it applies to nothing else: an end that already carries a time of day is a boundary already.
_Avoid_: Inclusive end, end date (an option named `endDate` should hold a date, not a rule)

**TimeScale**:
The pure, DOM-free mapping between Instants and pixel positions, plus tick generation for a given ViewPreset. All time→pixel conversion in the codebase goes through a TimeScale — no inline pixel math.
_Avoid_: Viewport (Viewport is the fan-in object; the region is Visible)

**TimeScaleModel**:
The standalone, shareable object that owns a TimeScale and that a Gantt binds to. Passing the same TimeScaleModel instance to two Gantt instances synchronizes their horizontal axis by construction — the mechanism behind multi-Gantt sync. It is constructed from Scale intent, never from resolved geometry.
_Avoid_: Scale (Scale, unqualified, means the underlying `TimeScale` the model wraps — `TimeScaleModel.scale`)

**Scale intent**:
What a caller states about how time should be displayed — a ViewPreset and a range that is either `'fitDataset'` or a pinned TimeSpan. Intent is all a caller ever supplies to a TimeScaleModel; the zone (which is the Dataset's, D6), the resolved span, and the pixels-per-millisecond factor are derived at bind time and are not a caller's to state.
_Avoid_: Scale options, scale config (both read as the resolved geometry, which is the opposite of intent)

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
The fan-in object (`layout/viewport/viewport.ts`) that owns one TimeScaleModel and one ScrollModel behind a single `bind`/handle/reaction, so `view/` never holds more than one of either (S1.7, D-S1.7-1). One measurement — a pane resize — fans out through it to the scale's pane width, the scroll model's pane size, and Visible's own width/height, coalesced to one host notification. Not exported from `api/`; `view/` is its only caller. One Viewport serves one Gantt — it holds that Gantt's pane and content extents, so a second `bind()` throws rather than replacing the reaction. Sharing is what the models are for.
_Avoid_: Viewport width/size (that measurement is Pane size), the rendered/visible region (that is Visible)

**Visible**:
The culled region a Viewport resolves, in timeline-content coordinates, from the **locally clamped** scroll position — this Gantt's own pushed `{content, pane}` extents, not ScrollModel's loosest-bound-across-bindings `max` (D-S1.7-2). Feeds `LayoutInput.visible` directly and is what `attachScroll` writes back to the element.
_Avoid_: Viewport (Viewport is the object that resolves this, not the region itself), culling window (fine in prose as a synonym, but the type and field name are `visible`/`Rect`)

**Overscan**:
The live-reconfigurable culling buffer a Viewport applies before handing `visible` to `computeFrame`: `verticalRows` (through the row-height index, since row heights vary from S5) and `horizontalPx` (bars and header ticks only — rows stay vertical-only). Default `{ verticalRows: 2, horizontalPx: 128 }`; a zero value disables culling on that axis.
_Avoid_: Buffer, padding, margin

**Header band**:
One row of the time-axis header, emitted per `ViewPreset.headers` entry, coarsest first (e.g. months over weeks). Each band carries its own `unit`/`increment` and Ticks; `render/dom` keys bands by index and ticks within a band, so a preset with one header renders one `.fg-band` wrapper.
_Avoid_: Header row (Header band is the term of art; "row" is reserved for grid Rows)

**ScrollModel**:
The standalone, shareable object owning a scroll position on both axes, and the only route by which any view or interaction code may read or write it. It resolves two things: the **position** — where the caller asked to be — and **max**, the loosest bound any bound Gantt needs, which is what a Pan clamps against. Max is not a claim about any one Gantt's scroller: each bound Gantt clamps the shared position to its own content, so a shorter chart stops at its last row while a taller one keeps going, and picks up where it stopped on the way back. Shared between Gantt instances the same way a TimeScaleModel is.
_Avoid_: Scroll position, offset, viewport state

**Pan**:
Moving the shared viewport — `ScrollModel.panTo`, and the drag gesture that will call into it. One concept at two layers, which is why they share the word. Distinct from **scroll**, which means one element's native offset and is confined to `view/scroll-attachment.ts` (I12): a Pan may result in no scroll at all when the chart is already at its end.
_Avoid_: Scroll (an element's native offset), move (move is dragging an Entry — `entryMove`), seek

**Reveal**:
Bringing a named Entry into view — the intent-level verb a host uses (`gantt.reveal(entryId)`). The library resolves the pixel position from the row geometry it already computes; a host never converts an index or a row height into a scroll offset. Nearest-edge, not center: a no-op if the Entry is already inside Visible, otherwise the Pan moves exactly enough to align the nearest off-screen edge. Landed on both axes at S1.9 (D-S1.9-6) — the x half was a no-op before Zoom existed, since content width equalled pane width.
_Avoid_: ScrollTo, scrollIntoView, goTo, center (Reveal is nearest-edge; centering is a deferred, separate policy)

**Batch**:
Several writes to a viewport model delivering at most one notification, and only if the resolved value actually changed. No observer ever sees an intermediate state. A Batch is _not_ a Transaction: it has no changeset, no undo entry, and no resolve hook — `layout/` has no edge to `data/`. The two words never substitute for each other.
_Avoid_: Transaction (that is `data/`'s unit of mutation), commit, freeze

**ViewPreset**:
The data description of one zoom level: what unit the ticks step in, how wide a tick is, and one or more header bands sitting above them, coarsest first. A preset is a config object, so a new zoom level is never a library edit. `tickUnit` is never coarser than the finest header — a label must not claim a boundary no gridline draws.
_Avoid_: Zoom level (a zoom level is what a preset expresses), timescale header

**Preset reference**:
What a caller states to name a ViewPreset: a shipped preset id (autocompletes against the closed `ShippedPresetId` union) or a full custom ViewPreset object. `resolvePreset` is the one place a Preset reference turns into a ViewPreset — a shipped id resolves against the built-in table and throws `UnknownPresetError` for anything outside it; a ViewPreset object passes through unchanged, so a custom preset is never a library edit.
_Avoid_: Preset id (that names only the shipped-id half), preset name

**Range**:
The full content span a TimeScale maps — `'fitDataset'`'s min/max over every bound Dataset, or a pinned TimeSpan. Distinct from Zoom: Range says how much time the content covers; Zoom says how many pixels each unit of that time gets. Never written by an anchored zoom (D-F′) — only a Dataset edit or a caller assigning `range` moves it.
_Avoid_: Span (Range is the caller-facing intent; span is used loosely elsewhere for a resolved interval), window, extent

**Zoom**:
The density mode a TimeScale resolves `pxPerMs` from: `'fitViewport'` (the default — content fills the measured pane width), `'preset'` (the preset's own density, ignoring pane width — the first mode where content can exceed the pane), or an explicit `{ pxPerMs }`. Distinct from Range (what content is shown) and from Preset reference (which labels and tick unit are shown) — Zoom answers only "how many pixels per unit of time."
_Avoid_: Scale (Scale is the resolved `TimeScale` object, not this mode), density (fine in prose, but the type and field name are `zoom`/`TimeScaleZoom`)

**Anchored zoom**:
The read-before-write contract behind `Viewport.zoomTo`/`zoomBy` (D-S1.9-5): the Instant currently under the anchor pixel is read before anything is written, then Scale and Pan are updated together inside one Batch so that same Instant is back under the anchor pixel afterward. The anchor is always derived from a stated pixel position, never supplied as an Instant — a caller states _where_, not _what the pixel currently means_.
_Avoid_: Pinned zoom, cursor zoom (the mechanism is not specific to a pointer — a caller can anchor anywhere)

**Tick**:
One step of the time axis at the current ViewPreset's resolution — the unit the header bands label and the unit a gesture snaps to by default. Since S1.7 a Tick also carries its own cell `width` (px to the next boundary at its band's step), so a DST-shortened or -lengthened day draws at its true width instead of an assumed constant.
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
