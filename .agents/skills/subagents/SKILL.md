---
name: subagent-context-budget
description: Keep a subagent's context inside a 300k budget and get a handoff before it runs out. Use when you dispatch work to a subagent, when a running subagent reports it is near the budget, and when a subagent is on its last leg (tests, lint, QC).
---

# Subagent context budget

A subagent that fills its window loses the work it did not write down. Two marks:

- **250k — wind down.** Stop at the next clean point and write a handoff.
- **300k — ceiling.** Nothing useful happens past here.

## Dispatch

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
