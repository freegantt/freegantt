// One realistic sample project (~50 tasks), used by the harness and by layout tests (plans/03 S0).

import { instant } from '../src/time/index.js';
import { taskId } from '../src/model/index.js';
import type { Task } from '../src/model/index.js';

const DAY_START = instant('2026-09-01T00:00:00Z');

function day(offset: number): number {
  return DAY_START + offset * 24 * 60 * 60 * 1000;
}

const PHASES: Array<{ name: string; startDay: number; durationDays: number }> = [
  { name: 'Discovery', startDay: 0, durationDays: 5 },
  { name: 'Stakeholder interviews', startDay: 0, durationDays: 3 },
  { name: 'Requirements draft', startDay: 3, durationDays: 4 },
  { name: 'Requirements review', startDay: 7, durationDays: 2 },
  { name: 'Design', startDay: 9, durationDays: 8 },
  { name: 'Information architecture', startDay: 9, durationDays: 3 },
  { name: 'Wireframes', startDay: 12, durationDays: 4 },
  { name: 'Visual design', startDay: 14, durationDays: 6 },
  { name: 'Design review', startDay: 20, durationDays: 2 },
  { name: 'Architecture', startDay: 9, durationDays: 5 },
  { name: 'Data model', startDay: 9, durationDays: 3 },
  { name: 'API contracts', startDay: 12, durationDays: 4 },
  { name: 'Infra plan', startDay: 14, durationDays: 3 },
  { name: 'Build', startDay: 22, durationDays: 20 },
  { name: 'Core scaffolding', startDay: 22, durationDays: 3 },
  { name: 'Auth', startDay: 25, durationDays: 4 },
  { name: 'Task model', startDay: 25, durationDays: 5 },
  { name: 'Timeline rendering', startDay: 30, durationDays: 6 },
  { name: 'Scheduling engine', startDay: 30, durationDays: 8 },
  { name: 'Drag and resize', startDay: 36, durationDays: 5 },
  { name: 'Dependency links', startDay: 38, durationDays: 4 },
  { name: 'Grid pane', startDay: 34, durationDays: 4 },
  { name: 'Undo and redo', startDay: 40, durationDays: 3 },
  { name: 'Serialization', startDay: 41, durationDays: 3 },
  { name: 'Theming', startDay: 42, durationDays: 3 },
  { name: 'QA', startDay: 42, durationDays: 8 },
  { name: 'Test plan', startDay: 42, durationDays: 2 },
  { name: 'Unit test pass', startDay: 44, durationDays: 3 },
  { name: 'Integration test pass', startDay: 46, durationDays: 3 },
  { name: 'Accessibility audit', startDay: 47, durationDays: 2 },
  { name: 'Performance pass', startDay: 47, durationDays: 3 },
  { name: 'Bug triage', startDay: 48, durationDays: 2 },
  { name: 'Launch prep', startDay: 50, durationDays: 5 },
  { name: 'Docs', startDay: 50, durationDays: 3 },
  { name: 'Release notes', startDay: 52, durationDays: 1 },
  { name: 'Staging deploy', startDay: 52, durationDays: 1 },
  { name: 'Load test', startDay: 53, durationDays: 1 },
  { name: 'Go/no-go review', startDay: 54, durationDays: 1 },
  { name: 'Launch', startDay: 55, durationDays: 1 },
  { name: 'Production deploy', startDay: 55, durationDays: 1 },
  { name: 'Smoke test', startDay: 55, durationDays: 1 },
  { name: 'Post-launch monitoring', startDay: 56, durationDays: 3 },
  { name: 'Retro', startDay: 58, durationDays: 1 },
  { name: 'Support handoff', startDay: 58, durationDays: 2 },
  { name: 'Backlog grooming', startDay: 59, durationDays: 1 },
  { name: 'Sprint 1 planning', startDay: 60, durationDays: 1 },
  { name: 'Sprint 1', startDay: 61, durationDays: 10 },
  { name: 'Sprint 1 review', startDay: 71, durationDays: 1 },
  { name: 'Sprint 2 planning', startDay: 72, durationDays: 1 },
  { name: 'Sprint 2', startDay: 73, durationDays: 10 },
];

export const sampleTasks: Task[] = PHASES.map((phase, index) => ({
  id: taskId(`task-${index + 1}`),
  name: phase.name,
  start: day(phase.startDay) as Task['start'],
  end: day(phase.startDay + phase.durationDays) as Task['end'],
  scheduling: 'auto',
}));
