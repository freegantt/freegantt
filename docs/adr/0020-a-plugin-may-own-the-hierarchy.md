---
status: accepted — built and green on 2026-09-12 (`verify:full PASS — all 16 checks green, test:e2e included`). Opened 2026-09-11, out of a design session on the plugin variant surface. The working material is in `plans/row-redesign/`, and the build is `plans/row-redesign/build/build-4-0020-hierarchy.md`.
decided: one seam, not two — a plugin states the parent of an Entry, and the Rollup follows (2026-09-11, from the author's "from the data side it should be able to change how our rollup and parents/children work"). The source reads a `StoredEntry`, never the live `Entry`. Grouping stays a row source and does not come here.
open: nothing. The seam is the **hierarchy source**, set through `ctx.hierarchy.setSource` (2026-09-11, author's ruling — `Q3` — with the namespace added on a review finding the same day), and it sits beside `ctx.edits.setExtender` on the `data` half. The cost question is answered in *What core keeps*, not open: the source is a pure function of one Entry, so an open transaction keeps its O(children + edits) shape.
---

# A plugin may own the hierarchy

**Lands after [0017](0017-the-entry-answers-questions-about-itself.md), [0018](0018-a-variant-is-a-rule-not-an-id-list.md) and [0019](0019-one-plugin-one-install-site.md).** 0017 gives every reader one door onto the tree. This ADR is what makes that door worth having.

## Context

[ADR 0018](0018-a-variant-is-a-rule-not-an-id-list.md) resolves a variant from a rule and stores nothing. So a variant can never make a row claim to be a parent: a rule paints the row, and children alone decide what it derives. A row that paints as a summary and rolls nothing up would say one thing while the data says another.

That ruling leaves a real need with no door. An app can have a hierarchy core cannot see: a WBS in another system, a parent named by a `props` key, a level the app wants skipped. Today the only tree core knows is `parentId`.

**Core reads that one stored field in six places, and four of them are reads of the tree:**

| Site                                                         | What it asks                                     |
| ------------------------------------------------------------ | ------------------------------------------------ |
| `data/entry-store.ts` `#byParent`                            | the committed child index                        |
| `data/entry-store.ts` `#childrenOfWriteSet`                  | the same index, overlaid with the open write set |
| `data/rollup.ts:46,52`                                       | which parents this edit makes stale              |
| `data/entry-tree.ts:56,67,76,86`                             | children, child count, depth, ancestors          |
| `layout/rows/entries-source.ts:16`                           | which row nests under which                      |
| `layout/frame-memory.ts:77`, `view/tree-collapse.ts:111,153` | which rows are parents, and what collapses       |

Each one re-derives the tree from the field. Nothing can change the answer for all of them at once. `data/entry-reader.ts:229,567` also names `parentId`, but those two **write** the stored value and stay as they are.

## Decision

**A data plugin may state the parent of an Entry. Core owns everything downstream of that answer.**

```ts
type HierarchySource<TProps = Record<string, unknown>> = (
  entry: StoredEntry<TProps>,
) => EntryId | string | undefined;
```

One entry in, one parent id out. Core's own source is `(entry) => entry.parentId`, registered like any other, with no special claim on the seam (D-S5-23). A plain `string` is a legal answer, the way it is on every other way into the library, and core brands it once (`BUILD-LOG` `J51`).

A plugin composes, the same way an `EditExtender` composes — it receives the current occupant and may call it:

```ts
definePlugin({
  id: 'demo.phases',
  data(ctx) {
    ctx.fields.register({ key: 'phaseId' });
    // Which Entry is the parent of this one?
    ctx.hierarchy.setSource<PhaseProps>((next) => (entry) => entry.props.phaseId ?? next(entry));
  },
});
```

That call reads: _the phase id when there is one, otherwise whatever the next source says._ `setSource` takes the props shape, so `entry.props` carries the key with no cast (`BUILD-LOG` `J52`); a key a plugin reads is a key a plugin declares (ADR 0011), which is what `ctx.fields.register` above is for. An Entry named by a `phaseId` becomes a parent. It has children, so it derives, it rolls up, and step 3 of ADR 0018 paints it as a summary — because it **is** one, not because a stored word said so.

## One seam, not two

The author asked for two things: the rollup, and parents/children. This ADR ships one seam, because the second is already the first.

- **Which values a parent takes from its children** is the Aggregator, and that is pluggable now — registered by name, per Field, never inline.
- **How a value spreads back down** is the `FieldDistributor`, also pluggable now.
- **Which Entries roll into which** is the only part with no seam. That is the tree.

Derivation follows children ([ADR 0013](0013-what-decides-that-a-row-derives-its-values.md), kept). The Rollup follows derivation. So a plugin that changes the tree has changed the Rollup, and the two can never disagree. A second knob could let them.

## The source reads a `StoredEntry`, never the live `Entry`

This is the one hard rule in the seam, and it falls out of [0017](0017-the-entry-answers-questions-about-itself.md).

The live `Entry` answers `children()`, `parent()`, `depth` and `descendants()`. Every one of those answers is built **from** the hierarchy source. A source that received a live `Entry` would ask the question it exists to answer.

So the signature takes `StoredEntry`. The seam that builds the tree is the one seam in the library that cannot consume it. 0017's split is what makes the rule statable at all: before it, there was one type and no way to say which half a seam gets.

## What core keeps

**Core inverts the answer.** A source states one parent per Entry. Core builds the child index from that, so nothing can produce two parents for one Entry, and sibling order stays the order the Entries are in.

**Core refuses a cycle.** `ParentCycleError` (`entry-store.ts`) guards a `parentId` write, and keeps that job — `parentId` is still stored and still written. A second guard sits on the walk, because a cycle can now arrive from a source instead of from a write. A cyclic answer raises a Fault with `by: 'plugin'` (code `hierarchy-cycle`), and the Entry whose answer **closes** the loop is read as a root, so one link is dropped rather than the whole chain (`BUILD-LOG` `J54`). A refusal never throws: a Gantt whose plugin answers badly still draws.

**Core keeps the cost shape.** The source is a pure function of one Entry, so `#childrenOfWriteSet` swaps one property read for one call and stays O(children + edits). A source that needed the whole entry list would make it O(dataset) per query — the O(n²) shape finding S1 (#212) already killed once.

**An unknown parent id is a root.** The source may name an id no Entry holds. Core treats that Entry as a root and reports it once per revision (code `unknown-parent`), never per read. The committed child index runs the whole check once per revision; a walk inside an open transaction guards against a loop instead of searching for one, so the cost shape above holds.

**`parentId` is still stored, and `update()` still writes it.** A source that ignores the field is a plugin taking the tree over on purpose. Core does not delete the field to match, and does not warn on a write to it.

## Grouping does not come here

`{ source: 'group', groupBy }` is a **row source**, and it stays one. A group header is not an Entry, it holds no values, and it does not roll up. `CONTEXT.md`'s Entry glossary already lists "grouped entry" under _Avoid_ for this reason.

The line is the author's: layout is not coupled to data, and this seam does not move it. A hierarchy source answers with an `EntryId` — it can only ever name an Entry that exists. It cannot invent a row. Rows stay `layout/`'s answer, and `layout/` still imports `time/` and `model/` only (`.dependency-cruiser.cjs:63`).

## Consequences

**Three read sites stop reading `.parentId`, and a fourth is this ADR's own.** `layout/rows/entries-source.ts:16`, `layout/frame-memory.ts:77` and `view/tree-collapse.ts:111,153` ask the live `Entry` instead — `entry.parent()`, `entry.children()`, `entry.hasChildren` — and that work is 0017's. This ADR is the reason it must land completely: a site left reading the field disagrees with the rest of the library the moment a plugin installs.

**The fourth site cannot move with them, and it belongs here.** `data/rollup.ts`'s `collectTouchedIds` finds the **former** parent of a row that moved, out of the `entries` map it was handed. A live `parent()` answers the new one, so the old parent never rolls up again and a move leaves a stale aggregate behind. It asks the **source**, applied to the pre-edit row — which is a question only this ADR can answer, because before it there is no source to ask. It asks for **every** edit rather than only for one that named `parentId`: a source reading a `props` key moves a row with no `parentId` write to spot, and a write-shape check would miss it (`BUILD-LOG` `J53`). `WriteSet.stagedParents` reads the source for the same reason.

**`entry-tree.ts`'s walks take the source.** `childIdsByParent`, `depthOf` and `ancestorsOf` each read `parentId` directly today. The fourth, `childCountByParent`, had no caller anywhere and was deleted rather than threaded (`BUILD-LOG` `J55`).

**This is an expert door.** An app author never meets it. It sits on the Dataset half of `definePlugin` ([0019](0019-one-plugin-one-install-site.md)), beside `ctx.edits.setExtender`, and the two read the same way: a namespace, then the verb.

**A childless Entry can be made to paint as a summary two ways** — a variant of its own under ADR 0018, or this. The first changes the paint and claims nothing. The second changes the data's own answer, so the Rollup follows. That difference is exactly what 0018 protects when it refuses to store a variant.
