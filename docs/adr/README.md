# The decision records

One file per decision, numbered in the order the decision was taken. A record says **why**, and it names the evidence. A spec (`plans/00`–`04`) says **what is true now**. When the two disagree, `src/` is the answer.

An accepted record is superseded, never rewritten. A later record states the change, and the earlier body stays as it was written.

## Index

Every record, in one table. **Status is the only index of a supersession or an amendment** — a
reader who wants to know whether an ADR still holds reads this column, not each file's own
frontmatter.

| # | Title | Status | Decides |
| --- | --- | --- | --- |
| [0001](0001-temporal-polyfill-for-zone-aware-date-arithmetic.md) | `temporal-polyfill` for zone-aware date arithmetic | accepted | `time/zone.ts` wraps `temporal-polyfill`, so DST fold/gap is a chosen, tested policy |
| [0002](0002-scheduling-is-a-plugin-not-a-core-layer.md) | Scheduling is a plugin, not a core layer | accepted | Scheduling logic sits behind a plugin seam, out of the mandatory core |
| [0003](0003-the-authored-record-is-an-entry-not-a-task.md) | The authored record is an Entry, not a Task | accepted | The core record is named `Entry`, with no task-management assumption baked in |
| [0004](0004-the-authored-body-of-data-is-a-dataset-not-a-project.md) | The authored body of data is a Dataset, not a Project | accepted | The wrapping class is named `Dataset`, with no project-management assumption baked in |
| [0005](0005-fields-are-declared-and-grid-columns-reference-them.md) | Fields are declared and grid columns reference them | superseded by 0011 | (historical) an earlier Field design, with `meta` where `props` now sits |
| [0006](0006-the-change-record-is-a-changeset-not-a-transaction-or-a-commit.md) | The change record is a ChangeSet, not a Transaction or a Commit | accepted | `dataset.on('change')` carries a `ChangeSet`, the one delta type |
| [0007](0007-friend-only-methods-move-off-the-class-into-a-weakmap-backed-function.md) | Friend-only methods move off the class, into a WeakMap-backed function | accepted | `bind`/`unbind` are free functions closing over a private `WeakMap`, never public class methods |
| [0008](0008-progress-is-scheduling-not-core.md) | Progress is scheduling-plugin data, not a core Field | amended by 0016 | `progress` is not on `Entry` and not in the Field registry; its Document-era wording no longer applies |
| [0009](0009-core-raises-an-error-report-the-consumer-retains-it.md) | Core raises an Error report; the consumer retains it | accepted | A refusal is a typed report on an event, not a throw the consumer must catch to keep |
| [0010](0010-the-selection-holds-segments-not-entries.md) | The Selection holds Segments, not Entries | superseded by 0025 | (historical) the Selection once held `SegmentId` |
| [0011](0011-consumer-values-live-in-props.md) | Consumer values live in props | accepted | A consumer's own values live under `entry.props`; the Field key is the whole address |
| [0012](0012-dates-are-optional-on-every-kind.md) | Dates are optional on every kind | superseded by 0027 | An Entry spans iff both `start` and `end` are present; one date without the other is legal |
| [0013](0013-what-decides-that-a-row-derives-its-values.md) | What decides that a row derives its values | amended by 0022 | Structure (has children, or not) decides derivation and the default look — no stored classification |
| — | *(0014 — withdrawn before build; the number is not reused, see below)* | — | — |
| [0015](0015-what-the-write-door-refuses.md) | What the write door refuses | accepted | `editable` governs `entries.update()` and the grid through one rule, one refusal |
| [0016](0016-the-library-holds-no-save-format.md) | The library holds no save format | accepted | No `toJSON`/`fromJSON`/Document; persistence is the consumer's own job |
| [0017](0017-the-entry-answers-questions-about-itself.md) | The Entry answers questions about itself | superseded by 0024 | `Entry`/`StoredEntry` are two types; the read seam reads `entry.read(key)` |
| [0018](0018-a-variant-is-a-rule-not-an-id-list.md) | A variant is a rule, not an id list | accepted | A Variant is a `when` rule; nothing stores which rows wear it |
| [0019](0019-one-plugin-one-install-site.md) | One plugin, one install site | accepted | A chrome-only plugin installs on `Gantt`; a plugin with a data half installs on `Dataset` |
| [0020](0020-a-plugin-may-own-the-hierarchy.md) | A plugin may own the hierarchy | accepted | A plugin states an Entry's parent through one hierarchy-source seam; the Rollup follows |
| [0021](0021-the-consumers-stylesheet-wins.md) | The consumer's stylesheet wins | accepted | The base stylesheet ships in one cascade layer, so an unlayered consumer rule always wins |
| [0022](0022-core-ships-variants-and-a-variant-answers-about-itself.md) | Core ships variants and a variant answers about itself | amended by 0023 | Core exports `bar()`/`summary()`/`diamond()`; `gantt.variantFor(entry)` is the one resolve door |
| [0023](0023-a-variant-with-no-items-follows-the-data.md) | A variant with no items follows the data | accepted | A variant with no `bars` key draws the structural default |
| [0024](0024-parentid-answers-the-stored-value-on-every-door.md) | `parentId` answers the stored value on every door | accepted | `entry.read('parentId')` is always the stored value; `hierarchyParentId` answers the tree question |
| [0025](0025-the-selection-holds-entries-not-segments.md) | The Selection holds Entries, not Segments | accepted | The Selection holds `EntryId` again, reversing 0010 |
| [0026](0026-the-segment-retires.md) | The Segment retires | accepted | `Segment` is deleted as a type; a former Segment is an ordinary child `Entry` |
| [0027](0027-a-spanning-entry-draws-a-bar.md) | A spanning Entry draws a Bar | accepted | A spanning Entry draws one Bar; a segmented parent draws no Bar of its own |
| [0028](0028-a-plugins-impossible-proposal-is-a-refusal.md) | A plugin's impossible proposal is a refusal | accepted | An extender proposing an impossible value is refused at `warning` with `by` naming it; an extender that throws is a `'error'` fault |

## The gap at 0014

**There is no ADR 0014. The number is not reused.**

`0014 — the plugin-author surface` was split out of [ADR 0011](0011-consumer-values-live-in-props.md) on 2026-09-09. It stayed a draft. The author withdrew it on 2026-09-11, before its build started, and no line of it ever reached `src/`. The file was deleted on 2026-09-11 so that no reader can mistake a withdrawn draft for the design.

**Why it was withdrawn, and why that was right.** The draft renamed `entries.fieldValue` to `entries.read` and made a plugin key prefix a rule the registry checks. Neither earned its price:

- **The prefix.** A prefix is a convention a plugin follows — `scheduling:progress` ([ADR 0008](0008-progress-is-scheduling-not-core.md)) — not a rule core enforces. Enforcement bought a reserved-name list and two write-door refusals, and it protected nothing that a declaration collision does not already catch.
- **The rename.** [ADR 0016](0016-the-library-holds-no-save-format.md) deleted the save format, which removed the draft's own stated price for deciding late. The rename then had no deadline, and a better door arrived: [ADR 0017](0017-the-entry-answers-questions-about-itself.md) puts the read on the row itself, as `entry.read(key)`. One door on the object that holds the value beats a second by-key door beside `fieldValue`.

**What survived the withdrawal, and where it lives now.** Three things the draft held were real, so they were rehomed rather than dropped:

| What | Where it lives now |
|---|---|
| `entry.read(key)` is the one Field read, and [#274](https://github.com/Pawel-IT/FreeGantt/issues/274)'s duration door closes with it | [ADR 0017](0017-the-entry-answers-questions-about-itself.md) |
| A plugin that installs over values it did not write | [ADR 0019](0019-one-plugin-one-install-site.md) |
| An undeclared key is never written by the library | [ADR 0011](0011-consumer-values-live-in-props.md), and `CONTEXT.md`'s *props* entry |

The full close-out is in [`plans/field-redesign/CLOSE-OUT.md`](../../plans/field-redesign/CLOSE-OUT.md). Working material under `plans/field-redesign/` still names ADR 0014, because it records what was thought at the time. Read it as history.
