# Type Alias: FieldDistributor\<TValue\>

> **FieldDistributor**\<`TValue`\> = (`value`, `parent`, `ctx`) => [`EntryEdits`](EntryEdits.md) \| `undefined`

Defined in: model/field.ts:302

What a write to a rolling-up parent's cell **means** (ADR 0013, amendment 2026-09-11). Read the
 Aggregator below backwards: the same three arguments, and the value the Aggregator produced comes
 back as the first one.

 Declaring this is how a consumer names the distribution policy — split evenly, by duration, by
 current share. With no `distribute`, that cell is read-only and the write is refused from every
 direction, batched or not (`DerivedFieldNotWritableError`): the library ships no guessed default,
 because there is none to defend.

 It writes the **children**, never the parent: nothing but the Rollup writes a rolling-up parent's
 cell, and the Rollup reads that cell back off what this returns. An edit aimed at the parent is
 refused. Each returned edit lands through the door it would have come in by, so a child that is
 itself a rolling-up parent distributes again, or refuses.

 `undefined` — or an empty map — **declines**, and the write is refused with the same error an
 absent `distribute` gives. A policy with nothing to write is a policy that says no.

## Type Parameters

### TValue

`TValue` = `unknown`

## Parameters

### value

`TValue` \| `undefined`

### parent

[`StoredEntry`](../interfaces/StoredEntry.md)

### ctx

[`RollUpContext`](../interfaces/RollUpContext.md)

## Returns

[`EntryEdits`](EntryEdits.md) \| `undefined`
