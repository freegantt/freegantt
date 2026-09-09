# Draft fixes — the findings from `review-2026-09-08-api-surface.md`

> **Delete this file when it is vetted.** It is a draft, not a decision. Fold each accepted fix into
> `README.md` or into `docs/adr/0011-…md`, open an issue for each deferred one, then remove this file
> and the review beside it.

Written as a first draft, then reviewed once more against one question: **does this leave the API
simpler than it found it?** Each fix carries the second pass under it. Three fixes got smaller. One
whole ADR section goes away.

**What the surface gains, after the second pass**

| Added | Removed |
|---|---|
| `DerivedFieldNotWritableError` | `EntryDataSlot`, `AuthoredEntry` — first draft, dropped |
| `RollUpKindsWouldDropValuesError` | the *"one report per operation, not per value"* rule |
| `DataEdit` (the ADR's own) | the *"a destructive reconfiguration clears the history"* rule |
| | `UnknownFieldError` from `entries.fieldValue()` |

Three named errors, one exported type, and two fewer rules to teach.

---

## F1 — `EntryEdit` restates `data` by omitting it

An intersection cannot restate a property: `{ data?: TData } & { data?: DataEdit<TData> }` makes
`data` satisfy both, which refuses a partial patch and deletes the remove verb.

```ts
export type EntryEdit<TData = Record<string, unknown>> =
  Partial<Omit<EntryInput<TData>, 'id' | 'data'>> & { data?: DataEdit<TData> };
```

Put this type in the ADR beside `DataEdit`. The two only make sense as a pair.

**Second pass:** unchanged. It adds no name and deletes one wrong sentence.

## F2 — the stored record is `Readonly<Partial<TData>>`

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

**Second pass — this replaces the first draft, and the first draft was over-built.** The draft added
two public names to keep a required key required:

```ts
export type EntryDataSlot<TData> = {} extends TData ? unknown : { data: TData };  // dropped
export type AuthoredEntry<TData> = EntryInput<TData> & EntryDataSlot<TData>;      // dropped
```

That is a conditional type, a second input type, and two doors that take a different shape from
every other door — all to serve a consumer who declares a required key. `Partial` on the stored
record costs that consumer one narrow and costs everybody else nothing: the ADR's own example
declares `owner?`, `progress?` and `phase?`, so it reads identically either way. Take the smaller
one. If a consumer later proves the need, the slot type is additive.

## F3 — one address rule, at every read door

Settled Open 1 says an undeclared key may travel in a `data` patch. Three edits make that true.
They stand or fall together.

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

**c. Read by key never throws.** Once (b) lands, a ChangeSet carries rows naming undeclared keys. A
subscriber that calls `fieldValue(id, row.field)` on one then throws `UnknownFieldError` — on a row
the library itself emitted. So `entries.fieldValue` and `ctx.read` answer `entry.data[key]` for an
undeclared key, and `undefined` for a key nothing holds.

The rule to write down: **read by key never throws; declare by key still does.** `gridColumns`,
`rollUp` and the editors keep their errors, because each names a declaration. This is the ADR's own
sentence made true on the read side — the key is the whole address.

**Second pass:** unchanged, and (c) is the part to guard. Without it the ADR ships two key spaces
that disagree, and only a subscriber finds out.

## F4 — the plugin cascade drops, at the hook boundary

The refusal sits at `EntryStore.update()` so a cascade is not bound by it, so an `EditExtender` may
still propose a rolling-up parent's rolling-up Field. `rollup.ts:196` reads `body`, never `merged`,
so that write commits and the same pass overwrites it in the same commit.

Filter it where the hook's writes are read — `DatasetState.extraEditsReadingFor` → `toStoredEdits` —
and report at `severity: 'warning'`.

Widening `editProposesField` from `body` to `merged` is the tempting one-line fix, and it does not
work: group C omits a rolling-up parent's rolling-up key from the Document, so a cascade that wins
the pass writes a value that disappears on the next save. The plugin gets a lie either way.

The filter also makes D-S2-22's retirement true. The plan already claims `editProposesField`,
`RollUpEditSets.body` and the `body`/`merged` split are unreachable. With this filter they are.

**Second pass:** unchanged. Check one thing when it lands: `start` and `end` roll up, so this drops a
cascade's date write on a rolling-up parent. That is correct and already the rule — `canWrite` closes
both edges of a group today.

## F5 — every door throws, except the plugin hook

The ADR's bulk-versus-single split does not hold: `entries.add()` adds one Entry, from one call, in
the consumer's own code. The same authored value then throws or warns depending only on which method
the consumer typed.

| Door | Answer |
|---|---|
| `entries.update()` | `DerivedFieldNotWritableError` |
| `entries.add()`, `new Dataset({ entries })` | `DerivedFieldNotWritableError` |
| `fromDocument` | `DerivedFieldNotWritableError` |
| the extension hook | drop, and report once |

**Second pass — this is stricter than the first draft, and it deletes an ADR section.** The draft
split the doors by provenance: a door the consumer types at throws, a door that reads values from
elsewhere drops. That is two answers and a rule to remember. Three facts collapse it to one:

- `fromDocument` **already throws** on bad input. `read.ts:55-61` raises `InvalidInstantError` for a
  bad document date. A derived value on a rolling-up parent is the same class of fault.
- `toDocument` omits those keys, so a Document this library wrote can never carry one. A file that
  does is hand-made or corrupt, and the ADR rules that a Document is our save format rather than an
  interchange format.
- The 1,500-warning case the ADR designs for needs a 500-group hand-written file. One error naming
  the first offender serves that author better than 1,500 warnings.

So the ADR's *"One report per operation, not per value"* section goes. The one door that keeps the
drop keeps it for a reason no other door has: a third party's code is on the stack, and a throw there
breaks a user gesture that has nothing to do with the plugin.

## F6 — dates and Segments, as one biconditional

> An Entry has dates if and only if it holds at least one Segment. `start` and `end` are always the
> envelope of the Segments.

Four cases follow, and none needs its own rule:

- `add({ start, end })` mints one Segment, as today.
- `add({ segments })` with no dates derives the envelope. That is free — ingest already does it.
- `add({})` stores no dates and no Segments.
- `update(id, { start: undefined, end: undefined })` is the un-date verb, and it clears the Segments
  in the same write.

Two refusals stay: one date without the other, and `segments: []` on its own (`EmptySegmentsError`).
The second says "no bars, but keep the dates", which the biconditional makes incoherent. Add `start`
and `end` to `isOptionalEntryKey` (`field-access.ts:26`) so an explicit `undefined` deletes rather
than skips.

**Second pass:** unchanged. This is the cheapest fix in the set — one sentence in the ADR replaces
four unwritten rules, and `entry-reader.ts` already computes the envelope it needs.

## F7 — `durationOf` answers `undefined`

```ts
durationOf(entry: Entry): Duration | undefined;
```

`fieldValue` and `ctx.read` already answer `| undefined`, so `CoreFieldValues` needs no change. Two
call sites do: `weightedMeanByDuration` (`aggregators.ts:14`) skips a dateless child rather than
weighting it, and `inline-editing.ts:113` matches the new signature. Add both to group D's list —
this is plugin-author surface, and group D does not name it today.

**Second pass:** unchanged.

## F8 — `rollUpKinds` refuses a flip that would drop values

A property assignment that erases undo history is the sharpest edge in the ADR. It is also
avoidable. On a flip that adds a kind, scan that kind's entries for a stored value on any rolling-up
Field. If one exists, refuse and name it:

```ts
gantt.dataset.rollUpKinds = ['group', 'phase'];
// RollUpKindsWouldDropValuesError: 'phase' rolls up 'cost'. 3 entries hold an authored 'cost'
// ('p-1', 'p-2', 'p-7'). Clear those values, then set the kinds.
```

The consumer clears the values in a transaction they own, so the loss enters undo as their edit.
Flipping a kind **out** stays legal and loses nothing — the last derived answer becomes authored.

**Second pass — this is smaller than the ADR's version, not larger.** I read the setter:
`DatasetState.setRollUpKinds` (`dataset-state.ts:289-293`) swaps two references and does nothing
else. No pass, no ChangeSet, no undo step. So the ADR's *"the flip is a transaction"* and *"a
destructive reconfiguration clears the history"* are both **new work** the ADR gives itself, and
this fix deletes the need for either. One addition stays worth making: after a legal flip, run the
Rollup in one transaction so the screen matches the setting. That transaction is ordinary — it holds
derived writes only, and undo already reverses a Rollup cascade.

---

## The small ones

- **Schema.** Release as `6`, or write `preRelease: true`. Reusing `1`–`5` after release makes an old
  dev file readable as a future released schema, and the reader cannot tell.
- **Error names.** `ComputedFieldCannotBeWrittenError`, once. Add it, `DerivedFieldNotWritableError`
  and `RollUpKindsWouldDropValuesError` to `plans/02` §7 in the edit that deletes the two
  `FieldSource` rows.
- **Doors.** The public door is `dataset.toJSON()`. The internal function is `toDocument`. The ADR
  says `toJSON`/`fromJSON` throughout and the plan says `toDocument`/`fromDocument`; together they
  read as four doors.
- **Variance.** Probe whether `Dataset<A>` is assignable to `Dataset` before the ADR claims the
  `harness/main.ts:85` cast goes. `EntryStore`'s members are methods, so they compare bivariantly,
  and the answer is not readable off the type.
- **Gate grep.** Scope it to `src/ harness/ CONTEXT.md CLAUDE.md plans/0*.md`, and filter
  `import.meta`. `docs/adr/` is a record, and `docs/adr/0006:75` rules that a record is superseded,
  never edited.

## What the second pass changed, and what it left alone

**Smaller:** F2 lost two public type names. F5 lost a provenance rule and one of the ADR's own
sections. F8 lost a transaction, a ChangeSet and the history-clearing rule.

**Unmoved:** F1, F3, F4, F6, F7. Each of those deletes a rule or closes a hole. None adds a knob.

**Still open, and not fixed here.** F3(c) trades a typo guard on `fieldValue` for one key space. That
is the right trade, and it is a real loss: `fieldValue(id, 'ownr')` answers `undefined` where it
throws today. The guard survives everywhere a key names a declaration. If that reads as too loose
when the code lands, the answer is a dev-time warning, never a second key space.
