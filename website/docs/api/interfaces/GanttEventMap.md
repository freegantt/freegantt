# Interface: GanttEventMap

Defined in: view/event-bus.ts:131

Declared events fire (I11). `navigationChange` has no `before*` pair: Preset/Fit/Pan writes are
 reconfiguration, not a vetoable gesture (S1.9).

## Properties

### beforeCollapseChange

> **beforeCollapseChange**: [`CollapseChange`](CollapseChange.md)

Defined in: view/event-bus.ts:139

S4.6, D-S4-22. Sync veto: returning `false` leaves the collapsed set untouched.

***

### beforeEntryEdit

> **beforeEntryEdit**: [`EntryFieldEdit`](EntryFieldEdit.md)

Defined in: view/event-bus.ts:159

S5.8, D-S5-19. Fires before the built-in editor opens, not before the write. Sync or async
 veto (D-S3-17's same shape): returning `false`, or a Promise that settles `false`, suppresses
 the built-in editor entirely — a consumer opens its own dialog instead (U8).

***

### beforeEntryMove

> **beforeEntryMove**: [`EntryGestureEvent`](EntryGestureEvent.md) & [`Refusable`](Refusable.md)

Defined in: view/event-bus.ts:145

S3.3, D-S3-16. Sync or async veto (D-S3-17): returning `false` or a Promise that settles
 `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles.
 `Refusable` on the `before*` half only (#210): `return move.refuse('…')` says why, and the
 words reach the `entry-move-cancelled` report core raises for the veto.

***

### beforeEntryResize

> **beforeEntryResize**: [`EntryResize`](EntryResize.md) & [`Refusable`](Refusable.md)

Defined in: view/event-bus.ts:150

S3.4, D-S3-22. Sync or async veto (D-S3-17): returning `false` or a Promise that settles
 `false` commits nothing. A returned Promise holds the commit-draft ghost until it settles.
 `Refusable` on the `before*` half only (#210), the same as `beforeEntryMove`.

***

### beforeGridColumnsChange

> **beforeGridColumnsChange**: [`GridColumnsChange`](GridColumnsChange.md)

Defined in: view/event-bus.ts:154

S5.7, D-S5-18. Sync veto: returning `false` leaves `gridColumns` (and whatever was live-painted
 during the drag that proposed this change) untouched.

***

### beforeGridWidthChange

> **beforeGridWidthChange**: [`GridWidthChange`](GridWidthChange.md)

Defined in: view/event-bus.ts:132

***

### beforeSelectionChange

> **beforeSelectionChange**: [`SelectionChange`](SelectionChange.md)

Defined in: view/event-bus.ts:136

S3, D-S3-10. Sync veto: returning `false` leaves the selection untouched.

***

### collapseChange

> **collapseChange**: [`CollapseChange`](CollapseChange.md)

Defined in: view/event-bus.ts:140

***

### entryEdit

> **entryEdit**: [`EntryFieldEdit`](EntryFieldEdit.md)

Defined in: view/event-bus.ts:161

S5.8, D-S5-19. Fires after the commit, `to` the value actually written.

***

### entryMove

> **entryMove**: [`EntryGestureEvent`](EntryGestureEvent.md)

Defined in: view/event-bus.ts:146

***

### entryResize

> **entryResize**: [`EntryResize`](EntryResize.md)

Defined in: view/event-bus.ts:151

***

### error

> **error**: [`ErrorReport`](ErrorReport.md)

Defined in: view/event-bus.ts:167

S5.12, D-S5-40: every refusal and every recovered fault a Gantt observes — a vetoed drag, a
 renderer that threw, a plugin disposer that threw. The same name and the same payload the
 Dataset raises (`DatasetEventMap.error`), because a consumer knows one shape either way; the
 Gantt never forwards the Dataset's own reports, so nothing arrives twice (D-S5-42). Sync only,
 and no `before*` pair: a report states what already happened.

***

### gridColumnsChange

> **gridColumnsChange**: [`GridColumnsChange`](GridColumnsChange.md)

Defined in: view/event-bus.ts:155

***

### gridWidthChange

> **gridWidthChange**: [`GridWidthChange`](GridWidthChange.md)

Defined in: view/event-bus.ts:133

***

### navigationChange

> **navigationChange**: [`NavigationChange`](NavigationChange.md)

Defined in: view/event-bus.ts:134

***

### selectionChange

> **selectionChange**: [`SelectionChange`](SelectionChange.md)

Defined in: view/event-bus.ts:137
