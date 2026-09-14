# Type Alias: TargetKind

> **TargetKind** = `"row"` \| `"cell"` \| `"bar"` \| `"header"` \| `"splitter"`

Defined in: model/command.ts:20

What kind of thing a chord, a right-click or a pointer landed on (issue #137 F6, review A3). One
 vocabulary, shared by two readers: `api/command.ts`'s `CommandTarget.kind`, which a command's
 `when` reads, and `view/gantt-dom.ts`'s `DomTarget.kind`, which `ctx.view.dom.targetUnder` returns
 for a DOM node. Both name the same five things, so both name them from here — a second union
 would be the same concept spelled twice. Zero dependencies, so it belongs in `model/`.

 `'cell'` is one Grid column's box on one Row; `'header'` is one Grid column's header cell.
