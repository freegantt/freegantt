---
name: pull-requests
description: Open a FreeGantt pull request, mark one ready, or watch its CI. Use before any `gh pr create`, `pnpm open-pr`, or `pnpm pr-wait`.
---

# Pull requests

## Open as a draft

Open every pull request as a draft:

```
pnpm open-pr --title "…" --body-file <path>
```

`.claude/hooks/require-draft-pr.sh` blocks a raw `gh pr create`. CI runs the whole gate on
`ready_for_review`, so a draft spends no minutes.

## Mark ready

A ready pull request means one thing: up for review, and meant to merge. `pnpm open-pr --ready` is
that decision. It works on a draft the branch already has, and it prints the `pr-wait` command next.
`gh pr ready <n>` is the call underneath, and it is not blocked.

## Watch CI

Watch the result with `pnpm pr-wait <n>`. Read `docs/agents/ci.md` for the verdict-line rule.

## Write in the repo's voice

Write the title and body as the repo's own. Describe the change. Name no tool as author, co-author,
or generator: no "Made with Claude", no "Generated with Cursor", no AI `Co-authored-by` trailer,
no robot emoji.
