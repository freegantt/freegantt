# Issue wave — status board (2026-09-06)

The running plan for the multi-lane issue wave on `s5-start`. One line per item.
Mark an item done in the same commit that closes it. A line that is not marked done is not done.

**Legend:** `[x]` landed and verified · `[~]` in flight · `[ ]` not started · `[?]` waits on the repo owner

## 1. Issues

| # | What | State | Landed as |
|---|---|---|---|
| #143 | closed; drag path refiled as #240 | `[x]` | — |
| #209 | write shape C1–C4 | `[x]` | `cae7e75` |
| #223 | — | `[x]` | — |
| #226 | `Gantt` publishes its Dataset, typed with the caller's own Fields | `[x]` | `a9d0b2a` |
| #228 | the focus trap never scrolls to move focus itself | `[x]` | `5c49b3b` |
| #236 | command ids | `[x]` | — |
| #238 | unstated-edit merge | `[x]` | — |
| #239 | `moveEntryTo` names `segments`, core derives the envelope (D-S5-50) | `[x]` | `6eb6da1` |
| #241 | the lock demo cascades with `moveEntryTo` | `[x]` | `49bf022` |
| #210 | a `before*` veto says why, and its words reach the report | `[x]` | `c7bcb38` · closed |
| #234 | a refused cell commit reports, and says what is unsaved | `[x]` | `fbd2e47` · closed |
| #237 | a bad date names the call the consumer made | `[x]` | `62c5690` · closed, remainder is #242 |
| #232 | duplicate changeset rows behind the I4 false positive (D-S5-49) | `[x]` | `61ea020` · closed |
| #242 | `InvalidInstantError` stays message-shaped — split it, or document the exception | `[?]` | filed from #237 |
| — | `lock-entries.ts` returns `refuse(reason)`; three pages dropped their refusal callbacks | `[x]` | from #210 |
| #230 | entry-from-Segment refactor — R3, R4, R5 | `[ ]` | R0–R2 landed |
| #240 | drag-resize inverted span | `[ ]` | — |
| #142 | a locked field cannot be dragged or resized (D-S5-48) | `[ ]` | ruled, implementable |
| #222 | toolbar — decision settled; grill brief written | `[~]` | `36a2485` |
| #208 | Q2: `EntityAdded` row vs `FieldUpdated` row | `[?]` | Q1 settled by #209 |
| #224 | a popup layer with exclusive groups | `[?]` | — |
| #225 | the library offsets the label | `[?]` | with #220 item 3 |
| #220 | Q1–Q3 | `[?]` | — |
| #217 | confirm whether `'auto'` is already `'pack'` | `[?]` | — |
| #229 #231 #235 | trackers — close as their children land | `[ ]` | — |

## 2. The 24-hour branch review (`2026-09-06-s5-start-24h-review.html`)

Each row was re-checked against the code before it was accepted. A row marked
**disproved** stays here so nobody re-files it.

### Fix now

| Finding | Verdict | State |
|---|---|---|
| HIGH — four records still teach `moveEntryTo(entry, start, timeZone)` | real; the code takes `(entry, start)` | `[x]` |
| dead conditionals, `view/gesture-pipeline.ts` — both forks identical | real; proved by removing them and by a reverse mismatch test that still fails to typecheck | `[x]` |
| `api/gantt.ts` `reveal()` doc names `EntryNotFoundError`; the shell throws `RevealTargetNotFoundError` | real | `[x]` |

### This slice

| Finding | Verdict | State |
|---|---|---|
| candidate 1 — give the envelope its own module (`data/envelope.ts`), one reconciler with a `dropRefused` strategy | real; collides with #232, so it follows #232 | `[ ]` |
| candidate 2 — one `isMutationCancelled` predicate in `model/`, replacing three copies | real | `[ ]` |
| candidate 3 — `gantt-shell.ts` `allEntries` copies the whole dataset per preview frame (I5) | real | `[ ]` |
| candidate 4 — one Segment-diff helper for three hand-rolled copies | real, small | `[ ]` |
| harness `editing.ts` writes the retired `gantt.preset = { ...gantt.preset, snap }` spelling | real; harness-only, the API already moved to `gantt.snap` | `[x]` |
| harness `editing.ts` hand-rolls undo/redo instead of `commands.run()` | real; no default chord ships yet, so no double-fire today | `[x]` |

### The issue-wave review (`2026-09-06-s5-start-issue-wave.html`)

Its S2, S3 and the harness snap/undo rows were already fixed by `c96bee1` and `37b5f17`.

| Finding | Verdict | State |
|---|---|---|
| S1 — `lock-entries.ts` hand-rolls a refusal channel beside `refuse(reason)` | real; the Stop-rule case the review named worst | `[x]` |
| Q2 — `errors.ts` types `field` as `string` while `ErrorReport.field` is `FieldKey` | real; a consumer could not switch on a core key | `[x]` |
| S4 / candidate 2 — the refusal sentence is framed twice and has already drifted | real: `errors.ts` says "this change", `gesture-pipeline.ts` says "this ${kind}" | `[ ]` |
| candidate 1 — one public "can this Field be written on this Entry?" answer | real; the inline editor re-derives three core rules | `[ ]` |
| candidate 4 — bind `<TMeta, TFields>` once, `TDataset = TGantt['dataset']` | real; six aliases restate the pair | `[ ]` |
| S5 — `CellEditorCommitRefusal` carries "Commit", the word ADR 0006 retired here | real naming call | `[ ]` |
| `CONTEXT.md`'s Refusal entry names none of the three code families | real doc gap | `[ ]` |
| `#markInvalid` reads `COMMIT_REFUSAL_TEXT[reason]` twice | real, small | `[ ]` |
| S7 — comment sentences exceed the 25-word ASD-STE100 cap | real, repo-wide habit | `[ ]` |

### Next slice

| Finding | State |
|---|---|
| candidate 5 — `DomTarget` and the gesture context return one `ActedOn` | `[ ]` |
| candidate 6 — `BuiltInCommandId` derives from one `as const` table | `[ ]` |
| candidate 7 — close the remaining harness gaps in `src/` (`ViewPreset.label`, shipped snap settings, one theme write) | `[ ]` |
| candidate 8 — give the Selection its own `view/selection.ts` | `[ ]` |
| `CONTEXT.md` entries for `ActedOn` and `moveEntryTo` | `[ ]` |
| `extraEditsFor`'s surface question — document it as the plugin-author door, revisit at S7 | `[?]` |

### Not accepted

| Claim | Why not |
|---|---|
| harness `gantt-toolbar.ts` needs a paired `dataset` argument | closed by #226 on the same day the review published |
| scope creep — the palette redesign, the weekend-shading demo | outside this wave; the repo owner asked for neither a revert nor a defence |

## 3. Standing conflicts between lanes

- `src/data/entry-reader.ts` is the contended file. One owner per wave, never two.
- Lane E's work and Lane F's `#232` both touch it. Lane F must rebase onto `s5-start` before it merges.
