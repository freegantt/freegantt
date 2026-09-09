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
