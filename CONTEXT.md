# FreeGantt

A framework-free TypeScript Gantt library: scheduling, layout, and rendering of tasks and their dependencies over time.

## Language

**Task**:
An authored unit of work with a start, an end, and a `kind`. Tasks are persisted; they are what a host creates, edits, and schedules.
_Avoid_: Bar, activity

**Item**:
A derived, renderable piece of geometry produced from a Task for one segment of its work — most tasks produce exactly one Item, but a Task with `segments` (interrupted work) produces one Item per segment. Items are recomputed on every layout pass and never persisted. `Item.id` is deterministic: `${taskId}:${segmentIndex}`.
_Avoid_: Bar (an Item is what a bar renders; "bar" is a rendering detail, not the identity)

**Kind**:
The authored classification of a Task (`'task' | 'group' | 'milestone'`, open to host-defined values) that selects its behavior at four seams: scheduling policy, item emission, rendering, and interaction capability. Kind is never derived from structure (e.g. from having children) — it is always explicitly set by whoever authored the Task.
_Avoid_: Type (reserved for `DependencyType`), category

**Grouping**:
The row-level nesting of the timeline grid (parent/child rows via `parentId`). Distinct from Kind: a Task of kind `'group'` and a Task with children are different things — a `'group'` Task rolls up its schedule from children, while grouping is purely about row hierarchy in the grid and applies regardless of kind.
_Avoid_: Group (ambiguous with the `'group'` kind — say "row grouping" or "the `'group'` kind" explicitly)

**Dependency**:
A first-class entity linking a predecessor Task to a successor Task with a type (`FS`/`SS`/`FF`/`SF`) and optional lag. Never embedded as an array on a Task.
_Avoid_: Link (reserved for the rendered geometry of a dependency, i.e. what appears in `GeometryFrame.links`), Relationship

**ChangeSet**:
The single, atomic record of everything one transaction changed — added/removed/updated entities across stores, tagged with an `origin` (`'user' | 'engine' | 'undo' | 'redo' | 'load'`). Every mutation produces exactly one ChangeSet, even when it triggers scheduling cascades.
_Avoid_: Diff, patch (Patch is reserved for `ScheduleResult.patch`, the scheduler's proposed field changes before they're committed as a ChangeSet)

**Transaction**:
The unit of mutation: a batch of proposed edits that runs one scheduling pass and commits as one ChangeSet. One transaction per user gesture, at commit — never per intermediate drag frame.
_Avoid_: Batch, operation

**SchedulingPolicy**:
The pluggable seam that resolves how a proposed edit interacts with a Task's kind and existing schedule (e.g. whether the engine may move it, how a `'group'` Task rolls up from children). Kind-specific scheduling semantics live in the policy, never in the scheduling engine itself.
_Avoid_: Rule, constraint (Diagnostics, not policy, is where constraint violations surface)

**Diagnostic**:
A non-authoritative report the scheduling engine attaches to a `ScheduleResult` when it cannot satisfy a request (e.g. a dependency cycle, naming the Task ids involved). The engine never silently rewrites what the user asked for — a conflict becomes a Diagnostic, not a mutation.
_Avoid_: Error, warning

**Capability**:
Whether a specific gesture (move, resize, link) is permitted on a given Task, resolved once per Task from its Kind and gating both the gesture itself and any affordance that hints at it (e.g. a resize handle only renders if resize is capable).
_Avoid_: Permission, ability

**TimeScale**:
The pure, DOM-free mapping between Instants and pixel positions, plus tick generation for a given ViewPreset. All time→pixel conversion in the codebase goes through a TimeScale — no inline pixel math.
_Avoid_: Viewport (Viewport is the rendered/visible region; TimeScale is the coordinate mapping a Viewport uses)

**TimeScaleModel**:
The standalone, shareable object that owns a TimeScale and that a Chart binds to. Passing the same TimeScaleModel instance to two Gantt instances synchronizes their horizontal axis by construction — the mechanism behind multi-chart sync.
_Avoid_: Scale (Scale, unqualified, means the underlying `TimeScale` the model wraps — `TimeScaleModel.scale`)

**GanttPlugin**:
The public extension contract: an `id` plus a `setup(ctx)` that returns a disposer. Built-in features (tooltips, context menu, editors) are themselves GanttPlugins using the same `PluginContext` a third party would use — no back-door capabilities reserved for first-party code.
_Avoid_: Extension (Extensions is the name of the source layer that hosts plugins; GanttPlugin is the unit within it)
