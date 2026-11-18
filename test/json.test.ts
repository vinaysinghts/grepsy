import { describe, expect, it } from 'vitest';
import { extractJson, mayContainJson } from '../src/core/json';

describe('extractJson', () => {
  it('finds a JSON object after the message', () => {
    const line = '09:14:11 ERROR [payments] failed {"order":"A-1182","code":504}';
    const r = extractJson(line);
    expect(r?.value).toEqual({ order: 'A-1182', code: 504 });
    expect(line.slice(r!.start, r!.end)).toBe('{"order":"A-1182","code":504}');
  });

  it('skips bracketed tags that are not JSON', () => {
    expect(extractJson('[gateway] [2026-11-16] payload={"a":[1,2]}')?.value).toEqual({ a: [1, 2] });
  });

  it('handles brackets and escaped quotes inside strings', () => {
    expect(extractJson('msg {"text":"a } b \\" ]","n":1}')?.value).toEqual({ text: 'a } b " ]', n: 1 });
  });

  it('reads arrays and whole-line JSON logs', () => {
    expect(extractJson('[{"id":1},{"id":2}]')?.value).toEqual([{ id: 1 }, { id: 2 }]);
    expect(extractJson('{"level":"info","msg":"ok"}')?.value).toEqual({ level: 'info', msg: 'ok' });
  });

  it('returns null when there is no usable JSON', () => {
    expect(extractJson('09:00 INFO plain text')).toBeNull();
    expect(extractJson('broken {"a": 1')).toBeNull();
    expect(extractJson('empty {} and []')).toBeNull();
  });
});

describe('mayContainJson', () => {
  it('flags likely JSON cheaply', () => {
    expect(mayContainJson('x {"a":1}')).toBe(true);
    expect(mayContainJson('[gateway] plain')).toBe(false);
  });
});
