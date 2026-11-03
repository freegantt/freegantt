---
status: accepted — ruled 2026-11-02 by the owner. Amends invariant I4 in `plans/01-domain-architecture.md` §11.
decided: the extension hook may replace a Field the transaction body proposed on the same Entry only when its result marks that Field as an override. An unmarked overwrite still throws in dev mode.
open: none.
---

# An extension overrides a proposed field only when it says so

## Context

Invariant I4 says an extension never overwrites user input. `data/` enforces it with a dev-mode check: the extension hook may not propose a Field the transaction body already proposed on the same Entry.

The owner ruled how a user date meets a Dependency (S7 ruling D4). A user drags "Build" to start before its predecessor "Design" ends. The date becomes a "start no earlier than" constraint, and the Dependency still wins, so "Build" starts after "Design". Microsoft Project, Primavera P6 and Syncify all behave this way.

To do this, `scheduling()` must replace the start the user proposed, in the same transaction. The I4 check blocks exactly that.

## Decision

**An extension may override a proposed Field, but only when it marks the override.**

- The extender's result can mark Fields it overrides on an Entry the body proposed.
- A marked value replaces the body's value in the same transaction. One undo restores the user's previous value.
- An unmarked overwrite still throws in dev mode. A plugin that overwrites user input by mistake still fails loudly.
- `SchedulingPolicy.resolveEdit` keeps its rule inside the engine: the engine never moves a proposed field. The plugin turns the proposal into a constraint first, then marks the engine's result as an override.

## Rejected alternatives

- **Remove the check.** Every extension loses the safety net, and a buggy plugin can drop user input quietly.
- **Keep I4, and the user's date always wins.** This reverses ruling D4. `scheduling()` keeps it as an option.
- **Clamp the move during the drag.** This needs a new core move-limit seam, and it does not cover typed dates.

## Consequences

- I4 reads: `schedule()` never mutates its input, the policy never moves a proposed field, and an extension overrides a proposed Field only when it marks the override.
- `data/` gains the override marker on the extender result. The dev check reads it.
- A reviewer finds every override by searching for the marker.
