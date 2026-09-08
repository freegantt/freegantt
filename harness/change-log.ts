import type { ChangeSet } from '../src/api/index.js';

/** Call: `prependLogLine(log, '[load] imported document')`. */
export function prependLogLine(log: HTMLElement, text: string): void {
  const row = document.createElement('div');
  row.textContent = text;
  log.prepend(row);
}

/** Call: `prependChangeSet(log, changeSet)`. Built from the changeset alone (D-S2-17). */
export function prependChangeSet(log: HTMLElement, changeSet: ChangeSet): void {
  const tag = `[${changeSet.origin}]`;
  for (const { store, entity } of changeSet.added) {
    prependLogLine(log, `${tag} ${store} · ${entity.id} · added`);
  }
  for (const { store, entity } of changeSet.removed) {
    prependLogLine(log, `${tag} ${store} · ${entity.id} · removed`);
  }
  for (const row of changeSet.updated) {
    // A plugin-store row carries a whole value, not a Field, so it has no `field` to name (D-S5-24).
    const what = row.store === 'entries' ? row.field : 'row';
    prependLogLine(
      log,
      `${tag} ${row.store} · ${row.id} · ${what} · ${String(row.from)} → ${String(row.to)}`,
    );
  }
}
