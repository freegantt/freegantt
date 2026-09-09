# The API after ADR 0011 — every surface it touches, with call sites

**Governing decision:** [`docs/adr/0011-…`](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md).
The plan is [`README.md`](README.md). This file is the third view: **what a caller writes**, before
and after, for every surface the ADR moves.

Written 2026-09-09. Nothing here is implemented — the ADR is `proposed` and **group A has not
started**, because [Blocking B1](README.md#b1--where-does-a-plugins-own-field-value-live) gates it.

Unanswered questions raised against this surface live in
[`api-open-questions.md`](api-open-questions.md), not here.

> **How to read the status marks.** Every block carries one.
>
> | Mark | Means |
> |---|---|
> | **Settled** | the ADR rules it and nothing open can change it. Write against this. |
> | **Open — D*n*** | a decision the author holds. The sample shows the ADR's current text; a different answer changes the call. |
> | **Probed** | the type in this block was checked with `tsc` at HEAD under `exactOptionalPropertyTypes`. |
>
> `Today` blocks are HEAD (`55f70a7`) and are shown so the delta is readable, not as a proposal.

**Two callers, two surfaces** (`plans/02`). Each section says which one it is: an **app author**
writes a Dataset and reads values; a **plugin author** registers Fields, writes a store and returns
cascades. A section marked *plugin-author surface* is not something an app author ever meets.

---

## 1. Declaring a Dataset — app author

**Settled.** One generic, no `source`, values in `data`.

### Today

```ts
const dataset = new Dataset<PlannerMeta, { owner?: string; progress?: number; phase?: number }>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },   // no dates: a zero-length span at the clock
 // { id: 't2', parentId: 'phase-1', name: 'Fit-out' },   // no dates on a 'span': InvalidInstantError
    { id: 't1', parentId: 'phase-1', name: 'Survey',
      start: '2026-01-05', end: '2026-01-09',
      meta: { owner: 'Jo', progress: 40, phase: 2 } },
  ],
  fields: [
    { key: 'owner', column: { header: 'Own', align: 'center' } },        // source defaults to meta.owner
    { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
    { key: 'ref', source: { from: 'compute', read: (entry) => rowNumber(entry.id) } },
  ],
});
```

Two generics name one set of values and may disagree — `harness/planner.ts:31` writes exactly this
shape, and its two halves differ on `critical` with nothing noticing.

### After

```ts
interface PlannerEntryData {
  owner?: string;
  progress?: number;
  phase?: number;
}

const dataset = new Dataset<PlannerEntryData>({
  timeZone: 'UTC',
  entries: [
    { id: 'phase-1', kind: 'group', name: 'Mobilise' },   // no dates, draws no bar
    { id: 't2', parentId: 'phase-1', name: 'Fit-out' },   // a 'span' may omit them too
    { id: 't1', parentId: 'phase-1', name: 'Survey',
      start: '2026-01-05', end: '2026-01-09',
      data: { owner: 'Jo', progress: 40, phase: 2 } },
  ],
  fields: [
    { key: 'owner', column: { header: 'Own', align: 'center' } },        // reads and writes data.owner
    { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
    { key: 'ref', compute: (entry) => rowNumber(entry.id) },
  ],
});
```

**Three things changed at this one call.** `meta` is `data`; the second generic is gone; no Field
declares a `source`, because **the Field key is the whole address** — `{ key: 'owner' }` reads and
writes `entry.data.owner`, and `{ key: 'start' }` reads and writes `entry.start`, because `start` is
a core key.

`phase` carries no declaration and needs none. **Declare a Field when the library has a job to do
with the value** — a type, a rollup, a column, an editor. Editing is *not* one of those jobs (§4).

---

## 2. Reading a value — app author

**Settled**, except where marked.

```ts
dataset.entries.get('t1')?.data.owner            // 'Jo' — typed by PlannerEntryData
dataset.entries.get('t1')?.data.phase            // 2 — typed, undeclared, and that is fine
dataset.entries.fieldValue('t1', 'owner')        // 'Jo' — string, from TData
dataset.entries.fieldValue('t1', 'start')        // an Instant — from CoreFieldValues
dataset.entries.fieldValue('t1', 'ref')          // the compute answer — unknown, owns no TData key
dataset.entries.fieldValue('t1', 'ownr')         // undefined — see the loss below
```

**Two doors read one value, and each answers a different question.** `entry.data.x` is the stored
bag, typed. `fieldValue(id, key)` reads *any* Field key — a core key, a `compute` Field, a plugin's.
Both stay; every comparable library publishes the same pair (§16.2).

**The by-key door keeps its type, and an earlier draft of this file said it lost it.**
`model/dataset.ts:41` types it `FieldValue<TFields, K>` at HEAD, and `FieldValue` maps over the
**generic**, never the registry — so one generic carries it across as `FieldValue<TData, K>`. What
stays `unknown` is what owns no `TData` key: a `compute` Field's answer, and a plugin's Field. That
residue is [#267](../../issues/267) and this ADR does not close it. See §16.2, which is rewritten.

**One loss, accepted:** `fieldValue(id, 'ownr')` answers `undefined` where it throws
`UnknownFieldError` today. **Read by key never throws; declare by key still does** — `gridColumns`,
`rollUp` and the editors keep their errors. The rule exists because a ChangeSet may now carry rows
naming undeclared keys (§4), so every read door has to answer one.

### Removing the harness casts

```ts
// Today — harness/planner.ts, three of these
(dataset.entries.get('t1')?.meta as PlannerMeta)?.phase

// After
dataset.entries.get('t1')?.data.phase
```

All three casts want a plain stored value and already narrow from `unknown`. Inside `layout/` and
`view/`, where `Entry` is non-generic, `entry.data.phase` still compiles and answers `unknown` under
`noUncheckedIndexedAccess` — no cast, and `entry.strat` still fails to compile.

---

## 3. Writing — `update()` merges, `add()` carries a record

**Settled.** This is the ADR's central call-site change.

### Today — the whole-bag write replaces

```ts
dataset.entries.update('t1', { meta: { owner: 'Sam' } })
// progress and phase are GONE. The destructive call is the one that reads better in English.
dataset.entries.update('t1', { cost: 7 })          // the flat form, via the TFields generic
```

### After — the patch merges

```ts
dataset.entries.update('t1', { data: { owner: 'Sam' } })
// owner changes; progress and phase are kept.

dataset.entries.update('t1', { start: '2026-01-06', data: { owner: 'Sam' } })
// one date and one consumer value, in one transaction, one changeset, one undo step.
```

**Nesting is not what made the old write destructive; replacing was.** `toProposedEdit` reads the
patch into a complete `data` record, the same way it already reads a loose date into an `Instant`.

**The bill, stated rather than hidden.** `plans/02:459` ships `update('t1', { start, cost })` —
*change start and cost*. This ADR ships `update('t1', { start, data: { cost } })` — *change start,
and a bag*. One sentence names two Fields; the other names one Field and a container. `plans/02`'s
*common case is a shorthand* principle **does not survive** for Field writes. That is
[**D5**](reviews/2026-09-09.md), and it needs a locked-spec edit (Q4).

### Removing a value

```ts
dataset.entries.update('t1', { data: { owner: undefined } })   // the key leaves the record
```

The stored record **loses the key** rather than holding `undefined`, because a record holding
`undefined` and a record missing the key serialize to one file. The changeset row is ordinary —
`{ field: 'owner', from: 'Jo', to: undefined }` — so undo restores it by replaying `from`.

### `add()` carries a record, and it does not merge

```ts
dataset.entries.add({ id: 't3', name: 'Snagging', data: { owner: 'Ali' } })
// data is a record here, not a patch: Partial<TData>. Nothing to merge onto.
```

---

## 4. Undeclared keys are writable

**Settled** (Open 1). The rule that surprises people, so it gets its own section.

```ts
// `phase` is in PlannerEntryData and declared as no Field at all.
dataset.entries.update('t1', { data: { phase: 3 } })     // succeeds
dataset.entries.fieldValue('t1', 'phase')                // 3
```

**A namespace a consumer may fill and never change is incoherent.** *Change it* is a job the
consumer has, not the library. The typo guard inside `data` goes with it, and it was already half a
guard: `add()` accepts `data: { csot: 7 }` in silence today, so only one of two doors ever caught a
misspelling.

**`UnknownFieldError` still fires at the top level of an edit**, where the schema owns the names:

```ts
dataset.entries.update('t1', { strat: '2026-01-06' })    // UnknownFieldError — top level is the schema's
dataset.entries.update('t1', { data: { strat: 1 } })     // writes. `data` is the consumer's.
```

**What this forces, and it is not optional.** An undeclared key must enter `proposedKeys`, or it
writes with no ChangeSet row, no undo step and no subscriber. Group B carries three edits that make
this real; they ship together or the ruling ships as a silent write.

---

## 5. The edit types

**Settled, and probed.** Two types, opposite rules. This is the block that was wrong twice — see
[the review §5](reviews/2026-09-09.md).

### Today

```ts
export type EntryEdit<TMeta = unknown, TFields extends Record<string, unknown> = Record<string, unknown>> =
  Partial<Omit<EntryInput<TMeta>, 'id'>> & Partial<TFields>;
```

### After

```ts
/** A patch of `data`: every key optional, and every key removable by an explicit `undefined`.
 *  There is no protected key, because `data` is `Partial<TData>` at every storage door. */
export type DataEdit<TData> = { [K in keyof TData]?: TData[K] | undefined };

type EntryEnvelope<TData> = Omit<EntryInput<TData>, 'id' | 'data'>;

/** **An edit may remove exactly what a stored Entry may lack.** Derived from `Entry`, never
 *  hand-listed: `EntryInput`'s optionality answers a different question — `kind` and `segments`
 *  are optional there only because ingest fills them. Resolves to 'parentId' | 'start' | 'end'. */
type OptionalKeysOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
type RemovableEntryKey = OptionalKeysOf<Entry> & keyof EntryEnvelope<unknown>;

export type EntryEdit<TData> = {
  [K in keyof EntryEnvelope<TData>]?: K extends RemovableEntryKey
    ? EntryEnvelope<TData>[K] | undefined
    : EntryEnvelope<TData>[K];
} & { data?: DataEdit<TData> };
```

**Why not `Partial` on either half.** Under `exactOptionalPropertyTypes` a `Partial` property
accepts an absent key and refuses an explicit `undefined` (`TS2375` / `TS2379`), so `Partial`
deletes the remove verb — including §7's un-date verb.

**Why not one shared mapped type over both.** The two halves need *opposite* rules. Inside `data`
every key is removable, because `data` is `Partial<TData>` at every storage door — a key `TData`
marks required is still a key the stored record may not hold, so protecting it would refuse a write
into a state `add({ id, name })` reaches on its own. On the envelope only three keys are removable,
because **optional at ingest is not removable by an edit**: `kind` is optional on `EntryInput` only
because ingest defaults it to `'span'`.

### The six type tests — all probed with `tsc` at HEAD

```ts
interface TaskData { owner: string; cost?: number }   // owner REQUIRED on TData

// compiles
dataset.entries.update('t1', { data: { owner: undefined } });   // removable despite being required
dataset.entries.update('t1', { start: undefined, end: undefined });
dataset.entries.update('t1', { parentId: undefined });          // move to root

// does not compile
dataset.entries.update('t1', { kind: undefined });      // ingest-optional, not edit-optional
dataset.entries.update('t1', { name: undefined });      // an Entry cannot lose its name
dataset.entries.update('t1', { segments: undefined });  // §7 already has the un-date verb
```

`data` is **omitted before it is restated**, because an intersection cannot narrow a property the
interface already declares. `id` leaves with it: an edit names its Entry at the call.

**A seventh test pins the derivation**, so a later change to `Entry`'s optionality shows up as a
failing test rather than a silent widening of what an edit may erase:

```ts
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const pinned: Same<RemovableEntryKey, 'parentId' | 'start' | 'end'> = true;   // probed
```

**`DataEdit` is exported; `EntryEnvelope` and `RemovableEntryKey` are not.** A consumer who factors
a helper over a data edit otherwise reaches for `Partial<TData>` — the one type that cannot say
*remove*:

```ts
function clearOwner<T extends { owner?: string }>(): DataEdit<T> {
  return { owner: undefined } as DataEdit<T>;
}
```

---

## 6. A derived value refuses the write, and never persists

**Settled** for the doors below. **Open — D3** for the plugin cascade (§10).

```ts
// 'phase-1' is a rolling-up kind; 'cost' rolls up.
dataset.entries.update('phase-1', { data: { cost: 999 } })
// DerivedFieldNotWritableError — 'cost' on 'phase-1' comes from the rows below it.
```

Today that write **succeeds**, emits a changeset row, enters undo — and then reverts in silence the
next time anything touches the subtree. Probed: `update('p', { cost: 999 })` stores `999`, and an
unrelated rename of a child puts it back to `10`.

**A mixed patch is refused whole, before any write:**

```ts
dataset.entries.update('phase-1', { start: '2026-01-06', data: { cost: 999 } })
// DerivedFieldNotWritableError. The start is NOT applied.
```

Applying the date and dropping the rest would leave a transaction in a state no `before*` event
described.

### `update()` refuses; `add()` drops. A patch is not a record.

```ts
dataset.entries.add({ id: 'p2', kind: 'group', name: 'Fit-out', data: { cost: 500 } })
// succeeds. `cost` is NOT stored — dropped, with one warning raised through `raiseError`.
dataset.entries.fieldValue('p2', 'cost')     // the Rollup's answer, never 500
```

That is **PATCH against PUT**. `update()` is a patch: the caller *named* `cost`, so refusing tells
them the exact thing they asked for is not theirs to set. `add()`, `new Dataset({ entries })` and
`Dataset.fromJSON()` carry **records**: an Entry's shape has a `start`, an `end` and a `data`, and
carrying them is not naming them. A file exported by another tool dates its parents, and throwing at
it would reject an ordinary import over a key the author never chose.

**One report per operation, not per value.** A Document with 500 groups over three rolling-up Fields
raises **one** warning naming the count, the Field keys and up to three Entry ids — not 1,500.

### Every door, in one table

| Door | Answer | Status |
|---|---|---|
| cell editor, bar drag | refused | already true (`view/capability.ts:119`) |
| `entries.update()` | **refused** | the change |
| `entries.add()`, `new Dataset({ entries })`, `Dataset.fromJSON()` | value **dropped**, one warning | the change |
| the extension hook (a plugin cascade) | **Open — D3** | not refused, by where the guard sits |
| autoGroup promotion | dates change owner mid-commit | unowned until this ADR |
| `toJSON()` | key **omitted** | the change |

**Promotion is the third door and nobody aimed at it:**

```ts
// 'p' was authored with dates and no children — an ordinary Entry.
dataset.entries.update('t9', { parentId: 'p' })
// autoGroup promotes 'p' to a rolling-up kind. Its authored dates are derived from this commit on,
// and no call named a derived Field.
```

---

## 7. Optional dates, on every kind

**Settled.**

```ts
dataset.entries.add({ id: 't4', name: 'Handover' })          // legal now. InvalidInstantError today.
dataset.entries.get('t4')?.start                              // undefined
```

An Entry with no span **draws no bar** and still shows its grid row.

**Dates and Segments are one biconditional:** an Entry has dates **if and only if** it holds at least
one Segment, and `start`/`end` are always the envelope of those Segments.

```ts
dataset.entries.add({ id: 'a', name: 'A', start: '2026-01-05', end: '2026-01-09' })  // mints one Segment
dataset.entries.add({ id: 'b', name: 'B', segments: [{ start: '…', end: '…' }] })    // envelope derived
dataset.entries.add({ id: 'c', name: 'C' })                                          // no dates, no Segments

dataset.entries.update('a', { start: undefined, end: undefined })  // the un-date verb: clears Segments too
```

**Two refusals stay**, and both are about an author saying two things at once:

```ts
dataset.entries.add({ id: 'd', name: 'D', start: '2026-01-05' })   // InvalidInstantError — one date only
dataset.entries.update('a', { segments: [] })                      // EmptySegmentsError (already ships)
```

The empty case is `add({})`, which names no segments rather than naming none.

### What a consumer sees on a dateless row

```ts
gantt.gridColumns = ['name', 'duration'];
// the duration cell on a dateless row is BLANK — no code is written to make it so.
// `formatDuration` already answers '' for undefined (core-fields.ts:44-45).
```

- A dateless Entry sorts **last** under every comparator, and the order is stable.
- A dateless row is **inert to a gesture**: no bar, so no grip, and no drag creates one.
- `range: 'fitDataset'` over a dataset where nothing is dated shows the range an empty dataset shows.
- An S7 link naming a dateless endpoint raises a diagnostic and draws nothing.

**A known hole, recorded rather than closed.** A dateless row cannot be dated *through the UI*: it
draws no bar, and the default `gridColumns` is `['name']`, so no cell editor reaches `start` either.
The motivating story — *add a row now, date it later* — needs a code call or a `gridColumns` change.
Dating from the timeline is its own gesture with its own capability surface, and it does not belong
in a storage redesign.

---

## 8. The Field declaration

**Settled.**

```ts
// Today
export interface Field<TValue = unknown> {
  key: FieldKey;
  source?: FieldSource;        // { from: 'entry' | 'meta' | 'compute', … } — three arms
  type?: FieldTypeName;
  rollUp?: AggregatorName;
  editable?: boolean;
  column?: …;
  // equals, compare, formatValue, parseValue, inputType
}

// After — an exclusive union. A stored Field may roll up and may be edited; a computed Field neither.
type Field<TValue = unknown> =
  | { key: FieldKey; type?: FieldTypeName; rollUp?: AggregatorName; editable?: boolean;
      compute?: never; /* equals, compare, formatValue, parseValue, inputType, column */ }
  | { key: FieldKey; compute(entry: Entry, ctx: FieldContext): TValue | undefined;
      rollUp?: never; editable?: never; /* compare, formatValue, column */ };
```

```ts
{ key: 'ref', compute: (entry) => rowNumber(entry.id) }                    // legal
{ key: 'ref', compute: (e) => 1, rollUp: 'sum' }    // ComputedFieldCannotBeWrittenError
{ key: 'ref', compute: (e) => 1, editable: true }   // ComputedFieldCannotBeWrittenError
{ key: 'ref', compute: (e) => 1, column: { header: 'Ref' } }              // legal — a read-only column
{ key: 'data' }                                      // throws at RUNTIME; the literal type-checks
```

**`{ key: 'data' }` type-checks and is refused at runtime, on purpose.** `FieldKey` is
`CoreFieldKey | (string & {})` — the brand offers the core keys to a completion list while accepting
any consumer string. Written down here so nobody later "fixes" `FieldKey` into a closed union and
flattens the brand.

**The union is a declaration-site aid, not the enforcement.** `FieldRegistry`,
`DatasetOptions.fields` and `FieldLookup` all hold bare `Field`, so excess-property checking fires
only where a literal is written. **`TValue` is a declaration-site aid too, and nothing reads it
back:** `fieldValue(id, 'ref')` answers `unknown` no matter what the `compute` arm returned. That is
[#267](../../issues/267).

### The capability that is deleted

```ts
// Today
fields: [{ key: 'start', editable: false }]        // the ONE legal core-key override

// After — deleted. The replacement is per-entry as well as per-Field:
gantt.interactions = { edit: (entry, field) => (field === 'start' ? false : undefined) };
```

A consumer declaration on a core key now falls through to the `DuplicateFieldKeyError` already
sitting there. **The reason is a silent window:** with the override in place, promoting a consumer
key to a core key in a later release relocates that Field's storage from `data.colour` to
`entry.colour` and leaves the stored values unreachable, with nothing raised.

> **Check before this lands** (ordering constraint 7): does `Field.editable: false` also refuse
> `entries.update()`? `interactions.edit` gates the cell editor and the drags only. If the two doors
> differ, the deletion needs a data-level replacement, and [#256](../../issues/256) is where it goes.

---

## 9. `FieldContext` — plugin-author surface

**Settled.**

```ts
// Today
durationOf(entry: Entry): Duration;

// After
durationOf(entry: Entry): Duration | undefined;
```

```ts
const field: Field = {
  key: 'costPerDay',
  compute: (entry, ctx) => {
    const duration = ctx.durationOf(entry);
    if (duration === undefined) return undefined;      // ← the new branch every caller gains
    return (ctx.read(entry, 'cost') as number) / (duration.value / 86_400_000);
  },
};
```

`fieldValue` and `ctx.read` already answer `| undefined`, so `CoreFieldValues` needs no change. The
Aggregator that weights by duration **skips** a dateless child rather than weighting it at zero.

---

## 10. The extension hook — plugin-author surface

**Open — D3.** The signature is settled; what a cascade's derived write *does* is not.

```ts
// The shape is unchanged: one write shape, the same object update() takes.
const extender: EditExtender = (request) => {
  const moved = request.proposed.get(entryId('t1'));
  if (!moved) return new Map();
  return new Map([[entryId('phase-1'), { start: moved.start, data: { risk: 'high' } }]]);
};

ctx.edits.wrap((next) => (request) => mergeEntryEdits(next(request), extender(request)));
```

`EditRequest` renames one member and nothing else:

```ts
export interface EditRequest {
  entries: ReadonlyMap<EntryId, Entry>;      // the pre-transaction snapshot
  entryAfterEdits(id: EntryId): Entry | undefined;
  proposed: ProposedEdits;                   // was StoredEdits — see §13
}
```

### The open half, and why it is a decision rather than a detail

The derived-value guard sits on `EntryStore.update()`, **not** in `toProposedEdit`. That placement
is the whole plugin-author story: the hook reads through the same conversion, so a refusal there
would bind a cascade, and a refusal at the public door cannot. **A plugin author learns no rule,
checks no predicate and passes no flag.**

**But exempt from the throw is not "the write survives."** Verified at HEAD:

```ts
// A cascade writing a derived cell:
return new Map([[phaseId, { start: moved.start }]]);   // phase-1 is a rolling-up kind
```

`rollup.ts:196` yields to `body.get(parentId)`, and `build-commit-change-set.ts:301` binds `body` to
the transaction **body alone** — an extender's edits reach only `merged`. So that line commits,
enters the ChangeSet, enters undo, and **the same pass overwrites it**. `foldChangeSet` does no
per-field dedupe, so both rows sit in one undo step. `toJSON` omits the value in any case.

**Two honest answers, and one has to be picked before group C:** drop the cascade's derived write
where the hook's writes are read and report once at `severity: 'warning'`; or let it stand and say
in writing that the value lives until the next pass and never reaches the file.

---

## 11. Registering from a plugin — plugin-author surface

**Settled** for the calls below. **Open — D1** for where the *values* land.

```ts
const scheduling: DatasetPlugin = {
  id: 'freegantt/scheduling',
  setup(ctx) {
    ctx.fields.registerType('percent', { column: { align: 'end' } });
    ctx.fields.registerAggregator('weightedMeanByDuration', weightByDuration);
    ctx.fields.register({ key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration' });
  },
};
```

Unchanged by this ADR, except that `register` takes a Field with **no `source`**. Registration is
still closed the moment `setup()` returns (`RegistrationClosedError`), and a plugin's declarations
still stay out of the Document (D-S5-33), because a plugin re-declares its own Fields on its next
install.

### D1 — where does a plugin's own Field value live?

**This gates group A.** `Dataset<TData>` is a lie generic the moment a plugin installs, because the
plugin's key is not in `TData`. The two live options, as calls:

**A — share `entry.data` (HEAD).**

```ts
// app author
dataset.entries.get('t1')?.data.progress     // type error — not in TaskData. Runtime: 40, then the plugin's
dataset.entries.fieldValue('t1', 'progress') // 40, unknown
gantt.gridColumns = ['name', 'progress']     // a cell edit writes entry.data
// plugin author
const extra: EditExtender = () => new Map([[phaseId, { data: { progress: 0.5 } }]]);
```

One home, so a grid edit needs no routing and a cascade writes the same `EntryEdit` as any other
write. The price: `Dataset<TaskData>` is a **known lie**, and a consumer's legacy `progress` and the
plugin's Field are one key (that is **B3/D7**, unclosed).

**C — the plugin's own store (`src/data/plugin-store.ts`, already ships).**

```ts
// app author
dataset.entries.get('t1')?.data.progress     // 40 — the consumer's OWN leftover, still undeclared
dataset.entries.fieldValue('t1', 'progress') // the plugin store, unknown
dataset.entries.update('t1', { data: { progress: 60 } })   // ← the silent split, see below
// plugin author
const store = ctx.store.reserve<{ progress?: number }>();
store.set('t1', { progress: 40 });
```

Honest generic, and **D7 closes for free** — a consumer's `progress` in `data` and the plugin's in
`plugin:freegantt/scheduling` cannot collide.

**C's cost, and the plan understated it.** It is not only `fieldValue` routing. *Every* door that
names a Field key must route: `entries.update`, the cell editor, the cascade, undo. Those doors
write `Entry` today; under C they write two stores. So the call above **type-checks and writes the
consumer's bag while the grid reads the plugin's store**, with nothing saying which write landed —
worse than A's lie, because A's fails at compile time. **If C is picked, the refusal is part of the
pick:**

```ts
dataset.entries.update('t1', { data: { progress: 60 } })
// PluginFieldNotInDataError: 'progress' is declared by 'freegantt/scheduling'.
// Read and write it with fieldValue or the grid, not through `data`.
```

C also needs `toJSON` taught that a leaf plugin value already lives in `PluginDocument`.

---

## 12. The Document — schema 5

**Settled**, except the release number (D6).

```ts
const json = dataset.toJSON();          // DatasetDocument<TData>
Dataset.fromJSON<TData>(json, { fields, plugins });
```

```jsonc
// After — schema 5
{
  "schema": 5,
  "entries": [
    { "id": "phase-1", "kind": "group", "name": "Mobilise" },
    // ↑ no start, no end, no cost: it is a rolling-up kind and those are derived.
    { "id": "t1", "parentId": "phase-1", "name": "Survey",
      "start": "2026-01-05", "end": "2026-01-09",
      "data": { "owner": "Jo", "progress": 40, "phase": 2 } }
    // ↑ `data` last; inside it, the consumer's own key order. `phase` is undeclared and round-trips.
  ],
  "fields": [ /* consumer-authored only — no core Fields, no plugin Fields, and no `source` */ ]
}
```

**Four things change in the file:** `meta` → `data`; `SerializedField.source` leaves; `start`/`end`
become optional; a rolling-up parent's rolling-up keys are omitted.

**The reader's rules do not change, and that is the point of keeping a namespace.** An unknown key
*inside* `data` is passenger data and is kept. An unknown key at the *top level* stays unknown.
`plans/02:738`'s rule survives with one word renamed.

**A Document is our save format. It is not an interchange format**, and that is now a decision. A
third-party reader sees a group with no span and no rolled-up values, and would need the same
Aggregator *implementations*, referenced by name only. Today the file carries the numbers; after, it
carries the recipe.

`toJSON → fromJSON → toJSON` is stable, because the structural test is a pure function of kind,
hierarchy and declarations. Byte-identical round-trip **of the input** is not, for a rolling-up
parent.

### Two ingest warnings

```ts
new Dataset({ entries: [{ id: 't1', name: 'A', strat: '2026-01-05' }] })
// warning through raiseError: unknown top-level key 'strat', ignored.
// (TypeScript already refuses this in a written literal; data from a server is the real case.)

new Dataset({ entries: [{ id: 't1', name: 'A', data: { start: 'x' } }] })
// warning: a key inside `data` names a core key. It stores and is then UNREACHABLE —
// fieldValue(id, 'start') answers the Entry's own start, because a core key is a core key.
```

**One rule, one loop:** a key inside `data` never names a core key, and a key at the top level is
never a consumer's.

---

## 13. Renames, and the public generics

**Settled.**

| Today | After | Where |
|---|---|---|
| `Entry.meta`, `EntryInput.meta`, `EntryDocument.meta` | `.data` | model |
| `TMeta`, and the second generic `TFields` | `TData`, one generic | everywhere |
| `Dataset<TMeta, TFields>` | `Dataset<TData>` | `api/dataset.ts` |
| `DatasetOptions<TMeta, TFields>` | `DatasetOptions<TData>` | `api/dataset.ts:54-57` |
| `DatasetPlugin<TMeta, TFields>` | `DatasetPlugin<TData>` | `api/dataset.ts:45-52` |
| `DatasetPluginContext<TMeta, TFields>` | `DatasetPluginContext<TData>` | `api/dataset.ts:45-52` |
| `Dataset.fromJSON<TMeta, TFields>` | `Dataset.fromJSON<TData>` | `api/dataset.ts:326` |
| `StoredEdit` / `StoredEdits` | `ProposedEdit` / `ProposedEdits` | ~184 occurrences, **serena** |
| `toStoredEdit` / `toStoredEdits` | `toProposedEdit` / `toProposedEdits` | `data/entry-reader.ts` |
| `EditReading.proposed` | unchanged in name, retyped | |

**All four plugin generics are published and easy to miss.** They are plugin-author surface, so they
are a published break, not an internal one.

**Why `ProposedEdit`.** This ADR gives the word *stored* to the Field union — *a **stored** Field may
roll up and may be edited* — beside the sense `storedValue` and `storedSourceOf` already carry. The
edit type then holds the word twice for two meanings, and it is the weaker claim: **a `StoredEdit`
is never stored.** It is a write nobody has applied, published as `request.proposed`.

### The deleted surface

`FieldSource` and all three arms · `Field.source` · `SerializedField.source` ·
the `meta` **core Field** (no successor — a whole bag is not a value a grid shows) ·
`DuplicateFieldSourceError` · `InvalidFieldSourceError` · `source-strategy.ts`'s strategy table ·
`normalize-source.ts` · `metaRecord` / `metaKey` / `metaSlot` ·
`#mergeCoreFieldOverride` / `#consumerOverriddenCoreKeys` / `CORE_FIELD_OVERRIDABLE_KEYS` /
`illegalCoreOverrideKey` · `reportCorrectedRollUps`.

**One successor is needed and easy to miss:** `encodeFieldDocument` keeps a `compute` Field out of
the Document *through* the strategy table — `writeStoredSource` calls `computeStrategy.serialize()`,
which answers `undefined`. Delete the table and the test goes with it. **`'compute' in field`
replaces it.**

### Errors

| Error | Fate |
|---|---|
| `DuplicateFieldSourceError`, `InvalidFieldSourceError` | **deleted** with `FieldSource` |
| `DerivedFieldNotWritableError` | **new** — `update()` on a rolling-up parent's rolling-up Field |
| `ComputedFieldCannotBeWrittenError` | **new** — `compute` beside `rollUp` or `editable` |
| `RollUpKindsWouldDropValuesError` | **new, only if D4 lands on *refuse*** |
| `PluginFieldNotInDataError` | **new, only if D1 lands on C** |
| `EmptySegmentsError` | **unchanged — it already ships** (`src/model/errors.ts:275`) |
| `UnknownFieldError` | **narrowed** — top level of an edit only; `fieldValue` stops throwing it |
| `InvalidInstantError` | **narrowed** — an unreadable date, or one date without the other |

---

## 14. `rollUpKinds`

**Open — D4.** The ADR's current text and the recommended alternative differ at the call.

```ts
dataset.rollUpKinds = ['group', 'milestone'];    // 'milestone' moves INTO the rolling-up set
```

**As the ADR is written today — destroy.** Every authored value on that kind's rolling-up Fields is
dropped, the Rollup re-runs, the flip is a transaction that emits one ChangeSet, and **it clears
undo history** — because a step whose `from` is an authored parent value would restore, on replay, a
value the new setting refuses. That makes `rollUpKinds` the **one destructive setter in the
library**.

**The recommended alternative — refuse.**

```ts
dataset.rollUpKinds = ['group', 'milestone'];
// RollUpKindsWouldDropValuesError: 3 entries hold authored values on rolling-up Fields
// ('cost', 'progress'): 'm1', 'm2', 'm7'. Clear them and set this again.
```

The consumer clears those values in their own transaction; **undo stays theirs**. This deletes the
ADR's new transaction *and* the history wipe — a smaller surface, not a bigger one.
`DatasetState.setRollUpKinds:289-293` swaps two references today and does nothing else, so both are
work the ADR gives itself.

**Flipping a kind *out* is not in question:** the last derived answer stays, now authored (D-S4-6).

---

## 15. What this ADR does *not* change

Worth stating, because a redesign this size invites the assumption that everything moved.

- **Every mutation is still one transaction → the extension hook once → one changeset.** Gestures
  included, one transaction per gesture at commit.
- **`{ from, to }` still lives on the `ChangeSet` only.** Extra field writes still use `EntryEdit` —
  the same object `update()` takes. One write shape.
- `entries.add` / `remove` / `get` / `has` / `childrenOf` keep their signatures apart from the
  generic.
- Input stays **loose** on every way in (`string` ids, `InstantInput` dates), including `get`.
- `PluginDocument`, `PluginStore`, `PluginStoreView` and `PluginStoreName` are unchanged — under D1
  option C they gain a caller, not a shape.
- `parentId` and `segments` **keep their Field declarations**. Three mechanisms read them out of the
  registry: `entryAfterEdit` iterates `CORE_FIELDS` as an allow-list, `widenSegmentsToEnvelope` gates
  on `registry.get('segments')`, and `segmentsEqual` supplies the equality rule that puts an id-only
  Segment write into the changeset (#212, ADR 0010).
- Grid columns still live on the `Gantt` and carry presentation only. **A Field is what a value *is*;
  a Grid column is where a Gantt *shows* it.**
- A zero-length span stays legal (D-S5-46 needs no rewrite — its reasons are the half-open interval
  and the resize clamp, neither of which is the `referenceDate` fill).

---

## 16. Where the code forces the API's hand

The point of this ADR is to fix the API, so a place where the *implementation* is what makes a call
site bad belongs here rather than in a follow-up. Each item names the code, what it costs a caller,
and the change that would close it. **Every claim below was probed** — two of them overturned things
this plan already asserted.

### 16.1 A false API gap: the harness cast is not the library's

**Both documents claimed this ADR deletes `harness/main.ts:89`'s `as unknown as`, and that is
wrong.** Re-probed against the real `Dataset` class inside the project's own `tsconfig`:

```ts
declare const planner: Dataset<PlannerMeta, PlannerFields>;
const bare: Dataset = planner;                                  // ✅ compiles TODAY, at HEAD
const other: Dataset<{ cost: number }, { cost: number }> = planner;   // ❌ fails, today and after
```

The widening already works with two generics and no `Partial` anywhere. The cast is not bridging a
generic to the bare type — it bridges **two different concrete instantiations**, because
`harness/hierarchy.ts:28` and `harness/data.ts:30` declare the shared global as a concrete shape:

```ts
declare global { interface Window { __dataset: Dataset<{ cost: number }, { cost: number }> } }
```

`main.ts` declares its own field shape, so it cannot satisfy that global — and it still cannot after
ADR 0011, because one generic does not make `Dataset<A>` and `Dataset<B>` interchangeable.

**The fix, and it needs no ADR:**

```ts
declare global { interface Window { __dataset: Dataset } }   // the bare type
window.__dataset = dataset;                                   // cast gone, on every page
```

Every e2e read of that global — `segments`, `start`, `end`, `id` — sits on `Entry`, outside either
page's fields. The file's own comment already says so.

**Why this matters beyond one cast.** CLAUDE.md's stop rule says harness code that compensates for
the library is an API gap, and that comment calls the cast *"evidence, not a shortcut."* It was read
as evidence, and it became a justification inside a governing document. It is evidence of a
**harness declaration choice**. The rule is still right; applying it needs the probe, or a real gap
and a false one look identical. **Suggested change:** fix the three harness declarations now, in their
own commit, ahead of group A — then group A inherits a cast-free file instead of claiming credit.

### 16.2 `fieldValue` keeps its type. The registry was never what carried it

**This section said the opposite, and it was wrong.** It claimed `fieldValue` can never be typed
because the registry erases `TValue`. The registry never carried the typing. `model/dataset.ts:41`
ships this at HEAD:

```ts
fieldValue<K extends FieldKey>(id: EntryId | string, field: K): FieldValue<TFields, K> | undefined;
```

`FieldValue` maps over the **generic**, not over the registry. So the drafted ADR does not fail to
close a standing gap — **it removes typing that ships today**, and §2 above showed
`fieldValue('t1', 'start')` answering `unknown` where it answers `Instant` now.

**The fix is a rename of a live type.** One generic carries it across unchanged:

```ts
fieldValue<K extends FieldKey>(id: EntryId | string, field: K): FieldValue<TData, K> | undefined;
```

A core key reads as its shipped type, through `CoreFieldValues`. A key `TData` declares reads as the
type the consumer wrote. Nothing about `Field<TValue>` or `ResolvedField` changes.

**What is genuinely untyped, and it is a much smaller claim.** Only a value that owns no `TData`
key: a `compute` Field's answer, and a plugin's Field. `TValue` *is* dead at the registry — §8 states
that correctly — but that erasure only reaches the `compute` arm.

**Where the generic cannot know, the caller names it.** AG Grid publishes exactly this as
`getCellValue<TValue>`, and it is the same assertion a consumer writes today, moved to where it
reads better:

```ts
const cost = dataset.entries.fieldValue<number>('t1', 'cost');    // number | undefined
```

**The `as const` route is rejected.** Inferring a key→value map from the `fields` literal needs
`as const` on every declaration, and it reintroduces a second inferred type beside the first — the
disagreement this ADR exists to delete. It also serves only the `compute` arm, which is the rarest
Field. **#267 survives as one sentence:** a `compute` Field's value type is not inferable.

### 16.3 The cascade's honesty problem is a `body`/`merged` split, not a design choice

This is D3 (§10), and it is worth seeing as a *code* defect rather than an open question.

The API story is good: the guard sits on `EntryStore.update()`, so a plugin author learns no rule
and passes no flag. What breaks it is that **two pieces of code answer "did anyone propose this
field?" from two different edit sets**:

```ts
// rollup.ts:196 — asks the transaction BODY
if (editProposesField(body.get(parentId), field)) continue;
// build-commit-change-set.ts:301 — binds `body` to the body alone; extender edits reach only `merged`
```

So the guard is defined over one set and the Rollup yields over another. A cascade is exempt from
the throw *and* silently overwritten — the worst of both, and no caller can see it.

**Suggested change:** one function answers the question, and both callers use it.

```ts
/** Did anything in this transaction — body or extender — propose this field on this entry? */
function fieldWasProposed(tx: TransactionEdits, id: EntryId, field: FieldKey): boolean;
```

Then D3 becomes a real choice between two coherent behaviours instead of a choice between one
behaviour and an accident. **Note the ordering trap:** the plan already says group C deletes the
`body`/`merged` split, so if D3 is answered *after* that deletion, the option to let a cascade's
write stand has been removed by an implementation step. Answer D3 first (ordering constraint 5).

### 16.4 `EntryInput`'s optionality answers a question nobody asked

**This one is already fixed in §5, and it is the model for the rest.** `EntryInput` uses `?` for two
unrelated reasons — *ingest fills this* (`kind`, `segments`) and *this may genuinely be absent*
(`parentId`, `start`, `end`) — so no type built from `EntryInput` alone can tell a default from an
absence. The first draft of `EntryEdit` mapped every optional key removable and let
`update(id, { kind: undefined })` compile.

**The fix was to stop reading optionality from the input type and read it from the stored one:**

```ts
type RemovableEntryKey = OptionalKeysOf<Entry> & keyof EntryEnvelope<unknown>;
```

**An edit may remove exactly what a stored Entry may lack.** Probed equal to the hand-written
`'parentId' | 'start' | 'end'`. **The general lesson, worth applying past this one type:** when two
types encode the same fact, derive one from the other. The hand-written union was correct on the day
it was written and would have gone stale the first time `Entry` changed.

### 16.5 `{ key: 'data' }` is a runtime error where a type error belongs

```ts
fields: [{ key: 'data' }]     // type-checks. Throws when the registry runs.
```

`FieldKey` is `CoreFieldKey | (string & {})`, and that brand is doing real work: it offers the core
keys to a completion list while accepting any consumer string. The cost is that the one **reserved**
key cannot be excluded at the type level, because `string & {}` swallows it.

**Suggested change: none — accept it, and the ADR should say why.** Excluding `'data'` needs either
a closed union (which kills consumer keys) or a branded `fieldKey('cost')` helper at every
declaration (which makes the common call worse to serve the rare mistake). A runtime throw for one
key is the cheaper trade. §8 already carries the warning that matters — *do not later "fix"
`FieldKey` into a closed union* — which is the failure mode this shape invites.

### 16.6 Two live rules disagree about `Field.editable`, and nobody has checked

Not a code smell so much as an unanswered question with a deadline (ordering constraint 7):
`interactions.edit` gates the cell editor and the drags. **Does `Field.editable: false` also refuse
`entries.update()`?** Group A deletes `CORE_FIELD_OVERRIDABLE_KEYS`, which is what makes
`{ key: 'start', editable: false }` expressible at all — so if the two doors differ today, the
deletion removes the only data-level spelling and leaves no replacement.

**Suggested change:** answer it with a throwaway test *before* group A, not during it. This is the
same *one question, one answer, at every door* shape as §6 (I14), at a different Field, and #256 is
where the fix belongs.

---

## Where the open decisions bite

One line each, pointing at the section a different answer would rewrite.

| | Question | Rewrites |
|---|---|---|
| **D1** | where a plugin's Field values live | §11, and the generic's honesty in §1–§2 |
| **D2** | what a `compute` Field shows on a rolling-up parent | §8 — a cell, not the store |
| **D3** | what a cascade's derived write does | §10 |
| **D4** | `rollUpKinds` refuses or destroys | §14 |
| **D5** | does *common case is a shorthand* survive | §3, and a locked-spec edit (Q4) |
| **D6** | the schema restart's release gate | §12 |
| **D7** | an S7 plugin meeting a `progress` it did not write | §11 — closes for free under C |

Full statements, recommendations and the facts behind each: [`reviews/2026-09-09.md`](reviews/2026-09-09.md) §1.
