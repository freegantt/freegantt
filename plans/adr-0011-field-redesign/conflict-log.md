# Conflict log — plan sweep 2026-09-09

Source of truth: commit `35b3d73` (`adr cleanup`). That commit moved every open decision into the ADR and reversed several older plan claims. Where this folder still disagreed, the later text won.

| | Older text (plan / review) | Last commit (`35b3d73`, ADR) | Used |
|---|---|---|---|
| **1** — undeclared key in a `props` patch | README group B, #208, api.md §4: settled *writable* | Re-opened. Recommend: `update()` throws; ingest still carries | **Open.** Group B’s ChangeSet edits (a–c) only if it stays writable |
| **9** — where a plugin Field value lives | README B1 / review D1: recommend **C** (plugin store) | Recommend **A** + module augmentation + a required plugin prefix (see **12**) | **Open.** Last recommendation is A. Dropped the leftover “recommend C” call sites |
| **11** — flat write shorthand | api.md / ADR body: *common case is a shorthand* does not survive | Contested. Third option: flat for **declared** keys only, top level stays closed | **Open.** Nested `props:` is the draft; the declared-key flat spelling is still on the table |
| **`fieldValue` typing** | api.md: always `unknown` | `FieldValue<TProps, K>` already ships; one generic carries it across. `unknown` only for compute / plugin keys | **Keeps its type.** #267 is only the compute / plugin residue |
| **Promotion** | Some text described promote-only | Promote **and** demote, both automatic. Target kind is **8** | **Both ways.** Decision **8** still open |
| **Numbering** | Open 1–7, Blocking B1–B3, review D1–D7 | ADR decisions **1–17** | ADR numbers only |
| **Deletions** | `reviews/2026-09-09.md`, `api-open-questions.md` and the three 8-September stubs | Removed by the sweep, unlogged at the time | **Four pointer files: correct to delete.** The working review was not one — two audit findings went with it and are restored below |

Not a conflict, but easy to misread: a recommendation in the ADR is not a ruling. The rows above that say **Open** stay open.

## Fixed after the sweep — 2026-09-09

Four defects found by re-reading the files against this log. **The log's six rows were each correct; two were applied incompletely, and two audit findings were lost with a deleted file.**

- **Promotion was resolved on one line and contradicted on the next.** README group C said the conversion promotes and demotes, then said a parent losing its last child "keeps no dates and draws no bar" — the promote-only consequence demotion removes. It also mis-tied that to #270, which is a **declining Aggregator that saw children**; a childless parent never reaches an Aggregator at all, so #270 stands on its own. Rewritten.
- **`api.md` described promotion with no demotion.** A caller sees `kind` change under them, so the call-site file owes both directions. Fixed, pointing at decision **8** for the target kind.
- **The `durationOf` call-site list was lost.** It reaches six places beyond the signature, and an audit built it after a review named two call sites and got one wrong — `inline-editing.ts:113` is a **provider, not a caller**. Restored into group D rather than re-derived.
- **The `EditOf` warning was lost.** A shared mapped type over both edit halves was drafted, published, and found wrong in **both** directions on the next pass. Nothing recorded that it had been refused, and the two declarations look factorable. Restored into group A, and into the ADR beside the types, which is the durable home.

**The lesson for the next sweep:** a pointer file deletes safely, a file holding findings does not. `reviews/2026-09-09.md` held both, and only its pointer half was checked before it went. Everything deleted is recoverable from `35b3d73`.

## Closure sweep — 2026-09-09

Eight decisions closed. Rulings and evidence are in [`closed-decisions.md`](closed-decisions.md); this row set records only what the closures changed here.

| | Older text | Now |
|---|---|---|
| **17** — the namespace's name | every file wrote `data` "because a draft needs one word" | **`props`**, ruled by the author. `data/` is a layer, and the mitigation on offer was a prose convention — the move #7 already cost a review. The `data/`-against-`entry.data` glossary rule this folder owed is deleted, not written |
| **`editable`** | ADR aside and ordering constraint 7: *"check whether the two doors differ"* | They **do** differ — `editable` is read at `view/capability.ts:120` and nowhere else in `src/`. Ruled: `editable: false` refuses `entries.update()` too. Opened decisions **18** and **19** |
| **3, 7, 10, 14, 15** | listed as blocking | Closed. 3 was settled in its own text; 7 was "downstream of 9"; 10 recommended itself off the list; 14 was a measurement task; 15 was answered by `MS` already being public |
| **Row 10 above** (`fieldValue` typing) | *"keeps its type"* | Still true, and `api.md` published `fieldValue<number>(id, 'ref')` on the strength of it. That call cannot compile — one type parameter, and partial inference does not exist. Removed |

**The lesson for the next sweep:** a decision that recommends itself off the list, or whose whole body is a pointer to another decision, is not open. Counting it as open hid how much was actually undecided — the frontmatter said sixteen and the list held fifteen, of which five were already answered.
