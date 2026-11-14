import type { FontKey, FontRef, FontUsageGroup, TextNodeSnapshot } from './contracts';
import { compareFontKeys, makeFontKey } from './fontKey';

export function fontKeys(fonts: FontRef[]): FontKey[] {
  return fonts.map(makeFontKey);
}

/** Fonts referenced by the given nodes that are not available to the plugin. */
export function findMissingFonts(nodes: TextNodeSnapshot[], availableKeys: ReadonlySet<FontKey>): FontKey[] {
  const missing = new Set<FontKey>();
  for (const node of nodes) {
    for (const font of node.fonts) {
      const key = makeFontKey(font);
      if (!availableKeys.has(key)) missing.add(key);
    }
  }
  return [...missing].sort(compareFontKeys);
}

/**
 * Aggregates per-node font usage into per-font groups.
 * Pure and O(total font references); input order does not affect output.
 */
export function aggregateUsage(nodes: TextNodeSnapshot[], missingKeys: ReadonlySet<FontKey> = new Set()): FontUsageGroup[] {
  const groups = new Map<FontKey, FontUsageGroup>();

  for (const node of nodes) {
    const seen = new Set<FontKey>();
    for (const font of node.fonts) {
      const key = makeFontKey(font);
      if (seen.has(key)) continue;
      seen.add(key);

      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          font,
          count: 0,
          nodeIds: [],
          mixedNodeIds: [],
          styleLinkedNodeIds: [],
          instanceNodeIds: [],
          missing: missingKeys.has(key),
        };
        groups.set(key, group);
      }

      group.count += 1;
      group.nodeIds.push(node.nodeId);
      if (node.isMixed) group.mixedNodeIds.push(node.nodeId);
      if (node.textStyleId !== null) group.styleLinkedNodeIds.push(node.nodeId);
      if (node.isInstanceText) group.instanceNodeIds.push(node.nodeId);
    }
  }

  return [...groups.values()].sort((a, b) => b.count - a.count || compareFontKeys(a.key, b.key));
}

export function countMixedNodes(nodes: TextNodeSnapshot[]): number {
  return nodes.filter((node) => node.isMixed).length;
}

export function totalFontReferences(nodes: TextNodeSnapshot[]): number {
  return nodes.reduce((total, node) => total + node.fonts.length, 0);
}
