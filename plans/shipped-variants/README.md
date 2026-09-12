# shipped variants — plan

One defect on `harness/planner.ts`'s checkpoint glyph opened three issues. This folder is the work.

| Issue | ADR | The job |
|---|---|---|
| [#287](https://github.com/Pawel-IT/FreeGantt/issues/287) | — | The harness meets the sealed `exports` map, and a lint proves it. |
| [#288](https://github.com/Pawel-IT/FreeGantt/issues/288) | [0021](../../docs/adr/0021-the-consumers-stylesheet-wins.md) | The base sheet ships in `@layer freegantt`, so a consumer's CSS wins. |
| [#289](https://github.com/Pawel-IT/FreeGantt/issues/289) | [0022](../../docs/adr/0022-core-ships-variants-and-a-variant-answers-about-itself.md) | Core exports `bar()`, `summary()`, `diamond()`; an Item may state a fixed width; `gantt.variantFor` answers. |

**Read this file once. Then read one build file and work from it.** Do not read the other two.

---

## Landing order

```
#287  →  #288 (ADR 0021)  →  #289 (ADR 0022)
```

**#287 lands first**, and #289 is the reason. ADR 0022 makes `harness/planner.ts` the acceptance
test for the shipped factories. A harness that reaches past the `exports` map cannot prove anything,
because a workaround inside it looks the same as a working public surface. The lint has to hold
before the first line of #289 is written.

**#288 lands second.** ADR 0021 and ADR 0022 are a pair, and neither fixes the checkpoint alone. The
layer is the smaller change and it carries no decisions, so it goes in ahead.

---

## What the end state is

- **A harness import reads `from 'freegantt'`.** `.dependency-cruiser.cjs` blocks a relative path
  from `harness/`, `e2e/` or `fixtures/` into `src/`, and a red test proves the rule fires.
- **A consumer's own rule beats the library's**, at any specificity, with no `!important`.
  `plans/02` §4's level-2 worked example becomes true.
- **Core ships three looks as factories.** `bar()`, `summary()` and `diamond()`. Each takes
  `Partial<EntryVariant>` and answers a complete one. No row wears `diamond()` until a rule claims it.
- **A glyph holds its size at every zoom.** `Item.fixedWidthPx` states a painted width, and
  `render/` stamps `data-span="fixed"`.
- **A Gantt answers which variant a row wears**, as one object — `gantt.variantFor(entry)`.
- **Core's `parent` variant is named `summary`**, so `data-variant="summary"` and `.fg-bar-summary`
  tell one story.
- **`harness/planner.ts` holds no glyph code.** It says `diamond({ when: { checkpoint: true } })`.

---

## Decisions

Seven questions came up while planning. **All seven carry answers.** Nothing here blocks a build.

Each one says where its answer came from: an existing record, a principle the author stated, or a
call made under a rule already in `CLAUDE.md`. A call is reversible — the reasoning is written down
so a reviewer can undo it. Every answer is also a row in [`BUILD-LOG.md`](BUILD-LOG.md).

**Before you file a new question here, search the records first.** Q1 and Q4 were filed as open and
were already decided — one in an ADR, one in a review finding. `plans/row-redesign/BUILD-LOG.md`,
`docs/adr/**` and the `plans/s*/README.md` D-tables are where a settled decision hides.

### Q1 — an `ItemProducer` cannot name the variant it draws for

**Answered by [ADR 0018](../../docs/adr/0018-a-variant-is-a-rule-not-an-id-list.md). Not an open
question.** Its Decision section reads: *"One variant is one object. Four registrations become one
object, and the name appears once."* Its Context names this exact restatement as the defect — both
shipped examples "write the identical producer line, `[wholeEntryItem(entry, KIND)]`". The default
producer was added so the common case need not repeat the name. A custom producer still has to, so
the type never finished honouring the decision. Widening `ItemProducer` is that decision's unfinished
half, not a new one. Logged as **J3**.

`ItemProducer` is `(entry: Entry) => readonly Item[]` (`src/layout/items/item.ts:25`), and every
`Item` carries a `variant` string that `render/` stamps as `data-variant`
(`src/render/dom/index.ts:1195`). A producer therefore has to invent the name. Core's own
`produceLeafItems` hardcodes `LEAF_VARIANT_NAME` (`src/layout/items/variants.ts:228`), and the
whole-entry default closes over the registration's name instead.

This breaks the moment `bar()` ships. `bar({ name: 'phase', when: myRule })` carries
`produceLeafItems`, so every Item it draws is stamped `data-variant="leaf"`. The published
`fixedWidthItem(px)` has the same hole, and it has nowhere to close over a name from.

**Recommendation: widen the type to `(entry: Entry, variant: string) => readonly Item[]`.** The
registry passes the registration's own name. A one-argument producer an author already wrote keeps
working, because TypeScript accepts a function that takes fewer parameters. It removes the hardcoded
name from core, and it holds ADR 0018's rule that a variant states its name once.

Cost: `ItemProducer` is public (`src/api/index.ts:357`), so the API report moves.

### Q2 — the class `diamond()` paints

**Called under the naming rule. `.fg-bar-diamond`.** `data-variant` and the class must tell one
story — the same agreement that makes `parent` become `summary` in unit A. Logged as **J4**.

**Where its rules live is answered by Q6.** This is the class name alone, which stays a published
Part a consumer styles.

**Recommendation: `.fg-bar-diamond`.** The class matches `data-variant="diamond"`, which is the same
agreement the `parent` to `summary` rename buys.

Note the history. ADR 0013 retired a class of this name, and `src/view/styles.test.ts:210` asserts
the sheet carries none. That assertion moves with the rules. The class returns for a different
reason: nothing wears it until a rule claims it, and core's own sheet no longer holds it.

### Q3 — the diamond's fixed width, as a number

ADR 0022 rejects a per-variant `--fg-bar-min-width`, because reading a token per bar puts a computed
style read on the hover path (I5). So the number is a constant.

**Recommendation: one constant at 13px, beside `diamond()` in `src/layout/items/variants.ts`.**
13px is what `harness/planner.html:282` measured and shipped.

It does **not** go in `src/layout/frame.ts`. Two readers justify `DEFAULT_MIN_BAR_WIDTH_PX` living
there: `barSpan` takes it as a fallback, and `src/view/frame-settings.ts:48` takes it as the
`--fg-bar-min-width` policy's fallback. That number is Gantt-wide geometry. The diamond's width is
one variant's default, and `diamond()` is its only reader. A constant lives beside its reader.

**The sheet derives the glyph from the box, and restates no number.** The box is `fixedWidthPx`
wide; the ink is `width: 100%; aspect-ratio: 1` on the `::before`. So
`diamond({ items: fixedWidthItem(20) })` moves the ink and the hit box together. A literal `13px` in
the CSS would leave a 20px hit box around a 13px glyph.

**No token, and not as a deferral.** `--fg-diamond-size` is not a smaller version of this answer. A
`--fg-*` token is a Gantt-wide knob, so two variants that each want a size fight over one of them,
and a variant has to consult something outside itself to know how big it draws. A variant owns how it
renders. `fixedWidthPx` is what takes the number back: `barSpan` floors every ordinary bar at
`--fg-bar-min-width`, one Gantt-wide number, and a fixed width overrules that path. `diamond()` writes
its own number into its own Items, and nothing outside it has an opinion.

### Q4 — `variantOf` and `variantFor` are one concept with two names

**Answered by review finding F3 (`plans/row-redesign/BUILD-LOG.md:1415`). Not an open question.**
F3 ruled that a door answering with a *name* is the bug: *"`variantFor(entry)` answered with a
string, and `itemsFor`/`paintFor`/`interactionsFor` looked that string up again."* The registry
already answers `resolveFor(entry): ResolvedVariant` because of it, and `ResolvedVariant`'s own doc
carries the sentence. `variantOf(entry): string` is the last door that answers with a name.
Publishing a second one beside it re-opens what F3 closed. Logged as **J5**.

`GanttShell` already publishes `variantOf(entry): string` (`src/view/gantt-shell.ts:1145`), and
plugins read it through `ctx.view.variantOf` (`src/view/plugin-ports.ts:113`). ADR 0022 adds
`gantt.variantFor(entry): ResolvedVariant`. Two names, one preposition apart, for the same question.
CLAUDE.md names that shape a bug, and cites #7.

**Recommendation: one door, named `variantFor`.** It answers `ResolvedVariant` on both surfaces. The
two callers that want the name alone read `.name` — `src/extensions/features/context-menu.ts:132`
and `src/view/gantt-shell.ts:1312`. `CommandContext.variant` stays a string, so no command's `when`
changes.

Cost: a plugin-surface change, on a library that has never shipped.

### Q5 — `FrameBar.minimumSpan` becomes a tri-state

**Called under "illegal combinations are unrepresentable" (`CLAUDE.md`, API).** `data-span` is
already one attribute slot with one value at a time, so the type mirrors the DOM it feeds. Two
booleans beside each other make `{ minimumSpan: true, fixedSpan: true }` writable and meaningless.
Logged as **J6**.

`barSpan` answers `{ x, width, minimumSpan: boolean }` (`src/layout/frame.ts:66`), and `render/`
turns the boolean into `data-span="minimum"` (`src/render/dom/index.ts:1204`). A fixed width is a
third answer, and a bar is never both floored and fixed.

**Recommendation: `FrameBar.span: 'exact' | 'minimum' | 'fixed'` replaces `minimumSpan: boolean`.**
One value maps to one attribute, and the illegal pair cannot be written. Two booleans beside each
other can, which is what "illegal combinations are unrepresentable" forbids.

Cost: `FrameBar.minimumSpan` is in `etc/freegantt.api.md:959`, so the API report moves.

### Q6 — a variant owns the CSS behind its own class

**Answered 2026-09-12 by the author: the variant owns its CSS, and
[#286](https://github.com/Pawel-IT/FreeGantt/issues/286) closes as part of this work.**

A variant owned `items`, `paint` and `can`. It did not own the rules behind the class its `paint`
named. Core's `summary` answers `{ class: { 'fg-bar-summary': true } }`, and what that class means
sat in `BASE_STYLESHEET`. A shipped look was half-owned, and a consumer's own `flag()` or `chevron()`
could not be written without a core edit.

#### The key is `css`

```ts
{ name: 'flag', when: { flag: true }, items: fixedWidthItem(16), paint: myFlag, css: `…` }
```

`EntryVariant.css?: string` — the rules this look needs, as CSS text.

**Not `rules`.** ADR 0018's title is *a variant is a rule*, and `when` is that rule. One word, two
concepts.
**Not `styles`.** `ElementDescription.style` is the inline bag a `paint` answers, and
`src/view/styles.ts` is the base sheet. A third nearby use of the word costs a reader a lookup.
**Not `stylesheet`.** A variant carries a fragment, and the library holds one sheet.

#### One node per Gantt

- One `<style data-freegantt-variant-styles>` per Gantt, in `container.ownerDocument.head`.
- Its content is every installed variant's `css`, wrapped once in `@layer freegantt { … }`.
- It is written **after** the base sheet, always. `ensureBaseStyles` runs first.
- It is emitted in registration-ladder order: core, then every plugin, then the consumer. So at equal
  specificity the higher rung wins, which is the ladder the claim walk already uses.
- It is rebuilt when registrations change — construction, `gantt.variants = […]`, a plugin install or
  dispose — and removed on `destroy()`.

**Per Gantt, not refcounted per document.** Two Gantts must be fully independent (I2), and one shared
refcounted node is shared mutable state between instances. The cost is duplicated text when two
Gantts install one variant. That is bytes and not behaviour: the rules are identical and land in one
layer. CSS is document-global either way, which is already true of the base sheet.

#### Why this keeps every promise

- **A consumer still wins.** A variant's `css` sits inside `@layer freegantt`, so an unlayered
  consumer rule beats it at any specificity. ADR 0021 holds.
- **A variant beats the base sheet.** Both sit in one layer and the variant's node is later, so
  `diamond()`'s own rules cancel `.fg-bar`'s background and its state ring at equal specificity. That
  is the mechanism `.demo-checkpoint` needed and could not reach.
- **#286's rejected option stays rejected.** It refused a `paint` that answers inline `style` and no
  class, because that takes a consumer's ability to restyle away. A `css` fragment does the opposite:
  every declaration in it is overridable from an ordinary consumer rule.

#### What moves, and what does not

- `.fg-bar-summary`'s six rules move out of `BASE_STYLESHEET` into `summary()`. They sit at
  `src/view/styles.ts:327`, `:328`, `:332`, `:358`, `:359` and `:360`.
- `bar()` carries no `css`. Its look **is** `.fg-bar`, the element class every look wears, diamonds
  included. That is structure, not a look. Do not move it.
- Everything else in the base sheet stays: rows, the grid, the header, the popup, the tooltip, the
  menu, the editor, and `.fg-bar` itself.
- `src/view/styles.ts:2` says `ensureBaseStyles` is "the only place the library writes a stylesheet".
  That sentence changes. #286 predicted it would.

#### The record

ADR 0022 is `proposed` and unbuilt, so nothing here supersedes an accepted decision. **It is amended
in place**: a new section states that a variant owns its CSS, and the `decided:` line names it. The
`status:` line carries the date and the reason. Logged as a **J** entry.

### Q7 — where a fixed-width box sits, and who decides

**Answered by the principle the author stated on 2026-09-12: a variant owns everything about how
it renders.** The same sentence that answered Q6 answers this. An anchor core hardcodes is a
rendering decision taken outside the variant. Logged as **J7**.

What stays a build task and not a question: ADR 0022's *"centred on the Item's own start"* disagrees
with `barSpan`'s own midpoint rule, so that sentence does not go in the doc comment.

**Raised 2026-09-12 by the author, against ADR 0022's wording.**

ADR 0022 says `fixedWidthPx` is "centred on the Item's own start". Two problems sit in that sentence.

**It disagrees with the rule already in the code.** `barSpan` centres a floored bar on its
**midpoint**, not its start — `src/layout/frame.ts:72`, pinned by `src/layout/frame.test.ts:1047`
("centres a floored, non-zero-width bar on its own midpoint, not on its start"). The two agree only
when `start === end`. A fixed-width box on a real span would land in two different places depending
on which sentence a reader followed.

**Core should not pick the anchor at all.** Centring is right for a marker: a diamond points at an
instant, and a left-aligned 13px glyph on a 20px day puts its visual centre a third of a day late. It
is wrong for a flag, where the pole sits on the date and the cloth hangs to the right. A variant that
wants the second one would have to fight a rule core hardcoded — which is the thing Q6 just decided
against.

**Recommendation: the Item states both, and `fixedWidthPx` goes away.**

```ts
/** A painted box the time scale does not size. */
box?: { widthPx: number; anchor: 'start' | 'center' | 'end' };
```

`diamond()` writes `anchor: 'center'`. A flag writes `'start'`. Core picks for nobody.

`'center'` is the spelling already on the surface — `panToDate(date, align: 'start' | 'center')`
(`src/api/gantt.ts:798`). One word, one spelling, one meaning.

The producer takes it too: `fixedWidthItem(13)` for the marker, `fixedWidthItem(16, 'start')` for the
flag. Whether that producer keeps its name once it carries an anchor is a smaller question, and it
belongs with the answer to this one.

---

## Already refuted — do not propose these again

Both ADRs hold the full reasoning. This is the short list, so nobody spends a turn on one.

1. **Several cascade layers.** `src/view/styles.ts:175`, `:296` and `:357` each lean on
   equal-specificity-plus-document-order inside the sheet. One layer keeps that. (ADR 0021)
2. **A per-property escape hatch** (`surface: 'none'` and its kin). The checkpoint loses a hover ring
   too, and a ring is not a surface. One knob becomes four. (ADR 0021, ADR 0022)
3. **Splitting `.fg-bar` into a geometry class and a surface class.** It publishes a second class per
   part forever, and still loses the tie on anything a consumer restyles. (ADR 0022)
4. **Renaming `.fg-bar` to `.fg-item`.** 594 occurrences, roughly 90 of them published tokens. (ADR 0022)
5. **A `variantTypes` registry.** ADR 0016 deleted the save format, so a serializable name buys
   nothing. (ADR 0022)
6. **A priority number per variant.** `requires` and rank already order things, and everybody picks a
   bigger number. (ADR 0022)
7. **A per-variant `--fg-bar-min-width`.** A computed style read per bar, on the hover path. (ADR 0022)
8. **`colour` as a variant key.** Colour lives in `--fg-*` tokens with no JavaScript in between. (ADR 0022)
9. **A `glyphs()` first-party plugin.** A plugin is the wrong container for one exported function. (ADR 0022)
10. **A second package entry point for the looks.** It buys no tree-shaking, and costs a second
    `exports` entry, a second budget and a second API report. (ADR 0022)
11. **A fourth shipped shape** — a chevron, a flag, a hatched buffer, a hollow bar. One shape shipped
    because one shape had evidence. The next brings its own. (ADR 0022)
12. **`entry.variant`.** An Entry belongs to a Dataset, and a variant resolves per Gantt (I2). (ADR 0022)

---

## Files

| File | What it holds |
|---|---|
| [`build/README.md`](build/README.md) | The hard rules every build follows. |
| [`build/build-1-287-seal-the-harness.md`](build/build-1-287-seal-the-harness.md) | #287. |
| [`build/build-2-0021-the-layer.md`](build/build-2-0021-the-layer.md) | #288, ADR 0021. |
| [`build/build-3-0022-shipped-variants.md`](build/build-3-0022-shipped-variants.md) | #289, ADR 0022. |
| [`BUILD-LOG.md`](BUILD-LOG.md) | Every question and every judgement call. |
