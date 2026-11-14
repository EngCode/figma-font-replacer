import type { PluginSettings } from '../shared/contracts';
import type { PluginError } from '../shared/contracts';
import type { PluginResponse } from '../shared/messages';
import type { UiRequest } from '../shared/messages';
import { GatewayError, type FontGateway } from './gateway/types';
import { applyPlan } from './services/apply';
import { scanFonts } from './services/inventory';
import { defaultSettings, mergeSettings } from './services/settings';
import { buildPlan } from '../shared/planner';

export type ResponseSink = (response: PluginResponse) => void;

export function toPluginError(error: unknown): PluginError {
  if (error instanceof GatewayError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'internal', message: error.message };
  return { code: 'internal', message: 'Unexpected plugin error.' };
}

/**
 * Request router: every UI request gets exactly one `PluginResponse`.
 * Handlers never throw across the postMessage boundary.
 */
export class PluginRouter {
  private settings: PluginSettings | null = null;
  private scanToken: { cancelled: boolean } | null = null;

  constructor(
    private readonly gateway: FontGateway,
    private readonly send: ResponseSink,
  ) {}

  async handle(request: UiRequest): Promise<PluginResponse> {
    try {
      return await this.route(request);
    } catch (error) {
      return { type: 'error', error: toPluginError(error), requestType: request.type };
    }
  }

  private async route(request: UiRequest): Promise<PluginResponse> {
    switch (request.type) {
      case 'ready':
        return this.onReady();

      case 'getSettings': {
        const settings = await this.loadSettings();
        return { type: 'settingsResult', settings };
      }

      case 'setSettings': {
        const base = await this.loadSettings();
        const merged = mergeSettings(base, request.settings);
        this.settings = merged;
        await this.gateway.saveSettings(merged);
        return { type: 'settingsResult', settings: merged };
      }

      case 'resize': {
        const base = await this.loadSettings();
        const merged = mergeSettings(base, { uiWidth: request.width, uiHeight: request.height });
        this.settings = merged;
        this.gateway.resizeUi(merged.uiWidth, merged.uiHeight);
        await this.gateway.saveSettings(merged);
        return { type: 'settingsResult', settings: merged };
      }

      case 'locate': {
        await this.gateway.selectAndZoom(request.nodeId);
        return { type: 'notify', message: 'Selected node in Figma.', level: 'info' };
      }

      case 'listStyles': {
        const styles = await this.gateway.listTextStyles();
        return { type: 'stylesResult', styles };
      }

      case 'scan': {
        const token = { cancelled: false };
        this.scanToken = token;
        try {
          const summary = await scanFonts(this.gateway, {
            scope: request.scope,
            onProgress: (progress) => this.push({ type: 'scanProgress', progress }),
            shouldCancel: () => token.cancelled,
          });
          return { type: 'scanResult', summary };
        } finally {
          if (this.scanToken === token) this.scanToken = null;
        }
      }

      case 'cancel': {
        const running = this.scanToken !== null;
        if (this.scanToken) this.scanToken.cancelled = true;
        return {
          type: 'notify',
          message: running ? 'Cancelling scan…' : 'Nothing to cancel.',
          level: 'info',
        };
      }

      case 'plan': {
        const summary = await scanFonts(this.gateway, {
          scope: request.scope,
          onProgress: (progress) => this.push({ type: 'scanProgress', progress }),
        });
        const plan = buildPlan({
          mode: request.mode,
          scope: request.scope,
          nodes: summary.nodes,
          mappings: request.mappings,
          availableFonts: summary.availableFonts,
        });
        return { type: 'planResult', plan };
      }

      case 'preview':
        // Dry run: echo the plan back for the diff view. No gateway writes here.
        return { type: 'previewResult', plan: request.plan };

      case 'apply': {
        if (!request.confirm) {
          return {
            type: 'error',
            error: { code: 'apply-failed', message: 'Apply requires explicit confirmation.' },
            requestType: 'apply',
          };
        }
        const summary = await applyPlan(this.gateway, request.plan);
        return { type: 'applyResult', summary };
      }

      case 'exportAudit':
          return {
            type: 'error',
            error: {
              code: 'not-implemented',
              message: '"exportAudit" is not implemented yet.',
              detail: 'Scheduled in P5; see docs/PLAN.md.',
            },
            requestType: request.type,
          };

      default: {
        const exhaustive: never = request;
        return {
          type: 'error',
          error: { code: 'unknown-request', message: `Unhandled request ${JSON.stringify(exhaustive)}` },
        };
      }
    }
  }

  private async onReady(): Promise<PluginResponse> {
    const [info, fonts, styles, settings] = await Promise.all([
      this.gateway.getDocumentInfo(),
      this.gateway.listAvailableFonts(),
      this.gateway.listTextStyles(),
      this.loadSettings(),
    ]);
    this.gateway.resizeUi(settings.uiWidth, settings.uiHeight);
    return { type: 'ready', info, fonts, styles, settings };
  }

  private async loadSettings(): Promise<PluginSettings> {
    if (!this.settings) {
      const stored = await this.gateway.getSettings();
      this.settings = mergeSettings(defaultSettings(), stored);
    }
    return this.settings;
  }

  /** Exposed for services that need to push progress messages mid-request. */
  push(response: PluginResponse): void {
    this.send(response);
  }
}
