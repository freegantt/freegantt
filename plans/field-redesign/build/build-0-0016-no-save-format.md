# Build 0 — ADR 0016, the library holds no save format

**The one question it answers.** Does this library save your data for you? No.

**Read first.** [`docs/adr/0016`](../../../docs/adr/0016-the-library-holds-no-save-format.md). Then [`README.md`](README.md) in this folder.

**Lands after.** Nothing. This build is first, because the five after it each owed a Document change.

**Tick each box as you finish it.** Do not batch the ticks.

---

## Target state

**Persistence belongs to the consumer.** The consumer brought the data in. The consumer owns where it goes.

Every job the Document did has a door that already ships:

| The job | The door after this build |
|---|---|
| Read every Entry out | `dataset.entries.all` |
| Read every Field declaration out | `dataset.fields.all` |
| Read a plugin's rows out | `dataset.pluginStore(id)` — **this build ships it** |
| Install a plugin on a live Dataset | Construct a new one: `new Dataset({ entries: dataset.entries.all, fields, plugins })` |

**A plugin that owns data publishes its own reader.** It gets no hook into a library format.

**Passenger data is retired.** The Dataset no longer carries rows for a plugin it does not install. That posture existed to protect a file round trip. There is no file. Rows enter a `PluginStore` one way only — the installed plugin writes them.

**`new Dataset({ entries })` does not change.** Loose input stays loose. An undeclared key is still carried, and still opaque to `update()`.

**Nothing a plugin calls changes.** The plugin context keeps all six members, `ctx.store.read` included.

---

## Work

**Build the way out before you delete anything.**

- [ ] Ship `dataset.pluginStore(id)` and its no-argument form.
- [ ] Delete `pluginRows`, the seed arm, and `toDocument` (`src/data/plugin-store.ts:220`). Keep `PluginStores`, `reserve` and `read`.
- [ ] Delete the `PluginDocument` seed arm of the `PluginStores` constructor (`:51-56`).
- [ ] Delete `FieldRegistry.authored`. Delete `#declaringPlugin` if nothing else wants it. **No Field door is published.**
- [ ] Delete `serialization-is-removable` (`.dependency-cruiser.cjs:159-162`) and its red test (`scripts/guard-red-test.mjs:80-82`). Land it in the **same commit** as the folder. **Author authorized this on 2026-09-10.**
- [ ] Delete `src/data/serialization/` whole — 6 files, about 1,200 lines.
- [ ] Delete `src/model/document.ts`.
- [ ] Delete `Dataset.toJSON` (`src/api/dataset.ts:312`), `Dataset.fromJSON` (`:326`), and the import at `:26`.
- [ ] Delete `UnsupportedSchemaError` from `src/model/errors.ts`, `src/model/index.ts` and `src/api/index.ts`.
- [ ] Delete `reportCorrectedRollUps` and its tests. Its only caller was the reader.
- [ ] Give `src/data/history.property.test.ts` a test-local snapshot over `entries.all`. **I7 does not change** — undo still reverts user and engine effects atomically. Only the comparison changes.
- [ ] Reword the `DatasetPluginOf` doc comment (`src/api/dataset-plugin.ts:94`). It cites *"a Field the Document never had"*. The reason for the lock is the Rollup, not the Document.
- [ ] Rewrite the format tests in `src/api/dataset.test.ts`. Keep what survives, against the constructor.
- [ ] Update the seven comments that cite the deleted files.
- [ ] Replace the three harness dumps — `harness/main.ts:309`, `harness/data.ts:258`, `harness/hierarchy.ts:277` — with `JSON.stringify(dataset.entries.all, null, 2)`. Or delete the panel.
- [ ] Delete the harness export/import feature in `harness/data.ts` — the button, the textarea, and the `fromJSON` read at `:265`. It is a feature, not a dump.
- [ ] Delete the harness comment at `harness/data.ts:39-40`. It claims the lock rides in the Document.
- [ ] Update `harness/docs/page-brief.ts:45`. It lists `toJSON` / `fromJSON` as public surface. `:41` makes the same claim in prose.
- [ ] Declare `window.__dataset` as a bare `Dataset` in `harness/hierarchy.ts:28` and `harness/data.ts:30`, so the double cast at `harness/main.ts:89` goes.
- [ ] Regenerate `etc/freegantt.api.md`. I11 gates it.
- [ ] Ask the author to mark `plans/s2-data-core/s2.6-serialization.md` retired.
- [ ] Ask the author to mark D-S5-24 and D-S5-30 retired in `plans/s5-extensibility-and-editing/s5.10-dataset-plugins.md:73`.
- [ ] Raise [#266](https://github.com/Pawel-IT/FreeGantt/issues/266) with its owner. This build deletes one of the two things *Document* named. It does not close the issue.
- [ ] Close the build — see [`README.md#close-every-build`](README.md).

**Slices it touches.** S2 (serialization landed at S2.6), S4 (the Field codec, S4.4), S5 (plugin rows, S5.10). **Re-run the S2, S4 and S5 slice gates.**

---

## Do not

- **Do not delete a door before its replacement exists.** `dataset.pluginStore(id)` ships first. `pluginStores.read` is not public.
- **Do not publish a Field door.** `FieldRegistry.authored` goes with no successor.
- **Do not ship a way in for passenger rows.** No public door matches `pluginStore(id)`. An application that saved plugin rows re-installs the plugin and writes them back through the plugin's own API.
- **Do not spend a schema number.** There is no format left to version.
- **Do not keep a write-only dump in the API.** `JSON.stringify(dataset.entries.all)` is one line of harness code.

---

## Gate

```bash
pnpm verify:full > /tmp/v.log 2>&1; tail -3 /tmp/v.log

# The format and its vocabulary are gone. Returns 240 today. Must return 0.
grep -rn --include='*.ts' 'toJSON\|fromJSON\|toDocument\|fromDocument\|DatasetDocument\|EntryDocument\|SerializedField\|PluginDocument\|UnsupportedSchemaError' src/ harness/ | wc -l
```

`etc/freegantt.api.md` shrinks, and I11 gates that it matches.

---

## Issues

| Issue | What this build does to it |
|---|---|
| [#192](https://github.com/Pawel-IT/FreeGantt/issues/192) | Already closed. This build makes it unreachable — its subject is a document read, and there is no reader. Its **hazard** survives at live install, and ADR 0014 records it. |
| [#212](https://github.com/Pawel-IT/FreeGantt/issues/212) | Schema 4 existed to carry Segment ids. The store keeps them. Nothing writes them out. |
| [#266](https://github.com/Pawel-IT/FreeGantt/issues/266) | Raise it, do not close it. One of its two names goes. |
