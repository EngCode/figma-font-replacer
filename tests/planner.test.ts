import { describe, expect, it } from 'vitest';
import type { TextNodeSnapshot } from '../src/shared/contracts';
import { makeFontKey } from '../src/shared/fontKey';
import { buildPlan, consolidateMappings, describeSkipReason, planEntriesByAction } from '../src/shared/planner';
import { AVAILABLE_FONTS, INTER_REGULAR, MISSING_SANS, POPPINS_BOLD } from './helpers';

function node(overrides: Partial<TextNodeSnapshot> = {}): TextNodeSnapshot {
  return {
    nodeId: 'n1',
    name: 'Node',
    pageName: 'Page 1',
    characterCount: 7,
    fonts: [INTER_REGULAR],
    isMixed: false,
    hasMissingFont: false,
    textStyleId: null,
    isInstanceText: false,
    isHidden: false,
    isLocked: false,
    sample: 'Hello',
    ...overrides,
  };
}

const interKey = makeFontKey(INTER_REGULAR);
const mapping = [{ fromKey: interKey, to: POPPINS_BOLD }];

function plan(nodes: TextNodeSnapshot[], overrides: Partial<Parameters<typeof buildPlan>[0]> = {}) {
  return buildPlan({
    mode: 'pairwise',
    scope: 'selection',
    nodes,
    mappings: mapping,
    availableFonts: AVAILABLE_FONTS,
    ...overrides,
  });
}

describe('buildPlan', () => {
  it('plans a whole-node replacement for a single-font node', () => {
    const result = plan([node()]);
    expect(result.totals).toEqual({ total: 1, replace: 1, skip: 0 });
    expect(result.entries.at(0)).toMatchObject({
      nodeId: 'n1',
      action: 'replace',
      to: POPPINS_BOLD,
      wholeNode: true,
      ranges: [{ start: 0, end: 7 }],
    });
  });

  it('skips mixed nodes until P6', () => {
    const result = plan([node({ isMixed: true, fonts: [INTER_REGULAR, POPPINS_BOLD] })]);
    expect(result.entries.at(0)).toMatchObject({ action: 'skip', reason: 'mixed-fonts' });
    expect(result.totals.replace).toBe(0);
  });

  it('skips empty text nodes', () => {
    expect(plan([node({ characterCount: 0 })]).entries.at(0)?.reason).toBe('empty-text');
  });

  it('skips nodes without a mapping', () => {
    const result = plan([node({ fonts: [{ family: 'Roboto', style: 'Regular' }] })]);
    expect(result.entries.at(0)?.reason).toBe('no-mapping');
  });

  it('skips nodes already using the target font', () => {
    const result = plan([node({ fonts: [POPPINS_BOLD] })], {
      mappings: [{ fromKey: makeFontKey(POPPINS_BOLD), to: POPPINS_BOLD }],
    });
    expect(result.entries.at(0)?.reason).toBe('already-target');
  });

  it('skips when the target font is not available', () => {
    const result = plan([node()], { mappings: [{ fromKey: interKey, to: MISSING_SANS }] });
    expect(result.entries.at(0)).toMatchObject({ action: 'skip', reason: 'missing-target-font' });
  });

  it('respects user exclusions', () => {
    const result = plan([node()], { excludedNodeIds: ['n1'] });
    expect(result.entries.at(0)?.reason).toBe('excluded');
  });

  it('skips instance text by default and includes it with another policy', () => {
    const instanceNode = node({ isInstanceText: true });
    expect(plan([instanceNode]).entries.at(0)?.reason).toBe('instance-main');
    expect(plan([instanceNode], { instancePolicy: 'overrides-only' }).entries.at(0)?.action).toBe('replace');
    expect(plan([instanceNode], { instancePolicy: 'all' }).entries.at(0)?.action).toBe('replace');
  });

  it('is deterministic regardless of input order', () => {
    const nodes = [node({ nodeId: 'b' }), node({ nodeId: 'a' })];
    const forward = plan(nodes);
    const backward = plan([...nodes].reverse());
    expect(forward.entries.map((entry) => entry.nodeId)).toEqual(['a', 'b']);
    expect(backward.entries.map((entry) => entry.nodeId)).toEqual(['a', 'b']);
  });

  it('dedupes and sorts mappings', () => {
    const result = plan([node()], {
      mappings: [
        { fromKey: interKey, to: INTER_REGULAR },
        { fromKey: interKey, to: POPPINS_BOLD },
        { fromKey: makeFontKey(MISSING_SANS), to: POPPINS_BOLD },
      ],
    });
    expect(result.mappings).toHaveLength(2);
    expect(result.mappings.at(0)?.to).toEqual(INTER_REGULAR);
    expect(result.mappings.at(0)?.fromKey).toBe(interKey);
  });

  it('reconciles totals with entries', () => {
    const result = plan([
      node({ nodeId: 'a' }),
      node({ nodeId: 'b', isMixed: true }),
      node({ nodeId: 'c', characterCount: 0 }),
    ]);
    expect(result.totals.total).toBe(result.entries.length);
    expect(result.totals.replace + result.totals.skip).toBe(result.totals.total);
    expect(planEntriesByAction(result).skip.map((entry) => entry.nodeId)).toEqual(['b', 'c']);
  });

  it('uses an injected clock for generatedAt', () => {
    expect(plan([node()], { now: () => 42 }).generatedAt).toBe(42);
  });
});

describe('consolidateMappings', () => {
  it('maps every source to one target', () => {
    const mappings = consolidateMappings([interKey, makeFontKey(MISSING_SANS)], POPPINS_BOLD);
    expect(mappings).toHaveLength(2);
    expect(mappings.every((entry) => entry.to === POPPINS_BOLD)).toBe(true);
  });
});

describe('describeSkipReason', () => {
  it('explains every reason', () => {
    expect(describeSkipReason('mixed-fonts')).toContain('P6');
    expect(describeSkipReason(undefined)).toBe('Skipped');
    expect(describeSkipReason('instance-main')).toContain('component');
  });
});
