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
