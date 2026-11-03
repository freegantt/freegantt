# Brief A: a `rowSpan` decoration

Read `common-rules.md` (same folder) first. Slice name for your progress file: `a-row-span`.

## Target

- `src/layout/decoration.ts`, `src/layout/decorations.ts`, `src/layout/frame.ts` (the `FrameDecoration` union)
- `src/render/dom/decorations.ts` and its render path
- the public decoration façade `src/api/decoration-facade.ts`, `src/api/index.ts` exports if needed
- a new harness page or fixture for "planned vs actual"
- tests beside each file, plus an e2e if the harness page needs one (`browser-tests` skill)

## Change

Add a third `DecorationInput` kind. See handoff item A.

```ts
{ kind: 'rowSpan'; rowId: RowId; start: Instant; end: Instant; class?: string; text?: string }
```

1. `layout/` resolves `start`/`end` to `x`/`width` through the bound `TimeScale`, like `rangeBand`. Never compute pixels in a provider.
2. `render/dom` paints it inside the row it names, on `underBars` and on `overBars`. The node carries `aria-hidden`, has no hit target, takes no focus, and has a `.fg-row-span` class plus the consumer's `class`.
3. A row outside the window paints nothing.
4. **`text` goes in its own last commit.** Plain string, painted at the span's end, inside the same `aria-hidden` node. The owner has not ruled on `text` yet. A separate commit lets the coordinator drop it.
5. Harness: a "planned vs actual" fixture. Its provider reads baseline dates from **consumer Fields** that the harness declares, and returns one `rowSpan` per row. Use the library's public API only. If you need something `src/` does not give, stop and `ask`.

## Constraints

- Generic paint only. No baseline, variance or ghost concept enters `src/`. The words "baseline" and "planned" live in `harness/` only.
- Name the kind and every new type with the `naming` skill. Read the call site aloud.
- Check `CONTEXT.md` for the glossary words "row", "span", "decoration". If `rowSpan` collides with a glossary meaning, `ask` before you pick another name.

## Ownership

You own the files in "Target". Do not edit `plans/03-slices.md`, `plans/00-overview.md`, `scripts/slice-gate.mjs`, or `plans/s6-scale-and-sync/`.

## Observable acceptance

- Unit test: a `rowSpan` resolves to the right pixels at two zoom levels.
- Render test: the node is `aria-hidden`, has no hit target, and sits on the layer the provider chose.
- The harness shows the "planned vs actual" fixture.
- `CHANGELOG.md` has the line.
