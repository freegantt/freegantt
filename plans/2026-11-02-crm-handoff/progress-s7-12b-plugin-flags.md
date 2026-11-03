# Progress S7.12b

sha | item | state | next step
f8fae58b | B2 setConstraint flag spans the commit | done, test first | none
4be9ade6 | B3 overruled drag seeds the rerun from the allowed dates | done, test first | none
090a20a8 | O7 queuePushAfterSync coalesces | done, test first | none
- | O5, O6 | measured, left | see numbers below

Measure: 1,000-Entry FS chain, vitest in Node (no DOM), mean of 20 runs.
- Full `entries.update` of the chain head through `scheduling()`: 18.9 ms.
- `calculateFloat()` alone: 1.3 ms (about 7% of an edit). O5 needs a "this is a preview" signal on `EditRequest`. None exists, so the fix is not small.
- `schedule()` audit alone: 2.0 ms (about 10%). O6 saves it only for the plugin's own float write.
