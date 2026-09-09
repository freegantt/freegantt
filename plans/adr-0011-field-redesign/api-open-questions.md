# Open questions on the API

Questions raised against the API in [`api.md`](api.md) that have **no answer yet**.

This file holds the question only — no recommendation, no defence of the current shape. A question
leaves here when it is answered, and the answer goes into [`api.md`](api.md), the
[plan](README.md) or the
[ADR](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md).

Ids are `API-Q*n*`, and they are their own series — the review's `Q1`–`Q5`
([`reviews/2026-09-09.md`](reviews/2026-09-09.md)) are a different list.

---

## API-Q1 — should a consumer Field key carry its own namespace?

Raised 2026-09-09. Against [`api.md` §1](api.md#1-declaring-a-dataset--app-author).

```ts
fields: [
  { key: 'owner', column: { header: 'Own', align: 'center' } },        // reads and writes data.owner
  { key: 'progress', type: 'percent', rollUp: 'weightedMeanByDuration', editable: true },
  { key: 'ref', compute: (entry) => rowNumber(entry.id) },
],
```

Should we not force the key to be `data.owner`?

How does this distinguish from core fields?

---

## API-Q2 — why do we have both `entries.get` and `entries.fieldValue`?

Raised 2026-09-09. Against [`api.md` §2](api.md#2-reading-a-value--app-author).

```ts
dataset.entries.get('t1')?.data.owner
dataset.entries.fieldValue('t1', 'owner')
```

Why do we have `dataset.entries.get` and `dataset.entries.fieldValue`?

---

## API-Q3 — why do we expect undeclared fields?

Raised 2026-09-09. Against [`api.md` §4](api.md#4-undeclared-keys-are-writable).

`ChangeSet` may now carry rows naming undeclared keys (§4), so every read door has to answer one.

Why do we expect undeclared fields? How can we better guard this?

---

## API-Q4 — can the read door return the type for `phase`?

Raised 2026-09-09. Against [`api.md` §2](api.md#2-reading-a-value--app-author).

```ts
dataset.entries.get('t1')?.data.phase
```

Is there any way to return the type for `phase` if we change the way we get the data?

---

## API-Q5 — why are we surprising people with writable undeclared keys?

Raised 2026-09-09. Against [`api.md` §4](api.md#4-undeclared-keys-writable).

> ## 4. Undeclared keys are writable
>
> **Settled** (Open 1). The rule that surprises people, so it gets its own section.

Why are we surprising people? I think this relates to the typing question ([API-Q4](#api-q4--can-the-read-door-return-the-type-for-phase)) and why we accept unknown data after ingest.

---

## API-Q6 — how do popular libraries deal with partials?

Raised 2026-09-09. Against [`api.md` §3](api.md#3-writing--update-merges-add-carries-a-record) and [§5](api.md#5-the-edit-types).

How do other libraries that are popular, like the well-known data grids, deal with partials?

---

## API-Q7 — why is `kind` not promoted to `'group'` from having children?

Raised 2026-09-09. Against [`api.md` §14](api.md#14-rollupkinds) and `plans/01` §2.5.

Why aren't we auto promoting to groups automatically based on children? How do other libraries do this?

---

## API-Q8 — what is the difference between `entry` and `ctx` in a `compute`?

Raised 2026-09-09. Against [`api.md` §9](api.md#9-fieldcontext--plugin-author-surface).

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

What is the difference between `entry` and `ctx` in that code?

---

## API-Q9 — why does an `EditExtender` author build a Map by hand?

Raised 2026-09-09. Against [`api.md` §10](api.md#10-the-extension-hook--plugin-author-surface), D3.

```ts
// The shape is unchanged: one write shape, the same object update() takes.
const extender: EditExtender = (request) => {
  const moved = request.proposed.get(entryId('t1'));
  if (!moved) return new Map();
  return new Map([[entryId('phase-1'), { start: moved.start, data: { risk: 'high' } }]]);
};

ctx.edits.wrap((next) => (request) => mergeEntryEdits(next(request), extender(request)));
```

Why does the consumer need to return a Map and do weird stuff like this? Can we give them some help here?

---

## API-Q10 — would a `plugin` bag beside `data` fix anything?

Raised 2026-09-09. Against [`api.md` §11](api.md#11-registering-from-a-plugin--plugin-author-surface) and
[D1](api.md#d1--where-does-a-plugins-own-field-value-live).

I proposed having `.plugin` beside `.data` on the entry. It was rejected.

- Would that fix anything?
- Why do we prefer another store?
- Does requiring calling `data.phase` vs `plugin.progress` help here?
- Does the consumer care about `data` vs `plugin`? Wouldn't they be selecting what plugin they load or write, so they would make sure their data shape fits that?

---

## API-Q11 — do the typing questions resolve §16.2?

Raised 2026-09-09. Against [`api.md` §16.2](api.md#162-fieldvalue-can-never-be-typed-because-the-registry-erases-tvalue).

Do our questions about typing ([API-Q4](#api-q4--can-the-read-door-return-the-type-for-phase)) and
why we have `fieldValue` ([API-Q2](#api-q2--why-do-we-have-both-entriesget-and-entriesfieldvalue))
resolve §16.2, "`fieldValue` can never be typed, because the registry erases `TValue`"?

If not, I will need to defer this to better understand it.
