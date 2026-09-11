# Build 2 — ADR 0011, `meta` becomes `props`

**The one question it answers.** Where does `entry.props.cost` live, and what does a write to it look like?

**Read first.** [`docs/adr/0011`](../../../docs/adr/0011-consumer-values-live-in-props.md) and [`../0011-consumer-values-in-props/types.md`](../0011-consumer-values-in-props/types.md). Then [`README.md`](README.md) in this folder.

**Lands after.** Build 1. `EntryEdit`'s removable keys derive from `Entry`, so `{ start: undefined }` compiles only once dates are optional.

**Build 0 already took the large half.** The Document rename is gone. What is left is the write path plus the type renames.

**Tick each box as you finish it.** Do not batch the ticks.

---

## Target state

**The rule, once.** A Field key is the whole address. `{ key: 'cost' }` reads and writes `entry.props.cost`. `{ key: 'start' }` reads and writes `entry.start`. Nothing declares a `source`.

```ts
export type PropsEdit<TProps> = { [K in keyof TProps]?: TProps[K] | undefined };

export type EntryEdit<TProps> = {
  [K in keyof EntryEnvelope<TProps>]?: K extends RemovableEntryKey
    ? EntryEnvelope<TProps>[K] | undefined
    : EntryEnvelope<TProps>[K];
} & { [K in keyof TProps]?: TProps[K] | undefined };

export type ProposedEdit<TProps> = {
  readonly __brand: 'ProposedEdit';
  readonly props: Readonly<Partial<TProps>>;
  readonly proposedKeys: ReadonlySet<string>;
  // …envelope keys, complete
};
```

**Call sites.**

```ts
dataset.entries.get('t1')?.props.owner            // storage
dataset.entries.read('t1', 'owner')               // any Field key
dataset.entries.update('t1', { start, owner })    // flat; other props keys survive
dataset.entries.add({ id, name, owner: 'Ali' })   // flat, same shape
```

`update(id, { props: { … } })` is refused. `add({ props: { … } })` is refused. The constructor's `entries` take declared keys at the top level **and** keep a nested `props` for passengers.

**Defaults.** `Entry.props` is always present, and ingest fills `{}`. `EntryInput.props` stays optional.

**Errors.** `ComputedFieldCannotBeWrittenError` is declared here and thrown at **registration** only — `compute` beside `rollUp`, or `compute` beside `editable`. `UnknownFieldError` keeps its one door at `entries.update()`, with a rewritten message.

---

## Work

- [x] Rename `Entry.meta` → `Entry.props` with **serena**. Make it non-optional, filled `{}` at ingest.
- [x] Rename `StoredEdit` → `ProposedEdit` and the whole family with **serena**. About 267 occurrences.
- [x] Rename `TMeta` → `TProps` with **serena**, and drop `TFields`. About 169 and 141 occurrences.
- [x] Write `PropsEdit`, `EntryEdit` and the branded `ProposedEdit` from `types.md`. Do not factor them.
- [x] Write the seven type tests from `types.md`.
- [x] Make `writeDeclaredMetaFields` walk the top level **and** inside `props` on a nested record.
- [x] Make `entryAfterEdit`, `mergeEntryEdits` (`src/data/edit-extension.ts:38`) and `mergeStoredEdits` (`src/data/fields/field-access.ts:49`) merge `props` **per key**. Fix both spreads together.
- [x] Make `toProposedEdit` merge the patch onto the Entry's own record, on the read side.
- [x] Make `diffEdit` emit one row per Field key, never a path into `props`.
- [x] Move `libraryWriteRule` (`src/view/capability.ts:114-121`) into `data/` with no policy change. Point `view/capability.ts` at it.
- [x] Change `hasSomewhereToWrite` to `!('compute' in field)`.
- [x] Delete `FieldSource`, `Field.source`, `source-strategy.ts`, `normalize-source.ts`, `metaRecord`, `metaKey`, `metaSlot`, `DuplicateFieldSourceError` and `InvalidFieldSourceError`.
- [x] Delete the `meta` core Field with no successor.
- [x] Set `CoreFieldKey = keyof Omit<Entry, 'id' | 'props'>` **and** omit `'props'` from `CoreFieldValues`.
- [x] Refuse `{ key: 'props' }` at runtime. It is the one reserved key.
- [x] Declare `ComputedFieldCannotBeWrittenError`. Throw it at **registration** only.
- [x] Add the two ingest warnings in one `Object.keys(input)` walk per Entry: an unknown top-level key, and a key inside `props` that names a core key. Both warn. Neither throws.
- [x] Rewrite the `src/model/errors.ts:331` message with the new migration text.
- [x] Give `harness/planner.ts:31` one generic. Rename `PlannerMeta` → `PlannerEntryProps` and `DemoMeta` → `DemoEntryProps` (`fixtures/demo-dataset.ts:42`).
- [x] Update the `FieldSource` row at `harness/docs/files.html:130-132`. It describes ADR 0005's Field surface. This is harness documentation, not a gate.
- [x] Close the build — see [`README.md#close-every-build`](README.md).

**Slices it touches.** S2 (the store, the ChangeSet), S4 (the Field registry, the Rollup's write path), S5 (plugins, the edit extension, the capability resolver). **Re-run the S2, S4 and S5 slice gates.**

---

## Do not

- **Do not read *skip decision 1's edits a–c* as *do not look inside `props`*. This is the largest trap in the redesign.** On an `EntryEdit` the walk is top level. On a **nested record** — the bag a constructor entry passes — the walk goes **inside `props`** for **declared** keys. `fromJSON` was the second nested door, and Build 0 deleted it, so **the constructor is now the only one**. Miss it, and a consumer who seeds a Dataset with a nested bag loses every declared Field value in silence, with no error and no ChangeSet row.
- **Do not fix one shallow spread and leave the other.** `src/data/edit-extension.ts:38` and `src/data/fields/field-access.ts:49`. The second is reachable with no plugin installed. A body write to `props.cost` beside a cascade write to `props.progress` loses `cost` while `proposedKeys` still names it, so the ChangeSet emits a row carrying a stale value. **A wrong row is worse than a dropped write.**
- **Do not change `CoreFieldKey` without `CoreFieldValues`.** Change one and not the other, and `read(id, 'props')` types as the whole bag while the runtime throws.
- **Do not wire `entries.update()` to the editable arm or the derived arm.** It keeps `UnknownFieldError` only. Builds 3 and 5 own those arms.
- **Do not claim I14.** Build 5 claims it.
- **Do not keep `kind` off the work list, and do not delete it either.** `kind` is still on `Entry` through this build. Build 3 deletes it.
- **Do not look for `reportCorrectedRollUps`.** Build 0 deleted it.
- **Do not unpick a serialization arm of the strategy table.** Build 0 already took `computeStrategy.serialize()`, `encodeDeclaredField` and `encodeFieldDocument`. What is left is `writeStoredSource`'s read and write arms.

---

## Keep on purpose

- `#mergeCoreFieldOverride` and its three companions. Build 5 rules on them.
- The `parentId` and `segments` declarations. Three mechanisms read them out of the registry.

---

## Gate

```bash
pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log

# Scoped to TypeScript on purpose — 22 HTML hits are <meta charset> and class="meta".
# Returns 356 today. Must return 0.
grep -rn --include='*.ts' '\bmeta\b\|FieldSource\|source: {' src/ harness/ | grep -v 'import\.meta'
```

These type tests must compile: `{ start: undefined }`, `{ parentId: undefined }`, and `{ owner: undefined }` when `owner` is required on `TProps`. These must not: `{ kind: undefined }`, `{ name: undefined }`, `{ segments: undefined }`, `{ props: { owner: 'Sam' } }`.

---

## Issues

| Issue | What this build does to it |
|---|---|
| [#208](https://github.com/Pawel-IT/FreeGantt/issues/208) | **Closes.** Deleting `FieldSource` makes the key the address. |
| [#213](https://github.com/Pawel-IT/FreeGantt/issues/213) | Lands the ordering precondition only — the registry refusal for `compute` beside `rollUp`. **Closes nothing of it.** Build 5 closes it. |
| [#267](https://github.com/Pawel-IT/FreeGantt/issues/267) | Removes the three casts in `harness/planner.ts`. A Field-aware renderer read is still owed. Do not close it. |
