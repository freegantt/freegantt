# Field redesign — the build plan

Six ADRs are decided. No line is built. This folder is the work.

**Read this file once. Then read one build file and work from it.** Do not read the other five.

---

## Hard rules

1. **Read the ADR that governs your build.** It holds every decision. Never re-derive one.
2. **Tick each box as you finish it.** Do not save the ticks for the end. A build that stops halfway must show where it stopped.
3. **`pnpm verify:full` is the gate, and its last line is the answer.** Capture it with a redirect, never a pipe:
   ```bash
   pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log
   ```
   Report the verdict line. Never report `EXIT: $?`. A run with no verdict line is unproven.
4. **Each build lands as one change.** Do not stage a rename behind the old interface. This library has never shipped.
5. **Rename with serena.** Never with a text replace.
6. **Fill only your build's arm of the write resolver.** See *Who owns the write resolver* below.
7. **An edit under `plans/**` needs the author.** `.claude/hooks/protect-spec.sh` prints a warning and then exits 0. It does not block you. Ask the author, get the answer, then edit.
8. **Never work around a gap in `src/`.** Stop. Report the gap. Ask the author if core closes it first. This is `CLAUDE.md`'s stop rule.
9. **A line number here is a hint, not a fact.** The numbers come from `main` on 2026-09-10. Open the file. Numbers drift.
10. **Read [`../shared/refuted.md`](../shared/refuted.md) before you propose an alternative.** Fourteen approaches are already refused.
11. **Work you defer to a later build goes in that build's file, not only in the log.** A `J` entry records your reasoning; it does not hand the work to anyone. Open the receiving build file and add the work item and its gate assertion. A defer nobody receives is a deletion.
12. **Log every question and every judgement call in [`../BUILD-LOG.md`](../BUILD-LOG.md).** Write the entry the moment it comes up, not at the end. A call you made alone gets a **J** entry, so a reviewer can find it and reverse it. A question for the author gets a **Q** entry and waits. A session ends; this file does not.

---

## Landing order

The order is fixed. Build 0016 lands first because it makes the five after it smaller.

| Build | ADR | The job | File |
|---|---|---|---|
| 0 | 0016 | The library holds no save format | [`build-0-0016-no-save-format.md`](build-0-0016-no-save-format.md) |
| 1 | 0012 | Dates are optional | [`build-1-0012-optional-dates.md`](build-1-0012-optional-dates.md) |
| 2 | 0011 | `meta` becomes `props` | [`build-2-0011-props.md`](build-2-0011-props.md) |
| 3 | 0013 | Children decide derivation | [`build-3-0013-derivation.md`](build-3-0013-derivation.md) |
| 4 | 0014 | The plugin-author surface | [`build-4-0014-plugin-surface.md`](build-4-0014-plugin-surface.md) |
| 5 | 0015 | What the write door refuses | [`build-5-0015-write-door.md`](build-5-0015-write-door.md) |

---

## What the end state is

- **The Document goes away.** `toJSON`, `fromJSON`, `DatasetDocument` and the `schema` integer go with it. Persistence is the consumer's job.
- **`meta` becomes `props`.** A Field key is the whole address. Nothing declares a `source`.
- **`kind` leaves `Entry`.** An Entry derives when it has children.
- **Dates are optional.** An Entry spans if and only if it holds both dates. It draws a bar only when it spans.
- **`entries.fieldValue` becomes `entries.read`.** `durationOf` goes away.
- **`editable` becomes an enum.** `'anywhere'` is the default.

**No build spends a schema number.** ADR 0016 deletes the format that carried them.

---

## Who owns the write resolver

Three builds touch one function. Each fills one arm. **Do not fill an arm your build does not own.**

| Build | What it does to the resolver |
|---|---|
| **0011** | **Moves** `libraryWriteRule` out of `view/capability.ts` into `data/`. No policy changes. `entries.update()` keeps `UnknownFieldError` only. |
| **0013** | Fills the **derived** arm. Wires `entries.update()` and the ingest drop doors to it. |
| **0015** | Fills the **editable** arm. Wires `entries.update()` to it. **Claims I14 here**, and only here. |

---

## Close every build

Do all five, in this order, for the build you just finished.

- [ ] Run the `verify:full` redirect from rule 3. Report the verdict line.
- [ ] Review `harness/main.ts` for an API gap, changed or not. `CLAUDE.md` requires this on every commit.
- [ ] Flip the ADR's `status: proposed` to `accepted`. **Link its verdict report in the same commit.** ADR 0016 has no verdict report — it was ruled from the code, not from a spike. Link `../BUILD-SPEC.md` §1 instead.
- [ ] Run this ADR's spike gate:
  - `grep -rn 'field-redesign' src/ harness/ e2e/ vitest.workspace.ts | wc -l` → 0.
  - `git branch -r --list "origin/spike/<ADR>-*" | wc -l` → 0. Delete this ADR's spike branches from `origin`. ADR 0016 has none, so it passes with no work.
  - Delete `../combined/spikes` with the **last** build only. All five ADRs cite it.
- [ ] Close this build's issues on GitHub. Apply the labels with the `label-issues` skill.

---

## Still owed to the author

Each one is an edit to a locked spec. **Ask before you edit.** The build that owns it is named.

| What is owed | Build |
|---|---|
| `plans/s2-data-core/s2.6-serialization.md` marked retired | 0 |
| `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md` — D-S5-24 and D-S5-30 marked retired | 0 |
| `.dependency-cruiser.cjs` — delete `serialization-is-removable` (`:159-162`) and its red test (`scripts/guard-red-test.mjs:80-82`). **Authorized 2026-09-10.** The hook exits 2 on this file, so it cannot land early. Land it with the folder | 0 |
| `plans/02` — add `dataset.setFieldEditable` to the §2 verb list, beside `hideGridColumn` | 5 |
| `plans/02` — it still calls the `fields` lock a hole. It is a ruling. See [`../shared/rulings.md`](../shared/rulings.md) | 5 |
| `plans/01` I14 (`:917`) and `plans/02` §4.2 — reread both when 0015 lands. If the build cannot honour the new wording, the wording is wrong, not the build | 5 |
| The ahead-of-`src/` banners in `plans/01:5`, `plans/02:7` and `plans/03:9` drop when the last build merges. ADR 0005's banner is **blocked** — an accepted ADR is superseded, never edited | last |

---

## Preconditions — already met, do not chase them

- **No PR is owed before Build 1.** `../BUILD-SPEC.md` §1.3 used to say `624350d` and `9c3f704` sat off `main` and needed a PR first. Both landed in `6747cb0` (#276). The PR squashed, so the SHAs are not ancestors of `main` — check the content, not the SHA. §1.3 carries the evidence.

## Where the reasoning lives

Go here only when you need it. None of it is needed to build.

| What you want | Where |
|---|---|
| Why a decision was taken | [`docs/adr/0011`–`0016`](../../../docs/adr/) |
| The working material behind one decision | [`../0011-consumer-values-in-props/`](../) and its four siblings |
| An approach already refused | [`../shared/refuted.md`](../shared/refuted.md) |
| The verification record, and the author's rulings on it | [`../BUILD-SPEC.md`](../BUILD-SPEC.md) §1 |
| What the whole redesign still owes | [`../CLOSE-OUT.md`](../CLOSE-OUT.md) |
| A question still open, or a call an earlier build made alone | [`../BUILD-LOG.md`](../BUILD-LOG.md) |
