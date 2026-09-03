import { describe, expect, it } from 'vitest';
import { RendererRegistry } from './renderer-registry.js';
import { RendererAlreadyRegisteredError } from '../model/index.js';
import type { PluginId } from '../model/index.js';
import type { BarRenderer, CellRenderer } from '../layout/index.js';

const pluginA = 'plugin-a' as PluginId;
const pluginB = 'plugin-b' as PluginId;

describe('RendererRegistry (S5.4, D-S5-11/12)', () => {
  it('resolveBar: the consumer config wins over a registered plugin renderer', () => {
    const registry = new RendererRegistry();
    const pluginRenderer: BarRenderer = () => ({ text: 'plugin' });
    const consumerRenderer: BarRenderer = () => ({ text: 'consumer' });
    registry.register('bar', pluginRenderer, pluginA);

    expect(registry.resolveBar('span', consumerRenderer)).toEqual({ renderer: consumerRenderer });
  });

  it('resolveBar: falls back to the plugin renderer when the consumer supplied none, naming the plugin id', () => {
    const registry = new RendererRegistry();
    const pluginRenderer: BarRenderer = () => ({ text: 'plugin' });
    registry.register('bar', pluginRenderer, pluginA);

    expect(registry.resolveBar('span', undefined)).toEqual({ renderer: pluginRenderer, pluginId: pluginA });
  });

  it('resolveBar: undefined on both sides resolves to undefined — the caller keeps its own default', () => {
    const registry = new RendererRegistry();
    expect(registry.resolveBar('span', undefined)).toBeUndefined();
  });

  it('resolveBar: a per-kind map resolves the exact kind, then "*", then nothing (D-S5-12)', () => {
    const registry = new RendererRegistry();
    const milestone: BarRenderer = () => ({ text: 'milestone' });
    const fallback: BarRenderer = () => ({ text: 'fallback' });
    const map = { milestone, '*': fallback };

    expect(registry.resolveBar('milestone', map)).toEqual({ renderer: milestone });
    expect(registry.resolveBar('span', map)).toEqual({ renderer: fallback });
    expect(registry.resolveBar('span', { milestone })).toBeUndefined();
  });

  it('resolveBar: a consumer per-kind map miss falls to the default, never to a plugin (D-S5-11)', () => {
    const registry = new RendererRegistry();
    const pluginRenderer: BarRenderer = () => ({ text: 'plugin' });
    registry.register('bar', pluginRenderer, pluginA);
    const milestone: BarRenderer = () => ({ text: 'milestone' });

    expect(registry.resolveBar('span', { milestone })).toBeUndefined();
  });

  it('register: a second plugin claiming the same point throws, naming both plugin ids', () => {
    const registry = new RendererRegistry();
    const first: BarRenderer = () => undefined;
    const second: BarRenderer = () => undefined;
    registry.register('bar', first, pluginA);

    expect(() => registry.register('bar', second, pluginB)).toThrow(RendererAlreadyRegisteredError);
    try {
      registry.register('bar', second, pluginB);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RendererAlreadyRegisteredError);
      const e = error as RendererAlreadyRegisteredError;
      expect(e.point).toBe('bar');
      expect(e.firstPluginId).toBe(pluginA);
      expect(e.secondPluginId).toBe(pluginB);
    }
  });

  it('register: two different points do not collide', () => {
    const registry = new RendererRegistry();
    const bar: BarRenderer = () => undefined;
    const cell: CellRenderer = () => undefined;
    expect(() => {
      registry.register('bar', bar, pluginA);
      registry.register('cell', cell, pluginB);
    }).not.toThrow();
  });

  it('resolveCell/resolveHeader/resolveTooltip: config over plugin, same as resolveBar', () => {
    const registry = new RendererRegistry();
    const pluginCell: CellRenderer = () => undefined;
    const consumerCell: CellRenderer = () => undefined;
    registry.register('cell', pluginCell, pluginA);

    expect(registry.resolveCell(consumerCell)).toEqual({ renderer: consumerCell });
    expect(registry.resolveCell(undefined)).toEqual({ renderer: pluginCell, pluginId: pluginA });
    expect(registry.resolveHeader(undefined)).toBeUndefined();
    expect(registry.resolveTooltip(undefined)).toBeUndefined();
  });
});
