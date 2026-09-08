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
    const cell: CellRenderer = () => undefined;
    expect(() => {
      registry.register('bar', bar, pluginA);
      registry.register('cell', cell, pluginB);
    }).not.toThrow();
  });

  it('register returns a Disposer that frees the point for the next claim (#155)', () => {
    const registry = new RendererRegistry();
    const first: CellRenderer = () => undefined;
    const second: CellRenderer = () => undefined;
    const free = registry.register('cell', first, pluginA);

    // While it stands, the point is taken — for the same plugin as much as for any other.
    expect(() => registry.register('cell', second, pluginB)).toThrow(RendererAlreadyRegisteredError);

    free();
    expect(registry.resolve('cell', undefined)).toBeUndefined();
    expect(() => registry.register('cell', second, pluginB)).not.toThrow();
    expect(registry.resolve('cell', undefined)).toEqual({ renderer: second, pluginId: pluginB });

    // Idempotent: a plugin's `DisposableStore` disposes the same Disposer the plugin may have
    // already called, and that must not free the point the next plugin now holds.
    free();
    expect(registry.resolve('cell', undefined)).toEqual({ renderer: second, pluginId: pluginB });
  });

  it('resolve: config over plugin at every unkeyed point, same as resolveBar (review P6)', () => {
    const registry = new RendererRegistry();
    const pluginCell: CellRenderer = () => undefined;
    const consumerCell: CellRenderer = () => undefined;
    registry.register('cell', pluginCell, pluginA);

    expect(registry.resolve('cell', consumerCell)).toEqual({ renderer: consumerCell });
    expect(registry.resolve('cell', undefined)).toEqual({ renderer: pluginCell, pluginId: pluginA });
    expect(registry.resolve('header', undefined)).toBeUndefined();
    expect(registry.resolve('tooltip', undefined)).toBeUndefined();
  });
});

describe('RendererRegistry — the bar point keys on the kind (review P2)', () => {
  const buffer: BarRenderer = () => ({ text: 'buffer' });
  const risk: BarRenderer = () => ({ text: 'risk' });

  it('two plugins that each define their own kind both register, and both resolve', () => {
    const registry = new RendererRegistry();
    registry.register('bar', { buffer }, pluginA);
    registry.register('bar', { risk }, pluginB);

    expect(registry.resolveBar('buffer', undefined)).toEqual({ renderer: buffer, pluginId: pluginA });
    expect(registry.resolveBar('risk', undefined)).toEqual({ renderer: risk, pluginId: pluginB });
    expect(registry.resolveBar('span', undefined)).toBeUndefined();
  });

  it('disposing one plugin leaves the other, in either disposal order', () => {
    const registry = new RendererRegistry();
    const freeBuffer = registry.register('bar', { buffer }, pluginA);
    const freeRisk = registry.register('bar', { risk }, pluginB);

    freeRisk();
    expect(registry.resolveBar('buffer', undefined)).toEqual({ renderer: buffer, pluginId: pluginA });
    expect(registry.resolveBar('risk', undefined)).toBeUndefined();

    freeBuffer();
    expect(registry.resolveBar('buffer', undefined)).toBeUndefined();
  });

  it('two plugins claiming the same kind still throw, naming the slot and both ids', () => {
    const registry = new RendererRegistry();
    registry.register('bar', { buffer }, pluginA);

    try {
      registry.register('bar', { buffer: risk }, pluginB);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(RendererAlreadyRegisteredError);
      const e = error as RendererAlreadyRegisteredError;
      expect(e.slot).toBe('bar:buffer');
      expect(e.firstPluginId).toBe(pluginA);
      expect(e.secondPluginId).toBe(pluginB);
    }
  });

  it('a refused map registers none of its kinds', () => {
    const registry = new RendererRegistry();
    registry.register('bar', { buffer }, pluginA);

    expect(() => registry.register('bar', { risk, buffer: risk }, pluginB)).toThrow(
      RendererAlreadyRegisteredError,
    );
    expect(registry.resolveBar('risk', undefined)).toBeUndefined();
  });

  it('the whole-point form stays exclusive against a per-kind claim, in both directions', () => {
    const whole: BarRenderer = () => ({ text: 'every kind' });

    const kindFirst = new RendererRegistry();
    kindFirst.register('bar', { buffer }, pluginA);
    expect(() => kindFirst.register('bar', whole, pluginB)).toThrow(RendererAlreadyRegisteredError);

    const wholeFirst = new RendererRegistry();
    wholeFirst.register('bar', whole, pluginA);
    expect(() => wholeFirst.register('bar', { buffer }, pluginB)).toThrow(RendererAlreadyRegisteredError);
    expect(wholeFirst.resolveBar('buffer', undefined)).toEqual({ renderer: whole, pluginId: pluginA });
  });

  it("a registered '*' answers every kind the exact slots miss (D-S5-12)", () => {
    const registry = new RendererRegistry();
    const fallback: BarRenderer = () => ({ text: 'fallback' });
    registry.register('bar', { buffer, '*': fallback }, pluginA);

    expect(registry.resolveBar('buffer', undefined)).toEqual({ renderer: buffer, pluginId: pluginA });
    expect(registry.resolveBar('span', undefined)).toEqual({ renderer: fallback, pluginId: pluginA });
  });

  it("a second plugin may claim a kind while the first holds '*'", () => {
    const registry = new RendererRegistry();
    const fallback: BarRenderer = () => ({ text: 'fallback' });
    registry.register('bar', { '*': fallback }, pluginA);
    registry.register('bar', { risk }, pluginB);

    expect(registry.resolveBar('risk', undefined)).toEqual({ renderer: risk, pluginId: pluginB });
    expect(registry.resolveBar('span', undefined)).toEqual({ renderer: fallback, pluginId: pluginA });
  });

  // #174: the per-kind disposer was a forward loop over one array, and a second call ran the whole
  // loop again. It survived only because each slot release latches on its own. The store now makes
  // the guarantee here, so a change to that release cannot quietly break re-installing a plugin.
  it('disposing a per-kind registration twice frees nothing a later plugin claimed', () => {
    const registry = new RendererRegistry();
    const disposeA = registry.register('bar', { buffer, risk }, pluginA);
    disposeA();

    const laterBuffer: BarRenderer = () => ({ text: 'later' });
    registry.register('bar', { buffer: laterBuffer }, pluginB);
    disposeA();

    expect(registry.resolveBar('buffer', undefined)).toEqual({
      renderer: laterBuffer,
      pluginId: pluginB,
    });
  });

  it('a consumer per-kind map still wins over every plugin kind slot (D-S5-11)', () => {
    const registry = new RendererRegistry();
    registry.register('bar', { buffer }, pluginA);
    const consumerBuffer: BarRenderer = () => ({ text: 'consumer' });

    expect(registry.resolveBar('buffer', { buffer: consumerBuffer })).toEqual({
      renderer: consumerBuffer,
    });
    // A consumer map that misses the kind falls to the library default, never to the plugin.
    expect(registry.resolveBar('buffer', { risk })).toBeUndefined();
  });
});
