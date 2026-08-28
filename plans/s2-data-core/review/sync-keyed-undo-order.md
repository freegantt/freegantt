# Quick review — `de8a4e1` undo-restored DOM order

**Commit:** `de8a4e1` Fix undo-restored rows appending to the end of the DOM  
**File:** `src/render/dom/sync-keyed.ts` only (+9 / −1)

## Verdict

The fix is in the right module. S2.6 already restored **store** insertion order (`#removedAtIndex`). This commit restores **DOM** order in the keyed reconciler. Those are two jobs: authored Snapshot order vs derived children. Not a second copy of History.

`syncKeyed` used to `append` on first sight of a key. Undo of a remove creates a new node (the old one was pruned), so it always landed last. Geometry (`top` / transform) still painted the row in the right place, so the bug showed up as zebra striping and tab/screen-reader order, not as a bar in the wrong Y.

The walk (`previousNode` + `insertBefore` when `node !== expectedNext`) is the standard keyed-list reorder. Steady frames do not write: if the node is already the expected next sibling, the call is skipped. That matches the hot-path rule (class/transform only when geometry is unchanged).

## Gaps

- **No test.** Nothing in `src/render/dom/` or `e2e/` asserts child order after a key disappears and returns. A pure test of `syncKeyed` (create A,B,C → drop B → restore B → `layer.children` is A,B,C) would lock this. An e2e that removes a middle row, undoes, and checks `nth-child` / DOM order would lock the Gantt path.
- The comment cites `#undo-restores-append-only`, which is not an issue id in this repo. Search will not find a ticket.

## Spec / architecture

S2.5/S2.6 did not name the reconciler. This is view work that the store restore made visible. It does not fight D-S2-23/24. It does not widen the consumer Dataset interface.

**Do not** fold this into History or the EntryStore. DOM order belongs in `syncKeyed`.
