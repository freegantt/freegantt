# Brief S7.12c: small fixes from the 0.2.0 review

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Slice name: `s7-12c-review-fixes`. Port: 5343.

Source: `review-0-2-0.md`, findings O3, O8, O9, O10, O11, O12, O13, O14. Read those rows first. Each one has a concrete failing case.

## Change

Write a failing test first for each item, then fix it. One commit per item.

1. **O3** `src/render/dom/decorations.ts`: a recycled decoration node resets its width and text when its kind changes.
2. **O8** `src/scheduling/working-calendar.ts`: add `'invalid-working-calendar'` to the closed `BuiltInThrownCode` union. Update the API report.
3. **O9** `src/scheduling/float.ts`: `projectFinish` includes loop members' ends, as its doc says.
4. **O10** `src/extensions/features/entry-dependencies-selection.ts`: keep the five key handler disposers and call them on uninstall.
5. **O11** `src/extensions/features/entry-dependencies.ts`: the async `beforeDependencyRemove` path handles a rejection. Follow the existing error-reporting rule for async handlers; do not swallow silently.
6. **O12, O13** `harness/dependencies.ts`: "Remove Foundation 2" and "Replace" are safe to click twice. The page flag names the right set.
7. **O14** `harness/plugins/related-to.ts`: removing the `to` Entry removes its pair. Fix it through the public API. If the public API cannot do it, stop and `ask` (stop rule).
8. `CHANGELOG.md` lines under `### Fixed` in `[0.2.0]` for each consumer-visible fix.

## Constraints

- Do not touch `src/scheduling/schedule.ts`, `src/scheduling/propagate.ts` or `src/extensions/features/scheduling.ts`.
- Leave the plausible findings and nits alone.
