# Handoff — the published pages, and what is still wrong with them

**Branch:** `main` (committed directly, no PR, by request)
**Date:** 2026-09-14
**Gate:** `verify:full PASS — all 16 checks green, test:e2e included (77s)` at `656876a`

Read this before you touch anything under `website/docs/`. One page is now re-derived against the
code and two guards grew to cover the folder. The rest of this file is what I found and did **not**
fix, ranked by what it costs the next reader.

---

## 1. What is DONE and should not be redone

`656876a` — *docs(architecture): re-derive the lifecycle page, retire four dead names*.

### 1.1 `lifecycle.md`, checked line by line against `src/`

Every claim on that page now traces to a line someone read this session. The eight that were wrong:

| Claim on the page | What the code does |
| --- | --- |
| "no gutter subtract", "nothing is subtracted" | `#applyRowsViewportSize()` subtracts the measured header height (`gantt-shell.ts:2177`). |
| "reads `--fg-row-height`" | `refreshPixelProperties()` re-reads four `--fg-*` properties. |
| 19 construction steps | 20. Step 19 applies `datasetPlugins`, `plugins`, `zoomPresets` and `selection` before the first flush (ADR 0019). `theme` lands after it. |
| "so `#frames.request()` is not called" | The dropped callback also skips `#emitNavigationChange()`. |
| `LayoutInput` = 9 keys gathered in `render()` | 21 keys, built by `#frameSettings.toLayoutInput(perFrame)` (#167). |
| `GeometryFrame` has `items[]` | `bars`, `links`, `tickLines`, `rowCount`, `tree`, `decorations`, `underBars`, `overBars`, `columns`. |
| `sync()` runs 4 keyed layers | 10. Plus `render()`'s tail: grid ARIA sizing, band-count feedback, roving focus. |
| items produced "by `EntryKind`" | Per variant (ADR 0018). An Entry has no stored classification. |

### 1.2 The `onChange ×2` explainer

New section under Diagram 1, **"Step 12: why one `bind()` delivers two notifications"**, plus its
own Diagram 2. It is written for a reader who has never opened the code. Measured with a throwaway
probe, then deleted: **two** bind-time notifications, **one** `computeFrame` across construction. A
third notification follows the first frame, from `setContentSize`, and that one is live.

### 1.3 Four names retired from the prose

`EntryKind` (ADR 0017), `DatasetDocument` (ADR 0016), `FieldSource`, `CollapseState`, plus
`createItemProducerRegistry`, `packLanes`, `lanes/` and the `toJSON`/`fromJSON` surface ADR 0016
deleted. Six rows in `files.md` named files that no longer exist. Every one of these types is at
**zero** hits in `src/`.

### 1.4 The guards that should have caught it

`test/guards/retired-words.test.ts` and `scripts/check-vendor-names.mjs` now scan
`website/docs/**`. The ADRs are exempt (they keep their original wording) and so is
`website/docs/api/**` (TypeDoc generates it from `src/`, which both already scan). Two names joined
the retired list: `EntryKind` (ADR 0017) and `DatasetDocument` (ADR 0016). **That guard file is the
only home for the list** — `maintaining.md` points at it rather than copying it, because a copy is
the next thing to drift.

### 1.5 Modified dates

`showLastUpdateTime: true` in `website/docusaurus.config.ts`. Each page I changed carries
`last_update.date`. A dev server needs a restart to pick the config up. `maintaining.md` documents
the convention: state the date by hand, and only when you checked the page against the code.

---

## 2. What REMAINS

### 2.1 Thirty-two documents live in two places — CLOSED 2026-09-14 (#221)

`docs/` is the source. `website/docs/guides/` and `website/docs/adr/` are generated from it by
`scripts/build-website-docs.mjs`, and `pnpm docs:published-is-current` fails the gate when the
committed output is behind — the same posture `pnpm api-report` already takes for
`etc/freegantt.api.md`. A published page with no source under `docs/` fails too, so a second home
cannot come back quietly.

`docs/` won every disagreement, because `docs/adr/README.md` rules that an accepted record is
superseded and never rewritten. The migration had rewritten 24 ADR bodies while copying them, and
that rule forbids it. The site now serves each record as its author wrote it.

`website/docs/guides/row-source-updates.md` had no source at all; it is now
`docs/07-row-source-updates.md`. `scripts/check-doc-examples.mjs` typechecks the source rather than
the copy.

Two things this cost, both recorded rather than hidden. The published pages lose the migration's
prose rewrites, which is the point — they were edits to the wrong copy. And
`docs/05-consumer-api.md`'s closing paragraph names the Architecture and API sections in prose
instead of linking them, because `website/docs/architecture/` has no source under `docs/` for a
link to aim at.

### 2.2 `files.md` is an inventory that misses 24 live files

166 non-test files in `src/`, 142 listed. I deleted the 6 rows for files that no longer exist; I
did not add rows for these:

```
api/define-plugin.ts          data/hierarchy-source.ts     model/interactions.ts
api/plugin-context.ts         data/live-entry.ts           model/stored-entry.ts
data/fields/column-sizing.ts  data/write-rule.ts           model/write-verdict.ts
data/fields/field-types.ts    extensions/plugin-order.ts   render/dom/text-ruler.ts
layout/entry-double.ts        layout/items/item.ts         render/dom/tick-lines.ts
layout/items/variants.ts      model/field-key.ts           view/grid-pane-width.ts
model/hierarchy-source.ts     view/live-region.ts          view/roving-focus.ts
view/segment-selection.ts     view/theme.ts                view/variant-styles.ts
```

Re-run the comparison after any `src/` file is added or deleted:

```bash
grep -oP '^\| `\K[a-z0-9\-/\.]+\.ts(?=`)' website/docs/architecture/files.md | sort -u > /tmp/listed
(cd src && find . -name '*.ts' ! -name '*.test.ts' | sed 's#^\./##' | sort) > /tmp/actual
comm -13 /tmp/listed /tmp/actual   # live but unlisted
comm -23 /tmp/listed /tmp/actual   # listed but deleted
```

Each new row needs a real description — read the file's header, do not guess from the name. The
remaining 142 rows were **not** re-checked; treat their descriptions as unverified.

### 2.3 `classes.md` is part-derived

I fixed what the retired names touched: the `produceItemsForRow` section, the `CollapseState`
section, and four rows of the `model/` type table (`Entry`, `Field`, the id brands, the file
count — it said ten, there are eighteen). Three ghost rows came out. **Nothing else on that page
was checked.** A page that was wrong in four adjacent cells is unlikely to be right everywhere
else.

### 2.4 `website/docs/guides/lint-rules.md` names three files that do not exist

Its "behavior per kind" table lists `src/scheduling/policy/default-policy.ts`,
`src/render/dom/renderer-registry.ts` and `src/interaction/capabilities.ts`. None exists, and
`eslint.config.js` does not name them either. `scheduling/` is S7 and unbuilt, so at least one row
describes work that has not happened — which `maintaining.md` rule 4 forbids ("a section describing
a class that does not exist yet is worse than no section"). Fix it in `docs/02-lint-rules.md`, the source §2.1 settled on
on as the source.

### 2.5 `Viewport.bind()` still notifies twice — a one-line library change

`bind()` is the only path on `ViewportHandle` with no batch around its two sub-model calls;
`setPaneSize`, `setContentSize` and `setEntries` all wrap theirs
(`src/layout/viewport/viewport.ts:109`). Wrapping the pair in `this.#notifications.batch(...)`
collapses it to one delivery and matches the stated contract — one caller-visible change, one
reaction.

Nothing observes it today: `bind()` runs only inside the `GanttShell` constructor, where `#phase`
is `'constructing'` and the callback returns early. So this is a consistency change, not a bug fix,
and it deserves a decision rather than a drive-by edit.

**If you make it, five places on `lifecycle.md` describe the old behaviour and must move together:**
the amber note in Diagram 1 (step 12), the `10–12` row of the "why the order" table, the diagram's
figcaption, the whole of §"Step 12: why one `bind()` delivers two notifications", and Diagram 2
inside it. Re-measure the count before rewriting the numbers.

### 2.6 One cosmetic overlap in the render diagram

In `lifecycle.md`'s Diagram 3, the `computeFrame(input, heights)` box sits at `x=234 … 410`, and
its longest text line runs under the `GeometryFrame` box that starts at `x=452`. It is pre-existing
and only clips a few characters. Either shorten the lines or move the column.

---

## 3. How to check your work

- `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log` — the gate. Its last line is the answer;
  never report an exit code. The two prose guards run inside it.
- `pnpm --dir website build` — catches a broken link, a broken anchor, and any MDX the pages cannot
  parse. `pnpm --dir website start` for the live page.
- **A diagram tolerates no blank line between `<div class="fg-architecture-doc">` and its closing
  `</div>`.** One blank line ends the raw-HTML block, and every shape after it renders as a sibling
  of the `<svg>` instead of inside it. `maintaining.md` states the rule; this is the one that bites
  hardest.
- Screenshot a changed diagram before you call it done. Text overflows its box silently — no build
  step measures it.
