import { describe, expect, it } from 'vitest';
import { RendererRegistry } from './renderer-registry.js';
import { RendererAlreadyRegisteredError } from '../model/index.js';
import type { PluginId } from '../model/index.js';
import type { BarRenderer, GridCellRenderer } from '../layout/index.js';

const pluginA = 'plugin-a' as PluginId;
const pluginB = 'plugin-b' as PluginId;

describe('RendererRegistry (S5.4, D-S5-11; ADR 0018 retired the per-variant bar slot)', () => {
  it('bar: the consumer config wins over a registered plugin renderer', () => {
    const registry = new RendererRegistry();
    const pluginRenderer: BarRenderer = () => ({ text: 'plugin' });
    const consumerRenderer: BarRenderer = () => ({ text: 'consumer' });
    registry.register('bar', pluginRenderer, pluginA);

    expect(registry.resolve('bar', consumerRenderer)).toEqual({ renderer: consumerRenderer });
  });

  it('bar: falls back to the plugin renderer when the consumer supplied none, naming the plugin id', () => {
    const registry = new RendererRegistry();
    const pluginRenderer: BarRenderer = () => ({ text: 'plugin' });
    registry.register('bar', pluginRenderer, pluginA);

    expect(registry.resolve('bar', undefined)).toEqual({ renderer: pluginRenderer, pluginId: pluginA });
  });

  it('bar: undefined on both sides resolves to undefined — the caller keeps its own default', () => {
    const registry = new RendererRegistry();
    expect(registry.resolve('bar', undefined)).toBeUndefined();
  });

  it('register: a second plugin claiming the whole bar point throws, naming both plugin ids', () => {
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
      expect(e.slot).toBe('bar');
      expect(e.firstPluginId).toBe(pluginA);
      expect(e.secondPluginId).toBe(pluginB);
    }
  });

  it('register: two different points do not collide', () => {
    const registry = new RendererRegistry();
    const bar: BarRenderer = () => undefined;
    const cell: GridCellRenderer = () => undefined;
    expect(() => {
      registry.register('bar', bar, pluginA);
      registry.register('gridCell', cell, pluginB);
    }).not.toThrow();
  });

  it('register returns a Disposer that frees the point for the next claim (#155)', () => {
    const registry = new RendererRegistry();
    const first: GridCellRenderer = () => undefined;
    const second: GridCellRenderer = () => undefined;
    const free = registry.register('gridCell', first, pluginA);

    // While it stands, the point is taken — for the same plugin as much as for any other.
    expect(() => registry.register('gridCell', second, pluginB)).toThrow(RendererAlreadyRegisteredError);

    free();
    expect(registry.resolve('gridCell', undefined)).toBeUndefined();
    expect(() => registry.register('gridCell', second, pluginB)).not.toThrow();
    expect(registry.resolve('gridCell', undefined)).toEqual({ renderer: second, pluginId: pluginB });

    // Idempotent: a plugin's `DisposableStore` disposes the same Disposer the plugin may have
    // already called, and that must not free the point the next plugin now holds.
    free();
    expect(registry.resolve('gridCell', undefined)).toEqual({ renderer: second, pluginId: pluginB });
  });

  it('resolve: config over plugin at every point alike, bar included (review P6)', () => {
    const registry = new RendererRegistry();
    const pluginCell: GridCellRenderer = () => undefined;
    const consumerCell: GridCellRenderer = () => undefined;
    registry.register('gridCell', pluginCell, pluginA);

    expect(registry.resolve('gridCell', consumerCell)).toEqual({ renderer: consumerCell });
    expect(registry.resolve('gridCell', undefined)).toEqual({ renderer: pluginCell, pluginId: pluginA });
    expect(registry.resolve('header', undefined)).toBeUndefined();
    expect(registry.resolve('tooltip', undefined)).toBeUndefined();
  });
});
