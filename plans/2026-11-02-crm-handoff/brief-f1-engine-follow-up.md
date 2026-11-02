# Brief F1: engine follow-up

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `f1-engine-follow-up`. Port: 5301.

You work in the existing worktree of PR #672, branch `Pawel-IT/s7-propagation-engine`. Override of wave-3 "Base": stay on that branch, do not rebase it, and push to the existing PR. First merge `origin/Pawel-IT/Sscheduling-Work` into it (it adds `plans/` rulings only for your files; resolve trivially).

## Change (one commit each)

1. **Rename "pinned" to "manually scheduled" (ruling D7a).** Use `pk-rename-symbol` for symbols, then fix string literals: `ScheduleRequest.pinned` → `manuallyScheduled`, `BlockReason 'pinned'` and `ScheduleRuleKind 'pinned'` → `'manuallyScheduled'`, internal names, tests, comments, fixtures. `pnpm typecheck`.
2. **Push and pull (ruling D3, D3b).** Today the engine only pushes (`demandOf` keeps `delta > 0`). Make the default "as soon as possible": a successor moves to the earliest date its predecessors and its constraints allow, earlier too. Add a request option for "push only" (today's behavior). Name the option with the `naming` skill; read the call site aloud. An Entry with no incoming Dependency never moves from propagation.
3. **Start-no-earlier-than floor (ruling D4).** The request carries an optional per-Entry constraint floor. Push-and-pull never moves a start before it. A Dependency still wins over the floor (the date moves later). This is the first Constraint; name the type so S7.9 can add "finish no later than" and "must start on" later. Do not add those two now.
4. **Ruling D4, manually scheduled side.** A manually scheduled Entry whose Dependency breaks keeps its dates and gets a diagnostic that names the Dependency. Check that this already holds; add a golden fixture.
5. **Golden fixtures** for items 2–4: pull earlier, push only, floor holds, link beats floor, manually scheduled conflict. Keep the 5,000-chain test.
6. **Glossary (ruling D7).** In `CONTEXT.md`: retire **Pinned** (list it under _Avoid_ of the new entry), add **Manually scheduled**, fill in **Constraint**, and add a short entry for each public engine term a consumer meets: Schedule request, Schedule result, Schedule change, the diagnostics. Follow the format of the entries around them. Read the `domain-modeling` skill first.
7. `CHANGELOG.md` lines in the same commits as the consumer-visible changes. Update `etc/freegantt.api.md` (`pnpm api:update` or what `docs/agents/ci.md` names).

## Constraints

- `scheduling/` imports `time/` and `model/` only. Worklist loop, never recursion. Pure and deterministic.
- The I4 dev assert stays: the engine never overwrites a proposed field.
- No plugin, no harness. S7.7 does that.
- If push-and-pull needs a design choice the rulings do not cover, `ask`.
