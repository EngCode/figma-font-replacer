/**
 * Domain contracts shared by the plugin (Figma sandbox) and the UI.
 *
 * Rules:
 * - This module is pure TypeScript: no `figma.*` calls, no DOM access.
 * - Everything crossing `postMessage` must be structured-clone friendly
 *   (no Error instances, no functions, no class instances).
 */

/** A concrete font, as Figma identifies it. */
export interface FontRef {
  family: string;
  style: string;
}

/** Normalised key for a font: `family::style` (see fontKey.ts). */
export type FontKey = string;

export type ScanScope = 'selection' | 'page' | 'file';

export type PlanMode = 'pairwise' | 'consolidate';

export type ReplacementAction = 'replace' | 'skip';

export type SkipReason =
  | 'mixed-fonts'
  | 'no-mapping'
  | 'missing-target-font'
  | 'already-target'
  | 'excluded'
  | 'instance-main'
  | 'empty-text'
  | 'not-text'
  | 'missing-source-font';

/** Per-node read model produced by the gateway, before aggregation. */
export interface TextNodeSnapshot {
  nodeId: string;
  name: string;
  pageName: string;
  characterCount: number;
  /** Every distinct font used by the node; more than one means "mixed". */
  fonts: FontRef[];
  isMixed: boolean;
  /** True when at least one font used by the node is not available to the plugin. */
  hasMissingFont: boolean;
  textStyleId: string | null;
  /** Text override living inside a component instance. */
  isInstanceText: boolean;
  isHidden: boolean;
  isLocked: boolean;
  /** First characters of the node, trimmed for table previews. */
  sample: string;
}

/** Aggregated usage of one font across the scanned scope. */
export interface FontUsageGroup {
  key: FontKey;
  font: FontRef;
  /** Number of text nodes using this font (a mixed node counts once per font). */
  count: number;
  nodeIds: string[];
  mixedNodeIds: string[];
  styleLinkedNodeIds: string[];
  instanceNodeIds: string[];
  missing: boolean;
}

export interface DocumentInfo {
  documentName: string;
  pageName: string;
  pageId: string;
  selectionCount: number;
  textNodeCount: number;
}

export interface TextStyleInfo {
  id: string;
  name: string;
  font: FontRef | null;
  remote: boolean;
  isLibrary: boolean;
}

export interface ScanSummary {
  scope: ScanScope;
  documentName: string;
  pageName: string;
  selectionCount: number;
  scannedTextNodes: number;
  /** Nodes and fonts seen during the scan. */
  availableFonts: FontRef[];
  groups: FontUsageGroup[];
  nodes: TextNodeSnapshot[];
  missingFontKeys: FontKey[];
  mixedNodeCount: number;
  cancelled: boolean;
  durationMs: number;
}

export interface ScanProgress {
  scanned: number;
  total: number;
  phase: 'listing' | 'reading' | 'done';
}

/** One user-authored source -> target rule. */
export interface Mapping {
  fromKey: FontKey;
  to: FontRef;
}

/** Character range to rewrite, in code-unit offsets. */
export interface RangePlan {
  start: number;
  end: number;
}

export interface ReplacementPlanEntry {
  nodeId: string;
  nodeName: string;
  from: FontRef[];
  to: FontRef | null;
  action: ReplacementAction;
  reason?: SkipReason;
  /** Whole-node replace (set `fontName`) vs. per-range rewrite (P6+). */
  wholeNode: boolean;
  ranges: RangePlan[];
}

export interface ReplacementPlanTotals {
  total: number;
  replace: number;
  skip: number;
}

export interface ReplacementPlan {
  mode: PlanMode;
  scope: ScanScope;
  entries: ReplacementPlanEntry[];
  totals: ReplacementPlanTotals;
  /** Normalised mappings actually used by the plan. */
  mappings: Mapping[];
  /** Epoch ms, informational only; excluded from audit output for determinism. */
  generatedAt: number;
}

export type InstancePolicy = 'skip' | 'overrides-only' | 'all';

export type PluginErrorCode =
  | 'unknown-request'
  | 'invalid-payload'
  | 'scan-failed'
  | 'plan-failed'
  | 'apply-failed'
  | 'font-not-found'
  | 'font-load-failed'
  | 'node-locked'
  | 'node-deleted'
  | 'instance-text'
  | 'not-implemented'
  | 'cancelled'
  | 'invalid-settings'
  | 'internal';

export interface PluginError {
  code: PluginErrorCode;
  message: string;
  /** Optional human-oriented detail; never a stack trace. */
  detail?: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: PluginError };

export interface ApplyError {
  nodeId?: string;
  nodeName?: string;
  code: PluginErrorCode;
  message: string;
}

export interface ApplySummary {
  total: number;
  changed: number;
  skipped: number;
  failed: number;
  durationMs: number;
  entries: ReplacementPlanEntry[];
  errors: ApplyError[];
}

export interface AuditReport {
  scope: ScanScope;
  documentName: string;
  pageName: string;
  mode: PlanMode;
  mappings: Mapping[];
  totals: ReplacementPlanTotals;
  entries: ReplacementPlanEntry[];
  missingFontKeys: FontKey[];
  mixedNodeCount: number;
  generatedAt: string;
}

export interface PluginSettings {
  scope: ScanScope;
  mappings: Mapping[];
  uiWidth: number;
  uiHeight: number;
  showMixed: boolean;
  instancePolicy: InstancePolicy;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  scope: 'selection',
  mappings: [],
  uiWidth: 720,
  uiHeight: 560,
  showMixed: true,
  instancePolicy: 'skip',
};

export const SETTINGS_KEY = 'fontSwap.settings.v1';
