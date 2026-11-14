import type { FontKey, FontRef } from './contracts';

const SEP = '::';

/** Collapses whitespace and lowercases so " Inter  " and "inter" compare equal. */
export function normalizeToken(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function makeFontKey(font: FontRef): FontKey {
  return `${normalizeToken(font.family)}${SEP}${normalizeToken(font.style)}`;
}

export function parseFontKey(key: FontKey): FontRef | null {
  const index = key.indexOf(SEP);
  if (index <= 0) return null;
  const family = key.slice(0, index);
  const style = key.slice(index + SEP.length);
  if (!family || !style) return null;
  return { family, style };
}

export function isSameFont(a: FontRef, b: FontRef): boolean {
  return makeFontKey(a) === makeFontKey(b);
}

export function sameFontKey(a: FontKey, b: FontKey): boolean {
  return a === b;
}

/** Display label used in tables, logs and audit files. */
export function fontLabel(font: FontRef): string {
  return `${font.family} ${font.style}`;
}

/** Deduplicates a font list by key while keeping the first spelling. */
export function uniqueFonts(fonts: FontRef[]): FontRef[] {
  const seen = new Set<FontKey>();
  const out: FontRef[] = [];
  for (const font of fonts) {
    const key = makeFontKey(font);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(font);
  }
  return out;
}

export function compareFontKeys(a: FontKey, b: FontKey): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
