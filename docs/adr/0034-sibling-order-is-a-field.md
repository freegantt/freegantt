---
status: accepted — ruled 2026-09-23. Working material:
  [`plans/issues/open/528-sibling-index.md`](../../plans/issues/open/528-sibling-index.md).
decided: `siblingIndex` is an ordinary core Field: an integer, `editable: 'anywhere'`, storing each
  entry's place among its siblings. A sibling group is the Hierarchy source's checked tree, not the
  raw `parentId`. A write that changes a sibling group renumbers that group once, in the same
  transaction, after the Rollup — inside the staging path a `runTransaction` commit builds, and there
  only; the paths that apply a changeset already built (a direct `commitChangeSet`, `load`, undo,
  redo, replay) write `siblingIndex` rows exactly as given, with no renumber pass of their own. One
  move is therefore one undo step. `entries.all` reads depth-first tree order, siblings ordered by
  this Field. `toInput()` does not carry it — list position carries the value at construction and at
  `load` instead, which is a new, named exception to the rule that every reading door agrees on a
  committed row.
open: none.
---

# Sibling order is a Field

## Context

An Entry has no record of its place among its siblings today. The store's Map insertion order is the
only order there is, and it is an accident of how entries arrived, not a value anyone wrote:

- A move writes no ChangeSet row, so History cannot undo it.
- Undo of a remove restores order through a private side table on the store, not through the
  ChangeSet like every other written value.
- A planned diffing sync (#517) needs an ordinary Field to write the server's order onto, so a poll's
  reorder is one undo step like any other write. It has nothing to write today.

## Decision

**`siblingIndex` joins `parentId` as a core key on `StoredEntry`, always present.** It is an integer
rank among an entry's siblings, `editable: 'anywhere'`. It carries no grid column and no `rollUp`, the
same as `parentId`. A caller reads it with `entry.read('siblingIndex')`; there is no dedicated member
on `Entry`, the same as `parentId`.

**A sibling group is the Hierarchy source's checked tree, not the raw `parentId`.** Under core's own
source the two are the same thing. Under a plugin's declared source (fixed at construction, so it
never changes at runtime — the plugin-lifecycle record already settled that), the group is the
source's children, and a drop in the visible tree maps to one index in that group. Grouping by the
raw `parentId` was rejected: under a plugin tree two raw groups can mix, their indexes collide, and a
drop index stops meaning anything.

**`entries.all` becomes depth-first tree order, with each sibling group ordered by the Field.** The
Field is the only source of order from here on; the store's insertion order stops mattering to a
reader. Two equal indexes — reachable only after a fault or a hand-built replay — break their tie by
store order, and nothing throws over it. This is a visible change for any dataset whose authored list
was not already depth-first. A refused Hierarchy answer is one such fault: the write path counts a
refused entry in the group its raw answer named, while the checked tree reads it as a root, so its
index can tie with a root's. The same store-order tie-break covers it.

**Renumbering runs once, at commit, after the Rollup, and only on the staging path a `runTransaction`
commit builds.** A write records an ordered log of what moved and where, and a running count per
touched group so the log never has to rescan a whole group per call. The staging pass replays that
log over the groups as they stand at commit and emits one `siblingIndex` row for each entry whose
index actually changed; an added entity's final index rides on the entity itself, with no row of its
own. The pass owns every `siblingIndex` row it emits — it drops a write's own diff row for the same
key, because two rows for one key in one ChangeSet is not a shape the fold step allows. Several writes
in one transaction apply in call order. **The paths that apply an already-built changeset instead of
building one — a direct commit of a caller-supplied changeset, `load`, and undo/redo/replay — write
`siblingIndex` rows exactly as given, with no renumbering of their own.** A future sync or a hand-
built replay is therefore in full control of the order it writes, and an undo of one of those commits
never renumbers a second time on top of the rows it is restoring.

Renumbering on every call, instead of once at commit, was rejected on three grounds: a cascade
watching every write would see edits nobody asked for; many removes in one transaction would cost
quadratic time; and the Rollup already walks every touched entry's ancestors once per commit, which a
per-call renumber would duplicate.

**The lock applies to an explicit move only.** `update(id, { siblingIndex })` reads `editable` and the
lock rule like any other write. A sibling's own renumber row, like a Rollup row, ignores its lock —
the row is not the write it is answering. `editable: 'never'` on the Field stops every explicit move;
a reparent still appends the entry at the end of its new group, because the lock on `parentId`, not on
`siblingIndex`, governs the reparent itself.

**Undo, redo and replay carry ordinary rows, and nothing else.** The ChangeSet carries the moved
entry's row, every shifted sibling's row, and the index on each added or removed entity. Undoing those
rows restores order because `entries.all` now reads order off the Field — the store's own side table
for a removed entry's index, and the sort step that used to run on restore, both retire with nothing
to replace them.

**Ingest for the constructor and `load` shares one function**, which places every entry by its rank in
its group after the batch passes every existing soundness check. `load` will retire the function that
gave each id its position in a flat list, because that answer was never a rank within a group. A
source that decides the tree needs the entries before their order exists, so the type the source reads
has no `siblingIndex` on it — the tree never reads order, which is also what stops a source from
ever looping with the renumber pass that runs after it. Building every entry with a placeholder index
first and correcting it in a second pass was rejected, because that type would lie about a value it
does not have yet.

**A constructed or loaded list that authors a `siblingIndex` differing from its own list position has
that value dropped**, in favor of the position, and warns once per operation through the same
aggregated-report channel the Rollup's own construction-time warning already uses, with the same
`console.warn` fallback where nothing else can hear it. A value that matches its list position is not
a dropped value and is silent. It carries its own report code, separate from the Rollup's, because it
answers a different question: this is authored input that disagreed with where it landed, not a
value the Rollup owns.

**Reading an index outside its group's range throws a typed error**, naming the entry, the index
asked for, the last valid index, and the operation. It also covers a negative number, a non-integer,
and `NaN`, all read as one rule: a whole number from zero to the group's own last index. An `add` with
no index appends; an `add` with an index checks it against the group including the entry being added,
because the group is one entry larger the moment it lands.

**`toInput()` does not carry `siblingIndex`.** List position is what carries the value on every
ingest door, so the export door stays what it already is — the entry list's own order — with no
second value duplicating it. This is a deliberate, named exception to the rule that every reading door
agrees on a committed row for a declared Field: `toInput()` disagrees with `entry.read`,
`ctx.read`, the stored value and the `ChangeSet` for this one key, on purpose.

## Consequences

- **A list that was not already depth-first now loads in tree order.** A flat row source, a group row
  source, and any dataset a consumer built by hand from a non-depth-first list all read differently
  the moment this ships.
- **A ChangeSet can grow large.** Moving a root to the end of a large flat sibling group can write a
  row for every sibling. History still keeps a bounded number of steps; this is the inherent cost of
  an integer index, not a defect this record leaves open. It stays off the interaction hot path,
  because the renumber pass runs only at commit, never on the per-frame preview path a drag paints
  from.
- **A body's read of another entry's index is stale until commit.** The moved entry sees its own
  requested index immediately; siblings keep their committed value until the transaction closes, the
  same way the Rollup already works.
- **A public type changes.** The Hierarchy source's own type stops carrying `siblingIndex`, because a
  source is asked before an entry has one. This lands right after the plugin-lifecycle record shipped
  the seam it changes.
- **The store's per-entry side table for a removed entry's restore position, and the sort step it
  fed, both go away.** Order lives in exactly one place once every write set replays through it.
- **A future diffing sync writes `siblingIndex` rows itself**, computed the same way the shared ingest
  function computes them, and commits through the changeset-applying path — so a sync's own undo step
  never triggers a second renumber on top of the rows it restores.

## Out of scope

- The drag-to-reorder gesture and a drop-target vocabulary for it. This record ships the Field a
  future drag needs; it does not ship the drag.
- Fractional order keys.
- A default grid column for the Field.
- A dedicated `Entry.siblingIndex` member; `entry.read('siblingIndex')` is the one read door, the
  same as `parentId`.
