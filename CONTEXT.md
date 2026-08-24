# FreeGantt

A framework-free TypeScript Gantt library: scheduling, layout, and rendering of tasks and their dependencies over time.

## Language

### Authored model

**Project**:
The body of authored data — its Tasks and Dependencies — together with the settings that give it meaning, above all the IANA zone in which all zone-aware date arithmetic is performed. "The project's zone" and "the project's reference date" are properties of this, not of the host environment.
_Avoid_: Plan, schedule (a schedule is an output of scheduling a Project, not the Project itself), dataset

**Task**:
An authored unit of work with a start, an end, and a `kind`. Tasks are persisted; they are what a host creates, edits, and schedules.
_Avoid_: Bar, activity

**Kind**:
The authored classification of a Task (`'task' | 'group' | 'milestone'`, open to host-defined values) that selects its behavior at four seams: scheduling policy, item emission, rendering, and interaction capability. Kind is never derived from structure (e.g. from having children) — it is always explicitly set by whoever authored the Task.
_Avoid_: Type (reserved for `DependencyType`), category

**Dependency**:
A first-class entity linking a predecessor Task to a successor Task with a type (`FS`/`SS`/`FF`/`SF`) and optional lag. Never embedded as an array on a Task.
_Avoid_: Link (reserved for the rendered geometry of a dependency, i.e. what appears in `GeometryFrame.links`), Relationship

**Segment**:
One contiguous stretch of a Task's work, when that work is interrupted rather than continuous (`Task.segments`). Segments are authored — a Task without them is simply one span of work — and each one emits its own Item.
_Avoid_: Split, interval, piece

### Mutation

**Transaction**:
The unit of mutation: a batch of proposed edits that runs one scheduling pass and commits as one ChangeSet. One transaction per user gesture, at commit — never per intermediate drag frame.
_Avoid_: Batch, operation

**ChangeSet**:
The single, atomic record of everything one transaction changed — added/removed/updated entities across stores, tagged with an `origin` (`'user' | 'engine' | 'undo' | 'redo' | 'load'`). Every mutation produces exactly one ChangeSet, even when it triggers scheduling cascades.
_Avoid_: Diff, patch (Patch is reserved for `ScheduleResult.patch`, the scheduler's proposed field changes before they're committed as a ChangeSet)

### Scheduling

**SchedulingPolicy**:
The pluggable seam that resolves how a proposed edit interacts with a Task's kind and existing schedule (e.g. whether the engine may move it, how a `'group'` Task rolls up from children). Kind-specific scheduling semantics live in the policy, never in the scheduling engine itself.
_Avoid_: Rule, constraint (Diagnostics, not policy, is where constraint violations surface)

**Diagnostic**:
A non-authoritative report the scheduling engine attaches to a `ScheduleResult` when it cannot satisfy a request (e.g. a dependency cycle, naming the Task ids involved). The engine never silently rewrites what the user asked for — a conflict becomes a Diagnostic, not a mutation.
_Avoid_: Error, warning

### Derived layout

**Row**:
A horizontal track of a Gantt — the unit of vertical layout, and what the grid pane and the timeline pane both position against. Rows are derived on every layout pass and never persisted. A Row is not a Task: one Row may carry the Items of many Tasks, and a row source may produce Rows that correspond to no Task at all.
_Avoid_: Line, track (a track is what a Lane is), record

**Row source**:
The configuration that decides what the Rows are for a given Gantt — the Tasks themselves (optionally as a tree), one Row per value of some grouping function, or a host-supplied resolver. Alternative views (workload, resources) are new row sources, not new rendering or interaction code.
_Avoid_: Row provider, row model

**Item**:
A derived, renderable piece of geometry produced from a Task for one Segment of its work — most tasks produce exactly one Item, but a Task with Segments produces one Item per Segment. Items are recomputed on every layout pass and never persisted. `Item.id` is deterministic: `${taskId}:${segmentIndex}`.
_Avoid_: Bar (an Item is what a bar renders; "bar" is a rendering detail, not the identity)

**Lane**:
A sub-track within a Row, assigned by the layout pass so that Items whose spans overlap on the same Row are stacked instead of drawn on top of each other. A Lane is a packing result — always derived, never authored.
_Avoid_: Sub-row, level, stack

**Grouping**:
The row-level nesting of the timeline grid (parent/child rows via `parentId`). Distinct from Kind: a Task of kind `'group'` and a Task with children are different things — a `'group'` Task rolls up its schedule from children, while grouping is purely about row hierarchy in the grid and applies regardless of kind.
_Avoid_: Group (ambiguous with the `'group'` kind — say "row grouping" or "the `'group'` kind" explicitly)

**GeometryFrame**:
The complete, backend-neutral description of one rendered state: the visible Rows, the Items' boxes, the Dependency paths, and decorations, all as plain numbers. It is what a render backend consumes and the only thing it consumes — no host render output, no hit-region index, no DOM.
_Avoid_: Scene, render tree, viewport model

### Mounted instances

**Gantt**:
The public entry point and a whole mounted instance: one `Gantt` wraps one `host` element, one Project, and everything needed to render and interact with it. This is the sense used everywhere the specs discuss the product as a whole — D9's "multi-Gantt sync", I2's "two Gantt instances coexist independently", a host page that mounts "two Gantts". A `Gantt` _is_ the class; it is also the name of the concept, so `new Gantt(...)` and "a Gantt" mean the same thing.
_Avoid_: Chart (see #7 — "chart" used to name both this and `GanttShell`, ambiguously, and is retired from the codebase entirely)

**GanttShell**:
The internal `view/` class a `Gantt` constructs and owns: the DOM shell that holds the header band and the bars host (plans/01 §8.2-8.3, "the chart shell" in older text). Never public — `exports` is sealed to `api/` and `model/`. A `Gantt` is a thin façade over one `GanttShell`; the shell is where the grid pane / timeline pane / splitter split (S1) actually lives.
_Avoid_: Chart, ChartShell (rejected in #7 — "shell" alone doesn't say what it's a shell _of_; `GanttShell` reads correctly even far from its definition)

### Time and viewport

**Plain time**:
A reading off a wall clock — year, month, day, hour, minute — with no zone attached, and therefore naming no single point on the timeline until a zone resolves it. The name is Temporal's (`PlainDate`, `PlainDateTime`), which is what `time/` is built on and what it becomes when native `Temporal` ships. Turning a Plain time into an Instant requires a zone and can be ambiguous (a DST fold) or impossible (a DST gap) — resolving those is exactly why `time/` exists.
_Avoid_: Civil time (the standard term of art elsewhere, including Temporal's own spec text and C++'s `<chrono>` — expect to meet it in external docs, but don't use it here), local time (reads as "the machine's zone", which this project never consults), wall time (means elapsed duration in performance contexts)

**Zone-aware date arithmetic**:
Any operation whose answer depends on a zone — the start of a day, the next Monday, how many days lie between two Instants. It is the arithmetic that DST makes non-obvious (a "day" is not always 86,400,000 ms) and it lives exclusively in `time/`, resolved through the Project's zone.
_Avoid_: Plain arithmetic (reads as "simple arithmetic" — say "zone-aware" for the operation and "plain" only for the value), date math, civil arithmetic

**Instant**:
An absolute point on the timeline, stored as epoch milliseconds and branded so it cannot be confused with an ordinary number. An Instant carries no zone; every zone-dependent reading of one (what day it falls on, what "add a day" means) resolves through the Project's zone.
_Avoid_: Date, timestamp, epoch

**TimeScale**:
The pure, DOM-free mapping between Instants and pixel positions, plus tick generation for a given ViewPreset. All time→pixel conversion in the codebase goes through a TimeScale — no inline pixel math.
_Avoid_: Viewport (Viewport is the rendered/visible region; TimeScale is the coordinate mapping a Viewport uses)

**TimeScaleModel**:
The standalone, shareable object that owns a TimeScale and that a Gantt binds to. Passing the same TimeScaleModel instance to two Gantt instances synchronizes their horizontal axis by construction — the mechanism behind multi-Gantt sync. It is constructed from Scale intent, never from resolved geometry.
_Avoid_: Scale (Scale, unqualified, means the underlying `TimeScale` the model wraps — `TimeScaleModel.scale`)

**Scale intent**:
What a caller states about how time should be displayed — a ViewPreset and a range that is either `'fitProject'` or a pinned TimeSpan. Intent is all a caller ever supplies to a TimeScaleModel; the zone (which is the Project's, D6), the resolved span, and the pixels-per-millisecond factor are derived at bind time and are not a caller's to state.
_Avoid_: Scale options, scale config (both read as the resolved geometry, which is the opposite of intent)

**Scale binding**:
One Gantt's contribution to a TimeScaleModel's resolution: its Project's zone, its Tasks, its measured viewport width, and the reaction to run when the resolved scale changes. A Gantt binds on construction and unbinds on destroy, and both re-resolve the shared TimeScale — which is how `'fitProject'` spans every bound Project rather than whichever one was passed to the constructor.
_Avoid_: Attach, subscribe, register

**ScrollModel**:
The standalone, shareable object owning a Gantt's scroll position on both axes, and the only route by which any view or interaction code may read or write it. Shared between Gantt instances the same way a TimeScaleModel is, which is what makes one scroll owner drive both panes of a split view.
_Avoid_: Scroll position, offset, viewport state

**ViewPreset**:
The data description of one zoom level: what unit the ticks step in, how wide a tick is, and what header bands sit above them. A preset is a config object, so a new zoom level is never a library edit.
_Avoid_: Zoom level (a zoom level is what a preset expresses), timescale header

**Tick**:
One step of the time axis at the current ViewPreset's resolution — the unit the header bands label and the unit a gesture snaps to by default.
_Avoid_: Gridline (a gridline is one way a Tick is drawn), step

### Extension

**Capability**:
Whether a specific gesture (move, resize, link) is permitted on a given Task, resolved once per Task from its Kind and gating both the gesture itself and any affordance that hints at it (e.g. a resize handle only renders if resize is capable).
_Avoid_: Permission, ability

**GanttPlugin**:
The public extension contract: an `id` plus a `setup(ctx)` that returns a disposer. Built-in features (tooltips, context menu, editors) are themselves GanttPlugins using the same `PluginContext` a third party would use — no back-door capabilities reserved for first-party code.
_Avoid_: Extension (Extensions is the name of the source layer that hosts plugins; GanttPlugin is the unit within it)
