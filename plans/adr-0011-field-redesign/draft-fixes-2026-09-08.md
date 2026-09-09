# Proposed fixes — the findings from `review-2026-09-08-api-surface.md`

> **Delete this file when it is vetted.** It is a proposal, not a decision. Fold each accepted fix
> into `README.md` or into `docs/adr/0011-…md`, open an issue for each deferred one, then remove this
> file and the review beside it.

Nine fixes. Each one is stated once, in the shape it should land, with the place it lands. Every fix
was checked against one question: **does this leave the API simpler than it found it?** Three got
smaller under that question, one reversed, and one is new.

**What the surface gains**

| Added | Removed |
|---|---|
| `DerivedFieldNotWritableError` | `UnknownFieldError` from `entries.fieldValue()` |
| `RollUpKindsWouldDropValuesError` | the *"a destructive reconfiguration clears the history"* rule |
| `DataEdit` (the ADR's own) | two type names the first draft proposed, then dropped |

Two named errors, one exported type, and no new config key.

---

## F1 — `EntryEdit` restates `data` by omitting it

**Lands in:** the ADR, beside `DataEdit`. Group A.

An intersection cannot restate a property. `{ data?: TData } & { data?: DataEdit<TData> }` makes
`data` satisfy both halves, which refuses a partial patch and deletes the remove verb.

```ts
export type EntryEdit<TData = Record<string, unknown>> =
  Partial<Omit<EntryInput<TData>, 'id' | 'data'>> & { data?: DataEdit<TData> };
```

The two types only make sense as a pair, so publish them as a pair.

## F2 — the stored record is `Readonly<Partial<TData>>`

**Lands in:** the ADR's *"The internal `Entry` describes its own object"* consequence. Group A.

`EntryInput.data?: TData`, `Entry.data: Readonly<TData>` and an ingest fill of `{}` cannot all be
true. `Dataset<{ owner: string }>` then reads `entry.data.owner` as `string` while it holds
`undefined`.

```ts
export interface Entry<TData = Record<string, unknown>> {
  // …
  /** Always present. Ingest fills `{}`, so every key reads as "may be absent" — the library writes
   *  this record, and it cannot promise a key the consumer never wrote. */
  data: Readonly<Partial<TData>>;
}
```

A conditional slot type (`{} extends TData ? … : …`) and a second input type would keep a required
key required. Both were drafted and dropped: they add two public names and a second shape at two
doors, all for the consumer who declares a required key. `Partial` charges that consumer one narrow
and charges nobody else anything — the ADR's own example declares `owner?`, `progress?` and
`phase?`, which reads identically either way. The slot type stays additive if a consumer ever proves
the need.

## F3 — one address rule, at every read door

**Lands in:** group B, as three list items.

Settled Open 1 says an undeclared key may travel in a `data` patch. Three edits make that true, and
they stand or fall together.

**a. Build the proposed set from inside the namespace.** `toEditReading` seeds it from the edit's
top-level keys (`entry-reader.ts:483`), and the only top-level key now is `data`, which names no
Field:

```ts
const proposed = new Set<string>(Object.keys(edit).filter((key) => key !== 'data'));
for (const key of Object.keys(edit.data ?? {})) proposed.add(key);
```

**b. Give `diffEdit` a second pass.** Its stated-keys branch walks `registry.all`
(`change-set.ts:75-81`), so a proposed key the registry does not hold is never visited. Keep the
registry walk for row order, then drain the rest:

```ts
for (const key of authored) {
  if (registry.get(key)) continue;
  emit(key, current.data[key], next.data[key]);
}
```

**c. Read by key never throws.** After (b) a ChangeSet carries rows naming undeclared keys. A
subscriber that calls `fieldValue(id, row.field)` on one throws `UnknownFieldError` today — on a row
the library itself emitted. So `entries.fieldValue` and `ctx.read` answer `entry.data[key]` for an
undeclared key, and `undefined` for a key nothing holds.

The rule to write down: **read by key never throws; declare by key still does.** `gridColumns`,
`rollUp` and the editors keep their errors, because each of those names a declaration.

## F4 — the plugin cascade drops, at the hook boundary

**Lands in:** group C's door table, as a fifth row.

The refusal sits at `EntryStore.update()` so a cascade is not bound by it. So an `EditExtender` may
still propose a rolling-up parent's rolling-up Field. `rollup.ts:196` reads `body`, never `merged`,
so that write commits, enters undo, and the same pass overwrites it in the same commit.

Filter it where the hook's writes are read — `DatasetState.extraEditsReadingFor` → `toStoredEdits` —
and report once at `severity: 'warning'`.

Widening `editProposesField` from `body` to `merged` is the tempting one-line fix, and it does not
work: group C omits a rolling-up parent's rolling-up key from the Document, so a cascade that wins
the pass writes a value that disappears on the next save. The plugin gets a lie either way.

The filter also makes D-S2-22's retirement true. The plan already claims `editProposesField`,
`RollUpEditSets.body` and the `body`/`merged` split are unreachable. With this filter, they are.

`start` and `end` roll up, so this also drops a cascade's date write on a rolling-up parent. That is
correct, and it is already the rule for a person: `canWrite` closes both edges of a group today.

## F5 — a **patch** that names a derived Field throws; a **record** that carries one drops

**Lands in:** the ADR's *"`update()` refuses; `add()` drops"* section — the behaviour stands, the
reason changes.

| Door | Answer | Why |
|---|---|---|
| `entries.update()` | `DerivedFieldNotWritableError` | a patch names the Field. Refusing answers the exact thing the caller asked for |
| `entries.add()`, `new Dataset({ entries })`, `fromDocument` | drop, report once | a record carries every key of an Entry's shape. Nobody aimed at this Field |
| the extension hook | drop, report once | a patch, but a third party's code is on the stack — a throw there breaks a user gesture the plugin has nothing to do with |

**This reverses what the review recommended, and the review was wrong.** Finding 9.1 said `add()`
should throw because it adds one Entry rather than a bulk import. Three facts kill that:

- `start` rolls up `'min'` and `end` rolls up `'max'` (`core-fields.ts:74,85`). So **dates on a
  group are a derived value**, and authoring them is not an exotic mistake — every plan exported
  from another tool carries summary dates on its parents.
- `new Dataset({ entries })` is the door those rows arrive at. A throw there rejects a whole dataset
  over values the Rollup would have reproduced anyway.
- The repo's own `fixtures/hierarchy-dataset.ts:14-20` authors `plain-parent` with dates, and that
  Entry becomes a rolling-up parent the moment the harness reparents a child onto it — see F9.

Bulk-versus-single is the wrong axis, because `add()` is not bulk. Patch-versus-record is the right
one, and it is one sentence: **name a Field and the library answers; hand it a record and the library
keeps what is yours.** The ADR's *"one report per operation, not per value"* rule stays, and it is
what keeps a 500-group import to one warning.

## F6 — dates and Segments, as one biconditional

**Lands in:** group D, as its first list item.

> An Entry has dates if and only if it holds at least one Segment. `start` and `end` are always the
> envelope of the Segments.

Four cases follow, and none needs a rule of its own:

- `add({ start, end })` mints one Segment, as today.
- `add({ segments })` with no dates derives the envelope. That is free — ingest already computes it.
- `add({})` stores no dates and no Segments.
- `update(id, { start: undefined, end: undefined })` is the un-date verb, and it clears the Segments
  in the same write.

Two refusals stay: one date without the other, and `segments: []` on its own (`EmptySegmentsError`).
The second says "no bars, but keep the dates", which the biconditional makes incoherent. Add `start`
and `end` to `isOptionalEntryKey` (`field-access.ts:26`), so an explicit `undefined` deletes the key
rather than skipping it.

## F7 — `durationOf` answers `undefined`

**Lands in:** group D's list. This is plugin-author surface, and group D does not name it today.

```ts
durationOf(entry: Entry): Duration | undefined;
```

`fieldValue` and `ctx.read` already answer `| undefined`, so `CoreFieldValues` needs no change. Two
call sites do: `weightedMeanByDuration` (`aggregators.ts:14`) skips a dateless child rather than
weighting it, and `inline-editing.ts:113` matches the new signature.

## F8 — `rollUpKinds` refuses a flip that would drop values

**Lands in:** the ADR's *"Changing `rollUpKinds` drops the values"* consequence, which shrinks.

A property assignment that erases undo history is the sharpest edge in the ADR, and it is avoidable.
On a flip that adds a kind, scan that kind's entries for a stored value on any rolling-up Field. If
one exists, refuse and name it:

```ts
gantt.dataset.rollUpKinds = ['group', 'phase'];
// RollUpKindsWouldDropValuesError: 'phase' rolls up 'cost'. 3 entries hold an authored 'cost'
// ('p-1', 'p-2', 'p-7'). Clear those values, then set the kinds.
```

The consumer then clears the values in a transaction they own, so the loss enters undo as their own
edit. Flipping a kind **out** stays legal and loses nothing: the last derived answer becomes
authored.

This is smaller than the ADR's version, not larger. `DatasetState.setRollUpKinds`
(`dataset-state.ts:289-293`) swaps two references and does nothing else — no pass, no ChangeSet, no
undo step. The ADR's *"the flip is a transaction"* and *"a destructive reconfiguration clears the
history"* are both new work it gives itself, and this fix removes the need for either. One addition
is still worth making: after a legal flip, run the Rollup in one transaction, so the screen matches
the setting.

## F9 — autoGroup promotion is a door, and group C does not list it

**Lands in:** group C, as a new list item and an acceptance check.

`hierarchy.ts` promotes a `'span'` to `'group'` in the same commit it gains its first child
(D-S4-17, default on). So a `'span'` that authored its own dates becomes a rolling-up parent in a
commit that was aimed at a different Entry. Nobody wrote a derived value, and there is nothing to
refuse — but the values change owner.

`fixtures/hierarchy-dataset.ts:14-20` is the live example. `plain-parent` authors
`2026-03-01`/`2026-03-05` and is the harness's reparent target.

State the consequence rather than discovering it:

> Promotion is the third way an Entry becomes a rolling-up kind, beside `kind` at ingest and a
> `rollUpKinds` flip. Its dates become derived at that commit, and the Rollup recomputes them from
> the new child. A parent that later loses its last child keeps no dates and draws no bar.

That last sentence is a behaviour change. Today a childless rolling-up parent keeps the last value
the Rollup wrote (`rollup.ts:184` skips it), and the ADR makes the Document omit it, so the
store and a reload disagree until #270 lands. Reparenting the only child away from `plain-parent` is
the fastest way to see it, and it belongs in group C's acceptance evidence.

---

## The small ones

- **Schema.** Release as `6`, or write `preRelease: true`. Reusing `1`–`5` after release makes an old
  dev file readable as a future released schema, and the reader cannot tell the difference.
- **Error names.** `ComputedFieldCannotBeWrittenError`, once. Add it, `DerivedFieldNotWritableError`
  and `RollUpKindsWouldDropValuesError` to `plans/02` §7 in the edit that deletes the two
  `FieldSource` rows.
- **Doors.** The public door is `dataset.toJSON()`; the internal function is `toDocument`. The ADR
  says `toJSON`/`fromJSON` throughout and the plan says `toDocument`/`fromDocument`, so together they
  read as four doors.
- **Variance.** Probe whether `Dataset<A>` is assignable to `Dataset` before the ADR claims the
  `harness/main.ts:85` cast goes. `EntryStore`'s members are methods, so they compare bivariantly,
  and the answer is not readable off the type.
- **Gate grep.** Scope it to `src/ harness/ CONTEXT.md CLAUDE.md plans/0*.md`, and filter
  `import.meta`. `docs/adr/` is a record, and `docs/adr/0006:75` rules that a record is superseded,
  never edited.

## What review changed in this draft

- **F2 got smaller.** Two public type names went, and a conditional type with them.
- **F8 got smaller.** It now deletes an ADR transaction, a ChangeSet and the history rule, rather
  than adding a scan on top of them.
- **F5 reversed.** The review asked `add()` to throw. `start` and `end` roll up, so that would
  reject any imported plan that dates its parents. The ADR's behaviour stands; its *reason* changes
  from bulk-versus-single to patch-versus-record.
- **F9 is new.** It came out of F5's evidence: `plain-parent` in the repo's own fixture becomes a
  rolling-up parent through promotion, which is a door the plan never lists.
- **F1, F3, F4, F6, F7 stand as written.** Each closes a hole or deletes a rule. None adds a knob.

**One open loss, not fixed here.** F3(c) trades a typo guard for one key space:
`fieldValue(id, 'ownr')` answers `undefined` where it throws today. That trade is forced — after
F3(b) the library emits rows naming undeclared keys — and the guard survives wherever a key names a
declaration. If it reads as too loose once the code lands, the answer is a dev-time warning, never a
second key space.
