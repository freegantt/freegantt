# Review — ADR 0011 plan vs ADR consistency

> **Delete this file when it is vetted.** It is a reviewer's working record, not a decision.
> Move each accepted finding into `README.md` or into `docs/adr/0011-…md`, open an issue for each
> deferred one, then remove this file. It has no authority over either document.

**Reviewed:** `plans/adr-0011-field-redesign/README.md` and
`docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md`.
**Also read:** `plans/adr-0011-field-redesign/review-2026-09-08-api-surface.md`.
**Method:** every cited D-S / ADR / code line was opened before it was used. File and line numbers
are from HEAD at review time, not from the plan.
**Date:** 2026-09-08.

**Sources:**

- Parent session `34d1135c-220a-4742-8528-29ccee5340ba` (2026-09-08 19:41 UTC-6). Waited 15 minutes,
  then wrote the review below.
- Spawned reviewer `ff725748-1f28-4e5c-bc79-a530e828dcbc` (2026-09-08 19:58 UTC-6). Read the three
  primary documents, then stopped on an Opus usage limit. It added no extra findings.

Finding ids in this file (`B1`–`B6`, `S1`–`S10`) are **this review's** ids. They are not the plan's
Blocking B1–B3. Where a finding talks about the plan's Blocking items, the text names the plan item.

---

## Verdict

The two central rulings agree. The documents are **not** consistent enough to implement from.
Close the named contradictions first. An implementer who follows one paragraph and then the next
will ship the wrong write rule, the wrong error, or a retired decision that is not the one the ADR
names.

The key-is-the-address ruling and the derived-value-never-persists ruling do not fight each other.
The surrounding sentences do.

---

## Block

### B1. Undeclared `data` keys: refuse, or write?

The plan After-example and Open 1 say an undeclared key is writable. Group B still says the opposite.

```157:157:plans/adr-0011-field-redesign/README.md
- An undeclared key inside a patch stays `UnknownFieldError`. That is the typo guard, and it is the only thing the rule buys — see Open 1.
```

The ADR flow still says the same stale rule. The consequences reverse it.

```90:90:docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md
1. **Read.** `toStoredEdit` … An undeclared key in the patch is `UnknownFieldError`, unchanged.
```

```148:148:docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md
**Undeclared data round-trips, and it is writable.** `update(id, { data: { phase: 3 } })` on an undeclared `phase` succeeds.
```

The ADR also says both of these:

- “Being editable is one of those jobs” (declare a Field to edit).
- “Editing is not one of those jobs” in the plan; the ADR later says *change it* is the consumer’s job.

**Why an implementer would do the wrong thing:** Group B and flow step 1 refuse the write.
Open 1 and the consequences paragraph accept it.

**Smallest reconcile:** Keep Open 1 and the consequences paragraph. Delete Group B’s
`UnknownFieldError` bullet, flow step 1’s “unchanged”, and “Being editable is one of those jobs”.

### B2. Plugin values: decided in the ADR, blocking in the plan

The plan says Group A cannot start until its Blocking B1 (plugin storage) is grilled. The ADR already
records share-`data` as the consequence, and it rejects `pluginData`.

```154:155:docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md
**A plugin's Field values sit in `data`, beside the consumer's — where they sit today.** … A per-entry `pluginData` key was considered and rejected
```

**Why an implementer would do the wrong thing:** One reader treats plugin storage as settled and
starts Group A. The next reader treats it as blocking and stops.

**Smallest reconcile:** Either mark the ADR paragraphs as “today’s behaviour, not a ruling” and keep
the plan’s Blocking B1, or drop that item as blocking and keep the ADR. Do not leave both.

### B3. The ADR retires the wrong D-S2-22

```169:169:docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md
**D-S2-22 is retired.** `rollup.ts:196` skips a rolling-up Field the transaction body proposes…
```

`plans/s2-data-core/README.md` was opened. **D-S2-22** is: the Rollup is a **core step**, not an
extender. The yield-to-body clause is one paragraph inside it (`rollup.ts:196` matches that clause).
Retiring D-S2-22 would remove the Rollup from core.

**Why an implementer would do the wrong thing:** They delete the core-step ruling, not the
precedence clause.

**Smallest reconcile:** Name the precedence clause. Do not retire the decision.

### B4. The ADR mis-cites D-S4-2

The ADR says D-S4-2 is the `& Partial<TFields>` arm on `EntryEdit`.
`plans/s4-hierarchy-and-rows/s4.1-field-registry.md` was opened. **D-S4-2** is “one adapter reads
and writes a `FieldSource`”, plus the whole-`meta` write rule. The flat-edit arm is a side effect of
that adapter, not the decision’s name.

**Why an implementer would do the wrong thing:** They retire the wrong title, or they leave the
adapter in place because the cited name does not match the file.

**Smallest reconcile:** Retire the adapter. Do not pin the wrong title.

### B5. The ADR misstates D-S5-46’s reason

```35:35:docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md
D-S5-46 … justifies that from the `referenceDate` fill this ADR deletes.
```

`plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md` was opened. D-S5-46 never mentions
`referenceDate`. It keeps zero-length spans because `[start, end)` makes an empty interval legal, a
milestone is authored that way, and a resize drag produces `start === end`. The fill to delete lives
under **D-S2-10**.

**Why an implementer would do the wrong thing:** They rewrite D-S5-46’s reason, or they delete the
wrong fill.

**Smallest reconcile:** Rewrite D-S5-46’s reason only if a sentence there actually names the fill.
It does not.

### B6. `#208` is closed and unanswered in the same plan

The closed table says “Its second is unanswered — see Open 2.” Open 2 is settled: one `EntityAdded`
row.

**Why an implementer would do the wrong thing:** They reopen a settled question because the closed
table still points at it.

**Smallest reconcile:** Delete the unanswered pointer.

---

## Should-fix

### S1. Two error names in one ADR

`ComputedFieldCannotStoreError` at the Field union. `ComputedFieldCannotBeWrittenError` in the
consequences. The plan names neither.

**Smallest reconcile:** Keep the second. Add `DerivedFieldNotWritableError` beside it in `plans/02`
§7. The 2026-09-08 API-surface review already said this (issue 6.1). It is still open.

### S2. Document doors have two names

The plan writes `toDocument` / `fromDocument`. The ADR flow and door table write `toJSON` /
`fromJSON`. The public class publishes `toJSON` / `fromJSON` and calls `toDocument` inside
(`src/api/dataset.ts:312,326`).

**Smallest reconcile:** Pin one sentence in both files: public door `dataset.toJSON()`, internal
function `toDocument`. Review 10.1 is still open.

### S3. “Four doors, one answer” does not match the table

I14 is: gestures and affordances share one resolver, and every **write** asks one `canWrite`
(`plans/01` I14). The ADR then lists four doors and three answers: refuse (`update`), drop (`add` /
`fromDocument`), omit (`toJSON`). Count the doors. Do not claim I14 for omit. Review 8.1 (plugin
cascade) and 9.1 (`add` vs bulk) still have no home in group C.

### S4. Open-item numbers do not match

| Topic | Plan | ADR |
|---|---|---|
| Undeclared patch keys | Open 1, settled | Open 1, settled |
| `add()` ChangeSet shape | Open 2, settled | Body text only |
| S7 leftover `progress` | Open 3, still open | Open 2, still open |
| Schema `5` / `1` | Open 4, settled | Open 3, under an “Open” heading |
| `InvalidInstantError` | Group D | Open 4, settled |

**Smallest reconcile:** Renumber. Move settled items out of “Open”.

### S5. `StoredEdit` → `ProposedEdit` has no work group

The ADR consequences schedule ~184 renames. The plan’s naming section still says write
`toStoredEdit`. Group B still uses `StoredEdit`.

**Smallest reconcile:** Put the rename in A or B, or drop it from the ADR.

### S6. ADR consequences with no plan home

These have a ruling and no group:

- `rollUpKinds` as a destructive setter that clears history
- unknown top-level ingest warning
- `CORE_FIELD_OVERRIDABLE_KEYS` deletion
- `change-set.ts` still skipping `'meta'` (`src/data/change-set.ts:72-85`)
- `DatasetPlugin` / `fromJSON` still carrying two generics (`src/api/dataset.ts:45-52,326`)

Review items 1.2, 14, C6, 7.

### S7. Plan F is short of the ADR’s retired list

The ADR also retires D-S4-35, D-S4-2 (wrong id, see B4), D-S2-7’s `meta` row, D-S2-22’s precedence
clause, and `plans/s2-data-core/s2.6-serialization.md:76`. The Gate already found that last file.
Put those rows in F.

### S8. The Gate grep is still the unscoped one

Review C3 already measured 631 hits across 120 files, including `import.meta` and ADR history.
ADR 0006 says an ADR is superseded, never edited. Scope the grep to the live surface, as C3 wrote.

### S9. Schema `5` now, `1` at release, is still ambiguous

Both documents settled this. Review 11.1 still stands: a released reader cannot tell a dev-era
`schema: 3` from a released `schema: 3`. Address 11.1, or record why reuse is safe.

### S10. Plan Blocking B2 (compute on a group row) is blocking in the plan and absent from the ADR

If it blocks Group A, the ADR must ask it. If it does not, drop it from Blocking.

---

## Nit

- Group E is “dissolved” and still a section. Keep the section as “lands inside A/C/D”. Change the
  heading so it does not look like a fifth work group.
- `plans/02:454` is not the sentence “Source decides stored or computed.” It says “Source decides
  what happens to a parent's aggregate.” Cite the paragraph, not a copied title.
- The change table’s “stored, **never** written” means “never written to the Document”. Say that. A
  reader can take it as “never written to the store”, which the ADR contradicts on purpose.
- `mergeColumn` at `field-registry.ts:52-61` matches the plan. The diagnosis is correct. The
  review’s fourth test row (`width` vs `flex`) is still missing from the test list.

---

## Absorption of `review-2026-09-08-api-surface.md`

The plan says that review stays open until each finding lands in the plan, the ADR, or an issue.
Almost none have landed. The plan’s Blocking section lists only its B1–B3. It does not list the
API-surface review’s “before group A” items.

| Review id | Status |
|---|---|
| 1.1 Dataset widening / harness cast | Dropped. No trace. |
| 1.2 `DatasetPlugin` / `fromJSON` generics | Dropped. Plan A says “one generic” and names only `harness/planner.ts`. |
| 2.1 `EntryDataSlot` | Dropped. |
| 3.1 `data.start` shadows core `start` | Dropped. |
| 4 `EntryEdit` as `Omit<…, 'data'>` | Dropped. ADR still says “restates” without an omission. |
| 5.1 export `DataEdit` from `api/` | Partial. ADR says it is exported. Plan A does not say from where. |
| 6.1 two error names | Still present (S1). |
| 6.2 `TValue` lost at the registry | Dropped. |
| 6.3 `{ key: 'data' }` type-checks | Partial. Plan A says the registry refuses. It does not say the type still accepts. |
| 7 `'meta'` in `change-set.ts` / `isOptionalEntryKey` | Dropped from group A. |
| 8.1 plugin cascade derived write | Dropped. Still unwritten. |
| 9.1 `add()` vs bulk | Dropped. Both docs still drop on `add()`. |
| 10.1 `toJSON` vs `toDocument` | Still present (S2). |
| 11.1 schema reuse | Still present (S9). |
| 12.1 dates ⇔ Segments | Partial. Plan D names #212’s empty case. It does not state the biconditional. |
| 12.2 `durationOf` | Dropped from group D. |
| 12.3 un-date verb | Dropped. |
| 14 `rollUpKinds` flip | ADR records a destructive setter. Plan does not schedule it. Review’s three options unanswered. |
| 15 `ProposedEdit` | ADR yes, plan no (S5). |
| 16 `mergeColumn` flex row | Not absorbed. |
| C1 `proposedKeys` loop + undeclared read | Partial. Open 1 names `proposedKeys`. It does not name the registry-only loop. |
| C2 `data` vs `data/` | Dropped. |
| C3 gate grep | Still present (S8). |
| C4 option-C read path | Not written into the plan’s Blocking B1. |
| C5 plan Blocking B2 answer | Still blocking, no ADR text (S10). |
| C6 ingest-warning owner | ADR rules the warning. Plan does not own the walk. |
| C7 red-between-A-and-D scope | Still the branch-wide sentence. |

---

## Locked specs opened and confirmed true

These cites are true:

- `plans/01:273-281` — `FieldSource` and default `meta`.
- `plans/01:330` — “Source decides stored or computed.”
- `plans/02:738` — “anything of yours goes in `meta` and survives byte for byte.”
- D-S2-12 — namespace carried by reference, never walked field by field. The Document omit rule does
  bend this for a rolling-up parent.
- D-S4-35 / Q17 — omitted `source` is `meta` under the Field key.
- D-S4-6 — `rollUpKinds: 'none'` keeps authored parent values.
- D-S5-24 — `PluginStore` holds per-plugin per-entry data.
- D-S5-33 — a Document carries the consumer’s declarations only.
- D-S5-41 — `severity` is `error` / `warning` / `info`; that is the right ADR 0009 door.
- `mergeColumn` (`field-registry.ts:59-60`) — `sizing` is the whole object, spread last.
- `hasSomewhereToWrite` (`capability.ts:132-134`) — `field.source?.from !== 'compute'`.
- `rollup.ts:184,191,208` — childless parent skips the Aggregator; `undefined` keeps the stored
  value.
- `fieldValue` is already public. The After-example does not invent it.

---

## What to close first

1. One write rule for undeclared `data` keys, in both documents (B1).
2. Plan Blocking B1 (plugin storage): blocking, or already decided (this review’s B2).
3. Correct the D-S2-22, D-S4-2, and D-S5-46 cites (B3–B5).
4. One error name, one Document-door name (S1, S2).
5. Walk the 2026-09-08 API-surface review: absorb, issue, or reject each row, then delete that file
   as the plan already requires.
