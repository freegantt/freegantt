import { calendarScenarios } from './calendar.golden.js';
import { conflictScenarios } from './conflict.golden.js';
import { dependencyTypeScenarios } from './dependency-types.golden.js';
import { editScenarios } from './edit.golden.js';
import { followScenarios } from './follow.golden.js';
import type { GoldenScenario } from './scenario.js';

export const goldenScenarios: readonly GoldenScenario[] = Object.freeze([
  ...dependencyTypeScenarios,
  ...editScenarios,
  ...followScenarios,
  ...conflictScenarios,
  ...calendarScenarios,
]);
