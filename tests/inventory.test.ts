import { describe, expect, it } from 'vitest';
import type { ScanProgress } from '../src/shared/contracts';
import { makeFontKey } from '../src/shared/fontKey';
import { FakeGateway, type FakeNodeSpec } from '../src/plugin/gateway/fakeGateway';
import { scanFonts, toSnapshot } from '../src/plugin/services/inventory';
import { AVAILABLE_FONTS, INTER_REGULAR, MISSING_SANS, POPPINS_BOLD } from './helpers';

const tree: FakeNodeSpec = {
  id: 'page',
  name: 'Page',
  type: 'PAGE',
  children: [
    {
      id: 'frame',
      name: 'Frame',
      type: 'FRAME',
      children: [
        { id: 't1', name: 'Title', type: 'TEXT', text: { characters: 'Hello   world', fonts: [INTER_REGULAR], textStyleId: 'S:body' } },
        { id: 't2', name: 'Mixed', type: 'TEXT', text: { characters: 'abc', fonts: [INTER_REGULAR, POPPINS_BOLD] } },
        { id: 't3', name: 'Missing', type: 'TEXT', text: { characters: 'x', fonts: [MISSING_SANS] } },
        {
          id: 'inst',
          name: 'Card',
          type: 'INSTANCE',
          children: [{ id: 't4', name: 'Card text', type: 'TEXT', text: { characters: 'hi', fonts: [INTER_REGULAR] } }],
        },
      ],
    },
  ],
};

function gateway(selectionIds: string[] = []): FakeGateway {
  return new FakeGateway({
    tree,
    availableFonts: AVAILABLE_FONTS,
    selectionIds,
    documentName: 'Doc',
    pageName: 'Page 1',
  });
}

describe('toSnapshot', () => {
  it('normalises characters and flags missing fonts', () => {
    const available = new Set(AVAILABLE_FONTS.map(makeFontKey));
    const snapshot = toSnapshot(
      {
        id: 'x',
        name: 'X',
        characters: '  Hello\n\n world  ',
        fonts: [MISSING_SANS],
        textStyleId: null,
        isInstanceText: false,
        visible: true,
        locked: false,
      },
      'Page 1',
      available,
    );
    expect(snapshot.sample).toBe('Hello world');
    expect(snapshot.hasMissingFont).toBe(true);
    expect(snapshot.isMixed).toBe(false);
    expect(snapshot.characterCount).toBe(17);
  });
});

describe('scanFonts', () => {
  it('scans a selection and aggregates usage', async () => {
    const summary = await scanFonts(gateway(['frame']), { scope: 'selection' });
    expect(summary.scannedTextNodes).toBe(4);
    expect(summary.groups).toHaveLength(3);
    expect(summary.missingFontKeys).toEqual([makeFontKey(MISSING_SANS)]);
    expect(summary.mixedNodeCount).toBe(1);
    expect(summary.documentName).toBe('Doc');
    expect(summary.cancelled).toBe(false);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.nodes.find((node) => node.nodeId === 't4')?.isInstanceText).toBe(true);
  });

  it('returns an empty summary when nothing is selected', async () => {
    const summary = await scanFonts(gateway([]), { scope: 'selection' });
    expect(summary.scannedTextNodes).toBe(0);
    expect(summary.groups).toEqual([]);
    expect(summary.missingFontKeys).toEqual([]);
  });

  it('emits monotonic progress ending in done', async () => {
    const events: ScanProgress[] = [];
    await scanFonts(gateway(), {
      scope: 'page',
      chunkSize: 2,
      onProgress: (progress) => events.push(progress),
    });
    expect(events.at(0)?.phase).toBe('listing');
    expect(events.at(-1)).toEqual({ scanned: 4, total: 4, phase: 'done' });
    let previous = -1;
    for (const event of events) {
      expect(event.scanned).toBeGreaterThanOrEqual(previous);
      previous = event.scanned;
    }
  });

  it('stops early when cancelled and flags the partial result', async () => {
    const events: ScanProgress[] = [];
    const summary = await scanFonts(gateway(), {
      scope: 'page',
      chunkSize: 1,
      onProgress: (progress) => events.push(progress),
      shouldCancel: () => events.filter((event) => event.phase === 'reading').length >= 2,
    });
    expect(summary.cancelled).toBe(true);
    expect(summary.scannedTextNodes).toBeLessThan(4);
    expect(summary.groups.length).toBeGreaterThan(0);
  });

  it('uses an injected clock for duration', async () => {
    let clock = 100;
    const summary = await scanFonts(gateway(), { scope: 'page', now: () => (clock += 25) });
    expect(summary.durationMs).toBe(25);
  });

  it('ignores nodes that disappear mid-scan', async () => {
    const base = gateway();
    const flaky = Object.create(base) as FakeGateway;
    let calls = 0;
    Object.defineProperty(flaky, 'readNode', {
      value: async (id: string) => {
        calls += 1;
        return calls === 1 ? null : base.readNode(id);
      },
    });
    const summary = await scanFonts(flaky, { scope: 'page' });
    expect(summary.scannedTextNodes).toBe(4);
    expect(summary.groups.reduce((total, group) => total + group.count, 0)).toBeGreaterThan(0);
  });
});
