# Build log — questions and judgement calls

> **This file survives a crashed session.** Everything a build raises goes here, the moment it comes
> up. A question asked only in a chat window is lost when that window closes.

Three kinds of entry live here:

- **Q — a question for the author.** It waits for an answer. Nobody guesses it.
- **J — a judgement call an agent made alone.** The build did not stop, so the call is recorded for
  review. A reviewer can reverse it.
- **N — a note the build owes somewhere else.** An issue comment, a label, a follow-up.

**Write the entry before you continue.** Add the answer under the entry when it arrives. Never delete
an entry — mark it **ANSWERED**, **REVERSED**, or **DONE** and keep the text.

Settled rulings move to [`shared/rulings.md`](shared/rulings.md). Refused approaches move to
[`shared/refuted.md`](shared/refuted.md). This file holds what is still in motion.

---

## Open

### Q1 — Does #212's stale `schema: 4` sentence get a note?

**Raised:** 2026-09-10, Build 0 (ADR 0016). **Status:** open, waiting for the author.

Issue #212 is **already closed** — 2026-09-06, `COMPLETED`, label `fixed needs review`. An earlier
coordinator note called it a close candidate. That note was wrong; no close is owed.

The body still carries one sentence ADR 0016 retires:

> **`SegmentId` is stable, and the document goes to `schema: 4`.**

`SegmentId` stability stands. The `schema: 4` half does not: there is no document and no schema
counter. Segment-id persistence is the consumer's job now, through `entries.all`.

**The question:** does the author want a comment on the closed issue that says so, or does the ADR
record it well enough on its own?

### Q2 — Do Build 0's six commit trailers get rewritten?

**Raised:** 2026-09-10. **Status:** open, waiting for the author.

Build 0's agent wrote `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` on all six commits.
The configured trailer is `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

The branch is pushed now, so a rewrite costs a force-push. It was free when this was raised.
Every later build carries the correct trailer.

### Q3 — Does the `sonnet[1m]` frontmatter suffix take effect?

**Raised:** 2026-09-10. **Status:** open, the measurement is running.

Build 0's agent ran on plain `sonnet` and auto-compacted twice near 166k tokens. That is the ceiling
of a 200k window, not a 1M window. The model documentation says Sonnet 5 always runs at 1M and has no
`[1m]` suffix to select. The transcript disagrees with the documentation.

Build 1 runs with `model: sonnet[1m]` in `.agents/agents/implementer.md`. Its watcher prints
`SUFFIX DID NOT TAKE` if it compacts below 200k.

**Two answers are still possible:** the subagent really gets a 200k window, or the harness compacts
subagents at a fixed point whatever the window is. The author is waiting on this result.

---

## Answered

### Q4 — May the builds edit `plans/**` without asking each time? — **ANSWERED: yes**

**Raised and answered:** 2026-09-10, by the author.

A build that retires a rule must retire the sentence that states it, in the same change. The
checkpoint question in `.claude/hooks/protect-spec.sh` fired on work the author had already approved.

The author relaxed the `plans/**` arm for the length of the build-out. A `TEMPORARY`-marked block
near the top of the hook short-circuits it.

**The grant covers spec text the six ADRs already decided. It does not cover D1–D12.** A locked
decision still changes only by an explicit human decision. The `package.json` arm and the
guard-loosening arm were never relaxed — both still exit 2.

**The restore is owed.** It is tracked in [`CLOSE-OUT.md`](CLOSE-OUT.md).

---

## Notes owed elsewhere

### N1 — #266 is raised, not closed — **DONE (comment posted)**

Build 0 found a two-way name collision on `Document`. Only the serialized-`Dataset` `Document` is
retired; the DOM one keeps the name. The comment is posted. The issue stays open for the author.

### N2 — `harness/main.ts` naming residue — **carried to the review phase**

`#document-json` / `documentJson` and `#export-btn` / `exportBtn` survive in the harness. "Document"
is retired and nothing is exported any more. This is naming residue, not an API gap, so Build 0 did
not stop for it. The end-of-redesign review pass picks it up.
