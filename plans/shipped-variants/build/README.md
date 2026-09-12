# shipped variants — build plan

Three builds. One defect behind all three.

**Read [`../README.md`](../README.md) once. Then read one build file and work from it.** Do not read
the other two.

---

## Hard rules

1. **The ADR governs the build.** It holds every decision. Never re-derive one.
2. **Tick each box when you finish it. Do not save the ticks for the end.** A build that stops
   halfway must show where it stopped. A reviewer reads the boxes, not the diff.
3. **`pnpm verify:full` is the gate, and its last line is the answer.** Capture it with a redirect,
   never a pipe:
   ```bash
   pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log
   ```
   Report the verdict line. Never report `EXIT: $?`. A run with no verdict line is unproven.
4. **Each build lands one commit.** Do not stage one build behind another.
5. **Rename with `pk-rename-symbol`, then run `pnpm typecheck`.** A same-named string in a comment or
   a doc is a separate decision.
6. **Never loosen a gate to pass it.** `eslint.config.js`, `.dependency-cruiser.cjs` and
   `.githooks/**` stay as they are, unless the build file tells you to change one.
7. **A harness workaround is an API gap. Report it. Do not keep it.** This is CLAUDE.md's stop rule,
   and build 3 is where it bites.
8. **Log every question and every judgement call in [`../BUILD-LOG.md`](../BUILD-LOG.md)**, the moment
   it comes up.
9. **Read the refuted list in [`../README.md`](../README.md) before you propose an alternative.**
   Twelve entries sit there already.
10. **A plan's account of the code is a claim. Open the file before you act on it.** Every line
    number in these files was read on 2026-09-12. A later commit may move one.

---

## Landing order

```
Build 1 (#287)  →  Build 2 (#288)  →  Build 3 (#289)
```

| Build | Issue | The job | File |
|---|---|---|---|
| 1 | #287 | The harness meets the sealed `exports` map | [`build-1-287-seal-the-harness.md`](build-1-287-seal-the-harness.md) |
| 2 | #288 | The base sheet ships in one cascade layer | [`build-2-0021-the-layer.md`](build-2-0021-the-layer.md) |
| 3 | #289 | Core ships variants, and a variant answers about itself | [`build-3-0022-shipped-variants.md`](build-3-0022-shipped-variants.md) |

**Every decision is answered.** `../README.md` holds Q1–Q7; `../BUILD-LOG.md` holds J1–J7. Read both, and do not re-open one.
