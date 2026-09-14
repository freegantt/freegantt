# Type Alias: BuiltInCommandId

> **BuiltInCommandId** = `"freegantt.collapseAll"` \| `"freegantt.expandAll"` \| `"freegantt.collapseRow"` \| `"freegantt.expandRow"` \| `"freegantt.zoomIn"` \| `"freegantt.zoomOut"` \| `"freegantt.panToToday"` \| `"freegantt.panToStart"` \| `"freegantt.panToEnd"` \| `"freegantt.panRight"` \| `"freegantt.panLeft"` \| `"freegantt.panDown"` \| `"freegantt.panUp"` \| `"freegantt.pageDown"` \| `"freegantt.pageUp"` \| `"freegantt.selectAll"` \| `"freegantt.clearSelection"` \| `"freegantt.selectNextSegment"` \| `"freegantt.selectPreviousSegment"` \| `"freegantt.deleteSelection"` \| `"freegantt.discardCellEdit"` \| `"freegantt.undo"` \| `"freegantt.redo"` \| `"freegantt.resizeColumnWider"` \| `"freegantt.resizeColumnNarrower"` \| `"freegantt.moveColumnRight"` \| `"freegantt.moveColumnLeft"`

Defined in: api/command.ts:26

Every command id the library itself registers (#236). One place names them, so
 `gantt.commands.run('freegantt.discardCellEdit')` autocompletes.

 Autocomplete, and not a compile error. `run` takes the open `CommandId`, so a plugin's own id
 stays legal and `run('gant.edit')` still compiles. A wrong id throws `UnknownCommandError`.

 It is `BuiltInCommandId` and not `CommandId`, because a plugin's own id is a command id too
 (#7's lesson: one name for two concepts stalls a reader). `CommandId` below is the open one.

 `view/core-commands.ts` registers all of these. `api/command.test.ts` holds the two lists
 together: a `Record<BuiltInCommandId, true>` names every member, and the test asks the core
 catalog for the same set.
