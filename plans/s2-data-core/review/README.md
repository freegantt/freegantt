# S2.5 / S2.6 review

**Range:** `d7f7a34` (S2.4 close) … `HEAD` (`344ffe0`)
**Date:** 2026-08-27
**Question:** did undo/redo and Document serialization make a ball of mud? Is the Dataset interface easy for a consumer, the harness, a human, and an agent?

| File | What it is |
|---|---|
| [code-review.md](./code-review.md) | Two-axis review: Standards vs Spec |
| [validated-issues.md](./validated-issues.md) | High-signal runtime bugs and AGENTS.md breaches (S2.5 + S2.6), reproduced |
| [simplify.md](./simplify.md) | Simplify pass: findings, fixes landed, skips |
| [architecture-review.html](./architecture-review.html) | Deepening candidates (open in a browser) |
| [sync-keyed-undo-order.md](./sync-keyed-undo-order.md) | Quick review of `de8a4e1` (DOM order after undo) |

**Short answer:** not a ball of mud. History and serialization stay removable leaves. The consumer Dataset interface is small: `undo` / `redo` / `canUndo` / `canRedo` / `toJSON` / `fromJSON`. Internals still split invert, replay, and insertion-order restore across three modules. That is the friction to deepen next, not a collapse of layers.
