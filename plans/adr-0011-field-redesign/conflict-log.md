# Conflict log — plan sweep 2026-09-09

Source of truth: commit `35b3d73` (`adr cleanup`). That commit moved every open decision into the ADR and reversed several older plan claims. Where this folder still disagreed, the later text won.

| | Older text (plan / review) | Last commit (`35b3d73`, ADR) | Used |
|---|---|---|---|
| **1** — undeclared key in a `props` patch | README group B, #208, api.md §4: settled *writable* | Re-opened. Recommend: `update()` throws; ingest still carries | **Open.** Group B’s ChangeSet edits (a–c) only if it stays writable |
| **9** — where a plugin Field value lives | README B1 / review D1: recommend **C** (plugin store) | Recommend **A** + module augmentation + a required plugin prefix (see **12**) | **Open.** Last recommendation is A. Dropped the leftover “recommend C” call sites |
| **11** — flat write shorthand | api.md / ADR body: *common case is a shorthand* does not survive | Contested. Third option: flat for **declared** keys only, top level stays closed | **Open.** Nested `props:` is the draft; the declared-key flat spelling is still on the table |
| **`fieldValue` typing** | api.md: always `unknown` | `FieldValue<TProps, K>` already ships; one generic carries it across. `unknown` only for compute / plugin keys | **Keeps its type.** #267 is only the compute / plugin residue |
| **Promotion** | Some text described promote-only | Promote **and** demote, both automatic. Target kind is **8**. Dates on demotion: normal Entry, no dates (author, 2026-09-09) | **Both ways.** Kind still open. Dates settled. |
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

## Consistency pass — 2026-09-09 (after closure)

Defects found by re-reading the ADR against itself and against `plans/01` §2.5. Counts, stale claims, and one author ruling.

- **Frontmatter said eleven open; the list named twelve.** 20 was in the body and missing from the frontmatter and from `closed-decisions.md`'s open row. Aligned on twelve.
- **The duration cell needed a guard.** The ADR said no code changes. `durationOf` unguarded yields `NaN` and `"NaN d"`. The plan already had the call-site list; the ADR now matches it.
- **Flow step 1 settled decision 1.** It said an undeclared key rides along. Decision 1 is open and recommends the throw. Rewritten.
- **"Open 5"** leftover plan numbering → **decision 5**.
- **Decision 12 was tied to the schema bump.** It gates **A**, because A writes the Document key.
- **Decision 11 said 1 decides it.** 1's current recommendation keeps the inner typo guard, so 11 is independent (nesting vs declared-key shorthand).
- **`toJSON` is not a caller of `editable`.** The resolver's write doors call the full test; `toJSON` asks only the derived half.
- **Childless-parent dates.** README said demotion is "not a dateless row". Author ruled: demotion yields a **normal Entry with no dates** — nothing left to calculate, and it can be dated later. Target kind stays **8**. This overrules `plans/01` §2.5's promote-only / flickering-identity clause; group F rewrites it.
- **The ADR said promote-only had no defence.** It does: flickering identity, written in `plans/01` §2.5. Named, then overruled.

## Author rulings — 2026-09-09 (third pass)

Three rulings. Two close numbered decisions; one closes a contested bullet that was never numbered. Twelve open became ten.

| Ruling | What the draft said | What the author ruled |
|---|---|---|
| **6** — a kind starts rolling up | Refuse (recommendation), or destroy and clear undo (draft body) | **Drop and recalculate, no error, at all three doors.** The drop is a ChangeSet row and undo restores it, because undo reverses the cause in the same step. History is never cleared. `RollUpKindsWouldDropValuesError` is not added |
| **5** — a plugin cascade writes a derived cell | Open. Drop-and-warn, or let it stand | **Drop, and warn.** Unify the proposed-Field predicate before group C deletes the `body`/`merged` split |
| **`props: { start }`** | Contested: decision 12 said error, Consequences said warning | **Warning. The value is ignored and the core definition wins.** Never throws — a consumer's API feed must not break their page |

**The reasoning behind 6, because the draft had lost it.** An author types `cost: 500`, then gives that row a child. A parent's `cost` comes from its children, so `500` is finished. Refusing there refuses an ordinary edit. The undo objection was an artefact of reading the drop as a lone row: it is one row of the transaction that caused it, so undo reverses both and `500` becomes authored again.

**Two follow-ups recorded, neither re-opening anything:**

- A `rollUpKinds` flip's cause is a **config assignment**, and `ChangeSet` has no row for one. Its undo step therefore restores values the still-live setting re-drops. Reverse the config key with the values, or keep the flip's drops out of history.
- The core-key ruling covers a **value** in `props`. A consumer **declaration** on a core key is still set to throw `DuplicateFieldKeyError` after group A deletes the override. Ask before implementing that throw.

**Held open at the author's request:** decision **16**. The `Map`-against-object container is not settled, and neither are the three ergonomic complaints beside it.
