import { describe, expect, it } from 'vitest';
import { Gantt } from './gantt.js';
import { Project } from './project.js';
import { sampleTasks } from '../../fixtures/sample-project.js';

describe('Gantt', () => {
  it('mounts fixture tasks as bars in the host element', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({ host, project: new Project({ tasks: sampleTasks }) });
    const bars = host.querySelectorAll('.fg-bar');
    expect(bars.length).toBe(sampleTasks.length);
    gantt.destroy();
  });

  it('two charts on one page have fully independent state (I2)', () => {
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    const ganttA = new Gantt({ host: hostA, project: new Project({ tasks: sampleTasks.slice(0, 5) }) });
    const ganttB = new Gantt({ host: hostB, project: new Project({ tasks: sampleTasks.slice(0, 2) }) });

    expect(hostA.querySelectorAll('.fg-bar').length).toBe(5);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttA.destroy();
    expect(hostA.children.length).toBe(0);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttB.destroy();
  });
});
