---
status: accepted — opened 2026-09-12, out of #292 (a review finding against the shipped
[ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md)). Evidence gathered and
recorded on the issue before this record was drafted. Accepted 2026-09-12 by the author's ruling.
decided: a variant with no `items` key draws one Item per Segment, or one Item over the whole span
when the Entry has none — today's private `produceLeafItems`, exported as `followSegments` and
made the registry default. `summary()` states its own explicit whole-entry producer, exported as
`ignoreSegments`. No new flag, and no diagnostic. This narrows
[ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md) §1 — see *What ADR 0022
keeps*.
open: nothing this record answers.
---

> **Vocabulary note, added 2026-09-17 ([#421](https://github.com/Pawel-IT/FreeGantt/issues/421)).** This record predates the `Item`→`Bar` rename ([ADR 0026](0026-the-segment-retires.md)). Read every `Item` below as `Bar`. **Do not rewrite the body.**

# A variant with no `items` key follows the data

[ADR 0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md) shipped
`EntryVariant.items` and its default. #292 found that default wrong.

## Context

An author writes the ordinary variant the docs advertise:

```ts
variants: [{ name: 'phase', when: myRule, paint: myPaint }]
```

No `items` key — the author never had a reason to write one, because `bar()`'s own doc comment
reads "an author who hand-writes `{ name, when }` gets the whole-entry default instead, and their
Segments silently vanish." A row this rule claims that carries Segments (a phase authored in
pieces, a task split across two weeks) draws **one bar over the whole envelope, gaps included**.
The author never chose that shape. A default chose it for them, and nothing said so.

The registry's own default, before this record, is the anonymous producer at
`src/layout/items/variants.ts:471`: `(entry, name) => [wholeEntryItem(entry, name)]`. `bar()` does
not carry it — `bar()` carries the *other* producer, `produceLeafItems`, precisely because the
registry default was known to be the wrong one for a Segment-bearing row. Every variant that omits
`items` gets the whole-entry default anyway, because omitting `items` is what the registry, not
`bar()`, resolves.

### The measured cost of the fix

Evidence gathered against #292 before this record was drafted, so the decision below starts from
measurements, not assumptions:

- **A parent gets exactly one Segment at ingest.** The Rollup mints one Segment on every spanning
  parent that has none (`src/data/rollup.ts:178-188`), and `produceLeafItems` falls back to one
  whole-entry Item only when an Entry has no Segments. A probe confirmed a parent with two dated
  children gets exactly one Segment, spanning the envelope. So a summary row draws one rail under
  either default — switching the default does not multiply a summary's bars.
- **The harness's `buffer`/`risk` rows carry no Segments.** `buffer` and `risk` claim
  `entry-36`/`entry-37` (`harness/plugins.ts:24-25`); only `entry-16` carries Segments in
  `fixtures/demo-dataset.ts`. Neither claimed row fires the new branch.
- **A parent may author several Segments.** `src/data/rollup.ts:151-155` records that rejecting a
  parent-authored Segment at ingest was considered and refused. So a summary row is not safe by
  construction — it is safe only because `summary()` states its own producer explicitly. Retiring
  that statement would be the real defect, not a redundancy to clean up.

So the output changes **only** for an Entry that carries two or more Segments and whose variant
states no `items` — exactly the set that silently loses data today. A single-Segment row also gets
a slightly better Item under the new default: it names its Segment, where the whole-entry default
leaves `segmentId` unset.

### Why the diamond case is not the same, and needs no flag

`fixedWidthItem` (`src/layout/items/item.ts`) returns exactly one whole-entry Item by construction.
`diamond()` choosing "one glyph over the whole Entry" **is** the variant deciding — the same
decision `summary()` makes for its rail. A caller who puts three Segments on a row a `diamond()`
rule claims has a data/configuration mismatch: a marker has no way to draw three glyphs and still be
a marker. The variant's own producer is where that question is already answered, because `items` is
already the declaration of shape, written as a function. A boolean beside it — "allow several
Segments" — could disagree with what the function actually draws, which is a second source of truth
for one fact. No such flag exists, and none is added here.

This is the line that makes #292 real and the diamond case not: #292's author never chose
whole-entry behaviour. They wrote `{ name, when, paint }`, and a default chose for them. `diamond()`'s
author chose a fixed-width marker on purpose.

## Decision

**A variant with no `items` key draws one Item per Segment, or one Item over the whole span when the
Entry has none.** The registry's default (`src/layout/items/variants.ts:471`) becomes today's
private `produceLeafItems`, exported as `followSegments`. `summary()` keeps stating its own
explicit whole-entry producer, exported as `ignoreSegments`, because a summary is one rail whatever
the Segments do — ADR 0022's own reasoning for that line stands; only the *other* default changes.

No new flag, and no diagnostic. An author who wants one bar over the whole Entry — a summary rail on
a rule of their own, a fixed-width marker, a plain "always one box" look — writes `items:
ignoreSegments` (or a producer built from `fixedWidthItem`, which already calls it for its own
purpose). Nothing is silent any more: the shape a variant draws is either the data-following default
or a producer the author named.

### The exported pair: `followSegments` / `ignoreSegments`

After this flip, an author who wants the whole-entry shape needs a first-class way to say so.
`wholeEntryItem` is a single-Item builder, not an `ItemProducer` — it does not fit `items` directly,
and `produceLeafItems` was module-private. Both become named, symmetric exports of the same shape
`ItemProducer` names:

```ts
variants: [{ name: 'phase', when: myRule, items: followSegments }]     // follow the data (also the default)
variants: [{ name: 'summary', when: (e) => e.hasChildren, items: ignoreSegments }]  // always one rail
```

Read aloud: `items: followSegments` reads "items follow segments," and `items: ignoreSegments`
reads "items ignore segments." Both sentences are true, and true of exactly what the function does.

**Why the axis is "follow the data," not "how many."** Two earlier candidates were considered and
withdrawn. `oneBarPerSegment`/`oneBarPerEntry` named the rendered result, and `CONTEXT.md`'s
**Item** entry rules that out on purpose — an explicit *Avoid: Bar*, because "an Item is what a bar
renders; `bar` is a rendering detail, not the identity." `oneItemPerSegment`/`oneItemPerEntry`
named a count instead, and the count is not a choice: `itemId(entry, segmentIndex)` builds
`${entryId}:${segmentIndex}` (`src/model/ids.ts:39`), so Item identity is keyed by segment index
and two Items for one Segment would collide. One Item per Segment is a fact of the model, so a name
built on that count would advertise a decision no author actually makes.

`followSegments`/`ignoreSegments` names the one axis the choice is really on: does this variant's
`items` follow the Entry's own Segments, or ignore them and draw one rail regardless. `Segment` is
a glossary term, neither word carries a second meaning in this codebase, and `summary()` reads
correctly in its own source too — a summary rail ignores Segments. Neither collides with `bar()`,
the plain-look factory: `bar()` reads as one word at a variant call site
(`variants: [bar(), summary(), diamond()]`), and `items: ignoreSegments` reads as a phrase at an
`items:` call site — the two are never mistaken for each other because English tells them apart at
the point either is written.

**`ignoreSegments` is deliberately blunt.** The defect this record closes is that the merged shape
— several Segments drawn as one bar — used to happen silently. An author who wants that shape now
asks for it by a name that states what it costs: it ignores Segments the Entry may carry. The name
does not soften that into something gentler, because the whole point is that this is no longer the
quiet default.

The `items` key itself keeps its name. `CONTEXT.md`'s **Variant** entry already states the seam as
"`items`: what shape it draws," and both producer names keep the word `Item` visible one hop away
at the call site (`items: followSegments`) — renaming the key would hide the term, not retire it.

Both are exported from the same surface `bar()`, `summary()`, `diamond()` and `fixedWidthItem`
already ship from (`src/layout/index.ts`, re-exported from `src/api/index.ts`). `bar()` and
`summary()` are rebuilt from these two functions, not from private copies — `bar()` carries
`followSegments`, `summary()` carries `ignoreSegments`, and the registry's default is the same
`followSegments` reference `bar()` carries.

## Rejected

**(a) Keep the whole-entry default and add a `variant-drops-segments` diagnostic.** Non-breaking,
following the shape `variant-matched-twice` and `unknown-variant-field` already set. Rejected because
the only cure it hands an author is: read the diagnostic, then write the producer that should have
been the default. It reports the defect on every affected page, forever, instead of closing it once.

**(b) Make `items` required.** Every variant states its own shape explicitly; nothing is ever
implicit. Rejected because it taxes the ordinary case the docs advertise —
`{ name, when, paint }` — for every author, including the overwhelming majority whose rows carry no
Segments and for whom the whole-entry shape and the data-following shape already agree. A required
field earns its keep only when most authors need to think about it; here, most do not.

## What ADR 0022 keeps

Nothing about `EntryVariant.items`'s shape, `ItemProducer`'s signature, or `summary()`/`diamond()`'s
existence changes. What narrows is ADR 0022 §1's account of the registry's default and of what
`bar()` was for. Its sentence "an author who hand-writes `{ name, when }` gets the whole-entry
default instead, and their Segments silently vanish" is no longer true, and neither is "`bar()` is
what prevents that" — the registry itself now prevents it, for every variant, not only for `bar()`.
ADR 0022's own body is corrected in place at that sentence, per this project's convention for an
amendment discovered before the next major version (`docs/adr/README.md`); its frontmatter now
points here for the default-items decision.

## Consequences

- `src/layout/items/variants.ts:471`'s anonymous registry default is replaced by `followSegments`.
- `summary()` gains `items: ignoreSegments` in its own returned object, stated beside its `when` and
  `paint`, matching the reasoning above: a summary is one rail whatever the Segments do, and that is
  a decision the factory states, not one the registry makes for it by omission.
- `bar()` carries `followSegments` — unchanged behaviour, renamed producer.
- A hand-written `{ name, when }` variant on a Segment-bearing row now draws one Item per Segment,
  matching `bar()`'s own floor. The only observable change in any shipped page is none: `harness`'s
  `buffer`/`risk` rows carry no Segments (measured above), and `summary()` already stated its own
  producer.
- The API surface gains two named exports, `followSegments` and `ignoreSegments`, beside
  `wholeEntryItem` and `fixedWidthItem`. `wholeEntryItem` is unchanged — it still builds one Item,
  not an `ItemProducer`, and `ignoreSegments` is its one-line wrapper.
- `docs/05-consumer-api.md` and `plans/02-public-api.md` gain the two names where they currently
  describe the whole-entry default.

## To reverse

Put the registry's default back to an inline `(entry, name) => [wholeEntryItem(entry, name)]`;
un-export `followSegments`/`ignoreSegments`; drop `items: ignoreSegments` from `summary()`'s
returned object; restore ADR 0022 §1's original sentence about `bar()`. A consumer relying on the
new default for a Segment-bearing row then silently loses those Segments again, the defect #292
opened against.
