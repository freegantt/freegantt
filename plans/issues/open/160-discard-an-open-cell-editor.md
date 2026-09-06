# #160 — No way to discard an open Cell editor

**Reported:** 2026-09-05. **Status:** open, grilled, not implemented.
**Slice:** S5 (S5.8 inline editing). **Related:** #158 (closed), #159 (closed), #137 F5/F11/F12.

Grilled against `s5-start` at `830800d`. I read `src/extensions/features/inline-editing.ts` as it
stands today, not the line numbers in the issue body. Those numbers pre-date #158, #169, #171 and
#172, and the file has moved under them.

This document answers the grill on its own. Every answer a senior front-end developer can settle
from the repo's own rules is settled below and marked **Settled**. Five answers change a recorded
contract or a core surface. They sit in [§7, For the repo owner](#7-for-the-repo-owner), and no code
lands on them until the owner rules.

---

## 1. What the issue is, verified against the code

The issue is correct. Three facts hold today.

**Escape is the only exit the user can aim.** `CellEditorSession.mount` binds Escape through
`ports.bindEscape`, which calls `requestRevert`. That path always closes. Nothing on screen says
Escape is there. Two other exits exist, but the user cannot aim either one: `CellEditing.onAnchorLost`
closes the editor when the row scrolls out of the frame or the Entry leaves the Dataset.

**Focus is trapped once a commit is refused.** `mount()` calls `activateFocusTrap(this.#wrapper)`.
The wrapper's only focusable child is the control. So Tab cycles back into the control.
`#onFocusOut` calls `requestCommit()` for any focus move outside the wrapper. `commit()` refuses the
same value again, calls `#markInvalid()`, and `#markInvalid()` calls `this.#control.element.focus()`.
Focus comes back. A pointer user who does not know Escape has no way out of the cell, and the page
takes focus back even when the user clicks the browser chrome.

**No public API closes an editor.** `src/api/index.ts` exports `inlineEditing` and its option types
and nothing else. A consumer whose own `beforeEntryEdit` handler or `beforeChange` handler caused
the refusal cannot dismiss the state it caused.

One more fact the issue does not state. **The invalid state carries no words.**
`view/styles.ts:257` paints `border-color: var(--fg-warn)` on the control, and that is the whole
signal. A refused *open* names its reason in a Refusal notice. A refused *commit* names nothing.

---

## 2. Round 1 — the four root decisions

### ❓ Q1 — The verb. What word names "close the editor and write nothing"?

`CellEditorSession` spells it `revert()` today. The issue proposes `gantt.cancelEdit()` and flags
the collision with `MutationCancelledError` itself.

Naming check 1 sends me to `CONTEXT.md` first. There is **no glossary term** for this act. The
naming skill says stop there and write the glossary entry first. So this is a new term, and the
three candidates are `cancel`, `revert` and `discard`.

➡️ **`discard`.** Rename `CellEditorSession.revert()` and `CellEditing.revert()` with it, so one
word serves the concept.

| Name | Result |
|---|---|
| `cancel` | Check 4 fails twice. `CONTEXT.md`'s **Veto** entry lists Cancel under _Avoid_, and `MutationCancelledError` is the library refusing a ChangeSet. `pointer-gesture.ts`'s `cancel` callback is a third sense — the user abandoning a drag. Adding a fourth site does not repair that. |
| `revert` | Check 4 fails. `revert` already means "undo restores a written value" in `data/` — `plugin-store.test.ts`'s "reverts with the entry edit in one undo step", `s2.5-undo-redo.md`. Check 2 also reads false: nothing was written, so nothing is restored. |
| `discard` | All five checks pass. `gantt.commands.run('freegantt.discardCellEdit')` reads "run: discard the cell edit". A search for `discard` returns the concept — `CONTEXT.md`'s **Ghost** entry says "Discarded on cancel", which is prose about the same category of act and does not name a second concept. |

**Answer — Settled, with one nod owed.** `discard`. The nod: D-S5-19 and the S5 README both say
"Escape reverts and writes nothing". Both sentences become "Escape discards the edit and writes
nothing". That is spec prose, not a locked D1–D12 decision, but it is recorded text. See §7.

---

### ❓ Q2 — Where does the public way live?

Three shapes are available.

| | Shape | Verdict |
|---|---|---|
| A | `gantt.commands.register` in the plugin; the consumer calls `gantt.commands.run(id)` | recommended |
| B | New `Gantt` members — `gantt.discardCellEdit()`, `gantt.editing` | rejected |
| C | `inlineEditing()` returns a handle | rejected |

➡️ **A.**

**Answer — Settled.** The repo's own rules decide this, and they decide it twice.

D-S5-19 says the editor is a plugin so that a read-only Gantt carries no editor code (`[S5-A6]`).
B puts an editor-shaped method on `Gantt` that does nothing when the plugin is absent. That breaks
the acceptance the decision exists to keep.

D-S5-26 says the command registry **is** the a11y seam, and that "a pointer affordance and its
command land in the same change, so the keyboard path is a binding over the same command rather than
a second implementation". Q3's button is that pointer affordance. The command is its twin. The rule
writes the design.

A also pays for itself three times over: the context menu (S5.5) can list the command with no new
code, a consumer can rebind it, and `CommandRegistry.run` already treats a declining `when` as a
silent no-op — which is exactly right for "discard the editor when none is open".

C is not the shape. `installPlugin` returns a `Disposer`. No plugin returns a handle, and inventing
one for this would make `inlineEditing()` the odd plugin out.

---

### ❓ Q3 — Is there a visible affordance, and in which state?

➡️ **Yes. In the invalid state only.**

**Answer — Settled.** A valid open editor already has three exits the user understands: Enter, click
away, Escape. All three work. Adding a button to every open editor costs typing width in a cell that
is often 120px wide, and answers a question the user does not have.

The invalid state is the one state where every exit except Escape is closed. That is where the
button belongs, and that is where it is discoverable exactly when it is needed.

---

### ❓ Q4 — What does blur do while the editor is invalid?

Today blur re-commits, the commit refuses again, and `#markInvalid()` pulls focus back. This is the
mechanism of the trap.

Three options:

| | Behaviour on blur while invalid | |
|---|---|---|
| a | discard and close | loses the user's typed text with no confirmation |
| b | stay open, stay invalid, **do not re-commit and do not pull focus back** | recommended |
| c | re-commit (today) | the trap |

➡️ **b.**

**Answer — Settled in shape, owner's nod owed on the contract.** The issue's own sentence is the
argument: "re-attempting a value already refused buys nothing and costs the user their way out of
the cell." Option b keeps the text, un-traps the focus, and leaves the editor on its cell as an
honest "this did not save" marker.

Option b does not weaken the C2 rule. A double-click on a second cell still runs
`editing.commit()`, still gets `false`, and still raises the `unsaved-value` Refusal notice. The
first editor still declines to close. Nothing about that changes.

The contract point: #137 F5 reads "commit veto → editor stays open in invalid state, focus
restored". "Focus restored" is right for Enter, where focus never left. It is a contradiction for
blur, where the user deliberately moved focus away. So F5 needs one sentence added, not replaced.
See §7.

---

## 3. Round 2 — the decisions Round 1 unblocked

### ❓ Q5 — The command id, its label and its `when`

➡️ `freegantt.discardCellEdit`, label `Discard edit`, `when` = an editor is open now.

```ts
ctx.commands.register({
  id: 'freegantt.discardCellEdit',
  label: 'Discard edit',
  when: () => editing.editor !== undefined,
  run: () => editing.discard(),
});
```

**Answer — Settled.** Read the registration aloud: "register the discard-cell-edit command, labelled
Discard edit, available when an editor is open, which discards the edit." Every clause is true.

The id carries `CellEdit`, not `Edit`. Check 3: a search for `discardEdit` would also find the
Entry-level edit vocabulary (`EntryEdit`, `beforeEntryEdit`). `CellEdit` names the one Grid cell the
Cell editor sits on.

The id is namespaced `freegantt.` like every core command. `inlineEditing()` is a first-party
plugin, and D-S5-19 calls it "an ordinary `GanttPlugin`" — but the prefix names the vendor of the
command, not the layer that registered it. A consumer's own plugin uses its own prefix.

The command is registered once in `setup()` and lives as long as the plugin does. `when` gates it,
not the registration.

### ❓ Q6 — The affordance's markup, focus behaviour and a11y

➡️ A `<button>` inside the existing `.fg-cell-editor` wrapper, after the control, added and removed
with the invalid state.

```html
<div class="fg-cell-editor" data-state="invalid">
  <input class="fg-cell-editor-control">
  <button class="fg-cell-editor-discard" type="button" aria-label="Discard edit" title="Discard edit">×</button>
</div>
```

**Answer — Settled.** Five points, each one a decision:

1. **Inside the wrapper, after the control.** `activateFocusTrap` focuses the *first* focusable
   descendant, so the control keeps opening focus. Tab then reaches the button and Shift+Tab returns.
   The trap becomes a two-stop cycle instead of a dead end, which is what a trap is supposed to be.
2. **`#onFocusOut` already ignores it.** The handler returns early when `relatedTarget` is inside the
   wrapper. A Tab from the control to the button fires no commit today. No change needed.
3. **`preventDefault()` on the button's `pointerdown`.** Some browsers do not focus a `<button>` on
   click. Without this, a click fires `focusout` with a null `relatedTarget` first, which runs one
   more doomed commit before the click lands. Preventing the default keeps focus on the control, so
   the click is the only thing that happens.
4. **`type="button"`.** There is no form here, but the attribute is what stops a future wrapping form
   from submitting.
5. **The button runs the command, not the method.** `ctx.commands.run('freegantt.discardCellEdit')`.
   D-S5-26's rule again: one implementation, two entry points.

The `×` glyph is `textContent`, and `aria-label` carries the words. `view/styles.ts` owns the paint,
beside the two classes it already styles. The button is not a `.fg-cell-editor-control`, so the
existing control rule does not reach it.

### ❓ Q7 — Does the invalid editor name its reason, the way a refused open does?

➡️ **Yes, minimally: `data-reason` and `title` on the wrapper. No Refusal notice.**

**Answer — Recommended, owner's call.** The rule in `s5.8-inline-editing.md` §1 is "a cell that
offers an editor and cannot open it here names the reason". A refused *commit* is not covered by
that sentence, and today it says nothing. Two new `REFUSAL_TEXT` keys close it:

| key | words |
|---|---|
| `unreadable-value` | this field cannot read that text back; fix it or discard the edit |
| `refused-write` | this change was refused; fix the value or discard the edit |

A **Refusal notice is the wrong mechanism here**, and this is the part worth stating. A notice mounts
its own `.fg-cell-editor` over the cell and sets `pointer-events: none`. The editor is already over
that cell. Stacking them puts a click-through node over a live `<input>`. §1's "one legal pair" is an
editor plus a notice on a *different* cell. So the invalid editor carries `data-reason` on its own
wrapper and the same words as its `title`, and `REFUSAL_TEXT` stays the one table.

This widens #160 into ground #159 declared closed. See §7.

### ❓ Q8 — How does a consumer read "is an editor open"?

The issue asks for `gantt.editing`.

➡️ **No `gantt.editing`. Make `CommandRegistry.available()`'s context optional instead.**

**Answer — Recommended, owner's call, because it changes a core surface.**

`gantt.editing` fails Q2's test for the same reason `gantt.discardCellEdit()` does: it is a plugin's
state on the core object, and a read-only Gantt would carry it.

The right question is already public and already generic. "Which commands can run right now?" is
`gantt.commands.available(ctx)`. The problem is that an app author has to hand-build a
`CommandContext` — `{ gantt, dataset }` at least — and `GanttShell#buildCommandContext` already
builds a better one, with the live selection and target in it. Making the parameter optional turns
a whole class of "can I do X right now?" questions into one call, for every command:

```ts
const canDiscard = gantt.commands.available().some((c) => c.id === 'freegantt.discardCellEdit');
```

This is a genuine API gap that #160 exposed, not #160's own scope. It is one line in
`CommandRegistry.available` plus the type. It does not block the rest of this work.

---

## 4. Round 3 — the decisions Round 2 unblocked

### ❓ Q9 — Does a discard raise an event or an Error report?

➡️ **No to both.**

**Answer — Settled.** No event: `entryEdit` fires after a commit, and a discard writes nothing.
`plans/02` §3's rule is that a mutating interaction gets a `before*`/`*` pair; a discard mutates
nothing, so it is not one. A consumer who needs to know a discard happened has the command — they
can wrap the registration, which is what D-S5-7's stacking is for.

No Error report either: a discard is the user succeeding, not the library refusing. `CONTEXT.md`'s
**Refusal** entry is explicit that a report describes the library saying no.

The *refusal that produced the invalid state* is a different question, and Q7 answers it.

### ❓ Q10 — Does the discard need a `before*` veto?

➡️ **No.**

**Answer — Settled.** `plans/02` says every *mutating* interaction gets a cancelable `before*` event.
A discard writes nothing. Giving it a veto would let a consumer refuse to let the user out of the
cell, which is the bug this issue is about, reintroduced as a feature.

### ❓ Q11 — What is the test list?

**Answer — Settled.** In `src/extensions/features/inline-editing.test.ts`:

- a refused commit shows the discard button; a valid open editor does not
- clicking the button closes the editor and writes nothing
- `gantt.commands.run('freegantt.discardCellEdit')` closes the editor and writes nothing
- the command's `when` declines when no editor is open, and `run` is then a silent no-op
- **blur while invalid does not re-commit and does not pull focus back** (Q4)
- Tab from the control reaches the button; Shift+Tab returns to the control
- an invalid editor carries `data-reason` and the matching `title` (Q7)
- a second cell double-clicked over an invalid editor still raises `unsaved-value` (C2 unbroken)
- `CellEditorSession.discard()` alone, with no mounted Gantt

In `e2e/editing.spec.ts`: a user types a value the Field refuses, presses Enter, clicks the discard
button, and lands on another cell. That is the whole bug, end to end.

### ❓ Q12 — Which documents change?

**Answer — Settled.**

| Document | Change |
|---|---|
| `CONTEXT.md` | new **Discard** entry (§5 below); **Cell editor** gains one sentence about the invalid state's exits |
| `plans/s5-extensibility-and-editing/s5.8-inline-editing.md` | **D-S5-39** (§6 below); "Escape reverts" → "Escape discards"; the refusal table gains the two commit-time rows |
| `plans/s5-extensibility-and-editing/README.md` | D-S5-39 in the decision table; "Escape reverts" in the misreading table |
| `plans/02-public-api.md` | §4.5's command catalog gains `freegantt.discardCellEdit`; §316's Parts list gains `.fg-cell-editor-discard` |
| `harness/` | the editing page proves it — see Q13 |

### ❓ Q13 — What does the harness show?

**Answer — Settled.** Nothing new in `harness/` beyond what already installs `inlineEditing()`. The
button ships with the plugin, so `harness/main.ts` gets the affordance for free. That is the correct
outcome: a harness that had to add a discard button of its own would be an API gap, which is what
CLAUDE.md's stop rule is for.

One harness line is worth adding for the command half — a button on the editing page that calls
`gantt.commands.run('freegantt.discardCellEdit')`, to prove a consumer can dismiss a state its own
`beforeChange` handler caused. That is the exact scenario the issue names as "the sharp one".

### ❓ Q14 — No ADR?

**Answer — Settled: no ADR.** The domain-modeling skill's three tests need all three. Q2 fails the
third: there is no real trade-off, because D-S5-19 and D-S5-26 already decide it and this is their
application. Q1's verb passes tests 1 and 2 but is one glossary entry, not an architectural choice.
A D-S5-39 entry in the step file and a `CONTEXT.md` term carry the whole record.

---

## 5. Proposed glossary entry

Staged, not written. `CONTEXT.md` gains this under "Extensibility", beside **Cell editor**:

> **Discard**:
> Closing an open Cell editor and writing nothing (`inlineEditing()`, S5.8). Escape discards, and so
> does the `freegantt.discardCellEdit` command and the button the editor shows in the invalid state.
> The stored value never changed, so a discard restores nothing and produces no ChangeSet, no event
> and no undo step.
> _Avoid_: Cancel (the library refusing a ChangeSet is a Veto — ADR 0006; the pointer machine's own
> `cancel` abandons a drag), Revert (that is what undo does to a value already written — see
> `data/`), Close (an editor closes on a commit too, which writes)

**Cell editor** gains one sentence:

> In the invalid state the editor shows a discard button and names its reason on the wrapper, so
> Escape is not the only exit.

---

## 6. Proposed decision entry

**D-S5-39 — The invalid Cell editor has a visible exit, and one command behind it**

A refused commit keeps the editor open (#137 F5). Until now that state had one exit, Escape, and
nothing said so. Focus returned to the control on every blur, so a pointer user was held in the cell.

Three changes, one decision:

1. The invalid editor shows a **discard button** inside its own wrapper, after the control. It is in
   the focus trap's cycle, so Tab reaches it.
2. The button runs **`freegantt.discardCellEdit`**, an ordinary registration on the command registry
   (D-S5-6). That is the public way, and D-S5-26's rule that a pointer affordance and its command
   land together is why there is no second implementation. No `Gantt` member is added: a read-only
   Gantt must carry no editor code (`[S5-A6]`, D-S5-19).
3. **Blur while invalid stops re-committing.** It leaves the editor open, invalid, and it does not
   pull focus back. Re-attempting a value the Field just refused buys nothing and costs the user the
   cell.

The word is **discard**, not revert and not cancel. `revert` names undo restoring a written value in
`data/`; `cancel` is the word `CONTEXT.md`'s **Veto** entry tells us to avoid.

---

## 7. For the repo owner

Five answers above change recorded text or a core surface. I recommend each one, and none of them
lands until you rule.

**1. The verb `discard` reverses recorded prose.** D-S5-19 and the S5 README both say "Escape reverts
and writes nothing". I want both to read "Escape discards the edit and writes nothing", and I want
`CellEditorSession.revert()` renamed to `discard()`. My case is naming check 4: `revert` already
means "undo restores a written value" in `data/`. Cost is about twenty sites, most of them prose.
Say the word if you would rather keep `revert` and pay the collision.

**2. Blur while invalid stops re-committing (Q4).** #137 F5 reads "commit veto → editor stays open
in invalid state, focus restored". I am keeping "stays open" and scoping "focus restored" to the
Enter path only. That is an amendment to a locked contract, not an implementation detail. If you
want blur to keep re-committing, the trap stays and only the button relieves it — which I think is
the weaker fix, because it leaves the focus steal in place.

**3. Should a refused commit name its reason (Q7)?** This is the one that widens the issue. #159 is
closed, and its body strikes the claim that this plugin discards a refusal's reason — correctly, for
a refused *open*. A refused *commit* still says nothing: no words on the cell, and no Error report.
I want two new `REFUSAL_TEXT` keys and a `data-reason` on the invalid wrapper. Tell me whether that
belongs here or in a new issue. **Related finding, either way:** a `beforeChange` veto reports on the
Dataset bus (`transaction.ts`, `code: 'mutation-cancelled'`), but a `parseValue` that refuses the
typed text reports nowhere at all. That asymmetry is real and it is not recorded anywhere I can find.

**4. `CommandRegistry.available()` should take an optional context (Q8).** This is a core public
surface change that #160 exposed and does not own. Without it, the issue's "is an editor open?" half
has no clean answer, because an app author must hand-build a `CommandContext` that
`GanttShell#buildCommandContext` already builds better. One line plus the type. Separate issue, or
fold it in — your call.

**5. The glyph and the words are design taste.** I chose `×`, `aria-label="Discard edit"`, and the
two message strings in Q7. All three are user-visible and none of them is a technical decision.

---

## 8. What this issue does not change

- The `unsaved-value` Refusal notice, and the C2 rule that an open invalid editor blocks a second
  open. Both stay exactly as they are.
- The anchor rules. `onAnchorLost` still closes the editor when the row leaves the frame or the
  Entry leaves the Dataset.
- Escape. It keeps working, it keeps being first in the Keymap (D-S5-9), and it is now one of three
  ways to do one named thing instead of a secret.
- Undo. A discard writes nothing, so there is nothing on the history stack to be careful about.
