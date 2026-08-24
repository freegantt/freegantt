---
name: naming
description: The naming test for a file, a function, a type, an event, or an option. Use it each time you write a new name. Use it also when you review a name, when you change a name, or when you select one name from several.
---

# Naming

A good name tells the reader what the thing is. Do the five checks before you write the name in code, in a specification, or in an issue.

Select a name that describes the thing. A name that no other code uses can still be the wrong name.

## 1. Find the term in the glossary

Read the project glossary. In this project the glossary is `CONTEXT.md`.

Find the term for the concept. Put that term in the name. Follow the glossary when it tells you which words to avoid.

If the glossary has no term for the concept, stop. The concept is new. Write the glossary entry first. Then write the name. Use the `domain-modeling` skill for this work.

## 2. Write the call site. Read the sentence.

Write the true call. Use the real arguments.

Read the call as an English sentence. Keep the name only if the sentence is true.

`attachSize(host, size => handle.setPaneSize(size))` reads "attach a size to the host". The function does not attach a size. The sentence is false, and the name is wrong.

## 3. Do the search test

Ask this question: which word does a person search to find each use of the concept?

Search the code for that word. Keep the name if the results show the concept. Make the name more specific if the results show many other things.

A search for `size` gives hundreds of results. A search for `paneSize` gives the concept.

## 4. Give each word one meaning

Search the code and the specifications for the name. Find each other concept that uses the same word.

Select a different word if the word has more than one meaning in the project. Two concepts with one word cost more than a long name.

## 5. Put the category word at the end

These words are categories: attachment, binding, handle, manager, model, service, helper, util.

Put a domain term from step 1 before the category word. `PaneSizeAttachment` has a domain term. `SizeAttachment` has an adjective, and it tells the reader less.

## When a check fails

1. Write three possible names.
2. Do the five checks on each possible name.
3. Keep the name that passes all five checks.
4. Show the call site with your answer. Give one line for the reason.

## Example

The concept is the measured drawable box of a pane. The glossary term is "pane size".

| Name             | Result                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resizeBinding`  | Check 4 fails. The word `resize` is the name of the gesture that drags the edge of an entry.                                                        |
| `attachSize`     | Check 1 fails: the glossary term is "pane size". Check 2 fails: the sentence is false. Check 3 fails: a search for `size` gives many other results. |
| `attachPaneSize` | All five checks pass. `attachPaneSize(panes.timeline, size => handle.setPaneSize(size))` reads "attach the pane size to the timeline pane".         |

One term goes from the measurement to the model: `attachPaneSize`, then `setPaneSize`, then `paneWidth`.

## Where names come from

Write the name from the thing. A convention gives you the last word of the name. A convention does not give you the full name.

The rule "a wiring between the DOM and a model is an attachment" gives you `Attachment`. It does not tell you what the wiring carries. Step 1 tells you that.
