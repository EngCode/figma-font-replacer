import type {
  FontKey,
  InstancePolicy,
  Mapping,
  PlanMode,
  ReplacementPlan,
  ReplacementPlanEntry,
  ScanScope,
  SkipReason,
  TextNodeSnapshot,
} from './contracts';
import { makeFontKey } from './fontKey';
import type { FontRef } from './contracts';

export interface PlanInput {
  mode: PlanMode;
  scope: ScanScope;
  nodes: TextNodeSnapshot[];
  mappings: Mapping[];
  availableFonts: FontRef[];
  /** Nodes the user explicitly excluded in the UI. */
  excludedNodeIds?: string[];
  instancePolicy?: InstancePolicy;
  now?: () => number;
}

function normalizeMappings(mappings: Mapping[]): Mapping[] {
  const bySource = new Map<FontKey, Mapping>();
  for (const mapping of mappings) {
    if (!bySource.has(mapping.fromKey)) bySource.set(mapping.fromKey, mapping);
  }
  return [...bySource.values()].sort((a, b) => (a.fromKey < b.fromKey ? -1 : a.fromKey > b.fromKey ? 1 : 0));
}

/**
 * Builds a deterministic replacement plan. Pure: no gateway, no Figma, no time.
 * Mixed-font nodes are skipped until phase P6 provides per-range plans.
 */
export function buildPlan(input: PlanInput): ReplacementPlan {
  const mappings = normalizeMappings(input.mappings);
  const targetBySource = new Map<FontKey, FontRef>();
  for (const mapping of mappings) targetBySource.set(mapping.fromKey, mapping.to);

  const availableKeys = new Set(input.availableFonts.map(makeFontKey));
  const excluded = new Set(input.excludedNodeIds ?? []);
  const instancePolicy: InstancePolicy = input.instancePolicy ?? 'skip';

  const sortedNodes = [...input.nodes].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  const entries: ReplacementPlanEntry[] = [];

  for (const node of sortedNodes) {
    const skip = (
      reason: SkipReason,
      to: FontRef | null = null,
    ): ReplacementPlanEntry => ({
      nodeId: node.nodeId,
      nodeName: node.name,
      from: node.fonts,
      to,
      action: 'skip',
      reason,
      wholeNode: false,
      ranges: [],
    });

    if (excluded.has(node.nodeId)) {
      entries.push(skip('excluded'));
      continue;
    }
    if (node.characterCount <= 0) {
      entries.push(skip('empty-text'));
      continue;
    }
    if (node.isMixed) {
      entries.push(skip('mixed-fonts'));
      continue;
    }
    if (node.isInstanceText && instancePolicy === 'skip') {
      entries.push(skip('instance-main'));
      continue;
    }

    const source = node.fonts[0];
    if (!source) {
      entries.push(skip('not-text'));
      continue;
    }

    const sourceKey = makeFontKey(source);
    const target = targetBySource.get(sourceKey);
    if (!target) {
      entries.push(skip('no-mapping'));
      continue;
    }

    const targetKey = makeFontKey(target);
    if (targetKey === sourceKey) {
      entries.push(skip('already-target', target));
      continue;
    }
    if (!availableKeys.has(targetKey)) {
      entries.push(skip('missing-target-font', target));
      continue;
    }

    entries.push({
      nodeId: node.nodeId,
      nodeName: node.name,
      from: [source],
      to: target,
      action: 'replace',
      wholeNode: true,
      ranges: [{ start: 0, end: node.characterCount }],
    });
  }

  const replace = entries.filter((entry) => entry.action === 'replace').length;
  return {
    mode: input.mode,
    scope: input.scope,
    entries,
    totals: { total: entries.length, replace, skip: entries.length - replace },
    mappings,
    generatedAt: (input.now ?? Date.now)(),
  };
}

/** Human-readable explanation for a skipped entry, used by the preview table. */
export function describeSkipReason(reason: SkipReason | undefined): string {
  switch (reason) {
    case 'mixed-fonts':
      return 'Mixed fonts — segment rewrite arrives in P6';
    case 'no-mapping':
      return 'No target font chosen';
    case 'missing-target-font':
      return 'Target font is not available';
    case 'already-target':
      return 'Already the target font';
    case 'excluded':
      return 'Excluded by you';
    case 'instance-main':
      return 'Inside a component instance';
    case 'empty-text':
      return 'Empty text node';
    case 'not-text':
      return 'No font on this node';
    case 'missing-source-font':
      return 'Source font is unavailable';
    default:
      return 'Skipped';
  }
}

/** Convenience for the UI: every mapping collapsed to one target font. */
export function consolidateMappings(sourceKeys: FontKey[], target: FontRef): Mapping[] {
  return sourceKeys.map((fromKey) => ({ fromKey, to: target }));
}

export function planEntriesByAction(plan: ReplacementPlan): {
  replace: ReplacementPlanEntry[];
  skip: ReplacementPlanEntry[];
} {
  return {
    replace: plan.entries.filter((entry) => entry.action === 'replace'),
    skip: plan.entries.filter((entry) => entry.action === 'skip'),
  };
}
