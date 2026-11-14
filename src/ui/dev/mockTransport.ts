import type { PluginResponse, UiRequest } from '../../shared/messages';
import type { TextStyleInfo } from '../../shared/contracts';
import { DEFAULT_SETTINGS } from '../../shared/contracts';
import { FakeGateway, type FakeNodeSpec } from '../../plugin/gateway/fakeGateway';
import { PluginRouter } from '../../plugin/router';
import type { UiTransport } from '../transport';

export const FIXTURE_FONTS = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Inter', style: 'Medium' },
  { family: 'Inter', style: 'Semi Bold' },
  { family: 'Roboto Mono', style: 'Regular' },
  { family: 'Source Serif Pro', style: 'Regular' },
  { family: 'Source Serif Pro', style: 'Italic' },
  { family: 'Poppins', style: 'Bold' },
];

const TREE: FakeNodeSpec = {
  id: 'page:1',
  name: 'Marketing site',
  type: 'PAGE',
  children: [
    {
      id: 'frame:hero',
      name: 'Hero',
      type: 'FRAME',
      children: [
        { id: 'text:hero-title', name: 'Hero title', type: 'TEXT', text: { characters: 'Design faster, together', fonts: [{ family: 'Inter', style: 'Medium' }] } },
        {
          id: 'text:hero-body',
          name: 'Hero body',
          type: 'TEXT',
          text: {
            characters: 'A mixed node with two fonts',
            fonts: [
              { family: 'Inter', style: 'Regular' },
              { family: 'Source Serif Pro', style: 'Italic' },
            ],
          },
        },
        { id: 'text:hero-cta', name: 'CTA label', type: 'TEXT', text: { characters: 'Get started', fonts: [{ family: 'Poppins', style: 'Bold' }], locked: true } },
      ],
    },
    {
      id: 'instance:card',
      name: 'Card / default',
      type: 'INSTANCE',
      children: [
        { id: 'text:card-title', name: 'Card title', type: 'TEXT', text: { characters: 'Instance override text', fonts: [{ family: 'Inter', style: 'Semi Bold' }] } },
      ],
    },
    {
      id: 'frame:footer',
      name: 'Footer',
      type: 'GROUP',
      children: [
        {
          id: 'text:footer-legal',
          name: 'Legal copy',
          type: 'TEXT',
          text: {
            characters: 'Terms and privacy',
            fonts: [{ family: 'Missing Sans', style: 'Regular' }],
            textStyleId: 'S:legal',
          },
        },
        { id: 'text:footer-code', name: 'Build id', type: 'TEXT', text: { characters: 'v1.4.2', fonts: [{ family: 'Roboto Mono', style: 'Regular' }] } },
        { id: 'text:footer-hidden', name: 'Hidden note', type: 'TEXT', text: { characters: 'hidden', fonts: [{ family: 'Inter', style: 'Regular' }], visible: false } },
      ],
    },
  ],
};

const STYLES: TextStyleInfo[] = [
  { id: 'S:legal', name: 'Legal/Caption', font: { family: 'Missing Sans', style: 'Regular' }, remote: false, isLibrary: false },
  { id: 'S:body', name: 'Body/Default', font: { family: 'Inter', style: 'Regular' }, remote: false, isLibrary: false },
];

/**
 * Browser harness: same router, same contracts, in-memory gateway.
 * Keeps the UI honest without a Figma runtime.
 */
const listeners = new Set<(response: PluginResponse) => void>();

export function createMockTransport(): UiTransport {
  const gateway = new FakeGateway({
    tree: TREE,
    availableFonts: FIXTURE_FONTS,
    selectionIds: ['frame:hero'],
    documentName: 'Font Swap — demo file',
    pageName: 'Marketing site',
    textStyles: STYLES,
    settings: { ...DEFAULT_SETTINGS, scope: 'page' },
  });
  const router = new PluginRouter(gateway, () => undefined);

  return {
    send(request: UiRequest) {
      void router.handle(request).then((response: PluginResponse) => {
        queueMicrotask(() => {
          for (const listener of listeners) listener(response);
        });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
