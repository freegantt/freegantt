# Close-out — ADRs 0011 to 0016

> **The plan of record is [`build/`](build/README.md).** This file tracks what the redesign still owes. It is not the build plan.

**Every numbered decision and every grill call-site is closed. None is built.** All **six** ADRs are `proposed`. `src/` still ships `meta`, `Entry.kind`, `entries.fieldValue` and `schema: 4` — that is HEAD, not the target. [`BUILD-SPEC.md`](BUILD-SPEC.md) §3 is the target: dates optional, no `kind`, `props` not `meta`, no save format. The locked specs already state most of the new rules. The [2026-09-10 grill](README.md#grill-2026-09-10) overruled 0012 #4, 0011 #1 for `add()`, and 0015 #18's default, and closed Q12b, Q15, and Q16. This file is what is left, in order.

**Landing order is fixed:** **0016** → 0012 → 0011 → 0013 → 0014 → 0015. **No build spends a schema number** — [ADR 0016](../../docs/adr/0016-the-library-holds-no-save-format.md) deletes the save format that carried them, and [the counter](shared/rulings.md#3--the-schema-restarts-release-gate) dissolves with it. Each ADR's own *The work* section is working material. [`BUILD-SPEC.md`](BUILD-SPEC.md) is the verified plan across all six, and it wins where a work list still names a Document.

## TODO

- [x] **Build 0016** — landed 2026-09-10 on `field-redesign-build`, six commits, `verify:full PASS — all 16 checks green`. The format grep returns 3, and all three are `DOMRect.toJSON()` stubs in DOM tests — the native Web API method, not save-format vocabulary. ADR 0016 is `accepted`. The library holds no save format. Delete `data/serialization/`, `model/document.ts`, `toJSON`, `fromJSON`, `UnsupportedSchemaError`, `PluginStores.toDocument` and `reportCorrectedRollUps`. Persistence is the consumer's, through `entries.all`, `fields.all` and `dataset.pluginStore(id)`. Gate: the format grep in `BUILD-SPEC.md` §2 Build 0 returns 0.
- [ ] **Build 0012** — optional dates. One date without the other is legal. Default `gridColumns` `['name', 'start', 'end']`. Date editor opens on a blank cell. Delete the `referenceDate` fill. Guard the duration calculation.
- **Build 0011** — `meta` → `props`, `source` deleted, `StoredEdit` → `ProposedEdit`, `add()`/`update()` flat, constructor `entries` take declared keys at the top (Q15). **V21 ruled 2026-09-10** — ADR 0016 removed two of this ADR's four reasons for `props`, and the two that survive carry it. ADR 0011's rejection row already names those two. Gate: `grep -rn --include='*.ts' '\bmeta\b\|FieldSource\|source: {' src/ harness/` returns 0 (356 today, and the unscoped form can never reach 0 — `BUILD-SPEC.md` §1 V1).
- [ ] **Build 0013** — derivation by children, `kind`/`rollUpKinds`/`autoGroup` deleted, parent bar drag translates descendant dates.
- [ ] **Build 0014** — plugin prefix, app writes the prefixed key and the plugin exports that const (Q12b), `fieldValue` → `read`, `durationOf` deleted, renderer pair becomes `text`/`value` (13a). Gate: `grep -rn '\bfieldValue\b' src/ harness/ e2e/ etc/` returns 0.
- [ ] **Build 0015** — `editable` enum default `'anywhere'`, `update()` wired to the editable arm, `dataset.setFieldEditable` (Q16). Add an `entries.update()` assertion to `e2e/write-refusal.spec.ts`.
- [ ] **Flip each `status: proposed` to `accepted`** as its build merges, and link its verdict report. Retire ADR 0005's *if accepted*.
- [ ] **Run the spike gate at each acceptance** ([`shared/prose-sweep.md`](shared/prose-sweep.md)): delete that ADR's `origin/spike/<ADR>-*` branches (there is no per-ADR `spikes/` folder — **V10**), and prove no spike path reaches `src/`, `harness/` or `e2e/`.
- [x] **ADR 0016's six locked-spec edits landed** in `4e0dc3d`, authorized 2026-09-10. Eleven more sentences went with them. **`plans/00` D7 landed** — it reads *the library holds no save format*. See [`BUILD-SPEC.md`](BUILD-SPEC.md) §5.7.
- [ ] **Drop the ahead-of-`src/` banners** from `plans/01`, `plans/02`, `plans/03` and ADR 0005 when the last build merges. That is the day this file is deleted.
- [ ] **Restore the spec gate in `.claude/hooks/protect-spec.sh`.** The author relaxed the `plans/**` arm on 2026-09-10 for the duration of the build-out, because all six builds retire spec text the author has already approved, and the checkpoint question fired on every one. A clearly marked `TEMPORARY` block near the top of the script short-circuits that arm. **Delete the block when the redesign merges**, and the arm below it returns to warning as before. The `package.json` and guard-loosening arms were never relaxed — both still exit 2.

## Locked-spec edits — the author has to be in the room

**`.claude/hooks/protect-spec.sh` warns on an edit to `plans/**`. It does not block one.** Checked 2026-09-10: the `plans/*` arm (`:45-65`) prints *"DID YOU ASK THE USER FOR PERMISSION TO EDIT THIS?"* to stderr and exits **0**, so the edit lands. Two arms exit 2 and do block — a new runtime dependency, and a loosened `eslint.config.js` or `.dependency-cruiser.cjs` guard. This file said *blocks* until today. It was wrong.

**So the guard is the question, not the exit code.** The warning turns the easy path into a conversation, and an agent that sails past it has edited a locked spec with nobody in the room. **An agent asks the author, waits for the answer, and only then edits.** It does not work around the warning, and it does not drop the edit. Every one of these is owed and is tracked here, not in a session that ends.

> **Relaxed for the build-out, 2026-09-10.** The author gave standing permission for the six builds to edit `plans/**` directly, and the `plans/**` arm of the hook is short-circuited while they land. The reason is that a build which retires a rule must retire the sentence that states it, in the same change — a spec left describing deleted code is the failure this redesign exists to fix. **This is a grant for spec text the ADRs already decided, not a licence over D1–D12.** A locked decision still changes only by explicit human decision. The restore is tracked in the TODO above.

- [x] **The 2026-09-10 prose sweep** — author confirmed; landed in `8f6ced0`.
- [x] **The sweep's two misses** — `plans/00:51` (principle 9 still declared authored `Entry.kind`) and `plans/03` (S4's `rollUpKinds`, `autoGroup`, `entry`/`meta` source). The gate grep named only 0011's words, so `plans/00` scored 0 and read as clean. The grep is widened in [`shared/prose-sweep.md`](shared/prose-sweep.md).
- [ ] **`src/model/field.ts:125-127`** — the `editable` comment still says *default `false`* and claims I14. Not the sweep's: 0015's build edits it with the code.
- [ ] **`plans/01` I14 and `plans/02` §4.2** — reread both when 0015 lands. I14 now reads *one key, two thresholds*, which is weaker than *every write asks one `canWrite`*. If the build cannot honour the new wording, the wording is wrong, not the build.
- [x] **Grill 2026-09-10, locked specs — the first five.** Author authorized them on 2026-09-10, and they landed: `plans/02` default `gridColumns` is `['name', 'start', 'end']` and names the grid as the date path; `plans/01:330` and `plans/02:478` say default `editable` is `'anywhere'`; `plans/01:330`'s `parentId`/`segments` sentence is deleted, because it restated the default; `plans/03`'s three S4 acceptance rows carry an inline *retired by* marker. See [`BUILD-SPEC.md`](BUILD-SPEC.md) §1 V8, V9, V18.
- [x] **ADR 0016's spec consequences landed 2026-09-10.** `plans/00` D7, `plans/s5.10:73`'s passenger bullet, `plans/01:831`, `CONTEXT.md`'s **Declarer** entry, and supersession banners on ADR 0005 and ADR 0008. **The accepted ADRs keep their bodies** — an ADR records the reasoning of its day, so each carries a banner instead of a rewrite.
- [ ] **Grill 2026-09-10, locked specs — what is left.** `plans/02` still calls the `fields` lock a hole; `dataset.setFieldEditable` still owes a row in the §2 verb list, next to `hideGridColumn`. Stop and ask before those edits. **Landed here:** constructor `entries` in `plans/02` name declared keys at the top; `CONTEXT.md` has **Spans** and `_Avoid_`: phase, grouped entry.

## Where a reader goes

| Question | File |
|---|---|
| **How to build it** — the hard rules, the landing order, one file per build | [`build/README.md`](build/README.md) |
| A question a build raised, or a call it made alone | [`BUILD-LOG.md`](BUILD-LOG.md) |
| The verification record behind those files, and the author's rulings | [`BUILD-SPEC.md`](BUILD-SPEC.md) |
| What was decided, and why | `docs/adr/0011`–`0016` |
| The working material behind one decision | `plans/field-redesign/00xx-*/README.md` |
| The evidence a spike produced | [`reviews/`](reviews/) |
| Already refused — do not re-derive it | [`shared/refuted.md`](shared/refuted.md) |
| ~~The schema counter~~ — dissolved by ADR 0016 | [`shared/rulings.md`](shared/rulings.md#3--the-schema-restarts-release-gate) |
