# Handoff — Lane E, refusals that say why

Branch `s5-errors-reporting`, worktree `/home/pawel/.polyscope/clones/d8643765/wt-data`, based on
`s5-start` at `36a2485`. `pnpm verify` green at every commit. The full Playwright suite (77 tests)
passes too.

| Commit | Issue | State |
|---|---|---|
| `c7bcb38` | #210 | Complete in core. One harness half is blocked — see below. |
| `fbd2e47` | #234 | Complete. |
| `62c5690` | #237 remainder (`src/time/input.ts`) | Complete. Two follow-ups recorded below. |

## What landed

**#210 — a `before*` veto can say why.** Shape B from the issue. `Refusable`
(`src/model/error-report.ts`) puts one call on the payload: `return move.refuse('…')`. It returns
`false`, so the boolean keeps its meaning. It sits on exactly the three `before*` events whose veto
core reports — `beforeChange`, `beforeEntryMove`, `beforeEntryResize` — and on no other, because an
event that raises no report cannot carry the words anywhere. `RefusalNote` (`src/data/event-bus.ts`)
collects one emit's reason; the first reason wins and two are never joined.
`MutationCancelledError` takes the reason and quotes it; `ErrorReport.reason` carries it unframed.

**#234 — a refused cell commit reports.** `COMMIT_REFUSAL_TEXT` in
`src/extensions/features/inline-editing.ts` gives `unreadable-value` and `refused-write` their words;
`#markInvalid` raises one report per refusal, reason key as `code`, `severity: 'info'`. The words are
the wrapper's `title` too. The typed text rides on `UnreadableCellValueError`, the report's `cause`,
never spliced into the message. A vetoed cell commit raises two reports on purpose, and the two
messages never restate each other — core's names the refusal, the plugin's names the unsaved value.

**#237 remainder.** `operation` threads through `toInstant` / `toEndInstant` from
`data/entry-reader.ts`. Each fault ends with a sentence about what to write. A `Date` holding no time
now carries the Date on `.value`, not the string `'Invalid Date'`.

## What is left, in order

1. **`harness/plugins/lock-entries.ts` still returns a bare `false`.** Its `beforeChange` handler
   should `return refuse(\`${id} is locked\`)`, and `announceRefusal` / `onRefusal` should go with it —
   along with `locks.onRefusal(...)`'s toast in `harness/editing.ts` and its log line in
   `harness/main.ts`. That is the last compensating code #210 named. **Not done because Lane F owns
   that file.** Until it lands, `harness/editing.ts` toasts a Fault, or a Refusal whose author said
   why (`report.reason !== undefined`), and the lock keeps speaking through its own callback.
   `e2e/plugins.spec.ts`'s `entry-15 is locked` passes on the callback today and would pass on
   `report.message` after the change.
2. **`src/api/gantt.ts` names no operation** at its five `toInstant` calls (lines ~269, 276, 283, 628,
   634). They should pass `'gantt.dateRange'`, `'gantt.todayLine'`, `'gantt.dateLines'`,
   `'gantt.zoomToSpan'`, `'gantt.panTo'`. Not done because Lane F owns that file, and it is why
   `operation` is optional rather than required. Making it required is the clean end state.
3. **`harness/main.ts` still hand-rolls the mobilization toast** (line ~325). It has no
   `watchAllErrors` subscription, so converting it means adding one. Reported, not tidied.

## Decisions a fresh agent would otherwise re-derive

- **`ErrorReport.reason` is a member as well as being quoted into `message`.** The message is what a
  console fallback prints; the member is how a page shows the consumer's own words with no framing,
  and how it tells a refusal that said why from one that did not. #234's "members, not spliced" rule
  is about the *user's typed input*, not about prose a consumer wrote for display.
- **`Refusable.refuse` is a property, not a method.** `@typescript-eslint/unbound-method` fires on
  `({ refuse }) => refuse('…')` when it is declared as a method, and destructuring is the call shape
  worth having.
- **`InvalidInstantError` stays message-shaped, and this is a finding, not an omission.** A
  `(value, reason, operation)` constructor does not fall out cleanly, because two families share the
  class: three value-shaped faults in `time/input.ts`, and two span-shaped faults in
  `data/entry-reader.ts` whose messages name an entry id and a kind. Structuring it means splitting
  it into two classes — a public-surface decision, and #237's owner should make it.
- **D-S5-46's `<` versus `<=` asymmetry is untouched**, as instructed.
- `src/data/entry-reader.ts:376-378` (#232 / D-S5-49) was not touched.
