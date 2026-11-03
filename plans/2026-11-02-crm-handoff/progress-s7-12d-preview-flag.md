# Progress S7.12d

sha | item | state | next step
0799f093 | EditRequest.isPreview, filled on preview and commit paths, API report, CHANGELOG Added | done, tests both paths | none
a3ebbf7d | scheduling skips floatEdits on preview, CHANGELOG Changed | done, test first | none
9767492d | docs/06-plugin-authoring.md isPreview section | done | none

Measure: 1,000-Entry FS chain, one preview frame (`extraEditsFor` on the chain head), vitest in Node, mean of 20 runs after 5 warm-up runs.
- Before: 8.87 ms.
- After: 5.24 ms (about 41% less).
