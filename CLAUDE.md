# FreeGantt

> ## Stop rule — the harness never patches the library
>
> You reach for a workaround, a defense, a fallback, or a re-derivation in `harness/`, because `src/` does not give you what you need. **Stop there. Report the gap to the user. Ask if core closes it first.** Wait for the answer.
>
> Harness code that compensates for the library is an **API gap**, and no lint catches it. The workaround hides the evidence, and the bad API ships. This rule outranks "finish the task": a blocked harness feature costs one turn, a hidden API gap costs a release.
>
> `harness/` is the library's first consumer, and sits outside the `src/**` lint scope by design — consumer code, not library code. That is not an exemption to spend: review `harness/main.ts` on every commit, changed or not, because code there that breaks a library rule or re-derives what the library already computes is an API gap even when no lint fires. Record it against the current slice and close it in `src/` — tidying the harness only hides the evidence. A clean `harness/main.ts` is the expected steady state, not a sign there is nothing to review: the last three gaps it exposed were `rowHeight: 32` restating `api/gantt.ts`'s default, a hand-built `TimeScaleModel` standing in for `range: 'fitDataset'`, and a `--fg-grid-pane-width` hand-tuned to one column set, standing in for `gridWidth: 'fitColumns'` (#157). The harness will be the main documentation our library users have so it should be an example of how to use the library, not hack around it.

Framework-free TypeScript Gantt library, library-first. The spec is `plans/00`–`04` — read the relevant doc before changing anything it governs; locked decisions are not revisited casually but they can be changed for good reason (like making the API better or fixing a ball of mud). Work lands in vertical slices each new feature ending with something visible in `harness/`. 

This project has never shipped to a user: the public API can change freely, and should whenever change makes it better or the code more resilient. Write as a senior TypeScript developer with experience shipping products like AG Grid, DHTMLX Gantt, and Bryntum, who trades development speed for a clean surface, not one racing to ship. Follow "clean code", use well-defined TypeScript types wherever possible, and keep strong module boundaries. Design for a clean, easy-to-use API internally and externally

## Hard rules

talk in ASD-STE100 Simplified Technical English

 readability and maintainability beat quick code every time.

One domain per word: Every approved word has only one definition to stop confusion. This applies to domain concepts like Entry or Row. Verbs can be duplicated if needed. IE: [Entry.read](http://Entry.read)() or Row.read()  
Active voice: Writers use active sentences instead of passive ones (for example, "The mechanic removes the panel" instead of "The panel should be removed").  
Simple tenses: Use simple past, simple present, and simple future tenses.  
Short sentences: Keep sentences to 20 words max for instructions and 25 words max for descriptions.  
One instruction per sentence: Each step gets its own sentence or bullet point.

Functions should do one thing and do it well and should be clear on what they do from the name.

Name functions and classes in friendly easy to understand for humans and agents names. Stick to the domain model, if you're trained on Uncle Bob's (Robert C. Martin's) clean code follow his guidelines for naming things. Code should be self-documenting and easy to understand. Write the call site down and read it in english to verify it makes sense before deciding on a name. Not the signature — the invocation, with real arguments. Example of bad naming (#54, since renamed): a measurement wiring named after "size" alone — say its call aloud: "attach size to container." That makes no sense; the glossary term is pane size, so the name became `attachPaneSize`. See the naming skill when you need to come up with name.

Comment a seam with the question it answers, not the mechanism it uses. A reader of four registrations must see one story, not four API calls. Comments tells what shape it draws, how it looks, what you can do to it, and what actions it offers. Each question sits above the one call that answers it. Use this shape wherever a module fills more than one seam. Be concise, dont overcomplicate or be overly verbose.

Never cite a spec label such as `D-S5-31`, `J54` or `Q3` in a code comment, a test name, a doc outside `plans/`, or `harness/`. State the rule itself. Labels stay in `plans/` and in commit messages.

**Vocabulary**:

`CONTEXT.md` is the glossary

**Layers** (`plans/01` §1 — enforced by dependency-cruiser): see `docs/agents/modules/layers.md`.

**Time** (`plans/01` §5): see `docs/agents/modules/time.md`.

**Data** (`plans/01` §6): see `docs/agents/modules/data.md`.

**Scheduling** (`plans/01` §7 — first-party default plugin, not mandatory core, see ADR 0002; **slice S7**): see `docs/agents/modules/scheduling.md`.

**Rendering / view** (`plans/01` §8): see `docs/agents/modules/rendering-view.md`.

**Entry structure** (`plans/01` §2.5): see `docs/agents/modules/entry-structure.md`.

**Dependencies** (`plans/04` §1):

- Two runtime deps, each confined to one façade file: `alien-signals` (the `data/` reactivity façade) and `temporal-polyfill` (`time/zone.ts`, `/fns/*` entry points only — see `docs/adr/0001`). No other file may import either.
- Adding a third runtime dep needs a `plans/04` §1 table entry justifying it and a façade to confine it. Rejected candidates and reasons are in `plans/04` §1.1 — check there before proposing one.

**API** (`plans/02`): see `docs/agents/api.md` before you add or change any method, function, or internal or external API.

## Workflow

- TS strict (with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), pnpm, Vite, Vitest (pure tests run in Node with no DOM env), fast-check for property tests. Dont do lie generics
- **ADRs**: ask the owner before you write, amend, or accept an ADR. Put the decision and its options in the chat first. Write the ADR only after the owner approves it. A plan, a coordinator, or an implementer never decides an ADR alone.
- Slice gates (`plans/00` §4) must pass before the next slice starts.
- The invariants table (`plans/01` §11, I1–I15) is the review checklist; every invariant maps to a CI job.
- Rename a class, a type or a function with `pk-rename-symbol`. It renames through the language service, so it follows re-exports and aliases, and it skips prose. Then run `pnpm typecheck`. A same-named string in a comment or a doc stays as it is — decide those separately.
- **CI and the verification gate**: open `docs/agents/ci.md` to run the gate before hand-off, and to troubleshoot a failing or truncated check.
- **Push after a green gate**: the pre-push hook runs `pnpm verify:full` and nothing else. If `verify:full` passed and no file changed since, push with `git push --no-verify`. Any edit after the gate, even a comment, voids this, so let the hook run.
- **Pull requests**: use the `pull-requests` skill when you create a pull request, mark one ready, or watch its CI. Never sign a pull request or a commit with an AI tool.
- **Reviews**: open `docs/agents/review.md` before you review a branch, and before you apply a fix a plan or review proposes. It names `ocr` as the branch reviewer and gives the one command. "ocr review" and "code review" both mean that doc — read it first, and never read `ocr` as a typo.
- **Context budget**: open `docs/agents/context-budget.md` before you re-read a hot file or a scratchpad artifact in a long session.
- **Headroom**: a proxy compresses tool output, and it can drop words. When you need the exact text, call `mcp__headroom__headroom_retrieve` with the `hash=` from the compression marker.

