---
name: pk-implement-with-subagents
description: Implement a written plan through subagents — one fresh agent per unit of work, each with a context watcher on the 200k/250k/300k ladder. Use when a plan file or build folder already exists and the work should be dispatched rather than done in this session.
argument-hint: 'path to the plan file or build folder'
disable-model-invocation: true
---

# Implement a plan in subagents

**Coordinating is your job, and you do not delegate it.** You dispatch, watch, verify, and report. You do not build, and you do not spawn a coordinator to hold the plan for you — a second coordinator is a second set of unverified claims. If the plan needs re-cutting mid-run, you re-cut it.

## 1. One agent per unit

A unit is one plan file, one ADR, one slice — whatever the plan already cuts it into. Spawn a **fresh** agent for each:

```
Agent({ subagent_type: "implementer", model: "sonnet[1m]", prompt: … })
```

**Never start a new unit on an agent that finished one deep in context.** Its remaining headroom is the previous unit's leftovers, and it will run the ladder from halfway up.

Give each agent: the plan file to read, the gate command, the constraints it must not violate, and what "done" means. Tell it to tick boxes as it goes and never batch the ticks.

## 2. Arm a watcher before you walk away

The spawn result carries an `output_file`. That transcript holds `usage` records — a number you may read. **Never `Read` or `cat` that file.** It is full JSONL and will overflow you.

```
Monitor({
  persistent: true,
  description: "context ladder — <unit name>",
  command: `OUT=<output_file>; seen=0; rung=0
while sleep 20; do
  t=$(tail -400 "$OUT" 2>/dev/null | node -e '
    let n=0;require("readline").createInterface({input:process.stdin})
      .on("line",l=>{try{const u=JSON.parse(l)?.message?.usage;
        if(u)n=(u.input_tokens||0)+(u.cache_creation_input_tokens||0)+(u.cache_read_input_tokens||0);}catch{}})
      .on("close",()=>console.log(n))')
  [ -z "$t" ] && continue
  [ "$t" -lt "$seen" ] && rung=0           # compacted or restarted — rearm
  seen=$t
  [ "$rung" = 0 ] && { echo "LIVE: reading $t tokens"; rung=1; }
  [ "$t" -gt 200000 ] && [ "$rung" -lt 2 ] && { echo "RUNG 200k: $t"; rung=2; }
  [ "$t" -gt 250000 ] && [ "$rung" -lt 3 ] && { echo "RUNG 250k: $t"; rung=3; }
  [ "$t" -gt 300000 ] && [ "$rung" -lt 4 ] && { echo "RUNG 300k: $t"; rung=4; }
done`
})
```

**The `LIVE:` line is the point.** A watcher that has not printed a real token count is watching nothing — do not report its silence as headroom. `TaskStop` it when the agent's completion notification arrives; that is its exit condition.

## 3. The ladder

Escalate by size, through `SendMessage`. A single polite ask gets deferred by an agent mid-task.

| Rung     | What you send                                             |
| -------- | --------------------------------------------------------- |
| **200k** | Reach a good stopping point.                              |
| **250k** | Press. Say it is not optional and name what is unwritten. |
| **300k** | Force. **Commit first, talk second** — even broken WIP.   |

**A stopping point is _committed, boxes ticked, handoff written_.** It is not "the task is finished". An uncommitted change is the only thing that cannot be recovered, which is why the 300k rung inverts the order.

**Do not trust a remembered ceiling.** Agents have auto-compacted near 166k on one day and run past 450k on the next. Read the `LIVE:` number instead of reasoning from a number you recall.

## 4. Accept the work, do not relay it

An agent's report is a claim. Before you tell the user a unit landed:

- **Run the gate yourself.** Report its verdict line verbatim, never `EXIT: $?`.
- **Run the full e2e suite even when an earlier check is red.** The gate is sequential, so a failure at check N leaves every later check **unproven, not passing** — and e2e is last. A unit that fails at typecheck has told you nothing about the browser. Fix the early failure, then run `pnpm test:e2e` directly before you accept the unit; do not wait for a clean gate to find out e2e was broken all along.
- **Open one file the agent said it changed.** A green run proves nothing about a rule that matches nothing — if the unit added a guard, make it fire once, then remove the probe.
- **Diff what was staged against what the unit owned.** `git add -A` and `git add -u` both sweep a co-worker's uncommitted work.

Say plainly which units landed, which are unproven, and what you left out.
