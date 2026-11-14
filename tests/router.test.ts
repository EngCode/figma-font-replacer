import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/contracts';
import type { PluginResponse } from '../src/shared/messages';
import { FakeGateway, type FakeNodeSpec } from '../src/plugin/gateway/fakeGateway';
import { PluginRouter } from '../src/plugin/router';
import { mergeSettings, MAX_UI_WIDTH, MIN_UI_WIDTH } from '../src/plugin/services/settings';
import { AVAILABLE_FONTS, INTER_REGULAR, MISSING_SANS, POPPINS_BOLD, planEntry, testPlan } from './helpers';

const tree: FakeNodeSpec = {
  id: 'page',
  name: 'Page',
  type: 'PAGE',
  children: [{ id: 't1', name: 'Title', type: 'TEXT', text: { characters: 'Hello', fonts: [INTER_REGULAR] } }],
};

function setup(): { gateway: FakeGateway; router: PluginRouter } {
  const gateway = new FakeGateway({ tree, availableFonts: AVAILABLE_FONTS, selectionIds: ['t1'] });
  const router = new PluginRouter(gateway, () => undefined);
  return { gateway, router };
}

describe('mergeSettings', () => {
  it('clamps ui dimensions', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { uiWidth: 99999, uiHeight: 1 });
    expect(merged.uiWidth).toBe(MAX_UI_WIDTH);
    expect(merged.uiHeight).toBeGreaterThanOrEqual(320);
    expect(mergeSettings(DEFAULT_SETTINGS, { uiWidth: 10 }).uiWidth).toBe(MIN_UI_WIDTH);
  });

  it('ignores invalid values instead of throwing', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      scope: 'galaxy' as never,
      instancePolicy: 'destroy' as never,
      mappings: [{ fromKey: '' }] as never,
      uiWidth: Number.NaN,
    });
    expect(merged).toEqual(DEFAULT_SETTINGS);
  });

  it('accepts valid partial patches', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, {
      scope: 'file',
      instancePolicy: 'all',
      showMixed: false,
      mappings: [{ fromKey: 'inter::regular', to: POPPINS_BOLD }],
    });
    expect(merged.scope).toBe('file');
    expect(merged.instancePolicy).toBe('all');
    expect(merged.showMixed).toBe(false);
    expect(merged.mappings).toHaveLength(1);
  });
});

describe('PluginRouter', () => {
  it('answers ready with document info, fonts and default settings', async () => {
    const { router } = setup();
    const response = (await router.handle({ type: 'ready' })) as Extract<PluginResponse, { type: 'ready' }>;
    expect(response.type).toBe('ready');
    expect(response.info.textNodeCount).toBe(1);
    expect(response.fonts).toHaveLength(AVAILABLE_FONTS.length);
    expect(response.settings.scope).toBe(DEFAULT_SETTINGS.scope);
  });

  it('merges and persists settings', async () => {
    const { router, gateway } = setup();
    const response = (await router.handle({ type: 'setSettings', settings: { scope: 'page' } })) as Extract<
      PluginResponse,
      { type: 'settingsResult' }
    >;
    expect(response.settings.scope).toBe('page');
    expect(gateway.settings?.scope).toBe('page');

    const again = (await router.handle({ type: 'getSettings' })) as Extract<PluginResponse, { type: 'settingsResult' }>;
    expect(again.settings.scope).toBe('page');
  });

  it('resizes and clamps the UI while persisting the size', async () => {
    const { router, gateway } = setup();
    await router.handle({ type: 'resize', width: 5000, height: 400 });
    expect(gateway.resizes.at(-1)).toEqual({ width: MAX_UI_WIDTH, height: 400 });
    expect(gateway.settings?.uiWidth).toBe(MAX_UI_WIDTH);
  });

  it('selects and zooms a node', async () => {
    const { router, gateway } = setup();
    const response = await router.handle({ type: 'locate', nodeId: 't1' });
    expect(response.type).toBe('notify');
    expect(gateway.selectedIds).toEqual(['t1']);
  });

  it('builds a plan without writing to the document', async () => {
    const { router, gateway } = setup();
    const response = (await router.handle({
      type: 'plan',
      mode: 'pairwise',
      scope: 'page',
      mappings: [{ fromKey: 'inter::regular', to: POPPINS_BOLD }],
    })) as Extract<PluginResponse, { type: 'planResult' }>;
    expect(response.type).toBe('planResult');
    expect(response.plan.totals.replace).toBe(1);
    expect(gateway.writes).toHaveLength(0);
  });

  it('echoes a preview without any writes', async () => {
    const { router, gateway } = setup();
    const plan = testPlan([planEntry({ nodeId: 't1' })]);
    const response = (await router.handle({ type: 'preview', plan })) as Extract<
      PluginResponse,
      { type: 'previewResult' }
    >;
    expect(response.type).toBe('previewResult');
    expect(response.plan).toBe(plan);
    expect(gateway.writes).toHaveLength(0);
  });

  it('refuses to apply without confirmation', async () => {
    const { router } = setup();
    const response = (await router.handle({ type: 'apply', plan: testPlan([planEntry({ nodeId: 't1' })]), confirm: false })) as Extract<
      PluginResponse,
      { type: 'error' }
    >;
    expect(response.error.code).toBe('apply-failed');
  });

  it('applies a confirmed plan', async () => {
    const { router, gateway } = setup();
    const response = (await router.handle({
      type: 'apply',
      plan: testPlan([planEntry({ nodeId: 't1' })]),
      confirm: true,
    })) as Extract<PluginResponse, { type: 'applyResult' }>;
    expect(response.type).toBe('applyResult');
    expect(response.summary.changed).toBe(1);
    expect(gateway.writes).toHaveLength(1);
  });

  it('returns typed not-implemented errors for unfinished phases', async () => {
    const { router } = setup();
    const response = (await router.handle({
      type: 'exportAudit',
      format: 'csv',
      report: {
        scope: 'page',
        documentName: 'Doc',
        pageName: 'Page',
        mode: 'pairwise',
        mappings: [],
        totals: { total: 0, replace: 0, skip: 0 },
        entries: [],
        missingFontKeys: [],
        mixedNodeCount: 0,
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
    })) as Extract<PluginResponse, { type: 'error' }>;
    expect(response.type).toBe('error');
    expect(response.error.code).toBe('not-implemented');
    expect(response.requestType).toBe('exportAudit');
  });

  it('never throws: gateway failures become error envelopes', async () => {
    class BrokenGateway extends FakeGateway {
      override async getDocumentInfo(): Promise<never> {
        throw new Error('boom');
      }
    }
    const gateway = new BrokenGateway({ tree, availableFonts: [] });
    const router = new PluginRouter(gateway, () => undefined);
    const response = (await router.handle({ type: 'ready' })) as Extract<PluginResponse, { type: 'error' }>;
    expect(response.type).toBe('error');
    expect(response.error.code).toBe('internal');
    expect(response.error.message).toBe('boom');
  });

  it('scans the requested scope and returns a summary', async () => {
    const { router } = setup();
    const response = (await router.handle({ type: 'scan', scope: 'page' })) as Extract<
      PluginResponse,
      { type: 'scanResult' }
    >;
    expect(response.type).toBe('scanResult');
    expect(response.summary.scannedTextNodes).toBe(1);
    expect(response.summary.groups).toHaveLength(1);
  });

  it('reports that there is nothing to cancel when idle', async () => {
    const { router } = setup();
    const response = (await router.handle({ type: 'cancel' })) as Extract<PluginResponse, { type: 'notify' }>;
    expect(response.type).toBe('notify');
    expect(response.message).toContain('Nothing to cancel');
  });

  it('maps gateway error codes through the envelope', async () => {
    const { router } = setup();
    const response = (await router.handle({ type: 'locate', nodeId: 'missing' })) as Extract<
      PluginResponse,
      { type: 'notify' }
    >;
    expect(response.type).toBe('notify');
    expect(MISSING_SANS.family).toBe('Missing Sans');
  });
});
