# Close-out — ADRs 0011 to 0015

**Every numbered decision and every grill call-site is closed. None is built.** All five ADRs are `proposed`, `src/` still ships `meta`, `Entry.kind`, `entries.fieldValue` and `schema: 4`, and the locked specs already state most of the new rules. The [2026-09-10 grill](README.md#grill-2026-09-10) overruled 0012 #4, 0011 #1 for `add()`, and 0015 #18's default, and closed Q12b, Q15, and Q16. This file is what is left, in order.

**Landing order is fixed:** 0012 → 0011 → 0013 → 0014 → 0015. Each spends one schema number ([the counter](shared/rulings.md#3--the-schema-restarts-release-gate)). Each ADR's own *The work* section is its build list.

## TODO

- [ ] **Build 0012** — optional dates, schema 5. One date without the other is legal. Default `gridColumns` `['name', 'start', 'end']`. Date editor opens on a blank cell. Delete the `referenceDate` fill. Guard the duration calculation.
- [ ] **Build 0011** — `meta` → `props`, `source` deleted, `StoredEdit` → `ProposedEdit`, `add()`/`update()` flat, constructor `entries` take declared keys at the top (Q15), schema 6. Gate: `grep -rn '\bmeta\b\|FieldSource\|source: {' src/ harness/` returns 0 (423 today).
- [ ] **Build 0013** — derivation by children, `kind`/`rollUpKinds`/`autoGroup` deleted, parent bar drag translates descendant dates, schema 7.
- [ ] **Build 0014** — plugin prefix, app writes the prefixed key and the plugin exports that const (Q12b), `fieldValue` → `read`, `durationOf` deleted, renderer pair becomes `text`/`value` (13a), schema 8. Gate: `grep -rn '\bfieldValue\b' src/ harness/ e2e/ etc/` returns 0.
- [ ] **Build 0015** — `editable` enum default `'anywhere'`, `update()` wired to the editable arm, `dataset.fields.override({ key, editable })` (Q16), schema 9. Add an `entries.update()` assertion to `e2e/write-refusal.spec.ts`.
- [ ] **Flip each `status: proposed` to `accepted`** as its build merges, and link its verdict report. Retire ADR 0005's *if accepted*.
- [ ] **Run the spike gate at each acceptance** ([`shared/prose-sweep.md`](shared/prose-sweep.md)): delete that ADR's spike folder and its `spike/*` branches, and prove no spike path reaches `src/`, `harness/` or `e2e/`.
- [ ] **Drop the ahead-of-`src/` banners** from `plans/01`, `plans/02`, `plans/03` and ADR 0005 when the last build merges. That is the day this file is deleted.

## Locked-spec edits — the author has to be in the room

`.claude/hooks/protect-spec.sh` blocks an edit to `CLAUDE.md`, `CONTEXT.md` and `plans/00`–`04`, on purpose: it turns the easy path into a conversation. **An agent that hits it stops and asks. It does not work around it, and it does not drop the edit.** Every one of these is owed and is tracked here, not in a session that ends.

- [x] **The 2026-09-10 prose sweep** — author confirmed; landed in `8f6ced0`.
- [x] **The sweep's two misses** — `plans/00:51` (principle 9 still declared authored `Entry.kind`) and `plans/03` (S4's `rollUpKinds`, `autoGroup`, `entry`/`meta` source). The gate grep named only 0011's words, so `plans/00` scored 0 and read as clean. The grep is widened in [`shared/prose-sweep.md`](shared/prose-sweep.md).
- [ ] **`src/model/field.ts:125-127`** — the `editable` comment still says *default `false`* and claims I14. Not the sweep's: 0015's build edits it with the code.
- [ ] **`plans/01` I14 and `plans/02` §4.2** — reread both when 0015 lands. I14 now reads *one key, two thresholds*, which is weaker than *every write asks one `canWrite`*. If the build cannot honour the new wording, the wording is wrong, not the build.
- [ ] **Grill 2026-09-10, locked specs** — `plans/02` default `gridColumns` is still `['name']` and still says a date path is owed; default `editable` is still `'api'`; `add()` still described as nesting `props`; `fields` lock still called a hole; live Field change is `dataset.fields.override`, only `editable`. `CONTEXT.md` still needs `_Avoid_`: phase, grouped entry. Entry **spans** is still owed. Stop and ask before those edits.

## Where a reader goes

| Question | File |
|---|---|
| What was decided, and why | `docs/adr/0011`–`0015` |
| The working material behind one decision | `plans/field-redesign/00xx-*/README.md` |
| The evidence a spike produced | [`reviews/`](reviews/) |
| Already refused — do not re-derive it | [`shared/refuted.md`](shared/refuted.md) |
| The schema counter | [`shared/rulings.md`](shared/rulings.md#3--the-schema-restarts-release-gate) |
