# Interface: GridColumnsChange

Defined in: view/event-bus.ts:44

S5.7, D-S5-18: what a resize drag, a reorder drop, and a plain `gantt.gridColumns = […]`
 assignment all fire, through one commit sequence in `GanttShell`. Payload columns are **resolved**
 — Field defaults already merged (D-S4-12) — but shaped as `GridColumn` (not the layout-only
 `ResolvedColumn`): a consumer keeps `to` in memory and passes it straight back as `gridColumns`
 within the same session, so the payload must be the same public shape that property already takes.
 `grid-columns.ts`'s `toGridColumn` builds one from a `ResolvedColumn`, dropping `format` (a
 render-time closure with no public type of its own).

 Both lists hold the columns the **consumer** authored, and only those (D-S5-33, #181). A column a
 plugin registered renders, but it is that plugin's declaration, so it never appears in either
 list. `from` is therefore always a list the consumer recognises. Resizing or reordering a plugin
 column still fires this pair, with `from` and `to` equal: the grid repainted, and the consumer's
 own configuration did not change. A handler that saves `to` saves exactly what it authored.

## Properties

### from

> `readonly` **from**: readonly [`GridColumn`](../type-aliases/GridColumn.md)[]

Defined in: view/event-bus.ts:45

***

### to

> `readonly` **to**: readonly [`GridColumn`](../type-aliases/GridColumn.md)[]

Defined in: view/event-bus.ts:46
