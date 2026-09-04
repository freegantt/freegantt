---
name: label-issues
description: Apply the correct repository labels to an issue. Use each time you finish work on an issue, create an issue, close an issue, reopen an issue, or change an issue's state or scope. Use also when you review the labels on an existing issue.
---

# Label Issues

Every issue carries the labels that describe it now. Read the repository labels first. Never work from a remembered list — the label set changes.

## 1. Read the available labels

```bash
gh label list --limit 200
```

The `--json name,description` form is available when you want to parse the output.

## 2. Select the labels

Match each label description against the issue. Apply the labels that are true.

- Apply one **kind** label (for example `bug`, `enhancement`, `documentation`, `question`).
- Apply each **state** label that is true now. A state label is a claim about the workflow, so remove it when the claim stops being true.
- Apply a **severity** or **effort** label when the issue meets the description.
- Apply no label that you cannot support from the issue text.

If no available label fits the issue, tell the user. Do not create a label unless the user asks.

## 3. Write the labels

```bash
gh issue edit <number> --add-label "<label>" --remove-label "<label>"
```

On close or reopen, correct the state labels in the same step. An issue that you close keeps only the labels that stay true after the close.

## 4. Hand finished work back

Apply `fixed needs review` the moment you finish work on an issue and you judge the issue ready to close. You did the work, so a person still has to read it. The label carries that claim, and it stays on the issue — closed or open — until that person takes it off.

Comment on the issue in the same step. Give the reader two things:

- **The commits.** Name each commit that carries the work, by hash.
- **A summary.** A few lines on what you did. Say what changed and why it changed.

```bash
gh issue comment <number> --body "Landed in <hash>. <summary>"
```

## 5. Name a new label

Create a label only when the user asks for one. Follow the scheme the repository already uses:

- Lower case only. Never capitalize a word.
- Separate words with a space. Never use a hyphen, a slash, or a colon.
- Two words maximum.
- Name the thing, not the instruction.
- Give the label a one-line description that says when to apply it.

Verify the new name against the output of `gh label list`. A name that reads as a near-duplicate of an existing label is the wrong name — apply the existing label instead.
