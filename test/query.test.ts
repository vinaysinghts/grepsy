import { describe, expect, it } from 'vitest';
import { compileQuery } from '../src/core/query';

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

  it('keeps spaces in a plain search, so a leading space means "starts a word"', () => {
    const q = compileQuery({ ...opts, text: ' steps' });
    if (q.kind !== 'ok') throw new Error('expected ok');
    expect(q.test.test('Test Steps:')).toBe(true);
    expect(q.test.test('diagnosticSteps = []')).toBe(false);
    expect(q.highlight.exec('Test Steps:')?.[0]).toBe(' Steps');
    expect(compileQuery({ ...opts, text: '   ' }).kind).toBe('empty');
  });

  it('keeps whitespace in a regex search', () => {
    const q = compileQuery({ ...opts, regex: true, text: ' steps' });
    if (q.kind !== 'ok') throw new Error('expected ok');
    expect(q.test.test('xsteps')).toBe(false);
    expect(q.test.test('a steps')).toBe(true);
  });

  it('rejects patterns that match empty text', () => {
    expect(compileQuery({ ...opts, regex: true, text: 'a*' }).kind).toBe('error');
  });
});
