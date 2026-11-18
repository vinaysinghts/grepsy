import { describe, expect, it } from 'vitest';
import { compileQuery, splitMatches } from '../src/core/query';

const opts = { caseSensitive: false, regex: false };

describe('compileQuery', () => {
  it('is empty for an empty search', () => {
    expect(compileQuery({ ...opts, text: '' }).kind).toBe('empty');
  });

  it('matches plain text literally and ignores case by default', () => {
    const q = compileQuery({ ...opts, text: 'a.b(' });
    if (q.kind !== 'ok') throw new Error('expected ok');
    expect(q.test.test('X A.B( y')).toBe(true);
    expect(q.test.test('axb(')).toBe(false);
  });

  it('respects match case', () => {
    const q = compileQuery({ ...opts, caseSensitive: true, text: 'Error' });
    if (q.kind !== 'ok') throw new Error('expected ok');
    expect(q.test.test('error')).toBe(false);
  });

  it('supports regex and reports invalid patterns', () => {
    const q = compileQuery({ ...opts, regex: true, text: 'user_id=\\d+' });
    expect(q.kind === 'ok' && q.test.test('user_id=42')).toBe(true);
    expect(compileQuery({ ...opts, regex: true, text: '(' }).kind).toBe('error');
  });

  it('rejects patterns that match empty text', () => {
    expect(compileQuery({ ...opts, regex: true, text: 'a*' }).kind).toBe('error');
  });
});

describe('splitMatches', () => {
  it('splits a line into plain and matching parts', () => {
    const q = compileQuery({ ...opts, text: 'timeout' });
    if (q.kind !== 'ok') throw new Error('expected ok');
    expect(splitMatches('a Timeout b timeout', q.highlight)).toEqual([
      { text: 'a ', hit: false },
      { text: 'Timeout', hit: true },
      { text: ' b ', hit: false },
      { text: 'timeout', hit: true },
    ]);
  });

  it('returns the whole line when there is no query or match', () => {
    expect(splitMatches('abc', null)).toEqual([{ text: 'abc', hit: false }]);
    const q = compileQuery({ ...opts, text: 'zzz' });
    if (q.kind !== 'ok') throw new Error('expected ok');
    expect(splitMatches('abc', q.highlight)).toEqual([{ text: 'abc', hit: false }]);
  });

  it('is safe to call repeatedly with the same global regex', () => {
    const q = compileQuery({ ...opts, text: 'a' });
    if (q.kind !== 'ok') throw new Error('expected ok');
    expect(splitMatches('a', q.highlight)).toEqual(splitMatches('a', q.highlight));
  });
});
