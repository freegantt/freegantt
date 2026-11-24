---
status: accepted — ruled 2026-11-23 by the owner.
decided: `ctx.view.presentRowDetail(rowId, content)` mounts content under one Row, across both panes. The library measures it, reserves its height and places it. A Row detail is not a Row and not an Entry.
open: none.
---

# A Row detail is content the library places under a Row

## Context

A consumer app needs a panel that opens under one Row and pushes the rows below it down. The earlier recipe used a bar-less spacer Entry and a `rowHeight` answer that repeated the panel height. A spacer Entry reaches undo, selection, keys, export and ARIA. The consumer also had to keep two heights equal.

## Decision

```ts
ctx.view.presentRowDetail(rowId: EntryId | string, content: HTMLElement): Disposer
```

- A plugin presents the content. A Row holds one detail. A second call for the same Row replaces the first.
- The library measures the content with one `ResizeObserver` in `view/`. The observer exists only while a detail is open.
- The height index steps by the Row height plus the detail height. The band of the Row does not change.
- A detail stays mounted when its Row leaves the window. A detail of a collapsed, filtered or unknown Row stays mounted, hidden and spaceless.
- A detail above the visible rows that changes height pans the content by the change. The rows in view stay where they are.
- A close returns focus to the Row when focus was inside the detail.
- A drop over a detail means `after` that Row.
- `onRowLayout` also runs when only a detail height changed. Page Down and Page Up count rows by the pixels in the window.

## Options rejected

- **A `heightPx` option on the Row.** The consumer must know the content height.
- **Consumer measurement.** Every consumer would write the same observer.
- **Detaching a detail outside the window.** It loses scroll position and focus inside the content.
- **The spacer Entry recipe, and three earlier variants.** Each keeps a fake Entry in the data.

## Consequences

- The spacer Entry recipe retires.
- `PluginContextParts.view` gains one member, `presentRowDetail`.
- The detail covers the vertical scrollbar of the timeline over its height, as the full-width row layer does. A follow-up issue tracks an inset.
