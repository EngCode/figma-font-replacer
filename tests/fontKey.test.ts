import { describe, expect, it } from 'vitest';
import {
  compareFontKeys,
  fontLabel,
  isSameFont,
  makeFontKey,
  normalizeToken,
  parseFontKey,
  uniqueFonts,
} from '../src/shared/fontKey';

const inter = { family: 'Inter', style: 'Regular' };

describe('font keys', () => {
  it('normalises case and whitespace', () => {
    expect(normalizeToken('  Source   Serif  Pro ')).toBe('source serif pro');
    expect(makeFontKey({ family: '  Inter ', style: 'REGULAR' })).toBe(makeFontKey(inter));
  });

  it('round-trips a key', () => {
    expect(parseFontKey(makeFontKey(inter))).toEqual({ family: 'inter', style: 'regular' });
  });

  it('keeps multi-word styles together', () => {
    const key = makeFontKey({ family: 'Inter', style: 'Semi Bold Italic' });
    expect(parseFontKey(key)).toEqual({ family: 'inter', style: 'semi bold italic' });
  });

  it('rejects malformed keys', () => {
    expect(parseFontKey('')).toBeNull();
    expect(parseFontKey('inter')).toBeNull();
    expect(parseFontKey('::regular')).toBeNull();
    expect(parseFontKey('inter::')).toBeNull();
  });

  it('compares fonts by normalised key', () => {
    expect(isSameFont(inter, { family: 'inter', style: ' regular ' })).toBe(true);
    expect(isSameFont(inter, { family: 'Inter', style: 'Bold' })).toBe(false);
  });

  it('dedupes while preserving the first spelling', () => {
    const fonts = uniqueFonts([inter, { family: 'INTER', style: 'regular' }, { family: 'Inter', style: 'Bold' }]);
    expect(fonts).toHaveLength(2);
    expect(fonts.at(0)).toEqual(inter);
  });

  it('formats labels and sorts keys', () => {
    expect(fontLabel(inter)).toBe('Inter Regular');
    expect(compareFontKeys('a::b', 'a::c')).toBe(-1);
    expect(compareFontKeys('b::a', 'a::z')).toBe(1);
    expect(compareFontKeys('a::b', 'a::b')).toBe(0);
  });
});
