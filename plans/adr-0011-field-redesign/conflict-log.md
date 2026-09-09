# Conflict log — plan sweep 2026-09-09

Source of truth: commit `35b3d73` (`adr cleanup`). That commit moved every open decision into the ADR and reversed several older plan claims. Where this folder still disagreed, the later text won.

| | Older text (plan / review) | Last commit (`35b3d73`, ADR) | Used |
|---|---|---|---|
| **1** — undeclared key in a `data` patch | README group B, #208, api.md §4: settled *writable* | Re-opened. Recommend: `update()` throws; ingest still carries | **Open.** Group B’s ChangeSet edits (a–c) only if it stays writable |
| **9** — where a plugin Field value lives | README B1 / review D1: recommend **C** (plugin store) | Recommend **A** + module augmentation + a required plugin prefix (see **12**) | **Open.** Last recommendation is A. Dropped the leftover “recommend C” call sites |
| **11** — flat write shorthand | api.md / ADR body: *common case is a shorthand* does not survive | Contested. Third option: flat for **declared** keys only, top level stays closed | **Open.** Nested `data:` is the draft; the declared-key flat spelling is still on the table |
| **`fieldValue` typing** | api.md: always `unknown` | `FieldValue<TData, K>` already ships; one generic carries it across. `unknown` only for compute / plugin keys | **Keeps its type.** #267 is only the compute / plugin residue |
| **Promotion** | Some text described promote-only | Promote **and** demote, both automatic. Target kind is **8** | **Both ways.** Decision **8** still open |
| **Numbering** | Open 1–7, Blocking B1–B3, review D1–D7 | ADR decisions **1–17** | ADR numbers only |

Not a conflict, but easy to misread: a recommendation in the ADR is not a ruling. The rows above that say **Open** stay open.
