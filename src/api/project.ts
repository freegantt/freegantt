// api/ is the only layer a consumer imports (plans/01 §1). S0 scope: read-only project wrapper over fixture tasks.

import type { Task } from '../model/index.js';

export interface ProjectOptions {
  tasks: readonly Task[];
  /** IANA zone (D6) — all zone-aware date arithmetic (day boundaries, snapping, week starts) resolves
   * through it, so two users in different zones see identical day boundaries. */
  zone: string;
}

export class Project {
  readonly tasks: readonly Task[];
  readonly zone: string;

  constructor(options: ProjectOptions) {
    this.tasks = options.tasks;
    this.zone = options.zone;
  }
}
