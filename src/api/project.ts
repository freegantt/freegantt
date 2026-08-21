// api/ is the only layer a consumer imports (plans/01 §1). S0 scope: read-only project wrapper over fixture tasks.

import type { Task } from '../model/index.js';

export interface ProjectOptions {
  tasks: readonly Task[];
}

export class Project {
  readonly tasks: readonly Task[];

  constructor(options: ProjectOptions) {
    this.tasks = options.tasks;
  }
}
