import { describe, expect, it } from 'vitest';
import { FakeGateway, type FakeNodeSpec } from '../src/plugin/gateway/fakeGateway';
import { GatewayError } from '../src/plugin/gateway/types';
import { AVAILABLE_FONTS, INTER_BOLD, INTER_REGULAR, MISSING_SANS, POPPINS_BOLD } from './helpers';

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
        { id: 't1', name: 'Title', type: 'TEXT', text: { characters: 'Hello', fonts: [INTER_REGULAR] } },
        {
          id: 'inst',
          name: 'Card',
          type: 'INSTANCE',
          children: [
            { id: 't2', name: 'Card title', type: 'TEXT', text: { characters: 'Hi', fonts: [INTER_BOLD] } },
          ],
        },
        { id: 'hidden', name: 'Hidden', type: 'TEXT', text: { characters: 'x', fonts: [MISSING_SANS], visible: false } },
        {
          id: 'mixed',
          name: 'Mixed',
          type: 'TEXT',
          text: { characters: 'abc', fonts: [INTER_REGULAR, POPPINS_BOLD] },
        },
        { id: 'locked', name: 'Locked', type: 'TEXT', text: { characters: 'lock', fonts: [INTER_REGULAR], locked: true } },
        { id: 'empty', name: 'Empty', type: 'TEXT', text: { characters: '', fonts: [] } },
      ],
    },
  ],
};

function createGateway(selectionIds: string[] = []): FakeGateway {
  return new FakeGateway({ tree, availableFonts: AVAILABLE_FONTS, selectionIds });
}

describe('FakeGateway traversal', () => {
  it('lists text nodes for the page scope', async () => {
    const gateway = createGateway();
    const refs = await gateway.listTextNodeIds('page');
    expect(refs.map((ref) => ref.id)).toEqual(['t1', 't2', 'hidden', 'mixed', 'locked', 'empty']);
  });

  it('walks nested subtrees for the selection scope', async () => {
    const gateway = createGateway(['frame']);
    const refs = await gateway.listTextNodeIds('selection');
    expect(refs).toHaveLength(6);
  });

  it('returns a single node when a text node is selected', async () => {
    const gateway = createGateway(['t1']);
    const refs = await gateway.listTextNodeIds('selection');
    expect(refs).toEqual([{ id: 't1', name: 'Title' }]);
  });

  it('detects instance text and mixed fonts', async () => {
    const gateway = createGateway();
    const instanceText = await gateway.readNode('t2');
    expect(instanceText?.isInstanceText).toBe(true);
    expect((await gateway.readNode('t1'))?.isInstanceText).toBe(false);

    const mixed = await gateway.readNode('mixed');
    expect(mixed?.fonts).toHaveLength(2);
  });

  it('handles empty and hidden nodes', async () => {
    const gateway = createGateway();
    const empty = await gateway.readNode('empty');
    expect(empty?.characters).toBe('');
    expect(empty?.fonts).toEqual([]);
    expect((await gateway.readNode('hidden'))?.visible).toBe(false);
  });

  it('returns null for unknown ids', async () => {
    const gateway = createGateway();
    expect(await gateway.readNode('nope')).toBeNull();
  });
});

describe('FakeGateway mutations', () => {
  it('records writes and updates the node', async () => {
    const gateway = createGateway();
    await gateway.setNodeFont('t1', POPPINS_BOLD);
    expect(gateway.writes).toEqual([{ kind: 'font', nodeId: 't1', font: POPPINS_BOLD }]);
    expect((await gateway.readNode('t1'))?.fonts).toEqual([POPPINS_BOLD]);
  });

  it('refuses to write to locked nodes', async () => {
    const gateway = createGateway();
    await expect(gateway.setNodeFont('locked', POPPINS_BOLD)).rejects.toBeInstanceOf(GatewayError);
    expect(gateway.writes).toHaveLength(0);
  });

  it('records range writes', async () => {
    const gateway = createGateway();
    await gateway.setNodeRangeFont('mixed', 0, 2, POPPINS_BOLD);
    expect(gateway.writes).toEqual([{ kind: 'range', nodeId: 'mixed', font: POPPINS_BOLD, start: 0, end: 2 }]);
  });

  it('fails to load unknown fonts and dedupes loads', async () => {
    const gateway = createGateway();
    await expect(gateway.loadFont(MISSING_SANS)).rejects.toMatchObject({ code: 'font-not-found' });
    await gateway.loadFont(INTER_REGULAR);
    await gateway.loadFont({ family: 'inter', style: 'regular' });
    expect(gateway.loadedFonts).toHaveLength(1);
  });
});

describe('FakeGateway document metadata', () => {
  it('reports document info', async () => {
    const gateway = createGateway(['frame', 't1']);
    const info = await gateway.getDocumentInfo();
    expect(info.selectionCount).toBe(2);
    expect(info.textNodeCount).toBe(6);
    expect(info.pageName).toBe('Page 1');
  });

  it('persists settings and records ui feedback', async () => {
    const gateway = createGateway();
    expect(await gateway.getSettings()).toBeNull();
    const settings = {
      scope: 'page' as const,
      mappings: [],
      uiWidth: 700,
      uiHeight: 500,
      showMixed: true,
      instancePolicy: 'skip' as const,
    };
    await gateway.saveSettings(settings);
    expect(await gateway.getSettings()).toEqual(settings);

    gateway.notify('Saved', { error: true });
    gateway.commitUndo('test');
    gateway.resizeUi(400, 300);
    expect(gateway.notifications).toEqual([{ message: 'Saved', error: true }]);
    expect(gateway.undoLabels).toEqual(['test']);
    expect(gateway.resizes).toEqual([{ width: 400, height: 300 }]);
  });
});
