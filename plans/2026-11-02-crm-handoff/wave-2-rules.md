# Rules for every wave-2 worker

`common-rules.md` (same folder) applies in full. Read it first. This file adds to it.

## The owner's rulings

`decisions.md` (same folder) holds the owner's rulings on the S7 design. **It overrides** `plans/s7-dependencies-and-scheduling/README.md` on the `Pawel-IT/s7-link-seam-design` branch (PR #667) wherever the two disagree. Read the README with `git show origin/Pawel-IT/s7-link-seam-design:plans/s7-dependencies-and-scheduling/README.md`.

Words, from the rulings:
- **Connector**: the line core draws between two bars. `ConnectorInput` is what a plugin returns. Never "link" or "spec" in new code.
- **Dependency**: the stored rule (FS/SS/FF/SF, lag). Owned by `entryDependencies()`.
- **Working calendar**: `workingCalendar()` / `WorkingCalendar`, owned by the scheduling plugin. Always optional.

## Ownership across wave 2

| Worker | Owns |
|---|---|
| P (plan + ADRs) | `plans/`, `docs/adr/`, `CONTEXT.md` |
| S7.1 (connector seam) | `src/layout/`, `src/render/`, `src/view/`, `src/api/` (connector parts), `harness/` connector page |
| S7.5 (working calendar) | `src/scheduling/working-calendar*.ts`, its export line in `src/api/index.ts`, its harness page |
| S7.6 (engine) | `src/scheduling/` except `working-calendar*.ts`, its export lines in `src/api/index.ts` |

Implementers do not edit `plans/`, `docs/adr/` or `CONTEXT.md`, except their own progress file. If you need a glossary term that is not there yet, use the word from `decisions.md` and say so in `worker_done`.

`src/scheduling/index.ts` is shared by S7.5 and S7.6. Each one adds its own export lines only. Expect a trivial merge.
