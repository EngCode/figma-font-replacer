import type {
  FontKey,
  ScanProgress,
  ScanScope,
  ScanSummary,
  TextNodeSnapshot,
} from '../../shared/contracts';
import { aggregateUsage, countMixedNodes, findMissingFonts } from '../../shared/aggregate';
import { makeFontKey } from '../../shared/fontKey';
import type { FontGateway, TextNodeRead } from '../gateway/types';

export const DEFAULT_CHUNK_SIZE = 200;
const SAMPLE_LENGTH = 80;

export interface ScanOptions {
  scope: ScanScope;
  chunkSize?: number;
  onProgress?: (progress: ScanProgress) => void;
  shouldCancel?: () => boolean;
  /** Injected for deterministic tests. */
  now?: () => number;
}

export function toSnapshot(
  node: TextNodeRead,
  pageName: string,
  availableKeys: ReadonlySet<FontKey>,
): TextNodeSnapshot {
  const fonts = node.fonts;
  const hasMissingFont = fonts.some((font) => !availableKeys.has(makeFontKey(font)));
  const characters = node.characters.replace(/\s+/g, ' ').trim();
  return {
    nodeId: node.id,
    name: node.name,
    pageName,
    characterCount: node.characters.length,
    fonts,
    isMixed: fonts.length > 1,
    hasMissingFont,
    textStyleId: node.textStyleId,
    isInstanceText: node.isInstanceText,
    isHidden: !node.visible,
    isLocked: node.locked,
    sample: characters.slice(0, SAMPLE_LENGTH),
  };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Scans the requested scope and returns per-node snapshots plus per-font groups.
 * Work is chunked so the Figma sandbox stays responsive on large files, and the
 * caller can cancel mid-run (partial results come back with `cancelled: true`).
 */
export async function scanFonts(gateway: FontGateway, options: ScanOptions): Promise<ScanSummary> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK_SIZE);

  options.onProgress?.({ scanned: 0, total: 0, phase: 'listing' });

  const [info, availableFonts] = await Promise.all([gateway.getDocumentInfo(), gateway.listAvailableFonts()]);
  const availableKeys = new Set(availableFonts.map(makeFontKey));
  const refs = await gateway.listTextNodeIds(options.scope);
  const total = refs.length;

  options.onProgress?.({ scanned: 0, total, phase: 'reading' });

  const nodes: TextNodeSnapshot[] = [];
  let cancelled = false;
  let scanned = 0;

  for (let offset = 0; offset < refs.length; offset += chunkSize) {
    if (options.shouldCancel?.()) {
      cancelled = true;
      break;
    }

    const chunk = refs.slice(offset, offset + chunkSize);
    for (const ref of chunk) {
      const read = await gateway.readNode(ref.id);
      if (!read) continue;
      nodes.push(toSnapshot(read, info.pageName, availableKeys));
    }
    scanned += chunk.length;
    options.onProgress?.({ scanned, total, phase: 'reading' });

    if (offset + chunkSize < refs.length) await yieldToEventLoop();
  }

  const missingFontKeys = findMissingFonts(nodes, availableKeys);
  const summary: ScanSummary = {
    scope: options.scope,
    documentName: info.documentName,
    pageName: info.pageName,
    selectionCount: info.selectionCount,
    scannedTextNodes: scanned,
    availableFonts,
    groups: aggregateUsage(nodes, new Set(missingFontKeys)),
    nodes,
    missingFontKeys,
    mixedNodeCount: countMixedNodes(nodes),
    cancelled,
    durationMs: Math.max(0, now() - startedAt),
  };

  options.onProgress?.({ scanned, total, phase: 'done' });
  return summary;
}
