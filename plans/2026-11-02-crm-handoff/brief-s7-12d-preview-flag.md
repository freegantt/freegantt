# Brief S7.12d: an extension knows when an edit is a drag preview

Read `common-rules.md`, `wave-2-rules.md` and `wave-3-rules.md` first. Read `docs/agents/api.md` before you add the field. Slice name: `s7-12d-preview-flag`. Port: 5344. This blocks the 0.2.0 release. The owner approved the field.

Source: `review-0-2-0.md` finding O5, and the numbers in `progress-s7-12b-plugin-flags.md`. `extend()` in the scheduling plugin runs on every drag-preview frame and runs a whole-plan `calculateFloat()` each time, then discards the float writes.

## Change

1. **Add a public read-only field to `EditRequest`** (`src/model/dataset.ts`). It answers "is this edit a drag-preview frame that never commits?". Pick the name with the `naming` skill. Write the call site first: `if (request.<name>) …`. A required `boolean` is preferred over an optional one, so the answer is never "unknown". Doc comment: what it means and what an extension may skip.
2. **Fill it in core.** `createEditRequest` (`src/data/edit-request.ts`) takes it. The preview path (`extraEditsFor` in `src/api/dataset.ts`, called from `src/view/gesture-pipeline.ts`) passes true. The commit path in `src/data/transaction.ts` passes false. A unit test covers each path.
3. **Use it in the scheduling plugin** (`src/extensions/features/scheduling.ts` `extend()`): skip `calculateFloat()` on a preview frame. Bar positions during the drag do not change. Float and critical marks update on commit. Test: a preview frame calls no float pass; the commit still writes float and critical.
4. **Measure** a preview frame on a 1,000-Entry chain before and after. Put the numbers in your progress file and the `worker_done`.
5. Update the API report (`pnpm -s build && pnpm exec api-extractor run --local`). Update `docs/06-plugin-authoring.md` where it describes `EditRequest`.
6. `CHANGELOG.md`: one `### Added` line (the field) and one `### Changed` line (scheduling skips float on preview) in `[0.2.0]`.

## Constraints

- Atomic commits: the core field and its fill, the plugin use, the docs.
- No harness change is expected. If the harness needs one to show it, keep it minimal.
