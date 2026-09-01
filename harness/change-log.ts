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
  for (const { store, id, field, from, to } of changeSet.updated) {
    prependLogLine(log, `${tag} ${store} · ${id} · ${field} · ${String(from)} → ${String(to)}`);
  }
}
