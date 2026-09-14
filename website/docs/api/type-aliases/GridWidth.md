# Type Alias: GridWidth

> **GridWidth** = `number` \| `"fitColumns"`

Defined in: view/grid-pane-width.ts:32

A number is px; `'fitColumns'` (#157) sits the pane on its columns' own edge and keeps it there
 across every later rebind. Re-exported by `gantt-shell.ts` so `GanttShellOptions.gridWidth` names
 one type, not two copies of it.
