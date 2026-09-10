# The prose sweep — one sweep, all five ADRs

**This was group F, and it stays one job.** Splitting it per ADR would run `protect-spec.sh` four times over the same files and leave four half-swept specs between landings. **The sweep runs once, after every open decision in all five ADRs has closed.** Landing 0011–0013 is not enough: 0014 and 0015 still change locked-spec sentences.

**Confirm with the author before this runs.** It edits locked specs — `plans/00`–`02`, `CLAUDE.md`, `CONTEXT.md` — and `protect-spec.sh` asks for permission on every one.

**Each row below names the ADR that changed the rule**, so a reader can check the sentence against the decision that retired it.

---

## F. Prose that states the old rule

The sweep may edit locked specs (`plans/00`–`02`, `CLAUDE.md`, `CONTEXT.md`). `protect-spec.sh` asks for permission. **Confirm before this group runs.**

| File | What it says |
|---|---|
| `CLAUDE.md:33` | "`meta` is the consumer's namespace in the document" |
| `CLAUDE.md:60` | "an `entry`- or `meta`-sourced field has a stored home, so its aggregate is stored, undoable and serialized" |
| `CONTEXT.md:16` | "anything of the consumer's goes in `meta`" |
| `CONTEXT.md:64` | Field entry — `meta` listed as a Field, "no reach into `entry.meta`" |
| `CONTEXT.md:72` | the whole **Field source** glossary entry — deleted; one entry for `entry.props` is owed. `props` collides with no layer name, so no disambiguation rule is owed |
| `CONTEXT.md:127` | names `DataEdit` and its `data` key from [ADR 0011](../0011-consumer-values-in-props/README.md) — both renamed (`PropsEdit`, `props`) |
| `plans/01:273-281` | the `FieldSource` type and its default |
| `plans/01:330` | "Source decides stored or computed" |
| `plans/01` §2.5 | the promote-only / flickering-identity clause, overruled by the both-ways conversion |
| `plans/02` §2.6 | the same source rule; `:454` reads *"Source decides what happens to a parent's aggregate"* |
| `plans/02:738` | "anything of yours goes in `meta` and survives byte for byte" — the rule survives, the word does not |
| `plans/02:749` | `DuplicateFieldSourceError` / `InvalidFieldSourceError` leave; `DerivedFieldNotWritableError` / `ComputedFieldCannotBeWrittenError` / `FieldNotEditableError` arrive. No `RollUpKindsWouldDropValuesError` — decision 6 closed as *drop and recalculate*. `PluginFieldNotInDataError` only if decision 9 lands on the store. `EmptySegmentsError` already ships |
| `plans/02` §"common case is a shorthand" | `update('t1', { start, cost })` stops compiling unless decision 11 keeps a declared-key flat spelling |
| `plans/02:467` | the worked example `dataset.entries.update('t1', { start: '2026-10-05', cost: 12_000 })`, with `cost` meta-sourced — the same sentence, as a compiling call. [0011](../0011-consumer-values-in-props/README.md) decision 11 |
| `plans/02:477` | *"one answer gates every writer (I14), so a consumer states it once"* and *"Default is `false`."* **Only if [0015](../0015-write-door/README.md) decision 18 lands on *split absent from `false`*** — split gives one Field two answers at two doors, which this sentence refuses |
| `plans/01:283` | `editable?: boolean` and its comment — *"the Field half of one write answer … (I14); default false"*. Same condition as `plans/02:477`. The type widens too if 18 takes three states |
| `plans/01:926` | the **I14 row itself** — *"every write asks one `canWrite` (#256)"*. Same condition. **Also owed either way:** its enforcement is `e2e/write-refusal.spec.ts`, which drives the cell editor and the bar handles and never calls `entries.update()` |
| `plans/02` Document section | a Document is our **save format**, not an interchange format |
| `plans/02` type rows | `PropsEdit<TProps>` and `EntryEdit<TProps>` are public |
| `plans/s2-data-core/s2.6-serialization.md:76` | consumer rule in the old word |
| `plans/s2-data-core/README.md` | D-S2-22's precedence clause; D-S2-10 / D-S2-22 `referenceDate` fill; D-S2-7's `meta` carve-out |
| `plans/s4-hierarchy-and-rows/README.md` | D-S4-35 / Q17, and the whole-`meta` write row |
| `plans/s4-hierarchy-and-rows/s4.1-field-registry.md` | D-S4-2's adapter |
| `plans/02-01-API-Redo.md` | already opens with *"This review is a stale."* Say **superseded by ADR 0011** in the same line |
| ADR 0005 | its `meta` rulings, superseded if this is accepted |

## The spike gate — finalizing an ADR that had a spike

**Added 2026-09-10, at the author's request.** All five ADRs were spiked: thirteen per-ADR branches and one combined branch, and five verdict reports under [`../reviews/`](../reviews/). **None of that evidence runs in CI.** Root `vitest.workspace.ts` does not include `plans/`, by design — so every spike suite rots invisibly, and a verdict report keeps citing a file that may no longer compile. This gate runs when an ADR flips `status: proposed` → `accepted`.

**Four rules. An ADR is not final until all four pass.**

1. **The ADR names its verdict report.** A decision whose evidence a reader cannot reach is a claim.
2. **The spike evidence is green, or it is deleted.** A suite that neither runs nor is gone is unprovable. Deleting is the expected end: the verdict report is the record, and [`refuted.md`](refuted.md) is where a refused approach lives.
3. **No spike path is reachable from shipped code.** `src/`, `harness/` and `e2e/` never import one.
4. **The spike branches are deleted from `origin`.** They are throwaway by their own header.

**The four checks, and three need no script.**

```bash
# 3 — no spike path reaches the library, the harness or e2e. Expect 0.
grep -rn 'field-redesign' src/ harness/ e2e/ vitest.workspace.ts | wc -l

# 4 — no spike branch survives. Expect 0 once every ADR is accepted.
git branch -r --list 'origin/spike/*' | wc -l

# 2 — an accepted ADR keeps no live spike folder.
for adr in docs/adr/001[1-5]*.md; do
  grep -q '^status: accepted' "$adr" || continue
  folder=$(grep -o 'plans/field-redesign/[0-9a-z-]*/' "$adr" | head -1)
  [ -d "$folder/spikes" ] && echo "$adr still has $folder/spikes"
done

# 1 — an accepted ADR links its verdict report.
for adr in docs/adr/001[1-5]*.md; do
  grep -q '^status: accepted' "$adr" || continue
  grep -q 'plans/field-redesign/reviews/' "$adr" || echo "$adr names no verdict report"
done
```

**Wiring.** These are a release gate, not a per-commit gate — every one of them fails today on purpose, because all five ADRs are `proposed` and every spike folder is live. **Do not add them to `pnpm verify` now; it would go red immediately.** Wire them when the **last** ADR is accepted, as `scripts/check-adr-spikes.mjs` between `vendor-names` and `sentence-length` in the `verify` chain. Until then this section is the checklist, run by hand at each acceptance.

**One thing the gate cannot check.** Whether a verdict report's *claims* still match `src/`. That is a reading job, and `CLAUDE.md` already names the rule: a review's account of the code is a claim, so open the file. The gate proves the evidence still exists. It does not prove the evidence is still true.

## Gate

The prose sweep is mechanical. **Keep the F table** — it tells a reader what changed. The grep only proves nothing was missed.

Scope it to the live surface. ADR 0006 rules that an ADR is superseded, never edited, so history keeps the old word.

**Two greps, two jobs.** [ADR 0011](../0011-consumer-values-in-props/README.md) renames the code; this sweep rewrites the prose, and it cannot run before the author confirms it. One grep over both would fail 0011's gate on locked specs it is not allowed to touch.

**ADR 0011's gate — code only.** Returns **423** at HEAD, and must return **0** when 0011 lands.

```
grep -rn '\bmeta\b\|FieldSource\|source: {' src/ harness/ | grep -v 'import\.meta'
```

**The sweep's gate — the locked specs.** Returns **33** at HEAD, and must return **0** when the sweep lands. Live spec is `plans/00`–`04` only.

```
grep -rn '\bmeta\b\|FieldSource\|source: {' CONTEXT.md CLAUDE.md \
  plans/00-overview.md plans/01-domain-architecture.md plans/02-public-api.md \
  | grep -v 'import\.meta'
```

Per file at HEAD: `plans/02` 15, `plans/01` 12, `CONTEXT.md` 4, `CLAUDE.md` 2, `plans/00` 0.

`pnpm verify:full`, and its **last line** is the answer. Capture it with a redirect, never a pipe: `pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log`.

Review `harness/main.ts` and `harness/planner.ts` on every commit here, changed or not.

