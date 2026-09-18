---
status: accepted — opened 2026-09-12, out of the same defect and grill as [ADR 0021](0021-the-consumers-stylesheet-wins.md). Amended 2026-09-12: a variant owns its CSS (Q6, [#286](https://github.com/Pawel-IT/FreeGantt/issues/286)), and an Item states its own painted box and anchor (Q7). Accepted 2026-09-12. Narrowed by [ADR 0023](0023-a-variant-with-no-items-follows-the-data.md), 2026-09-12: §1's registry default and `bar()`'s role in it were wrong — see §1's own note.
decided: core exports its looks as `EntryVariant` factories — `bar()`, `summary()`, `diamond()` — each taking `Partial<EntryVariant>`; an Item may state a painted box the time scale does not size (`box: { widthPx, anchor }`); `FrameBar.span` is `'exact' | 'minimum' | 'fixed'`; `ItemProducer` receives the registration's name; `gantt.variantFor(entry)` is the one door and answers `ResolvedVariant`; `variantOf` retires; core's `parent` variant is renamed `summary`; a variant owns the CSS behind its class (`EntryVariant.css`), which closes [#286](https://github.com/Pawel-IT/FreeGantt/issues/286). [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md)'s "core does not ship a diamond" is narrowed — see *What ADR 0013 keeps*.
open: nothing this record answers. A fourth shipped look (a chevron, a flag, a hatched buffer, a hollow bar) is deliberately not here.
---

> **Vocabulary note, added 2026-09-17 ([#421](https://github.com/Pawel-IT/FreeGantt/issues/421)).** This record predates the `Item`→`Bar` rename ([ADR 0026](0026-the-segment-retires.md)). Read every `Item`/`ItemProducer` below as `Bar`/`BarProducer`. **Do not rewrite the body.**

# Core ships variants, and a variant answers about itself

[ADR 0021](0021-the-consumers-stylesheet-wins.md) is its pair: that one lets a consumer's CSS win, this one gives them something worth writing CSS against. Neither is sufficient alone — the checkpoint defect needed both.

## Context

[ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) retired core's milestone diamond, and [ADR 0018](0018-a-variant-is-a-rule-not-an-id-list.md) gave consumers the variant as the way to declare a look of their own. `harness/planner.ts` is the first consumer to try it end to end. It could not.

Five things blocked it, and only the first is a cascade problem.

**A consumer's CSS could not win.** That is ADR 0021.

**A glyph has no way to keep its size.** `barSpan` computes a bar's painted box from the entry's span, floored at `minBarWidthPx` — one number for the whole Gantt, read once from `--fg-bar-min-width` (`src/view/frame-settings.ts:48`). So the checkpoint's box is 12px at the default zoom and 28px one step in. A consumer's only lever is the Gantt-wide token, which would fatten every bar on the page. ADR 0013 deleted the per-look floor that used to exist (`src/layout/frame.ts:42` records its own removal), and nothing replaced it.

**A consumer has to rebuild a look core already has.** `J61` tells an author who wants the summary rail on their own rule to write `variants: [{ name: 'summary', when: (entry) => entry.hasChildren, paint }]` — and then hand-build `fg-bar-summary`'s rail, its two trailing caps and its four state rules. Core holds all of it, privately, in `CORE_VARIANTS`.

**A variant cannot answer questions about itself.** `src/api/index.ts:361` exports the *input* types — `EntryVariant`, `VariantRule`, `VariantPredicate`, `FieldMatch`. `ResolvedVariant` is internal and `resolveFor` sits behind `view/gantt-shell.ts:1146`. A consumer asking "what does this row draw?" reads a `data-variant` string off the DOM and compares it. That is the re-derivation [ADR 0017](0017-the-entry-answers-questions-about-itself.md) exists to stop, one object over. `GanttShell` still publishes `variantOf(entry): string` beside that hole, so a second door answers with a name — the shape [F3](../../plans/row-redesign/BUILD-LOG.md) already closed on the registry.

**A variant does not own the CSS behind the class its `paint` names.** Core's `summary` answers `{ class: { 'fg-bar-summary': true } }`, and what that class means sits in `BASE_STYLESHEET`. A shipped look is half-owned. A consumer's own `flag()` cannot be written without a core edit, and a page that never installs `diamond()` still pays for its rules once those rules live in the base sheet ([#286](https://github.com/Pawel-IT/FreeGantt/issues/286)).

## Decision

### 1. Core's looks are exported factories

A variant is already a plain object. So core exports functions that build one, and seeds its own registrations from the same functions. There is no registry, no name lookup and no new resolution rule.

```ts
import { bar, summary, diamond } from 'freegantt';

variants: [
  diamond(),                                   // every zero-duration row
  diamond({ when: { checkpoint: true } }),     // your rule instead
  summary({ when: (entry) => entry.depth === 0 }),
]
```

Each takes `Partial<EntryVariant>` and returns a complete one. Every key overrides — `when`, `name`, `items`, `can`, `paint`, `css`. It is the same object an author already writes in `variants: [{ … }]`, so there is no second vocabulary to learn.

**The options argument is an object, not a positional rule.** `diamond(rule)` reads shorter, but a `FieldMatch` is `{ [key: string]: unknown }`, so `diamond({ when: … })` could not be told from a match on a field *named* `when`. It also leaves nowhere to put `name`, `can` or `css`.

**`when` already takes a callback**, and has since ADR 0018 shipped both arms of `VariantRule`. Nothing here changes that. Plugin-owned data reads through the row's one door, with the key namespaced — `diamond({ when: (entry) => entry.read('scheduling:checkpoint') === true })`.

**`ItemProducer` is `(entry: Entry, variant: string) => readonly Item[]`.** ADR 0018 decided the name appears once. Today every producer invents it: `produceLeafItems` hardcodes `LEAF_VARIANT_NAME`, so `bar({ name: 'phase' })` would stamp `data-variant="leaf"`. The registry passes the registration's own name. A one-argument producer an author already wrote keeps compiling, because TypeScript accepts a function that takes fewer parameters.

#### What ships, and what does not

`bar()`, `summary()`, `diamond()`. Those three, because core already holds two of them and the third has a broken consumer behind it. A chevron, a flag, a hatched buffer and a hollow bar are all plausible and none has evidence. **One shape ships because one shape had evidence**, and the next addition brings its own.

`bar()` is not empty, which is the reason it is worth exporting. It carries `produceLeafItems` — one Item per Segment, or one over the whole span when there are none.

**Narrowed by [ADR 0023](0023-a-variant-with-no-items-follows-the-data.md).** The sentence this replaces said an author who hand-writes `{ name: 'x', when: myRule }` silently got the whole-entry default instead, Segments included, and that `bar()` was what prevented it. That was true of the registry built here, and it was the wrong registry to build: [#292](https://github.com/Pawel-IT/FreeGantt/issues/292) found the same silent loss on *every* variant that names no `items`, `bar()` included by name alone, not by mechanism. ADR 0023 makes `produceLeafItems` (renamed `followSegments`) the registry's own default, so every variant that omits `items` gets it — not only `bar()`.

`diamond()` paints `.fg-bar-diamond`. `data-variant` and the class tell one story — the same agreement that makes `parent` become `summary` below. ADR 0013 retired a class of this name; it returns because nothing wears it until a rule claims it, and core's own sheet no longer holds it.

#### `diamond()` claims rows without learning a word

`diamond()`'s default `when` is `(entry) => entry.duration()?.value === 0` — the predicate `variants.ts:36` already publishes as its worked example.

This is the same principle core's other claim already uses. `summary` claims `entry.hasChildren`. Both are **structure**, not a stored word. Core still never learns that your row is a checkpoint, a handover or a changeover — ADR 0018's whole argument — and an author who has a zero-duration row that is *not* a glyph passes their own `when`.

### 2. An Item states a painted box the time scale does not size

A glyph must hold its size at every zoom. The time scale must not size that box. The Item states the box, and it states where the box sits:

```ts
/** A painted box the time scale does not size. */
box?: { widthPx: number; anchor: 'start' | 'center' | 'end' };
```

`diamond()` writes `anchor: 'center'`. A flag writes `'start'`. Core picks for nobody. `'center'` is the spelling already on the surface — `panToDate(date, align: 'start' | 'center')`.

**Not a width alone, and not centred on the Item's start.** `barSpan` already centres a floored bar on its **midpoint** (`src/layout/frame.ts:72`). A start-centred box agrees with that rule only when `start === end`. A fixed-width box on a real span would land in two places depending on which sentence a reader followed. Centring is right for a marker — a diamond points at an instant, and a left-aligned 13px glyph on a 20px day puts its visual centre a third of a day late — and wrong for a flag, where the pole sits on the date and the cloth hangs to the right. An anchor core hardcodes is a rendering decision taken outside the variant.

`barSpan` honours `box` ahead of the span-and-floor path. **`FrameBar.span: 'exact' | 'minimum' | 'fixed'` replaces `minimumSpan: boolean`.** `data-span` is one attribute slot with one value at a time, so the type mirrors the DOM it feeds. Two booleans make `{ minimumSpan: true, fixedSpan: true }` writable and meaningless. `render/` stamps `data-span="fixed"` or `data-span="minimum"`.

The producer is `fixedWidthItem(px, anchor?: 'start' | 'center' | 'end')`. Omitted, the anchor is `'center'`. `diamond()` writes `fixedWidthItem(13)` — **13px is one constant beside `diamond()` in `src/layout/items/variants.ts`**, never in `src/layout/frame.ts`. That file holds the two numbers `barSpan` and `frame-settings.ts` share. The sheet derives the glyph from the box (`width: 100%; aspect-ratio: 1` on the `::before`) and restates no number, so `diamond({ items: fixedWidthItem(20) })` moves the ink and the hit box together.

This sits on the **shape** seam, not the look seam. `items` is what shape it draws, `paint` is how it looks, `can` is what you can do to it, `css` is what rules the look needs. A size is shape. It also keeps `layout/frame.ts` reading only `VariantItems`, the narrow type `J35` split the files to preserve.

A consumer building a glyph core does not ship gets the producer that stamps it:

```ts
variants: [{ name: 'flag', when: myRule, items: fixedWidthItem(16, 'start'), paint: myFlag, css: `…` }]
```

**Rejected: a per-variant `--fg-bar-min-width`.** `pixel-property.ts` reads a token once off the container, not per element. Reading it per bar would put a computed-style read on the hover path, where the budget is zero allocation (I5).

**Rejected: `--fg-diamond-size`.** A `--fg-*` token is a Gantt-wide knob. Two variants that each want a size fight over one of them, and a variant has to consult something outside itself to know how big it draws. `box` is what takes the number back.

**Rejected: colour as a separate axis beside geometry.** Colour is one CSS property inside "how it looks", and the library's posture is that colour lives in `--fg-*` tokens with no JS in between (`plans/02` §4). A `colour` key on a variant would be the one look property an author sets in JavaScript.

### 3. `gantt.variantFor(entry)` publishes the resolved variant

`ResolvedVariant` becomes public, and **one door** answers with it:

```ts
const variant = gantt.variantFor(entry);   // { name, items, paint, can, css }
```

That door sits on both surfaces: `gantt.variantFor` and `ctx.view.variantFor`. **`variantOf(entry): string` retires.** A door that answers with a name is the bug F3 already closed on the registry — `itemsFor` / `paintFor` / `interactionsFor` then look that string up again. The two callers that want the name alone read `.name`. `CommandContext.variant` stays a string, so no command's `when` changes.

**Not `entry.variant`.** This is the trap in reading ADR 0017 as "put every question on the row". An Entry belongs to a Dataset; a variant is resolved per Gantt. I2 makes that a hard rule — two Gantts on one Dataset may paint the same row differently — so `entry.variant` would have to pick one and would be wrong on the other page.

The consistent reading of ADR 0017 is the sentence `ResolvedVariant`'s own doc already makes about `F3`: **one door answers the whole question, and nothing re-derives it from a second lookup.** That door belongs on the object that resolved it.

### 4. Core's `parent` variant is renamed `summary`

The variant is named `parent` and paints a class named `fg-bar-summary`. One look, two words, and the class is the better one: `parent` is the structural fact that *claims* the look, not the look. After the rename `data-variant="summary"` and `.fg-bar-summary` tell one story, and `summary({ when })` reads correctly at a call site where a consumer has supplied their own rule.

Core's floor keeps the name `leaf` and the factory is `bar()`. This knowingly leaves `bar` doing two jobs — `.fg-bar` is the element class every look wears, diamonds included, and `bar()` is the plain look. The alternative was renaming `.fg-bar` to `.fg-item`, measured at 594 occurrences of which roughly 90 are **published tokens** (`--fg-bar-fill`, `--fg-bar-radius`, `--fg-bar-min-width`, `--fg-bar-label-*`, all in `docs/05-consumer-api.md`). That costs more than the collision does. The two words also sit on different rungs of the ladder — `.fg-bar` is level-2 CSS, `bar()` is a level-3 export — and never compete inside one sentence, which is what made "chart" unreadable in #7.

### 5. A variant owns the CSS behind its own class

A variant already owned `items`, `paint` and `can`. It did not own the rules behind the class its `paint` named. The fifth answer is `css`:

```ts
{ name: 'flag', when: { flag: true }, items: fixedWidthItem(16, 'start'), paint: myFlag, css: `…` }
```

`EntryVariant.css?: string` — the rules this look needs, as CSS text. `layout/` stays DOM-free: a CSS string is data, and `view/` does the writing. The text goes in verbatim.

**Not `rules`.** ADR 0018's title is *a variant is a rule*, and `when` is that rule. One word, two concepts.
**Not `styles`.** `ElementDescription.style` is the inline bag a `paint` answers, and `src/view/styles.ts` is the base sheet.
**Not `stylesheet`.** A variant carries a fragment, and the library holds one sheet.

#### One node per Gantt

- One `<style data-freegantt-variant-styles>` per Gantt, in `container.ownerDocument.head`.
- Its content is every installed variant's `css`, wrapped once in `@layer freegantt { … }`.
- It is written **after** the base sheet, always. `ensureBaseStyles` runs first.
- It is emitted in registration-ladder order: core, then every plugin, then the consumer. So at equal specificity the higher rung wins, which is the ladder the claim walk already uses.
- It is rebuilt when registrations change — construction, `gantt.variants = […]`, a plugin install or dispose — and removed on `destroy()`.

**Per Gantt, not refcounted per document.** Two Gantts must be fully independent (I2), and one shared refcounted node is shared mutable state between instances. The cost is duplicated text when two Gantts install one variant. That is bytes and not behaviour: the rules are identical and land in one layer. CSS is document-global either way, which is already true of the base sheet.

#### Why this keeps every promise

- **A consumer still wins.** A variant's `css` sits inside `@layer freegantt`, so an unlayered consumer rule beats it at any specificity. ADR 0021 holds.
- **A variant beats the base sheet.** Both sit in one layer and the variant's node is later, so `diamond()`'s own rules cancel `.fg-bar`'s background and its state ring at equal specificity. That is the mechanism `.demo-checkpoint` needed and could not reach.
- **[#286](https://github.com/Pawel-IT/FreeGantt/issues/286) closes.** A Gantt with no `diamond()` installed has no diamond CSS in the document. Its rejected fourth option stays rejected: a `paint` that answers inline `style` and no class takes a consumer's ability to restyle away. A `css` fragment does the opposite — every declaration in it is overridable from an ordinary consumer rule.

#### What moves, and what does not

- `.fg-bar-summary`'s rules move out of `BASE_STYLESHEET` into `summary()`.
- `bar()` carries no `css`. Its look **is** `.fg-bar`, the element class every look wears, diamonds included. That is structure, not a look. It stays in the base sheet.
- Everything else in the base sheet stays: rows, the grid, the header, the popup, the tooltip, the menu, the editor, and `.fg-bar` itself.
- `ensureBaseStyles` is no longer the only place the library writes a stylesheet.

## What ADR 0013 keeps

ADR 0013 decided that **an Entry carries no stored classification**, and that decision is untouched. Core reads no stored word to choose a look. `diamond()` claims on structure, and nothing wears it until an author writes it.

What narrows is the sentence that decision produced — *"core does not ship a diamond"*. It was written when the only diamond on offer was one core painted by reading `kind === 'milestone'`. A look that no row wears until a rule claims it is a different object, and the sentence was too wide for it. The replacement:

> **Core ships `diamond()` among its shipped variants, and no row wears it until a rule claims it. Core reads no stored word to decide a look.**

ADR 0013's body stays as it was written (`docs/adr/README.md:5`). Its `status:` line carries the amendment, and a banner under its title points here.

## Rejected

**A priority number per plugin.** Ordering already has two mechanisms: `requires` resolves setup order, and rank resolves paint (`CORE_RANK` < `PLUGIN_RANK` < `CONSUMER_RANK`). A number would be a third competing with both, and numeric priority has a known end state — everybody picks a bigger number. The unordered case already has a stated answer: `'variant-matched-twice'` names both rules when two of the same rank claim one row, because the library does not arbitrate between plugins the consumer chose to install. A plugin that must paint over another's says `requires`.

**A `variantTypes` registry.** Drafted, then dropped. The usual argument for a registered name over a function is that a name serializes into a document — and [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the save format, so there is no document. What remained was a name registry, a collision rule, a resolution-order question, and a lookup on the hover path, all buying what an exported factory does for free.

**A `glyphs()` first-party plugin.** A plugin is the wrong container for one exported function. It was proposed as an acceptance test — "if it can be written over the published surface, the gaps are closed" — and `harness/planner.ts` is a better one, because it is real consumer code that CLAUDE.md already requires to be reviewed every commit.

**A `surface: 'none'` knob on the variant.** It answers background and nothing else. The checkpoint's hover ring is not a surface, and neither is the focus outline or the selection outline. One knob becomes four, and it is level 3 solving what ADR 0021 solves at level 2.

**Splitting `.fg-bar` into a geometry class and a surface class.** It publishes a second class per part forever, and it still loses the tie on anything a consumer wants to *restyle* rather than drop.

**A second package entry point for the looks.** It buys no tree-shaking: the package is ESM with declared side effects, and `size-limit` already proves an unimported named export is dropped (it measures `{ Dataset, Gantt }` at 78.3 kB out of a larger index). Subpaths help when the bundler cannot shake, which is not our case. It would cost a second `exports` entry, a second budget and a second API report for zero bytes.

## Consequences

- `bar()` and `summary()` add no JavaScript bytes — core seeds both already. `diamond()` is the only new JS payload. `summary()`'s CSS leaves the always-shipped base sheet and rides the seeded factory; `diamond()`'s CSS never enters the base sheet. Measure `pnpm size-limit` after both moves, then set `.size-limit.json` from the number.
- `CORE_VARIANTS` keeps seeding from the same factories. The order inside that list decides nothing — `J60` sorts every claiming rule ahead of every last resort, which superseded `J37` — so `summary()` answers a row with children whichever way round the two are seeded. `diamond()` is **not** in `CORE_VARIANTS`.
- `harness/planner.ts` loses `checkpointDiamond` and roughly 30 lines of `planner.html` CSS, and gains `diamond({ when: { checkpoint: true } })`. `fixtures/planner-dataset.ts` stops faking a one-day span and stores `end === start`, which is the honest data and what `barSpan` already centres correctly. **Anything that has to stay behind is an unclosed gap, and gets reported rather than kept.**
- An e2e that covers a variant's paint asserts a computed property or a measured box. `toBeVisible()` is what let this ship (`e2e/planner.spec.ts:67`).
- `plans/02` §4.1 gains the shipped set; `docs/05-consumer-api.md` gains `variantFor`, `data-span="fixed"`, and `EntryVariant.css`.
- The API report moves for `ItemProducer`, `Item.box`, `FrameBar.span`, the three factories, `fixedWidthItem`, `ResolvedVariant` and `variantFor`.
- [#286](https://github.com/Pawel-IT/FreeGantt/issues/286) closes with this record.

## To reverse

Un-export the three factories and put `CORE_VARIANTS` back to private literals; drop `Item.box` and `data-span="fixed"`; restore `FrameBar.minimumSpan` and the one-argument `ItemProducer`; restore `variantOf`; un-publish `ResolvedVariant` and `variantFor`; rename `summary` back to `parent`; drop `EntryVariant.css` and the per-Gantt variant style node; put `.fg-bar-summary` back in `BASE_STYLESHEET`. A consumer painting a glyph then re-authors `barSpan`'s job in CSS, accepts a box that grows with the zoom, and edits core to add a look.
