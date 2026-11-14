import { describe, expect, it } from 'vitest';
import { aggregateUsage, countMixedNodes, findMissingFonts } from '../src/shared/aggregate';
import type { TextNodeSnapshot } from '../src/shared/contracts';
import { makeFontKey } from '../src/shared/fontKey';
import { INTER_BOLD, INTER_REGULAR, MISSING_SANS, POPPINS_BOLD } from './helpers';

function node(overrides: Partial<TextNodeSnapshot> = {}): TextNodeSnapshot {
  return {
    nodeId: 'n1',
    name: 'Node',
    pageName: 'Page 1',
    characterCount: 5,
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

const available = new Set([INTER_REGULAR, INTER_BOLD, POPPINS_BOLD].map(makeFontKey));

describe('aggregateUsage', () => {
  it('groups nodes by font and counts them', () => {
    const nodes = [
      node({ nodeId: 'a' }),
      node({ nodeId: 'b' }),
      node({ nodeId: 'c', fonts: [INTER_BOLD] }),
    ];
    const groups = aggregateUsage(nodes);
    expect(groups).toHaveLength(2);
    expect(groups.at(0)?.key).toBe(makeFontKey(INTER_REGULAR));
    expect(groups.at(0)?.count).toBe(2);
    expect(groups.at(0)?.nodeIds).toEqual(['a', 'b']);
    expect(groups.at(1)?.count).toBe(1);
  });

  it('counts a mixed node once per font', () => {
    const mixed = node({ nodeId: 'm', fonts: [INTER_REGULAR, POPPINS_BOLD], isMixed: true });
    const groups = aggregateUsage([mixed, node({ nodeId: 'n' })]);
    const inter = groups.find((group) => group.key === makeFontKey(INTER_REGULAR));
    expect(inter?.count).toBe(2);
    expect(inter?.mixedNodeIds).toEqual(['m']);
    expect(groups.find((group) => group.key === makeFontKey(POPPINS_BOLD))?.count).toBe(1);
  });

  it('dedupes repeated fonts inside one node', () => {
    const groups = aggregateUsage([node({ fonts: [INTER_REGULAR, { family: 'inter', style: 'regular' }] })]);
    expect(groups).toHaveLength(1);
    expect(groups.at(0)?.nodeIds).toEqual(['n1']);
  });

  it('tracks style links and instance text', () => {
    const groups = aggregateUsage([
      node({ nodeId: 'a', textStyleId: 'S:1' }),
      node({ nodeId: 'b', isInstanceText: true }),
    ]);
    expect(groups.at(0)?.styleLinkedNodeIds).toEqual(['a']);
    expect(groups.at(0)?.instanceNodeIds).toEqual(['b']);
  });

  it('marks missing fonts from the provided key set', () => {
    const missing = new Set([makeFontKey(MISSING_SANS)]);
    const groups = aggregateUsage([node({ fonts: [MISSING_SANS] })], missing);
    expect(groups.at(0)?.missing).toBe(true);
    expect(aggregateUsage([node({ fonts: [MISSING_SANS] })]).at(0)?.missing).toBe(false);
  });

  it('sorts by count then key and is order-independent', () => {
    const nodes = [node({ nodeId: 'a' }), node({ nodeId: 'b', fonts: [INTER_BOLD] })];
    expect(aggregateUsage(nodes).map((g) => g.key)).toEqual(aggregateUsage([...nodes].reverse()).map((g) => g.key));
  });

  it('returns an empty array for no nodes', () => {
    expect(aggregateUsage([])).toEqual([]);
  });
});

describe('findMissingFonts', () => {
  it('reports fonts absent from the available set, sorted and deduped', () => {
    const nodes = [node({ fonts: [MISSING_SANS] }), node({ fonts: [MISSING_SANS, INTER_REGULAR] })];
    expect(findMissingFonts(nodes, available)).toEqual([makeFontKey(MISSING_SANS)]);
  });

  it('reports nothing when every font is available', () => {
    expect(findMissingFonts([node()], available)).toEqual([]);
  });
});

describe('countMixedNodes', () => {
  it('counts only mixed nodes', () => {
    expect(countMixedNodes([node(), node({ isMixed: true }), node({ isMixed: true })])).toBe(2);
  });
});
