# Build 2 — the consumer's stylesheet wins

**The ADR:** [`docs/adr/0021`](../../../docs/adr/0021-the-consumers-stylesheet-wins.md).
**The issue:** [#288](https://github.com/Pawel-IT/FreeGantt/issues/288).

**Lands after build 1.** It carries no decisions, and it is the smaller half of the pair.

---

## What is true at HEAD

- `ensureBaseStyles` is the only place the library writes a stylesheet
  (`src/view/styles.ts:459`). It appends one `<style data-freegantt-styles>` to `document.head`.
- `BASE_STYLESHEET` is one template literal, `src/view/styles.ts:159` to `:457`. It interpolates
  `LIGHT_COLOR_TOKENS` and `DARK_COLOR_TOKENS`, and it holds one at-rule —
  `@media (prefers-color-scheme: dark)` at `:169`.
- The library's sheet always sits after a consumer's own, so the library wins every tie at equal
  specificity. `plans/02` §4's level-2 worked example loses.
- No plugin injects CSS of its own. Tooltips, the menu and the cell editor all paint through classes
  the base sheet already carries.

---

## The work

### 1. The layer

- [x] Wrap `BASE_STYLESHEET` in `@layer freegantt { … }`.
- [x] **One layer, not several.** `src/view/styles.ts:175`, `:296` and `:357` each lean on
      equal-specificity-plus-document-order inside the sheet. The normal cascade still applies inside
      one layer, so their reasoning holds.
- [x] The name is `freegantt`. A consumer who uses layers orders against it — `@layer freegantt, app;`.
- [x] Keep the interpolations and the `@media` block where they are. A nested at-rule inside a layer
      needs no change.

### 2. The three comments

- [x] `src/view/styles.ts:175`, `:296` and `:357` each gain one sentence: the layer does not change
      this rule's reasoning, because the normal cascade still applies inside one layer.

### 3. The test

- [x] `src/view/styles.test.ts` asserts the emitted sheet is wrapped. It reads the injected
      `<style data-freegantt-styles>` already, at `:109` and elsewhere, so follow that shape.
- [x] Assert the wrapper, not one rule inside it. An edit that only meant to add a rule must not be
      able to drop the wrapper.

### 4. The two promises

- [x] `plans/02` §4: the level-2 row states that the library's sheet is layered, and that a
      consumer's own rules win at any specificity. §4's banner says not to update it halfway through
      the row-redesign builds. This edit is in scope, because the promise is now true and was not —
      log a **J** entry saying so.
- [x] `docs/05-consumer-api.md`: one sentence, in a consumer's words.

---

## Watch for

**Existing paint may change, and that is the point.** Any `.demo-*` rule that lost a tie now wins.
Check these before you call it done:

- [x] `harness/planner.html`'s `.demo-checkpoint` block (`:266`–`:305`) now beats `.fg-bar`. The
      checkpoint stops painting the library's rounded rect. It still grows with the zoom — that is
      build 3's half, and it stays broken here.
- [x] `e2e/bar-fill-cascade.spec.ts` reads a `--fg-bar-fill` override through a pseudo-element.
- [x] `e2e/theme.spec.ts` and `e2e/row-hover.spec.ts` read computed colours off a bar.
- [x] `harness/plugins.html`'s `.demo-milestone` rules.

Run the browser check and look at the pages. A green test proved nothing when the grid lines shipped
invisible.

---

## Gate

- [x] `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`
- [x] Report the verdict line.
- [x] Screenshot `planner.html` and `plugins.html`, in both themes. The user's desktop is dark and
      headless Chromium is light, so check the OS and theme matrix.

## Close the issue

- [x] Close [#288](https://github.com/Pawel-IT/FreeGantt/issues/288). Name the two harness pages you looked at, and say the level-2 promise is now true.
- [x] Apply the labels with the `label-issues` skill.

## Done when

- The emitted sheet is one `@layer freegantt` block.
- A test holds the wrapper in place.
- `plans/02` §4's worked example works.
