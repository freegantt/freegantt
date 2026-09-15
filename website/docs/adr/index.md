---
id: index
title: "The decision records"
---

One file per decision, numbered in the order the decision was taken. A record says **why**, and it names the evidence. A spec (`plans/00`–`04`) says **what is true now**. When the two disagree, `src/` is the answer.

An accepted record is superseded, never rewritten. A later record states the change, and the earlier body stays as it was written.

## The gap at 0014

**There is no ADR 0014. The number is not reused.**

`0014 — the plugin-author surface` was split out of [ADR 0011](0011-consumer-values-live-in-props.md) on 2026-09-09. It stayed a draft. The author withdrew it on 2026-09-11, before its build started, and no line of it ever reached `src/`. The file was deleted on 2026-09-11 so that no reader can mistake a withdrawn draft for the design.

**Why it was withdrawn, and why that was right.** The draft renamed `entries.fieldValue` to `entries.read` and made a plugin key prefix a rule the registry checks. Neither earned its price:

- **The prefix.** A prefix is a convention a plugin follows — `scheduling:progress` ([ADR 0008](0008-progress-is-scheduling-not-core.md)) — not a rule core enforces. Enforcement bought a reserved-name list and two write-door refusals, and it protected nothing that a declaration collision does not already catch.
- **The rename.** [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the save format, which removed the draft's own stated price for deciding late. The rename then had no deadline, and a better door arrived: [ADR 0017](0017-the-entry-answers-questions-about-itself.md) puts the read on the row itself, as `entry.read(key)`. One door on the object that holds the value beats a second by-key door beside `fieldValue`.

**What survived the withdrawal, and where it lives now.** Three things the draft held were real, so they were rehomed rather than dropped:

| What | Where it lives now |
|---|---|
| `entry.read(key)` is the one Field read, and [#274](https://github.com/Pawel-IT/FreeGantt/issues/274)'s duration door closes with it | [ADR 0017](0017-the-entry-answers-questions-about-itself.md) |
| A plugin that installs over values it did not write | [ADR 0019](0019-one-plugin-one-install-site.md) |
| An undeclared key is never written by the library | [ADR 0011](0011-consumer-values-live-in-props.md), and `CONTEXT.md`'s *props* entry |

The full close-out is in [`plans/field-redesign/CLOSE-OUT.md`](https://github.com/Pawel-IT/FreeGantt/blob/main/plans/field-redesign/CLOSE-OUT.md). Working material under `plans/field-redesign/` still names ADR 0014, because it records what was thought at the time. Read it as history.
