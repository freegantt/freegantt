// One realistic sample dataset (~50 entries), used by the harness and by layout tests (plans/03 S0).
//
// Plain JSON: a consumer writes an EntryInput with a bare string id and bare date strings (plans/02 §2),
// so the fixture is written the same way — no date-math helpers, no id branding. A few entries use a
// `Date` instead of a string, since `InstantInput` accepts either (plans/01 §5) and a real consumer mixes
// both depending on where the value came from. A `Date` already names a full instant, so its `end` is
// the half-open boundary itself, not a date-only value `dateOnlyEnd` would read as "through that day".

import { Dataset } from '../src/api/index.js';
import type { Entry, EntryInput } from '../src/api/index.js';

/** What a consumer actually writes — plain JSON, no id branding or date math. The harness uses this
 * directly, exactly as a consumer would. */
export const sampleEntryInputs: EntryInput[] = [
  {
    id: 'entry-1',
    name: 'Discovery',
    start: new Date(Date.UTC(2026, 8, 1)),
    end: new Date(Date.UTC(2026, 8, 6)),
  },
  { id: 'entry-2', name: 'Stakeholder interviews', start: '2026-09-01', end: '2026-09-03' },
  { id: 'entry-3', name: 'Requirements draft', start: '2026-09-04', end: '2026-09-07' },
  { id: 'entry-4', name: 'Requirements review', start: '2026-09-08', end: '2026-09-09' },
  { id: 'entry-5', name: 'Design', start: '2026-09-10', end: '2026-09-17' },
  { id: 'entry-6', name: 'Information architecture', start: '2026-09-10', end: '2026-09-12' },
  { id: 'entry-7', name: 'Wireframes', start: '2026-09-13', end: '2026-09-16' },
  { id: 'entry-8', name: 'Visual design', start: '2026-09-15', end: '2026-09-20' },
  { id: 'entry-9', name: 'Design review', start: '2026-09-21', end: '2026-09-22' },
  { id: 'entry-10', name: 'Architecture', start: '2026-09-10', end: '2026-09-14' },
  { id: 'entry-11', name: 'Data model', start: '2026-09-10', end: '2026-09-12' },
  { id: 'entry-12', name: 'API contracts', start: '2026-09-13', end: '2026-09-16' },
  { id: 'entry-13', name: 'Infra plan', start: '2026-09-15', end: '2026-09-17' },
  {
    id: 'entry-14',
    name: 'Build',
    start: new Date(Date.UTC(2026, 8, 23)),
    end: new Date(Date.UTC(2026, 9, 13)),
  },
  { id: 'entry-15', name: 'Core scaffolding', start: '2026-09-23', end: '2026-09-25' },
  { id: 'entry-16', name: 'Auth', start: '2026-09-26', end: '2026-09-29' },
  { id: 'entry-17', name: 'Entry model', start: '2026-09-26', end: '2026-09-30' },
  { id: 'entry-18', name: 'Timeline rendering', start: '2026-10-01', end: '2026-10-06' },
  { id: 'entry-19', name: 'Scheduling engine', start: '2026-10-01', end: '2026-10-08' },
  { id: 'entry-20', name: 'Drag and resize', start: '2026-10-07', end: '2026-10-11' },
  { id: 'entry-21', name: 'Dependency links', start: '2026-10-09', end: '2026-10-12' },
  { id: 'entry-22', name: 'Grid pane', start: '2026-10-05', end: '2026-10-08' },
  { id: 'entry-23', name: 'Undo and redo', start: '2026-10-11', end: '2026-10-13' },
  { id: 'entry-24', name: 'Serialization', start: '2026-10-12', end: '2026-10-14' },
  { id: 'entry-25', name: 'Theming', start: '2026-10-13', end: '2026-10-15' },
  { id: 'entry-26', name: 'QA', start: '2026-10-13', end: '2026-10-20' },
  { id: 'entry-27', name: 'Test plan', start: '2026-10-13', end: '2026-10-14' },
  { id: 'entry-28', name: 'Unit test pass', start: '2026-10-15', end: '2026-10-17' },
  { id: 'entry-29', name: 'Integration test pass', start: '2026-10-17', end: '2026-10-19' },
  { id: 'entry-30', name: 'Accessibility audit', start: '2026-10-18', end: '2026-10-19' },
  { id: 'entry-31', name: 'Performance pass', start: '2026-10-18', end: '2026-10-20' },
  { id: 'entry-32', name: 'Bug triage', start: '2026-10-19', end: '2026-10-20' },
  { id: 'entry-33', name: 'Launch prep', start: '2026-10-21', end: '2026-10-25' },
  { id: 'entry-34', name: 'Docs', start: '2026-10-21', end: '2026-10-23' },
  { id: 'entry-35', name: 'Release notes', start: '2026-10-23', end: '2026-10-23' },
  { id: 'entry-36', name: 'Staging deploy', start: '2026-10-23', end: '2026-10-23' },
  { id: 'entry-37', name: 'Load test', start: '2026-10-24', end: '2026-10-24' },
  { id: 'entry-38', name: 'Go/no-go review', start: '2026-10-25', end: '2026-10-25' },
  { id: 'entry-39', name: 'Launch', start: '2026-10-26', end: '2026-10-26' },
  { id: 'entry-40', name: 'Production deploy', start: '2026-10-26', end: '2026-10-26' },
  { id: 'entry-41', name: 'Smoke test', start: '2026-10-26', end: '2026-10-26' },
  { id: 'entry-42', name: 'Post-launch monitoring', start: '2026-10-27', end: '2026-10-29' },
  { id: 'entry-43', name: 'Retro', start: '2026-10-29', end: '2026-10-29' },
  { id: 'entry-44', name: 'Support handoff', start: '2026-10-29', end: '2026-10-30' },
  { id: 'entry-45', name: 'Backlog grooming', start: '2026-10-30', end: '2026-10-30' },
  { id: 'entry-46', name: 'Sprint 1 planning', start: '2026-10-31', end: '2026-10-31' },
  { id: 'entry-47', name: 'Sprint 1', start: '2026-11-01', end: '2026-11-10' },
  { id: 'entry-48', name: 'Sprint 1 review', start: '2026-11-11', end: '2026-11-11' },
  { id: 'entry-49', name: 'Sprint 2 planning', start: '2026-11-12', end: '2026-11-12' },
  {
    id: 'entry-50',
    name: 'Sprint 2',
    start: new Date(Date.UTC(2026, 10, 13)),
    end: new Date(Date.UTC(2026, 10, 23)),
  },
];

/** The same entries, read once through the real Dataset boundary. Layout/render tests below `api/`
 * work with resolved `Entry` values (branded ids, `Instant` dates) and have no boundary of their own
 * to read `sampleEntryInputs` through, so this gives them the one already-resolved source of truth. */
export const sampleEntries: readonly Entry[] = new Dataset({
  entries: sampleEntryInputs,
  timeZone: 'UTC',
}).entries.snapshot();
