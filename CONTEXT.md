# FreeGantt

A framework-free TypeScript Gantt library: scheduling, layout, and rendering of tasks and their dependencies over time.

## Language

### Authored model

**Project**:
The body of authored data — its Tasks and Dependencies — together with the settings that give it meaning, above all the IANA zone in which all civil arithmetic is performed. "The project's zone" and "the project's reference date" are properties of this, not of the host environment.
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
A horizontal track of the chart — the unit of vertical layout, and what the grid pane and the timeline pane both position against. Rows are derived on every layout pass and never persisted. A Row is not a Task: one Row may carry the Items of many Tasks, and a row source may produce Rows that correspond to no Task at all.
_Avoid_: Line, track (a track is what a Lane is), record

**Row source**:
The configuration that decides what the Rows are for a given chart — the Tasks themselves (optionally as a tree), one Row per value of some grouping function, or a host-supplied resolver. Alternative views (workload, resources) are new row sources, not new rendering or interaction code.
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

### Time and viewport

**Civil time**:
A reading off a wall clock — year, month, day, hour, minute — with no zone attached and therefore no fixed position on the timeline. "Civil" is the standard term of art for this (it is what Temporal, C++'s `<chrono>`, and Abseil all call it) and it is deliberately not "local time": _local_ would suggest the machine's zone, which this project never consults. Civil arithmetic ("the next day", "the start of this week") is the arithmetic that needs a zone to mean anything, and all of it lives in `time/`.
_Avoid_: Local time (means the machine's zone to most readers — the exact confusion this term exists to prevent), wall time (means elapsed duration in performance contexts), calendar time

**Instant**:
An absolute point on the timeline, stored as epoch milliseconds and branded so it cannot be confused with a plain number. An Instant carries no zone; every civil interpretation of one (what day it falls on, what "add a day" means) resolves through the Project's zone.
_Avoid_: Date, timestamp, epoch

**TimeScale**:
The pure, DOM-free mapping between Instants and pixel positions, plus tick generation for a given ViewPreset. All time→pixel conversion in the codebase goes through a TimeScale — no inline pixel math.
_Avoid_: Viewport (Viewport is the rendered/visible region; TimeScale is the coordinate mapping a Viewport uses)

**TimeScaleModel**:
The standalone, shareable object that owns a TimeScale and that a Chart binds to. Passing the same TimeScaleModel instance to two Gantt instances synchronizes their horizontal axis by construction — the mechanism behind multi-chart sync.
_Avoid_: Scale (Scale, unqualified, means the underlying `TimeScale` the model wraps — `TimeScaleModel.scale`)

**ScrollModel**:
The standalone, shareable object owning a chart's scroll position on both axes, and the only route by which any view or interaction code may read or write it. Shared between charts the same way a TimeScaleModel is, which is what makes one scroll owner drive both panes of a split view.
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
