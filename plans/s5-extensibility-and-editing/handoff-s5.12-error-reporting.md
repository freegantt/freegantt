# Handoff — #159 settled and recorded, S5.12 not implemented

**Written:** 2026-09-05 · **Branch:** `s5-start` · **Base:** `b1233f7` (after #200)
**Commits from this session:** `07d76ed`, `962f20e`, `3760ac9` — all docs, **zero `src/` changes**.

The design for issue #159 is settled, grilled and written down. Nobody has written the code. This
file says what landed, what is left, and what must not be re-opened.

## 1. What landed

| Where | What |
|---|---|
| [`docs/adr/0009-…`](../../docs/adr/0009-core-raises-an-error-report-the-consumer-retains-it.md) | The decision: core raises, the consumer retains. Four rejected alternatives with reasons. |
| [`s5.12-error-reporting.md`](./s5.12-error-reporting.md) | The step: D-S5-40/41/42, the payload, the seven console sites and their severities, files, tests, TODO boxes. |
| `CONTEXT.md` | New **Errors** section — **Refusal**, **Error report**, **Severity**. **Refusal notice** moved into it; its `_Avoid_: Error` line amended. |
| `README.md` §Development | `isDevMode()` is a library-build flag, not a consumer's. Evidence and the rule for new call sites. |
| Issue #159 | Rewritten: retitled, stale claim struck, every original open question answered. `needs grill` removed. |
| `README.md` (S5 tracker), `plans/03-slices.md` | Gallery-and-gate renumbered S5.12 → **S5.13**. New S5.12 is this step. |

## 2. What is left, in the order I would do it

### A. Implement S5.12 — the actual work

Every TODO box in [`s5.12-error-reporting.md`](./s5.12-error-reporting.md) §4 is unticked. The step
file carries the full file table and test list. Start there, not here.

The shape, so you can sanity-check the step file rather than read it cold:

- `ErrorReport` / `ErrorCode` / `ErrorSeverity` in `model/errors.ts`, beside `FreeGanttError`.
- `error` joins **both** `DatasetEventMap` and `GanttEventMap`. Sync only, no `before*` pair.
- `watchAllErrors([dataset, gantt], handler)` in `api/`, beside `attemptMutation`. De-dupes by
  emitter identity, returns one disposer.
- Every refusal raises, silent gesture vetoes included. `by` names who refused.
- The seven `console.*` sites raise **and** keep their console call as a fallback that fires only
  when nothing is subscribed to `error`.
- `CellEditorRefusal`'s keys go kebab-case and become codes; `view/styles.ts` selectors follow.
- No presenter ships. `harness/editing.ts` demos a toast.

**Do not skip `harness/editing.ts`.** CLAUDE.md makes the harness the first consumer, and this
step's whole claim is that a consumer can build the notification UI in three lines. If that turns
out to need more than three lines, the design is wrong and the step file should say so.

### B. Audit the six other `isDevMode()` guard sites

**Correction to an earlier count in this session's conversation: there are seven guard sites, not
fourteen. Import lines were counted as call sites.** One (`render/dom/index.ts:79`) is handled by
S5.12. The other six:

| Site | |
|---|---|
| `src/view/plugin-ports.ts:415` | |
| `src/extensions/plugin-runtime.ts:103` | dropped-reconfigure warning |
| `src/data/build-commit-change-set.ts:66` | early-return guard |
| `src/data/transaction.ts:163` | |
| `src/data/serialization/index.ts:73` | early-return guard |
| `src/view/gantt-shell.ts:473` | `options.scale` conflict warning |

Every one is dead-code-eliminated from `dist/`. The question to ask of each is exactly one:
**was this written expecting a *consumer's* dev build to reach it?** If yes, it has never fired for
a consumer and the behaviour is a bug. If it is a library-development assertion — an invariant check
that helps *us* while running the harness from source — it is correct as written and wants no change.

The ones read so far look like the second kind. None has been checked properly. **Not filed as an
issue yet.** File it before doing it, because a "no change needed" outcome still needs a record, or
the next person re-derives this from scratch.

### C. The `.githooks/pre-commit` fix — issue #203

Ready, with a corrected fix in the issue body. **Needs the user's go-ahead.** Two sessions have
now declined to change a shared repo guard on a peer's say-so, and a third should decline too.

If the user says go: #203's body has the corrected script. Also sweep `staged_ts` a few lines below
— it carries the same unquoted expansion into `eslint`, is outside the fix's path, and should be
fixed in the same change.

### D. `plans/00-overview.md` — orphaned, dirty, exposed

One line appended to the S6 → S7 gate row about #197 (`mergeEntryEdits`, `Map`-spread composition).
Three sessions have disclaimed it. It has sat uncommitted through this whole session.

It is the same subject and voice as a `plans/03-slices.md` #197 block that was already swept into
`07d76ed` (see §3), so it is almost certainly one author's unfinished pair.

**Do not commit it as part of other work, and do not revert it.** It touches the locked D1–D12 gate
table. Ask the user whose it is. If it is nobody's, it still wants its own commit with a reason
attached, not a silent revert of someone's thinking.

## 3. Hazards in this working tree — read before you commit

**The pre-commit hook widens partial staging (#203, `critical`, open).**
`.githooks/pre-commit` runs `prettier --write` then `git add -- $staged_all`, which re-stages every
touched file **whole**. A partially staged file commits its unstaged hunks too. `git add -p`,
`git apply --cached` and stage-this-hunk are all defeated.

**Verification before the commit cannot catch it.** This session ran `git diff --cached --stat`,
read the correct `1 insertion(+), 1 deletion(-)`, and still swept a peer's spec paragraph into
`07d76ed`. The widening happens after every check an author can run.

Until #203 lands, the only reliable check is **after** the commit:

```
git show --stat <sha>     # confirm the file list is only yours
```

`--no-verify` bypasses the hook, per the hook's own header.

**Three sessions commit from this one tree.** `HEAD` moved four times under this session while it
worked. Check `git status --short` immediately before staging, and never `git commit -a`.

**Use `<<'EOF'`, quoted, for every heredoc.** The quoted delimiter disables backticks, `$(...)` and
`$VAR` in the body. A peer's unquoted `gh` call executed a stray `git commit` in this shared tree
this session. `--body-file` is a per-command remedy; the quoted delimiter is the general one, and it
covers `git commit -F -`, which `--body-file` does not.

## 4. Settled — do not re-open

The full decision tree is in [ADR 0009](../../docs/adr/0009-core-raises-an-error-report-the-consumer-retains-it.md)
and issue #159. The four alternatives below were each considered and rejected **with reasons**, so
re-proposing one needs new evidence, not a fresh opinion.

1. **A stored log (`gantt.problems` / `gantt.errors`, a ring buffer).** Rejected. It puts a retention
   policy in core, cannot record what a Dataset raises before any Gantt exists, and never
   tree-shakes away. This is what #159 originally asked for.
2. **An error-reporting plugin that records.** Rejected on observability, not taste. A plugin cannot
   see a veto: `DatasetPluginContext.events` is `beforeChange`/`change` only, and no event reports
   that a veto happened.
3. **The Gantt forwarding the Dataset's reports.** Rejected: double delivery with two Gantts on one
   Dataset, misses construction-time reports, and makes the Gantt claim authorship it does not have.
4. **A build-time switch for the console fallback** — including `isDevMode()`, which is what an
   earlier draft of this step used and which is *wrong*: one `dist/` serves every consumer and their
   production mode is invisible when we build it.

Naming is settled too, and two of these were argued and lost on purpose: the event is `error`
(chosen over the more accurate `problem`, for familiarity), and `severity` carries
`'error' | 'warning' | 'info'` (chosen over the more accurate `category: 'refusal' | 'fault'`,
because a field named `severity` must hold severities). `CONTEXT.md`'s **Severity** entry records
both trades.

## 5. Verify before you call it done

```
pnpm verify        # format/typecheck/lint/boundaries/guards/unit/vendor-names/disables/build/api-report
pnpm api-report    # etc/freegantt.api.md must be regenerated and committed — this step adds exports
```

`pnpm api-report` is not optional here: `ErrorReport`, `ErrorCode`, `ErrorSeverity` and
`watchAllErrors` are new public exports, and S5.13's gate freezes the API report.
