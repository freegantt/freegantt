# Interface: DatasetEventMap

Defined in: model/change-set.ts:66

`beforeChange`/`change` share one payload (D-S2-5, D-S2-25): a `false` return from a `beforeChange`
 handler vetoes the whole changeset; `change` handler return values are ignored. Only the
 `before*` half is `Refusable` — `refuse(reason)` puts the vetoing handler's own words on the
 report core raises for it (#210), and there is nothing to refuse once the change has landed. Public event
 vocabulary (plans/02 §3), so it lives in `model/` beside `ChangeSet` — the same reason `ChangeSet`
 itself moved here (§2.1's deviation note).

## Properties

### beforeChange

> **beforeChange**: [`Refusable`](Refusable.md) & `object`

Defined in: model/change-set.ts:67

#### Type Declaration

##### changeSet

> **changeSet**: [`ChangeSet`](ChangeSet.md)

***

### change

> **change**: `object`

Defined in: model/change-set.ts:68

#### changeSet

> **changeSet**: [`ChangeSet`](ChangeSet.md)

***

### error

> **error**: [`ErrorReport`](ErrorReport.md)

Defined in: model/change-set.ts:73

S5.12, D-S5-40: every refusal and every recovered fault a Dataset observes. Sync only, and no
 `before*` pair — a report states what already happened, so there is nothing to veto. The payload
 is the `ErrorReport` itself, not a wrapper: `dataset.on('error', (report) => …)` is the whole
 call. `api/watch-all-errors.ts` folds this feed and the Gantt's into one subscription.
