---
name: subagents
description: Dispatch work to a subagent — pick the right agent for the job, write a dispatch it can act on cold, and keep its context inside a 300k budget so nothing is lost. Use when you hand work to a subagent, when a running subagent nears the budget, and when a subagent is on its last leg (tests, lint, QC).
---

# Subagents

You coordinate. The subagent does the work and holds the details. Two things decide whether that works: **which agent you pick**, and **what you put in the dispatch**.

## Pick the agent

| The job | Agent | Model |
|---|---|---|
| Review, critique, gate check, second opinion — any work already done | `reviewer-planner` | best Opus, high effort |
| Plan new work — implementation strategy, design, task breakdown — before code exists | `reviewer-planner` | best Opus, high effort |
| Code changes, tests, refactors, investigations that end in a change | `implementer` | the default (Sonnet, medium effort) |
| Mechanical rename, typo, dead link, stale path — no judgment left in it | `simple-editor` | Haiku |
| Split a large job, dispatch its parts, merge the results | `work-coordinator` | best Opus, medium effort |
| Broad read-only search across many files, when you want the conclusion only | `Explore` | — |

Each agent names its model by alias (`opus`, `sonnet`, `haiku`), so every dispatch gets the current release of that tier.

Two rules decide the hard cases:

- **Judgment goes up, not down.** A task that needs a decision — a name to invent, a design to weigh, a test that now fails — is never `simple-editor` work. When you are unsure which of two tiers fits, take the higher one.
- **The builder never reviews itself.** Work built by `implementer` goes to `reviewer-planner` before you report it as done.

## Write the dispatch

A subagent starts cold. It does not see your conversation. Put these in the prompt:

- **The goal**, in one sentence.
- **The boundary** — what it must not touch, and what is out of scope.
- **The entry points** — the files, the branch, the commit range. Name paths; do not make it search for what you already know.
- **The completion test** — how it knows it is done, and what command proves it.
- **The budget**, in the words below.

## Context budget

A subagent that fills its window loses the work it did not write down. Two marks:

- **250k — wind down.** Stop at the next clean point and write a handoff.
- **300k — ceiling.** Nothing useful happens past here.

Put the budget in the prompt you send, in these words:

> Keep your context under 300k tokens. Report your context usage with each
> progress update and in your final report. When you pass 250k, stop at the
> next clean point and write a handoff instead of starting new work.

## Wind down

The clean point is the end of the current file, test, or command — not the end of the task. Then the subagent writes a handoff that carries:

- what is done, and how it was verified
- what is left, in order, with the next concrete action first
- files touched, and any decision or gotcha the next agent would otherwise rediscover

Read the handoff, then dispatch a fresh subagent with it.

## Last leg

A subagent already running the final tests, lint, or QC pass finishes that pass, even past 250k — a half-run suite tells you nothing. Its completion criterion is the result reported.

Watch that it lands there. When the result is in and the agent keeps working — new fixes, new files, a fresh investigation — send it a message: report the result and hand off now.

## Your own context

Dispatch to save your context, not to spend it. Read reports, not file dumps. Run independent tasks in one turn, and never dispatch two agents that write the same file.
