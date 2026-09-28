---
name: subagents
description: Dispatch work to a subagent — pick the right agent for the job, write a dispatch it can act on cold, and keep its context inside a 300k budget so nothing is lost. Use when you hand work to a subagent, when a running subagent nears the budget, and when a subagent is on its last leg (tests, lint, QC).
---

# Subagents

You coordinate. The subagent does the work and holds the details. Two things decide whether that works: **which agent you pick**, and **what you put in the dispatch**.

## Dispatch is not the default

Quick or simple work stays in your own session. Read the file, make the edit, run the check — do it yourself. Dispatch only when the job actually needs it: it is large enough to risk your context, it splits into parts that run in parallel, or the user explicitly asked for an agent or a subagent. "This has a few steps" is not, by itself, a reason to dispatch.

**You are the coordinator by default.** Splitting a job into tasks, routing each to an agent, and merging the results is work the current session does itself. Spawn a `work-coordinator` subagent only when the user explicitly asks for one — never as your default way to run a multi-part job.

## Pick the agent

| The job | Agent | Model |
|---|---|---|
| Review, critique, gate check, second opinion — any work already done | `reviewer` | Opus 1M, medium effort |
| Plan new work — implementation strategy, design, task breakdown — before code exists | `planner` | Opus 1M, high effort |
| Code changes, tests, refactors, investigations that end in a change | `implementer` | Sonnet 1M, medium effort |
| Large mechanical sweep — a rename or a docblock rewrite across about 10+ files, no judgment left in it | `simple-editor` | Haiku |
| Large read-only lookup — about 10+ files or 5+ searches | `code-finder` | Haiku |
| Split a large job, dispatch its parts, merge the results | you, the current session — `work-coordinator` only if the user explicitly asks for it | the owner's choice |

Do a small rename, docblock edit, or lookup in your own session. A dispatch costs more than it saves there.

Each agent names its model by alias (`opus`, `sonnet`, `haiku`), so every dispatch gets the current release of that tier. The agent file owns the model and the effort. Leave the `model` parameter off every dispatch.

Three rules decide the hard cases:

- **Judgment goes up, not down.** A task that needs a decision — a name to invent, a design to weigh, a test that now fails — is never `simple-editor` work. When you are unsure which of two tiers fits, take the higher one.
- **Review is not automatic.** `reviewer` runs on Opus — expensive, and not a step every dispatch earns. Send work to it only when the user asks for a review, or when the finished work is a massive or high-risk change (a multi-file slice, a public API surface, a locked-decision area). An ordinary small change reported as done does not need a review pass first.
- **One `code-finder` per session.** Start it at the first large lookup, and record its id. Send every later lookup to that same agent with `SendMessage`. A fresh one reads the codebase again with no cache. Retire it after 45 minutes with no activity, or when it passes 200k, and start a fresh one.

## Write the dispatch

A subagent starts cold. It does not see your conversation. Put these in the prompt:

- **The goal**, in one sentence.
- **The boundary** — what it must not touch, and what is out of scope.
- **The entry points** — the files, the branch, the commit range. Name paths; do not make it search for what you already know.
- **The completion test** — how it knows it is done, and what command proves it.
- **The budget**, in the words below.

## Context budget

A subagent that fills its window loses the work it did not write down. Three marks:

- **200k — wind down.** Stop at the next clean point and start the handoff.
- **250k — handoff written.** The end of the landing window.
- **300k — ceiling.** Nothing useful happens past here.

The 50k between the first two marks is a **landing window**, and it is the whole
point of the first mark. An agent told to stop still has to finish the file it is
in, run the check it started, and write the handoff — and it writes that handoff
with a full window's worth of detail to draw on. Cut the window and you get a
stopped agent instead of a landed one.

Put the budget in the prompt you send, in these words:

> Keep your context under 300k tokens. Report your context usage with each
> progress update and in your final report. When you pass 200k, stop at the
> next clean point and write a handoff instead of starting new work. You have
> until 250k to finish that handoff, so land it properly — do not cut it short.

An agent that is close to full reports late, or not at all. So you watch it too.

**Never force-stop a planner.** A planner's whole output is the plan it writes last.
Stop it and you get nothing. Past any mark, send it a message and let it finish, even
past 300k. The marks tell a planner to stop research and write, never to quit.

## Watch it yourself

**Every dispatch starts a watcher.** A subagent runs while your turn is blocked, so
asking it to self-report is the half you do not control. The other half is a
background watcher that reads its transcript and wakes you.

Start the watcher and dispatch in **one turn** — the watcher first, in the same
message as the `Agent` call:

```
Bash(run_in_background: true):
  .agents/skills/subagents/watch-agent-context.sh
```

Keep the pid that Bash returns. You will kill that pid when the wave ends.

It polls every agent transcript in this **project** — from any session, not only yours —
and exits when one passes its next mark or when they all stop writing. Each agent has two
marks: 200k (wind down) and 250k (landing window over). A background command that exits
re-invokes you, so its exit *is* the alert — you get it mid-flight, not after the report
lands.

**It counts what the API reports, not what the UI shows.** It reads the usage line of
the last finished reply: that reply's input plus its output. The UI and the harness's
`subagent_tokens` count run ahead of it — one planner peaked at 247k in its transcript
while the harness reported 300k. So a mark the UI passed can still be unreached for the
watcher. While an agent streams one long reply, the watcher also waits for that reply
to land. Check with `ps` that it runs before you call it dead.

**It alerts once per agent per mark.** It writes each alert to a state file in `TMPDIR`.
A restarted watcher reads that file, so it never repeats an alert. It watches each agent
for that agent's own next mark, so one watcher serves agents at different stages.

**The watcher reads transcripts. It never stops an agent** — you do that, by message,
which is what leaves the agent room to land.

**The watcher dies with the wave.** Kill it in the same turn the last agent you
started has reported, or the moment that dispatch is interrupted. Do not leave it
until `MAX` (7200s). A watcher with no agent left still runs to timeout, then spends
a later turn on `stopped after 7200s`. That notification is waste.

```
kill <pid>
```

Done means: this session has no `watch-agent-context.sh` process after the last
report lands, after an interrupt, and after you decide not to dispatch. If the
watcher already exited because every agent finished under budget, there is nothing
to kill.

**Exit code 1 is the alert, not a failure.** The harness reports it as
`Background command ... failed with exit code 1`. That wording is the harness's, not the
watcher's. The watcher has no error path: it exits 1 to mean *an agent crossed the mark,
go read the line it printed*. Treat that notification as the signal to act on. Dismiss it
as a crash and the agent runs past its landing window with nobody telling it to stop.

| Exit | Printed line | What it means |
|---|---|---|
| **1** | `... is at N tokens (mark M)` | **An agent crossed a mark. Act now.** |
| | | The line **names the agent** — and it may belong to another session. Read the name before deciding whether it is yours. |
| 0 | `every agent it watched has stopped writing.` | The wave is over. The watcher already died with it. |
| 0 | `stopped after Ns` | The watcher timed out (`MAX`, 7200s). You left it running. Restart it only if an agent you started is still running; otherwise the wave is over. |

Both quiet outcomes exit 0, so the printed line is what separates them. Read it.

Then act on what it says:

- **An agent passed 200k** — send that agent a message: stop at the next clean point
  and write a handoff.
- **An agent passed 250k** — it spends the landing window on new work. Tell it to
  write the handoff now and report. A planner gets the same message and no more: let
  it finish its plan.
- **After either alert** — start the same watcher command again, in the same turn,
  if any agent you started still runs. Keep the new pid. It skips the alert you just
  handled and still watches every other agent at 200k.
- **Every agent stopped writing** — the watcher already exited. Do not start
  another.

One watcher covers a whole wave. Dispatch three agents in one turn, start one watcher.
When the last of those three has reported, kill that watcher in that turn.

**Never run two at once.** A watcher polls every agent transcript in the project, not the one
you just dispatched, so a second watcher watches the same agents and tells you the same thing.
Start another only after the one you have exits. Dispatch across four turns with a watcher each,
and one agent crossing 200k wakes you four times — four alerts, one event, and the four exit
codes read as four failures. Leave four watchers alive after the agents finish, and you get
four timeout turns hours later.

**A live watcher can alert on someone else's agent.** It is scoped to the
project directory, so with several sessions working one repo it sees their agents too.
That does not keep it alive after *your* wave ends — kill it anyway. If it exits
with a 200k line while it is still running, read the name. If it is not your agent,
tell the session that owns it rather than dropping the alert.

## Wind down

The clean point is the end of the current file, test, or command — not the end of the task. Then the subagent writes a handoff that carries:

- what is done, and how it was verified
- what is left, in order, with the next concrete action first
- files touched, and any decision or gotcha the next agent would otherwise rediscover

Read the handoff, then dispatch a fresh subagent with it.

## Last leg

A subagent already running the final tests, lint, or QC pass finishes that pass, even past 200k — a half-run suite tells you nothing. Its completion criterion is the result reported.

Watch that it lands there. When the result is in and the agent keeps working — new fixes, new files, a fresh investigation — send it a message: report the result and hand off now.

## Your own context

Dispatch to save your context, not to spend it. Read reports, not file dumps. Run independent tasks in one turn, and never dispatch two agents that write the same file.
