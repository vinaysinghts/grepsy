import { describe, expect, it } from 'vitest';
import { splitTagged, type Pattern } from '../src/core/highlights';

const p = (source: string, tag: number): Pattern => ({ re: new RegExp(source, 'gi'), tag });

describe('splitTagged', () => {
  it('returns the plain line when nothing matches', () => {
    expect(splitTagged('abc', [p('z', 0)])).toEqual([{ text: 'abc', tag: null }]);
    expect(splitTagged('abc', [])).toEqual([{ text: 'abc', tag: null }]);
  });

  it('tags matches from several patterns in line order', () => {
    expect(splitTagged('user_id=42 retry timeout', [p('timeout', -1), p('user_id=42', 0), p('retry', 1)])).toEqual([
      { text: 'user_id=42', tag: 0 },
      { text: ' ', tag: null },
      { text: 'retry', tag: 1 },
      { text: ' ', tag: null },
      { text: 'timeout', tag: -1 },
    ]);
  });

  it('lets the first pattern win when two start at the same place', () => {
    expect(splitTagged('timeout', [p('time', -1), p('timeout', 0)])).toEqual([
      { text: 'time', tag: -1 },
      { text: 'out', tag: null },
    ]);
  });

  it('does not double-tag overlapping matches', () => {
    expect(splitTagged('abcd', [p('abc', 0), p('bcd', 1)])).toEqual([
      { text: 'abc', tag: 0 },
      { text: 'd', tag: null },
    ]);
  });

  it('ignores empty matches', () => {
    expect(splitTagged('ab', [p('x*', 0)])).toEqual([{ text: 'ab', tag: null }]);
  });

  it('gives the same result when called twice with the same regexes', () => {
    const pats = [p('a', 0)];
    expect(splitTagged('banana', pats)).toEqual(splitTagged('banana', pats));
  });
});
