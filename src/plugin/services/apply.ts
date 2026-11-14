import type { ApplyError, ApplySummary, FontKey, FontRef, ReplacementPlan, ReplacementPlanEntry } from '../../shared/contracts';
import { makeFontKey } from '../../shared/fontKey';
import { GatewayError, type FontGateway } from '../gateway/types';

export interface ApplyOptions {
  now?: () => number;
  onProgress?: (done: number, total: number) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function toApplyError(entry: ReplacementPlanEntry, error: unknown): ApplyError {
  const code = error instanceof GatewayError ? error.code : 'apply-failed';
  return { nodeId: entry.nodeId, nodeName: entry.nodeName, code, message: errorMessage(error) };
}

/**
 * Applies a plan to the document.
 *
 * Ordering is the undo guarantee: every target font is loaded before the first
 * mutation, then all node writes are issued back to back and one `commitUndo`
 * groups them into a single undo step.
 *
 * Failures never abort the run: a locked node or a failed font load is recorded
 * in `summary.errors` and the remaining nodes still change.
 */
export async function applyPlan(gateway: FontGateway, plan: ReplacementPlan, options: ApplyOptions = {}): Promise<ApplySummary> {
  const now = options.now ?? Date.now;
  const startedAt = now();

  const targets = new Map<FontKey, FontRef>();
  for (const entry of plan.entries) {
    if (entry.action !== 'replace' || !entry.to) continue;
    targets.set(makeFontKey(entry.to), entry.to);
  }

  const loadFailures = new Map<FontKey, string>();
  for (const [key, font] of targets) {
    try {
      await gateway.loadFont(font);
    } catch (error) {
      loadFailures.set(key, errorMessage(error));
    }
  }

  const errors: ApplyError[] = [];
  let changed = 0;
  let skipped = 0;
  let failed = 0;
  let done = 0;

  for (const entry of plan.entries) {
    done += 1;
    if (entry.action !== 'replace' || !entry.to) {
      skipped += 1;
      options.onProgress?.(done, plan.entries.length);
      continue;
    }

    const key = makeFontKey(entry.to);
    const loadFailure = loadFailures.get(key);
    if (loadFailure) {
      failed += 1;
      errors.push({ nodeId: entry.nodeId, nodeName: entry.nodeName, code: 'font-load-failed', message: loadFailure });
      options.onProgress?.(done, plan.entries.length);
      continue;
    }

    try {
      if (entry.wholeNode) {
        await gateway.setNodeFont(entry.nodeId, entry.to);
      } else {
        for (const range of entry.ranges) {
          await gateway.setNodeRangeFont(entry.nodeId, range.start, range.end, entry.to);
        }
      }
      changed += 1;
    } catch (error) {
      failed += 1;
      errors.push(toApplyError(entry, error));
    }
    options.onProgress?.(done, plan.entries.length);
  }

  if (changed > 0) gateway.commitUndo(`Font Swap: ${changed} node${changed === 1 ? '' : 's'}`);
  if (failed > 0) {
    gateway.notify(`Font Swap: ${changed} changed, ${failed} failed`, { error: true });
  } else if (changed > 0) {
    gateway.notify(`Font Swap: ${changed} node${changed === 1 ? '' : 's'} updated`);
  }

  return {
    total: plan.entries.length,
    changed,
    skipped,
    failed,
    durationMs: Math.max(0, now() - startedAt),
    entries: plan.entries,
    errors,
  };
}
