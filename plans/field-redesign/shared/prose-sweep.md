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
| `plans/02` Document section | a Document is our **save format**, not an interchange format |
| `plans/02` type rows | `PropsEdit<TProps>` and `EntryEdit<TProps>` are public |
| `plans/s2-data-core/s2.6-serialization.md:76` | consumer rule in the old word |
| `plans/s2-data-core/README.md` | D-S2-22's precedence clause; D-S2-10 / D-S2-22 `referenceDate` fill; D-S2-7's `meta` carve-out |
| `plans/s4-hierarchy-and-rows/README.md` | D-S4-35 / Q17, and the whole-`meta` write row |
| `plans/s4-hierarchy-and-rows/s4.1-field-registry.md` | D-S4-2's adapter |
| `plans/02-01-API-Redo.md` | already opens with *"This review is a stale."* Say **superseded by ADR 0011** in the same line |
| ADR 0005 | its `meta` rulings, superseded if this is accepted |

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

