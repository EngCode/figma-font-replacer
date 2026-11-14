import type { FontRef, ReplacementPlan, ReplacementPlanEntry } from '../src/shared/contracts';
import { makeFontKey } from '../src/shared/fontKey';

export const INTER_REGULAR: FontRef = { family: 'Inter', style: 'Regular' };
export const INTER_BOLD: FontRef = { family: 'Inter', style: 'Bold' };
export const POPPINS_BOLD: FontRef = { family: 'Poppins', style: 'Bold' };
export const MISSING_SANS: FontRef = { family: 'Missing Sans', style: 'Regular' };

export const AVAILABLE_FONTS: FontRef[] = [INTER_REGULAR, INTER_BOLD, POPPINS_BOLD];

export function planEntry(overrides: Partial<ReplacementPlanEntry> = {}): ReplacementPlanEntry {
  return {
    nodeId: 'n1',
    nodeName: 'Node',
    from: [INTER_REGULAR],
    to: POPPINS_BOLD,
    action: 'replace',
    wholeNode: true,
    ranges: [{ start: 0, end: 5 }],
    ...overrides,
  };
}

export function testPlan(entries: ReplacementPlanEntry[] = [planEntry()]): ReplacementPlan {
  const replace = entries.filter((entry) => entry.action === 'replace').length;
  return {
    mode: 'pairwise',
    scope: 'selection',
    entries,
    totals: { total: entries.length, replace, skip: entries.length - replace },
    mappings: [{ fromKey: makeFontKey(INTER_REGULAR), to: POPPINS_BOLD }],
    generatedAt: 1_700_000_000_000,
  };
}
