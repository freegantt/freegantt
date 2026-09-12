# Build 5 — ADR 0015, what the write door refuses

**The one question it answers.** How strict is `entries.update()`?

**Read first.** [`docs/adr/0015`](../../../docs/adr/0015-what-the-write-door-refuses.md). Then [`README.md`](README.md) in this folder.

**Lands after.** Build 2 moved the resolver. Build 3 filled the derived arm. This build lands last, because **I14 is claimed here**.

**Tick each box as you finish it.** Do not batch the ticks.

---

## Target state

**The rule, once.** One key, three named states, two thresholds. The grid is writable if and only if `'anywhere'`. `entries.update()` is writable if and only if not `'never'`.

```ts
editable?: 'never' | 'api' | 'anywhere' | boolean;   // boolean is input-only
```

`true` aliases `'anywhere'`. `false` aliases `'never'`. **Absent is `'anywhere'`.** After ingest the stored Field holds the enum.

```ts
fields: [
  { key: 'cost' },                      // cell, handle, and update()
  { key: 'owner', editable: 'api' },    // update() only; the grid cell is dead
  { key: 'start', editable: 'never' },  // a lock — or editable: false
]

dataset.setFieldEditable('start', 'never')
```

**Three declaration shapes.** `{ key: 'start', editable: false }` constructs. `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws `IllegalCoreFieldOverrideError`.

**Errors.** `FieldNotEditableError` is declared here, and thrown at `entries.update()` for `'never'`. `ComputedFieldCannotBeWrittenError` gains its second door here — one name, two doors, and the message names the door.

**I14 is claimed here.** A gesture asks `canWrite` at the grid threshold. `update()` asks the same key at the API threshold.

---

## Work

- [ ] Widen `Field.editable` to `'never' | 'api' | 'anywhere' | boolean`. Normalize at ingest.
- [ ] Make absent mean `'anywhere'`. Alias `true` and `false`.
- [ ] Declare `'anywhere'` on the core `name`, `start` and `end`.
- [ ] Declare **nothing** on `parentId` and `segments`. The absent `column` is what keeps them out of the grid.
- [ ] Fill the resolver's **editable** arm. The grid is writable iff `'anywhere'`. `update()` refuses `'never'` only.
- [ ] Check `compute` **before** `editable`.
- [ ] Declare `FieldNotEditableError`, and throw it at `entries.update()`.
- [ ] Throw `ComputedFieldCannotBeWrittenError` at `entries.update()`.
- [ ] Point `src/view/capability.ts:120` at the moved resolver. Do not restate the enum there.
- [ ] Assert that `dataset.fields.all` reads `{ key: 'end', editable: false }` back. `#mergeCoreFieldOverride` (`src/data/fields/field-registry.ts:211-225`) already merges into `#resolved`.
- [ ] Ship `dataset.setFieldEditable(key, editable)`. Copy the Field. Replace `FieldRegistry.all`'s array identity, so a subscriber notices.
- [ ] Refuse an unknown key at `setFieldEditable`. A new Field key stays refused.
- [ ] Add an `entries.update()` assertion to `e2e/write-refusal.spec.ts`, for `'never'` and for `'api'`.
- [ ] Rewrite the comment at `src/model/field.ts:125-127`. It still says the default is `false`, and it claims I14.
- [x] The two `plans/02` edits landed 2026-09-11, before the code: §2 scopes the `fields` hole to adding or removing a **key**, and the verb list carries `dataset.setFieldEditable`. Do not ask for them again.
- [ ] Reread `plans/01` I14 (`:917`) and `plans/02` §4.2 against what you built. **If the build cannot honour the wording, the wording is wrong** — edit it and say so. Do not ask first.
- [ ] Close the build — see [`README.md#close-every-build`](README.md).

**Slices it touches.** S3 (drag-resize arming), S4 (the Field registry), S5 (inline editing, the capability resolver, `write-refusal`). **Re-run the S3, S4 and S5 slice gates. I14 is claimed here, so re-run the slice gate that names it.**

---

## Do not

- **Do not check `editable` before `compute`.** Check `editable` first and the message tells the consumer to declare an `editable` that the register door then rejects. That is a closed loop with no way out.
- **Do not add a door argument, and do not add `canWrite` to the public surface.** One key, two thresholds.
- **Do not mutate the object `field()` returns.** It is a resolved snapshot, not a signal.
- **Do not make the default `'api'`.** It is `'anywhere'`. The locked specs already say so. Rewrite `src/model/field.ts:125-127` to match the code.
- **Do not declare `'api'` on `parentId` or `segments`.** Let the default answer. A spec sentence that restates a default puts the value in two places with nothing checking they agree.
- **Do not assert `FieldRegistry.authored`.** Build 0 deleted it. Assert `fields.all`.
- **Do not encode a lock into anything.** There is no Document.

---

## Gate

```bash
pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log
```

`verify:full` runs the browser check, so `e2e/write-refusal.spec.ts` is covered by it and by nothing else.

Each assertion below gets a named test:

- `entries.update()` on `editable: 'never'` throws `FieldNotEditableError`.
- `entries.update()` on `editable: 'api'` **succeeds**, and the grid cell stays dead.
- An absent `editable` opens the cell and allows `update()`.
- Un-dating a `'never'` `start` throws.
- Create, ingest and History replay still write a locked Field.
- `{ key: 'end', editable: false }` is visible on `dataset.fields.all`.
- `dataset.setFieldEditable('start', 'never')` replaces `FieldRegistry.all`'s array identity, and a subscriber notices.
- `setFieldEditable` on an unknown key throws.
- `entries.update()` on a `compute` Field throws `ComputedFieldCannotBeWrittenError`, and the message names the door.

---

## Issues

| Issue | What this build does to it |
|---|---|
| [#213](https://github.com/Pawel-IT/FreeGantt/issues/213) | **Closes.** A write to a `compute` Field now throws instead of reporting success and writing nothing. Build 2 landed the ordering precondition only. |
| [#256](https://github.com/Pawel-IT/FreeGantt/issues/256) | **Closes.** The editable arm gives `entries.update()` and the grid one answer. I14 is claimed with it. |
