> **The Document sentences are retired by [ADR 0016](0016-the-library-holds-no-save-format.md) (2026-09-10).** The library holds no save format, so there is no Document to keep `progress` out of, and no reader to drop a `schema: 1` key. **The decision itself stands, and is untouched:** `progress` is not on `Entry` and not in the Field registry. **The body stays as written**, because an ADR records the reasoning of its day.

# Progress is scheduling-plugin data, not a core Field

`% complete` is a project-planning measure. Core names what an Entry *is* (dated, kinded, spanning). A shift roster, a booking calendar, and machine uptime have no honest home for `progress`, the same way they have no home for `Dependency` or the pin flag (ADR 0002, ADR 0003). Shipping `progress` as a core Field would put a scheduling opinion on every Dataset, including ones that never install a scheduling plugin.

`progress` is **not** on `Entry`, not in the Field registry, and not in the Document. A `schema: 1` key named `progress` is dropped on read, like any other unknown top-level entry key. S7's scheduling plugin stores Progress in plugin-owned data and registers it as a Field. `weightedMeanByDuration` still ships as a named Aggregator, because a consumer Field and that plugin both need it.

**S4 landed this in source:** `Entry` no longer carries `progress`; `schema: 2` Documents omit it; `fromJSON` drops legacy `progress` keys (ADR 0005's core Field list and ADR 0008 align).

## Considered options

- **Keep `progress` as a core Field with `rollUp: 'weightedMeanByDuration'`.** Rejected: it privileges percent-complete as universal, and D-S4-6 would overwrite authored group progress on every `rollUpKinds` parent with no per-Field escape.
- **Leave `Entry.progress` as a non-Field passenger until S7.** Rejected: no released consumers, and a dead key that `update()` refuses while `toJSON` still wrote it is worse than one removal.
