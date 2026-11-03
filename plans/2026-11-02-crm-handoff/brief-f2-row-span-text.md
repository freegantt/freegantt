# Brief F2: show the row span text on the harness

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `f2-row-span-text`. Port: 5302.

You work in the existing worktree of PR #666, branch `Pawel-IT/crm-row-span`. Override of wave-3 "Base": stay on that branch, push to the existing PR, and run the gate there. The bundle guard should pass there; if it fails, follow the wave-3 bundle rule with PR `666`.

## Change

1. The owner kept `rowSpan` `text` (ruling D10). The "Planned vs actual" harness page (`harness/plugins/planned-vs-actual.ts` and its page) does not use it yet. Make the page show the slip at the span's end, for example "+4d" when the actual end is four days after the planned end. Compute the number from the page's own planned and actual data. Use the public API only; the Stop rule applies.
2. Extend the page's e2e: the text is visible on a late Entry and absent on an on-time Entry.
3. `CHANGELOG.md` line (harness feature).
