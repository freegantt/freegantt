---
status: accepted — opened 2026-09-12, out of a defect on `harness/planner.ts`'s checkpoint glyph and the grill that followed. Accepted 2026-09-12.
decided: the base stylesheet ships inside one cascade layer, `@layer freegantt`, so an unlayered consumer rule wins at any specificity. Level 2 of the Customization ladder (`plans/02` §4) becomes true, which it was not.
open: nothing this record answers. Per-look stylesheet splitting is [#286](https://github.com/Pawel-IT/FreeGantt/issues/286), and [ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md) answers it.
---

# The consumer's stylesheet wins

## Context

`plans/02` §4 sells five levels of customization, and level 2 is "state classes / parts". Its worked example is this:

```css
.fg-bar[data-flag~="conflict"] { outline: 2px solid var(--warn); }
```

That rule does not work. It never has.

`ensureBaseStyles` writes the library's sheet with `doc.head.append(style)` (`src/view/styles.ts:463`). A consumer's own `<style>` or `<link>` sits earlier in `head`, and the library's rule matches at the same specificity — `.fg-bar[data-flag~="conflict"]` is 0-2-0 on both sides. Equal specificity resolves by document order, and the library is always later. So the consumer loses every tie, on every part the ladder publishes: `.fg-bar`, `.fg-row`, `.fg-cell-editor`, `.fg-tooltip`, `.fg-menu-item`, `.fg-bar-handle`. A consumer only wins by accident, when they happen to write a longer selector than the library did.

### The defect that found it

`harness/planner.ts` paints a checkpoint as a diamond. Its renderer returns `class: { 'demo-checkpoint': true }`, and `harness/planner.html` says:

```css
.demo-checkpoint { background: transparent; }
.demo-checkpoint::before { /* the 13px rotated square */ }
```

Measured in a browser at HEAD, on 2026-09-12: the checkpoint element's computed `background-color` is the bar fill, not `transparent`. `.demo-checkpoint` (0-1-0) loses to `.fg-bar` (0-1-0). So every checkpoint paints the library's rounded rect **and** the page's diamond, in the same colour. At the default zoom the bar floors at `--fg-bar-min-width` (12px) and the 13px diamond's points stick out past it, which reads as a blob. Zoom in and the box grows to 28px and more, swallowing the diamond whole — the row reads as an ordinary bar.

The same page loses the same tie a second time, which is the evidence that this is not one property misbehaving:

```css
.demo-checkpoint[data-state~='hovered'] { outline: none; box-shadow: none; }
```

Hovering a checkpoint paints the library's inset ring **and** the diamond's own ring. Two rings, one hover. A per-property escape hatch would not have caught this one, because a hover ring is not a background.

`e2e/planner.spec.ts:67` covers this row and passed throughout. It asserts `toBeVisible()`, and a mispainted glyph is visible.

### Why this is a ladder defect and not a bar defect

Every rule above is a *part* the ladder tells consumers to style. Nothing about bars is special. A fix aimed at bars leaves the trap under every other part, and the next consumer pays it again — which is exactly what happened between the ladder being written and this defect being found.

## Decision

**`BASE_STYLESHEET` ships inside one cascade layer.**

```css
@layer freegantt {
  /* the whole sheet, unchanged */
}
```

An unlayered rule beats a layered one at any specificity. So a consumer writing `.demo-checkpoint { background: transparent }`, or `.fg-bar[data-flag~="conflict"] { outline: … }`, wins — without knowing the library's selectors, without counting specificity, and without `!important`.

**One layer, not several.** `src/view/styles.ts:175`, `:296` and `:357` each lean on equal-specificity-plus-document-order *inside* the sheet, and say so in their comments. Within a single layer the normal cascade still applies, so the sheet's own internal ordering is untouched. Splitting the sheet across several layers would break those three rules and buy nothing.

**The name is `freegantt`.** A consumer who uses layers themselves can order against it explicitly — `@layer freegantt, app;` — and get the same result with their own layering intact.

### Cost

`@layer` is Baseline since early 2022. The sheet already uses `color-mix(in oklch, …)`, which is roughly a year newer, so the library's support floor does not move.

## Consequences

- `plans/02` §4's level-2 promise becomes true. Its worked example works.
- `docs/05-consumer-api.md` gains one sentence: a consumer's own rules win over the library's, whatever the specificity, because the library's sheet is layered.
- The three internal comments at `styles.ts:175`, `:296` and `:357` stay correct and gain a note that the layer does not change them.
- A consumer who was already beating the library with a longer selector keeps working. Nothing that wins today starts losing.
- `src/view/styles.test.ts` gains an assertion that the emitted sheet is wrapped, so the wrapper cannot be dropped by an edit that only meant to add a rule.

## What this does not do

It does not give a glyph a fixed painted box. The checkpoint's second defect — a 12px box that grows to 28px on zoom, because the painted span is the entry's span floored at one Gantt-wide `--fg-bar-min-width` — is geometry, not cascade. [ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md) answers it.

It does not split the sheet so an unused look's CSS drops out. That is [#286](https://github.com/Pawel-IT/FreeGantt/issues/286), and [ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md) answers it: a variant carries its own `css`, and an uninstalled look writes nothing.

## To reverse

Unwrap the layer. Every consumer rule that relied on beating the library by layer alone then needs a longer selector or `!important`, and `plans/02` §4's example goes back to being wrong.
