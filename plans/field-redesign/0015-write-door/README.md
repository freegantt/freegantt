# ADR 0015 — what the write door refuses

**The decision:** [`docs/adr/0015-…`](../../../docs/adr/0015-what-the-write-door-refuses.md)

How strict is `entries.update()`? What does an *absent* `editable` mean there, what replaces the deleted core-key override, and does a consumer declaration on a core key throw?

## Where it stands

**Three decisions are open — 18, 19 and 23**, and they are chained: **answer 19 first, then 23.** One ruling is closed — `editable: false` refuses `entries.update()`.

**Nothing blocks on this ADR.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename.

## Why it does not gate the storage rename

The override machinery lives entirely in `field-registry.ts:101-225`, and `#mergeCoreFieldOverride` merges **`editable` only** — it never reads `source`. So [0011](../0011-consumer-values-in-props/README.md) deletes `FieldSource` cleanly around it, and the override stays standing until this ADR rules on it.

Under the address rule `{ key: 'start', editable: false }` still addresses the core `start` Field. Keeping it is coherent; deleting it is this ADR's call.

## This ADR owns the resolver's `editable` arm, and only that arm

[0011](../0011-consumer-values-in-props/README.md) moves the write resolver into `data/` with HEAD's policies unchanged. [0013](../0013-what-decides-derivation/README.md) changes the derived arm. **This ADR changes the editable arm** — and `view/capability.ts:120` is the one place in `src/` that reads `Field.editable` today, so the arm has exactly one existing behaviour to change.

## Decision 18's cost table may shrink before this lands

18 lists three structural calls that would start throwing — `update(id, { parentId })`, `update(id, { segments })`, `update(id, { kind })`. **[0013](../0013-what-decides-derivation/README.md)'s head decision can delete the third row**: if `kind` becomes calculated, `update(id, { kind: 'milestone' })` stops existing. Land 0013 first and 18 is argued against a two-row table, not a three-row one. Not a block — an ordering preference.

---

# Open decisions

## 18. Does an *absent* `editable` also refuse `entries.update()`?

**Raised 2026-09-09 by the `editable` ruling. Gates this ADR.** [0011](../0011-consumer-values-in-props/README.md) moves the resolver into `data/` carrying HEAD's policies; this decision sets the editable arm's.

`Field.editable` is `boolean | undefined`, and `view/capability.ts:120` reads it as `field.editable === true ? WRITABLE : NOT_WRITABLE` — so absent and `false` are one answer there. The ruling says `editable: false` refuses `entries.update()`. It does not say what **absent** does, and the two answers are far apart.

**Copy the view rule.** `entries.update()` refuses unless a Field declares `editable: true`. One rule, one resolver, one answer at every door. The price is the default posture of a public door: `update(id, { props: { owner: 'Sam' } })` starts throwing for every Field that did not opt in. A data library whose write door is closed by default is a surprising shape, and `editable` was named for the *grid*, not for the API.

**The price is larger than consumer Fields, and it was measured.** Only three core Fields declare `editable: true` — `name`, `start`, `end`. Copying the view rule closes three **structural** doors that have nothing to do with a grid:

| Call | Field | Today |
|---|---|---|
| `update(id, { parentId })` — reparenting | `parentId` | no `editable`. Live at `harness/main.ts:181` and `hierarchy.ts:254` |
| `update(id, { segments: [...] })` — Segment writes | `segments` | no `editable`. #212, ADR 0010 |
| `update(id, { kind: 'milestone' })` | `kind` | no `editable` |

Keeping the view rule means declaring `editable: true` on `parentId` — a Field with **no column at all**. That is answering a grid question about something no grid shows, and it is the tell that `editable` is being asked to do two jobs.

**Decision 21 would add a fourth row, and the cleanest one.** A per-entry derive-off flag is written only through the API, and no grid will ever show it. If 21 lands on a core flag, this table gets a fourth entry that has nothing to do with a grid.

**Split absent from `false`.** Absent means *no opinion, the API may write*; `false` means *refused everywhere*. Today's writes keep working and the ruling still lands. The price is that `boolean | undefined` then carries three meanings at one door and two at another — the split the ruling just closed, moved from between the doors to inside the type.

**A third shape exists:** `editable` names the *grid's* answer and a second word names the API's. That is a new key on `Field`, so it needs its own justification against *one config tree per job*.

**No recommendation.** The first answer is the coherent one and the second is the compatible one. The choice is a posture, not a deduction.

---

## 19. What replaces `{ key: 'start', editable: false }` at the data door?

**Raised 2026-09-09 by the `editable` ruling. Gates this ADR.** [0011](../0011-consumer-values-in-props/README.md) leaves `CORE_FIELD_OVERRIDABLE_KEYS` standing, so no capability is lost until this decision deletes it.

Before the ruling, `editable` gated the grid only, so `interactions: { edit: … }` replaced the deleted capability exactly — one view-level gate for another. After the ruling `editable` is a **data-level** gate, and `interactions.edit` is a Gantt-level, view-level policy that `data/` may not import (`plans/01` §1). So the deletion removes something with nothing standing in for it: there is no way to say *`start` is not writable through the API* on this Dataset.

The deletion's own reason is unchanged and still good. A consumer key that a later release promotes to a core key relocates storage in silence, and the override is the window that lets it happen.

**Three shapes, each with a real cost.**

- **Keep the override for `editable` alone**, as `illegalCoreOverrideKey` already restricts it. Cheapest, and it keeps the silent window the deletion exists to close — narrower than the general case, because only a declaration carrying `editable` slips through.
- **A Dataset-level `readOnlyFields`**, naming keys the API refuses. A second way to say what `editable` says, which breaks *one name per concept*.
- **Accept the loss.** Core keys stay writable through `entries.update()`, and a consumer who wants them locked vetoes in `beforeChange` — already the cancelable door every mutation passes.

**Recommendation: the third, and check it first.** If `beforeChange` genuinely covers the case, 19 closes at no cost and the deletion proceeds as written. **Probe it before designing anything.**

---

## 23. Does a consumer *declaration* on a core key throw?

**Raised 2026-09-09 by the `props`-value ruling. Gates this ADR.** Deleting `CORE_FIELD_OVERRIDABLE_KEYS` lets the declaration fall through to `DuplicateFieldKeyError`, so this decision only arises once 19 deletes the override.

The **value** case is closed: `props: { start: … }` is a **warning**, the value is ignored, and the core definition wins. See [`closed-decisions.md`](../0011-consumer-values-in-props/README.md). What is open is the **declaration** — `fields: [{ key: 'start', editable: false }]`.

**The two sides are short, and they pull opposite ways.**

- **Throw.** A declaration is hand-written code, not data from an API the consumer does not own. The warning ruling's whole reason — *a column added upstream must not break their page* — does not reach a `fields` array the consumer typed themselves. A throw at construction is the earliest, clearest signal available.
- **Warn.** The ruling's posture is *warn, ignore, core wins, never break the consumer*, and one key at two doors with two answers is the split I14 exists to close. A consumer who generates their `fields` array from the same upstream schema that fed the entries is back in the data case.

**It is adjacent to decision 19**, which asks what replaces the deleted `{ key: 'start', editable: false }` at the data door. If 19 lands on *accept the loss*, this declaration has nothing left to express and a throw costs nothing. If 19 keeps the override for `editable`, this decision is already answered by it.

**Answer 19 first, then this.** No recommendation — the author asked to be asked.

---


---

# Closed decisions

## The `editable` ruling — `editable: false` refuses `entries.update()`

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision. It sat in the ADR as an aside — *"one thing to check before the deletion lands"*.

**The finding.** The two doors differ, and it is verified: `Field.editable` is read at exactly one place in `src/`, `view/capability.ts:120`, and nothing in `data/` consults it. So a Field a consumer declared unwritable is writable through `entries.update()` today.

**The ruling.** `editable: false` refuses the change at both doors. The write rule moves into `data/` with the derived-value rule, and `view/capability.ts` calls it rather than restating it. New error: `FieldNotEditableError`.

**Why it matters beyond the one gate.** The ADR refuses a *derived* write at `entries.update()` and claims I14 for it. Leaving the `editable` half split would give the library two answers to *"may this value change"* at two doors — the exact split I14 exists to close. Both halves move together or neither claim holds.

**What it opened.** Decisions **18** and **19**, both open. 18 asks what an *absent* `editable` does. 19 asks what replaces `{ key: 'start', editable: false }`, because `interactions.edit` is view-level and can no longer stand in for a data-level gate.

