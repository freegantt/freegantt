---
status: accepted — built and verified 2026-09-10, in the field redesign. Verdict: [BUILD-SPEC.md §1](../../plans/field-redesign/BUILD-SPEC.md#1--verification-report).
decided: the library holds no save format; `toJSON`, `fromJSON`, the Document types, the `schema` integer and `data/serialization/` are deleted; persistence is the consumer's job, through read surfaces that already ship; a plugin publishes its own reader and gets no serialization hook.
open: none. One question opened and closed on 2026-09-10 — `props` stands, on the two reasons that never mentioned serialization.
---

# The library holds no save format

**This ADR deletes a public surface, and it makes the five ADRs after it smaller.** ADRs 0012, 0011, 0013, 0014 and 0015 each spend a schema number today. None of them spends one after this lands.

## Context

The library has two ways in, and only one of them has ever had a version.

**The first is the consumer's own data.** An application reads rows from its server, maps them into our shape, and calls `new Dataset({ entries, fields })`. There is no schema on this path. It is versioned by semver, like every other API we publish. This is the common path, and it is the path a comparable Gantt or data grid offers.

**The second is our own save format.** `dataset.toJSON()` writes a `Document` — the entries, the Field declarations, the plugin rows and the time zone. `Dataset.fromJSON(doc)` reads it back. Those are our bytes, not the consumer's, and that is where the integer `schema` lives.

Nobody designed the second path as a feature. It accreted, once per slice, each time our own file shape changed during development.

| Schema | Landed in | What changed |
|---|---|---|
| 1 | `db67b52`, slice S2.6 | the format existed at all |
| 2 | `3128dee`, slice S4.4 | Field declarations started to round-trip |
| 3 | `e4bc4cb`, slice S5.10 | the `plugins` key appeared |
| 4 | `c305e3a`, [#212](https://github.com/Pawel-IT/FreeGantt/issues/212) | Segments gained ids |

`git tag` is empty. The library has never shipped. **Every migration path in `read.ts` migrates a document that only this repository has ever produced**, and no code writes one to disk — the harness dumps `toJSON()` into a textarea to look at, and the only `localStorage` key in the tree is the theme toggle.

### The cost is not the four readers

Four dead readers are cheap. A **versioned public document** is not, because it becomes a reason in decisions it should never have touched.

- **ADR 0005 rejected flat consumer keys on the Entry because we serialize.** Its words: *"the one thing a grid does not do: we serialize. `meta` is not the consumer's API — it is the consumer's namespace in a versioned document."*
- **[ADR 0011](0011-consumer-values-live-in-props.md) rejected the same option again**, and two of its four charges are Document charges: the Document reader's unknown-key rule inverts, and an older file whose consumer key a later release promotes needs its own migration door.
- **`plans/02` §6 makes the JSON shape public API, documented and semver-governed**, with a key-order contract and a migration promise.
- **Every ADR in the field redesign spends a schema number** — 5, 6, 7, 8, 9 — and each one owes a reader, a fixture set and a migration decision.

### And plugins are coupled to it

A plugin's rows reach the outside world through `PluginStores.toDocument()` (`data/plugin-store.ts:220`). A plugin has no persistence API of its own. It has a serialization hook into ours. So a consumer who wants to save a plugin's data must save **our** document, in **our** format, at **our** version.

## Decision

**The library holds no save format. Persistence belongs to the consumer.**

Deleted: `Dataset.toJSON`, `Dataset.fromJSON`, `DatasetDocument`, `EntryDocument`, `SerializedField`, `PluginDocument`, `UnsupportedSchemaError`, the `schema` integer, `src/data/serialization/` entire, `src/model/document.ts`, and `PluginStores.toDocument`.

The consumer brought the data in. They own where it goes.

### Every job the Document did has a door that already ships

| The job | The door after this ADR |
|---|---|
| Read the current entries out | `dataset.entries.all` — `data/entry-store.ts:155`, already public |
| Read the Field declarations out | `dataset.fields.all` — `api/dataset.ts:240`, already public |
| Read a plugin's rows out | `dataset.pluginStore(id)` — this ADR ships it. `pluginStores.read` is not public; it is `ctx.store.read` inside a plugin's `setup` |
| Install a plugin on a live Dataset | Construct a new one: `new Dataset({ entries: dataset.entries.all, fields, plugins })` |

**The late-install door costs what it always cost.** `plans/02:183` already prices it: a new `Dataset` identity, every subscriber rebinds, and the undo History is lost. That price does not change. One format goes away.

**A plugin that owns data a consumer must keep publishes its own reader.** It does not get a hook into a library format. The scheduling plugin's dependencies are the case to design against: a consumer saves them by reading them from the plugin, in the plugin's own vocabulary.

### What a Dataset still accepts, and what it drops

`new Dataset({ entries })` is untouched. Loose input stays loose — `string` ids, `InstantInput` dates. An undeclared key is still carried and still opaque to `update()` ([ADR 0011](0011-consumer-values-live-in-props.md) decision 1).

**Passenger data is retired.** A Dataset no longer carries rows for a plugin it does not install. That posture existed to protect a file round-trip, and there is no file. Rows enter a `PluginStore` one way only: written by an installed plugin. No public way in ships to match `pluginStore(id)` — an application that saved plugin rows re-installs the plugin and writes them back through the plugin's own API.

## The one question this raised, and its answer

**Does [ADR 0011](0011-consumer-values-live-in-props.md)'s `props` namespace still stand? Yes. Ruled by the author, 2026-09-10.** Its rejection of flat consumer keys on the Entry rests on four charges. Two of them die here:

- ~~the Document reader's unknown-key rule inverts~~
- ~~an older file whose consumer key a later release promotes needs its own migration door~~

Two survive, and neither mentions serialization:

- **Three reserved name sets appear at three doors.** Without a namespace, `add()`, `update()` and the constructor each need to know which names are core and which are the consumer's.
- **`Entry` needs an index signature**, which makes `entry.strat` compile. A typo stops being a compile error.

**`props` stands.** The two surviving charges are the stronger pair — they are about the type system and the write doors, which is where a consumer meets the library every day. ADR 0005's *"we serialize"* was always the weakest of the reasons, and this ADR removes it rather than answering it.

**This is stated and not buried, because it is the one place this ADR touches a closed decision.** The author ruled it the day the ADR opened.

**ADR 0011's rejection row already names the two charges that carry it.** A later reader who opens that row sees the voided Document charges struck, and the two that remain.

## Consequences

**The field redesign gets smaller**

- **No ADR spends a schema number.** [`shared/rulings.md`](../../plans/field-redesign/shared/rulings.md) §3 — the counter, the release gate, and the one-reader ruling of 2026-09-10 — dissolves entirely. So does its restart-at-1 rule.
- **[ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) keeps half its head decision.** *"Nothing but the Rollup writes a rolling-up parent's cell"* stands, and it is the half that carries the weight. *"A derived value never reaches the Document"* has no Document to reach. `reportCorrectedRollUps` deletes outright, with no ordering to respect between 0011 and 0013.
- **[ADR 0014](README.md#the-gap-at-0014)'s prefix keeps its reason and loses its price.** Plugin keys stay prefixed, because two writers still share one bag at runtime. *"The price of deciding late"* — a Document rewrite at schema 8 — is now no price at all.
- **[ADR 0015](0015-what-the-write-door-refuses.md) stops serializing `editable`.** Decision 19's *"the lock serializes as `never`"* has nowhere to serialize to. The lock itself stands.
- **[ADR 0012](0012-dates-are-optional-on-every-kind.md) is untouched** except that it stops writing schema 5.

**Tests and invariants**

- **I7's property test uses `toDocument` as its equality snapshot** (`src/data/history.property.test.ts:4`). It needs a test-local snapshot over `entries.all` instead. **I7 itself does not change** — undo still reverts user and engine effects atomically. Only the way the test compares two states changes.
- Round-trip and byte-stability tests go with the format they test. That is about 790 lines across `read.test.ts`, `write.test.ts` and `serialization.test.ts`.

**Specs and docs that state the old rule**

- `plans/02` §6 — the whole JSON-shape section, the key-order contract, and the migration promise.
- `plans/01:555` — the serialization bullet, and `plans/01:62`'s `data/ --> TIME` note, which cites Instant⇄ISO serialization as one of its two reasons. **The other reason stands on its own**, so the arrow stays and the sentence loses a clause.
- `plans/02:155` and `:183` — the late-install door, rewritten to construct rather than to re-read.
- ADR 0005's *"we serialize"* rejection, and [ADR 0008](0008-progress-is-scheduling-not-core.md)'s *"`schema: 2` Documents omit `progress`"*.
- `harness/main.ts:309`, `harness/data.ts:258`, `harness/hierarchy.ts:277` — three `toJSON()` textarea dumps — and `harness/docs/page-brief.ts:45`.

**What a consumer loses**

An application that wanted one call to save everything now writes a mapping from `entries.all` to its own shape. **It already writes that mapping in the inbound direction.** This is the outbound half of work it does anyway, against a shape it chose.

**What this does not decide**

View state — column widths, collapsed rows, scroll position — is not a Document and never was. Whether the library helps save that is a separate question, and this ADR does not answer it.

## Considered options

| Option | Verdict |
|---|---|
| **Delete the Document now; ship one later if a consumer asks** | **Accepted.** The library has never shipped, so the format has no users to break. A later Document starts at schema 1 with no legacy |
| **Keep the Document; drop old-schema support only** | **Rejected.** The 2026-09-10 ruling, superseded here. It removes four dead readers and keeps a public versioned format nobody asked for — and keeps it load-bearing in the Field decisions |
| **Keep `toJSON`, drop `fromJSON`** | **Rejected.** A write-only format is a debug dump in an API's clothes. The harness wants a debug dump, and `JSON.stringify(dataset.entries.all)` is one line of harness code |
| **Keep the Document, mark it unversioned and experimental** | **Rejected.** `plans/02` §6 calls it public API and semver-governed. Downgrading that is a second decision, to be made now and defended later. Deleting it is one decision |
| **Give each plugin a serialization hook instead** | **Rejected.** It keeps the coupling this ADR exists to cut, and it spreads it across every plugin. A plugin publishes a reader in its own vocabulary |

## Revisit trigger

**A consumer asks for persistence they cannot write themselves.** The likely shape is plugin-owned data with no public reader. **Answer that with a reader on the plugin, not with a document.** Reach for a save format again only when several consumers need one file that several libraries agree on — which is an interchange format, and [ADR 0013](0013-what-decides-that-a-row-derives-its-values.md) already ruled that a Document is not one.

## Issues this ADR touches

| Issue | What changes |
|---|---|
| [#192](https://github.com/Pawel-IT/FreeGantt/issues/192) | Its hazard is a `fromJSON` hazard — a plugin registering over values whose writer nobody recorded. **The `fromJSON` half closes.** The live-install half stays, and [ADR 0019](0019-one-plugin-one-install-site.md) owns it since 2026-09-11 |
| [#212](https://github.com/Pawel-IT/FreeGantt/issues/212) | Schema 4 exists to carry Segment ids. The store keeps them; nothing writes them out |
