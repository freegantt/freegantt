# Interface: CommandTarget

Defined in: api/command.ts:85

What focus a chord or a right-click landed on (issue #137 F6) — S5.7's and S5.11's chord scoping
 ("on a focused header cell", "on a selected bar", "on the splitter") has nothing else in
 `CommandContext` to read a `when` against. Filled by the keymap resolver from view state; a menu
 or `run(id)` invocation with no meaningful target for this kind leaves it `undefined`.

 It carries the same `entryIds` word `DomTarget` uses, but not always the same set (#199, #212). A
 `DomTarget` states a DOM fact: what the node stands for. This states what the command acts on,
 resolved from the Selection by `resolveActedOn` below — the Selection when the thing you clicked
 shares it (either one holds the other), and the thing you clicked when it does not. So a
 right-click on one of three selected bars names three, a right-click on an unselected row names
 every Segment that row owns, and a right-click on a row that owns a lone selected bar plus others
 names only that one bar — the narrower thing the user already picked, left alone (#212).

 Both id sets are empty for a `'header'` or `'splitter'` target, and for a grouping header row.
 Neither is ever `undefined`, so a `when` counts them with no fallback.

## Extends

- [`ActedOn`](ActedOn.md)

## Properties

### entryIds

> **entryIds**: readonly [`EntryId`](../type-aliases/EntryId.md)[]

Defined in: api/command.ts:67

#### Inherited from

[`ActedOn`](ActedOn.md).[`entryIds`](ActedOn.md#entryids)

***

### field?

> `optional` **field?**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: api/command.ts:90

Which Grid column this landed on, for a `'header'` or `'cell'` target. `field` names a column
 everywhere a column is named (D-S5-37, #194) — the same word `DomTarget.field`,
 `GridColumn.field` and a renderer's `ctx.column.field` already use.

***

### kind

> **kind**: [`TargetKind`](../type-aliases/TargetKind.md)

Defined in: api/command.ts:86

***

### segmentIds

> **segmentIds**: readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: api/command.ts:66

#### Inherited from

[`ActedOn`](ActedOn.md).[`segmentIds`](ActedOn.md#segmentids)
