# Build 3 — core ships variants, and a variant answers about itself

**The ADR:** [`docs/adr/0022`](../../../docs/adr/0022-core-ships-variants-and-a-variant-answers-about-itself.md).
**The issue:** [#289](https://github.com/Pawel-IT/FreeGantt/issues/289).

**Lands after builds 1 and 2.** Build 1 makes the harness a real acceptance test. Build 2 lets the
paint land.

> **Every decision this build needs is answered.** [`../README.md`](../README.md) holds Q1–Q7 with
> the reasoning for each, and [`../BUILD-LOG.md`](../BUILD-LOG.md) holds J1–J7. Read both before you
> start. Do not re-open one — if you think an answer is wrong, say so and stop.

---

## What is true at HEAD

- `src/layout/items/variants.ts` holds `EntryVariant`, `ResolvedVariant`, `CORE_VARIANTS` and
  `createVariantRegistry`. `CORE_VARIANTS` is two private object literals, at `:206`.
- `LEAF_VARIANT_NAME` is `'leaf'`; `PARENT_VARIANT_NAME` is `'parent'`. `produceLeafItems` hardcodes
  the first.
- `barSpan` (`src/layout/frame.ts:60`) floors every painted width at `minBarWidthPx`, one number per
  Gantt, read once from `--fg-bar-min-width`.
- `render/dom/index.ts:1204` stamps `data-span="minimum"`. `:1195` stamps `data-variant` from
  `item.variant`.
- `src/api/index.ts:357` exports `Item` and `ItemProducer`; `:361` exports `EntryVariant`,
  `VariantRule`, `VariantPredicate` and `FieldMatch`; `:364` exports `wholeEntryItem`.
  `ResolvedVariant` is internal.
- `GanttShell.variantOf(entry)` answers the name alone (`src/view/gantt-shell.ts:1145`).
- `fixtures/planner-dataset.ts:140`–`:143` fakes a one-day span for a checkpoint.
- `harness/planner.ts:186`–`:213` holds `checkpointDiamond` and a hand-written `checkpoint` variant.
- `.size-limit.json` caps core at 79 KB, and it measures 78.3 kB.

---

## Unit A — `parent` becomes `summary`

Mechanical. It lands first, because every unit after it names `summary()`.

- [x] Rename `PARENT_VARIANT_NAME`'s value and the constant with `pk-rename-symbol`. The variant's
      `name` becomes `'summary'`.
- [x] `pnpm typecheck`.
- [x] The CSS class `.fg-bar-summary` is already right. Do not touch it.
- [x] Fix every string that names the old variant. Start here:
      `plans/02-public-api.md:378` (`.fg-bar[data-variant="parent"]`), `src/api/gantt.test.ts`,
      `src/layout/items/variants.test.ts`, `src/view/plugin-ports.test.ts`, `e2e/**`.
      A same-named string in prose is a separate decision, so read each one.
- [x] `grep -rn "data-variant=\"parent\"\|'parent'" src harness e2e plans docs` finds the rest.

## Unit B — an `ItemProducer` names the variant it draws for

**Decided: Q1, J3.**

- [x] Widen `ItemProducer` to `(entry: Entry, variant: string) => readonly Item[]`
      (`src/layout/items/item.ts:25`). Say in the doc comment why the name arrives as an argument: a
      variant states its name once, and the Item carries it to `data-variant`.
- [x] `createVariantRegistry` passes the registration's own name at every call site
      (`src/layout/items/variants.ts`, the `resolved.items` binding).
- [x] `resolveItems` (`src/layout/items/produce-items.ts:18`) passes the resolved name through.
- [x] `produceLeafItems` takes the name instead of hardcoding `LEAF_VARIANT_NAME`.
- [x] A test proves it: a variant that carries a producer stamps its own name, not the producer's.
      `bar({ name: 'phase' })` draws Items with `variant: 'phase'`.
- [x] Update `etc/freegantt.api.md` with `api-extractor run --local`, and say so in the PR.

## Unit C — an Item may state a fixed painted width

**Decided: Q3, Q5, Q7 — J6 and J7.**

- [x] The Item states a painted box the time scale does not size (`src/layout/items/item.ts`).
      **J7 states its shape and its anchor.** ADR 0022 holds that type. `diamond()` writes
      `anchor: 'center'`. A flag writes `'start'`.
- [x] `barSpan` honours it ahead of the span-and-floor path.
- [x] The third span state reaches `render/`, and `render/` stamps `data-span="fixed"` beside the
      existing `data-span="minimum"`.
- [x] Export `fixedWidthItem(px, anchor?: 'start' | 'center' | 'end')` from `layout/`, and publish
      it from `src/api/index.ts` beside `wholeEntryItem`. Omitted, the anchor is `'center'`. It
      answers one whole-entry Item that carries `box`.
- [x] Unit tests in `src/layout/frame.test.ts`: a fixed box keeps its width when the scale changes,
      and each anchor puts it where J7 says. `:1047` already pins the floored-bar rule beside it —
      the two must not contradict each other.
- [x] A `render/` test asserts the attribute.
- [x] `docs/05-consumer-api.md` gains `data-span="fixed"`, beside `data-span="minimum"`.

## Unit D — the three factories

**Decided: Q1, J3.**

- [x] `bar(overrides?: Partial<EntryVariant>): EntryVariant`. It carries `produceLeafItems`, which is
      why it is worth exporting. An author who hand-writes `{ name, when }` gets `wholeEntryItem`
      instead, and their Segments vanish.
- [x] `summary(overrides?): EntryVariant`. Default `when` is `(entry) => entry.hasChildren`. Default
      `paint` answers the frozen `SUMMARY_BAR`.
- [x] `diamond(overrides?): EntryVariant`. Default `when` is
      `(entry) => entry.duration()?.value === 0`. Default `items` is `fixedWidthItem(…)` from unit C.
      Its default box is one constant, declared beside `diamond()` in the same file — never in
      `src/layout/frame.ts`, which holds the two numbers `barSpan` and `frame-settings.ts` share.
- [x] Every key overrides, `paint` included. The argument is an object and never a positional rule:
      a `FieldMatch` is `{ [key: string]: unknown }`, so `diamond({ when })` could not be told from a
      match on a field named `when`.
- [x] `CORE_VARIANTS` seeds from `bar()` and `summary()`. **`J37`'s order is load-bearing.** The floor
      registers first, or no row is ever a summary. Keep the comment that says so.
- [x] `diamond()` is **not** in `CORE_VARIANTS`. No row wears it until a rule claims it.
- [x] Export all three from `src/api/index.ts`.
- [x] Tests: each factory answers a complete variant; each key overrides; `CORE_VARIANTS` still
      resolves a summary for a row with children.

## Unit E — a variant carries its own CSS

**Q6 answers this. Read it first.** `EntryVariant.css` is the key, one `<style>` node per Gantt, and
[#286](https://github.com/Pawel-IT/FreeGantt/issues/286) closes here.

### E1 — the record

- [x] Amend `docs/adr/0022` in place. It is `proposed` and unbuilt, so nothing is superseded. Add the
      section that states a variant owns its CSS. Name it on the `decided:` line. Put the date and
      the reason on `status:`. Q7's `box` / anchor lands in the same amendment.
- [x] Log the amendment as a **J** entry (J9).

### E2 — the key

- [x] `EntryVariant.css?: string` (`src/layout/items/variants.ts`). The doc comment answers the fifth
      question the file already asks of a variant: what rules its look needs.
- [x] `layout/` stays DOM-free. A CSS string is data, and `view/` does the writing.
- [x] Say in the doc comment that the text goes in verbatim. The person who authors a variant already
      runs code on the page, so this opens nothing that was closed.

### E3 — the injection

- [x] New `src/view/variant-styles.ts`. One `<style data-freegantt-variant-styles>` per Gantt, in
      `container.ownerDocument.head`.
- [x] Content is every installed variant's `css`, wrapped once in `@layer freegantt { … }`.
- [x] **The base sheet is written first, always.** `ensureBaseStyles` runs at
      `src/view/gantt-shell.ts:524`. A variant's rules must land after it, or they cannot cancel
      `.fg-bar`'s own background and state ring at equal specificity.
- [x] Emit in registration-ladder order: core, then every plugin, then the consumer.
- [x] Rebuild when registrations change — construction, `gantt.variants = […]`, a plugin install or
      dispose.
- [x] Remove the node in `destroy()` (`src/view/gantt-shell.ts:2090`).
- [x] One node per Gantt, never one refcounted per document (I2). Q6 holds the reasoning.
- [x] `src/view/styles.ts:2` says `ensureBaseStyles` is "the only place the library writes a
      stylesheet". Rewrite that sentence.

### E4 — `summary()` takes its own rules back

- [x] Move the six `.fg-bar-summary` rules out of `BASE_STYLESHEET` and into `summary()`.
      They sit at `src/view/styles.ts:327`, `:328`, `:332`, `:358`, `:359`, `:360`.
- [x] `bar()` carries no `css`. Its look **is** `.fg-bar`, the element class every look wears.
      That is structure, not a look. Leave it in the base sheet.
- [x] `src/view/styles.test.ts`'s `.fg-bar-summary` assertions move to a variants test. They assert
      the same rules, read off the variant's own node. (There were none in `styles.test.ts` to move —
      `getComputedStyle` cannot resolve a layered rule in happy-dom (J14), so the base sheet's own
      `.fg-bar-summary` rules had no computed-style assertion to begin with. `variants.test.ts`'s new
      `describe('core's three shipped factories')` asserts the CSS text instead.)

### E5 — `diamond()`'s look

- [x] `diamond()`'s `paint` answers its class and nothing else. Follow `SUMMARY_BAR`'s shape
      (`src/layout/items/variants.ts:191`): one frozen object, so the hover path allocates nothing.
- [x] `diamond()`'s `css` holds the glyph: the box is the hit target, a `::before` is the ink, and
      the box's own state paint is cancelled so the glyph wears it.
- [x] **The CSS restates no size.** The ink is `width: 100%; aspect-ratio: 1` on the `::before`, so it
      follows the box `box.widthPx` set. A literal `13px` would leave a 20px hit box around a 13px
      glyph the moment an author writes `diamond({ items: fixedWidthItem(20) })`.
- [x] Check the label. A fixed 13px box holds no label, so `barLabels: 'fitBar'` must place it outside
      through the library's own path. **If it does not, that is a gap — report it.** Checked: no gap.
      `resolveBarLabelPlacement` reads only `bar.x`/`bar.width`, and `barSpan` already sets those from
      `box` ahead of the span-and-floor path (Unit C) — no code branch treats a fixed box specially, so
      the same `fitBar` arithmetic every narrow bar uses applies unconditionally. Pinned by a new test,
      `src/render/dom/index.test.ts`'s `'a fixed-width Item's label finds no room in its own box, so
      fitBar moves it outside (ADR 0022, E5)'`.

### E6 — the tests

- [x] A Gantt with no `diamond()` installed has no diamond CSS in the document. That is #286's whole
      claim, and it is now assertable. `src/api/gantt.test.ts`'s new `describe('a variant's own css
      (ADR 0022 §5, Q6)')`.
- [x] `gantt.variants = […]` installs a variant's rules, and assigning a list without it removes them.
      Same `describe` block, `src/api/gantt.test.ts`.
- [x] Two Gantts with different `variants` each carry their own node (I2). Same `describe` block.
- [x] A variant's rule beats the base sheet at equal specificity, and an unlayered consumer rule beats
      the variant's. Both directions, because the layer is what makes the second one true. A real-
      cascade claim — happy-dom does not parse `@layer` (J14) — so this one is `e2e/variant-styles.spec.ts`,
      new, run against `/` through `window.__gantt.variants = […]`. No harness source file touched.

### E7 — close #286

- [x] Close [#286](https://github.com/Pawel-IT/FreeGantt/issues/286) with a comment naming the
      mechanism that landed: its first candidate, per Gantt rather than per document.
- [x] Its rejected fourth option stays rejected. A `css` fragment is not an inline `style`: every
      declaration in it is overridable from an ordinary consumer rule.
- [x] Apply the labels with the label-issues skill.

## Unit F — `gantt.variantFor(entry)`

**Decided: Q4, J5.**

- [ ] Publish `ResolvedVariant` from `src/api/index.ts`.
- [ ] `Gantt` gains one door that answers it. The doc comment states why it is **not** `entry.variant`:
      an Entry belongs to a Dataset, a variant resolves per Gantt, and I2 makes two Gantts on one
      Dataset able to paint one row differently. Say it there, because the next reader proposes it again.
- [ ] Settle the `variantOf` collision the way Q4 answers.
- [ ] A test: two Gantts on one Dataset, with different `variants`, answer differently for one Entry.
- [ ] `docs/05-consumer-api.md` gains `variantFor`.

## Unit G — the harness closes the loop

This is the acceptance test. CLAUDE.md's stop rule governs it.

- [ ] `fixtures/planner-dataset.ts:140`–`:143` stores `end === start`. Delete the fake one-day span
      and the comment that explains it. `barSpan` centres a zero-width span correctly.
- [ ] Check what ingest does with it. `end === start` must survive `new Dataset(...)` unchanged.
- [ ] `harness/planner.ts` deletes `checkpointDiamond` (`:186`–`:205`) and says
      `diamond({ when: { checkpoint: true } })` in `PLANNER_VARIANTS` (`:213`).
- [ ] `harness/planner.html` deletes the `.demo-checkpoint` block (`:266`–`:305`), the
      `.demo-checkpoint-label` rule included.
- [ ] **Anything that has to stay behind is an unclosed gap. Report it. Do not keep it.** A leftover
      `.demo-checkpoint` rule, a leftover renderer, a leftover `--demo-*` token — each one is an API
      gap, and each one goes in the log as a **Q** entry.
### The other two pages

`harness/main.ts:423` and `harness/plugins.ts:110` each hand-build a milestone diamond, and each says
why in the same words: *core ships no diamond*. This build deletes that reason. Hand-building a look
core now ships is re-deriving what the library computes, which `CLAUDE.md` names an API gap even when
no lint fires. Logged as **J8**.

- [ ] `harness/main.ts`'s `demoVariants` milestone becomes `diamond({ when: { milestone: true } })`.
      Its `--fg-bar-fill` recolour stays, as an override on the factory.
- [ ] `harness/plugins.ts`'s milestone does the same. Its `buffer` and `risk` variants stay
      hand-written: core ships neither look, and the pair is what demonstrates a consumer's rule
      beating a plugin's of the same name (D-S5-11).
- [ ] `harness-chrome.css`'s `.demo-milestone` rules go with them. Anything that cannot go is an
      unclosed gap — report it.
- [ ] `e2e/bar-fill-cascade.spec.ts` reads `--fg-bar-fill` through `.demo-milestone::before`. Its
      subject is the fill cascade, not the glyph, so point it at the class `diamond()` paints and
      leave the assertion alone.
- [ ] Review `harness/main.ts` in full, changed or not. CLAUDE.md asks for it on every commit.

## Unit H — the prose sweep

Every statement below is **true at HEAD**. Each one flips with this build, and not before.

- [ ] `CONTEXT.md:40`, `:41` (the *Avoid* entry), `:44`
- [ ] `plans/01-domain-architecture.md:250`
- [ ] `plans/03-slices.md:187`
- [ ] `src/layout/frame.ts:42`, `:57`
- [ ] `src/view/styles.test.ts:210`
- [ ] `src/api/gantt.test.ts:2123`, `:4185`
- [ ] `harness/plugins.ts:110`
- [ ] `harness/main.ts:423`
- [ ] `harness/planner.ts:188`
- [ ] `e2e/renderer-callbacks.spec.ts:14`
- [ ] `plans/02-public-api.md` §4.1 gains the shipped set.
- [ ] `plans/field-redesign/**` is historical working material. Add one supersession banner to its
      README, the way `docs/adr/README.md:26` handles ADR 0014. **Do not rewrite its build logs.**
- [ ] `e2e/planner.spec.ts:15`, `e2e/theme.spec.ts:9` and `e2e/row-hover.spec.ts:49` each exclude
      `.fg-bar-diamond` from a selector, to pick a plain bar. The class matches nothing at HEAD, so
      each exclusion is dormant. **The rule: keep it on a page that installs `diamond()`, delete it
      on a page that does not.** After unit G all three pages install it — `planner.spec.ts` loads
      `/planner.html`, and the other two load `/` — so all three exclusions become live and stay.
- [ ] `grep -rn "diamond"` finds anything this list missed. Check `harness/docs/*.html` too.

Already done ahead of this build, because they were stale rather than true: `--fg-diamond-size` and
`--fg-diamond-stroke` are out of `docs/05-consumer-api.md` and `CONTEXT.md`; ADR 0012 and ADR 0013
carry `status:` amendments, and ADR 0013 carries a banner. Do not redo these.

## Unit I — the tests and the budget

- [ ] An e2e covering a variant's paint asserts a computed property or a measured box.
      `toBeVisible()` is exactly what let this ship (`e2e/planner.spec.ts:67`).
- [ ] Write the two assertions that would have gone red:
      - the checkpoint's computed `background-color` is transparent;
      - the checkpoint's box width does not change when the zoom does.
- [ ] The second one needs a zoom step. `harness/planner-toolbar.ts` drives zoom already.
- [ ] **Measure the budget before you move it.** #289 asked for +1 KB, and unit E changes the sum in
      both directions: `diamond()`'s CSS leaves the always-shipped path, and `summary()`'s moves from
      the base sheet into a seeded factory. Run `pnpm size-limit`, read the number, then set
      `.size-limit.json` from what it says. Say the measured figure in the PR.
- [ ] Update `etc/freegantt.api.md` with `api-extractor run --local`. Say in the PR that the report
      diff is intended, and name the additions: the three factories, `fixedWidthItem`, `Item.box`,
      `FrameBar.span`, `ResolvedVariant` and `variantFor`.

---

## Gate

- [ ] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`
- [ ] Report the verdict line.
- [ ] Screenshot `planner.html` in both themes, at the default zoom and one step in. The checkpoint
      must read as a diamond at both.

## Close the issues

- [ ] Close [#289](https://github.com/Pawel-IT/FreeGantt/issues/289). Name what landed, and say that
      ADR 0022 was amended in place (J2, J9).
- [ ] Close [#286](https://github.com/Pawel-IT/FreeGantt/issues/286) — unit E7 holds its wording.
- [ ] Apply the labels to both with the `label-issues` skill.

## Done when

- `harness/planner.ts` holds no glyph code, and the page still paints a checkpoint.
- The checkpoint's box is the same width at every zoom.
- `gantt.variantFor(entry)` answers the whole variant.
- No live doc says core ships no diamond.
