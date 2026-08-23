import { describe, expect, it } from 'vitest';
import { Gantt } from './gantt.js';
import { Project } from './project.js';
import { TimeScaleModel } from './index.js';
import { sampleTasks } from '../../fixtures/sample-project.js';

describe('Gantt', () => {
  it('mounts fixture tasks as bars in the host element', () => {
    const host = document.createElement('div');
    const gantt = new Gantt({ host, project: new Project({ tasks: sampleTasks, zone: 'UTC' }) });
    const bars = host.querySelectorAll('.fg-bar');
    expect(bars.length).toBe(sampleTasks.length);
    gantt.destroy();
  });

  it('two charts on one page have fully independent state (I2)', () => {
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    const ganttA = new Gantt({
      host: hostA,
      project: new Project({ tasks: sampleTasks.slice(0, 5), zone: 'UTC' }),
    });
    const ganttB = new Gantt({
      host: hostB,
      project: new Project({ tasks: sampleTasks.slice(0, 2), zone: 'UTC' }),
    });

    expect(hostA.querySelectorAll('.fg-bar').length).toBe(5);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttA.destroy();
    expect(hostA.children.length).toBe(0);
    expect(hostB.querySelectorAll('.fg-bar').length).toBe(2);

    ganttB.destroy();
  });

  it('two charts sharing one TimeScaleModel compute identical bar positions (D9 seam)', () => {
    const scale = new TimeScaleModel({
      range: { start: sampleTasks[0]!.start, end: sampleTasks[0]!.end },
    });
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    const ganttA = new Gantt({
      host: hostA,
      project: new Project({ tasks: sampleTasks.slice(0, 3), zone: 'UTC' }),
      scale,
    });
    const ganttB = new Gantt({
      host: hostB,
      project: new Project({ tasks: sampleTasks.slice(0, 3), zone: 'UTC' }),
      scale,
    });

    const xOf = (host: HTMLElement): string[] =>
      Array.from(host.querySelectorAll<HTMLElement>('.fg-bar')).map((el) => el.style.transform);

    expect(xOf(hostA)).toEqual(xOf(hostB));

    ganttA.destroy();
    ganttB.destroy();
  });
});
