// e2e fixture for S2.4 (plans/s2-data-core/s2.4-live-binding.md §5): the mutation half of the live
// binding, exercised the way an app author would — add/rename/move/remove buttons calling
// `dataset.entries.add/update/remove`, and a changeset log built from each `ChangeSet`, never a
// re-read (D-S2-17). The lock checkbox is D-S2-25's `beforeChange` veto, made visible: the bar does
// not move and the calling button's own `catch` reads `MutationCancelledError`.

import { Dataset, Gantt, MutationCancelledError } from '../src/api/index.js';
import type { ChangeSet, Entry } from '../src/api/index.js';
import { sampleEntryInputs } from '../fixtures/sample-dataset.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const dataset = new Dataset({ entries: sampleEntryInputs.slice(0, 8), timeZone: 'UTC' });
new Gantt({ container: '#gantt', dataset });

const select = document.querySelector<HTMLSelectElement>('#entry-select')!;
const nameInput = document.querySelector<HTMLInputElement>('#rename-input')!;
const addBtn = document.querySelector<HTMLButtonElement>('#add-entry')!;
const renameBtn = document.querySelector<HTMLButtonElement>('#rename-btn')!;
const moveBackBtn = document.querySelector<HTMLButtonElement>('#move-back-btn')!;
const moveFwdBtn = document.querySelector<HTMLButtonElement>('#move-fwd-btn')!;
const removeBtn = document.querySelector<HTMLButtonElement>('#remove-btn')!;
const lockCheckbox = document.querySelector<HTMLInputElement>('#lock-checkbox')!;
const log = document.querySelector<HTMLDivElement>('#log')!;

let nextNewId = 1;

function selectedEntry(): Entry | undefined {
  return dataset.entries.get(select.value);
}

/** The store's own current first entry — dynamic, so a remove/reorder keeps "the first entry"
 *  honest rather than pinning an id from before the page's mutations started. */
function firstEntryId(): string | undefined {
  return dataset.entries.all[0]?.id;
}

function refreshSelect(): void {
  const previous = select.value;
  select.innerHTML = '';
  for (const entry of dataset.entries.all) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = `${entry.id} — ${entry.name}`;
    select.append(option);
  }
  if (dataset.entries.has(previous)) select.value = previous;
  nameInput.value = selectedEntry()?.name ?? '';
}

function logLine(text: string): void {
  const row = document.createElement('div');
  row.textContent = text;
  log.prepend(row);
}

/** Built from the changeset alone (D-S2-17) — `from` is not a value a re-read of the dataset could
 *  ever produce. */
function logChangeSet(changeSet: ChangeSet): void {
  for (const { store, entity } of changeSet.added) logLine(`${store} · ${entity.id} · added`);
  for (const { store, entity } of changeSet.removed) logLine(`${store} · ${entity.id} · removed`);
  for (const { store, id, field, from, to } of changeSet.updated) {
    logLine(`${store} · ${id} · ${field} · ${String(from)} → ${String(to)}`);
  }
}

dataset.on('change', ({ changeSet }) => {
  logChangeSet(changeSet);
  refreshSelect();
});

// D-S2-25: while the checkbox is on, refuse any changeset touching the current first entry. Four
// lines, and it makes the veto visible on the same page as everything else.
dataset.on('beforeChange', ({ changeSet }) => {
  if (!lockCheckbox.checked) return undefined;
  const lockedId = firstEntryId();
  const touchesLocked =
    changeSet.updated.some((u) => u.id === lockedId) ||
    changeSet.removed.some((r) => r.entity.id === lockedId);
  if (!touchesLocked) return undefined;
  logLine(`entries · ${lockedId} · refused (locked)`);
  return false;
});

addBtn.addEventListener('click', () => {
  const id = `new-${nextNewId++}`;
  const start = Date.now();
  dataset.entries.add({ id, name: 'New entry', start, end: start + ONE_DAY_MS });
});

renameBtn.addEventListener('click', () => {
  const entry = selectedEntry();
  if (!entry) return;
  try {
    dataset.entries.update(entry.id, { name: nameInput.value });
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
});

function move(deltaMs: number): void {
  const entry = selectedEntry();
  if (!entry) return;
  try {
    dataset.entries.update(entry.id, { start: entry.start + deltaMs, end: entry.end + deltaMs });
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
}

moveBackBtn.addEventListener('click', () => move(-ONE_DAY_MS));
moveFwdBtn.addEventListener('click', () => move(ONE_DAY_MS));

removeBtn.addEventListener('click', () => {
  const entry = selectedEntry();
  if (!entry) return;
  try {
    dataset.entries.remove(entry.id);
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
});

select.addEventListener('change', () => {
  nameInput.value = selectedEntry()?.name ?? '';
});

refreshSelect();
