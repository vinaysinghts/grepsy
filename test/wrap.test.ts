import { describe, expect, it } from 'vitest';
import { rowAtUnit, visualLines, wrapColumns, wrapStarts } from '../src/core/wrap';

describe('visualLines', () => {
  it('counts screen lines at a width', () => {
    expect(visualLines('', 10)).toBe(1);
    expect(visualLines('a'.repeat(10), 10)).toBe(1);
    expect(visualLines('a'.repeat(11), 10)).toBe(2);
    expect(visualLines('a'.repeat(30), 10)).toBe(3);
  });
  it('counts tabs to the next tab stop', () => {
    expect(visualLines('\tabcdef', 10)).toBe(1); // 4 + 6
    expect(visualLines('\tabcdefg', 10)).toBe(2);
  });
});

describe('wrapStarts and rowAtUnit', () => {
  const starts = wrapStarts(4, (r) => [1, 3, 1, 2][r]!);
  it('sums heights', () => {
    expect([...starts]).toEqual([0, 1, 4, 5, 7]);
  });
  it('finds the row on a screen line', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((u) => rowAtUnit(starts, u))).toEqual([0, 1, 1, 1, 2, 3, 3]);
    expect(rowAtUnit(wrapStarts(0, () => 1), 0)).toBe(0);
  });
});

describe('wrapColumns', () => {
  it('fits whole characters and never goes silly-narrow', () => {
    expect(wrapColumns(700, 7)).toBe(100);
    expect(wrapColumns(50, 7)).toBe(20);
  });
});
