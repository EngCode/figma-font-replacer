import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/contracts';
import {
  isApplySummary,
  isReplacementPlan,
  isScanSummary,
  parsePluginResponse,
  parseUiRequest,
  readFontList,
} from '../src/shared/messages';
import { makeFontKey } from '../src/shared/fontKey';
import { AVAILABLE_FONTS, INTER_REGULAR, POPPINS_BOLD, planEntry, testPlan } from './helpers';

describe('parseUiRequest', () => {
  it('accepts stateless requests', () => {
    for (const type of ['ready', 'cancel', 'getSettings', 'listStyles'] as const) {
      const parsed = parseUiRequest({ type });
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.data.type).toBe(type);
    }
  });

  it('accepts scan with a valid scope and rejects invalid ones', () => {
    const okResult = parseUiRequest({ type: 'scan', scope: 'page' });
    expect(okResult.ok).toBe(true);
    const bad = parseUiRequest({ type: 'scan', scope: 'everything' });
    expect(bad.ok).toBe(false);
  });

  it('requires a complete plan for apply', () => {
    const parsed = parseUiRequest({ type: 'apply', plan: testPlan(), confirm: true });
    expect(parsed.ok).toBe(true);

    const missingConfirm = parseUiRequest({ type: 'apply', plan: testPlan() });
    expect(missingConfirm.ok).toBe(false);
    if (!missingConfirm.ok) expect(missingConfirm.error.code).toBe('invalid-payload');

    const brokenTotals = testPlan();
    brokenTotals.totals.total = 99;
    const badPlan = parseUiRequest({ type: 'apply', plan: brokenTotals, confirm: true });
    expect(badPlan.ok).toBe(false);
  });

  it('rejects a plan entry with inverted ranges', () => {
    const plan = testPlan([planEntry({ ranges: [{ start: 5, end: 2 }] })]);
    expect(parseUiRequest({ type: 'preview', plan }).ok).toBe(false);
  });

  it('validates plan requests', () => {
    const parsed = parseUiRequest({
      type: 'plan',
      mode: 'consolidate',
      scope: 'selection',
      mappings: [{ fromKey: makeFontKey(INTER_REGULAR), to: POPPINS_BOLD }],
    });
    expect(parsed.ok).toBe(true);

    expect(parseUiRequest({ type: 'plan', mode: 'nope', scope: 'page', mappings: [] }).ok).toBe(false);
    expect(parseUiRequest({ type: 'plan', mode: 'pairwise', scope: 'page', mappings: [{ fromKey: '' }] }).ok).toBe(
      false,
    );
  });

  it('rejects unknown types and non-objects', () => {
    expect(parseUiRequest(null).ok).toBe(false);
    expect(parseUiRequest('ready').ok).toBe(false);
    const unknown = parseUiRequest({ type: 'explode' });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe('unknown-request');
  });

  it('validates resize and locate payloads', () => {
    expect(parseUiRequest({ type: 'resize', width: 700, height: 500 }).ok).toBe(true);
    expect(parseUiRequest({ type: 'resize', width: '700', height: 500 }).ok).toBe(false);
    expect(parseUiRequest({ type: 'locate', nodeId: '1:2' }).ok).toBe(true);
    expect(parseUiRequest({ type: 'locate', nodeId: '' }).ok).toBe(false);
  });
});

describe('parsePluginResponse', () => {
  const summary = {
    scope: 'page' as const,
    documentName: 'Doc',
    pageName: 'Page',
    selectionCount: 2,
    scannedTextNodes: 5,
    availableFonts: AVAILABLE_FONTS,
    groups: [],
    nodes: [],
    missingFontKeys: [],
    mixedNodeCount: 0,
    cancelled: false,
    durationMs: 12,
  };

  it('accepts a ready response', () => {
    const parsed = parsePluginResponse({
      type: 'ready',
      info: { documentName: 'Doc', pageName: 'Page', pageId: '1:1', selectionCount: 1, textNodeCount: 4 },
      fonts: AVAILABLE_FONTS,
      styles: [],
      settings: DEFAULT_SETTINGS,
    });
    expect(parsed.ok).toBe(true);
  });

  it('rejects a ready response with bad settings', () => {
    const parsed = parsePluginResponse({
      type: 'ready',
      info: { documentName: 'Doc', pageName: 'Page', pageId: '1:1', selectionCount: 1, textNodeCount: 4 },
      fonts: AVAILABLE_FONTS,
      styles: [],
      settings: { scope: 'galaxy' },
    });
    expect(parsed.ok).toBe(false);
  });

  it('accepts scan and plan results', () => {
    expect(parsePluginResponse({ type: 'scanResult', summary }).ok).toBe(true);
    expect(parsePluginResponse({ type: 'planResult', plan: testPlan() }).ok).toBe(true);
  });

  it('rejects malformed scan results', () => {
    expect(parsePluginResponse({ type: 'scanResult', summary: { ...summary, groups: 'nope' } }).ok).toBe(false);
    expect(parsePluginResponse({ type: 'scanResult', summary: { ...summary, scope: 'nope' } }).ok).toBe(false);
  });

  it('accepts apply results only when counts are numeric', () => {
    const good = {
      type: 'applyResult',
      summary: { total: 1, changed: 1, skipped: 0, failed: 0, durationMs: 5, entries: [planEntry()], errors: [] },
    };
    expect(parsePluginResponse(good).ok).toBe(true);
    expect(parsePluginResponse({ type: 'applyResult', summary: { ...good.summary, changed: 'one' } }).ok).toBe(false);
  });

  it('round-trips error envelopes', () => {
    const parsed = parsePluginResponse({ type: 'error', error: { code: 'internal', message: 'boom' }, requestType: 'scan' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.data.type === 'error') expect(parsed.data.error.code).toBe('internal');
  });
});

describe('guards', () => {
  it('validates summaries and plans defensively', () => {
    expect(isScanSummary({})).toBe(false);
    expect(isReplacementPlan({ mode: 'pairwise' })).toBe(false);
    expect(isApplySummary({ total: 0 })).toBe(false);
  });

  it('rejects font lists with junk', () => {
    expect(readFontList([{ family: 'Inter' }])).toBeNull();
    expect(readFontList([{ family: ' ', style: 'Regular' }])).toBeNull();
  });
});
