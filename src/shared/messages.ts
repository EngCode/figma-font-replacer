import type {
  ApplySummary,
  AuditReport,
  DocumentInfo,
  FontRef,
  Mapping,
  PlanMode,
  PluginError,
  PluginSettings,
  ReplacementPlan,
  ReplacementPlanEntry,
  Result,
  ScanProgress,
  ScanScope,
  ScanSummary,
  TextStyleInfo,
} from './contracts';
import { uniqueFonts } from './fontKey';

/* ------------------------------------------------------------------ */
/* UI -> plugin requests                                              */
/* ------------------------------------------------------------------ */

export type UiRequest =
  | { type: 'ready' }
  | { type: 'scan'; scope: ScanScope }
  | { type: 'cancel' }
  | { type: 'plan'; mode: PlanMode; mappings: Mapping[]; scope: ScanScope }
  | { type: 'preview'; plan: ReplacementPlan }
  | { type: 'apply'; plan: ReplacementPlan; confirm: boolean }
  | { type: 'locate'; nodeId: string }
  | { type: 'exportAudit'; report: AuditReport; format: 'csv' | 'text' }
  | { type: 'listStyles' }
  | { type: 'getSettings' }
  | { type: 'setSettings'; settings: Partial<PluginSettings> }
  | { type: 'resize'; width: number; height: number };

/* ------------------------------------------------------------------ */
/* plugin -> UI responses                                             */
/* ------------------------------------------------------------------ */

export type PluginResponse =
  | { type: 'ready'; info: DocumentInfo; fonts: FontRef[]; styles: TextStyleInfo[]; settings: PluginSettings }
  | { type: 'scanProgress'; progress: ScanProgress }
  | { type: 'scanResult'; summary: ScanSummary }
  | { type: 'planResult'; plan: ReplacementPlan }
  | { type: 'previewResult'; plan: ReplacementPlan }
  | { type: 'applyResult'; summary: ApplySummary }
  | { type: 'exportResult'; filename: string; content: string }
  | { type: 'stylesResult'; styles: TextStyleInfo[] }
  | { type: 'settingsResult'; settings: PluginSettings }
  | { type: 'notify'; message: string; level: 'info' | 'success' | 'error' }
  | { type: 'error'; error: PluginError; requestType?: string };

/* ------------------------------------------------------------------ */
/* validation helpers                                                 */
/* ------------------------------------------------------------------ */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err(code: PluginError['code'], message: string, detail?: string): Result<never> {
  return { ok: false, error: detail === undefined ? { code, message } : { code, message, detail } };
}

export function readFont(value: unknown): FontRef | null {
  if (!isObject(value)) return null;
  const { family, style } = value;
  if (!isString(family) || !isString(style)) return null;
  if (!family.trim() || !style.trim()) return null;
  return { family, style };
}

export function readFontList(value: unknown): FontRef[] | null {
  if (!Array.isArray(value)) return null;
  const fonts: FontRef[] = [];
  for (const entry of value) {
    const font = readFont(entry);
    if (!font) return null;
    fonts.push(font);
  }
  return uniqueFonts(fonts);
}

export function readScope(value: unknown): ScanScope | null {
  return value === 'selection' || value === 'page' || value === 'file' ? value : null;
}

export function readMode(value: unknown): PlanMode | null {
  return value === 'pairwise' || value === 'consolidate' ? value : null;
}

export function readMapping(value: unknown): Mapping | null {
  if (!isObject(value)) return null;
  const { fromKey, to } = value;
  if (!isString(fromKey) || !fromKey.trim()) return null;
  const font = readFont(to);
  if (!font) return null;
  return { fromKey, to: font };
}

export function readMappings(value: unknown): Mapping[] | null {
  if (!Array.isArray(value)) return null;
  const out: Mapping[] = [];
  for (const entry of value) {
    const mapping = readMapping(entry);
    if (!mapping) return null;
    out.push(mapping);
  }
  return out;
}

function isPlanEntry(value: unknown): value is ReplacementPlanEntry {
  if (!isObject(value)) return false;
  if (!isString(value.nodeId) || !isString(value.nodeName)) return false;
  if (value.action !== 'replace' && value.action !== 'skip') return false;
  if (typeof value.wholeNode !== 'boolean') return false;
  if (value.from !== undefined && readFontList(value.from) === null) return false;
  if (value.to !== null && value.to !== undefined && readFont(value.to) === null) return false;
  if (!Array.isArray(value.ranges)) return false;
  return value.ranges.every(
    (range) => isObject(range) && isNumber(range.start) && isNumber(range.end) && range.end >= range.start,
  );
}

function isPlanTotals(value: unknown): boolean {
  return (
    isObject(value) &&
    isNumber(value.total) &&
    isNumber(value.replace) &&
    isNumber(value.skip) &&
    value.total === Number(value.replace) + Number(value.skip)
  );
}

export function isReplacementPlan(value: unknown): value is ReplacementPlan {
  if (!isObject(value)) return false;
  if (readMode(value.mode) === null) return false;
  if (readScope(value.scope) === null) return false;
  if (!Array.isArray(value.entries) || !value.entries.every(isPlanEntry)) return false;
  if (!isPlanTotals(value.totals)) return false;
  if (readMappings(value.mappings) === null) return false;
  return isNumber(value.generatedAt);
}

function isUsageGroup(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (!isString(value.key)) return false;
  if (readFont(value.font) === null) return false;
  if (!isNumber(value.count)) return false;
  return Array.isArray(value.nodeIds);
}

export function isScanSummary(value: unknown): value is ScanSummary {
  if (!isObject(value)) return false;
  if (readScope(value.scope) === null) return false;
  if (!isString(value.documentName) || !isString(value.pageName)) return false;
  if (!isNumber(value.scannedTextNodes) || !isNumber(value.mixedNodeCount)) return false;
  if (!isBoolean(value.cancelled) || !isNumber(value.durationMs)) return false;
  if (!Array.isArray(value.groups) || !value.groups.every(isUsageGroup)) return false;
  if (!Array.isArray(value.nodes)) return false;
  return readFontList(value.availableFonts) !== null && Array.isArray(value.missingFontKeys);
}

export function isApplySummary(value: unknown): value is ApplySummary {
  if (!isObject(value)) return false;
  for (const field of ['total', 'changed', 'skipped', 'failed', 'durationMs'] as const) {
    if (!isNumber(value[field])) return false;
  }
  if (!Array.isArray(value.entries) || !value.entries.every(isPlanEntry)) return false;
  return Array.isArray(value.errors);
}

export function isAuditReport(value: unknown): value is AuditReport {
  if (!isObject(value)) return false;
  if (readScope(value.scope) === null || readMode(value.mode) === null) return false;
  if (!isString(value.documentName) || !isString(value.pageName)) return false;
  if (readMappings(value.mappings) === null) return false;
  if (!isPlanTotals(value.totals)) return false;
  if (!Array.isArray(value.entries) || !value.entries.every(isPlanEntry)) return false;
  return isString(value.generatedAt);
}

function isDocumentInfo(value: unknown): value is DocumentInfo {
  return (
    isObject(value) &&
    isString(value.documentName) &&
    isString(value.pageName) &&
    isString(value.pageId) &&
    isNumber(value.selectionCount) &&
    isNumber(value.textNodeCount)
  );
}

function isTextStyleInfo(value: unknown): value is TextStyleInfo {
  return (
    isObject(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isBoolean(value.remote) &&
    isBoolean(value.isLibrary) &&
    (value.font === null || readFont(value.font) !== null)
  );
}

const isErrorCode = (value: unknown): value is PluginError['code'] => isString(value);
const isPluginError = (value: unknown): value is PluginError =>
  isObject(value) && isErrorCode(value.code) && isString(value.message);

export function isPluginSettings(value: unknown): value is PluginSettings {
  if (!isObject(value)) return false;
  if (readScope(value.scope) === null) return false;
  if (readMappings(value.mappings) === null) return false;
  if (!isNumber(value.uiWidth) || !isNumber(value.uiHeight)) return false;
  if (!isBoolean(value.showMixed)) return false;
  return value.instancePolicy === 'skip' || value.instancePolicy === 'overrides-only' || value.instancePolicy === 'all';
}

/* ------------------------------------------------------------------ */
/* parsers                                                            */
/* ------------------------------------------------------------------ */

export function parseUiRequest(input: unknown): Result<UiRequest> {
  if (!isObject(input)) return err('invalid-payload', 'Message must be an object.');
  const type = input.type;
  if (!isString(type)) return err('invalid-payload', 'Message is missing a "type" string.');

  switch (type) {
    case 'ready':
    case 'cancel':
    case 'getSettings':
    case 'listStyles':
      return ok({ type });

    case 'scan': {
      const scope = readScope(input.scope);
      return scope ? ok({ type: 'scan', scope }) : err('invalid-payload', 'scan requires a valid scope.');
    }

    case 'plan': {
      const mode = readMode(input.mode);
      const mappings = readMappings(input.mappings);
      const scope = readScope(input.scope);
      if (!mode || !mappings || !scope) return err('invalid-payload', 'plan requires mode, mappings and scope.');
      return ok({ type: 'plan', mode, mappings, scope });
    }

    case 'preview': {
      if (!isReplacementPlan(input.plan)) return err('invalid-payload', 'preview requires a valid plan.');
      return ok({ type: 'preview', plan: input.plan });
    }

    case 'apply': {
      if (!isReplacementPlan(input.plan)) return err('invalid-payload', 'apply requires a valid plan.');
      if (!isBoolean(input.confirm)) return err('invalid-payload', 'apply requires a boolean confirm flag.');
      return ok({ type: 'apply', plan: input.plan, confirm: input.confirm });
    }

    case 'locate': {
      return isString(input.nodeId) && input.nodeId
        ? ok({ type: 'locate', nodeId: input.nodeId })
        : err('invalid-payload', 'locate requires a nodeId.');
    }

    case 'exportAudit': {
      if (!isAuditReport(input.report)) return err('invalid-payload', 'exportAudit requires a valid report.');
      const format = input.format;
      if (format !== 'csv' && format !== 'text') return err('invalid-payload', 'format must be "csv" or "text".');
      return ok({ type: 'exportAudit', report: input.report, format });
    }

    case 'setSettings': {
      if (!isObject(input.settings)) return err('invalid-payload', 'setSettings requires a settings object.');
      return ok({ type: 'setSettings', settings: input.settings as Partial<PluginSettings> });
    }

    case 'resize': {
      if (!isNumber(input.width) || !isNumber(input.height)) {
        return err('invalid-payload', 'resize requires numeric width and height.');
      }
      return ok({ type: 'resize', width: input.width, height: input.height });
    }

    default:
      return err('unknown-request', `Unknown request type "${type}".`);
  }
}

export function parsePluginResponse(input: unknown): Result<PluginResponse> {
  if (!isObject(input)) return err('invalid-payload', 'Response must be an object.');
  const type = input.type;
  if (!isString(type)) return err('invalid-payload', 'Response is missing a "type" string.');

  switch (type) {
    case 'ready': {
      const fonts = readFontList(input.fonts);
      if (!isDocumentInfo(input.info) || !fonts) return err('invalid-payload', 'Malformed ready response.');
      if (!Array.isArray(input.styles) || !input.styles.every(isTextStyleInfo)) {
        return err('invalid-payload', 'ready.styles is malformed.');
      }
      if (!isPluginSettings(input.settings)) return err('invalid-payload', 'ready.settings is malformed.');
      return ok({ type: 'ready', info: input.info, fonts, styles: input.styles, settings: input.settings });
    }

    case 'scanProgress': {
      const progress = input.progress;
      if (
        !isObject(progress) ||
        !isNumber(progress.scanned) ||
        !isNumber(progress.total) ||
        !(progress.phase === 'listing' || progress.phase === 'reading' || progress.phase === 'done')
      ) {
        return err('invalid-payload', 'Malformed scanProgress.');
      }
      return ok({ type: 'scanProgress', progress: progress as unknown as ScanProgress });
    }

    case 'scanResult':
      return isScanSummary(input.summary)
        ? ok({ type: 'scanResult', summary: input.summary })
        : err('invalid-payload', 'Malformed scanResult.');

    case 'planResult':
    case 'previewResult': {
      if (!isReplacementPlan(input.plan)) return err('invalid-payload', `Malformed ${type}.`);
      return type === 'planResult'
        ? ok({ type: 'planResult', plan: input.plan })
        : ok({ type: 'previewResult', plan: input.plan });
    }

    case 'applyResult':
      return isApplySummary(input.summary)
        ? ok({ type: 'applyResult', summary: input.summary })
        : err('invalid-payload', 'Malformed applyResult.');

    case 'exportResult': {
      if (!isString(input.filename) || !isString(input.content)) {
        return err('invalid-payload', 'Malformed exportResult.');
      }
      return ok({ type: 'exportResult', filename: input.filename, content: input.content });
    }

    case 'stylesResult': {
      if (!Array.isArray(input.styles) || !input.styles.every(isTextStyleInfo)) {
        return err('invalid-payload', 'Malformed stylesResult.');
      }
      return ok({ type: 'stylesResult', styles: input.styles });
    }

    case 'settingsResult':
      return isPluginSettings(input.settings)
        ? ok({ type: 'settingsResult', settings: input.settings })
        : err('invalid-payload', 'Malformed settingsResult.');

    case 'notify': {
      if (!isString(input.message)) return err('invalid-payload', 'Malformed notify.');
      const level =
        input.level === 'success' || input.level === 'error' || input.level === 'info' ? input.level : 'info';
      return ok({ type: 'notify', message: input.message, level });
    }

    case 'error': {
      if (!isPluginError(input.error)) return err('invalid-payload', 'Malformed error.');
      return isString(input.requestType)
        ? ok({ type: 'error', error: input.error, requestType: input.requestType })
        : ok({ type: 'error', error: input.error });
    }

    default:
      return err('unknown-request', `Unknown response type "${type}".`);
  }
}

export function isUiRequestOfType<T extends UiRequest['type']>(
  request: UiRequest,
  type: T,
): request is Extract<UiRequest, { type: T }> {
  return request.type === type;
}
