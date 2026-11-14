import type { PluginResponse } from '../shared/messages';
import { parsePluginResponse } from '../shared/messages';
import type { UiRequest } from '../shared/messages';

export interface UiTransport {
  send(request: UiRequest): void;
  subscribe(listener: (response: PluginResponse) => void): () => void;
}

interface PluginMessageEvent {
  data?: { pluginMessage?: unknown };
}

/** BigInt and functions cannot cross postMessage; requests are plain data by contract. */
export function createFigmaTransport(): UiTransport {
  return {
    send(request) {
      parent.postMessage({ pluginMessage: request }, '*');
    },
    subscribe(listener) {
      const handler = (event: MessageEvent): void => {
        const payload = (event as unknown as PluginMessageEvent).data?.pluginMessage;
        if (payload === undefined) return;
        const parsed = parsePluginResponse(payload);
        if (parsed.ok) {
          listener(parsed.data);
        } else {
          listener({ type: 'error', error: parsed.error });
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    },
  };
}

export function isInsideFigma(): boolean {
  return typeof window !== 'undefined' && window.parent !== window;
}
