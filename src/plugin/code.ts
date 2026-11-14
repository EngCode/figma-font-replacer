import { DEFAULT_SETTINGS } from '../shared/contracts';
import type { PluginResponse } from '../shared/messages';
import { parseUiRequest } from '../shared/messages';
import { FigmaGateway } from './gateway/figmaGateway';
import { PluginRouter } from './router';
import type { UiRequest } from '../shared/messages';

const gateway = new FigmaGateway();

const post = (response: PluginResponse): void => {
  figma.ui.postMessage(response);
};

const router = new PluginRouter(gateway, post);

figma.showUI(__html__, {
  width: DEFAULT_SETTINGS.uiWidth,
  height: DEFAULT_SETTINGS.uiHeight,
  themeColors: true,
  title: 'Font Swap',
});

const dispatch = (request: UiRequest): void => {
  void router.handle(request).then(post);
};

figma.ui.onmessage = (raw: unknown): void => {
  const parsed = parseUiRequest(raw);
  if (!parsed.ok) {
    post({ type: 'error', error: parsed.error });
    return;
  }
  dispatch(parsed.data);
};
