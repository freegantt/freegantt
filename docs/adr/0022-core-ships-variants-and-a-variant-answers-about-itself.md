---
status: proposed — opened 2026-09-12, out of the same defect and grill as [ADR 0021](0021-the-consumers-stylesheet-wins.md). Not built.
decided: core exports its looks as `EntryVariant` factories — `bar()`, `summary()`, `diamond()` — each taking `Partial<EntryVariant>`; an Item may state a fixed painted width, so a glyph keeps its size at every zoom; `gantt.variantFor(entry)` publishes the resolved variant; core's `parent` variant is renamed `summary`. [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md)'s "core does not ship a diamond" is narrowed — see *What ADR 0013 keeps*.
open: nothing this record answers. The third shipped shape, and per-look stylesheet splitting ([#286](https://github.com/Pawel-IT/FreeGantt/issues/286)), are deliberately not here.
---

# Core ships variants, and a variant answers about itself

[ADR 0021](0021-the-consumers-stylesheet-wins.md) is its pair: that one lets a consumer's CSS win, this one gives them something worth writing CSS against. Neither is sufficient alone — the checkpoint defect needed both.

## Context

[ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) retired core's milestone diamond, and [ADR 0018](0018-a-variant-is-a-rule-not-an-id-list.md) gave consumers the variant as the way to declare a look of their own. `harness/planner.ts` is the first consumer to try it end to end. It could not.

Three things blocked it, and only the first is a cascade problem.

**A consumer's CSS could not win.** That is ADR 0021.

**A glyph has no way to keep its size.** `barSpan` computes a bar's painted box from the entry's span, floored at `minBarWidthPx` — one number for the whole Gantt, read once from `--fg-bar-min-width` (`src/view/frame-settings.ts:48`). So the checkpoint's box is 12px at the default zoom and 28px one step in. A consumer's only lever is the Gantt-wide token, which would fatten every bar on the page. ADR 0013 deleted the per-look floor that used to exist (`src/layout/frame.ts:42` records its own removal), and nothing replaced it.

**A consumer has to rebuild a look core already has.** `J61` tells an author who wants the summary rail on their own rule to write `variants: [{ name: 'summary', when: (entry) => entry.hasChildren, paint }]` — and then hand-build `fg-bar-summary`'s rail, its two trailing caps and its four state rules. Core holds all of it, privately, in `CORE_VARIANTS`.

A fourth thing showed up while reading: **a variant cannot answer questions about itself.** `src/api/index.ts:361` exports the *input* types — `EntryVariant`, `VariantRule`, `VariantPredicate`, `FieldMatch`. `ResolvedVariant` is internal and `resolveFor` sits behind `view/gantt-shell.ts:1146`. A consumer asking "what does this row draw?" reads a `data-variant` string off the DOM and compares it. That is the re-derivation [ADR 0017](0017-the-entry-answers-questions-about-itself.md) exists to stop, one object over.

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

Each takes `Partial<EntryVariant>` and returns a complete one. Every key overrides — `when`, `name`, `can`, and `paint` if you want the geometry with your own ink. It is the same object an author already writes in `variants: [{ … }]`, so there is no second vocabulary to learn.

**The options argument is an object, not a positional rule.** `diamond(rule)` reads shorter, but a `FieldMatch` is `{ [key: string]: unknown }`, so `diamond({ when: … })` could not be told from a match on a field *named* `when`. It also leaves nowhere to put `name` or `can`.

**`when` already takes a callback**, and has since ADR 0018 shipped both arms of `VariantRule`. Nothing here changes that. Plugin-owned data reads through the row's one door, with the key namespaced — `diamond({ when: (entry) => entry.read('scheduling:checkpoint') === true })`.

#### What ships, and what does not

`bar()`, `summary()`, `diamond()`. Those three, because core already holds two of them and the third has a broken consumer behind it. A chevron, a flag, a hatched buffer and a hollow bar are all plausible and none has evidence. **One shape ships because one shape had evidence**, and the next addition brings its own.

`bar()` is not empty, which is the reason it is worth exporting. It carries `produceLeafItems` — one Item per Segment, or one over the whole span when there are none. An author who hand-writes `{ name: 'x', when: myRule }` silently gets `wholeEntryItem` instead, one bar over the whole span, and their Segments disappear. `bar()` is what prevents that.

#### `diamond()` claims rows without learning a word

`diamond()`'s default `when` is `(entry) => entry.duration()?.value === 0` — the predicate `variants.ts:36` already publishes as its worked example.

This is the same principle core's other claim already uses. `summary` claims `entry.hasChildren`. Both are **structure**, not a stored word. Core still never learns that your row is a checkpoint, a handover or a changeover — ADR 0018's whole argument — and an author who has a zero-duration row that is *not* a glyph passes their own `when`.

### 2. An Item may state a fixed painted width

`Item` gains one optional field:

```ts
/** The painted width in px, centred on this Item's own start. The time scale does not decide it,
 *  so the box holds its size at every zoom — which is what a glyph needs and what a span must not
 *  have. Absent for every ordinary bar. */
fixedWidthPx?: number;
```

`barSpan` honours it ahead of the span-and-floor path. `render/` stamps `data-span="fixed"` for such a bar, beside the existing `data-span="minimum"`, so a stylesheet can tell a glyph from a floored span.

This sits on the **shape** seam, not the look seam. `variants.ts` already divides the questions: `items` is what shape it draws, `paint` is how it looks, `can` is what you can do to it. A size is shape. It also keeps `layout/frame.ts` reading only `VariantItems`, the narrow type `J35` split the files to preserve.

A consumer building a glyph core does not ship gets the producer that stamps it:

```ts
variants: [{ name: 'flag', when: myRule, items: fixedWidthItem(16), paint: myFlag }]
```

**Rejected: a per-variant `--fg-bar-min-width`.** `pixel-property.ts` reads a token once off the container, not per element. Reading it per bar would put a computed-style read on the hover path, where the budget is zero allocation (I5).

**Rejected: colour as a separate axis beside geometry.** Colour is one CSS property inside "how it looks", and the library's posture is that colour lives in `--fg-*` tokens with no JS in between (`plans/02` §4). A `colour` key on a variant would be the one look property an author sets in JavaScript.

### 3. `gantt.variantFor(entry)` publishes the resolved variant

`ResolvedVariant` becomes public, and one door answers with it:

```ts
const variant = gantt.variantFor(entry);   // { name, items, paint, can }
```

**Not `entry.variant`.** This is the trap in reading ADR 0017 as "put every question on the row". An Entry belongs to a Dataset; a variant is resolved per Gantt. I2 makes that a hard rule — two Gantts on one Dataset may paint the same row differently — so `entry.variant` would have to pick one and would be wrong on the other page.

The consistent reading of ADR 0017 is the sentence `ResolvedVariant`'s own doc already makes about `F3`: **one door answers the whole question, and nothing re-derives it from a second lookup.** That door belongs on the object that resolved it.

### 4. Core's `parent` variant is renamed `summary`

The variant is named `parent` and paints a class named `fg-bar-summary`. One look, two words, and the class is the better one: `parent` is the structural fact that *claims* the look, not the look. After the rename `data-variant="summary"` and `.fg-bar-summary` tell one story, and `summary({ when })` reads correctly at a call site where a consumer has supplied their own rule.

Core's floor keeps the name `leaf` and the factory is `bar()`. This knowingly leaves `bar` doing two jobs — `.fg-bar` is the element class every look wears, diamonds included, and `bar()` is the plain look. The alternative was renaming `.fg-bar` to `.fg-item`, measured at 594 occurrences of which roughly 90 are **published tokens** (`--fg-bar-fill`, `--fg-bar-radius`, `--fg-bar-min-width`, `--fg-bar-label-*`, all in `docs/05-consumer-api.md`). That costs more than the collision does. The two words also sit on different rungs of the ladder — `.fg-bar` is level-2 CSS, `bar()` is a level-3 export — and never compete inside one sentence, which is what made "chart" unreadable in #7.

## What ADR 0013 keeps

ADR 0013 decided that **an Entry carries no stored classification**, and that decision is untouched. Core reads no stored word to choose a look. `diamond()` claims on structure, and nothing wears it until an author writes it.

What narrows is the sentence that decision produced — *"core does not ship a diamond"*. It was written when the only diamond on offer was one core painted by reading `kind === 'milestone'`. A look that no row wears until a rule claims it is a different object, and the sentence was too wide for it. The replacement:

> **Core ships `diamond()` among its shipped variants, and no row wears it until a rule claims it. Core reads no stored word to decide a look.**

ADR 0013's body stays as it was written (`docs/adr/README.md:5`). Its `status:` line carries the amendment, and a banner under its title points here.

## Rejected

**A priority number per plugin.** Ordering already has two mechanisms: `requires` resolves setup order, and rank resolves paint (`CORE_RANK` < `PLUGIN_RANK` < `CONSUMER_RANK`). A number would be a third competing with both, and numeric priority has a known end state — everybody picks a bigger one. The unordered case already has a stated answer: `'variant-claimed-twice'` names both rules when two of the same rank claim one row, because the library does not arbitrate between plugins the consumer chose to install. A plugin that must paint over another's says `requires`.

**A `variantTypes` registry.** Drafted, then dropped. The usual argument for a registered name over a function is that a name serializes into a document — and [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the save format, so there is no document. What remained was a name registry, a collision rule, a resolution-order question, and a lookup on the hover path, all buying what an exported factory does for free.

**A `glyphs()` first-party plugin.** A plugin is the wrong container for one exported function. It was proposed as an acceptance test — "if it can be written over the published surface, the gaps are closed" — and `harness/planner.ts` is a better one, because it is real consumer code that CLAUDE.md already requires to be reviewed every commit.

**A `surface: 'none'` knob on the variant.** It answers background and nothing else. The checkpoint's hover ring is not a surface, and neither is the focus outline or the selection outline. One knob becomes four, and it is level 3 solving what ADR 0021 solves at level 2.

**Splitting `.fg-bar` into a geometry class and a surface class.** It publishes a second class per part forever, and it still loses the tie on anything a consumer wants to *restyle* rather than drop.

**A second package entry point for the looks.** It buys no tree-shaking: the package is ESM with declared side effects, and `size-limit` already proves an unimported named export is dropped (it measures `{ Dataset, Gantt }` at 78.3 kB out of a larger index). Subpaths help when the bundler cannot shake, which is not our case. It would cost a second `exports` entry, a second budget and a second API report for zero bytes.

## Consequences

- `bar()` and `summary()` add no bytes — core seeds both already. `diamond()` is the only new payload, against roughly 700 bytes of headroom on a 79 kB budget. The budget rises by 1 kB in the same commit.
- `CORE_VARIANTS` keeps seeding from the same factories, so `J37`'s load-bearing order holds: the floor registers first, or no row is ever a summary.
- `harness/planner.ts` loses `checkpointDiamond` and roughly 30 lines of `planner.html` CSS, and gains `diamond({ when: { checkpoint: true } })`. `fixtures/planner-dataset.ts` stops faking a one-day span and stores `end === start`, which is the honest data and what `barSpan` already centres correctly. **Anything that has to stay behind is an unclosed gap, and gets reported rather than kept.**
- An e2e that covers a variant's paint asserts a computed property or a measured box. `toBeVisible()` is what let this ship (`e2e/planner.spec.ts:67`).
- `plans/02` §4.1 gains the shipped set; `docs/05-consumer-api.md` gains `variantFor` and `data-span="fixed"`.

## To reverse

Un-export the three factories and put `CORE_VARIANTS` back to private literals; drop `Item.fixedWidthPx` and `data-span="fixed"`; un-publish `ResolvedVariant` and `variantFor`; rename `summary` back to `parent`. A consumer painting a glyph then re-authors `barSpan`'s job in CSS and accepts a box that grows with the zoom.
