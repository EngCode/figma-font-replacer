import { describe, expect, it } from 'vitest';
import type { FontRef, ReplacementPlan } from '../src/shared/contracts';
import { makeFontKey } from '../src/shared/fontKey';
import { FakeGateway, type FakeNodeSpec } from '../src/plugin/gateway/fakeGateway';
import { applyPlan } from '../src/plugin/services/apply';
import { AVAILABLE_FONTS, INTER_REGULAR, MISSING_SANS, POPPINS_BOLD, planEntry, testPlan } from './helpers';

const tree: FakeNodeSpec = {
  id: 'page',
  name: 'Page',
  type: 'PAGE',
  children: [
    { id: 'a', name: 'A', type: 'TEXT', text: { characters: 'Hello', fonts: [INTER_REGULAR] } },
    { id: 'b', name: 'B', type: 'TEXT', text: { characters: 'World', fonts: [INTER_REGULAR] } },
    { id: 'locked', name: 'Locked', type: 'TEXT', text: { characters: 'Lock', fonts: [INTER_REGULAR], locked: true } },
  ],
};

function gateway(): FakeGateway {
  return new FakeGateway({ tree, availableFonts: AVAILABLE_FONTS });
}

const noop = (): void => undefined;

describe('applyPlan', () => {
  it('loads every target font before the first write', async () => {
    const events: string[] = [];
    const base = gateway();
    const spy = new Proxy(base, {
      get(target, property, receiver) {
        if (property === 'loadFont') {
          return async (font: FontRef) => {
            events.push(`load:${makeFontKey(font)}`);
            return base.loadFont(font);
          };
        }
        if (property === 'setNodeFont') {
          return async (nodeId: string, font: FontRef) => {
            events.push(`write:${nodeId}`);
            return base.setNodeFont(nodeId, font);
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    }) as FakeGateway;

    const plan = testPlan([planEntry({ nodeId: 'a', ranges: [{ start: 0, end: 5 }] }), planEntry({ nodeId: 'b' })]);
    await applyPlan(spy, plan);

    const firstWrite = events.findIndex((event) => event.startsWith('write:'));
    expect(firstWrite).toBeGreaterThan(-1);
    expect(events.slice(0, firstWrite).every((event) => event.startsWith('load:'))).toBe(true);
    expect(events.filter((event) => event.startsWith('load:'))).toHaveLength(1);
  });

  it('applies a whole-node plan and records one undo step', async () => {
    const gw = gateway();
    const summary = await applyPlan(gw, testPlan([planEntry({ nodeId: 'a' })]));
    expect(summary).toMatchObject({ total: 1, changed: 1, skipped: 0, failed: 0 });
    expect((await gw.readNode('a'))?.fonts).toEqual([POPPINS_BOLD]);
    expect(gw.undoLabels).toEqual(['Font Swap: 1 node']);
    expect(gw.notifications.at(-1)?.message).toContain('1 node updated');
  });

  it('uses range writes for non-whole-node entries', async () => {
    const gw = gateway();
    const entry = planEntry({ nodeId: 'a', wholeNode: false, ranges: [{ start: 0, end: 2 }] });
    await applyPlan(gw, testPlan([entry]));
    expect(gw.writes).toEqual([{ kind: 'range', nodeId: 'a', font: POPPINS_BOLD, start: 0, end: 2 }]);
  });

  it('reports locked nodes without aborting the run', async () => {
    const gw = gateway();
    const plan: ReplacementPlan = testPlan([
      planEntry({ nodeId: 'a' }),
      planEntry({ nodeId: 'locked' }),
      planEntry({ nodeId: 'b' }),
    ]);
    const summary = await applyPlan(gw, plan);
    expect(summary).toMatchObject({ changed: 2, failed: 1, skipped: 0 });
    expect(summary.errors.at(0)).toMatchObject({ nodeId: 'locked', code: 'node-locked' });
    expect((await gw.readNode('b'))?.fonts).toEqual([POPPINS_BOLD]);
    expect(gw.notifications.at(-1)?.error).toBe(true);
  });

  it('fails only the nodes whose target font cannot load', async () => {
    const gw = gateway();
    const plan: ReplacementPlan = testPlan([
      planEntry({ nodeId: 'a', to: MISSING_SANS }),
      planEntry({ nodeId: 'b', to: POPPINS_BOLD }),
    ]);
    const summary = await applyPlan(gw, plan);
    expect(summary).toMatchObject({ changed: 1, failed: 1 });
    expect(summary.errors.at(0)).toMatchObject({ code: 'font-load-failed' });
    expect((await gw.readNode('a'))?.fonts).toEqual([INTER_REGULAR]);
  });

  it('counts skipped entries without writing', async () => {
    const gw = gateway();
    const plan = testPlan([planEntry({ nodeId: 'a', action: 'skip', reason: 'mixed-fonts', to: null })]);
    const summary = await applyPlan(gw, plan);
    expect(summary).toMatchObject({ total: 1, changed: 0, skipped: 1, failed: 0 });
    expect(gw.writes).toHaveLength(0);
    expect(gw.undoLabels).toHaveLength(0);
  });

  it('reconciles changed + skipped + failed with total', async () => {
    const gw = gateway();
    const plan = testPlan([
      planEntry({ nodeId: 'a' }),
      planEntry({ nodeId: 'locked' }),
      planEntry({ nodeId: 'b', action: 'skip', reason: 'no-mapping', to: null }),
    ]);
    const summary = await applyPlan(gw, plan);
    expect(summary.changed + summary.skipped + summary.failed).toBe(summary.total);
  });

  it('reports progress for every entry', async () => {
    const gw = gateway();
    const ticks: Array<[number, number]> = [];
    await applyPlan(gw, testPlan([planEntry({ nodeId: 'a' }), planEntry({ nodeId: 'b' })]), {
      onProgress: (done, total) => ticks.push([done, total]),
    });
    expect(ticks).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('uses an injected clock for duration', async () => {
    let clock = 0;
    const summary = await applyPlan(gateway(), testPlan([planEntry({ nodeId: 'a' })]), { now: () => (clock += 30) });
    expect(summary.durationMs).toBe(30);
  });

  it('does not notify or commit undo when nothing changed', async () => {
    const gw = gateway();
    await applyPlan(gw, testPlan([planEntry({ nodeId: 'a', action: 'skip', reason: 'excluded' })]));
    expect(gw.notifications).toHaveLength(0);
    expect(gw.undoLabels).toHaveLength(0);
  });

  it('records an internal error for unexpected gateway failures', async () => {
    const gw = gateway();
    const failing = new Proxy(gw, {
      get(target, property, receiver) {
        if (property === 'setNodeFont') return async () => Promise.reject(new Error('boom'));
        return Reflect.get(target, property, receiver) as unknown;
      },
    }) as FakeGateway;
    const summary = await applyPlan(failing, testPlan([planEntry({ nodeId: 'a' })]));
    expect(summary.failed).toBe(1);
    expect(summary.errors.at(0)?.code).toBe('apply-failed');
  });
});

void noop;
