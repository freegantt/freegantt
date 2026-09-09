# Questions on the API — superseded 2026-09-09

**This file is empty on purpose. Do not add a question here.**

Every question it held is merged into the one list that now holds all of them, with a recommendation
and the evidence behind each:
[**ADR 0011 § Blocking decisions**](../../docs/adr/0011-consumer-values-live-in-data-and-a-derived-value-never-persists.md#blocking-decisions).

That list also absorbed this plan's *Still open* 1–7, its *Blocking* B1–B3, and the working review's
D1–D7. **One list, so the documents cannot drift apart** — which is what happened twice before.

Where each question went:

| Was | Now |
|---|---|
| API-Q1 — should a Field key carry a namespace? | decision **12** |
| API-Q2 — why both `entries.get` and `entries.fieldValue`? | **answered** — ADR body, *Two doors read one value* |
| API-Q3, API-Q5 — undeclared keys | decision **1**, re-opened |
| API-Q4, API-Q11 — typing the read door | **answered** — ADR body, and [`api.md`](api.md) §16.2 rewritten |
| API-Q6 — how libraries handle partials | **answered** — ADR body, the merge-depth and RFC 7396 paragraphs. The shorthand half is decision **11** |
| API-Q7 — promoting a kind from having children | **answered** — promotes *and* demotes, automatic. The target kind is decision **8** |
| API-Q8 — `entry` against `ctx` in a `compute` | **answered** — ADR body. The row-binding half is decision **14** |
| API-Q9 — the extender's `Map` | decision **16** |
| API-Q10 — a `plugin` bag beside `data` | decision **9**, with the `tsc` probe that changed it |
| API-Q12 — what demotion returns to | decision **8** |
| API-Q13 — `read` and `fieldValue` under two names | decision **13** |
| API-Q14 — is `rollUpKinds` the wrong axis? | decision **6**, second half |
| API-Q15 — should `FieldContext` bind to the row? | decision **14** |
| API-Q16 — `Duration` needs a magic constant | decision **15** |
| API-Q17 — two plugins write one field | decision **16** |

Delete this file together with [`reviews/2026-09-09.md`](reviews/2026-09-09.md) and the three
8 September stubs, or delete none of them.
