import type { PluginSettings } from '../../shared/contracts';
import { DEFAULT_SETTINGS } from '../../shared/contracts';
import { readMappings, readScope } from '../../shared/messages';

export const MIN_UI_WIDTH = 360;
export const MAX_UI_WIDTH = 1400;
export const MIN_UI_HEIGHT = 320;
export const MAX_UI_HEIGHT = 1000;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

/**
 * Merges a partial settings patch into a known-good base.
 * Unknown or invalid fields are ignored, never thrown on: a corrupt stored
 * payload must not brick the plugin.
 */
export function mergeSettings(base: PluginSettings, patch: Partial<PluginSettings> | null): PluginSettings {
  const next: PluginSettings = { ...base };
  if (!patch) return next;

  const scope = readScope(patch.scope);
  if (scope) next.scope = scope;

  const mappings = readMappings(patch.mappings);
  if (mappings) next.mappings = mappings;

  if (typeof patch.uiWidth === 'number' && Number.isFinite(patch.uiWidth)) {
    next.uiWidth = clamp(patch.uiWidth, MIN_UI_WIDTH, MAX_UI_WIDTH);
  }
  if (typeof patch.uiHeight === 'number' && Number.isFinite(patch.uiHeight)) {
    next.uiHeight = clamp(patch.uiHeight, MIN_UI_HEIGHT, MAX_UI_HEIGHT);
  }
  if (typeof patch.showMixed === 'boolean') next.showMixed = patch.showMixed;

  if (patch.instancePolicy === 'skip' || patch.instancePolicy === 'overrides-only' || patch.instancePolicy === 'all') {
    next.instancePolicy = patch.instancePolicy;
  }

  return next;
}

export function defaultSettings(): PluginSettings {
  return { ...DEFAULT_SETTINGS, mappings: [] };
}
