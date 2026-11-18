import { describe, expect, it } from 'vitest';
import { LEVEL_CODES, LineStore } from '../src/core/lineStore';

describe('LineStore', () => {
  it('stores lines and their levels', () => {
    const s = new LineStore();
    s.append(['09:00 INFO a', '09:01 ERROR b']);
    expect(s.length).toBe(2);
    expect(s.text(1)).toBe('09:01 ERROR b');
    expect(s.level(0)).toBe(LEVEL_CODES.INFO);
    expect(s.level(1)).toBe(LEVEL_CODES.ERROR);
  });

  it('gives continuation lines the level of the line above', () => {
    const s = new LineStore();
    s.append(['09:00 ERROR boom', '    at f (a.js:1)', '    at g (b.js:2)', '09:01 INFO ok']);
    expect([0, 1, 2, 3].map((i) => s.level(i))).toEqual([1, 1, 1, 3]);
    expect(s.counts[LEVEL_CODES.ERROR]).toBe(3);
  });

  it('marks leading lines with no level as code 0', () => {
    const s = new LineStore();
    s.append(['plain text', '09:00 WARN w']);
    expect(s.level(0)).toBe(0);
    expect(s.counts[0]).toBe(1);
  });

  it('handles more lines than one block and grows its level array', () => {
    const s = new LineStore();
    const lines = Array.from({ length: 10_000 }, (_, i) => `${i} INFO line`);
    s.append(lines.slice(0, 3000));
    s.append(lines.slice(3000));
    expect(s.length).toBe(10_000);
    expect(s.text(4096)).toBe('4096 INFO line');
    expect(s.text(9999)).toBe('9999 INFO line');
    expect(s.level(9999)).toBe(LEVEL_CODES.INFO);
  });
});
