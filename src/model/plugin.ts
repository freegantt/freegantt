// model/ — the two primitives every plugin contract needs, zero-dependency (CLAUDE.md: model/ is a
// zero-dependency leaf). `GanttPlugin`/`PluginContext` live in api/plugin.ts instead — they name
// api/ and view/ types `model/` may never import (issue #137 F1, plans/s5-extensibility-and-editing/
// s5.1-plugin-runtime.md D-S5-1). `DatasetPlugin` (S5.10) is DOM-free enough to live in `model/`
// itself and needs these same two primitives.

/** A plugin's own identity, unique within the `plugins` list that installs it (D-S5-3). */
export type PluginId = string;

/** What `setup()` returns: releases whatever that plugin's own setup acquired. Called at most once. */
export type Disposer = () => void;
