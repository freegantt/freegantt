# A bar is an Entry

**Shipped.** Question **Q17** on [issue #421](https://github.com/Pawel-IT/FreeGantt/issues/421) was
ruled on 2026-09-17, after spike **S4** measured the cost objection away, and builds C1–C8 of
[`plans/segment-is-a-bar/README.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/segment-is-a-bar/README.md)
landed it. The design is
[`CHILD-ENTRY-DESIGN.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md),
and every ruling is in
[`BUILD-LOG.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/segment-is-a-bar/BUILD-LOG.md).
**The `Segment` *type* no longer exists** — the word does. A Segment is a Bar on a row that draws more than one Bar, and nothing stores one (`CONTEXT.md`). A bar is an ordinary child `Entry`, described in
[`CONTEXT.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/CONTEXT.md), [ADR 0025](./adr/0025-the-selection-holds-entries-not-segments.md)
(the Selection holds `EntryId`) and [ADR 0026](./adr/0026-the-segment-retires.md) (the `Segment`
type retires; `Item` becomes `Bar`). [ADR 0010](./adr/0010-the-selection-holds-segments-not-entries.md)
is superseded — its own body is not rewritten, and stays as a record of why the Selection once held
`SegmentId`.

<style>
  /* Tokens mirror `docs/architecture/diagram.md`. Kept local: that page's block also carries rules
     for boxes this page's figures do not draw. */
  .fg-bar-design-doc {
    --bg: #f1eee3;
    --bg-raised: #e9e5d6;
    --ink: #211f19;
    --muted: #67604d;
    --border: #c9c1a9;
    --border-strong: #a89f88;
    --accent: #b8541f;
    --accent-ink: #ffffff;
    --core: #276a63;
    --core-bg: rgba(39, 106, 99, 0.06);
    --new-bg: rgba(184, 84, 31, 0.07);
  }

  html[data-theme='dark'] .fg-bar-design-doc {
    --bg: #14171a;
    --bg-raised: #1c2023;
    --ink: #e9e4d6;
    --muted: #9a927c;
    --border: #363b3a;
    --border-strong: #4b514e;
    --accent: #e2874a;
    --accent-ink: #1a1006;
    --core: #5fb0a5;
    --core-bg: rgba(95, 176, 165, 0.08);
    --new-bg: rgba(226, 135, 74, 0.09);
  }

  .fg-bar-design-doc figure {
    margin: 0 0 1.5rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg-raised);
    padding: 1.25rem 1.25rem 1rem;
    overflow-x: auto;
  }

  .fg-bar-design-doc figure svg {
    display: block;
    width: 100%;
    height: auto;
    max-width: 100%;
  }

  .fg-bar-design-doc figcaption {
    font-size: 0.84rem;
    color: var(--muted);
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--border);
    line-height: 1.6;
  }

  .fg-bar-design-doc figcaption code {
    font-family: 'IBM Plex Mono', monospace;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.05em 0.35em;
    font-size: 0.88em;
    color: var(--ink);
  }

  .fg-bar-design-doc .box-name {
    font-family: 'IBM Plex Mono', monospace;
    font-weight: 600;
  }
  .fg-bar-design-doc .box-sub,
  .fg-bar-design-doc .band-title {
    font-family: 'IBM Plex Sans', sans-serif;
  }
  .fg-bar-design-doc .band-title {
    font-weight: 700;
  }
  .fg-bar-design-doc .mono {
    font-family: 'IBM Plex Mono', monospace;
  }

  /* Edge labels may cross box borders; the halo erases the border behind the glyphs. */
  .fg-bar-design-doc .lbl {
    paint-order: stroke;
    stroke: var(--bg-raised);
    stroke-width: 4px;
    stroke-linejoin: round;
  }

  @media (prefers-reduced-motion: no-preference) {
    .fg-bar-design-doc figure {
      animation: fg-bar-design-rise 0.5s ease-out;
    }
  }
  @keyframes fg-bar-design-rise {
    from {
      transform: translateY(6px);
    }
    to {
      transform: translateY(0);
    }
  }
</style>

## The claim, in one line

**Every bar on the timeline is one Entry.** A normal bar, one of several bars sharing a row, and a
summary rail are the same authored shape. Two questions decide which one a reader sees, and neither
one is stored on the Entry:

1. **Does it have children?** That decides derivation and the default look today
   ([ADR 0013](./adr/0013-what-decides-that-a-row-derives-its-values.md)).
2. **Does a rule on the row source match its parent?** That decides whether it gets a row of its own,
   or draws on its parent's row. This is the one new question. The rule reads **one parent Entry at a
   time**, so the same key answers "every parent", "the parents this Field marks" and "this one
   parent, right now".

What #421 calls a Segment becomes a regular Entry with `parentId` set. Nothing on the child marks it.

## Three bars, one shape

<div class="fg-bar-design-doc">
<figure>
<svg
viewBox="0 0 1180 520"
role="img"
aria-label="Three bands comparing authored Entries with the rows and bars they draw. Band one: a single leaf Entry draws one bar on its own row. Band two: a parent Entry and two child Entries, with a row source rule claiming the parent, draw two bars on one row under an envelope spanning both. Band three: the same three Entries with the rule off draw a summary rail on the parent's row and one bar on each child's own row."
>
<defs>
<marker id="fga1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
</defs>
<text x="30" y="30" class="box-sub" font-size="11" fill="var(--muted)">AUTHORED ENTRIES</text>
<text x="575" y="30" class="box-sub" font-size="11" fill="var(--muted)">ROWS AND BARS</text>
<!-- ============ band 1 — a normal bar ============ -->
<text x="30" y="58" class="band-title" font-size="13" fill="var(--ink)">1 — A normal bar</text>
<text x="168" y="58" class="box-sub" font-size="11.5" fill="var(--muted)">a leaf Entry, on its own row</text>
<rect x="30" y="70" width="470" height="86" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="44" y="97" class="mono" font-size="11.5" fill="var(--ink)">{ id: 't1', name: 'Design',</text>
<text x="44" y="115" class="mono" font-size="11.5" fill="var(--ink)">  start: '2026-09-01', end: '2026-09-07' }</text>
<text x="44" y="141" class="box-sub" font-size="10.5" fill="var(--muted)">no parent, no children</text>
<line x1="508" y1="113" x2="566" y2="113" stroke="var(--ink)" stroke-width="1.5" marker-end="url(#fga1)" color="var(--ink)" />
<rect x="575" y="70" width="575" height="86" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<line x1="705" y1="70" x2="705" y2="156" stroke="var(--border)" stroke-width="1" />
<text x="589" y="118" class="box-sub" font-size="11.5" fill="var(--ink)">Design</text>
<rect x="745" y="105" width="160" height="16" rx="3" fill="var(--accent)" />
<text x="754" y="117" class="mono" font-size="9.5" fill="var(--accent-ink)">t1</text>
<!-- ============ band 2 — a segment bar ============ -->
<text x="30" y="192" class="band-title" font-size="13" fill="var(--ink)">2 — A segment bar</text>
<text x="176" y="192" class="box-sub" font-size="11.5" fill="var(--muted)">a child Entry, drawn on its parent's row</text>
<rect x="30" y="204" width="470" height="124" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="44" y="229" class="mono" font-size="11.5" fill="var(--ink)">{ id: 'req-1', showDaysOnRow: true }</text>
<text x="44" y="247" class="mono" font-size="11.5" fill="var(--ink)">{ id: 'd1', parentId: 'req-1', hours: 8, start, end }</text>
<text x="44" y="265" class="mono" font-size="11.5" fill="var(--ink)">{ id: 'd2', parentId: 'req-1', hours: 4, start, end }</text>
<rect x="44" y="280" width="442" height="34" rx="5" fill="var(--new-bg)" stroke="var(--accent)" stroke-width="1" stroke-dasharray="4 3" />
<text x="56" y="301" class="mono" font-size="10.5" fill="var(--ink)">rowSource: { … childrenAsSegments: { showDaysOnRow: true } }</text>
<line x1="508" y1="266" x2="566" y2="266" stroke="var(--ink)" stroke-width="1.5" marker-end="url(#fga1)" color="var(--ink)" />
<rect x="575" y="204" width="575" height="124" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<line x1="705" y1="204" x2="705" y2="328" stroke="var(--border)" stroke-width="1" />
<text x="589" y="264" class="box-sub" font-size="11.5" fill="var(--ink)">Framing crew</text>
<text x="589" y="280" class="box-sub" font-size="10" fill="var(--muted)">12 h</text>
<line x1="745" y1="238" x2="1005" y2="238" stroke="var(--core)" stroke-width="1.2" />
<line x1="745" y1="238" x2="745" y2="245" stroke="var(--core)" stroke-width="1.2" />
<line x1="1005" y1="238" x2="1005" y2="245" stroke="var(--core)" stroke-width="1.2" />
<text x="875" y="231" text-anchor="middle" class="box-sub lbl" font-size="9.5" fill="var(--core)">req-1 start/end — written by the Rollup</text>
<rect x="745" y="256" width="130" height="16" rx="3" fill="var(--accent)" />
<text x="754" y="268" class="mono" font-size="9.5" fill="var(--accent-ink)">d1 · 8 h</text>
<rect x="905" y="256" width="100" height="16" rx="3" fill="var(--accent)" />
<text x="914" y="268" class="mono" font-size="9.5" fill="var(--accent-ink)">d2 · 4 h</text>
<text x="745" y="296" class="box-sub" font-size="10" fill="var(--muted)">one Row, three Entries — req-1 draws no bar of its own</text>
<!-- ============ band 3 — a summary bar ============ -->
<text x="30" y="364" class="band-title" font-size="13" fill="var(--ink)">3 — A summary bar</text>
<text x="183" y="364" class="box-sub" font-size="11.5" fill="var(--muted)">the same three Entries, with the rule off</text>
<rect x="30" y="376" width="470" height="124" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="44" y="401" class="mono" font-size="11.5" fill="var(--ink)">{ id: 'req-1', showDaysOnRow: true }</text>
<text x="44" y="419" class="mono" font-size="11.5" fill="var(--ink)">{ id: 'd1', parentId: 'req-1', hours: 8, start, end }</text>
<text x="44" y="437" class="mono" font-size="11.5" fill="var(--ink)">{ id: 'd2', parentId: 'req-1', hours: 4, start, end }</text>
<rect x="44" y="452" width="442" height="34" rx="5" fill="var(--core-bg)" stroke="var(--core)" stroke-width="1" stroke-dasharray="4 3" />
<text x="56" y="473" class="mono" font-size="10.5" fill="var(--ink)">rowSource: { source: 'entries', tree: true }</text>
<line x1="508" y1="438" x2="566" y2="438" stroke="var(--ink)" stroke-width="1.5" marker-end="url(#fga1)" color="var(--ink)" />
<rect x="575" y="376" width="575" height="124" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<line x1="705" y1="376" x2="705" y2="500" stroke="var(--border)" stroke-width="1" />
<line x1="575" y1="418" x2="1150" y2="418" stroke="var(--border)" stroke-width="1" />
<line x1="575" y1="459" x2="1150" y2="459" stroke="var(--border)" stroke-width="1" />
<text x="589" y="402" class="box-sub" font-size="11.5" fill="var(--ink)">Framing crew</text>
<rect x="745" y="394" width="260" height="7" fill="var(--ink)" />
<path d="M745,401 L754,401 L745,410 z" fill="var(--ink)" />
<path d="M1005,401 L996,401 L1005,410 z" fill="var(--ink)" />
<text x="601" y="443" class="box-sub" font-size="11.5" fill="var(--ink)">d1</text>
<rect x="745" y="431" width="130" height="16" rx="3" fill="var(--accent)" />
<text x="754" y="443" class="mono" font-size="9.5" fill="var(--accent-ink)">d1 · 8 h</text>
<text x="601" y="484" class="box-sub" font-size="11.5" fill="var(--ink)">d2</text>
<rect x="905" y="472" width="100" height="16" rx="3" fill="var(--accent)" />
<text x="914" y="484" class="mono" font-size="9.5" fill="var(--accent-ink)">d2 · 4 h</text>
</svg>
<figcaption>
Bands 2 and 3 hold the <strong>same three Entries</strong>. Only the row source differs. The rule
matches <code>req-1</code> in band 2, so its children draw on its row and get no rows of their own; with
the rule off they are ordinary sub-rows and <code>req-1</code> wears core's <code>summary()</code> rail.
The Rollup runs identically in both: it writes <code>req-1</code>'s <code>hours</code> cell (12) and its
<code>start</code>/<code>end</code> envelope from the two children, because a parent derives its
rolling-up Fields whatever its row source does (ADR 0013).
Band 1 is the same machinery with nothing to roll up.
</figcaption>
</figure>
</div>

## The API, in call sites

Every job below already ships, except one row.

```ts
const dataset = new Dataset({
  // Core ships `name`, `start`, `end` and `duration`. Every Field below is this consumer's own,
  // declared on the same code path as core's (ADR 0005).
  fields: [
    { key: 'showDaysOnRow', type: 'boolean' },   // the marker the row rule reads
    { key: 'hours', type: 'number', rollUp: 'sum' },
    { key: 'locked', type: 'boolean' },
  ],
  entries: [
    { id: 'req-1', name: 'Framing crew', showDaysOnRow: true },          // the row
    { id: 'd1', parentId: 'req-1', start, end, hours: 8 },               // a bar: a plain Entry
    { id: 'd2', parentId: 'req-1', start, end, hours: 4, locked: true },
    { id: 'hold', name: 'Site hold', start, end },                       // a plain row, as today
  ],
});

new Gantt({
  dataset,
  rowSource: { source: 'entries', childrenAsSegments: { showDaysOnRow: true } },
});
```

This dataset is two levels deep and draws two rows: `req-1`, carrying `d1` and `d2` as bars, and
`hold`. It names no `tree`, because no row nests under another one here. `tree` is a separate
question, and the next section answers it.

| Job | Call site | New? |
| --- | --- | --- |
| Author a bar with data | `{ id: 'd1', parentId: 'req-1', start, end, hours: 8 }` | no |
| Draw every parent's children on its row | `rowSource: { …, childrenAsSegments: true }` | **the one new key** |
| Draw one parent's children on its row | `rowSource: { …, childrenAsSegments: { showDaysOnRow: true } }`, and mark that parent | the same key |
| Open one row into sub-rows, live | `dataset.entries.update('req-1', { showDaysOnRow: false })` | no |
| Read a bar's value | `entry.read('hours')` | no |
| Name the row a bar sits on | `entry.parent()` | no |
| List a row's bars | `entry.children()` | no |
| Total bar values onto the row | `{ key: 'hours', type: 'number', rollUp: 'sum' }` | no |
| Patch one bar | `dataset.entries.update('d2', { hours: 6 })` | no |
| Add one bar | `dataset.entries.add({ parentId: 'req-1', start, end, hours: 8 })` | no |
| Remove a bar | `dataset.entries.remove('d1')` | no — several bars are several calls in one `transaction` |
| Move a bar to another row | `dataset.entries.update('d1', { parentId: 'req-2' })` | no |
| Give a bar its own look | `variants: [{ name: 'fullDay', when: { hours: 8 }, paint, css }]` | no |
| Gate a gesture for every bar | `capabilities: { resize: (entry) => entry.read('locked') !== true }` | no |
| Gate a gesture for one look's bars | `variants: [{ name: 'fullDay', when: { hours: 8 }, can: { resize: false } }]` | no |
| Read the change | `{ store: 'entries', id: 'd2', field: 'hours', from: 4, to: 6 }` | no |
| Propose a cascade | an `EditExtender` returns `EntryEdits` | no |
| Show the same bars as sub-rows | change the rule, or the value it matches | no |

**Two doors gate a gesture, and they do not compete.** A bar's capability resolves down one chain:
the consumer's own `capabilities`, then the resolved Variant's `capabilities`, then the library rule
([`plans/02`](../plans/02-public-api.md) §4.1, [ADR 0018](./adr/0018-a-variant-is-a-rule-not-an-id-list.md)).
Both doors take the same `Capabilities` shape, and a predicate at either level answers `undefined`
for "no opinion", which falls to the next level. Write `can` when the rule belongs to the look — a
milestone never resizes, wherever it is drawn. Write `capabilities` when the rule belongs to this
Gantt — a read-only board resizes nothing, whatever a row looks like.

### Set it for the whole Gantt, or for one Entry

**One key answers both.** `childrenAsSegments` takes `true` for every parent, or an `EntryRule`
(`src/layout/entry-rule.ts`) — the same `when` pattern a variant takes. The rule runs once per
parent Entry in the layout pass, so the scope of the setting is whatever the rule says:

```ts
childrenAsSegments: true                                      // every parent
childrenAsSegments: { team: 'framing' }                       // any value the data already holds
childrenAsSegments: { showDaysOnRow: true }                   // the parents the consumer marks
childrenAsSegments: (entry) => entry.children().length > 3    // whatever a predicate can ask
```

The common case is the shorthand and the long form is the expert one, as every other config key on
this library reads. `true` fits a dataset two levels deep, where every parent carries bars. Name the
level with a match or a predicate when the dataset is deeper.

**A field match names a Field and a value, and nothing else.** `{ showDaysOnRow: true }` matches every
parent whose `showDaysOnRow` Field **equals** `true`. `{ team: 'framing' }` matches every parent whose
`team` Field equals `'framing'`. The key is a Field key the `Dataset` declares — a core one, or the
consumer's own — and the comparison is that Field's own `equals`
([ADR 0018](./adr/0018-a-variant-is-a-rule-not-an-id-list.md)). A key no Field declares matches
nothing, and the miss reports once per rule and key on the `error` event
(`code: 'unknown-row-source-field'`, `severity: 'warning'`, with a `console.warn` fallback when
nothing subscribes) — the frame keeps drawing, and the typo is loud rather than silent (`J59`,
`view/gantt-shell.ts`). `unknown-variant-field` is a different code, for `variants`' own `when` (Q29
ruled against reusing it for `childrenAsSegments`). A match is equality, never "has
a value": ask that with a predicate.

**It does not name a variant, and it does not pick one.** `variants` writes the same shape in its
`when`, so an author learns one match syntax — but the two answer different questions. `when` asks
*how does this row look*; `childrenAsSegments` asks *does this parent give its children rows*. A
segmented parent's children each still resolve their own variant afterwards, and that is the per-bar
name, look and capability #421 asks for.

### `tree` is a separate question

`tree` says whether a **non-segmented** parent's children nest under it. The new rule says whether a
**segmented** parent's children become rows at all. Neither reads the other, and the fold runs in both
the flat and the tree branch of `resolveEntriesSource`:

| `tree` | `childrenAsSegments` | What a reader sees |
| --- | --- | --- |
| `false` (default) | none | every Entry is a row, flat — today's `grid` |
| `false` | matches `req-1` | `req-1` is a row with two bars; `d1`/`d2` have no rows. Still a flat `grid` |
| `true` | none | `d1`/`d2` nest under `req-1` as sub-rows, with a chevron — today's `treegrid` |
| `true` | matches `req-1` | `req-1` holds the bars; a parent the rule does **not** match still nests |

So the two-level roster names no `tree`, and gets no tree chrome for rows that do not nest. A dataset
with a grouping level above the segmented parents names it, and the next section is that case.

### A summary row above, segmented rows below

**A segmented row is an ordinary row, so an ordinary parent may sit above it.** The rule matches the
parents that carry bars; their own parent matches no rule, keeps its row, wears core's `summary()` and
rolls up as it always has:

```ts
entries: [
  { id: 'site-a', name: 'Site A' },                                      // a summary row
  { id: 'req-1', parentId: 'site-a', name: 'Framing crew', showDaysOnRow: true },
  { id: 'req-2', parentId: 'site-a', name: 'Roofing crew', showDaysOnRow: true },
  { id: 'd1', parentId: 'req-1', start, end, hours: 8 },                 // a bar on req-1's row
  { id: 'd2', parentId: 'req-1', start, end, hours: 4 },
]

rowSource: { source: 'entries', tree: true, childrenAsSegments: { showDaysOnRow: true } }
```

Three rows: `site-a` with a summary rail over everything below it, then `req-1` and `req-2`, each
carrying its own days as bars. `site-a` collapses and expands through the chevron, as a parent of
rows does today. The Rollup runs over the whole tree in one bottom-up pass, so `site-a`'s `hours`
cell totals every day under both crews. No stage of the pass asks whether a row carries bars of its
own children.

**A segmented row is a summary in the grid already.** The segmented parent's cells roll up from its
children — `req-1` reads 12 h with `d1` and `d2` on its row (ADR 0013). The one thing the design
suppresses is the parent's own bar, so `summary()`'s rail does not paint over the children it
stands for. **Core ships nothing to put one back** (Q26, ruled 2026-09-17): no rail key, no rail concept, no helper. A consumer who wants a band behind the bars writes one variant with a producer of their own, and that producer ignores the third parameter rather than reading it (Q27):

```ts
bars: (entry, variant) => [wholeEntryBar(entry, variant)],
```

This producer always draws, segmented row or not — it is what a rail actually wants. `wholeSpanUnlessSegments`, the parameter it ignores, is core's own answer of *when to suppress*; a consumer producer that wants its band to survive claiming skips that question and always paints, so it always sits behind the children's bars rather than disappearing the moment `childrenAsSegments` matches the row.

:::note One rename inside this page
The library's word for a bar was `Item` — `Item`, `ItemId`, `ItemProducer`, `EntryVariant.items`. That word also names a menu row and a grid cell, and everything downstream of it already said *bar*. It is `Bar`, now that the Segment has retired (Q28, ruled 2026-09-17), so this page writes `Bar`, `bars` and `wholeSpanUnlessSegments`. `MenuItem` and `CellItem` keep the generic word, because an item is what they are.
:::

:::note Why the key says "segments"
Read the call site aloud: "row source: entries, children as segments, where show-days-on-row is
true." The name says what the children *become*, and it discriminates — an parent no rule matches's
children draw a bar on a row of their own, and never a segment of another row's bar. The key carries
no `Row`, because it already sits on `rowSource` and a name does not repeat its own context.

**The word is free because the type is gone.** `Segment` stopped being a stored type in build C6, and
comes back in the glossary with one meaning and nothing behind it: *a child Entry drawn as one piece
of its parent's row.* Rejected: `childrenAsRowSegments`, `childrenOnParentRow`, `childrenAsBars`
(an parent no rule matches's children draw bars too), `mergeChildRows` (the mechanism, not the job) and
`splitRow` ("Split" is under *Avoid* in `CONTEXT.md`).
:::

## How it flows through the layout pass

<div class="fg-bar-design-doc">
<figure>
<svg
viewBox="0 0 1240 330"
role="img"
aria-label="A left-to-right chain of six stages: Entry array, resolveRows, produceBarsForRow, placeFrame, DomBackend sync, and fg-bar elements. Two callouts mark the only two stages where the three cases differ: the row source rule at resolveRows, and per-Entry variant resolution at produceBarsForRow. A band across the bottom states that the remaining stages are unchanged."
>
<defs>
<marker id="fga2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
</defs>
<text x="24" y="28" class="box-sub" font-size="11" fill="var(--muted)">ONE LAYOUT PASS — THE SAME PASS FOR ALL THREE BARS</text>
<rect x="24" y="46" width="178" height="66" rx="7" fill="var(--core-bg)" stroke="var(--core)" stroke-width="1.5" />
<text x="113" y="74" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">Entry[]</text>
<text x="113" y="92" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">dataset.entries.all</text>
<rect x="226" y="46" width="178" height="66" rx="7" fill="var(--new-bg)" stroke="var(--accent)" stroke-width="2" />
<text x="315" y="70" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">resolveRows()</text>
<text x="315" y="86" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">layout/rows/resolve-rows.ts</text>
<text x="315" y="100" text-anchor="middle" class="box-name" font-size="10" fill="var(--muted)">→ PlannedRow[]</text>
<rect x="428" y="46" width="178" height="66" rx="7" fill="var(--new-bg)" stroke="var(--accent)" stroke-width="2" />
<text x="517" y="70" text-anchor="middle" class="box-name" font-size="12" fill="var(--ink)">produceBarsForRow()</text>
<text x="517" y="86" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">layout/bars/produce-bars.ts</text>
<text x="517" y="100" text-anchor="middle" class="box-name" font-size="10" fill="var(--muted)">→ Bar[]</text>
<rect x="630" y="46" width="178" height="66" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="719" y="70" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">placeFrame()</text>
<text x="719" y="86" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">layout/frame.ts — the TimeScale</text>
<text x="719" y="100" text-anchor="middle" class="box-name" font-size="10" fill="var(--muted)">→ FrameBar[]</text>
<rect x="832" y="46" width="178" height="66" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="921" y="70" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">backend.sync()</text>
<text x="921" y="86" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">render/dom — keyed reconcile</text>
<rect x="1034" y="46" width="178" height="66" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="1123" y="70" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">.fg-bar</text>
<text x="1123" y="86" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">data-variant, data-state</text>
<g stroke="var(--ink)" stroke-width="1.5" color="var(--ink)">
<line x1="204" y1="79" x2="222" y2="79" marker-end="url(#fga2)" />
<line x1="406" y1="79" x2="424" y2="79" marker-end="url(#fga2)" />
<line x1="608" y1="79" x2="626" y2="79" marker-end="url(#fga2)" />
<line x1="810" y1="79" x2="828" y2="79" marker-end="url(#fga2)" />
<line x1="1012" y1="79" x2="1030" y2="79" marker-end="url(#fga2)" />
</g>
<!-- callout A -->
<polyline points="315,112 315,136 250,136 250,160" fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="4 3" />
<rect x="40" y="160" width="420" height="88" rx="7" fill="var(--new-bg)" stroke="var(--accent)" stroke-width="1.5" />
<text x="56" y="182" class="box-name" font-size="11" fill="var(--accent)">THE ONE NEW DECISION</text>
<text x="56" y="202" class="box-sub" font-size="10.5" fill="var(--ink)">A segmented parent's children fold into its own</text>
<text x="56" y="218" class="box-sub" font-size="10.5" fill="var(--ink)">row.entryIds and get no row of their own.</text>
<text x="56" y="236" class="box-sub" font-size="10" fill="var(--muted)">entries-source.ts:40 writes that list today.</text>
<!-- callout B -->
<polyline points="517,112 517,136 790,136 790,160" fill="none" stroke="var(--core)" stroke-width="1.2" stroke-dasharray="4 3" />
<rect x="580" y="160" width="420" height="88" rx="7" fill="var(--core-bg)" stroke="var(--core)" stroke-width="1.5" />
<text x="596" y="182" class="box-name" font-size="11" fill="var(--core)">ALREADY PER-ENTRY</text>
<text x="596" y="202" class="box-sub" font-size="10.5" fill="var(--ink)">The loop resolves a variant per Entry, not per</text>
<text x="596" y="218" class="box-sub" font-size="10.5" fill="var(--ink)">row — so each bar keeps its own name, props,</text>
<text x="596" y="234" class="box-sub" font-size="10.5" fill="var(--ink)">variant and capabilities. That is #421's title.</text>
<rect x="24" y="272" width="1188" height="38" rx="7" fill="var(--bg)" stroke="var(--border)" stroke-width="1.2" stroke-dasharray="5 4" />
<text x="618" y="296" text-anchor="middle" class="box-sub" font-size="11" fill="var(--muted)">Unchanged: geometry, paint, hit tests and the reconciler never learn how many Entries a Row owns. A custom row already owns several.</text>
</svg>
<figcaption>
The three bars take one path. They part at two points only, and one of the two already ships:
<code>produceBarsForRow</code> loops <code>row.entryIds</code> and calls
<code>registry.resolveFor(entry)</code> per Entry, so a shared row carries several variants today.
The new work is the fold at <code>resolveEntriesSource</code>, plus suppressing a segmented parent's
own Bar so <code>summary()</code>'s rail does not paint over its children.
</figcaption>
</figure>
</div>

### What each stage answers, per case

| Stage | A normal bar | A segment bar | A summary bar |
| --- | --- | --- | --- |
| `resolveRows` | one row, `entryIds: ['t1']` | one row, `entryIds: ['req-1','d1','d2']`; children get none | one row each; children nest at `depth + 1` |
| Row is expandable | no | no — the rule opens it, not a chevron | yes |
| `resolveFor(entry)` | `bar()`, the last resort | per child: whatever rule matches it | `summary()` matches on `entry.hasChildren` |
| `variant.bars(entry)` | one Bar over `[start, end)` | one Bar per child Entry; the parent itself produces none | one rail Bar (`wholeSpanUnlessSegments`) |
| Rollup writes | nothing | the parent's `hours`, `start`, `end` | the same three, identically |
| `placeFrame` | one `FrameBar` | one `FrameBar` per Bar | one rail `FrameBar` |
| Selection unit | the Entry | the Entry | the Entry |

## How a bar gets updated

<div class="fg-bar-design-doc">
<figure>
<svg
viewBox="0 0 1240 340"
role="img"
aria-label="A five-stage pipeline for one write: entries.update, runTransaction against a staged store, the extension hook, the Rollup, and one ChangeSet. Below it, the two ChangeSet rows the write produces: the child's own hours change and the parent's rolled-up hours change, both addressed to the entries store."
>
<defs>
<marker id="fga3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
</defs>
<text x="24" y="26" class="box-sub" font-size="11" fill="var(--muted)">EDIT ONE SEGMENT BAR'S VALUE — THE PATH EVERY MUTATION TAKES</text>
<rect x="24" y="42" width="200" height="66" rx="7" fill="var(--core-bg)" stroke="var(--core)" stroke-width="1.5" />
<text x="124" y="70" text-anchor="middle" class="box-name" font-size="11" fill="var(--ink)">entries.update('d2',</text>
<text x="124" y="86" text-anchor="middle" class="box-name" font-size="11" fill="var(--ink)">{ hours: 6 })</text>
<text x="124" y="101" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">api/dataset.ts</text>
<rect x="256" y="42" width="200" height="66" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="356" y="72" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">runTransaction()</text>
<text x="356" y="90" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">body runs on a staged store</text>
<rect x="488" y="42" width="200" height="66" rx="7" fill="var(--bg)" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="5 4" />
<text x="588" y="68" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">extension hook</text>
<text x="588" y="85" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">identityExtender by default</text>
<text x="588" y="99" text-anchor="middle" class="box-sub" font-size="9" fill="var(--muted)">called once, EntryEdits in and out</text>
<rect x="720" y="42" width="200" height="66" rx="7" fill="var(--new-bg)" stroke="var(--accent)" stroke-width="2" />
<text x="820" y="70" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">the Rollup</text>
<text x="820" y="88" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">data/rollup.ts — bottom-up</text>
<rect x="952" y="42" width="200" height="66" rx="7" fill="var(--core-bg)" stroke="var(--core)" stroke-width="1.5" />
<text x="1052" y="70" text-anchor="middle" class="box-name" font-size="12.5" fill="var(--ink)">one ChangeSet</text>
<text x="1052" y="88" text-anchor="middle" class="box-sub" font-size="9.5" fill="var(--muted)">beforeChange → change → undo</text>
<g stroke="var(--ink)" stroke-width="1.5" color="var(--ink)">
<line x1="226" y1="75" x2="252" y2="75" marker-end="url(#fga3)" />
<line x1="458" y1="75" x2="484" y2="75" marker-end="url(#fga3)" />
<line x1="690" y1="75" x2="716" y2="75" marker-end="url(#fga3)" />
<line x1="922" y1="75" x2="948" y2="75" marker-end="url(#fga3)" />
</g>
<polyline points="1052,108 1052,132 700,132 700,150" fill="none" stroke="var(--core)" stroke-width="1.2" stroke-dasharray="4 3" />
<rect x="180" y="150" width="1040" height="92" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<text x="196" y="176" class="mono" font-size="11.5" fill="var(--ink)">{ store: 'entries', id: 'd2',    field: 'hours', from: 4,  to: 6  }</text>
<text x="700" y="176" class="box-sub" font-size="10" fill="var(--muted)">← the bar's own write</text>
<text x="196" y="200" class="mono" font-size="11.5" fill="var(--ink)">{ store: 'entries', id: 'req-1', field: 'hours', from: 12, to: 14 }</text>
<text x="700" y="200" class="box-sub" font-size="10" fill="var(--muted)">← the Rollup's write onto the row (ADR 0013)</text>
<text x="196" y="228" class="box-sub" font-size="10.5" fill="var(--muted)">One store. One address shape. One undo step covering both rows.</text>
<rect x="24" y="266" width="1188" height="56" rx="7" fill="var(--new-bg)" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="5 4" />
<text x="618" y="289" text-anchor="middle" class="box-sub" font-size="11" fill="var(--ink)">A date write is the same path: the bar's own start/end change, and the Rollup rewrites the row's envelope from its children.</text>
<text x="618" y="309" text-anchor="middle" class="box-sub" font-size="11" fill="var(--muted)">One transaction per gesture, at commit. A drag preview allocates nothing and writes nothing until the pointer lifts.</text>
</svg>
<figcaption>
The envelope is the Rollup, not a second mechanism — which is what ruling Q9 already decided for
Option C, and what this design gets for free. A direct write to <code>req-1.start</code> is refused
with <code>DerivedFieldNotWritableError</code>, the refusal every parent already gives
(ADR 0013). Nothing here
branches on whether the Entry draws on its own row or its parent's: the write door never learns the
row source.
</figcaption>
</figure>
</div>

## How a bar moves to another row

<div class="fg-bar-design-doc">
<figure>
<svg
viewBox="0 0 1180 300"
role="img"
aria-label="Before and after mini-timelines. Before: the Framing crew row carries bars d1 and d2, and the Roofing crew row carries d3. After a single update setting d1's parentId to req-2, the Framing crew row carries d2 alone and the Roofing crew row carries d3 and d1."
>
<defs>
<marker id="fga4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
<path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
</marker>
</defs>
<text x="585" y="40" text-anchor="middle" class="box-name" font-size="13.5" fill="var(--ink)">dataset.entries.update('d1', { parentId: 'req-2' })</text>
<text x="30" y="78" class="box-sub" font-size="11" fill="var(--muted)">BEFORE</text>
<rect x="30" y="86" width="520" height="160" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<line x1="175" y1="86" x2="175" y2="246" stroke="var(--border)" stroke-width="1" />
<line x1="30" y1="166" x2="550" y2="166" stroke="var(--border)" stroke-width="1" />
<text x="44" y="131" class="box-sub" font-size="11.5" fill="var(--ink)">Framing crew</text>
<rect x="200" y="118" width="90" height="16" rx="3" fill="var(--accent)" />
<text x="208" y="130" class="mono" font-size="9.5" fill="var(--accent-ink)">d1</text>
<rect x="310" y="118" width="70" height="16" rx="3" fill="var(--accent)" />
<text x="318" y="130" class="mono" font-size="9.5" fill="var(--accent-ink)">d2</text>
<text x="44" y="211" class="box-sub" font-size="11.5" fill="var(--ink)">Roofing crew</text>
<rect x="310" y="198" width="110" height="16" rx="3" fill="var(--accent)" />
<text x="318" y="210" class="mono" font-size="9.5" fill="var(--accent-ink)">d3</text>
<line x1="558" y1="166" x2="612" y2="166" stroke="var(--ink)" stroke-width="1.5" marker-end="url(#fga4)" color="var(--ink)" />
<text x="620" y="78" class="box-sub" font-size="11" fill="var(--muted)">AFTER — ONE WRITE</text>
<rect x="620" y="86" width="520" height="160" rx="7" fill="var(--bg)" stroke="var(--border-strong)" stroke-width="1.5" />
<line x1="765" y1="86" x2="765" y2="246" stroke="var(--border)" stroke-width="1" />
<line x1="620" y1="166" x2="1140" y2="166" stroke="var(--border)" stroke-width="1" />
<text x="634" y="131" class="box-sub" font-size="11.5" fill="var(--ink)">Framing crew</text>
<rect x="900" y="118" width="70" height="16" rx="3" fill="var(--accent)" />
<text x="908" y="130" class="mono" font-size="9.5" fill="var(--accent-ink)">d2</text>
<text x="634" y="211" class="box-sub" font-size="11.5" fill="var(--ink)">Roofing crew</text>
<rect x="900" y="198" width="110" height="16" rx="3" fill="var(--accent)" />
<text x="908" y="210" class="mono" font-size="9.5" fill="var(--accent-ink)">d3</text>
<rect x="790" y="198" width="90" height="16" rx="3" fill="var(--accent)" stroke="var(--core)" stroke-width="2" />
<text x="798" y="210" class="mono" font-size="9.5" fill="var(--accent-ink)">d1</text>
<text x="30" y="276" class="box-sub" font-size="11" fill="var(--muted)">The id, the values, the Selection and the undo row all survive. Two Rollups re-run — the old parent's and the new one's — in the same transaction.</text>
</svg>
<figcaption>
This is the main gesture of a shift roster, and the clearest gain over a Segment type: a Segment
belongs to its Entry, so moving one between rows is a remove plus an add, and the id does not
survive. Here it is an ordinary <code>parentId</code> write, and the Hierarchy source
(ADR 0020) answers the new tree.
</figcaption>
</figure>
</div>

## What each layer sees

| Layer | What changes |
| --- | --- |
| `model/` | `Segment`, `StoredSegment`, `SegmentId`, `SegmentInput`, `SegmentEdit` and the four Segment errors are deleted. Nothing replaces them |
| `data/` | `updateSegment`, `addSegment`, `removeSegments` and the `store: 'segments'` apply path go. The Rollup already gives a parent its children's values, and that is now also the envelope |
| `layout/` | One new key on `EntriesRowSource`, one fold in `resolveEntriesSource`, and a segmented parent draws no Bar of its own. `followSegments` is deleted; `ignoreSegments` becomes `wholeSpanUnlessSegments` (ADR 0026, Q38) |
| `render/` | `FrameRow.segmentIds`, `FrameBar.segmentIds` and `Bar.segmentId` go. A bar keys on its `BarId` and names its `EntryId`, as it did before Segments |
| `view/` + `interaction/` | `selectedSegmentIds`, `segmentIdsForBar`, `segmentIdsForRow` and the `segmentIds` half of `DomTarget` and `CommandTarget` go. The Selection holds Entry ids |
| `scheduling/` (S7) | Unaffected by this page. A link to a split piece of work names the parent or one child, and the scheduling plugin rules that |

## What it costs

| Cost | Where it stands |
| --- | --- |
| **Performance** | **Measured, and the objection falls.** 10,000 bars build a frame **20% cheaper** as child Entries than as Segments. One write and one row resolution grew, and each **halves** once the Rollup stops re-deriving an index the store already memoizes (build C4). A browser measurement of the hover path is still owed |
| **A parent's own bar** | **Ruled: core draws no bar for a segmented parent.** A consumer variant may still paint a rail. Build C2 |
| **The Selection unit** | **Ruled: the Entry.** A new ADR revises [ADR 0010](./adr/0010-the-selection-holds-segments-not-entries.md). This is a build, not a delete: 16 non-test files name `segmentIds`. Build C6 |
| **A shared row's nine call sites** | `entryIds[0]` is read nine times in seven files. Seven mean "the row's subject", and a segmented row holds N+1 ids. Two mean "the first selected Entry", and a segmented row can select several. Each one is read once and fixed in build C3 |
| **Mixed children** | The rule matches the parent, so all of that parent's children draw as Segments. A parent with days on its row *and* sub-tasks below cannot be expressed. No consumer has asked for it |
| **A segment child with children of its own** | **Ruled: a segment rule is a collapse, one level deeper.** The segmented parent draws its direct children as bars; the subtree below loses its rows, and a child that derives draws one rolled-up bar — what a collapsed parent's bar does today |
| **Migration** | **Ruled: no legacy.** Segments shipped in S4 and this library has never shipped to a user, so the `segments` key is deleted outright. 59 non-test sites and 37 test files read it |
| **Copying a row with its bars** | `toInput()` copies one Entry. A subtree copy needs its own door — with or without this design |

## Read next

| Document | What it holds |
| --- | --- |
| [`plans/segment-is-a-bar/README.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/segment-is-a-bar/README.md) | The build order C1–C8, the call sites, and the nine calls the plan makes |
| [`plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/segment-is-a-bar/CHILD-ENTRY-DESIGN.md) | The ruled design, and what each former open point was ruled to be |
| [`plans/segment-is-a-bar/SPIKE-FINDINGS.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/segment-is-a-bar/SPIKE-FINDINGS.md) | Spike S4 — the numbers, the two shapes written for the subject seam, and the limits on both |
| [`plans/segment-is-a-bar/BUILD-LOG.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/segment-is-a-bar/BUILD-LOG.md) | Q1–Q44 — every ruling, and why Q17 voided Q1–Q16. Read the table at the top, not the older bodies below it |
| [ADR 0013](./adr/0013-what-decides-that-a-row-derives-its-values.md) | Why structure, not a stored word, decides that a row derives |
| [ADR 0018](./adr/0018-a-variant-is-a-rule-not-an-id-list.md) | The `when` rule this key reuses |
| [ADR 0023](./adr/0023-a-variant-with-no-items-follows-the-data.md) | `followSegments` — the default this design deletes |
| [Row source updates](./07-row-source-updates.md) | Changing one row-source setting and keeping the rest |
