# shipped variants — build log

Every question and every judgement call, written the moment it comes up.

- A **J** entry is a call an agent made alone. It states what was chosen and why, so a reviewer can
  reverse it.
- A **Q** entry is a question for the author. It states what is blocked until the answer lands.

`README.md` holds Q1–Q7, all answered. Number a new question from Q8. Their answers land here,
under the same numbers.

---

## Questions

Seven came up while planning. All seven are answered. `README.md` holds the reasoning for each.

**Two were already decided, and should never have been filed as open.** Search
`plans/row-redesign/BUILD-LOG.md`, `docs/adr/**` and the `plans/s*/README.md` D-tables before you
file a new one.

| #  | Build | Question | Answer |
| -- | ----- | -------- | ------ |
| Q1 | 3 | Does `ItemProducer` take the variant name? | **Already decided.** ADR 0018: *"the name appears once"*. The type never finished honouring it. See J3. |
| Q2 | 3 | What class does `diamond()` paint? | **`.fg-bar-diamond`.** See J4. |
| Q3 | 3 | The diamond's fixed width, and where the number lives? | **13px, beside `diamond()` in `variants.ts`.** Not `frame.ts`: that file holds the numbers with two readers. The CSS derives the ink from the box. |
| Q4 | 3 | Do `variantOf` and `variantFor` become one door? | **Already decided.** Review finding F3 ruled that a door answering with a name is the bug. See J5. |
| Q5 | 3 | Does `FrameBar.minimumSpan` become `span: 'exact' \| 'minimum' \| 'fixed'`? | **Yes.** See J6. |
| Q6 | 3 | Does a variant own the CSS behind its own class? | **Answered 2026-09-12 by the author: yes.** `EntryVariant.css`, one `<style>` node per Gantt, inside `@layer freegantt`. #286 closes in build 3. |
| Q7 | 3 | Who decides where a fixed-width box sits? | **The variant.** The author's own Q6 principle answers it. See J7. |

Number a new question from Q8.

---

## Judgement calls

Each one is reversible. The reasoning is here so a reviewer can undo it.

| #  | Build | Call | Why |
| -- | ----- | ---- | --- |
| J1 | 3 | `EntryVariant`'s new key is `css`. | `rules` collides with `when` (ADR 0018: a variant **is** a rule). `styles` collides with `ElementDescription.style` and `view/styles.ts`. `stylesheet` overstates a fragment. `css` has one meaning and no other use on the surface. |
| J2 | 3 | ADR 0022 is amended in place rather than superseded. | It is `proposed` and unbuilt. `docs/adr/README.md:5` protects an **accepted** record's body, and no line of 0022 has reached `src/`. |
| J3 | 3 | `ItemProducer` becomes `(entry, variant) => readonly Item[]`. | ADR 0018 decided the name appears once. A one-argument producer already written keeps compiling, because TypeScript accepts fewer parameters. The alternative — the registry stamps nameless Items — copies every Item on every frame pass. |
| J4 | 3 | `diamond()` paints `.fg-bar-diamond`. | `data-variant` and the class tell one story, which is the same agreement behind unit A's rename. |
| J5 | 3 | `variantOf` retires; `variantFor(entry): ResolvedVariant` is the one door, on the `Gantt` and on `ctx.view`. | F3's rule, applied to the last door that still answers with a name. `CommandContext.variant` stays a `string`, so no command's `when` moves. **Note for a reader of `row-redesign/BUILD-LOG.md`:** `variantFor` is a name F3 retired from the *registry*, where it answered a string. The registry's door is `resolveFor`. This is the public door, and it answers the object. |
| J6 | 3 | `FrameBar.minimumSpan` becomes `span: 'exact' \| 'minimum' \| 'fixed'`. | `data-span` is one attribute slot, so the type mirrors the DOM it feeds. Two booleans make an illegal pair writable. |
| J7 | 3 | The Item states its own anchor: `box?: { widthPx, anchor: 'start' \| 'center' \| 'end' }`, replacing `fixedWidthPx`. | The author's Q6 principle: a variant owns how it renders, and an anchor core hardcodes is a rendering decision taken outside it. `'center'` is the spelling already on the surface (`panToDate`). |
| J8 | 3 | `harness/main.ts` and `harness/plugins.ts` switch their hand-built milestone diamonds to `diamond()`. | Each one's stated reason is *core ships no diamond*, and this build deletes that reason. Hand-building a look core ships re-derives what the library computes, which `CLAUDE.md` names an API gap. `plugins.ts`'s `buffer` and `risk` stay: core ships neither look. |
| J9 | 3 | ADR 0022's body now states Q6 and Q7. | The record is `proposed` and unbuilt (J2). `fixedWidthPx`, the start-centred sentence, and the `#286` deferral are out of it. `#286` closes here. |
| J10 | 1 | The new red-test case's name is `harness/ -> src/ boundary violation (the sealed exports map, #287)`, and it lives in `guard-red-test.mjs` as its own `checkRedTestFile` call rather than folding into an existing one. | Every other case in the file is one call per rule, named after the arrow it blocks — following that shape keeps the file's one story (`docs/04-hooks-and-ci.md` §4.1's new table reads it the same way). |
| J11 | 1 | `docs/04-hooks-and-ci.md` §4 gained a new §4.1 listing every `guard-red-test.mjs` case by name, and the old §4.1 (`Violation fixtures`) became §4.2. | The build file asked for "`docs/04-hooks-and-ci.md` §4 lists the red-test cases", but no such list existed at HEAD — only a guard-type table one level up. Adding the case list keeps `harness-public-api-only` traceable the same way `03-boundaries-and-config.md`'s new rule row is, rather than burying it in prose. No other file references the old §4.1 number. |
| J12 | 1 | `harness/data.ts`'s two `freegantt` imports needed a Prettier re-pass — the sed rewrite left one `import type {...}` block multi-line at its old width, and Prettier collapses it onto one line once the shorter specifier no longer forces the wrap. | `pnpm format:check` caught it; `pnpm exec prettier --write harness/data.ts` is the same formatter every other file in the repo already runs under, not a hand edit. |
