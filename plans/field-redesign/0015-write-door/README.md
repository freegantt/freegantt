# ADR 0015 — what the write door refuses

**The decision:** [`docs/adr/0015-…`](../../../docs/adr/0015-what-the-write-door-refuses.md)

How strict is `entries.update()`? What does an *absent* `editable` mean there, what replaces the deleted core-key override, and does a consumer declaration on a core key throw?

## Where it stands

**One decision is open — 18**, and it is held. Two closed on 2026-09-10 — **19** and **23**. One ruling was already closed — `editable: false` refuses `entries.update()`. Answer 19 first was the chain; 19 kept the override, so 23 closed with it.

**Nothing blocks on this ADR.** It changes the default posture of a public door, which is why it deserves its own decision rather than a bullet inside a storage rename.

## Why it does not gate the storage rename

The override machinery lives entirely in `field-registry.ts:101-225`, and `#mergeCoreFieldOverride` merges **`editable` only** — it never reads `source`. So [0011](../0011-consumer-values-in-props/README.md) deletes `FieldSource` cleanly around it. Decision 19, closed 2026-09-10, **keeps** `{ key: 'start', editable: false }` and serializes it.

## This ADR owns the resolver's `editable` arm, and only that arm

[0011](../0011-consumer-values-in-props/README.md) moves the write resolver into `data/` with HEAD's policies unchanged — `view/capability.ts` calls it; `entries.update()` keeps `UnknownFieldError` only until later ADRs wire an arm. [0013](../0013-what-decides-derivation/README.md) fills the derived arm. **This ADR fills the editable arm and wires `entries.update()` to it.** `view/capability.ts:120` is the one place in `src/` that reads `Field.editable` today, so the arm has exactly one existing behaviour to change. Claim I14 when this ADR lands, not after 0013.

## An API gap this ADR owns: a core override never reaches the Document

**Recorded here 2026-09-10.** It was in the [0015 spike review](../reviews/2026-09-10-0015-write-door-spikes/README.md) as trap 12 and in the combined review's HEAD traps, and in no ADR.

`FieldRegistry.authored` filters core Field keys (`field-registry.ts:150-152`), and `encodeDeclaredField` drops them too. A consumer's `{ key: 'end', editable: false }` merges into the core Field at construction and then **never serializes**. `cost.editable` round-trips; `end.editable` does not. `fromJSON` is ingest, so the lock only survives if the caller passes `fields` again.

**`harness/data.ts:39-40` states the opposite, and it is live today:** *"The lock rides in the Document too. `editable` serializes on the Field, so an exported Document carries it and an import puts it back."* The call it describes is `{ key: 'end', editable: false }` at `:45`.

**This ADR closes it by serializing the override.** Decision 19, closed 2026-09-10, keeps `{ key: 'start', editable: false }` and writes it into the Document. Do not tidy the harness comment; close the library.

## Decision 18's cost table is two rows

18 lists structural calls that would start throwing. **[0013](../0013-what-decides-derivation/README.md) deleted `kind`**, so `update(id, { kind })` does not exist. Argue 18 against `parentId` and `segments` only.

---

# Open decisions

**One — 18, held.** 19 and 23 closed on 2026-09-10 and are below.

## 18. Does an *absent* `editable` also refuse `entries.update()`?

**Raised 2026-09-09 by the `editable` ruling. Gates this ADR.** [0011](../0011-consumer-values-in-props/README.md) moves the resolver into `data/` carrying HEAD's policies; this decision sets the editable arm's.

`Field.editable` is `boolean | undefined`, and `view/capability.ts:120` reads it as `field.editable === true ? WRITABLE : NOT_WRITABLE` — so absent and `false` are one answer there. The ruling says `editable: false` refuses `entries.update()`. It does not say what **absent** does, and the two answers are far apart.

**Copy the view rule.** `entries.update()` refuses unless a Field declares `editable: true`. One rule, one resolver, one answer at every door. The price is the default posture of a public door: `update(id, { props: { owner: 'Sam' } })` starts throwing for every Field that did not opt in. A data library whose write door is closed by default is a surprising shape, and `editable` was named for the *grid*, not for the API.

**The price is larger than consumer Fields, and it was measured.** Only three core Fields declare `editable: true` — `name`, `start`, `end`. Copying the view rule closes three **structural** doors that have nothing to do with a grid:

| Call | Field | Today |
|---|---|---|
| `update(id, { parentId })` — reparenting | `parentId` | no `editable`. Live at `harness/main.ts:181` and `hierarchy.ts:254` |
| `update(id, { segments: [...] })` — Segment writes | `segments` | no `editable`. #212, ADR 0010 |

**`kind` is gone.** [0013](../0013-what-decides-derivation/README.md) decision 26 deleted the Field. The third row is not on this table.

Keeping the view rule means declaring `editable: true` on `parentId` — a Field with **no column at all**. That is answering a grid question about something no grid shows, and it is the tell that `editable` is being asked to do two jobs.

**Decision 21 closed with 26: no flag.** There is no fourth row.

**Split absent from `false`.** Absent means *no opinion, the API may write*; `false` means *refused everywhere*. Today's writes keep working and the ruling still lands. The price is that `boolean | undefined` then carries three meanings at one door and two at another — the split the ruling just closed, moved from between the doors to inside the type.

**A third shape exists:** `editable` names the *grid's* answer and a second word names the API's. That is a new key on `Field`, so it needs its own justification against *one config tree per job*.

### The locked specs already answer this, and no spike put them on the table

**Added 2026-09-10.** Four live sentences rule 18 the **first** way — copy the view rule. The spike wave scored *split* the winner without quoting any of them.

| Where | What it says |
|---|---|
| `plans/02:477` | *"one answer gates every writer (I14), so a consumer states it once"* — and *"Default is `false`."* |
| `plans/01:283` | `editable?: boolean;` — *"the Field half of one write answer … (I14); default false"* |
| `plans/01:926` | The I14 row itself: *"every write asks one `canWrite` (#256)"* |
| `src/model/field.ts:125-127` | *"one home for 'may this value change,' asked by every gesture that writes it (I14). Default `false`."* |

**So *split* is not the compatible answer and *copy* the breaking one. Both edit a locked spec.** Copy breaks three published calls. Split retires `plans/02:477`'s *one answer gates every writer* and weakens an invariant that owns a CI job. **[`prose-sweep.md`](../shared/prose-sweep.md) carries the rows** for whichever way this lands.

**One more thing the I14 claim rests on.** `e2e/write-refusal.spec.ts` is I14's enforcement, and it drives the cell editor and the bar handles only. It never calls `entries.update()`. **Claiming I14 at the data door needs a new assertion there**, whichever answer wins.

### A fourth shape: one key, three states

**Raised 2026-09-10.** The spike killed *a second word* on `{ key: 'owner', editable: false, acceptsUpdate: true }` — rightly, that sentence is a lie. **That is not the only spelling.** Widen the one key instead of adding a second:

```ts
fields: [{ key: 'parentId', editable: 'api' }]      // writable through the API, no cell
fields: [{ key: 'start', editable: 'never' }]       // refused everywhere
fields: [{ key: 'cost', editable: 'anywhere' }]     // today's `true`
```

`true` and `false` stay as loose aliases, so nothing published breaks. **Split already creates exactly three states** — absent, `false`, `true` — and spells them with two booleans and an absence. This spells them. That is the whole case: it deletes split's stated price, which is *`boolean | undefined` carries three meanings at one door and two at another*.

**Its cost, and it is not free.** Three states mean `canWrite` has to know **which door is asking**, so the primitive gains a door argument or the verdict gains a second field. That is a widening of I14's *one resolution*, and it is the same objection *a second word* lost on, moved from the Field to the resolver. **Score it on that.** One key and one concept argue for it; `view/capability.ts:80`'s signature argues against.

**No recommendation.** Four shapes now, and the choice is a posture, not a deduction.

### Author briefing, 2026-09-10 — held

The author asked for this wording on the decision, and held a ruling. A boolean that means three things, one of them absence, is not wanted.

**Background.** `editable` was named for the grid: may this cell or this bar handle change? An invariant then said **every** write uses that same answer, default **false**. Copied to `update()`, that means you cannot change `cost` from code unless you also opt the Field into the grid. Re-parenting and segment writes have no cell at all, so "not editable" there is the wrong question.

**The shape that was scored, and is not ruled.** Split. Absent `editable` means the **API may write**. `editable: false` refuses everywhere (already ruled). `editable: true` opens the cell and the handle. I14 would then cover gestures and what the user sees, not `dataset.entries.update()`.

**Consequence of that shape, if it ever rules.** Bars still drag, because `start` and `end` default to editable. A cost column stays read-only until you set `editable: true`. A script can still `update({ cost })`. A user never sees a handle they cannot use. An app author is not blocked by a grid flag.

**Why it is held.** That split makes `editable?: boolean` carry three meanings at one door (absent, false, true) and two at another. The author does not want that. A three-state spelling (`'api' | 'never' | 'anywhere'`) names the three states and then makes `canWrite` take a door. **No ruling until a shape that is not a three-way boolean is on the table.**

---

# Closed decisions

## The `editable` ruling — `editable: false` refuses `entries.update()`

**Closed 2026-09-09. Ruled by the author.** It was never a numbered decision. It sat in the ADR as an aside — *"one thing to check before the deletion lands"*.

**The finding.** The two doors differ, and it is verified: `Field.editable` is read at exactly one place in `src/`, `view/capability.ts:120`, and nothing in `data/` consults it. So a Field a consumer declared unwritable is writable through `entries.update()` today.

**The ruling.** `editable: false` refuses the change at both doors. [0011](../0011-consumer-values-in-props/README.md) already moved the function into `data/`. This ADR fills the editable arm and wires `entries.update()` to it, and `view/capability.ts` keeps calling the same function rather than restating it. New error: `FieldNotEditableError`, declared and thrown here.

**Why it matters beyond the one gate.** [0013](../0013-what-decides-derivation/README.md) refuses a *derived* write at `entries.update()`. Leaving the `editable` half split would give the library two answers to *"may this value change"* at two doors — the exact split I14 exists to close. **Claim I14 when this ADR lands, and only for the half this ADR owns.** Decision 18 is held, so do not claim I14 at `entries.update()` for an *absent* `editable`.

**What it opened.** Decision **18**, held. Decisions **19** and **23** closed on 2026-09-10.

## 19 — keep `{ key: 'start', editable: false }`, and serialize it

**Closed 2026-09-10. Ruled by the author.** Was: *what replaces `{ key: 'start', editable: false }` at the data door?*

**The ruling. Keep the override for `editable` alone.** `{ key: 'start', editable: false }` constructs. Create, ingest, and History replay still write. `update()` and the grid refuse **change**. Un-date is a change, so it throws `FieldNotEditableError`.

**Serialize the override.** `FieldRegistry.authored` currently drops core keys, so the lock does not round-trip. This ruling closes that gap: a core `editable: false` rides in the Document. Do not tidy the harness comment; close the library. `fromJSON` is ingest, so without encoding, the lock only survived if the caller passed `fields` again.

**`beforeChange` does not replace this.** `fieldRowsOf` filters `updated`, so it never sees `add`. The event cannot lock a create.

**What lost.** A Dataset-level `readOnlyFields` (second name for `editable`). Accepting the loss (no way to lock `start` on the Dataset).

## 23 — three declaration shapes

**Closed 2026-09-10. Ruled by the author.** Decision 19 kept the override, so this is already answered by it.

**Three shapes.** `{ key: 'start', editable: false }` constructs (the lock). `{ key: 'start' }` is a no-op. `{ key: 'start', column }` throws `IllegalCoreFieldOverrideError`. Extra keys on a core name throw. The lock is the one override we keep.

A `props` *value* naming a core key stays a warning ([0011](../0011-consumer-values-in-props/README.md)). This ruling is the *declaration* half.


